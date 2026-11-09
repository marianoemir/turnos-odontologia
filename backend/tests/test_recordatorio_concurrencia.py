"""Concurrencia del procesamiento de recordatorios (C-07, task 4.5).

Dos sesiones reales, fuera de la transaccion de rollback de `db_session`,
compiten por el mismo `(turno_id, etapa, inicio_turno)`: la sesion A persiste
con `flush` y sin `commit`; el hilo B queda bloqueado en el UNIQUE de dedupe.
Al commitear A, B se desbloquea, omite el envio y no duplica. Limpieza
explicita de `recordatorio` y `turnos` antes y despues.
"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.agenda.models import (
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
)
from backend.app.recordatorios.models import Recordatorio
from backend.app.recordatorios.service import ServicioRecordatorios
from backend.app.seed.catalogo import seed_catalogo
from backend.app.turnos.models import Turno

pytestmark = pytest.mark.integration

TZ = ZoneInfo("America/Argentina/Buenos_Aires")
AHORA = datetime(2026, 11, 10, 10, 0, tzinfo=TZ)
INICIO = AHORA + timedelta(hours=47)


class FakeNotificador:
    def __init__(self):
        self.canal = "log"
        self.simulado = True
        self.envios: list[str] = []

    def enviar(self, *, destinatario, mensaje, token):
        self.envios.append(token)
        return f"SIM-FAKE-{len(self.envios)}"


def _limpiar_tablas(engine):
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE recordatorio, turnos CASCADE"))


@pytest.fixture()
def escenario_concurrencia(_db_engine):
    _limpiar_tablas(_db_engine)
    try:
        yield _db_engine
    finally:
        _limpiar_tablas(_db_engine)


def _crear_turno(engine) -> uuid.UUID:
    with Session(engine) as session:
        seed_catalogo(session)
        paciente = (
            session.query(Paciente).filter_by(dni="DNI-FICT-001").one()
        )
        profesional = (
            session.query(Profesional)
            .filter_by(matricula="MAT-FICT-001")
            .one()
        )
        sillon = (
            session.query(SillonBox).filter_by(nombre="Sillon 1").one()
        )
        prestacion = (
            session.query(Prestacion).filter_by(nombre="Consulta").one()
        )
        turno = Turno(
            paciente_id=paciente.id,
            profesional_id=profesional.id,
            sillon_id=sillon.id,
            prestacion_id=prestacion.id,
            inicio=INICIO,
            fin=INICIO + timedelta(minutes=30),
            estado="pendiente",
        )
        session.add(turno)
        session.flush()
        turno_id = turno.id
        session.commit()
        return turno_id


def test_dos_procesamientos_concurrentes_deduplican(escenario_concurrencia):
    engine = escenario_concurrencia
    turno_id = _crear_turno(engine)
    fake_a = FakeNotificador()
    fake_b = FakeNotificador()
    resumen_b = []
    error_b = []
    b_iniciado = threading.Event()

    session_a = Session(engine)
    try:
        # A persiste el recordatorio y lo envia, pero NO commitea.
        resumen_a = ServicioRecordatorios.procesar(
            session_a, ahora=AHORA, notificador=fake_a
        )
        assert session_a.query(Recordatorio).count() == 1

        def _procesar_b():
            with Session(engine) as session_b:
                b_iniciado.set()
                try:
                    resumen_b.append(
                        ServicioRecordatorios.procesar(
                            session_b, ahora=AHORA, notificador=fake_b
                        )
                    )
                    session_b.commit()
                except Exception as exc:  # noqa: BLE001
                    session_b.rollback()
                    error_b.append(exc)

        hilo_b = threading.Thread(target=_procesar_b)
        hilo_b.start()
        assert b_iniciado.wait(timeout=5.0)

        # B debe quedar bloqueado en el UNIQUE de dedupe mientras A no commitea.
        hilo_b.join(timeout=0.8)
        assert hilo_b.is_alive(), (
            "el hilo B deberia estar bloqueado en el UNIQUE de dedupe"
        )

        # A commitea: B se desbloquea y omite el envio.
        session_a.commit()
        hilo_b.join(timeout=5.0)
        assert not hilo_b.is_alive()
    finally:
        session_a.close()

    assert error_b == []
    assert resumen_a.enviados == 1
    assert len(resumen_b) == 1
    assert resumen_b[0].omitidos == 1
    assert resumen_b[0].enviados == 0
    assert len(fake_a.envios) == 1
    assert fake_b.envios == []
    assert len(fake_a.envios) + len(fake_b.envios) == 1

    with Session(engine) as s_check:
        registros = (
            s_check.query(Recordatorio)
            .filter_by(turno_id=turno_id, etapa="48h")
            .all()
        )
        assert len(registros) == 1
        assert registros[0].inicio_turno == INICIO
        assert registros[0].estado == "enviado"
