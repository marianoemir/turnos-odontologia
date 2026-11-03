"""Schemas Pydantic de HC, odontograma y planes (C-09)."""

from __future__ import annotations

import uuid

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from backend.app.hc.models import ESTADOS_ITEM, ESTADOS_PLAN


class HistoriaClinicaCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    paciente_id: uuid.UUID
    antecedentes: str | None = None
    alergias: str | None = None
    observaciones: str | None = None


class HistoriaClinicaUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    antecedentes: str | None = None
    alergias: str | None = None
    observaciones: str | None = None


class HistoriaClinicaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    paciente_id: uuid.UUID
    antecedentes: str | None = None
    alergias: str | None = None
    observaciones: str | None = None
    creado_en: AwareDatetime


class EntradaHCCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    profesional_id: uuid.UUID
    fecha: AwareDatetime
    texto: str = Field(min_length=1)


class EntradaHCOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    historia_clinica_id: uuid.UUID
    profesional_id: uuid.UUID
    fecha: AwareDatetime
    texto: str
    creado_en: AwareDatetime


class OdontogramaCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    pieza: str = Field(pattern=r"^[1-4][1-8]$")
    estado: str
    profesional_id: uuid.UUID
    fecha: AwareDatetime


class OdontogramaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    paciente_id: uuid.UUID
    pieza: str
    estado: str
    profesional_id: uuid.UUID
    fecha: AwareDatetime
    creado_en: AwareDatetime


class PlanTratamientoCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    paciente_id: uuid.UUID
    profesional_id: uuid.UUID
    estado: str = "borrador"

    @field_validator("estado")
    @classmethod
    def _estado_valido(cls, v):
        if v not in ESTADOS_PLAN:
            raise ValueError("estado de plan fuera del set provisorio")
        return v


class PlanTratamientoUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    estado: str | None = None

    @field_validator("estado")
    @classmethod
    def _estado_valido(cls, v):
        if v is None:
            return v
        if v not in ESTADOS_PLAN:
            raise ValueError("estado de plan fuera del set provisorio")
        return v


class PlanItemCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    pieza: str = Field(pattern=r"^[1-4][1-8]$")
    prestacion_id: uuid.UUID
    estado: str = "pendiente"
    monto_centavos: int = Field(ge=0)
    monto_cobertura_centavos: int | None = Field(default=None, ge=0)

    @field_validator("estado")
    @classmethod
    def _estado_valido(cls, v):
        if v not in ESTADOS_ITEM:
            raise ValueError("estado de item fuera del set provisorio")
        return v


class PlanItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan_id: uuid.UUID
    pieza: str
    prestacion_id: uuid.UUID
    estado: str
    monto_centavos: int
    monto_cobertura_centavos: int | None = None


class PlanTratamientoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    paciente_id: uuid.UUID
    profesional_id: uuid.UUID
    estado: str
    creado_en: AwareDatetime
    items: list[PlanItemOut] = Field(default_factory=list)
    total_centavos: int = 0
    cobertura_centavos: int = 0