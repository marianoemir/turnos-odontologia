"""Tests de los endpoints administrativos de roles (C-11, grupo 4).

Patrón de C-12 (`test_catalogo_api.py`): la sesión de la app se reemplaza
con `db_session` vía `dependency_overrides`. La fixture `roles_canonicos`
siembra los 4 roles en esa misma sesión.
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

PERMISOS_ADMIN_ESPERADOS = sorted(
    [
        "caja:leer",
        "caja:escribir",
        "cobros:leer",
        "cobros:escribir",
        "cobros:facturar",
        "liquidaciones:leer",
        "admin:gestionar",
    ]
)
PERMISOS_RECEPCION_ESPERADOS = sorted(
    [
        "caja:leer",
        "caja:escribir",
        "cobros:leer",
        "cobros:escribir",
        "cobros:facturar",
        "liquidaciones:leer",
    ]
)
PERMISOS_ODONTOLOGO_ESPERADOS = sorted(
    ["caja:leer", "cobros:leer", "liquidaciones:leer"]
)


@pytest.fixture()
def admin_headers(db_session, roles_canonicos):
    admin_rol = db_session.query(Rol).filter_by(nombre="admin").first()
    u = db_session.query(Usuario).filter_by(dni="99999902").first()
    if not u:
        u = Usuario(
            dni="99999902",
            password_hash=hashear_password("pwd-admin"),
            rol_id=admin_rol.id,
            activo=True,
        )
        db_session.add(u)
        db_session.commit()
    token = emitir_token(usuario_id=u.id, rol="admin")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def client(db_session, roles_canonicos, admin_headers):
    global ADMIN
    ADMIN = admin_headers
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_sucursal_session] = lambda: db_session
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_sucursal_session, None)


def _crear_rol_no_canonico(client, nombre="auditor"):
    r = client.post(
        "/roles", json={"nombre": nombre, "descripcion": "test"}, headers=ADMIN
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_get_roles_admin_lista_cuatro_con_permisos(client) -> None:
    r = client.get("/roles", headers=ADMIN)
    assert r.status_code == 200, r.text
    roles = {x["nombre"]: x for x in r.json()}
    assert set(roles) == {"admin", "recepcion", "odontologo", "paciente"}
    assert roles["admin"]["permisos"] == PERMISOS_ADMIN_ESPERADOS
    assert roles["recepcion"]["permisos"] == PERMISOS_RECEPCION_ESPERADOS
    assert roles["odontologo"]["permisos"] == PERMISOS_ODONTOLOGO_ESPERADOS
    assert roles["paciente"]["permisos"] == []
    for rol in roles.values():
        assert "*" not in rol["permisos"]


def test_get_roles_sin_header_da_401(client) -> None:
    r = client.get("/roles")
    assert r.status_code == 401, r.text
    assert r.json()["detail"]["causa"] == "token_ausente"


@pytest.mark.parametrize("rol", ["recepcion", "odontologo", "paciente"])
def test_get_roles_roles_no_admin_dan_403(client, db_session, roles_canonicos, rol: str) -> None:
    rol_obj = db_session.query(Rol).filter_by(nombre=rol).first()
    u = db_session.query(Usuario).filter_by(dni=f"88887{rol[:3]}").first()
    if not u:
        u = Usuario(
            dni=f"88887{rol[:3]}",
            password_hash=hashear_password("pwd"),
            rol_id=rol_obj.id,
            activo=True,
        )
        db_session.add(u)
        db_session.commit()
    token = emitir_token(usuario_id=u.id, rol=rol)
    r = client.get("/roles", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["causa"] == "permiso_denegado"


def test_post_roles_crea_y_devuelve_permisos_vacios(client) -> None:
    body = _crear_rol_no_canonico(client)
    assert body["nombre"] == "auditor"
    assert body["permisos"] == []
    assert body["activo"] is True


def test_post_roles_duplicado_da_409(client) -> None:
    _crear_rol_no_canonico(client)
    r = client.post("/roles", json={"nombre": "auditor"}, headers=ADMIN)
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["causa"] == "duplicate_nombre_rol"


def test_post_roles_nombre_canonico_da_409(client) -> None:
    r = client.post("/roles", json={"nombre": "admin"}, headers=ADMIN)
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["causa"] == "duplicate_nombre_rol"


def test_post_roles_body_invalido_da_422(client) -> None:
    r = client.post("/roles", json={}, headers=ADMIN)
    assert r.status_code == 422, r.text


def test_post_roles_campos_extra_dan_422(client) -> None:
    r = client.post(
        "/roles", json={"nombre": "auditor", "extra": "x"}, headers=ADMIN
    )
    assert r.status_code == 422, r.text


def test_patch_rol_no_canonico_baja_logica(client) -> None:
    rol = _crear_rol_no_canonico(client)
    r = client.patch(
        f"/roles/{rol['id']}", json={"activo": False}, headers=ADMIN
    )
    assert r.status_code == 200, r.text
    assert r.json()["activo"] is False


def test_patch_rol_inexistente_da_404(client) -> None:
    import uuid

    r = client.patch(
        f"/roles/{uuid.uuid4()}", json={"activo": False}, headers=ADMIN
    )
    assert r.status_code == 404, r.text


def test_patch_rol_canonico_cambiar_nombre_da_409(client) -> None:
    r = client.get("/roles", headers=ADMIN)
    admin = next(x for x in r.json() if x["nombre"] == "admin")
    r = client.patch(
        f"/roles/{admin['id']}", json={"nombre": "super"}, headers=ADMIN
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["causa"] == "rol_canonico_protegido"


def test_patch_rol_canonico_baja_da_409(client) -> None:
    r = client.get("/roles", headers=ADMIN)
    admin = next(x for x in r.json() if x["nombre"] == "admin")
    r = client.patch(
        f"/roles/{admin['id']}", json={"activo": False}, headers=ADMIN
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["causa"] == "rol_canonico_protegido"


def test_patch_rol_canonico_solo_descripcion_da_200(client) -> None:
    r = client.get("/roles", headers=ADMIN)
    admin = next(x for x in r.json() if x["nombre"] == "admin")
    r = client.patch(
        f"/roles/{admin['id']}",
        json={"descripcion": "administración total"},
        headers=ADMIN,
    )
    assert r.status_code == 200, r.text
    assert r.json()["descripcion"] == "administración total"
    assert r.json()["permisos"] == PERMISOS_ADMIN_ESPERADOS


def test_patch_rol_nombre_duplicado_da_409(client) -> None:
    a = _crear_rol_no_canonico(client, "auditor")
    b = _crear_rol_no_canonico(client, "lector")
    r = client.patch(
        f"/roles/{b['id']}", json={"nombre": a["nombre"]}, headers=ADMIN
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["causa"] == "duplicate_nombre_rol"


def test_rol_no_canonico_como_actor_da_401_sesion_invalida(client, db_session) -> None:
    auditor = _crear_rol_no_canonico(client, "auditor")
    u = Usuario(
        dni="88887aud",
        password_hash=hashear_password("pwd"),
        rol_id=uuid.UUID(auditor["id"]),
        activo=True,
    )
    db_session.add(u)
    db_session.commit()
    token = emitir_token(usuario_id=u.id, rol="auditor")
    r = client.get("/roles", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401, r.text
    assert r.json()["detail"]["causa"] == "sesion_invalida"


def test_rol_de_baja_no_aparece_sin_incluir_inactivos(client) -> None:
    rol = _crear_rol_no_canonico(client, "auditor")
    r = client.patch(
        f"/roles/{rol['id']}", json={"activo": False}, headers=ADMIN
    )
    assert r.status_code == 200, r.text
    nombres_default = [x["nombre"] for x in client.get("/roles", headers=ADMIN).json()]
    assert "auditor" not in nombres_default
    r = client.get("/roles?incluir_inactivos=true", headers=ADMIN)
    assert "auditor" in [x["nombre"] for x in r.json()]


def test_listado_ordenado_por_nombre(client) -> None:
    # Crear en orden inverso al alfabético para que el orden de inserción
    # no coincida con el esperado: el test solo pasa si hay ORDER BY.
    _crear_rol_no_canonico(client, "zeta")
    _crear_rol_no_canonico(client, "alfa")
    _crear_rol_no_canonico(client, "media")
    r = client.get("/roles", headers=ADMIN)
    assert r.status_code == 200, r.text
    nombres = [x["nombre"] for x in r.json()]
    assert nombres == sorted(nombres)


def test_openapi_expone_roles_con_get_post_y_patch() -> None:
    from fastapi.testclient import TestClient

    c = TestClient(app)
    paths = c.get("/openapi.json").json()["paths"]
    assert "get" in paths["/roles"]
    assert "post" in paths["/roles"]
    assert "patch" in paths["/roles/{rol_id}"]
