"""ServicioRecordatorios.procesar (C-07, tasks 4.1/4.2/4.4).

Ventanas 48h/24h (D2), politica de etapas (D4), dedupe por
`(turno_id, etapa, inicio_turno)` (D3), mensaje persistido redactado (D12),
paciente sin contacto (D16) y `fallido` sin reintento (D14). Todo con `ahora`
inyectado y un `FakeNotificador`; nunca se usa el reloj real ni la red.
"""

from __future__ import annotations

import hashlib
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
from backend.app.recordatorios.notificadores import NotificacionFallida
from backend.app.recordatorios.service import ServicioRecordatorios
from backend.app.seed.catalogo import seed_catalogo
from backend.app.turnos.models import Turno

pytestmark = pytest.mark.integration

TZ = ZoneInfo("America/Argentina/Buenos_Aires")
AHORA = datetime(2026, 11, 10, 10, 0, tzinfo=TZ)


class FakeNotificador:
    """Captura los envios reales y simula el contrato de D10."""

    def __init__(self, *, canal="log", simulado=True, fallar=False):
        self.canal = canal
        self.simulado = simulado
        self.fallar = fallar
        self.envios: list[dict[str, str]] = []

    def enviar(self, *, destinatario, mensaje, token):
        if self.fallar:
            raise NotificacionFallida("transporte simulado caido")
        self.envios.append(
            {"destinatario": destinatario, "mensaje": mensaje, "token": token}
        )
        return f"SIM-FAKE-{len(self.envios)}"


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


def _insertar_turno(
    db_session,
    ids,
    *,
    inicio,
    estado="pendiente",
    paciente_id=None,
):
    """Inserta un turno sin pasar por la validacion de agenda."""
    nuevo_id = db_session.execute(
        text(
            "INSERT INTO turnos (id, paciente_id, profesional_id, "
            "sillon_id, prestacion_id, inicio, fin, estado) "
            "VALUES (gen_random_uuid(), :pac, :prof, :sil, :pres, "
            ":inicio, :fin, :estado) RETURNING id"
        ),
        {
            "pac": paciente_id or ids["paciente"],
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


def _recordatorio_previo(db_session, turno, *, etapa="48h"):
    db_session.add(
        Recordatorio(
            turno_id=turno.id,
            canal="log",
            etapa=etapa,
            estado="enviado",
            token_hash="a" * 64,
            expira_en=turno.inicio,
            inicio_turno=turno.inicio,
            proveedor_ref="SIM-PREVIO",
        )
    )
    db_session.flush()


def _procesar(db_session, *, ahora=AHORA, notificador=None, limite=200):
    return ServicioRecordatorios.procesar(
        db_session,
        ahora=ahora,
        notificador=notificador,
        limite=limite,
    )


def _unico(db_session) -> Recordatorio:
    return db_session.query(Recordatorio).one()


# ---------------------------------------------------------------------------
# D2: ventanas y bordes
# ---------------------------------------------------------------------------


def test_ventana_47h_etapa_48h(db_session):
    ids = _ids(db_session)
    turno = _insertar_turno(
        db_session, ids, inicio=AHORA + timedelta(hours=47)
    )
    fake = FakeNotificador()

    resumen = _procesar(db_session, notificador=fake)

    recordatorio = _unico(db_session)
    assert recordatorio.turno_id == turno.id
    assert recordatorio.etapa == "48h"
    assert recordatorio.estado == "enviado"
    assert recordatorio.expira_en == turno.inicio
    assert recordatorio.inicio_turno == turno.inicio
    assert recordatorio.creado_en == AHORA
    assert recordatorio.enviado_en == AHORA
    assert recordatorio.simulado is True
    assert recordatorio.proveedor_ref.startswith("SIM-")
    assert resumen.candidatos == 1
    assert resumen.enviados == 1
    assert resumen.omitidos == 0
    assert resumen.fallidos == 0
    assert len(fake.envios) == 1


def test_ventana_23h_sin_48h_previo_solo_24h(db_session):
    ids = _ids(db_session)
    _insertar_turno(db_session, ids, inicio=AHORA + timedelta(hours=23))
    fake = FakeNotificador()

    resumen = _procesar(db_session, notificador=fake)

    recordatorio = _unico(db_session)
    assert recordatorio.etapa == "24h"
    assert (
        db_session.query(Recordatorio).filter_by(etapa="48h").count() == 0
    )
    assert resumen.enviados == 1
    assert len(fake.envios) == 1


def test_borde_exacto_24h_pertenece_a_la_etapa_24h(db_session):
    ids = _ids(db_session)
    _insertar_turno(db_session, ids, inicio=AHORA + timedelta(hours=24))

    _procesar(db_session, notificador=FakeNotificador())

    assert _unico(db_session).etapa == "24h"


def test_borde_exacto_48h_pertenece_a_la_etapa_48h(db_session):
    ids = _ids(db_session)
    _insertar_turno(db_session, ids, inicio=AHORA + timedelta(hours=48))

    _procesar(db_session, notificador=FakeNotificador())

    assert _unico(db_session).etapa == "48h"


def test_turno_a_mas_de_48h_no_es_candidato(db_session):
    ids = _ids(db_session)
    _insertar_turno(
        db_session, ids, inicio=AHORA + timedelta(hours=48, minutes=1)
    )
    fake = FakeNotificador()

    resumen = _procesar(db_session, notificador=fake)

    assert resumen.candidatos == 0
    assert db_session.query(Recordatorio).count() == 0
    assert fake.envios == []


# ---------------------------------------------------------------------------
# D4: etapa 24h solo para pendientes
# ---------------------------------------------------------------------------


def test_confirmado_a_20h_no_recibe_etapa_24h(db_session):
    ids = _ids(db_session)
    _insertar_turno(
        db_session,
        ids,
        inicio=AHORA + timedelta(hours=20),
        estado="confirmado",
    )
    fake = FakeNotificador()

    resumen = _procesar(db_session, notificador=fake)

    assert db_session.query(Recordatorio).count() == 0
    assert fake.envios == []
    assert resumen.candidatos == 1
    assert resumen.enviados == 0


def test_pendiente_a_20h_recibe_etapa_24h(db_session):
    ids = _ids(db_session)
    _insertar_turno(
        db_session, ids, inicio=AHORA + timedelta(hours=20)
    )

    _procesar(db_session, notificador=FakeNotificador())

    assert _unico(db_session).etapa == "24h"


def test_confirmado_en_ventana_48h_si_recibe_etapa_48h(db_session):
    ids = _ids(db_session)
    _insertar_turno(
        db_session,
        ids,
        inicio=AHORA + timedelta(hours=30),
        estado="confirmado",
    )

    _procesar(db_session, notificador=FakeNotificador())

    assert _unico(db_session).etapa == "48h"


# ---------------------------------------------------------------------------
# D3: dedupe e idempotencia
# ---------------------------------------------------------------------------


def test_reprocesar_el_mismo_instante_no_duplica_ni_reenvia(db_session):
    ids = _ids(db_session)
    _insertar_turno(db_session, ids, inicio=AHORA + timedelta(hours=47))
    fake = FakeNotificador()

    primero = _procesar(db_session, notificador=fake)
    segundo = _procesar(db_session, notificador=fake)

    assert db_session.query(Recordatorio).count() == 1
    assert len(fake.envios) == 1
    assert primero.enviados == 1
    assert segundo.enviados == 0
    assert segundo.omitidos == 1


def test_recordatorio_previo_con_mismo_dedupe_omite_el_envio(db_session):
    ids = _ids(db_session)
    turno = _insertar_turno(
        db_session, ids, inicio=AHORA + timedelta(hours=47)
    )
    _recordatorio_previo(db_session, turno, etapa="48h")
    fake = FakeNotificador()

    resumen = _procesar(db_session, notificador=fake)

    assert db_session.query(Recordatorio).count() == 1
    assert fake.envios == []
    assert resumen.omitidos == 1
    assert resumen.enviados == 0


# ---------------------------------------------------------------------------
# Exclusiones de turnos
# ---------------------------------------------------------------------------


def test_excluye_cancelados_atendidos_ausentes_y_ya_iniciados(db_session):
    ids = _ids(db_session)
    _insertar_turno(
        db_session,
        ids,
        inicio=AHORA + timedelta(hours=10),
        estado="cancelado",
    )
    _insertar_turno(
        db_session,
        ids,
        inicio=AHORA + timedelta(hours=12),
        estado="atendido",
    )
    _insertar_turno(
        db_session,
        ids,
        inicio=AHORA + timedelta(hours=14),
        estado="ausente",
    )
    _insertar_turno(
        db_session, ids, inicio=AHORA - timedelta(hours=1)
    )
    fake = FakeNotificador()

    resumen = _procesar(db_session, notificador=fake)

    assert resumen.candidatos == 0
    assert db_session.query(Recordatorio).count() == 0
    assert fake.envios == []


# ---------------------------------------------------------------------------
# Canal: fabrica real simulada (sin red)
# ---------------------------------------------------------------------------


def test_sin_credencial_usa_canal_log(db_session, monkeypatch):
    monkeypatch.delenv("WHATSAPP_TOKEN", raising=False)
    ids = _ids(db_session)
    _insertar_turno(db_session, ids, inicio=AHORA + timedelta(hours=30))

    _procesar(db_session, notificador=None)

    recordatorio = _unico(db_session)
    assert recordatorio.canal == "log"
    assert recordatorio.estado == "enviado"
    assert recordatorio.proveedor_ref.startswith("SIM-LOG-")


def test_con_credencial_usa_canal_whatsapp(db_session, monkeypatch):
    monkeypatch.setenv("WHATSAPP_TOKEN", "ficticio")
    ids = _ids(db_session)
    _insertar_turno(db_session, ids, inicio=AHORA + timedelta(hours=30))

    _procesar(db_session, notificador=None)

    recordatorio = _unico(db_session)
    assert recordatorio.canal == "whatsapp"
    assert recordatorio.estado == "enviado"
    assert recordatorio.proveedor_ref.startswith("SIM-WA-")


# ---------------------------------------------------------------------------
# D14/4.4: fallido sin reintento
# ---------------------------------------------------------------------------


def test_fallido_no_se_reintenta(db_session):
    ids = _ids(db_session)
    _insertar_turno(db_session, ids, inicio=AHORA + timedelta(hours=47))
    fake_que_falla = FakeNotificador(fallar=True)

    primero = _procesar(db_session, notificador=fake_que_falla)

    recordatorio = _unico(db_session)
    assert recordatorio.estado == "fallido"
    assert recordatorio.error
    assert recordatorio.proveedor_ref is None
    assert recordatorio.enviado_en is None
    assert recordatorio.simulado is False
    assert primero.fallidos == 1
    assert fake_que_falla.envios == []

    fake_posterior = FakeNotificador()
    segundo = _procesar(db_session, notificador=fake_posterior)

    assert db_session.query(Recordatorio).count() == 1
    assert _unico(db_session).estado == "fallido"
    assert fake_posterior.envios == []
    assert segundo.omitidos == 1


# ---------------------------------------------------------------------------
# D16: paciente sin contacto
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("contacto", [None, "", "   "])
def test_paciente_sin_contacto_queda_fallido_sin_envio(
    db_session, contacto
):
    ids = _ids(db_session)
    paciente = db_session.get(Paciente, ids["paciente"])
    paciente.contacto = contacto
    db_session.flush()
    _insertar_turno(
        db_session, ids, inicio=AHORA + timedelta(hours=20)
    )
    fake = FakeNotificador()

    resumen = _procesar(db_session, notificador=fake)

    recordatorio = _unico(db_session)
    assert recordatorio.estado == "fallido"
    assert recordatorio.error == "sin_contacto"
    assert recordatorio.proveedor_ref is None
    assert recordatorio.enviado_en is None
    assert recordatorio.simulado is False
    assert recordatorio.canal == "log"
    assert fake.envios == []
    assert resumen.fallidos == 1

    fake_posterior = FakeNotificador()
    segundo = _procesar(db_session, notificador=fake_posterior)

    assert fake_posterior.envios == []
    assert segundo.omitidos == 1
    assert _unico(db_session).estado == "fallido"


# ---------------------------------------------------------------------------
# D12: mensaje persistido redactado; token real al notificador
# ---------------------------------------------------------------------------


def test_mensaje_persistido_redactado_y_token_real_al_notificador(
    db_session,
):
    ids = _ids(db_session)
    _insertar_turno(db_session, ids, inicio=AHORA + timedelta(hours=47))
    fake = FakeNotificador()

    _procesar(db_session, notificador=fake)

    recordatorio = _unico(db_session)
    envio = fake.envios[0]
    token = envio["token"]

    assert len(token) == 43
    assert token in envio["mensaje"]
    assert token not in recordatorio.mensaje
    assert recordatorio.mensaje is not None
    assert "/confirmar/<token>" in recordatorio.mensaje
    assert "/cancelar/<token>" in recordatorio.mensaje
    assert recordatorio.token_hash == hashlib.sha256(
        token.encode()
    ).hexdigest()


# ---------------------------------------------------------------------------
# Resumen con conteos
# ---------------------------------------------------------------------------


def test_resumen_con_conteos(db_session):
    ids = _ids(db_session)
    _insertar_turno(db_session, ids, inicio=AHORA + timedelta(hours=10))

    paciente_sin_contacto = (
        db_session.query(Paciente).filter_by(dni="DNI-FICT-002").one()
    )
    paciente_sin_contacto.contacto = None
    db_session.flush()
    _insertar_turno(
        db_session,
        ids,
        inicio=AHORA + timedelta(hours=20),
        paciente_id=paciente_sin_contacto.id,
    )

    turno_previo = _insertar_turno(
        db_session, ids, inicio=AHORA + timedelta(hours=30)
    )
    _recordatorio_previo(db_session, turno_previo, etapa="48h")

    resumen = _procesar(db_session, notificador=FakeNotificador())

    assert resumen.candidatos == 3
    assert resumen.enviados == 1
    assert resumen.omitidos == 1
    assert resumen.fallidos == 1
