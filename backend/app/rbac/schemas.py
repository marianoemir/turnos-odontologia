"""Schemas RBAC (C-11 / D6/D6b).

Schema de request/response para los endpoints administrativos nuevos:
/roles, /sucursales, /usuarios-sucursal.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)

# --- Rol ---


class RolBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    descripcion: str | None = None


class RolCreate(RolBase):
    model_config = ConfigDict(extra="forbid")


class RolOut(RolBase):
    id: UUID
    activo: bool
    permisos: list[str] = Field(
        description="Capabilities derivadas de PERMISOS_POR_ROL para este rol. "
        "Solo lectura: no se persisten ni editan."
    )

    model_config = ConfigDict(from_attributes=True)


# --- Sucursal ---


class SucursalBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)
    direccion: str | None = None


class SucursalCreate(SucursalBase):
    model_config = ConfigDict(extra="forbid")


class SucursalOut(SucursalBase):
    id: UUID
    activo: bool

    model_config = ConfigDict(from_attributes=True)


# --- UsuarioSucursal ---


class UsuarioSucursalBase(BaseModel):
    usuario: str = Field(min_length=1, max_length=200)
    rol_id: UUID
    sucursal_id: UUID


class UsuarioSucursalCreate(UsuarioSucursalBase):
    model_config = ConfigDict(extra="forbid")


class UsuarioSucursalOut(UsuarioSucursalBase):
    id: UUID
    activo: bool
    creado_en: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Parches ---


class RolPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre: str | None = Field(default=None, min_length=1, max_length=100)
    descripcion: str | None = Field(default=None)
    activo: bool | None = None

    @field_validator("nombre", "descripcion", "activo", mode="before")
    @classmethod
    def rechazar_null(cls, v: object) -> object:
        if v is None:
            raise ValueError("Los campos no permiten valores nulos")
        return v


class SucursalPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre: str | None = Field(default=None, min_length=1, max_length=200)
    direccion: str | None = None
    activo: bool | None = None

    @field_validator("nombre", "direccion", "activo", mode="before")
    @classmethod
    def rechazar_null_patch(cls, v: object) -> object:
        if v is None:
            raise ValueError("Los campos no permiten valores nulos en PATCH")
        return v


class UsuarioSucursalPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rol_id: UUID | None = None
    sucursal_id: UUID | None = None
    activo: bool | None = None

    @field_validator("rol_id", "sucursal_id", "activo", mode="before")
    @classmethod
    def rechazar_null_us(cls, v: object) -> object:
        if v is None:
            raise ValueError("Los campos no permiten valores nulos en PATCH")
        return v