from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from backend.app.agenda.models import HorarioAtencion, Paciente, Prestacion, SillonBox
from backend.app.turnos.service import (
    ConflictoTurno,
    ServicioTurnos,
    TurnoInvalido,
    TurnoNoEncontrado,
)

ZONA = ZoneInfo("America/Argentina/Buenos_Aires")


class ServicioReservaOnline:
    @staticmethod
    def slots(
        session,
        *,
        profesional_id: uuid.UUID,
        prestacion_id: uuid.UUID,
        fecha,
    ):
        sillones = (
            session.query(SillonBox)
            .filter(SillonBox.activo.is_(True))
            .order_by(SillonBox.nombre, SillonBox.id)
            .all()
        )
        if not sillones:
            return []

        prestacion = session.get(Prestacion, prestacion_id)
        if prestacion is None:
            return []
        duracion = timedelta(minutes=prestacion.duracion_min)

        paciente = session.query(Paciente).filter(Paciente.activo.is_(True)).first()
        if paciente is None:
            return []

        ahora_local = datetime.now(ZONA)
        dia_semana = fecha.weekday()
        horarios = (
            session.query(HorarioAtencion)
            .filter_by(profesional_id=profesional_id)
            .filter(
                HorarioAtencion.activo.is_(True),
                HorarioAtencion.dia_semana == dia_semana,
            )
            .all()
        )

        candidatos = []
        for horario in horarios:
            cursor = datetime.combine(fecha, horario.desde, tzinfo=ZONA)
            limite = datetime.combine(fecha, horario.hasta, tzinfo=ZONA)
            while cursor + duracion <= limite:
                candidatos.append(cursor)
                cursor = cursor + duracion

        slots = []
        for inicio in sorted(candidatos):
            if inicio <= ahora_local:
                continue
            slot = ServicioReservaOnline._slot_para_candidato(
                session,
                paciente_id=paciente.id,
                profesional_id=profesional_id,
                prestacion_id=prestacion_id,
                inicio=inicio,
                sillones=sillones,
            )
            if slot is not None:
                slots.append(slot)
        return slots

    @staticmethod
    def _slot_para_candidato(
        session,
        *,
        paciente_id: uuid.UUID,
        profesional_id: uuid.UUID,
        prestacion_id: uuid.UUID,
        inicio: datetime,
        sillones,
    ):
        for sillon in sillones:
            try:
                fin = ServicioTurnos.validar(
                    session,
                    paciente_id=paciente_id,
                    profesional_id=profesional_id,
                    sillon_id=sillon.id,
                    prestacion_id=prestacion_id,
                    inicio=inicio,
                )
                return {"inicio": inicio, "fin": fin}
            except ConflictoTurno as exc:
                if exc.causa == "sillon":
                    continue
                return None
            except (TurnoInvalido, TurnoNoEncontrado):
                return None
        return None
