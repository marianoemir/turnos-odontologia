"""POST /turnos API (C-03, task 4.1). Solo datos ficticios.

El override de get_db reutiliza la sesion con rollback del fixture:
lo creado por la API se verifica por DB directa en la misma sesion.
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.agenda.models import (
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
)
from backend.app.main import app
from backend.app.seed.catalogo import seed_catalogo
from backend.app.turnos.models import Turno
from backend.app.turnos.router import get_db

pytestmark = pytest.mark.integration

LUNES_10 = "2026-10-12T10:00:00-03:00"


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


def _body(ids, **mas):
    body = {
        "paciente_id": str(ids["paciente"]),
        "profesional_id": str(ids["profesional"]),
        "sillon_id": str(ids["sillon"]),
        "prestacion_id": str(ids["consulta30"]),
        "inicio": LUNES_10,
    }
    body.update(mas)
    return body


def test_post_valido_da_201_pendiente(client, db_session, ids):
    response = client.post("/turnos", json=_body(ids))

    assert response.status_code == 201
    data = response.json()
    assert data["estado"] == "pendiente"
    assert data["fin"] == "2026-10-12T10:30:00-03:00"
    assert db_session.query(Turno).count() == 1


def test_post_ignora_fin_del_cliente(client, db_session, ids):
    body = _body(ids, fin="2026-10-12T12:00:00-03:00")

    response = client.post("/turnos", json=body)

    assert response.status_code == 201
    assert response.json()["fin"] == "2026-10-12T10:30:00-03:00"


def test_post_solape_profesional_da_409(client, db_session, ids):
    assert client.post("/turnos", json=_body(ids)).status_code == 201
    otro_sillon = _body(
        ids, inicio="2026-10-12T10:15:00-03:00", sillon_id=str(ids["sillon2"])
    )

    response = client.post("/turnos", json=otro_sillon)

    assert response.status_code == 409
    assert response.json() == {
        "detail": {
            "causa": "profesional",
            "detalle": response.json()["detail"]["detalle"],
        }
    }
    assert response.json()["detail"]["detalle"]
    assert db_session.query(Turno).count() == 1


def test_post_solape_sillon_da_409(client, db_session, ids):
    assert client.post("/turnos", json=_body(ids)).status_code == 201
    otro_prof = _body(
        ids,
        inicio="2026-10-12T10:15:00-03:00",
        profesional_id=str(ids["profesional2"]),
    )

    response = client.post("/turnos", json=otro_prof)

    assert response.status_code == 409
    assert response.json()["detail"]["causa"] == "sillon"
    assert response.json()["detail"]["detalle"]
    assert db_session.query(Turno).count() == 1


def test_post_sin_sillon_da_422(client, ids):
    body = _body(ids)
    del body["sillon_id"]

    response = client.post("/turnos", json=body)

    assert response.status_code == 422


def test_post_fuera_de_horario_da_409(client, ids):
    response = client.post(
        "/turnos", json=_body(ids, inicio="2026-10-10T10:00:00-03:00")
    )

    assert response.status_code == 409
    assert response.json()["detail"]["causa"] == "horario"


def test_post_sobre_bloqueo_da_409(client, ids):
    response = client.post(
        "/turnos", json=_body(ids, inicio="2026-12-25T10:00:00-03:00")
    )

    assert response.status_code == 409
    assert response.json()["detail"]["causa"] == "bloqueo"


def test_post_profesional_inexistente_da_404(client, ids):
    import uuid

    response = client.post(
        "/turnos", json=_body(ids, profesional_id=str(uuid.uuid4()))
    )

    assert response.status_code == 404


def test_post_sillon_inactivo_da_422(client, db_session, ids):
    db_session.query(SillonBox).filter_by(id=ids["sillon"]).update(
        {"activo": False}
    )
    db_session.flush()

    response = client.post("/turnos", json=_body(ids))

    assert response.status_code == 422


def test_post_inicio_naive_da_422(client, ids):
    response = client.post(
        "/turnos", json=_body(ids, inicio="2026-10-12T10:00:00")
    )

    assert response.status_code == 422


def test_post_adyacencia_da_201(client, ids):
    assert client.post("/turnos", json=_body(ids)).status_code == 201

    response = client.post(
        "/turnos", json=_body(ids, inicio="2026-10-12T10:30:00-03:00")
    )

    assert response.status_code == 201
    assert response.json()["estado"] == "pendiente"


def test_health_sigue_sin_db(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
