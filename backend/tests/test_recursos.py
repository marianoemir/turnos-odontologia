"""T2.2 (C-02): Profesional con matricula unica + SillonBox activo."""

import pytest
from sqlalchemy.exc import IntegrityError

from backend.app.agenda.models import Profesional, SillonBox

pytestmark = pytest.mark.integration


def test_alta_profesional_valida(db_session):
    db_session.add(
        Profesional(nombre="Odontologa Ficticia", matricula="MAT-FICT-001")
    )
    db_session.flush()

    got = (
        db_session.query(Profesional)
        .filter_by(matricula="MAT-FICT-001")
        .one()
    )

    assert got.nombre == "Odontologa Ficticia"


def test_matricula_duplicada_rechazada(db_session):
    db_session.add(Profesional(nombre="A", matricula="MAT-FICT-001"))
    db_session.flush()

    db_session.add(Profesional(nombre="B", matricula="MAT-FICT-001"))
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_sillon_activo_por_defecto(db_session):
    db_session.add(SillonBox(nombre="Sillon 1"))
    db_session.flush()

    got = db_session.query(SillonBox).filter_by(nombre="Sillon 1").one()

    assert got.activo is True


def test_listado_solo_activos(db_session):
    db_session.add_all(
        [
            SillonBox(nombre="Sillon A", activo=True),
            SillonBox(nombre="Sillon B", activo=False),
        ]
    )
    db_session.flush()

    activos = (
        db_session.query(SillonBox).filter_by(activo=True).all()
    )

    assert [s.nombre for s in activos] == ["Sillon A"]
