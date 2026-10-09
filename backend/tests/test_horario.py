"""T2.4 (C-02, integracion): HorarioAtencion valido y sin solape."""

from datetime import time

import pytest
from sqlalchemy.exc import IntegrityError

from backend.app.agenda.models import (
    HorarioAtencion,
    Profesional,
    validar_horario_sin_solape,
)

pytestmark = pytest.mark.integration


def _profesional(db_session):
    prof = Profesional(nombre="Odontologo", matricula="MAT-FICT-001")
    db_session.add(prof)
    db_session.flush()
    return prof


def test_horario_valido(db_session):
    prof = _profesional(db_session)
    db_session.add(
        HorarioAtencion(
            profesional_id=prof.id,
            dia_semana=0,
            desde=time(9),
            hasta=time(18),
        )
    )
    db_session.flush()

    got = db_session.query(HorarioAtencion).one()

    assert (got.dia_semana, got.desde, got.hasta) == (
        0,
        time(9),
        time(18),
    )


@pytest.mark.parametrize(
    "desde,hasta", [(time(18), time(9)), (time(9), time(9))]
)
def test_horario_desde_mayor_o_igual_rechazado(
    db_session, desde, hasta
):
    prof = _profesional(db_session)
    db_session.add(
        HorarioAtencion(
            profesional_id=prof.id,
            dia_semana=0,
            desde=desde,
            hasta=hasta,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_dia_semana_fuera_de_rango_rechazado(db_session):
    prof = _profesional(db_session)
    db_session.add(
        HorarioAtencion(
            profesional_id=prof.id,
            dia_semana=7,
            desde=time(9),
            hasta=time(18),
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_adyacencia_aceptada_y_solape_rechazado(db_session):
    prof = _profesional(db_session)
    db_session.add(
        HorarioAtencion(
            profesional_id=prof.id,
            dia_semana=0,
            desde=time(9),
            hasta=time(13),
        )
    )
    db_session.flush()

    validar_horario_sin_solape(
        db_session, prof.id, 0, time(13), time(18)
    )
    db_session.add(
        HorarioAtencion(
            profesional_id=prof.id,
            dia_semana=0,
            desde=time(13),
            hasta=time(18),
        )
    )
    db_session.flush()

    with pytest.raises(ValueError, match="[Ss]olape"):
        validar_horario_sin_solape(
            db_session, prof.id, 0, time(12), time(14)
        )

    filas = (
        db_session.query(HorarioAtencion)
        .filter_by(profesional_id=prof.id, dia_semana=0)
        .count()
    )
    assert filas == 2
