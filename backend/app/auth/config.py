"""Configuración segura de autenticación JWT."""

from __future__ import annotations

import os
from dataclasses import dataclass

VALOR_EJEMPLO_RECHAZADO = "cambiar-en-produccion-solo-env"
LONGITUD_MINIMA_SECRET = 32
ALGORITMO_JWT = "HS256"


class AuthConfigError(Exception):
    """Error al cargar o validar la configuración de autenticación."""


@dataclass(frozen=True)
class AuthSettings:
    secret_key: str
    algorithm: str = ALGORITMO_JWT
    access_token_expires_min: int = 60


def get_auth_settings() -> AuthSettings:
    secret = os.environ.get("SECRET_KEY")
    if not secret:
        raise AuthConfigError("SECRET_KEY no está definida o está vacía")

    if secret == VALOR_EJEMPLO_RECHAZADO:
        raise AuthConfigError("SECRET_KEY no puede ser el valor de ejemplo")

    if len(secret) < LONGITUD_MINIMA_SECRET:
        raise AuthConfigError(
            f"SECRET_KEY debe tener al menos {LONGITUD_MINIMA_SECRET} caracteres"
        )

    try:
        expires_min = int(os.environ.get("ACCESS_TOKEN_EXPIRES_MIN", "60"))
    except ValueError:
        expires_min = 60

    return AuthSettings(
        secret_key=secret,
        algorithm=ALGORITMO_JWT,
        access_token_expires_min=expires_min,
    )
