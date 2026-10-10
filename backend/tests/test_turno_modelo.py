"""Modelo Turno + garantias DB (C-03, tasks 2.1/2.2/2.3).

2.1: persiste un Turno valido (fin, default pendiente, FKs).
2.2: CHECK fin>inicio y CHECK estado rechazados a nivel DB.
2.3: EXCLUDE rechaza insercion directa solapada (profesional y sillon).
Solo datos ficticios.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from backend.app.agenda.models import (
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
)
from backend.app.seed.catalogo import seed_catalogo
from backend.app.turnos.models import ESTADOS_ACTIVOS, Turno

pytestmark = pytest.mark.integration

TZ = ZoneInfo("America/Argentina/Buenos_Aires")


def _ids(db_session):
    seed_catalogo(db_session)
    return {
        "paciente": db_session.query(Paciente)
        .filter_by(dni="DNI-FICT-001")
        .one()
        .id,
        "profesional": db_session.query(Profesional)
        .filter_by(matricula="MAT-FICT-001")
        .one()
        .id,
        "profesional2": db_session.query(Profesional)
        .filter_by(matricula="MAT-FICT-002")
        .one()
        .id,
        "sillon": db_session.query(SillonBox)
        .filter_by(nombre="Sillon 1")
        .one()
        .id,
        "sillon2": db_session.query(SillonBox)
        .filter_by(nombre="Sillon 2")
        .one()
        .id,
        "prestacion": db_session.query(Prestacion)
        .filter_by(nombre="Consulta")
        .one()
        .id,
    }


def _insertar_directo(db_session, ids, inicio, fin, estado="pendiente",
                      profesional=None, sillon=None):
    db_session.execute(
        text(
            "INSERT INTO turnos "
            "(id, paciente_id, profesional_id, sillon_id, prestacion_id, "
            "inicio, fin, estado) "
            "VALUES (gen_random_uuid(), :pac, :prof, :sil, :pres, "
            ":inicio, :fin, :estado)"
        ),
        {
            "pac": ids["paciente"],
            "prof": profesional or ids["profesional"],
            "sil": sillon or ids["sillon"],
            "pres": ids["prestacion"],
            "inicio": inicio,
            "fin": fin,
            "estado": estado,
        },
    )
    db_session.flush()


def test_turno_valido_persiste_con_fin_y_pendiente(db_session):
    ids = _ids(db_session)
    inicio = datetime(2026, 10, 12, 10, 0, tzinfo=TZ)
    fin = datetime(2026, 10, 12, 10, 30, tzinfo=TZ)

    db_session.add(
        Turno(
            paciente_id=ids["paciente"],
            profesional_id=ids["profesional"],
            sillon_id=ids["sillon"],
            prestacion_id=ids["prestacion"],
            inicio=inicio,
            fin=fin,
        )
    )
    db_session.flush()

    got = db_session.query(Turno).one()
    assert got.fin == fin
    assert got.estado == "pendiente"
    assert got.profesional_id == ids["profesional"]
    assert got.sillon_id == ids["sillon"]
    assert got.creado_por is None


def test_turno_fin_no_posterior_a_inicio_rechazado(db_session):
    ids = _ids(db_session)
    inicio = datetime(2026, 10, 12, 10, 0, tzinfo=TZ)

    db_session.add(
        Turno(
            paciente_id=ids["paciente"],
            profesional_id=ids["profesional"],
            sillon_id=ids["sillon"],
            prestacion_id=ids["prestacion"],
            inicio=inicio,
            fin=inicio,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_turno_estado_invalido_rechazado(db_session):
    ids = _ids(db_session)

    db_session.add(
        Turno(
            paciente_id=ids["paciente"],
            profesional_id=ids["profesional"],
            sillon_id=ids["sillon"],
            prestacion_id=ids["prestacion"],
            inicio=datetime(2026, 10, 12, 10, 0, tzinfo=TZ),
            fin=datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
            estado="en_espera",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_exclude_rechaza_solape_mismo_profesional(db_session):
    ids = _ids(db_session)
    _insertar_directo(
        db_session,
        ids,
        datetime(2026, 10, 12, 10, 0, tzinfo=TZ),
        datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
    )

    with pytest.raises(
        IntegrityError, match="ex_turnos_profesional_sin_solape"
    ):
        _insertar_directo(
            db_session,
            ids,
            datetime(2026, 10, 12, 10, 15, tzinfo=TZ),
            datetime(2026, 10, 12, 10, 45, tzinfo=TZ),
            sillon=ids["sillon2"],
        )
    db_session.rollback()


def test_exclude_rechaza_solape_mismo_sillon_otro_profesional(
    db_session,
):
    ids = _ids(db_session)
    _insertar_directo(
        db_session,
        ids,
        datetime(2026, 10, 12, 10, 0, tzinfo=TZ),
        datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
    )

    with pytest.raises(
        IntegrityError, match="ex_turnos_sillon_sin_solape"
    ):
        _insertar_directo(
            db_session,
            ids,
            datetime(2026, 10, 12, 10, 15, tzinfo=TZ),
            datetime(2026, 10, 12, 10, 45, tzinfo=TZ),
            profesional=ids["profesional2"],
        )
    db_session.rollback()


def test_exclude_permite_adyacencia_y_cancelado_libera(db_session):
    ids = _ids(db_session)
    _insertar_directo(
        db_session,
        ids,
        datetime(2026, 10, 12, 10, 0, tzinfo=TZ),
        datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
        estado="cancelado",
    )
    # Mismo slot sobre un turno cancelado: la DB lo permite.
    _insertar_directo(
        db_session,
        ids,
        datetime(2026, 10, 12, 10, 0, tzinfo=TZ),
        datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
    )
    # Adyacencia exacta inicio==fin: la DB la permite ([inicio,fin)).
    _insertar_directo(
        db_session,
        ids,
        datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
        datetime(2026, 10, 12, 11, 0, tzinfo=TZ),
    )

    assert db_session.query(Turno).count() == 3


def test_estados_activos_son_pendiente_y_confirmado():
    assert sorted(ESTADOS_ACTIVOS) == ["confirmado", "pendiente"]
