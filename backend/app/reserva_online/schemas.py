from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict


class SlotOut(BaseModel):
    inicio: datetime
    fin: datetime


class ReservaCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    nombre: str
    dni: str
    contacto: str | None = None
    profesional_id: uuid.UUID
    prestacion_id: uuid.UUID
    inicio: AwareDatetime


class ReservaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    turno_id: uuid.UUID
    profesional_id: uuid.UUID
    prestacion_id: uuid.UUID
    inicio: datetime
    fin: datetime
    estado: str
