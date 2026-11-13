"""Tests de asignación usuario-sucursal (C-11, grupo 6, TDD RED).

Mismo patrón de `test_roles_api.py` / `test_sucursales_api.py`:
`dependency_overrides[get_db]` con `db_session`.

Decisiones fijadas por el usuario:
- Filtro `usuario`: igualdad exacta (sin ilike ni normalización).
- `usuario` es texto libre; no existe GET /usuarios.
- UUID mal formado -> 422; UUID válido inexistente -> 404
  (POST, PATCH y filtros del GET).
- Duplicado de la misma asignación -> 409 `duplicate_usuario_sucursal`.
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
def admin_headers(db_session, roles_canonicos):
    rol = db_session.query(Rol).filter_by(nombre="admin").first()
    u = db_session.query(Usuario).filter_by(dni="99999904").first()
    if not u:
        u = Usuario(
            dni="99999904",
            password_hash=hashear_password("pwd-admin"),
            rol_id=rol.id,
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


def _rol_recepcion(db_session) -> Rol:
    return db_session.query(Rol).filter_by(nombre="recepcion").first()


def _crear_sucursal(client, nombre: str = "Centro"):
    r = client.post("/sucursales", json={"nombre": nombre}, headers=ADMIN)
    assert r.status_code == 201, r.text
    return r.json()


def _crear_asignacion(client, usuario="ana", sucursal_id=None, rol_id=None):
    r = client.post(
        "/usuarios-sucursal",
        json={"usuario": usuario, "rol_id": rol_id, "sucursal_id": sucursal_id},
        headers=ADMIN,
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_alta_201(client, db_session) -> None:
    suc = _crear_sucursal(client)
    rol = _rol_recepcion(db_session)
    body = _crear_asignacion(
        client, "ana", sucursal_id=suc["id"], rol_id=str(rol.id)
    )
    assert body["usuario"] == "ana"
    assert body["sucursal_id"] == suc["id"]
    assert body["rol_id"] == str(rol.id)
    assert body["activo"] is True


def test_duplicado_da_409_codigo_estable(client, db_session) -> None:
    suc = _crear_sucursal(client)
    rol = _rol_recepcion(db_session)
    _crear_asignacion(client, "ana", suc["id"], str(rol.id))
    r = client.post(
        "/usuarios-sucursal",
        json={"usuario": "ana", "rol_id": str(rol.id), "sucursal_id": suc["id"]},
        headers=ADMIN,
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["causa"] == "duplicate_usuario_sucursal"


@pytest.mark.parametrize("campo", ["rol_id", "sucursal_id"])
def test_fk_inexistente_da_404(client, db_session, campo: str) -> None:
    suc = _crear_sucursal(client)
    rol = _rol_recepcion(db_session)
    payload = {"usuario": "ana", "rol_id": str(rol.id), "sucursal_id": suc["id"]}
    payload[campo] = str(uuid.uuid4())
    r = client.post("/usuarios-sucursal", json=payload, headers=ADMIN)
    assert r.status_code == 404, r.text


@pytest.mark.parametrize("campo", ["rol_id", "sucursal_id"])
def test_uuid_mal_formado_da_422(client, db_session, campo: str) -> None:
    suc = _crear_sucursal(client)
    rol = _rol_recepcion(db_session)
    payload = {"usuario": "ana", "rol_id": str(rol.id), "sucursal_id": suc["id"]}
    payload[campo] = "no-es-uuid"
    r = client.post("/usuarios-sucursal", json=payload, headers=ADMIN)
    assert r.status_code == 422, r.text


def test_post_campos_extra_da_422(client, db_session) -> None:
    suc = _crear_sucursal(client)
    rol = _rol_recepcion(db_session)
    r = client.post(
        "/usuarios-sucursal",
        json={
            "usuario": "ana",
            "rol_id": str(rol.id),
            "sucursal_id": suc["id"],
            "extra": "x",
        },
        headers=ADMIN,
    )
    assert r.status_code == 422, r.text


def test_patch_baja_logica(client, db_session) -> None:
    suc = _crear_sucursal(client)
    rol = _rol_recepcion(db_session)
    asig = _crear_asignacion(client, "ana", suc["id"], str(rol.id))
    r = client.patch(
        f"/usuarios-sucursal/{asig['id']}", json={"activo": False}, headers=ADMIN
    )
    assert r.status_code == 200, r.text
    assert r.json()["activo"] is False


def test_patch_cambia_referencias(client, db_session) -> None:
    suc_a = _crear_sucursal(client, "A")
    suc_b = _crear_sucursal(client, "B")
    rol_r = _rol_recepcion(db_session)
    rol_o = db_session.query(Rol).filter_by(nombre="odontologo").first()
    asig = _crear_asignacion(client, "ana", suc_a["id"], str(rol_r.id))
    r = client.patch(
        f"/usuarios-sucursal/{asig['id']}",
        json={"sucursal_id": suc_b["id"], "rol_id": str(rol_o.id)},
        headers=ADMIN,
    )
    assert r.status_code == 200, r.text
    assert r.json()["sucursal_id"] == suc_b["id"]
    assert r.json()["rol_id"] == str(rol_o.id)


def test_patch_fk_inexistente_da_404(client, db_session) -> None:
    suc = _crear_sucursal(client)
    rol = _rol_recepcion(db_session)
    asig = _crear_asignacion(client, "ana", suc["id"], str(rol.id))
    r = client.patch(
        f"/usuarios-sucursal/{asig['id']}",
        json={"sucursal_id": str(uuid.uuid4())},
        headers=ADMIN,
    )
    assert r.status_code == 404, r.text
    r = client.patch(
        f"/usuarios-sucursal/{asig['id']}",
        json={"rol_id": str(uuid.uuid4())},
        headers=ADMIN,
    )
    assert r.status_code == 404, r.text


def test_patch_inexistente_da_404(client, db_session) -> None:
    r = client.patch(
        f"/usuarios-sucursal/{uuid.uuid4()}", json={"activo": False}, headers=ADMIN
    )
    assert r.status_code == 404, r.text


def test_patch_uuid_mal_formado_da_422(client, db_session) -> None:
    suc = _crear_sucursal(client)
    rol = _rol_recepcion(db_session)
    asig = _crear_asignacion(client, "ana", suc["id"], str(rol.id))
    r = client.patch(
        f"/usuarios-sucursal/{asig['id']}",
        json={"rol_id": "no-es-uuid"},
        headers=ADMIN,
    )
    assert r.status_code == 422, r.text


def test_patch_con_x_sucursal_id_distinto_da_200(client, db_session) -> None:
    """El header X-Sucursal-Id (otra sucursal) no debe colisionar con el path."""
    suc = _crear_sucursal(client, "Centro")
    otra = _crear_sucursal(client, "Otra")
    rol = _rol_recepcion(db_session)
    asig = _crear_asignacion(client, "ana", suc["id"], str(rol.id))
    # Sin este override, la sesión real de get_sucursal_session se bloquea
    # contra el TRUNCATE sin commitear de db_session; con db_session la
    # sucursal "Otra" es visible y la validación pasa.
    app.dependency_overrides[get_sucursal_session] = lambda: db_session
    try:
        r = client.patch(
            f"/usuarios-sucursal/{asig['id']}",
            json={"activo": False},
            headers={**ADMIN, "X-Sucursal-Id": otra["id"]},
        )
    finally:
        app.dependency_overrides.pop(get_sucursal_session, None)
    assert r.status_code == 200, r.text
    assert r.json()["activo"] is False


def test_filtro_usuario_igualdad_exacta(client, db_session) -> None:
    suc = _crear_sucursal(client)
    rol = _rol_recepcion(db_session)
    _crear_asignacion(client, "ana", suc["id"], str(rol.id))
    _crear_asignacion(client, "mariana", suc["id"], str(rol.id))
    _crear_asignacion(client, "Ana", suc["id"], str(rol.id))
    r = client.get("/usuarios-sucursal?usuario=ana", headers=ADMIN)
    assert r.status_code == 200, r.text
    assert [x["usuario"] for x in r.json()] == ["ana"]


def test_filtro_sucursal_id(client, db_session) -> None:
    suc_a = _crear_sucursal(client, "A")
    suc_b = _crear_sucursal(client, "B")
    rol = _rol_recepcion(db_session)
    _crear_asignacion(client, "ana", suc_a["id"], str(rol.id))
    _crear_asignacion(client, "luis", suc_b["id"], str(rol.id))
    r = client.get(f"/usuarios-sucursal?sucursal_id={suc_a['id']}", headers=ADMIN)
    assert r.status_code == 200, r.text
    assert [x["usuario"] for x in r.json()] == ["ana"]


def test_filtro_sucursal_id_inexistente_da_404(client) -> None:
    r = client.get(
        f"/usuarios-sucursal?sucursal_id={uuid.uuid4()}", headers=ADMIN
    )
    assert r.status_code == 404, r.text


def test_filtro_sucursal_id_mal_formado_da_422(client) -> None:
    r = client.get("/usuarios-sucursal?sucursal_id=no-es-uuid", headers=ADMIN)
    assert r.status_code == 422, r.text


def test_filtro_rol_id(client, db_session) -> None:
    suc = _crear_sucursal(client)
    rol_r = _rol_recepcion(db_session)
    rol_o = db_session.query(Rol).filter_by(nombre="odontologo").first()
    _crear_asignacion(client, "ana", suc["id"], str(rol_r.id))
    _crear_asignacion(client, "luis", suc["id"], str(rol_o.id))
    r = client.get(f"/usuarios-sucursal?rol_id={rol_r.id}", headers=ADMIN)
    assert r.status_code == 200, r.text
    assert [x["usuario"] for x in r.json()] == ["ana"]


def test_filtro_rol_id_inexistente_da_404(client) -> None:
    r = client.get(f"/usuarios-sucursal?rol_id={uuid.uuid4()}", headers=ADMIN)
    assert r.status_code == 404, r.text


def test_filtro_rol_id_mal_formado_da_422(client) -> None:
    r = client.get("/usuarios-sucursal?rol_id=no-es-uuid", headers=ADMIN)
    assert r.status_code == 422, r.text


@pytest.mark.parametrize("rol", ["recepcion", "odontologo", "paciente"])
def test_get_no_admin_da_403(client, db_session, rol: str) -> None:
    rol_obj = db_session.query(Rol).filter_by(nombre=rol).first()
    u = db_session.query(Usuario).filter_by(dni=f"88885{rol[:3]}").first()
    if not u:
        u = Usuario(
            dni=f"88885{rol[:3]}",
            password_hash=hashear_password("pwd"),
            rol_id=rol_obj.id,
            activo=True,
        )
        db_session.add(u)
        db_session.commit()
    token = emitir_token(usuario_id=u.id, rol=rol)
    r = client.get("/usuarios-sucursal", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["causa"] == "permiso_denegado"


@pytest.mark.parametrize("rol", ["recepcion", "odontologo", "paciente"])
def test_post_no_admin_da_403(client, db_session, rol: str) -> None:
    suc = _crear_sucursal(client)
    roc = _rol_recepcion(db_session)
    rol_obj = db_session.query(Rol).filter_by(nombre=rol).first()
    u = db_session.query(Usuario).filter_by(dni=f"88885{rol[:3]}").first()
    if not u:
        u = Usuario(
            dni=f"88885{rol[:3]}",
            password_hash=hashear_password("pwd"),
            rol_id=rol_obj.id,
            activo=True,
        )
        db_session.add(u)
        db_session.commit()
    token = emitir_token(usuario_id=u.id, rol=rol)
    r = client.post(
        "/usuarios-sucursal",
        json={"usuario": "ana", "rol_id": str(roc.id), "sucursal_id": suc["id"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["causa"] == "permiso_denegado"


@pytest.mark.parametrize("rol", ["recepcion", "odontologo", "paciente"])
def test_patch_no_admin_da_403(client, db_session, rol: str) -> None:
    suc = _crear_sucursal(client)
    roc = _rol_recepcion(db_session)
    asig = _crear_asignacion(client, "ana", suc["id"], str(roc.id))
    rol_obj = db_session.query(Rol).filter_by(nombre=rol).first()
    u = db_session.query(Usuario).filter_by(dni=f"88885{rol[:3]}").first()
    if not u:
        u = Usuario(
            dni=f"88885{rol[:3]}",
            password_hash=hashear_password("pwd"),
            rol_id=rol_obj.id,
            activo=True,
        )
        db_session.add(u)
        db_session.commit()
    token = emitir_token(usuario_id=u.id, rol=rol)
    r = client.patch(
        f"/usuarios-sucursal/{asig['id']}",
        json={"activo": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["causa"] == "permiso_denegado"


@pytest.mark.parametrize("metodo", ["GET", "POST", "PATCH"])
def test_sin_header_da_401_en_los_tres(
    client, db_session, metodo: str
) -> None:
    suc = _crear_sucursal(client)
    roc = _rol_recepcion(db_session)
    asig = _crear_asignacion(client, "ana", suc["id"], str(roc.id))
    if metodo == "GET":
        r = client.get("/usuarios-sucursal")
    elif metodo == "POST":
        r = client.post(
            "/usuarios-sucursal",
            json={"usuario": "luis", "rol_id": str(roc.id), "sucursal_id": suc["id"]},
        )
    else:
        r = client.patch(
            f"/usuarios-sucursal/{asig['id']}", json={"activo": False}
        )
    assert r.status_code == 401, r.text
    assert r.json()["detail"]["causa"] == "token_ausente"
