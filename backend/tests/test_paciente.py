"""T2.1 (C-02): Paciente con DNI unico y datos ficticios."""

import pytest
from sqlalchemy.exc import IntegrityError

from backend.app.agenda.models import Paciente

pytestmark = pytest.mark.integration


def test_alta_paciente_valida(db_session):
    db_session.add(
        Paciente(
            nombre="Ana Ficticia",
            dni="DNI-FICT-001",
            contacto="tel 11-1111-1111",
        )
    )
    db_session.flush()

    got = db_session.query(Paciente).filter_by(dni="DNI-FICT-001").one()

    assert got.nombre == "Ana Ficticia"
    assert got.ficticio is True


def test_dni_duplicado_rechazado(db_session):
    db_session.add(Paciente(nombre="A", dni="DNI-FICT-001"))
    db_session.flush()

    db_session.add(Paciente(nombre="B", dni="DNI-FICT-001"))
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()
