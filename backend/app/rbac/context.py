"""PermissionContext: identidad resuelta exclusivamente por JWT (C-24).

Resuelve Authorization: Bearer <token>. Sin token válido responde 401.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated, Literal

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.app.auth.config import get_auth_settings
from backend.app.auth.models import Usuario
from backend.app.db import get_session
from backend.app.rbac.models import Rol, UsuarioSucursal
from backend.app.rbac.permissions import ROLES


def get_sucursal_session() -> Iterator[Session]:
    """Sesión incondicional para validar usuario y sucursal en cada request."""
    session = get_session()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@dataclass(frozen=True)
class PermissionContext:
    """Contexto de identidad y autorización resuelto desde el JWT."""

    rol: str
    usuario: str | None
    sucursal_id: uuid.UUID | None
    origen: Literal["jwt"]


def get_permission_context(
    request: Request,
    session: Annotated[Session, Depends(get_sucursal_session)],
) -> PermissionContext:
    auth_header = request.headers.get("Authorization")

    if not auth_header or not auth_header.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
            detail={
                "causa": "token_ausente",
                "detalle": "Cabecera Authorization: Bearer ausente o vacía",
            },
        )

    partes = auth_header.split()
    if len(partes) != 2 or partes[0].lower() != "bearer" or not partes[1].strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
            detail={
                "causa": "token_ausente",
                "detalle": "Formato inválido de cabecera Authorization (esperado: Bearer <token>)",
            },
        )

    raw_token = partes[1].strip()
    settings = get_auth_settings()

    try:
        payload = jwt.decode(
            raw_token,
            settings.secret_key,
            algorithms=[settings.algorithm],
            options={"require": ["sub", "rol", "exp"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
            detail={
                "causa": "token_expirado",
                "detalle": "El token JWT ha expirado",
            },
        ) from None
    except jwt.MissingRequiredClaimError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
            detail={
                "causa": "token_incompleto",
                "detalle": f"Falta claim obligatorio: {exc}",
            },
        ) from None
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
            detail={
                "causa": "token_invalido",
                "detalle": "Firma o estructura de token JWT inválida",
            },
        ) from None

    # Validar sub y rol en base
    try:
        sub_uuid = uuid.UUID(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
            detail={
                "causa": "token_invalido",
                "detalle": "Claim sub debe ser un UUID válido",
            },
        ) from None

    rol_claim = payload.get("rol")
    if rol_claim not in ROLES:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
            detail={
                "causa": "sesion_invalida",
                "detalle": f"Rol '{rol_claim}' no reconocido",
            },
        )

    usuario_db = session.query(Usuario).filter_by(id=sub_uuid).first()
    if not usuario_db or not usuario_db.activo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
            detail={
                "causa": "sesion_invalida",
                "detalle": "El usuario no existe o se encuentra inactivo",
            },
        )

    # Validar que el rol no haya cambiado
    rol_db = session.query(Rol).filter_by(id=usuario_db.rol_id).first()
    if not rol_db or rol_db.nombre != rol_claim:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
            detail={
                "causa": "sesion_invalida",
                "detalle": "El rol del usuario ha cambiado",
            },
        )

    # Validar sucursal si viene en el claim
    sucursal_final = None
    if "sucursal_id" in payload and payload["sucursal_id"] is not None:
        try:
            sucursal_final = uuid.UUID(payload["sucursal_id"])
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                headers={"WWW-Authenticate": "Bearer"},
                detail={
                    "causa": "token_invalido",
                    "detalle": "sucursal_id en token no es un UUID válido",
                },
            ) from None

        asoc = (
            session.query(UsuarioSucursal)
            .filter_by(
                usuario=usuario_db.dni,
                sucursal_id=sucursal_final,
                activo=True,
            )
            .first()
        )
        if not asoc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                headers={"WWW-Authenticate": "Bearer"},
                detail={
                    "causa": "sesion_invalida",
                    "detalle": "El usuario ya no está asociado a la sucursal del token",
                },
            )

    return PermissionContext(
        rol=rol_claim,
        usuario=usuario_db.dni,
        sucursal_id=sucursal_final,
        origen="jwt",
    )


def get_permission_context_opcional(
    request: Request,
    session: Annotated[Session, Depends(get_sucursal_session)],
) -> PermissionContext | None:
    """Resuelve PermissionContext si viene header Authorization, o None si no viene.
    
    Si viene token pero es inválido o expirado, eleva HTTPException 401 normalmente.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None
    return get_permission_context(request, session)

