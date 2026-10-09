"""T4.1+T4.2 (C-02): seed ficticio reproducible e idempotente."""

import pytest

from backend.app.agenda.models import (
    Bloqueo,
    HorarioAtencion,
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
)
from backend.app.seed.catalogo import seed_catalogo

pytestmark = pytest.mark.integration


def _conteos(db_session):
    return {
        "profesionales": db_session.query(Profesional).count(),
        "sillones": db_session.query(SillonBox).count(),
        "prestaciones": db_session.query(Prestacion).count(),
        "horarios": db_session.query(HorarioAtencion).count(),
        "bloqueos": db_session.query(Bloqueo).count(),
        "pacientes": db_session.query(Paciente).count(),
    }


def test_seed_carga_catalogo(db_session, monkeypatch):
    monkeypatch.setenv("SEED_FICTICIO", "true")

    seed_catalogo(db_session)

    conteos = _conteos(db_session)
    assert conteos["profesionales"] == 2
    assert conteos["sillones"] == 2
    assert conteos["prestaciones"] == 3
    assert conteos["horarios"] == 2 * 5
    assert conteos["bloqueos"] == 1
    assert conteos["pacientes"] == 3

    duraciones = sorted(
        p.duracion_min for p in db_session.query(Prestacion).all()
    )
    assert duraciones == [20, 30, 60]


def test_seed_idempotente(db_session, monkeypatch):
    monkeypatch.setenv("SEED_FICTICIO", "true")

    seed_catalogo(db_session)
    antes = _conteos(db_session)
    seed_catalogo(db_session)
    despues = _conteos(db_session)

    assert antes == despues
    assert despues["profesionales"] == 2
    assert despues["pacientes"] == 3
