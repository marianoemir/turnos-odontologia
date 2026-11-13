"""Módulo de hashing y verificación de contraseñas con PBKDF2 HMAC SHA-256."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import secrets

ESQUEMA = "pbkdf2_sha256"
ITERACIONES_DEFAULT = 600000
SAL_BYTES = 16


def hashear_password(password: str, iteraciones: int = ITERACIONES_DEFAULT) -> str:
    """Calcula el hash PBKDF2-HMAC-SHA256 con una sal aleatoria."""
    sal = secrets.token_bytes(SAL_BYTES)
    hash_bytes = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), sal, iteraciones
    )
    sal_b64 = base64.b64encode(sal).decode("ascii")
    hash_b64 = base64.b64encode(hash_bytes).decode("ascii")
    return f"{ESQUEMA}${iteraciones}${sal_b64}${hash_b64}"


def verificar_password(password: str, hash_almacenado: str) -> bool:
    """Verifica una contraseña contra su hash en tiempo constante."""
    try:
        esquema, iteraciones_str, sal_b64, hash_b64 = hash_almacenado.split("$")
        if esquema != ESQUEMA:
            return False
        iteraciones = int(iteraciones_str)
        sal = base64.b64decode(sal_b64.encode("ascii"))
        hash_esperado = base64.b64decode(hash_b64.encode("ascii"))
    except (ValueError, TypeError, binascii.Error):
        return False

    hash_calculado = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), sal, iteraciones
    )
    return hmac.compare_digest(hash_calculado, hash_esperado)
