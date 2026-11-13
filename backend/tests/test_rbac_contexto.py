"""Tests del núcleo RBAC: contexto de permisos y dependencias (Grupo 3, TDD RED).

Usan una app mínima de FastAPI con rutas de prueba, no los endpoints de caja.
Cubre D1/D9: header X-Actor-Rol, default de compatibilidad, rol desconocido,
X-Sucursal-Id y denegación 403 de require_permission.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from backend.app.auth.jwt_service import emitir_token
from backend.app.auth.models import Usuario
from backend.app.auth.password import hashear_password
from backend.app.rbac.context import (
    PermissionContext,
    get_permission_context,
    get_sucursal_session,
)
from backend.app.rbac.dependencies import require_permission
from backend.app.rbac.models import Rol, Sucursal, UsuarioSucursal

app = FastAPI()


@app.get("/contexto")
def ruta_contexto(
    ctx: Annotated[PermissionContext, Depends(get_permission_context)],
) -> dict:
    return {
        "rol": ctx.rol,
        "origen": ctx.origen,
        "usuario": ctx.usuario,
        "sucursal_id": str(ctx.sucursal_id) if ctx.sucursal_id else None,
    }


@app.get("/protegido")
def ruta_protegida(
    ctx: Annotated[
        PermissionContext, Depends(require_permission("caja:escribir"))
    ],
) -> dict:
    return {"ok": True, "rol": ctx.rol}


client = TestClient(app)


def test_header_admin_sin_token_da_401() -> None:
    r = client.get("/contexto", headers={"X-Actor-Rol": "admin"})
    assert r.status_code == 401, r.text
    assert r.json()["detail"]["causa"] == "token_ausente"


def test_sin_header_da_401() -> None:
    r = client.get("/contexto")
    assert r.status_code == 401, r.text
    assert r.json()["detail"]["causa"] == "token_ausente"


def test_rol_desconocido_en_header_da_401_token_ausente() -> None:
    r = client.get("/contexto", headers={"X-Actor-Rol": "superusuario"})
    assert r.status_code == 401, r.text
    assert r.json()["detail"]["causa"] == "token_ausente"


def test_rol_mayusculas_en_header_da_401_token_ausente() -> None:
    r = client.get("/contexto", headers={"X-Actor-Rol": "ADMIN"})
    assert r.status_code == 401, r.text
    assert r.json()["detail"]["causa"] == "token_ausente"


def test_rol_con_espacio_en_header_da_401_token_ausente() -> None:
    r = client.get("/contexto", headers={"X-Actor-Rol": " admin"})
    assert r.status_code == 401, r.text
    assert r.json()["detail"]["causa"] == "token_ausente"


def test_sucursal_no_uuid_en_header_da_401_token_ausente() -> None:
    r = client.get(
        "/contexto",
        headers={"X-Actor-Rol": "admin", "X-Sucursal-Id": "no-es-uuid"},
    )
    assert r.status_code == 401, r.text
    assert r.json()["detail"]["causa"] == "token_ausente"


def test_sucursal_uuid_inexistente_en_header_da_401_token_ausente() -> None:
    r = client.get(
        "/contexto",
        headers={
            "X-Actor-Rol": "admin",
            "X-Sucursal-Id": str(uuid.uuid4()),
        },
    )
    assert r.status_code == 401, r.text
    assert r.json()["detail"]["causa"] == "token_ausente"


def test_require_permission_autorizado_deja_pasar(db_session) -> None:
    rol = db_session.query(Rol).filter_by(nombre="recepcion").first()
    if not rol:
        rol = Rol(nombre="recepcion")
        db_session.add(rol)
        db_session.flush()
    u = db_session.query(Usuario).filter_by(dni="99999906").first()
    if not u:
        u = Usuario(
            dni="99999906",
            password_hash=hashear_password("pwd"),
            rol_id=rol.id,
            activo=True,
        )
        db_session.add(u)
        db_session.commit()
    token = emitir_token(usuario_id=u.id, rol="recepcion")
    app.dependency_overrides[get_sucursal_session] = lambda: db_session
    try:
        r = client.get("/protegido", headers={"Authorization": f"Bearer {token}"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "rol": "recepcion"}


def test_require_permission_no_autorizado_da_403(db_session) -> None:
    rol = db_session.query(Rol).filter_by(nombre="odontologo").first()
    if not rol:
        rol = Rol(nombre="odontologo")
        db_session.add(rol)
        db_session.flush()
    u = db_session.query(Usuario).filter_by(dni="99999907").first()
    if not u:
        u = Usuario(
            dni="99999907",
            password_hash=hashear_password("pwd"),
            rol_id=rol.id,
            activo=True,
        )
        db_session.add(u)
        db_session.commit()
    token = emitir_token(usuario_id=u.id, rol="odontologo")
    app.dependency_overrides[get_sucursal_session] = lambda: db_session
    try:
        r = client.get("/protegido", headers={"Authorization": f"Bearer {token}"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 403, r.text
    assert r.status_code != 401
    assert r.json()["detail"]["causa"] == "permiso_denegado"


def test_require_permission_paciente_da_403_sin_401(db_session) -> None:
    rol = db_session.query(Rol).filter_by(nombre="paciente").first()
    if not rol:
        rol = Rol(nombre="paciente")
        db_session.add(rol)
        db_session.flush()
    u = db_session.query(Usuario).filter_by(dni="99999908").first()
    if not u:
        u = Usuario(
            dni="99999908",
            password_hash=hashear_password("pwd"),
            rol_id=rol.id,
            activo=True,
        )
        db_session.add(u)
        db_session.commit()
    token = emitir_token(usuario_id=u.id, rol="paciente")
    app.dependency_overrides[get_sucursal_session] = lambda: db_session
    try:
        r = client.get("/protegido", headers={"Authorization": f"Bearer {token}"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 403, r.text
    assert r.status_code != 401
    assert r.json()["detail"]["causa"] == "permiso_denegado"


# ---------- X-Sucursal-Id contra la base, con sesion inyectada ----------


def test_sucursal_existente_da_200(db_session) -> None:
    """Caso feliz: la sucursal del token creada en db_session se reconoce."""
    rol = db_session.query(Rol).filter_by(nombre="admin").first()
    if not rol:
        rol = Rol(nombre="admin")
        db_session.add(rol)
        db_session.flush()
    sucursal = Sucursal(nombre="Sucursal Centro", activo=True)
    db_session.add(sucursal)
    db_session.flush()
    u = Usuario(
        dni="99999909",
        password_hash=hashear_password("pwd"),
        rol_id=rol.id,
        activo=True,
    )
    db_session.add(u)
    db_session.flush()
    asoc = UsuarioSucursal(usuario=u.dni, rol_id=rol.id, sucursal_id=sucursal.id, activo=True)
    db_session.add(asoc)
    db_session.commit()

    token = emitir_token(usuario_id=u.id, rol="admin", sucursal_id=sucursal.id)

    app.dependency_overrides[get_sucursal_session] = lambda: db_session
    try:
        r = client.get(
            "/contexto",
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200, r.text
    assert r.json()["sucursal_id"] == str(sucursal.id)


def test_header_sucursal_se_ignora_con_token_valido(db_session) -> None:
    """Header X-Sucursal-Id se ignora; manda el token."""
    rol = db_session.query(Rol).filter_by(nombre="admin").first()
    if not rol:
        rol = Rol(nombre="admin")
        db_session.add(rol)
        db_session.flush()
    u = Usuario(
        dni="99999910",
        password_hash=hashear_password("pwd"),
        rol_id=rol.id,
        activo=True,
    )
    db_session.add(u)
    db_session.commit()

    token = emitir_token(usuario_id=u.id, rol="admin")

    app.dependency_overrides[get_sucursal_session] = lambda: db_session
    try:
        r = client.get(
            "/contexto",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Sucursal-Id": str(uuid.uuid4()),
            },
        )
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200, r.text
    assert r.json()["sucursal_id"] is None
