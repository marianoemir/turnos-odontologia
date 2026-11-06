"""ServicioRecordatorios.resolver_token (C-07, tasks 5.1/5.2).

Una prueba por fila de la tabla de precedencia D7, con `ahora` inyectado. El
token crudo solo existe en el test; la tabla guarda sha256 (D6). Los turnos se
insertan por SQL para no depender de la validacion de agenda.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import text

from backend.app.agenda.models import (
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
)
from backend.app.recordatorios.models import Recordatorio
from backend.app.recordatorios.service import (
    AccionYaUsada,
    ServicioRecordatorios,
    TokenNoEncontrado,
)
from backend.app.seed.catalogo import seed_catalogo
from backend.app.turnos.models import Turno

pytestmark = pytest.mark.integration

TZ = ZoneInfo("America/Argentina/Buenos_Aires")
AHORA = datetime(2026, 11, 10, 10, 0, tzinfo=TZ)
INICIO = AHORA + timedelta(hours=47)


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
        "sillon": db_session.query(SillonBox)
        .filter_by(nombre="Sillon 1")
        .one()
        .id,
        "consulta30": db_session.query(Prestacion)
        .filter_by(nombre="Consulta")
        .one()
        .id,
    }


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


def _resolver(db_session, token, *, accion, ahora=AHORA):
    return ServicioRecordatorios.resolver_token(
        db_session, token, accion=accion, ahora=ahora
    )


# ---------------------------------------------------------------------------
# Fila 2: token inexistente -> 404
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("accion", ["confirmar", "cancelar"])
def test_token_inexistente_levanta_token_no_encontrado(db_session, accion):
    ids = _ids(db_session)
    turno = _insertar_turno(db_session, ids)

    with pytest.raises(TokenNoEncontrado):
        _resolver(db_session, secrets.token_urlsafe(32), accion=accion)

    db_session.refresh(turno)
    assert turno.estado == "pendiente"
    assert db_session.query(Recordatorio).count() == 0


# ---------------------------------------------------------------------------
# Fila 3: misma accion sobre token usado -> 200 idempotente
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("accion", "estado_recordatorio", "estado_turno"),
    [
        ("confirmar", "confirmado", "confirmado"),
        ("cancelar", "cancelado", "cancelado"),
    ],
)
def test_misma_accion_repetida_es_idempotente(
    db_session, accion, estado_recordatorio, estado_turno
):
    ids = _ids(db_session)
    turno = _insertar_turno(db_session, ids, estado=estado_turno)
    respondido = AHORA - timedelta(hours=1)
    token, recordatorio = _recordatorio(
        db_session,
        turno,
        estado=estado_recordatorio,
        respondido_en=respondido,
    )

    resolucion = _resolver(db_session, token, accion=accion)

    assert resolucion.resultado == estado_recordatorio
    assert resolucion.turno_id == turno.id
    assert resolucion.inicio == turno.inicio
    assert recordatorio.estado == estado_recordatorio
    assert recordatorio.respondido_en == respondido
    db_session.refresh(turno)
    assert turno.estado == estado_turno


# ---------------------------------------------------------------------------
# Fila 4: accion opuesta sobre token usado -> 409 ya_usado
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("accion", "accion_previa", "estado_turno"),
    [
        ("cancelar", "confirmado", "confirmado"),
        ("confirmar", "cancelado", "cancelado"),
    ],
)
def test_accion_opuesta_levanta_accion_ya_usada(
    db_session, accion, accion_previa, estado_turno
):
    ids = _ids(db_session)
    turno = _insertar_turno(db_session, ids, estado=estado_turno)
    token, recordatorio = _recordatorio(
        db_session, turno, estado=accion_previa
    )

    with pytest.raises(AccionYaUsada) as excinfo:
        _resolver(db_session, token, accion=accion)

    assert excinfo.value.accion_previa == accion_previa
    assert recordatorio.estado == accion_previa
    db_session.refresh(turno)
    assert turno.estado == estado_turno


# ---------------------------------------------------------------------------
# Fila 5: recordatorio pendiente/fallido -> 200 expirado
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("estado", ["pendiente", "fallido"])
def test_recordatorio_no_enviado_responde_expirado(db_session, estado):
    ids = _ids(db_session)
    turno = _insertar_turno(db_session, ids)
    token, recordatorio = _recordatorio(db_session, turno, estado=estado)

    resolucion = _resolver(db_session, token, accion="confirmar")

    assert resolucion.resultado == "expirado"
    assert resolucion.turno_id == turno.id
    assert resolucion.inicio == turno.inicio
    assert recordatorio.estado == estado
    assert recordatorio.respondido_en is None
    db_session.refresh(turno)
    assert turno.estado == "pendiente"


# ---------------------------------------------------------------------------
# Fila 6: ahora > expira_en -> 200 expirado
# ---------------------------------------------------------------------------


def test_token_vencido_responde_expirado_y_no_modifica_el_turno(db_session):
    ids = _ids(db_session)
    turno = _insertar_turno(db_session, ids)
    token, recordatorio = _recordatorio(db_session, turno)

    resolucion = _resolver(
        db_session,
        token,
        accion="confirmar",
        ahora=INICIO + timedelta(minutes=1),
    )

    assert resolucion.resultado == "expirado"
    assert recordatorio.estado == "enviado"
    assert recordatorio.respondido_en is None
    db_session.refresh(turno)
    assert turno.estado == "pendiente"


# ---------------------------------------------------------------------------
# Fila 7: confirmar turno pendiente -> confirmado
# ---------------------------------------------------------------------------


def test_confirmar_turno_pendiente_confirma_y_consume_el_token(db_session):
    ids = _ids(db_session)
    turno = _insertar_turno(db_session, ids)
    token, recordatorio = _recordatorio(db_session, turno)

    resolucion = _resolver(db_session, token, accion="confirmar")

    assert resolucion.resultado == "confirmado"
    assert resolucion.turno_id == turno.id
    assert resolucion.inicio == turno.inicio
    db_session.refresh(turno)
    assert turno.estado == "confirmado"
    assert recordatorio.estado == "confirmado"
    assert recordatorio.respondido_en == AHORA


# ---------------------------------------------------------------------------
# Fila 8: confirmar turno ya confirmado -> 200 y consume el token
# ---------------------------------------------------------------------------


def test_confirmar_turno_ya_confirmado_consume_el_token(db_session):
    ids = _ids(db_session)
    turno = _insertar_turno(db_session, ids, estado="confirmado")
    token, recordatorio = _recordatorio(db_session, turno)

    resolucion = _resolver(db_session, token, accion="confirmar")

    assert resolucion.resultado == "confirmado"
    db_session.refresh(turno)
    assert turno.estado == "confirmado"
    assert recordatorio.estado == "confirmado"
    assert recordatorio.respondido_en == AHORA


# ---------------------------------------------------------------------------
# Fila 9: cancelar turno pendiente/confirmado -> cancelado
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("estado", ["pendiente", "confirmado"])
def test_cancelar_turno_activo_cancela_y_consume_el_token(
    db_session, estado
):
    ids = _ids(db_session)
    turno = _insertar_turno(db_session, ids, estado=estado)
    token, recordatorio = _recordatorio(db_session, turno)

    resolucion = _resolver(db_session, token, accion="cancelar")

    assert resolucion.resultado == "cancelado"
    assert resolucion.turno_id == turno.id
    assert resolucion.inicio == turno.inicio
    db_session.refresh(turno)
    assert turno.estado == "cancelado"
    assert recordatorio.estado == "cancelado"
    assert recordatorio.respondido_en == AHORA


# ---------------------------------------------------------------------------
# Fila 10: cualquier otra accion/estado -> 200 expirado
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("accion", "estado_turno"),
    [
        ("confirmar", "cancelado"),
        ("confirmar", "atendido"),
        ("confirmar", "ausente"),
        ("cancelar", "cancelado"),
        ("cancelar", "atendido"),
        ("cancelar", "ausente"),
    ],
)
def test_turno_que_no_admite_la_accion_responde_expirado(
    db_session, accion, estado_turno
):
    ids = _ids(db_session)
    turno = _insertar_turno(db_session, ids, estado=estado_turno)
    token, recordatorio = _recordatorio(db_session, turno)

    resolucion = _resolver(db_session, token, accion=accion)

    assert resolucion.resultado == "expirado"
    assert recordatorio.estado == "enviado"
    assert recordatorio.respondido_en is None
    db_session.refresh(turno)
    assert turno.estado == estado_turno
