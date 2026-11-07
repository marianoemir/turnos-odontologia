"""Router FastAPI para superficies administrativas RBAC (C-11).

Router delgado (patrón C-12): solo declara endpoints y delega en
`backend.app.rbac.service`. Todos los endpoints requieren `require_admin()`.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.app.rbac import service as rbac_service
from backend.app.rbac.context import PermissionContext
from backend.app.rbac.dependencies import require_admin
from backend.app.rbac.schemas import (
    RolCreate,
    RolOut,
    RolPatch,
    SucursalCreate,
    SucursalOut,
    SucursalPatch,
    UsuarioSucursalCreate,
    UsuarioSucursalOut,
    UsuarioSucursalPatch,
)
from backend.app.turnos.router import get_db

router = APIRouter(tags=["rbac"])


@router.get("/roles", response_model=list[RolOut], status_code=200)
def listar_roles(
    context: Annotated[PermissionContext, Depends(require_admin())],
    session: Annotated[Session, Depends(get_db)],
    incluir_inactivos: bool = Query(default=False),
) -> list[RolOut]:
    return rbac_service.listar_roles(session, incluir_inactivos)


@router.post(
    "/roles", response_model=RolOut, status_code=status.HTTP_201_CREATED
)
def crear_rol(
    body: RolCreate,
    context: Annotated[PermissionContext, Depends(require_admin())],
    session: Annotated[Session, Depends(get_db)],
) -> RolOut:
    return rbac_service.crear_rol(session, body)


@router.patch(
    "/roles/{rol_id}", response_model=RolOut, status_code=200
)
def actualizar_rol(
    rol_id: uuid.UUID,
    body: RolPatch,
    context: Annotated[PermissionContext, Depends(require_admin())],
    session: Annotated[Session, Depends(get_db)],
) -> RolOut:
    return rbac_service.actualizar_rol(session, rol_id, body)


@router.patch(
    "/sucursales/{sucursal_id}", response_model=SucursalOut, status_code=200
)
def actualizar_sucursal(
    sucursal_id: uuid.UUID,
    body: SucursalPatch,
    context: Annotated[PermissionContext, Depends(require_admin())],
    session: Annotated[Session, Depends(get_db)],
) -> SucursalOut:
    return rbac_service.actualizar_sucursal(session, sucursal_id, body)


@router.get("/sucursales", response_model=list[SucursalOut], status_code=200)
def listar_sucursales(
    context: Annotated[PermissionContext, Depends(require_admin())],
    session: Annotated[Session, Depends(get_db)],
    incluir_inactivos: bool = Query(default=False),
) -> list[SucursalOut]:
    return rbac_service.listar_sucursales(session, incluir_inactivos)


@router.post(
    "/sucursales",
    response_model=SucursalOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_sucursal(
    body: SucursalCreate,
    context: Annotated[PermissionContext, Depends(require_admin())],
    session: Annotated[Session, Depends(get_db)],
) -> SucursalOut:
    return rbac_service.crear_sucursal(session, body)


@router.get(
    "/usuarios-sucursal",
    response_model=list[UsuarioSucursalOut],
    status_code=200,
)
def listar_usuarios_sucursal(
    context: Annotated[PermissionContext, Depends(require_admin())],
    session: Annotated[Session, Depends(get_db)],
    sucursal_id: str | None = Query(default=None),
    rol_id: str | None = Query(default=None),
    usuario: str | None = Query(default=None),
    incluir_inactivos: bool = Query(default=False),
) -> list[UsuarioSucursalOut]:
    return rbac_service.listar_usuarios_sucursal(
        session, sucursal_id, rol_id, usuario, incluir_inactivos
    )


@router.post(
    "/usuarios-sucursal",
    response_model=UsuarioSucursalOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_usuario_sucursal(
    body: UsuarioSucursalCreate,
    context: Annotated[PermissionContext, Depends(require_admin())],
    session: Annotated[Session, Depends(get_db)],
) -> UsuarioSucursalOut:
    return rbac_service.crear_usuario_sucursal(session, body)


@router.patch(
    "/usuarios-sucursal/{usuc_id}",
    response_model=UsuarioSucursalOut,
    status_code=200,
)
def actualizar_usuario_sucursal(
    usuc_id: uuid.UUID,
    body: UsuarioSucursalPatch,
    context: Annotated[PermissionContext, Depends(require_admin())],
    session: Annotated[Session, Depends(get_db)],
) -> UsuarioSucursalOut:
    return rbac_service.actualizar_usuario_sucursal(session, usuc_id, body)
