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


def _dt(texto):
    from datetime import datetime

    return datetime.fromisoformat(texto)


def _turno_en_estado(client, db_session, ids, estado):
    """Crea un turno por API y lo deja en `estado` por DB directa."""
    import uuid

    turno_id = uuid.UUID(client.post("/turnos", json=_body(ids)).json()["id"])
    db_session.query(Turno).filter_by(id=turno_id).update({"estado": estado})
    db_session.flush()
    return turno_id


def test_cancelar_da_200_y_libera_slot(client, ids):
    creado = client.post("/turnos", json=_body(ids))
    assert creado.status_code == 201

    r = client.post(f"/turnos/{creado.json()['id']}/cancelar")

    assert r.status_code == 200
    assert r.json()["estado"] == "cancelado"
    segundo = client.post("/turnos", json=_body(ids))
    assert segundo.status_code == 201


def test_cancelar_confirmado_da_200(client, db_session, ids):
    turno_id = _turno_en_estado(client, db_session, ids, "confirmado")

    r = client.post(f"/turnos/{turno_id}/cancelar")

    assert r.status_code == 200
    assert r.json()["estado"] == "cancelado"


def test_cancelar_atendido_da_409(client, db_session, ids):
    turno_id = _turno_en_estado(client, db_session, ids, "atendido")

    r = client.post(f"/turnos/{turno_id}/cancelar")

    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "transicion"
    db_session.expire_all()
    assert db_session.get(Turno, turno_id).estado == "atendido"


def test_cancelar_inexistente_da_404(client, ids):
    import uuid

    r = client.post(f"/turnos/{uuid.uuid4()}/cancelar")

    assert r.status_code == 404
    assert r.json()["detail"].startswith("turno no existe")


def test_reprogramar_da_200_fin_recalculado(client, ids):
    turno_id = client.post("/turnos", json=_body(ids)).json()["id"]

    r = client.post(
        f"/turnos/{turno_id}/reprogramar",
        json={"inicio": "2026-10-12T11:00:00-03:00"},
    )

    assert r.status_code == 200
    assert _dt(r.json()["inicio"]) == _dt("2026-10-12T11:00:00-03:00")
    assert _dt(r.json()["fin"]) == _dt("2026-10-12T11:30:00-03:00")
    assert r.json()["estado"] == "pendiente"


def test_reprogramar_solape_da_409_original_intacto(client, db_session, ids):
    import uuid

    a = client.post("/turnos", json=_body(ids)).json()["id"]
    b = client.post(
        "/turnos",
        json=_body(
            ids,
            inicio="2026-10-12T11:00:00-03:00",
            sillon_id=str(ids["sillon2"]),
        ),
    )
    assert b.status_code == 201

    r = client.post(
        f"/turnos/{a}/reprogramar",
        json={"inicio": "2026-10-12T11:15:00-03:00"},
    )

    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "profesional"
    assert r.json()["detail"]["detalle"]
    db_session.expire_all()
    assert db_session.get(Turno, uuid.UUID(a)).inicio == _dt(LUNES_10)


def test_reprogramar_sin_inicio_da_422(client, db_session, ids):
    import uuid

    a = client.post("/turnos", json=_body(ids)).json()["id"]

    r = client.post(f"/turnos/{a}/reprogramar", json={})

    assert r.status_code == 422
    db_session.expire_all()
    assert db_session.get(Turno, uuid.UUID(a)).inicio == _dt(LUNES_10)


def test_reprogramar_inicio_naive_da_422(client, db_session, ids):
    import uuid

    a = client.post("/turnos", json=_body(ids)).json()["id"]

    r = client.post(
        f"/turnos/{a}/reprogramar", json={"inicio": "2026-10-12T11:00:00"}
    )

    assert r.status_code == 422
    db_session.expire_all()
    assert db_session.get(Turno, uuid.UUID(a)).inicio == _dt(LUNES_10)


def test_reprogramar_23p01_da_409_no_500(
    client, db_session, ids, monkeypatch
):
    import uuid
    from datetime import timedelta

    from backend.app.turnos.service import ServicioTurnos

    a = client.post("/turnos", json=_body(ids)).json()["id"]
    b = client.post(
        "/turnos",
        json=_body(
            ids,
            inicio="2026-10-12T11:00:00-03:00",
            sillon_id=str(ids["sillon2"]),
        ),
    )
    assert b.status_code == 201

    def _validar_sin_solape(session, *, prestacion_id, inicio, **_):
        prestacion = session.get(Prestacion, prestacion_id)
        return inicio + timedelta(minutes=prestacion.duracion_min)

    monkeypatch.setattr(
        ServicioTurnos, "validar", staticmethod(_validar_sin_solape)
    )

    r = client.post(
        f"/turnos/{a}/reprogramar",
        json={"inicio": "2026-10-12T11:15:00-03:00"},
    )

    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "profesional"
    db_session.expire_all()
    turno = db_session.get(Turno, uuid.UUID(a))
    assert (turno.inicio, turno.fin) == (
        _dt(LUNES_10),
        _dt(LUNES_10) + timedelta(minutes=30),
    )