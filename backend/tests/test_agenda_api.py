"""GET /agenda (C-05). Solo datos ficticios.

Misma estrategia que test_turnos_api.py: el override de get_db reutiliza la
sesion con rollback del fixture. Los turnos se insertan directo en la base
(no por ServicioTurnos.crear) para poder usar horas fuera del horario de
atencion y estados arbitrarios. Las aserciones se hacen sobre la respuesta
de la API, nunca sobre lo que inserta el propio test.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.app.agenda.models import (
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
)
from backend.app.main import app
from backend.app.seed.catalogo import seed_catalogo
from backend.app.turnos.router import get_db

pytestmark = pytest.mark.integration

BA = ZoneInfo("America/Argentina/Buenos_Aires")


@pytest.fixture()
def ids(db_session):
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
        "consulta30": db_session.query(Prestacion)
        .filter_by(nombre="Consulta")
        .one()
        .id,
    }


@pytest.fixture()
def client(db_session):
    def _override():
        yield db_session

    app.dependency_overrides[get_db] = _override
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def _insertar_turno(
    db_session,
    ids,
    *,
    inicio,
    estado="pendiente",
    profesional_id=None,
    sillon_id=None,
):
    """Inserta un turno de 30 min sin pasar por el servicio."""
    return db_session.execute(
        text(
            "INSERT INTO turnos (id, paciente_id, profesional_id, "
            "sillon_id, prestacion_id, inicio, fin, estado) "
            "VALUES (gen_random_uuid(), :pac, :prof, :sil, :pres, "
            ":inicio, :fin, :estado) RETURNING id"
        ),
        {
            "pac": ids["paciente"],
            "prof": profesional_id or ids["profesional"],
            "sil": sillon_id or ids["sillon"],
            "pres": ids["consulta30"],
            "inicio": inicio,
            "fin": inicio + timedelta(minutes=30),
            "estado": estado,
        },
    ).scalar_one()


def _agenda(client, profesional, fecha):
    return client.get(
        "/agenda",
        params={"profesional": str(profesional), "fecha": fecha},
    )


def test_orden_por_inicio(client, db_session, ids):
    # Se inserta primero el de las 14:00 y despues el de las 10:00.
    id_14h = _insertar_turno(
        db_session, ids, inicio=datetime(2026, 1, 12, 14, 0, tzinfo=BA)
    )
    id_10h = _insertar_turno(
        db_session, ids, inicio=datetime(2026, 1, 12, 10, 0, tzinfo=BA)
    )

    r = _agenda(client, ids["profesional"], "2026-01-12")

    assert r.status_code == 200
    assert [i["id"] for i in r.json()] == [str(id_10h), str(id_14h)]
