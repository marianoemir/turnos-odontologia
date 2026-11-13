"""Tests de los endpoints administrativos de sucursales (C-11, grupo 5).

Mismo patrón de `test_roles_api.py`: `dependency_overrides[get_db]`
con `db_session`.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.app.auth.jwt_service import emitir_token
from backend.app.auth.models import Usuario
from backend.app.auth.password import hashear_password
from backend.app.main import app
from backend.app.rbac.context import get_sucursal_session
from backend.app.rbac.models import Rol
from backend.app.turnos.router import get_db

ADMIN = {}


@pytest.fixture()
def admin_headers(db_session):
    rol = db_session.query(Rol).filter_by(nombre="admin").first()
    if not rol:
        rol = Rol(nombre="admin")
        db_session.add(rol)
        db_session.flush()
    u = db_session.query(Usuario).filter_by(dni="99999903").first()
    if not u:
        u = Usuario(
            dni="99999903",
            password_hash=hashear_password("pwd-admin"),
            rol_id=rol.id,
            activo=True,
        )
        db_session.add(u)
        db_session.commit()
    token = emitir_token(usuario_id=u.id, rol="admin")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def client(db_session, admin_headers):
    global ADMIN
    ADMIN = admin_headers
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_sucursal_session] = lambda: db_session
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_sucursal_session, None)


def _crear_sucursal(client, nombre: str, direccion: str | None = None):
    r = client.post(
        "/sucursales", json={"nombre": nombre, "direccion": direccion}, headers=ADMIN
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_alta_201_y_listado_ordenado_por_nombre(client) -> None:
    # Inverse alphabetical creation order: only an ORDER BY makes this pass.
    _crear_sucursal(client, "Zona Sur")
    _crear_sucursal(client, "Centro")
    _crear_sucursal(client, "Belgrano")
    r = client.get("/sucursales", headers=ADMIN)
    assert r.status_code == 200, r.text
    nombres = [x["nombre"] for x in r.json()]
    assert nombres == ["Belgrano", "Centro", "Zona Sur"]


def test_post_duplicado_da_409(client) -> None:
    _crear_sucursal(client, "Centro")
    r = client.post("/sucursales", json={"nombre": "Centro"}, headers=ADMIN)
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["causa"] == "duplicate_nombre_sucursal"


def test_patch_duplicado_da_409(client) -> None:
    a = _crear_sucursal(client, "Alfa")
    _crear_sucursal(client, "Beta")
    r = client.patch(
        f"/sucursales/{a['id']}", json={"nombre": "Beta"}, headers=ADMIN
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["causa"] == "duplicate_nombre_sucursal"


def test_patch_baja_logica_y_filtro_inactivos(client) -> None:
    suc = _crear_sucursal(client, "Centro")
    r = client.patch(
        f"/sucursales/{suc['id']}", json={"activo": False}, headers=ADMIN
    )
    assert r.status_code == 200, r.text
    assert r.json()["activo"] is False
    r = client.get("/sucursales", headers=ADMIN)
    assert "Centro" not in [x["nombre"] for x in r.json()]
    r = client.get("/sucursales?incluir_inactivos=true", headers=ADMIN)
    assert "Centro" in [x["nombre"] for x in r.json()]


def test_patch_parcial_conserva_campos_no_enviados(client) -> None:
    suc = _crear_sucursal(client, "Centro", direccion="Calle Falsa 123")
    r = client.patch(
        f"/sucursales/{suc['id']}",
        json={"direccion": "Avenida Siempreviva 456"},
        headers=ADMIN,
    )
    assert r.status_code == 200, r.text
    assert r.json()["nombre"] == "Centro"
    assert r.json()["direccion"] == "Avenida Siempreviva 456"


def test_patch_inexistente_da_404(client) -> None:
    r = client.patch(
        f"/sucursales/{uuid.uuid4()}", json={"activo": False}, headers=ADMIN
    )
    assert r.status_code == 404, r.text


def test_post_invalido_y_extra_dan_422(client) -> None:
    r = client.post("/sucursales", json={}, headers=ADMIN)
    assert r.status_code == 422, r.text
    r = client.post(
        "/sucursales", json={"nombre": "Centro", "extra": "x"}, headers=ADMIN
    )
    assert r.status_code == 422, r.text


def test_patch_invalido_y_extra_dan_422(client) -> None:
    suc = _crear_sucursal(client, "Centro")
    r = client.patch(f"/sucursales/{suc['id']}", json={}, headers=ADMIN)
    assert r.status_code == 200, r.text  # empty patch is a no-op
    r = client.patch(
        f"/sucursales/{suc['id']}", json={"extra": "x"}, headers=ADMIN
    )
    assert r.status_code == 422, r.text
    r = client.patch(
        f"/sucursales/{suc['id']}", json={"nombre": ""}, headers=ADMIN
    )
    assert r.status_code == 422, r.text


@pytest.mark.parametrize("rol", ["recepcion", "odontologo", "paciente"])
def test_get_roles_no_admin_dan_403(client, db_session, rol: str) -> None:
    rol_obj = db_session.query(Rol).filter_by(nombre=rol).first()
    if not rol_obj:
        rol_obj = Rol(nombre=rol)
        db_session.add(rol_obj)
        db_session.flush()
    u = db_session.query(Usuario).filter_by(dni=f"88886{rol[:3]}").first()
    if not u:
        u = Usuario(
            dni=f"88886{rol[:3]}",
            password_hash=hashear_password("pwd"),
            rol_id=rol_obj.id,
            activo=True,
        )
        db_session.add(u)
        db_session.commit()
    token = emitir_token(usuario_id=u.id, rol=rol)
    r = client.get("/sucursales", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["causa"] == "permiso_denegado"


@pytest.mark.parametrize("rol", ["recepcion", "odontologo", "paciente"])
def test_post_roles_no_admin_dan_403(client, db_session, rol: str) -> None:
    rol_obj = db_session.query(Rol).filter_by(nombre=rol).first()
    if not rol_obj:
        rol_obj = Rol(nombre=rol)
        db_session.add(rol_obj)
        db_session.flush()
    u = db_session.query(Usuario).filter_by(dni=f"88886{rol[:3]}").first()
    if not u:
        u = Usuario(
            dni=f"88886{rol[:3]}",
            password_hash=hashear_password("pwd"),
            rol_id=rol_obj.id,
            activo=True,
        )
        db_session.add(u)
        db_session.commit()
    token = emitir_token(usuario_id=u.id, rol=rol)
    r = client.post(
        "/sucursales", json={"nombre": "X"}, headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["causa"] == "permiso_denegado"


@pytest.mark.parametrize("rol", ["recepcion", "odontologo", "paciente"])
def test_patch_roles_no_admin_dan_403(client, db_session, rol: str) -> None:
    suc = _crear_sucursal(client, "Centro")
    rol_obj = db_session.query(Rol).filter_by(nombre=rol).first()
    if not rol_obj:
        rol_obj = Rol(nombre=rol)
        db_session.add(rol_obj)
        db_session.flush()
    u = db_session.query(Usuario).filter_by(dni=f"88886{rol[:3]}").first()
    if not u:
        u = Usuario(
            dni=f"88886{rol[:3]}",
            password_hash=hashear_password("pwd"),
            rol_id=rol_obj.id,
            activo=True,
        )
        db_session.add(u)
        db_session.commit()
    token = emitir_token(usuario_id=u.id, rol=rol)
    r = client.patch(
        f"/sucursales/{suc['id']}",
        json={"activo": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["causa"] == "permiso_denegado"


@pytest.mark.parametrize("metodo", ["GET", "POST", "PATCH"])
def test_sin_header_da_401_en_los_tres(client, metodo: str) -> None:
    if metodo == "GET":
        r = client.get("/sucursales")
    elif metodo == "POST":
        r = client.post("/sucursales", json={"nombre": "X"})
    else:
        suc = _crear_sucursal(client, "Centro")
        r = client.patch(f"/sucursales/{suc['id']}", json={"activo": False})
    assert r.status_code == 401, r.text
    assert r.json()["detail"]["causa"] == "token_ausente"
