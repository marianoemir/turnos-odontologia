from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict


class ListaEsperaCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    paciente_id: uuid.UUID
    profesional_id: uuid.UUID | None = None
    prestacion_id: uuid.UUID


class ListaEsperaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    paciente_id: uuid.UUID
    profesional_id: uuid.UUID | None
    prestacion_id: uuid.UUID
    creado_en: datetime
    estado: str
    turno_id: uuid.UUID | None = None


class OfrecerHueco(BaseModel):
    model_config = ConfigDict(extra="ignore")
    inicio: AwareDatetime
    profesional_id: uuid.UUID
    sillon_id: uuid.UUID


class RespuestaPaciente(BaseModel):
    model_config = ConfigDict(extra="ignore")
    acepta: bool