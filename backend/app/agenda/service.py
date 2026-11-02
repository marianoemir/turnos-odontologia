"""Lectura de la agenda diaria de un profesional (C-05, solo lectura)."""

from datetime import date, datetime, time, timedelta
from uuid import UUID

from sqlalchemy import String, cast, select
from sqlalchemy.orm import Session

from backend.app.agenda.models import (
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
)
from backend.app.turnos.models import Turno
from backend.app.turnos.service import ZONA


class ProfesionalNoEncontrado(Exception):
    """Profesional inexistente -> 404."""

    def __init__(self, profesional_id: UUID):
        self.detalle = f"profesional no existe: {profesional_id}"
        super().__init__(self.detalle)


class ServicioAgenda:
    @staticmethod
    def agenda_del_dia(
        session: Session, profesional_id: UUID, fecha: date
    ) -> list[dict]:
        """Turnos del profesional en el dia local [00:00, 24:00) de ZONA."""
        if session.get(Profesional, profesional_id) is None:
            raise ProfesionalNoEncontrado(profesional_id)
        desde = datetime.combine(fecha, time.min, tzinfo=ZONA)
        hasta = datetime.combine(
            fecha + timedelta(days=1), time.min, tzinfo=ZONA
        )
        consulta = (
            select(
                Turno.id,
                Turno.inicio,
                Turno.fin,
                cast(Turno.estado, String).label("estado"),
                Paciente.nombre.label("paciente_nombre"),
                Prestacion.nombre.label("prestacion_nombre"),
                SillonBox.nombre.label("sillon_nombre"),
            )
            .join(Paciente, Paciente.id == Turno.paciente_id)
            .join(Prestacion, Prestacion.id == Turno.prestacion_id)
            .join(SillonBox, SillonBox.id == Turno.sillon_id)
            .where(
                Turno.profesional_id == profesional_id,
                Turno.inicio >= desde,
                Turno.inicio < hasta,
                cast(Turno.estado, String) != "cancelado",
            )
            .order_by(Turno.inicio)
        )
        return [dict(fila._mapping) for fila in session.execute(consulta)]
