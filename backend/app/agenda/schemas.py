"""Schemas de lectura de la agenda (C-05) y catálogo de recursos (C-12)."""

from __future__ import annotations

from datetime import time
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


class AgendaItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    inicio: AwareDatetime
    fin: AwareDatetime
    estado: str
    paciente_nombre: str
    prestacion_nombre: str
    sillon_nombre: str


# ============================================================================
# Schemas de Catálogo de Recursos (C-12)
# ============================================================================

# --- Paciente ---


class PacienteCreate(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)
    dni: str = Field(min_length=1, max_length=32)
    contacto: str | None = None
    ficticio: bool = True


class PacientePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre: str | None = Field(default=None, min_length=1, max_length=200)
    dni: str | None = Field(default=None, min_length=1, max_length=32)
    contacto: str | None = None
    activo: bool | None = None

    @field_validator("nombre", "dni", "activo", mode="before")
    @classmethod
    def rechazar_null(cls, v: object) -> object:
        if v is None:
            raise ValueError("El campo no permite valores nulos")
        return v


class PacienteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nombre: str
    dni: str
    contacto: str | None = None
    ficticio: bool
    activo: bool


class PacientesEnvelopeOut(BaseModel):
    items: list[PacienteOut]
    total: int
    limit: int
    offset: int


# --- Profesional ---


class ProfesionalCreate(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)
    matricula: str = Field(min_length=1, max_length=32)


class ProfesionalPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre: str | None = Field(default=None, min_length=1, max_length=200)
    matricula: str | None = Field(default=None, min_length=1, max_length=32)
    activo: bool | None = None

    @field_validator("nombre", "matricula", "activo", mode="before")
    @classmethod
    def rechazar_null(cls, v: object) -> object:
        if v is None:
            raise ValueError("El campo no permite valores nulos")
        return v


class ProfesionalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nombre: str
    matricula: str
    activo: bool


# --- Sillon ---


class SillonCreate(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)


class SillonPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre: str | None = Field(default=None, min_length=1, max_length=100)
    activo: bool | None = None

    @field_validator("nombre", "activo", mode="before")
    @classmethod
    def rechazar_null(cls, v: object) -> object:
        if v is None:
            raise ValueError("El campo no permite valores nulos")
        return v


class SillonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nombre: str
    activo: bool


# --- Prestacion ---


class PrestacionCreate(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    duracion_min: int = Field(gt=0)


class PrestacionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre: str | None = Field(default=None, min_length=1, max_length=100)
    duracion_min: int | None = Field(default=None, gt=0)
    activo: bool | None = None

    @field_validator("nombre", "duracion_min", "activo", mode="before")
    @classmethod
    def rechazar_null(cls, v: object) -> object:
        if v is None:
            raise ValueError("El campo no permite valores nulos")
        return v


class PrestacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nombre: str
    duracion_min: int
    activo: bool


# --- Horario de Atención ---


class HorarioCreate(BaseModel):
    profesional_id: UUID
    dia_semana: int = Field(ge=0, le=6)
    desde: time
    hasta: time

    @model_validator(mode="after")
    def validar_rango(self) -> HorarioCreate:
        if self.desde >= self.hasta:
            raise ValueError("desde debe ser menor que hasta")
        return self


class HorarioPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dia_semana: int | None = Field(default=None, ge=0, le=6)
    desde: time | None = None
    hasta: time | None = None
    activo: bool | None = None

    @field_validator("dia_semana", "desde", "hasta", "activo", mode="before")
    @classmethod
    def rechazar_null(cls, v: object) -> object:
        if v is None:
            raise ValueError("El campo no permite valores nulos")
        return v


class HorarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profesional_id: UUID
    dia_semana: int
    desde: time
    hasta: time
    activo: bool


# --- Bloqueo ---


class BloqueoCreate(BaseModel):
    profesional_id: UUID | None = None
    sillon_id: UUID | None = None
    desde: AwareDatetime
    hasta: AwareDatetime
    motivo: str = Field(min_length=1)

    @model_validator(mode="after")
    def validar_rango(self) -> BloqueoCreate:
        if self.desde >= self.hasta:
            raise ValueError("desde debe ser menor que hasta")
        return self


class BloqueoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profesional_id: UUID | None = None
    sillon_id: UUID | None = None
    desde: AwareDatetime
    hasta: AwareDatetime
    motivo: str
