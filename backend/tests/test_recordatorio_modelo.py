"""Invariantes de esquema de la tabla recordatorio (C-07, task 1.2).

Cubre CHECK de `canal`, `etapa` y `estado`, UNIQUE de `token_hash`, UNIQUE de
dedupe `(turno_id, etapa, inicio_turno)`, default `simulado=false` y FK
RESTRICT hacia `turnos`. Solo datos ficticios.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy.exc import IntegrityError

from backend.app.agenda.models import (
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
)
from backend.app.recordatorios.models import Recordatorio
from backend.app.seed.catalogo import seed_catalogo
from backend.app.turnos.models import Turno

pytestmark = pytest.mark.integration

TZ = ZoneInfo("America/Argentina/Buenos_Aires")
INICIO = datetime(2026, 11, 10, 10, 0, tzinfo=TZ)
FIN = datetime(2026, 11, 10, 10, 30, tzinfo=TZ)


def _turno(db_session) -> Turno:
    seed_catalogo(db_session)
    paciente = (
        db_session.query(Paciente).filter_by(dni="DNI-FICT-001").one()
    )
    profesional = (
        db_session.query(Profesional).filter_by(matricula="MAT-FICT-001").one()
    )
    sillon = db_session.query(SillonBox).filter_by(nombre="Sillon 1").one()
    prestacion = (
        db_session.query(Prestacion).filter_by(nombre="Consulta").one()
    )
    turno = Turno(
        paciente_id=paciente.id,
        profesional_id=profesional.id,
        sillon_id=sillon.id,
        prestacion_id=prestacion.id,
        inicio=INICIO,
        fin=FIN,
    )
    db_session.add(turno)
    db_session.flush()
    return turno


def _recordatorio(turno: Turno, **overrides) -> Recordatorio:
    datos = {
        "turno_id": turno.id,
        "canal": "whatsapp",
        "etapa": "48h",
        "token_hash": "a" * 64,
        "expira_en": INICIO,
        "inicio_turno": INICIO,
    }
    datos.update(overrides)
    return Recordatorio(**datos)


def test_recordatorio_persiste_con_defaults(db_session):
    turno = _turno(db_session)

    db_session.add(_recordatorio(turno))
    db_session.flush()

    got = db_session.query(Recordatorio).one()
    assert got.estado == "pendiente"
    assert got.simulado is False
    assert got.creado_en is not None
    assert got.proveedor_ref is None
    assert got.mensaje is None


def test_recordatorio_canal_invalido_rechazado(db_session):
    turno = _turno(db_session)

    db_session.add(_recordatorio(turno, canal="sms"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_recordatorio_etapa_invalida_rechazada(db_session):
    turno = _turno(db_session)

    db_session.add(_recordatorio(turno, etapa="12h"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_recordatorio_estado_invalido_rechazado(db_session):
    turno = _turno(db_session)

    db_session.add(_recordatorio(turno, estado="enviando"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_recordatorio_token_hash_unico(db_session):
    turno = _turno(db_session)

    db_session.add(_recordatorio(turno))
    db_session.flush()

    db_session.add(
        _recordatorio(turno, etapa="24h", inicio_turno=FIN)
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_recordatorio_dedupe_por_turno_etapa_inicio(db_session):
    turno = _turno(db_session)

    db_session.add(_recordatorio(turno))
    db_session.flush()

    db_session.add(_recordatorio(turno, token_hash="b" * 64))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_recordatorio_restrict_turno(db_session):
    turno = _turno(db_session)
    db_session.add(_recordatorio(turno))
    db_session.flush()

    db_session.delete(turno)
    with pytest.raises(IntegrityError):
        db_session.flush()
