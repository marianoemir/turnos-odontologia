"""POST/GET /lista-espera API (C-06). Solo datos ficticios."""

import pytest
from fastapi.testclient import TestClient

from backend.app.agenda.models import (
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
)
from backend.app.lista_espera.models import ListaEspera
from backend.app.lista_espera.router import get_db as lista_get_db
from backend.app.main import app
from backend.app.seed.catalogo import seed_catalogo
from backend.app.turnos.models import Turno
from backend.app.turnos.router import get_db as turnos_get_db

pytestmark = pytest.mark.integration

LUNES_10 = "2026-10-12T10:00:00-03:00"


@pytest.fixture()
def ids(db_session):
    seed_catalogo(db_session)
    return {
        "paciente": db_session.query(Paciente).filter_by(dni="DNI-FICT-001").one().id,
        "paciente2": db_session.query(Paciente).filter_by(dni="DNI-FICT-002").one().id,
        "profesional": db_session.query(Profesional).filter_by(matricula="MAT-FICT-001").one().id,
        "profesional2": db_session.query(Profesional).filter_by(matricula="MAT-FICT-002").one().id,
        "sillon": db_session.query(SillonBox).filter_by(nombre="Sillon 1").one().id,
        "sillon2": db_session.query(SillonBox).filter_by(nombre="Sillon 2").one().id,
        "consulta30": db_session.query(Prestacion).filter_by(nombre="Consulta").one().id,
    }


@pytest.fixture()
def client(db_session):
    def _override():
        yield db_session

    app.dependency_overrides[lista_get_db] = _override
    app.dependency_overrides[turnos_get_db] = _override
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def _alta(client, ids, **mas):
    body = {
        "paciente_id": str(ids["paciente"]),
        "prestacion_id": str(ids["consulta30"]),
    }
    body.update(mas)
    if "profesional_id" in body and body["profesional_id"] is None:
        del body["profesional_id"]
    return client.post("/lista-espera", json=body)


def test_alta_da_201_pendiente(client, db_session, ids):
    r = _alta(client, ids, profesional_id=str(ids["profesional"]))
    assert r.status_code == 201
    data = r.json()
    assert data["estado"] == "pendiente"
    assert data["creado_en"] is not None
    assert db_session.query(ListaEspera).count() == 1


def test_alta_sin_profesional(client, db_session, ids):
    r = _alta(client, ids)
    assert r.status_code == 201
    assert r.json()["profesional_id"] is None


def test_alta_paciente_inexistente_404(client, ids):
    import uuid

    r = client.post(
        "/lista-espera",
        json={
            "paciente_id": str(uuid.uuid4()),
            "prestacion_id": str(ids["consulta30"]),
        },
    )
    assert r.status_code == 404


def test_listar_fifo(client, db_session, ids):
    _alta(client, ids)
    client.post(
        "/lista-espera",
        json={
            "paciente_id": str(ids["paciente2"]),
            "prestacion_id": str(ids["consulta30"]),
        },
    )
    r = client.get("/lista-espera")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    # orden creado_en asc: creado_en monotonic by insertion
    assert data[0]["creado_en"] <= data[1]["creado_en"]


def test_listar_filtro_profesional(client, db_session, ids):
    _alta(client, ids, profesional_id=str(ids["profesional"]))
    client.post(
        "/lista-espera",
        json={
            "paciente_id": str(ids["paciente2"]),
            "profesional_id": str(ids["profesional2"]),
            "prestacion_id": str(ids["consulta30"]),
        },
    )
    r = client.get(f"/lista-espera?profesional={ids['profesional']}")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["profesional_id"] == str(ids["profesional"])


def test_ofrecer_crea_turno_valido(client, db_session, ids):
    alta = _alta(client, ids)
    lista_id = alta.json()["id"]
    r = client.post(
        f"/lista-espera/{lista_id}/ofrecer",
        json={
            "inicio": LUNES_10,
            "profesional_id": str(ids["profesional"]),
            "sillon_id": str(ids["sillon"]),
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["lista"]["estado"] == "ofrecido"
    assert data["lista"]["turno_id"] is not None
    assert data["turno"]["estado"] == "pendiente"
    assert db_session.query(Turno).count() == 1


def test_ofrecer_conflicto_409_revierte(client, db_session, ids):
    # turno base
    client.post(
        "/turnos",
        json={
            "paciente_id": str(ids["paciente"]),
            "profesional_id": str(ids["profesional"]),
            "sillon_id": str(ids["sillon"]),
            "prestacion_id": str(ids["consulta30"]),
            "inicio": LUNES_10,
        },
    )
    alta = client.post(
        "/lista-espera",
        json={
            "paciente_id": str(ids["paciente2"]),
            "prestacion_id": str(ids["consulta30"]),
        },
    )
    lista_id = alta.json()["id"]
    r = client.post(
        f"/lista-espera/{lista_id}/ofrecer",
        json={
            "inicio": LUNES_10,
            "profesional_id": str(ids["profesional"]),
            "sillon_id": str(ids["sillon"]),
        },
    )
    assert r.status_code == 409
    db_session.expire_all()
    entrada = db_session.get(ListaEspera, __import__("uuid").UUID(lista_id))
    assert entrada.estado == "pendiente"
    assert entrada.turno_id is None
    assert db_session.query(Turno).count() == 1


def test_ofrecer_inexistente_404(client, ids):
    import uuid

    r = client.post(
        f"/lista-espera/{uuid.uuid4()}/ofrecer",
        json={
            "inicio": LUNES_10,
            "profesional_id": str(ids["profesional"]),
            "sillon_id": str(ids["sillon"]),
        },
    )
    assert r.status_code == 404


def test_responder_aceptar(client, db_session, ids):
    alta = _alta(client, ids)
    lista_id = alta.json()["id"]
    client.post(
        f"/lista-espera/{lista_id}/ofrecer",
        json={
            "inicio": LUNES_10,
            "profesional_id": str(ids["profesional"]),
            "sillon_id": str(ids["sillon"]),
        },
    )
    r = client.post(
        f"/lista-espera/{lista_id}/responder",
        json={"acepta": True},
    )
    assert r.status_code == 200
    assert r.json()["estado"] == "asignado"


def test_responder_rechazar_avanza(client, db_session, ids):
    # dos entradas FIFO
    a1 = client.post(
        "/lista-espera",
        json={
            "paciente_id": str(ids["paciente"]),
            "profesional_id": str(ids["profesional"]),
            "prestacion_id": str(ids["consulta30"]),
        },
    ).json()["id"]
    a2 = client.post(
        "/lista-espera",
        json={
            "paciente_id": str(ids["paciente2"]),
            "profesional_id": str(ids["profesional"]),
            "prestacion_id": str(ids["consulta30"]),
        },
    ).json()["id"]
    client.post(
        f"/lista-espera/{a1}/ofrecer",
        json={
            "inicio": LUNES_10,
            "profesional_id": str(ids["profesional"]),
            "sillon_id": str(ids["sillon"]),
        },
    )
    r = client.post(
        f"/lista-espera/{a1}/responder", json={"acepta": False}
    )
    assert r.status_code == 200
    assert r.json()["estado"] == "baja"
    # siguiente queda pendiente
    import uuid

    e2 = db_session.get(ListaEspera, uuid.UUID(a2))
    assert e2.estado == "pendiente"


def test_responder_rechazar_409_si_falla_la_cancelacion(client, db_session, ids):
    import uuid

    lista_id = _alta(client, ids, profesional_id=str(ids["profesional"])).json()["id"]
    r = client.post(
        f"/lista-espera/{lista_id}/ofrecer",
        json={
            "inicio": LUNES_10,
            "profesional_id": str(ids["profesional"]),
            "sillon_id": str(ids["sillon"]),
        },
    )
    assert r.status_code in (200, 201)
    entrada = db_session.get(ListaEspera, uuid.UUID(lista_id))
    turno = db_session.get(Turno, entrada.turno_id)
    turno.estado = "atendido"  # cancelar() rechaza esta transicion
    db_session.flush()
    r = client.post(f"/lista-espera/{lista_id}/responder", json={"acepta": False})
    assert r.status_code == 409
    db_session.expire_all()
    assert db_session.get(ListaEspera, uuid.UUID(lista_id)).estado == "ofrecido"


def test_responder_sin_oferta_409(client, db_session, ids):
    alta = _alta(client, ids)
    lista_id = alta.json()["id"]
    r = client.post(
        f"/lista-espera/{lista_id}/responder", json={"acepta": True}
    )
    assert r.status_code == 409


def test_baja_preserva_registro(client, db_session, ids):
    a1 = client.post(
        "/lista-espera",
        json={
            "paciente_id": str(ids["paciente"]),
            "profesional_id": str(ids["profesional"]),
            "prestacion_id": str(ids["consulta30"]),
        },
    ).json()["id"]
    client.post(
        f"/lista-espera/{a1}/ofrecer",
        json={
            "inicio": LUNES_10,
            "profesional_id": str(ids["profesional"]),
            "sillon_id": str(ids["sillon"]),
        },
    )
    client.post(f"/lista-espera/{a1}/responder", json={"acepta": False})
    import uuid

    assert db_session.get(ListaEspera, uuid.UUID(a1)) is not None