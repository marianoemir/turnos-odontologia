"""Modelos RBAC (C-11): roles, sucursales y asociación usuario-sucursal.

- `Rol`: catálogo de roles con permisos derivados de PERMISOS_POR_ROL.
- `Sucursal`: catálogo de sucursales.
- `UsuarioSucursal`: asociación usuario+rol+sucursal (única por usuario+sucursal).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db import Base


class Rol(Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    creado_en: Mapped[datetime] = mapped_column(
        nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        UniqueConstraint("nombre", name="uq_roles_nombre"),
    )


class Sucursal(Base):
    __tablename__ = "sucursales"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    direccion: Mapped[str | None] = mapped_column(Text, nullable=True)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    creado_en: Mapped[datetime] = mapped_column(
        nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        UniqueConstraint("nombre", name="uq_sucursales_nombre"),
    )


class UsuarioSucursal(Base):
    __tablename__ = "usuarios_sucursal"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    usuario: Mapped[str] = mapped_column(String(200), nullable=False)
    rol_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False
    )
    sucursal_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("sucursales.id", ondelete="RESTRICT"), nullable=False
    )
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    creado_en: Mapped[datetime] = mapped_column(
        nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        UniqueConstraint("usuario", "sucursal_id", name="uq_usuarios_sucursal_usuario_sucursal"),
        # Índice separado para búsquedas por usuario
        # (SQLAlchemy create_index se hará en la migración 007)
    )