"""Schemas de lectura de la agenda (C-05)."""

from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict


class AgendaItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    inicio: AwareDatetime
    fin: AwareDatetime
    estado: str
    paciente_nombre: str
    prestacion_nombre: str
    sillon_nombre: str
