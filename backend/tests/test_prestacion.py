"""T2.3 (C-02): Prestacion con duracion fija mayor a cero (RN-AG-01)."""

import pytest
from sqlalchemy.exc import IntegrityError

from backend.app.agenda.models import Prestacion

pytestmark = pytest.mark.integration


def test_alta_prestacion_valida(db_session):
    db_session.add(Prestacion(nombre="Limpieza", duracion_min=30))
    db_session.flush()

    got = db_session.query(Prestacion).filter_by(nombre="Limpieza").one()

    assert got.duracion_min == 30


@pytest.mark.parametrize("duracion", [0, -15])
def test_duracion_no_positiva_rechazada(db_session, duracion):
    db_session.add(
        Prestacion(nombre="Invalida", duracion_min=duracion)
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()
