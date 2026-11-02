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


def test_campos_completos(client, db_session, ids):
    inicio = datetime(2026, 1, 12, 10, 0, tzinfo=BA)
    id_turno = _insertar_turno(
        db_session, ids, inicio=inicio, estado="confirmado"
    )

    r = _agenda(client, ids["profesional"], "2026-01-12")

    assert r.status_code == 200
    assert len(r.json()) == 1
    item = r.json()[0]
    assert set(item) == {
        "id",
        "inicio",
        "fin",
        "estado",
        "paciente_nombre",
        "prestacion_nombre",
        "sillon_nombre",
    }
    assert item["id"] == str(id_turno)
    assert item["estado"] == "confirmado"
    assert datetime.fromisoformat(item["inicio"]) == inicio
    assert datetime.fromisoformat(item["fin"]) == inicio + timedelta(
        minutes=30
    )
    paciente = db_session.get(Paciente, ids["paciente"])
    assert item["paciente_nombre"] == paciente.nombre
    assert item["prestacion_nombre"] == "Consulta"
    assert item["sillon_nombre"] == "Sillon 1"


def test_dia_vacio(client, db_session, ids):
    # Hay un turno el dia 12; el dia 13 del mismo profesional esta vacio.
    _insertar_turno(
        db_session, ids, inicio=datetime(2026, 1, 12, 10, 0, tzinfo=BA)
    )

    r = _agenda(client, ids["profesional"], "2026-01-13")

    assert r.status_code == 200
    assert r.json() == []

def test_cancelado_no_aparece(client, db_session, ids):
    id_pendiente = _insertar_turno(
        db_session, ids, inicio=datetime(2026, 1, 12, 10, 0, tzinfo=BA)
    )
    _insertar_turno(
        db_session,
        ids,
        inicio=datetime(2026, 1, 12, 11, 0, tzinfo=BA),
        estado="cancelado",
    )

    r = _agenda(client, ids["profesional"], "2026-01-12")

    assert r.status_code == 200
    assert [i["id"] for i in r.json()] == [str(id_pendiente)]

def test_atendido_y_ausente_aparecen(client, db_session, ids):
    id_atendido = _insertar_turno(
        db_session,
        ids,
        inicio=datetime(2026, 1, 12, 10, 0, tzinfo=BA),
        estado="atendido",
    )
    id_ausente = _insertar_turno(
        db_session,
        ids,
        inicio=datetime(2026, 1, 12, 11, 0, tzinfo=BA),
        estado="ausente",
    )

    r = _agenda(client, ids["profesional"], "2026-01-12")

    assert r.status_code == 200
    assert [(i["id"], i["estado"]) for i in r.json()] == [
        (str(id_atendido), "atendido"),
        (str(id_ausente), "ausente"),
    ]


def test_turno_de_otro_profesional_no_aparece(client, db_session, ids):
    id_p1 = _insertar_turno(
        db_session, ids, inicio=datetime(2026, 1, 12, 10, 0, tzinfo=BA)
    )
    _insertar_turno(
        db_session,
        ids,
        inicio=datetime(2026, 1, 12, 10, 0, tzinfo=BA),
        profesional_id=ids["profesional2"],
        sillon_id=ids["sillon2"],
    )

    r = _agenda(client, ids["profesional"], "2026-01-12")

    assert r.status_code == 200
    assert [i["id"] for i in r.json()] == [str(id_p1)]