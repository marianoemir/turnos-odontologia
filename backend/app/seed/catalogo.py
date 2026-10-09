"""Seed ficticio del catalogo (C-02). Solo datos ficticios.

Se ejecuta con SEED_FICTICIO=true. Idempotente: solo inserta lo
faltante (por claves unicas o existencia). No crea turnos (C-03).
No hace commit: quien invoca decide (los tests usan rollback, el
entrypoint commitea).
"""

from __future__ import annotations

import os
from datetime import datetime, time
from zoneinfo import ZoneInfo

from backend.app.agenda.models import (
    Bloqueo,
    HorarioAtencion,
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
    validar_horario_sin_solape,
)

TZ = ZoneInfo("America/Argentina/Buenos_Aires")

PROFESIONALES = [
    ("Odontologa Ficticia 1", "MAT-FICT-001"),
    ("Odontologo Ficticio 2", "MAT-FICT-002"),
]
SILLONES = ["Sillon 1", "Sillon 2"]
PRESTACIONES = [("Limpieza", 20), ("Consulta", 30), ("Endodoncia", 60)]
PACIENTES = [
    ("Paciente Ficticio 1", "DNI-FICT-001", "tel 11-0000-0001"),
    ("Paciente Ficticia 2", "DNI-FICT-002", "tel 11-0000-0002"),
    ("Paciente Ficticio 3", "DNI-FICT-003", "tel 11-0000-0003"),
]
BLOQUEO_MOTIVO = "Feriado ficticio de prueba"


def seed_catalogo(session) -> dict:
    for nombre, matricula in PROFESIONALES:
        existe = (
            session.query(Profesional).filter_by(matricula=matricula).first()
        )
        if existe is None:
            session.add(Profesional(nombre=nombre, matricula=matricula))

    for nombre in SILLONES:
        if session.query(SillonBox).filter_by(nombre=nombre).first() is None:
            session.add(SillonBox(nombre=nombre))

    for nombre, duracion in PRESTACIONES:
        if (
            session.query(Prestacion).filter_by(nombre=nombre).first()
            is None
        ):
            session.add(
                Prestacion(nombre=nombre, duracion_min=duracion)
            )

    for nombre, dni, contacto in PACIENTES:
        if session.query(Paciente).filter_by(dni=dni).first() is None:
            session.add(
                Paciente(nombre=nombre, dni=dni, contacto=contacto)
            )
    session.flush()

    profesionales = session.query(Profesional).all()
    for prof in profesionales:
        for dia in range(5):
            existe = (
                session.query(HorarioAtencion)
                .filter_by(
                    profesional_id=prof.id,
                    dia_semana=dia,
                    desde=time(9),
                    hasta=time(18),
                )
                .first()
            )
            if existe is None:
                validar_horario_sin_solape(
                    session, prof.id, dia, time(9), time(18)
                )
                session.add(
                    HorarioAtencion(
                        profesional_id=prof.id,
                        dia_semana=dia,
                        desde=time(9),
                        hasta=time(18),
                    )
                )

    if (
        session.query(Bloqueo).filter_by(motivo=BLOQUEO_MOTIVO).first()
        is None
    ):
        session.add(
            Bloqueo(
                profesional_id=None,
                sillon_id=None,
                desde=datetime(2026, 12, 24, 0, 0, tzinfo=TZ),
                hasta=datetime(2026, 12, 26, 0, 0, tzinfo=TZ),
                motivo=BLOQUEO_MOTIVO,
            )
        )
    session.flush()

    return {
        "profesionales": session.query(Profesional).count(),
        "sillones": session.query(SillonBox).count(),
        "prestaciones": session.query(Prestacion).count(),
        "horarios": session.query(HorarioAtencion).count(),
        "bloqueos": session.query(Bloqueo).count(),
        "pacientes": session.query(Paciente).count(),
    }


def main() -> None:
    if os.environ.get("SEED_FICTICIO") != "true":
        raise SystemExit("Seed no ejecutado: SEED_FICTICIO != 'true'.")
    from backend.app.db import get_session

    sesion = get_session()()
    try:
        conteos = seed_catalogo(sesion)
        sesion.commit()
    finally:
        sesion.close()
    print(f"seed ok: {conteos}")


if __name__ == "__main__":
    main()
