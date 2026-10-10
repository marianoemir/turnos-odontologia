"""Schemas POST /turnos (C-03): entrada sin `fin` (RN-AG-01, el
servidor lo calcula e ignora cualquier `fin` del cliente)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict


class TurnoCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    paciente_id: uuid.UUID
    profesional_id: uuid.UUID
    sillon_id: uuid.UUID
    prestacion_id: uuid.UUID
    inicio: AwareDatetime
    creado_por: str | None = None


class TurnoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    paciente_id: uuid.UUID
    profesional_id: uuid.UUID
    sillon_id: uuid.UUID
    prestacion_id: uuid.UUID
    inicio: datetime
    fin: datetime
    estado: str
    creado_por: str | None = None
