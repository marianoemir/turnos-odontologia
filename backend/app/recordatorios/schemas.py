"""Schemas de la API publica de recordatorios (C-07, D11).

El cuerpo expone solo `resultado`, `turno_id` e `inicio`: nunca nombre, DNI ni
contacto del paciente.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ResultadoToken = Literal["confirmado", "cancelado", "expirado"]


class ResolucionOut(BaseModel):
    resultado: ResultadoToken
    turno_id: uuid.UUID
    inicio: datetime
