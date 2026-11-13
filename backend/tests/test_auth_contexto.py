"""Tests de resolución de identidad solo por JWT (C-24, Grupo 5)."""

import uuid

import jwt
import pytest
from starlette.testclient import TestClient

from backend.app.auth.config import get_auth_settings
from backend.app.auth.jwt_service import emitir_token
from backend.app.auth.models import Usuario
from backend.app.auth.password import hashear_password
from backend.app.main import app
from backend.app.rbac.context import get_sucursal_session
from backend.app.rbac.models import Rol, Sucursal, UsuarioSucursal
from backend.app.turnos.router import get_db


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_sucursal_session] = lambda: db_session
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_sucursal_session, None)


@pytest.mark.integration
def test_jwt_valido_produce_contexto_jwt(client, db_session):
    """Scenario: JWT válido produce contexto con origen jwt."""
    rol = db_session.query(Rol).filter_by(nombre="admin").first()
    if not rol:
        rol = Rol(nombre="admin")
        db_session.add(rol)
        db_session.flush()

    u = Usuario(
        dni="10101010",
        password_hash=hashear_password("pwd"),
        rol_id=rol.id,
        activo=True,
    )
    db_session.add(u)
    db_session.commit()

    token = emitir_token(usuario_id=u.id, rol="admin")
    res = client.get("/roles", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200


@pytest.mark.integration
def test_sin_token_responde_401(client):
    """Scenario: Sin token en ruta protegida responde 401."""
    res = client.get("/roles")
    assert res.status_code == 401
    assert res.json()["detail"]["causa"] == "token_ausente"
    assert res.headers.get("WWW-Authenticate") == "Bearer"


def test_authorization_esquema_distinto_o_vacio(client):
    """Scenario: Authorization con esquema distinto o token vacío responde 401 token_ausente."""
    r1 = client.get("/roles", headers={"Authorization": "Basic 12345"})
    assert r1.status_code == 401
    assert r1.json()["detail"]["causa"] == "token_ausente"

    r2 = client.get("/roles", headers={"Authorization": "Bearer "})
    assert r2.status_code == 401
    assert r2.json()["detail"]["causa"] == "token_ausente"


def test_token_no_jwt_responde_401(client):
    """Scenario: Token con formato que no es un JWT responde 401 token_invalido."""
    res = client.get("/roles", headers={"Authorization": "Bearer abc"})
    assert res.status_code == 401
    assert res.json()["detail"]["causa"] == "token_invalido"


@pytest.mark.integration
def test_headers_c11_sin_token_no_otorgan_identidad(client):
    """Scenarios: Headers X-Actor-Rol y X-Sucursal-Id sin token no otorgan identidad."""
    r1 = client.get("/roles", headers={"X-Actor-Rol": "admin"})
    assert r1.status_code == 401
    assert r1.json()["detail"]["causa"] == "token_ausente"

    r2 = client.get("/roles", headers={"X-Sucursal-Id": str(uuid.uuid4())})
    assert r2.status_code == 401
    assert r2.json()["detail"]["causa"] == "token_ausente"


@pytest.mark.integration
def test_token_firma_invalida_o_algoritmo_none_responde_401(client):
    """Scenarios: Token firmado con otra clave o algoritmo none responde 401 token_invalido."""
    payload = {
        "sub": str(uuid.uuid4()),
        "rol": "admin",
        "iat": 1000,
        "exp": 9999999999,
    }
    # Otra clave
    token_otra_clave = jwt.encode(payload, "otra-clave-ficticia-de-mas-de-32-caracteres", algorithm="HS256")
    r1 = client.get("/roles", headers={"Authorization": f"Bearer {token_otra_clave}"})
    assert r1.status_code == 401
    assert r1.json()["detail"]["causa"] == "token_invalido"

    # Algoritmo none
    token_none = jwt.encode(payload, key="", algorithm="none")
    r2 = client.get("/roles", headers={"Authorization": f"Bearer {token_none}"})
    assert r2.status_code == 401
    assert r2.json()["detail"]["causa"] == "token_invalido"


@pytest.mark.integration
def test_token_expirado_responde_401(client):
    """Scenario: Token expirado responde 401 token_expirado."""
    settings = get_auth_settings()
    payload = {
        "sub": str(uuid.uuid4()),
        "rol": "admin",
        "iat": 1000,
        "exp": 1001,
    }
    token = jwt.encode(payload, settings.secret_key, algorithm="HS256")
    res = client.get("/roles", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
    assert res.json()["detail"]["causa"] == "token_expirado"


@pytest.mark.integration
def test_token_sin_claims_responde_401(client):
    """Scenario: Token sin claims obligatorios responde 401 token_incompleto."""
    settings = get_auth_settings()
    # Falta rol
    token = jwt.encode({"sub": str(uuid.uuid4()), "exp": 9999999999}, settings.secret_key, algorithm="HS256")
    res = client.get("/roles", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
    assert res.json()["detail"]["causa"] == "token_incompleto"


@pytest.mark.integration
def test_token_usuario_desactivado_o_modificado_responde_401(client, db_session):
    """Scenarios: Token de usuario desactivado, rol cambiado o sucursal desasociada responde sesion_invalida."""
    rol = db_session.query(Rol).filter_by(nombre="recepcion").first()
    if not rol:
        rol = Rol(nombre="recepcion")
        db_session.add(rol)
        db_session.flush()

    u = Usuario(
        dni="20202020",
        password_hash=hashear_password("pwd"),
        rol_id=rol.id,
        activo=False,
    )
    db_session.add(u)
    db_session.commit()

    token = emitir_token(usuario_id=u.id, rol="recepcion")
    res = client.get("/roles", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
    assert res.json()["detail"]["causa"] == "sesion_invalida"

    # Caso sucursal desasociada
    u_suc = Usuario(
        dni="21212121",
        password_hash=hashear_password("pwd"),
        rol_id=rol.id,
        activo=True,
    )
    db_session.add(u_suc)
    db_session.commit()
    token_desasociada = emitir_token(
        usuario_id=u_suc.id, rol="recepcion", sucursal_id=uuid.uuid4()
    )
    res_suc = client.get("/roles", headers={"Authorization": f"Bearer {token_desasociada}"})
    assert res_suc.status_code == 401
    assert res_suc.json()["detail"]["causa"] == "sesion_invalida"


@pytest.mark.integration
def test_token_valido_con_rol_sin_permiso_responde_403(client, db_session):
    """Scenario: Token válido con rol sin permiso responde 403 permiso_denegado."""
    rol = db_session.query(Rol).filter_by(nombre="recepcion").first()
    if not rol:
        rol = Rol(nombre="recepcion")
        db_session.add(rol)
        db_session.flush()

    u = Usuario(
        dni="30303030",
        password_hash=hashear_password("pwd"),
        rol_id=rol.id,
        activo=True,
    )
    db_session.add(u)
    db_session.commit()

    token = emitir_token(usuario_id=u.id, rol="recepcion")
    # GET /export requiere admin
    res = client.get("/export", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
    assert res.json()["detail"]["causa"] == "permiso_denegado"


@pytest.mark.integration
def test_token_con_sucursal_filtra_profesionales_y_sillones(client, db_session):
    """Scenario: Token con sucursal filtra profesionales y sillones por esa sucursal."""
    from backend.app.agenda.models import Profesional, SillonBox

    rol = db_session.query(Rol).filter_by(nombre="recepcion").first()
    if not rol:
        rol = Rol(nombre="recepcion")
        db_session.add(rol)
        db_session.flush()

    s1 = Sucursal(nombre="Sucursal Norte")
    s2 = Sucursal(nombre="Sucursal Sur")
    db_session.add_all([s1, s2])
    db_session.flush()

    prof1 = Profesional(nombre="Dr Norte", matricula="MAT-NORTE-1", sucursal_id=s1.id)
    prof2 = Profesional(nombre="Dr Sur", matricula="MAT-SUR-1", sucursal_id=s2.id)
    sillon1 = SillonBox(nombre="Sillon Norte", sucursal_id=s1.id)
    sillon2 = SillonBox(nombre="Sillon Sur", sucursal_id=s2.id)
    db_session.add_all([prof1, prof2, sillon1, sillon2])
    db_session.flush()

    u = Usuario(
        dni="77777777",
        password_hash=hashear_password("pwd"),
        rol_id=rol.id,
        activo=True,
    )
    db_session.add(u)
    db_session.flush()

    asoc = UsuarioSucursal(usuario=u.dni, rol_id=rol.id, sucursal_id=s1.id, activo=True)
    db_session.add(asoc)
    db_session.commit()

    token = emitir_token(usuario_id=u.id, rol="recepcion", sucursal_id=s1.id)

    # Listar profesionales con el token de sucursal 1
    r_prof = client.get("/profesionales", headers={"Authorization": f"Bearer {token}"})
    assert r_prof.status_code == 200
    matriculas = [p["matricula"] for p in r_prof.json()]
    assert "MAT-NORTE-1" in matriculas
    assert "MAT-SUR-1" not in matriculas

    # Listar sillones con el token de sucursal 1
    r_sil = client.get("/sillones", headers={"Authorization": f"Bearer {token}"})
    assert r_sil.status_code == 200
    nombres_sillones = [s["nombre"] for s in r_sil.json()]
    assert "Sillon Norte" in nombres_sillones
    assert "Sillon Sur" not in nombres_sillones


@pytest.mark.integration
def test_rutas_publicas_sin_token_responde_ok(client):
    """Scenarios: Rutas públicas /health y reserva sin token no exigen Authorization."""
    r1 = client.get("/health")
    assert r1.status_code == 200

    r2 = client.get("/reservar/inexistente")
    assert r2.status_code in [200, 404, 422]
    assert r2.status_code != 401
