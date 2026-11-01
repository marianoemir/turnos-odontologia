"""GET /agenda (C-05, solo lectura)."""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.agenda.schemas import AgendaItemOut
from backend.app.agenda.service import ServicioAgenda
from backend.app.turnos.router import get_db

router = APIRouter()


@router.get("/agenda", response_model=list[AgendaItemOut])
def obtener_agenda(
    profesional: UUID, fecha: date, db: Annotated[Session, Depends(get_db)]
):
    return ServicioAgenda.agenda_del_dia(db, profesional, fecha)
