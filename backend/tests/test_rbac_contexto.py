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

from backend.app.rbac.context import (
    PermissionContext,
    get_permission_context,
    get_sucursal_session,
)
from backend.app.rbac.dependencies import require_permission
from backend.app.rbac.models import Sucursal

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


def test_header_admin_resuelve_contexto_header() -> None:
    r = client.get("/contexto", headers={"X-Actor-Rol": "admin"})
    assert r.status_code == 200, r.text
    assert r.json() == {
        "rol": "admin",
        "origen": "header",
        "usuario": None,
        "sucursal_id": None,
    }


def test_sin_header_default_recepcion() -> None:
    r = client.get("/contexto")
    assert r.status_code == 200, r.text
    assert r.json()["rol"] == "recepcion"
    assert r.json()["origen"] == "default_compatibilidad"


def test_rol_desconocido_da_422() -> None:
    r = client.get("/contexto", headers={"X-Actor-Rol": "superusuario"})
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["causa"] == "rol_desconocido"


def test_rol_mayusculas_da_422() -> None:
    r = client.get("/contexto", headers={"X-Actor-Rol": "ADMIN"})
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["causa"] == "rol_desconocido"


def test_rol_con_espacio_da_422() -> None:
    r = client.get("/contexto", headers={"X-Actor-Rol": " admin"})
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["causa"] == "rol_desconocido"


def test_sucursal_no_uuid_da_422() -> None:
    r = client.get(
        "/contexto",
        headers={"X-Actor-Rol": "admin", "X-Sucursal-Id": "no-es-uuid"},
    )
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["causa"] == "sucursal_invalida"


def test_sucursal_uuid_inexistente_da_422() -> None:
    r = client.get(
        "/contexto",
        headers={
            "X-Actor-Rol": "admin",
            "X-Sucursal-Id": str(uuid.uuid4()),
        },
    )
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["causa"] == "sucursal_invalida"


def test_require_permission_autorizado_deja_pasar() -> None:
    r = client.get("/protegido", headers={"X-Actor-Rol": "recepcion"})
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "rol": "recepcion"}


def test_require_permission_no_autorizado_da_403() -> None:
    r = client.get("/protegido", headers={"X-Actor-Rol": "odontologo"})
    assert r.status_code == 403, r.text
    assert r.status_code != 401
    assert r.json()["detail"]["causa"] == "permiso_denegado"


def test_require_permission_paciente_da_403_sin_401() -> None:
    r = client.get("/protegido", headers={"X-Actor-Rol": "paciente"})
    assert r.status_code == 403, r.text
    assert r.status_code != 401
    assert r.json()["detail"]["causa"] == "permiso_denegado"


# ---------- X-Sucursal-Id contra la base, con sesion inyectada ----------


def test_sucursal_existente_da_200(db_session) -> None:
    """Caso feliz: la sucursal creada en db_session se reconoce."""

    def _override():
        yield db_session

    sucursal = Sucursal(nombre="Sucursal Centro", activo=True)
    db_session.add(sucursal)
    db_session.flush()

    app.dependency_overrides[get_sucursal_session] = _override
    try:
        r = client.get(
            "/contexto",
            headers={
                "X-Actor-Rol": "admin",
                "X-Sucursal-Id": str(sucursal.id),
            },
        )
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200, r.text
    assert r.json()["sucursal_id"] == str(sucursal.id)


def test_sin_sucursal_no_se_toca_la_base() -> None:
    """Sin X-Sucursal-Id, la sesion nunca se usa: lo prueba una sesion trampa."""

    class _SesionQueFalla:
        def query(self, *args, **kwargs):
            raise AssertionError("no se debió consultar la base")

    def _override():
        yield _SesionQueFalla()

    app.dependency_overrides[get_sucursal_session] = _override
    try:
        r = client.get("/contexto", headers={"X-Actor-Rol": "admin"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200, r.text
    assert r.json()["sucursal_id"] is None
