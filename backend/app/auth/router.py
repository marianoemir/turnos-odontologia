"""Router de autenticación (C-24): POST /login con rate limit en memoria."""

from __future__ import annotations

import os
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.app.auth.jwt_service import HASH_RELLENO, emitir_token
from backend.app.auth.models import Usuario
from backend.app.auth.password import verificar_password
from backend.app.auth.schemas import LoginRequest, LoginResponse
from backend.app.db import get_session
from backend.app.rbac.models import Rol, UsuarioSucursal

router = APIRouter(tags=["auth"])

# Rate limit de intentos fallidos por IP en memoria
_RATE_LIMIT_LOGIN: dict[str, list[float]] = {}


def get_db():
    session = get_session()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _comprobar_rate_limit(request: Request) -> None:
    limite = int(os.environ.get("AUTH_RATE_LIMIT_N", "5"))
    ventana = int(os.environ.get("AUTH_RATE_LIMIT_VENTANA_SEG", "600"))
    ahora = time.monotonic()
    ip = request.client.host if request.client else "unknown"

    eventos = _RATE_LIMIT_LOGIN.get(ip, [])
    corte = ahora - ventana
    eventos = [t for t in eventos if t > corte]
    _RATE_LIMIT_LOGIN[ip] = eventos

    if len(eventos) >= limite:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "causa": "limite_intentos_superado",
                "detalle": f"Demasiados intentos fallidos. Espere {ventana} segundos.",
            },
        )


def _registrar_intento_fallido(request: Request) -> None:
    ahora = time.monotonic()
    ip = request.client.host if request.client else "unknown"
    eventos = _RATE_LIMIT_LOGIN.get(ip, [])
    eventos.append(ahora)
    _RATE_LIMIT_LOGIN[ip] = eventos


@router.post("/login", response_model=LoginResponse, status_code=status.HTTP_200_OK)
def login(
    request: Request,
    body: LoginRequest,
    session: Annotated[Session, Depends(get_db)],
) -> LoginResponse:
    # 1. Comprobar rate limit
    _comprobar_rate_limit(request)

    # 2. Buscar usuario
    usuario = session.query(Usuario).filter_by(dni=body.dni).first()

    if usuario is None:
        # Timing attack mitigation: calcular hash contra relleno
        verificar_password(body.password, HASH_RELLENO)
        _registrar_intento_fallido(request)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "causa": "credenciales_invalidas",
                "detalle": "DNI o contraseña incorrectos",
            },
        )

    # 3. Verificar contraseña
    pwd_valida = verificar_password(body.password, usuario.password_hash)
    if not pwd_valida:
        _registrar_intento_fallido(request)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "causa": "credenciales_invalidas",
                "detalle": "DNI o contraseña incorrectos",
            },
        )

    # 4. Verificar cuenta activa
    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "causa": "cuenta_inactiva",
                "detalle": "La cuenta del usuario se encuentra inactiva",
            },
        )

    # 5. Resolver rol
    rol_obj = session.query(Rol).filter_by(id=usuario.rol_id).first()
    rol_nombre = rol_obj.nombre if rol_obj else "recepcion"

    # 6. Resolver sucursales asociadas
    asociaciones = (
        session.query(UsuarioSucursal)
        .filter_by(usuario=usuario.dni, activo=True)
        .all()
    )
    sucursales_activas = [a.sucursal_id for a in asociaciones]

    sucursal_final = None
    if len(sucursales_activas) == 1:
        sucursal_final = sucursales_activas[0]
    elif len(sucursales_activas) > 1:
        if body.sucursal_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "causa": "sucursal_requerida",
                    "detalle": "Debe especificar una sucursal_id entre las asociadas",
                },
            )
        if body.sucursal_id not in sucursales_activas:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "causa": "sucursal_no_asociada",
                    "detalle": "El usuario no está asociado a la sucursal indicada",
                },
            )
        sucursal_final = body.sucursal_id

    # 7. Emitir token
    token = emitir_token(usuario.id, rol_nombre, sucursal_final)

    return LoginResponse(
        token=token,
        rol=rol_nombre,
        usuario=usuario.dni,
        sucursal_id=sucursal_final,
    )
