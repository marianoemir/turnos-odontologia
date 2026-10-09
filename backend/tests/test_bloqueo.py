"""T2.5 (C-02, integracion): Bloqueo con rango valido y motivo."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy.exc import IntegrityError

from backend.app.agenda.models import Bloqueo

pytestmark = pytest.mark.integration

TZ = ZoneInfo("America/Argentina/Buenos_Aires")


def test_bloqueo_global_valido(db_session):
    db_session.add(
        Bloqueo(
            profesional_id=None,
            sillon_id=None,
            desde=datetime(2026, 10, 12, 9, tzinfo=TZ),
            hasta=datetime(2026, 10, 12, 18, tzinfo=TZ),
            motivo="feriado ficticio",
        )
    )
    db_session.flush()

    got = db_session.query(Bloqueo).one()

    assert got.motivo == "feriado ficticio"
    assert got.profesional_id is None and got.sillon_id is None


def test_bloqueo_rango_invertido_rechazado(db_session):
    db_session.add(
        Bloqueo(
            desde=datetime(2026, 10, 12, 18, tzinfo=TZ),
            hasta=datetime(2026, 10, 12, 9, tzinfo=TZ),
            motivo="rango invertido",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_bloqueo_sin_motivo_rechazado(db_session):
    db_session.add(
        Bloqueo(
            desde=datetime(2026, 10, 12, 9, tzinfo=TZ),
            hasta=datetime(2026, 10, 12, 18, tzinfo=TZ),
            motivo=None,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()
