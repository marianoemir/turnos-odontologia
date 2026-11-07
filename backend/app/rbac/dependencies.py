"""Dependencias FastAPI de RBAC (C-11 / D2/D6).

Exponen `Depends(...)` para inyectar `PermissionContext` y exigir capacidades.

- `require_permission(capability)`: chequea que el rol del contexto tenga
  la capability. Lanza 403 `permiso_denegado` si no.
- `require_admin()`: alias de `require_permission("admin:gestionar")`.
- `require_role(*roles)`: envoltorio delgado que compara el rol del contexto
  contra los roles recibidos. No usado en los 9 endpoints de caja (usa
  capability en su lugar).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status

from backend.app.rbac.context import PermissionContext, get_permission_context
from backend.app.rbac.permissions import roles_con_permiso


def require_permission(capability: str) -> Callable[..., PermissionContext]:
    """Dependencia FastAPI que exige una capability específica.

    - Evalúa get_permission_context (resuelve headers X-Actor-Rol, etc.)
    - Si el rol del contexto NO tiene la capability → 403 permiso_denegado.
    - Si no hay identidad (default_compatibilidad) y la capability es de admin,
      también deniega (el default es recepcion, no admin).
    """

    def dependency(
        context: Annotated[PermissionContext, Depends(get_permission_context)],
    ) -> PermissionContext:
        permisos = roles_con_permiso(capability)
        if context.rol not in permisos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "causa": "permiso_denegado",
                    "detalle": f"Rol {context.rol} no puede {capability}",
                },
            )
        return context

    return dependency


def require_admin() -> Callable[..., PermissionContext]:
    """Alias de require_permission('admin:gestionar').

    Usado por superficies administrativas: /roles, /sucursales,
    /usuarios-sucursal, /export.
    """
    return require_permission("admin:gestionar")


def require_role(*roles: str) -> Callable[..., PermissionContext]:
    """Envoltorio delgado: compara el rol del contexto contra los roles dados.

    No se usa en los 9 endpoints de caja (donde la capability es la fuente),
    pero está disponible para dependencias ad hoc.
    """

    def dependency(
        context: Annotated[PermissionContext, Depends(get_permission_context)],
    ) -> PermissionContext:
        if context.rol not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "causa": "permiso_denegado",
                    "detalle": f"Rol {context.rol} no tiene acceso",
                },
            )
        return context

    return dependency