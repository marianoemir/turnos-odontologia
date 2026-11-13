"""Seed ficticio de usuario administrador para pruebas (C-24, Grupo 6).

Crea un usuario ficticio DNI 'USUARIO-FICT-001' con rol 'admin'.
Solo se ejecuta si SEED_FICTICIO == 'true'.
La contraseña se lee de SEED_USUARIO_PASSWORD; si no está definida, genera una
al azar con secrets.token_urlsafe y la imprime por salida estándar.
No contiene contraseñas literales.
"""

from __future__ import annotations

import os
import secrets
from typing import Any

from sqlalchemy.orm import Session

from backend.app.auth.models import Usuario
from backend.app.auth.password import hashear_password
from backend.app.rbac.models import Rol

DNI_FICTICIO = "USUARIO-FICT-001"
ROL_FICTICIO = "admin"


def seed_usuario(session: Session) -> dict[str, Any]:
    """Crea el usuario ficticio si SEED_FICTICIO == 'true' y no existe aún."""
    if os.environ.get("SEED_FICTICIO") != "true":
        return {"creado": False, "motivo": "SEED_FICTICIO != 'true'"}

    existe = session.query(Usuario).filter_by(dni=DNI_FICTICIO).first()
    if existe is not None:
        return {"creado": False, "dni": DNI_FICTICIO, "motivo": "ya_existe"}

    rol = session.query(Rol).filter_by(nombre=ROL_FICTICIO).first()
    if not rol:
        rol = Rol(nombre=ROL_FICTICIO, descripcion="Administrador del sistema")
        session.add(rol)
        session.flush()

    raw_password = os.environ.get("SEED_USUARIO_PASSWORD")
    if not raw_password:
        raw_password = secrets.token_urlsafe(16)
        print(f"Seed usuario creado: DNI={DNI_FICTICIO} | Password={raw_password}")

    usuario = Usuario(
        dni=DNI_FICTICIO,
        password_hash=hashear_password(raw_password),
        rol_id=rol.id,
        activo=True,
    )
    session.add(usuario)
    session.flush()

    return {"creado": True, "dni": DNI_FICTICIO, "rol": ROL_FICTICIO}
