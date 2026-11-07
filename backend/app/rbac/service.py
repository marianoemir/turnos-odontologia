"""Servicio RBAC (C-11): lógica de roles, sucursales y usuarios-sucursal.

El router queda delgado: solo declara endpoints y delega aquí, mismo
patrón que `agenda/service_catalogo.py` en C-12. Los permisos se derivan
de `PERMISOS_POR_ROL` (única fuente, D2): roles canónicos exponen sus
capabilities y los roles no canónicos exponen `[]`.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.rbac.models import Rol, Sucursal, UsuarioSucursal
from backend.app.rbac.permissions import PERMISOS_POR_ROL
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


def permisos_de_rol(nombre: str) -> list[str]:
    """Capabilities derivadas de PERMISOS_POR_ROL; `[]` si no canónico."""
    return sorted(PERMISOS_POR_ROL.get(nombre, frozenset()))


def _rol_out(rol: Rol) -> RolOut:
    return RolOut(
        id=rol.id,
        nombre=rol.nombre,
        descripcion=rol.descripcion,
        activo=rol.activo,
        permisos=permisos_de_rol(rol.nombre),
    )


def listar_roles(session: Session, incluir_inactivos: bool = False) -> list[RolOut]:
    query = session.query(Rol)
    if not incluir_inactivos:
        query = query.filter(Rol.activo.is_(True))
    return [_rol_out(rol) for rol in query.order_by(Rol.nombre.asc(), Rol.id.asc()).all()]


def crear_rol(session: Session, body: RolCreate) -> RolOut:
    existente = session.query(Rol).filter_by(nombre=body.nombre).first()
    if existente is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"causa": "duplicate_nombre_rol"},
        )
    rol = Rol(nombre=body.nombre, descripcion=body.descripcion, activo=True)
    session.add(rol)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"causa": "duplicate_nombre_rol"},
        ) from exc
    return _rol_out(rol)


ROLES_CANONICOS = ("admin", "recepcion", "odontologo", "paciente")


def actualizar_rol(session: Session, rol_id: uuid.UUID, body: RolPatch) -> RolOut:
    rol = session.query(Rol).filter_by(id=rol_id).first()
    if rol is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rol {rol_id} no encontrado",
        )
    datos = body.model_dump(exclude_unset=True)

    if rol.nombre in ROLES_CANONICOS:
        if "nombre" in datos and datos["nombre"] != rol.nombre:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"causa": "rol_canonico_protegido"},
            )
        if datos.get("activo") is False:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"causa": "rol_canonico_protegido"},
            )

    nuevo_nombre = datos.get("nombre")
    if nuevo_nombre is not None and nuevo_nombre != rol.nombre:
        duplicado = session.query(Rol).filter_by(nombre=nuevo_nombre).first()
        if duplicado is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"causa": "duplicate_nombre_rol"},
            )

    for campo, valor in datos.items():
        setattr(rol, campo, valor)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"causa": "duplicate_nombre_rol"},
        ) from exc
    return _rol_out(rol)


def listar_sucursales(
    session: Session, incluir_inactivos: bool = False
) -> list[SucursalOut]:
    query = session.query(Sucursal)
    if not incluir_inactivos:
        query = query.filter(Sucursal.activo.is_(True))
    return query.order_by(Sucursal.nombre.asc(), Sucursal.id.asc()).all()


def crear_sucursal(session: Session, body: SucursalCreate) -> SucursalOut:
    existente = session.query(Sucursal).filter_by(nombre=body.nombre).first()
    if existente is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"causa": "duplicate_nombre_sucursal"},
        )
    sucursal = Sucursal(
        nombre=body.nombre, direccion=body.direccion, activo=True
    )
    session.add(sucursal)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"causa": "duplicate_nombre_sucursal"},
        ) from exc
    return SucursalOut(
        id=sucursal.id,
        nombre=sucursal.nombre,
        direccion=sucursal.direccion,
        activo=sucursal.activo,
    )


def actualizar_sucursal(
    session: Session, sucursal_id: uuid.UUID, body: SucursalPatch
) -> SucursalOut:
    sucursal = session.query(Sucursal).filter_by(id=sucursal_id).first()
    if sucursal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sucursal {sucursal_id} no encontrada",
        )
    datos = body.model_dump(exclude_unset=True)
    nuevo_nombre = datos.get("nombre")
    if nuevo_nombre is not None and nuevo_nombre != sucursal.nombre:
        duplicado = (
            session.query(Sucursal).filter_by(nombre=nuevo_nombre).first()
        )
        if duplicado is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"causa": "duplicate_nombre_sucursal"},
            )
    for campo, valor in datos.items():
        setattr(sucursal, campo, valor)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"causa": "duplicate_nombre_sucursal"},
        ) from exc
    return SucursalOut(
        id=sucursal.id,
        nombre=sucursal.nombre,
        direccion=sucursal.direccion,
        activo=sucursal.activo,
    )


def _parse_uuid_filtro(valor: str, nombre: str) -> uuid.UUID:
    try:
        return uuid.UUID(valor)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{nombre} debe ser un UUID válido",
        ) from None


def listar_usuarios_sucursal(
    session: Session,
    sucursal_id: str | None = None,
    rol_id: str | None = None,
    usuario: str | None = None,
    incluir_inactivos: bool = False,
) -> list[UsuarioSucursalOut]:
    query = session.query(UsuarioSucursal)
    if sucursal_id is not None:
        sucursal_uuid = _parse_uuid_filtro(sucursal_id, "sucursal_id")
        existe = session.query(Sucursal).filter_by(id=sucursal_uuid).first()
        if existe is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sucursal {sucursal_uuid} no encontrada",
            )
        query = query.filter(UsuarioSucursal.sucursal_id == sucursal_uuid)
    if rol_id is not None:
        rol_uuid = _parse_uuid_filtro(rol_id, "rol_id")
        existe = session.query(Rol).filter_by(id=rol_uuid).first()
        if existe is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Rol {rol_uuid} no encontrado",
            )
        query = query.filter(UsuarioSucursal.rol_id == rol_uuid)
    if usuario is not None:
        query = query.filter(UsuarioSucursal.usuario == usuario)
    if not incluir_inactivos:
        query = query.filter(UsuarioSucursal.activo.is_(True))
    return (
        query.order_by(UsuarioSucursal.usuario.asc(), UsuarioSucursal.id.asc())
        .all()
    )


def crear_usuario_sucursal(
    session: Session, body: UsuarioSucursalCreate
) -> UsuarioSucursalOut:
    rol = session.query(Rol).filter_by(id=body.rol_id).first()
    if rol is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rol {body.rol_id} no encontrado",
        )
    sucursal = session.query(Sucursal).filter_by(id=body.sucursal_id).first()
    if sucursal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sucursal {body.sucursal_id} no encontrada",
        )
    duplicado = (
        session.query(UsuarioSucursal)
        .filter_by(usuario=body.usuario, sucursal_id=body.sucursal_id)
        .first()
    )
    if duplicado is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"causa": "duplicate_usuario_sucursal"},
        )
    usuario_sucursal = UsuarioSucursal(
        usuario=body.usuario,
        rol_id=body.rol_id,
        sucursal_id=body.sucursal_id,
        activo=True,
    )
    session.add(usuario_sucursal)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"causa": "duplicate_usuario_sucursal"},
        ) from exc
    return UsuarioSucursalOut(
        id=usuario_sucursal.id,
        usuario=usuario_sucursal.usuario,
        rol_id=usuario_sucursal.rol_id,
        sucursal_id=usuario_sucursal.sucursal_id,
        activo=usuario_sucursal.activo,
        creado_en=usuario_sucursal.creado_en,
    )


def actualizar_usuario_sucursal(
    session: Session,
    usuc_id: uuid.UUID,
    body: UsuarioSucursalPatch,
) -> UsuarioSucursalOut:
    usuario_sucursal = (
        session.query(UsuarioSucursal).filter_by(id=usuc_id).first()
    )
    if usuario_sucursal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Usuario-sucursal {usuc_id} no encontrado",
        )
    datos = body.model_dump(exclude_unset=True)

    nuevo_rol_id = datos.get("rol_id")
    if nuevo_rol_id is not None:
        rol = session.query(Rol).filter_by(id=nuevo_rol_id).first()
        if rol is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Rol {nuevo_rol_id} no encontrado",
            )
    nuevo_sucursal_id = datos.get("sucursal_id")
    if nuevo_sucursal_id is not None:
        sucursal = session.query(Sucursal).filter_by(id=nuevo_sucursal_id).first()
        if sucursal is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sucursal {nuevo_sucursal_id} no encontrada",
            )

    sucursal_final = nuevo_sucursal_id or usuario_sucursal.sucursal_id
    if (
        nuevo_sucursal_id is not None
        and nuevo_sucursal_id != usuario_sucursal.sucursal_id
    ):
        duplicado = (
            session.query(UsuarioSucursal)
            .filter_by(usuario=usuario_sucursal.usuario, sucursal_id=sucursal_final)
            .first()
        )
        if duplicado is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"causa": "duplicate_usuario_sucursal"},
            )

    for campo, valor in datos.items():
        setattr(usuario_sucursal, campo, valor)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"causa": "duplicate_usuario_sucursal"},
        ) from exc
    return UsuarioSucursalOut(
        id=usuario_sucursal.id,
        usuario=usuario_sucursal.usuario,
        rol_id=usuario_sucursal.rol_id,
        sucursal_id=usuario_sucursal.sucursal_id,
        activo=usuario_sucursal.activo,
        creado_en=usuario_sucursal.creado_en,
    )