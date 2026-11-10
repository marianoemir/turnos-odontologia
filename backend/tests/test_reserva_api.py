"""API pública de reserva online (C-08, task 4.1 RED). Solo datos ficticios.

Contratos esperados (router aún no implementado):
- GET /reservar/{profesional}?prestacion=&fecha= -> 200 lista de {inicio, fin}
  ascendente, sin X-Actor-Rol.
- POST /reservar -> 201 sin X-Actor-Rol, cuerpo exactamente
  {turno_id, profesional_id, prestacion_id, inicio, fin, estado}.
- 404 profesional/prestación inexistente con cuerpo != {"detail":"Not Found"}
  (mapeo C-03: detail string).
- 422 fecha inválida (GET) / body incompleto (POST).
- 429 rate_limit al superar umbral en POST.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from backend.app.agenda.models import Paciente, Prestacion, Profesional
from backend.app.main import app
from backend.app.recordatorios.models import Recordatorio
from backend.app.recordatorios.router import get_db as recordatorios_get_db
from backend.app.seed.catalogo import seed_catalogo
from backend.app.turnos.models import Turno
from backend.app.turnos.router import get_db as turnos_get_db

pytestmark = pytest.mark.integration

TZ = ZoneInfo("America/Argentina/Buenos_Aires")
FECHA_LUNES = "2030-01-07"
INICIO_LUNES_10 = datetime(2030, 1, 7, 10, 0, tzinfo=TZ)


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
        "consulta30": db_session.query(Prestacion)
        .filter_by(nombre="Consulta")
        .one()
        .id,
    }


@pytest.fixture()
def reset_rate_limit_reserva():
    """Aísla el limitador de rate limit entre tests.

    Nombre esperado para 4.2: backend.app.reserva_online.router.resetear_rate_limit()
    (reset del contador en memoria por IP/ventana). Como el router no existe en
    4.1, el import se difiere al uso del fixture.
    """
    try:
        from backend.app.reserva_online.router import resetear_rate_limit

        resetear_rate_limit()
    except ImportError:
        pass
    yield
    try:
        from backend.app.reserva_online.router import resetear_rate_limit

        resetear_rate_limit()
    except ImportError:
        pass


@pytest.fixture()
def client(db_session, reset_rate_limit_reserva):
    def _override_db():
        yield db_session

    app.dependency_overrides[turnos_get_db] = _override_db
    app.dependency_overrides[recordatorios_get_db] = _override_db
    try:
        from backend.app.reserva_online.router import get_db as reserva_get_db

        app.dependency_overrides[reserva_get_db] = _override_db
    except ImportError:
        pass
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def _post_reserva_body(ids, **overrides):
    body = {
        "nombre": "Paciente Reserva API Ficticio",
        "dni": "DNI-RES-API-001",
        "contacto": "contacto ficticio",
        "profesional_id": str(ids["profesional"]),
        "prestacion_id": str(ids["consulta30"]),
        "inicio": "2030-01-07T10:00:00-03:00",
    }
    body.update(overrides)
    return body


def _get_slots(client, profesional_id, prestacion_id, fecha=FECHA_LUNES):
    return client.get(
        f"/reservar/{profesional_id}",
        params={"prestacion": str(prestacion_id), "fecha": fecha},
    )


def _assert_404_no_default_not_found(response):
    assert response.status_code == 404
    assert response.json() != {"detail": "Not Found"}
    assert isinstance(response.json().get("detail"), str)
    assert response.json()["detail"]


def _insertar_recordatorio(db_session, turno):
    token = secrets.token_urlsafe(32)
    recordatorio = Recordatorio(
        turno_id=turno.id,
        canal="log",
        etapa="48h",
        estado="enviado",
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expira_en=turno.inicio,
        inicio_turno=turno.inicio,
    )
    db_session.add(recordatorio)
    db_session.flush()
    return token, recordatorio


def test_get_reservar_200_sin_x_actor_rol(client, ids):
    r = _get_slots(client, ids["profesional"], ids["consulta30"])

    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert data
    for slot in data:
        assert set(slot.keys()) == {"inicio", "fin"}
    inicios = [slot["inicio"] for slot in data]
    assert inicios == sorted(inicios)


def test_post_reservar_201_sin_x_actor_rol(client, ids):
    r = client.post("/reservar", json=_post_reserva_body(ids))

    assert r.status_code == 201
    data = r.json()
    assert set(data.keys()) == {
        "turno_id",
        "profesional_id",
        "prestacion_id",
        "inicio",
        "fin",
        "estado",
    }
    assert data["estado"] == "pendiente"


def test_profesional_inexistente_get_y_post_404_sin_detail_not_found(client, ids):
    inexistente = uuid.uuid4()

    r_get = _get_slots(client, inexistente, ids["consulta30"])
    _assert_404_no_default_not_found(r_get)

    body = _post_reserva_body(ids, profesional_id=str(inexistente))
    r_post = client.post("/reservar", json=body)
    _assert_404_no_default_not_found(r_post)


def test_prestacion_inexistente_get_y_post_404_sin_detail_not_found(client, ids):
    inexistente = uuid.uuid4()

    r_get = _get_slots(client, ids["profesional"], inexistente)
    _assert_404_no_default_not_found(r_get)

    body = _post_reserva_body(ids, prestacion_id=str(inexistente))
    r_post = client.post("/reservar", json=body)
    _assert_404_no_default_not_found(r_post)


def test_get_reservar_fecha_invalida_422(client, ids):
    r = client.get(
        f"/reservar/{ids['profesional']}",
        params={"prestacion": str(ids["consulta30"]), "fecha": "no-es-fecha"},
    )

    assert r.status_code == 422


def test_post_reservar_body_incompleto_sin_dni_422(client, ids):
    body = _post_reserva_body(ids)
    body.pop("dni")

    r = client.post("/reservar", json=body)

    assert r.status_code == 422


def test_post_reservar_rate_limit_429(client, db_session, ids, monkeypatch):
    monkeypatch.setenv("RESERVA_RATE_LIMIT_N", "2")
    monkeypatch.setenv("RESERVA_RATE_LIMIT_VENTANA_SEG", "60")

    body1 = _post_reserva_body(
        ids,
        dni="DNI-RES-RL-001",
        inicio="2030-01-07T10:00:00-03:00",
    )
    body2 = _post_reserva_body(
        ids,
        dni="DNI-RES-RL-002",
        inicio="2030-01-07T10:30:00-03:00",
    )
    body3 = _post_reserva_body(
        ids,
        dni="DNI-RES-RL-003",
        inicio="2030-01-07T11:00:00-03:00",
    )

    r1 = client.post("/reservar", json=body1)
    r2 = client.post("/reservar", json=body2)
    antes_tercero = db_session.query(Turno).count()
    r3 = client.post("/reservar", json=body3)

    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r3.status_code == 429
    detail = r3.json().get("detail")
    detail_text = str(detail)
    assert "rate_limit" in detail_text
    assert db_session.query(Turno).count() == antes_tercero


def test_confirmar_token_sobre_turno_creado_por_reserva(client, db_session, ids):
    r = client.post("/reservar", json=_post_reserva_body(ids))
    assert r.status_code == 201
    turno_id = uuid.UUID(r.json()["turno_id"])
    turno = db_session.get(Turno, turno_id)
    token, _ = _insertar_recordatorio(db_session, turno)

    rc = client.post(f"/confirmar/{token}")

    assert rc.status_code == 200
    assert rc.json()["resultado"] == "confirmado"
    db_session.refresh(turno)
    assert turno.estado == "confirmado"


def test_hueco_liberado_vuelve_a_aparecer_en_get(client, db_session, ids):
    body = _post_reserva_body(
        ids,
        dni="DNI-RES-HUECO-001",
        inicio="2030-01-07T12:00:00-03:00",
    )
    r = client.post("/reservar", json=body)
    assert r.status_code == 201
    turno_id = r.json()["turno_id"]

    rc = client.post(f"/turnos/{turno_id}/cancelar")
    assert rc.status_code == 200
    assert rc.json()["estado"] == "cancelado"

    slots = _get_slots(client, ids["profesional"], ids["consulta30"])
    assert slots.status_code == 200
    inicios = [s["inicio"] for s in slots.json()]
    assert any(
        datetime.fromisoformat(i) == datetime(2030, 1, 7, 12, 0, tzinfo=TZ)
        for i in inicios
    )
