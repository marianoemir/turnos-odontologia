"""Tests de login y rate limit (C-24, Grupo 4)."""

import uuid

import pytest
from starlette.testclient import TestClient

from backend.app.auth.models import Usuario
from backend.app.auth.password import hashear_password
from backend.app.auth.router import get_db
from backend.app.main import app
from backend.app.rbac.models import Rol, Sucursal, UsuarioSucursal


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(get_db, None)


@pytest.mark.integration
def test_login_exitoso_una_sucursal(client, db_session):
    """Scenario: Login exitoso con credenciales válidas."""
    rol = db_session.query(Rol).filter_by(nombre="recepcion").first()
    if not rol:
        rol = Rol(nombre="recepcion")
        db_session.add(rol)
        db_session.flush()

    sucursal = Sucursal(nombre="Sucursal Centro")
    db_session.add(sucursal)
    db_session.flush()

    pwd = "password-seguro-123"
    u = Usuario(
        dni="11111111",
        password_hash=hashear_password(pwd),
        rol_id=rol.id,
        activo=True,
    )
    db_session.add(u)
    db_session.flush()

    asoc = UsuarioSucursal(
        usuario=u.dni,
        rol_id=rol.id,
        sucursal_id=sucursal.id,
        activo=True,
    )
    db_session.add(asoc)
    db_session.commit()

    res = client.post("/login", json={"dni": "11111111", "password": pwd})
    assert res.status_code == 200
    data = res.json()
    assert "token" in data
    assert data["rol"] == "recepcion"
    assert data["usuario"] == "11111111"
    assert data["sucursal_id"] == str(sucursal.id)


@pytest.mark.integration
def test_login_credenciales_invalidas(client, db_session):
    """Scenario: Credenciales inválidas responden 401 sin distinguir la causa."""
    rol = db_session.query(Rol).filter_by(nombre="recepcion").first()
    if not rol:
        rol = Rol(nombre="recepcion")
        db_session.add(rol)
        db_session.flush()

    pwd = "password-seguro-123"
    u = Usuario(
        dni="22222222",
        password_hash=hashear_password(pwd),
        rol_id=rol.id,
        activo=True,
    )
    db_session.add(u)
    db_session.commit()

    # Password incorrecta
    r1 = client.post("/login", json={"dni": "22222222", "password": "password-erronea"})
    assert r1.status_code == 401
    d1 = r1.json()["detail"]
    assert d1["causa"] == "credenciales_invalidas"
    assert "token" not in r1.json()

    # DNI inexistente
    r2 = client.post("/login", json={"dni": "99999999", "password": pwd})
    assert r2.status_code == 401
    d2 = r2.json()["detail"]
    assert d2["causa"] == "credenciales_invalidas"
    assert d1["detalle"] == d2["detalle"]
    assert "token" not in r2.json()


@pytest.mark.integration
def test_login_dni_inexistente_ejecuta_hash_relleno(client, db_session, monkeypatch):
    """Scenario: Credenciales inválidas verifican hash con sal de relleno para DNI inexistente."""
    from backend.app.auth import router as auth_router

    llamadas_verificar = []
    real_verificar = auth_router.verificar_password

    def fake_verificar(password, hash_almacenado):
        llamadas_verificar.append((password, hash_almacenado))
        return real_verificar(password, hash_almacenado)

    monkeypatch.setattr(auth_router, "verificar_password", fake_verificar)

    res = client.post("/login", json={"dni": "99999999", "password": "pass"})
    assert res.status_code == 401
    assert len(llamadas_verificar) == 1
    assert llamadas_verificar[0][1] == auth_router.HASH_RELLENO


@pytest.mark.integration
def test_login_cuenta_inactiva(client, db_session):
    """Scenario: Cuenta inactiva con credenciales correctas responde 403."""
    rol = db_session.query(Rol).filter_by(nombre="recepcion").first()
    if not rol:
        rol = Rol(nombre="recepcion")
        db_session.add(rol)
        db_session.flush()

    pwd = "password-seguro-123"
    u = Usuario(
        dni="33333333",
        password_hash=hashear_password(pwd),
        rol_id=rol.id,
        activo=False,
    )
    db_session.add(u)
    db_session.commit()

    res = client.post("/login", json={"dni": "33333333", "password": pwd})
    assert res.status_code == 403
    assert res.json()["detail"]["causa"] == "cuenta_inactiva"


def test_login_body_invalido(client):
    """Scenarios: Body sin password, dni vacío, no JSON, excedido responde 422."""
    # Sin password
    r1 = client.post("/login", json={"dni": "12345678"})
    assert r1.status_code == 422

    # DNI vacío
    r2 = client.post("/login", json={"dni": "", "password": "pass"})
    assert r2.status_code == 422

    # No JSON
    r3 = client.post(
        "/login", content="no-json", headers={"Content-Type": "application/json"}
    )
    assert r3.status_code == 422

    # DNI > 32
    r4 = client.post("/login", json={"dni": "a" * 33, "password": "pass"})
    assert r4.status_code == 422

    # Password > 128
    r5 = client.post("/login", json={"dni": "12345678", "password": "p" * 129})
    assert r5.status_code == 422


@pytest.mark.integration
def test_login_usuario_sin_sucursales(client, db_session):
    """Scenario: Usuario sin sucursales asociadas recibe token sin sucursal_id."""
    rol = db_session.query(Rol).filter_by(nombre="admin").first()
    if not rol:
        rol = Rol(nombre="admin")
        db_session.add(rol)
        db_session.flush()

    pwd = "password-seguro-123"
    u = Usuario(
        dni="44444444",
        password_hash=hashear_password(pwd),
        rol_id=rol.id,
        activo=True,
    )
    db_session.add(u)
    db_session.commit()

    res = client.post("/login", json={"dni": "44444444", "password": pwd})
    assert res.status_code == 200
    data = res.json()
    assert data["rol"] == "admin"
    assert data["sucursal_id"] is None


@pytest.mark.integration
def test_login_varias_sucursales(client, db_session):
    """Scenario: Usuario con varias sucursales debe indicar una."""
    rol = db_session.query(Rol).filter_by(nombre="recepcion").first()
    if not rol:
        rol = Rol(nombre="recepcion")
        db_session.add(rol)
        db_session.flush()

    s1 = Sucursal(nombre="Sucursal 1")
    s2 = Sucursal(nombre="Sucursal 2")
    db_session.add_all([s1, s2])
    db_session.flush()

    pwd = "password-seguro-123"
    u = Usuario(
        dni="55555555",
        password_hash=hashear_password(pwd),
        rol_id=rol.id,
        activo=True,
    )
    db_session.add(u)
    db_session.flush()

    a1 = UsuarioSucursal(usuario=u.dni, rol_id=rol.id, sucursal_id=s1.id, activo=True)
    a2 = UsuarioSucursal(usuario=u.dni, rol_id=rol.id, sucursal_id=s2.id, activo=True)
    db_session.add_all([a1, a2])
    db_session.commit()

    # Sin sucursal_id responde 422
    r1 = client.post("/login", json={"dni": "55555555", "password": pwd})
    assert r1.status_code == 422
    assert r1.json()["detail"]["causa"] == "sucursal_requerida"

    # Con sucursal no asociada responde 403
    s_ajena = uuid.uuid4()
    r2 = client.post(
        "/login",
        json={"dni": "55555555", "password": pwd, "sucursal_id": str(s_ajena)},
    )
    assert r2.status_code == 403
    assert r2.json()["detail"]["causa"] == "sucursal_no_asociada"

    # Con sucursal asociada responde 200
    r3 = client.post(
        "/login",
        json={"dni": "55555555", "password": pwd, "sucursal_id": str(s1.id)},
    )
    assert r3.status_code == 200
    assert r3.json()["sucursal_id"] == str(s1.id)


@pytest.mark.integration
def test_rate_limit_solo_intentos_fallidos(client, db_session, monkeypatch):
    """Scenarios: Se supera límite de intentos fallidos por IP (429), y logins exitosos no cuentan."""
    from backend.app.auth import router as auth_router

    # Resetear diccionario de rate limit si existe
    if hasattr(auth_router, "_RATE_LIMIT_LOGIN"):
        auth_router._RATE_LIMIT_LOGIN.clear()

    monkeypatch.setenv("AUTH_RATE_LIMIT_N", "3")
    monkeypatch.setenv("AUTH_RATE_LIMIT_VENTANA_SEG", "600")

    rol = db_session.query(Rol).filter_by(nombre="recepcion").first()
    if not rol:
        rol = Rol(nombre="recepcion")
        db_session.add(rol)
        db_session.flush()

    pwd = "password-seguro-123"
    u = Usuario(
        dni="66666666",
        password_hash=hashear_password(pwd),
        rol_id=rol.id,
        activo=True,
    )
    db_session.add(u)
    db_session.commit()

    # 4 logins exitosos seguidos (más que el límite de 3) -> todos 200
    for _ in range(4):
        r_ok = client.post("/login", json={"dni": "66666666", "password": pwd})
        assert r_ok.status_code == 200

    # 3 fallos permitidos
    for _ in range(3):
        r_fail = client.post(
            "/login", json={"dni": "66666666", "password": "wrong-password"}
        )
        assert r_fail.status_code == 401

    # El 4to fallo supera el límite -> 429
    r_block = client.post(
        "/login", json={"dni": "66666666", "password": "wrong-password"}
    )
    assert r_block.status_code == 429


def test_fixture_auth_token_y_cliente(auth_token_factory, auth_client_factory):
    """Test unitario de las fixtures de autenticación (Tarea 4.3)."""
    import jwt

    token = auth_token_factory(rol="admin", sucursal_id=None)
    decoded = jwt.decode(token, options={"verify_signature": False})
    assert decoded["rol"] == "admin"
    assert "sub" in decoded

    authed_client = auth_client_factory(rol="odontologo")
    assert "Authorization" in authed_client.headers
    assert authed_client.headers["Authorization"].startswith("Bearer ")
