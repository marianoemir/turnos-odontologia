"""API publica de confirmacion/cancelacion por token (C-07, tasks 6.1/6.2).

Cubre la tabla D7 y el contrato D11: 200 `confirmado`/`cancelado`/`expirado`,
409 `ya_usado`, 404, 422, el alta liberada tras cancelar por link y la
ausencia de datos personales en la respuesta. El token crudo solo vive en el
test; la tabla guarda sha256.
"""

from __future__ import annotations

import hashlib
import secrets
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
from backend.app.recordatorios.models import Recordatorio
from backend.app.recordatorios.router import (
    get_ahora as recordatorios_get_ahora,
)
from backend.app.recordatorios.router import (
    get_db as recordatorios_get_db,
)
from backend.app.seed.catalogo import seed_catalogo
from backend.app.turnos.models import Turno
from backend.app.turnos.router import get_db as turnos_get_db

pytestmark = pytest.mark.integration

TZ = ZoneInfo("America/Argentina/Buenos_Aires")
AHORA = datetime(2026, 11, 10, 10, 0, tzinfo=TZ)
INICIO = AHORA + timedelta(hours=47)
NOMBRE_PACIENTE = "Paciente Ficticio 1"
DNI_PACIENTE = "DNI-FICT-001"
CONTACTO_PACIENTE = "tel 11-0000-0001"


@pytest.fixture()
def ids(db_session):
    seed_catalogo(db_session)
    return {
        "paciente": db_session.query(Paciente)
        .filter_by(dni=DNI_PACIENTE)
        .one()
        .id,
        "profesional": db_session.query(Profesional)
        .filter_by(matricula="MAT-FICT-001")
        .one()
        .id,
        "sillon": db_session.query(SillonBox)
        .filter_by(nombre="Sillon 1")
        .one()
        .id,
        "consulta30": db_session.query(Prestacion)
        .filter_by(nombre="Consulta")
        .one()
        .id,
    }


@pytest.fixture()
def client(db_session):
    def _override_db():
        yield db_session

    app.dependency_overrides[recordatorios_get_db] = _override_db
    app.dependency_overrides[turnos_get_db] = _override_db
    app.dependency_overrides[recordatorios_get_ahora] = lambda: AHORA
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture()
def reloj(client):
    """Permite mover el reloj inyectado dentro de un test."""

    def _fijar(instante):
        app.dependency_overrides[recordatorios_get_ahora] = lambda: instante

    return _fijar


def _insertar_turno(db_session, ids, *, inicio=INICIO, estado="pendiente"):
    nuevo_id = db_session.execute(
        text(
            "INSERT INTO turnos (id, paciente_id, profesional_id, "
            "sillon_id, prestacion_id, inicio, fin, estado) "
            "VALUES (gen_random_uuid(), :pac, :prof, :sil, :pres, "
            ":inicio, :fin, :estado) RETURNING id"
        ),
        {
            "pac": ids["paciente"],
            "prof": ids["profesional"],
            "sil": ids["sillon"],
            "pres": ids["consulta30"],
            "inicio": inicio,
            "fin": inicio + timedelta(minutes=30),
            "estado": estado,
        },
    ).scalar_one()
    db_session.flush()
    return db_session.get(Turno, nuevo_id)


def _recordatorio(
    db_session,
    turno,
    *,
    token=None,
    estado="enviado",
    respondido_en=None,
):
    token = token or secrets.token_urlsafe(32)
    recordatorio = Recordatorio(
        turno_id=turno.id,
        canal="log",
        etapa="48h",
        estado=estado,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expira_en=turno.inicio,
        inicio_turno=turno.inicio,
        respondido_en=respondido_en,
    )
    db_session.add(recordatorio)
    db_session.flush()
    return token, recordatorio


def _inicio_iso(valor):
    return datetime.fromisoformat(valor)


# ---------------------------------------------------------------------------
# 200 confirmado / 200 cancelado
# ---------------------------------------------------------------------------


def test_confirmar_valido_da_200_confirmado(client, db_session, ids):
    turno = _insertar_turno(db_session, ids)
    token, recordatorio = _recordatorio(db_session, turno)

    r = client.post(f"/confirmar/{token}")

    assert r.status_code == 200
    data = r.json()
    assert data["resultado"] == "confirmado"
    assert data["turno_id"] == str(turno.id)
    assert _inicio_iso(data["inicio"]) == INICIO
    db_session.refresh(turno)
    assert turno.estado == "confirmado"
    assert recordatorio.estado == "confirmado"
    assert recordatorio.respondido_en == AHORA


def test_cancelar_valido_da_200_cancelado(client, db_session, ids):
    turno = _insertar_turno(db_session, ids)
    token, recordatorio = _recordatorio(db_session, turno)

    r = client.post(f"/cancelar/{token}")

    assert r.status_code == 200
    data = r.json()
    assert data["resultado"] == "cancelado"
    assert data["turno_id"] == str(turno.id)
    assert _inicio_iso(data["inicio"]) == INICIO
    db_session.refresh(turno)
    assert turno.estado == "cancelado"
    assert recordatorio.estado == "cancelado"
    assert recordatorio.respondido_en == AHORA


# ---------------------------------------------------------------------------
# Idempotencia de la misma accion (ambas)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("accion", "resultado", "estado_turno"),
    [
        ("confirmar", "confirmado", "confirmado"),
        ("cancelar", "cancelado", "cancelado"),
    ],
)
def test_misma_accion_repetida_es_idempotente(
    client, db_session, ids, accion, resultado, estado_turno
):
    turno = _insertar_turno(db_session, ids)
    token, recordatorio = _recordatorio(db_session, turno)

    primera = client.post(f"/{accion}/{token}")
    respondido = recordatorio.respondido_en
    segunda = client.post(f"/{accion}/{token}")

    assert primera.status_code == 200
    assert primera.json()["resultado"] == resultado
    assert segunda.status_code == 200
    assert segunda.json()["resultado"] == resultado
    db_session.refresh(turno)
    assert turno.estado == estado_turno
    assert recordatorio.respondido_en == respondido


# ---------------------------------------------------------------------------
# 409 accion opuesta
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("accion", "accion_previa", "estado_turno"),
    [
        ("cancelar", "confirmado", "confirmado"),
        ("confirmar", "cancelado", "cancelado"),
    ],
)
def test_accion_opuesta_da_409_ya_usado(
    client, db_session, ids, accion, accion_previa, estado_turno
):
    turno = _insertar_turno(db_session, ids, estado=estado_turno)
    token, _ = _recordatorio(db_session, turno, estado=accion_previa)

    r = client.post(f"/{accion}/{token}")

    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["causa"] == "ya_usado"
    assert detail["detalle"]
    assert detail["accion_previa"] == accion_previa
    db_session.refresh(turno)
    assert turno.estado == estado_turno


# ---------------------------------------------------------------------------
# 404 / 422
# ---------------------------------------------------------------------------


def test_token_bien_formado_inexistente_da_404(client, db_session):
    token = secrets.token_urlsafe(32)
    assert len(token) == 43

    r = client.post(f"/confirmar/{token}")

    assert r.status_code == 404
    assert db_session.query(Recordatorio).count() == 0


@pytest.mark.parametrize("accion", ["confirmar", "cancelar"])
def test_token_mal_formado_da_422(client, accion):
    r = client.post(f"/{accion}/abc")

    assert r.status_code == 422


# ---------------------------------------------------------------------------
# 200 expirado
# ---------------------------------------------------------------------------


def test_expirado_por_reloj(client, db_session, reloj, ids):
    turno = _insertar_turno(db_session, ids)
    token, recordatorio = _recordatorio(db_session, turno)
    reloj(INICIO + timedelta(minutes=1))

    r = client.post(f"/confirmar/{token}")

    assert r.status_code == 200
    assert r.json()["resultado"] == "expirado"
    db_session.refresh(turno)
    assert turno.estado == "pendiente"
    assert recordatorio.estado == "enviado"
    assert recordatorio.respondido_en is None


@pytest.mark.parametrize("accion", ["confirmar", "cancelar"])
def test_expirado_por_turno_cancelado_por_recepcion(
    client, db_session, ids, accion
):
    turno = _insertar_turno(db_session, ids, estado="cancelado")
    token, recordatorio = _recordatorio(db_session, turno)

    r = client.post(f"/{accion}/{token}")

    assert r.status_code == 200
    assert r.json()["resultado"] == "expirado"
    db_session.refresh(turno)
    assert turno.estado == "cancelado"
    assert recordatorio.estado == "enviado"
    assert recordatorio.respondido_en is None


# ---------------------------------------------------------------------------
# Hueco liberado tras cancelar por link
# ---------------------------------------------------------------------------


def test_alta_201_en_el_mismo_intervalo_tras_cancelar_por_link(
    client, db_session, ids
):
    turno = _insertar_turno(db_session, ids)
    token, _ = _recordatorio(db_session, turno)

    cancelacion = client.post(f"/cancelar/{token}")
    assert cancelacion.status_code == 200
    assert cancelacion.json()["resultado"] == "cancelado"

    alta = client.post(
        "/turnos",
        json={
            "paciente_id": str(ids["paciente"]),
            "profesional_id": str(ids["profesional"]),
            "sillon_id": str(ids["sillon"]),
            "prestacion_id": str(ids["consulta30"]),
            "inicio": INICIO.isoformat(),
        },
    )

    assert alta.status_code == 201
    assert db_session.query(Turno).count() == 2


# ---------------------------------------------------------------------------
# Sin datos personales en la respuesta
# ---------------------------------------------------------------------------


def test_respuesta_no_expone_datos_personales(client, db_session, ids):
    turno = _insertar_turno(db_session, ids)
    token, _ = _recordatorio(db_session, turno)

    r = client.post(f"/confirmar/{token}")

    assert r.status_code == 200
    data = r.json()
    assert set(data) == {"resultado", "turno_id", "inicio"}
    for dato in (
        NOMBRE_PACIENTE,
        DNI_PACIENTE,
        CONTACTO_PACIENTE,
        token,
    ):
        assert dato not in r.text
