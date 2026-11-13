"""Servicio de emisión y verificación de JWT (C-24)."""

from __future__ import annotations

import datetime
import uuid

import jwt

from backend.app.auth.config import get_auth_settings

# Hash de relleno para mitigar timing attacks cuando el DNI no existe
HASH_RELLENO = "pbkdf2_sha256$600000$c2FsX2RlX3JlbGxlbm8=$aGFzaF9kZV9yZWxsZW5vX2ZpY3RpY2lvXzMyYnl0ZXM="


def emitir_token(
    usuario_id: uuid.UUID,
    rol: str,
    sucursal_id: uuid.UUID | None = None,
) -> str:
    """Emite un JWT firmado con HS256 conteniendo claims requeridos."""
    settings = get_auth_settings()
    ahora = datetime.datetime.now(datetime.UTC)
    exp = ahora + datetime.timedelta(minutes=settings.access_token_expires_min)

    payload: dict = {
        "sub": str(usuario_id),
        "rol": rol,
        "iat": int(ahora.timestamp()),
        "exp": int(exp.timestamp()),
    }
    if sucursal_id is not None:
        payload["sucursal_id"] = str(sucursal_id)

    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
