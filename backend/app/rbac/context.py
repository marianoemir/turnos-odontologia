"""PermissionContext: identidad por header con default de compatibilidad (D1/D9).

Resuelve X-Actor-Rol (y opcionales X-Actor-Usuario, X-Sucursal-Id).

- Header de rol presente y valido -> origen="header".
- Header de rol ausente -> rol="recepcion", origen="default_compatibilidad".
- Rol desconocido (comparacion exacta, case-sensitive, sin recortar) -> 422.
- X-Sucursal-Id: formato invalido -> 422; UUID inexistente en `sucursales`
  -> 422 (la sesion se inyecta como dependencia para que los tests la
  sobreescriban con `db_session`). Un error de la base se propaga como 500.
- Sin X-Sucursal-Id no se abre ninguna sesion ni se consulta la base.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.db import get_session
from backend.app.rbac.models import Sucursal
from backend.app.rbac.permissions import ROLES


def get_sucursal_session(
    sucursal_header: Annotated[str | None, Header(alias="X-Sucursal-Id")] = None,
) -> Iterator[Session | None]:
    """Sesion solo si la request trae X-Sucursal-Id; None en caso contrario.

    Mismo patron generador que los `get_db` de C-10/C-12 (commit al salir,
    rollback ante excepcion, close siempre). Sin el header no se crea
    ninguna sesion: la base no se toca.
    """
    if sucursal_header is None:
        yield None
        return
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
    """Contexto de identidad y autorizacion resuelto de los headers."""

    rol: str
    usuario: str | None
    sucursal_id: uuid.UUID | None
    origen: Literal["header", "default_compatibilidad"]


def get_permission_context(
    session: Annotated[Session | None, Depends(get_sucursal_session)],
    rol_actor: Annotated[str | None, Header(alias="X-Actor-Rol")] = None,
    usuario: Annotated[str | None, Header(alias="X-Actor-Usuario")] = None,
    sucursal_header: Annotated[str | None, Header(alias="X-Sucursal-Id")] = None,
) -> PermissionContext:
    sucursal_uuid: uuid.UUID | None = None
    if sucursal_header is not None:
        try:
            sucursal_uuid = uuid.UUID(sucursal_header)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "causa": "sucursal_invalida",
                    "detalle": "X-Sucursal-Id debe ser un UUID valido",
                },
            ) from None
        existe = (
            session is not None
            and session.query(Sucursal).filter_by(id=sucursal_uuid).first()
            is not None
        )
        if not existe:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "causa": "sucursal_invalida",
                    "detalle": "X-Sucursal-Id no corresponde a una sucursal existente",
                },
            )

    if rol_actor is None:
        return PermissionContext(
            rol="recepcion",
            usuario=usuario,
            sucursal_id=sucursal_uuid,
            origen="default_compatibilidad",
        )

    if rol_actor not in ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "causa": "rol_desconocido",
                "detalle": f"Rol '{rol_actor}' no reconocido",
            },
        )

    return PermissionContext(
        rol=rol_actor,
        usuario=usuario,
        sucursal_id=sucursal_uuid,
        origen="header",
    )
