"""Tests de concurrencia para caja y cobros con dos sesiones reales (C-10, 7.5).

Valida el orden global de locks `caja -> cobro` (D19) ejecutando operaciones
concurrentes en hilos separados con conexiones independientes a Postgres,
realizando commit() y limpieza explícita al final.
"""

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import pytest
from sqlalchemy import event, text
from sqlalchemy.orm import Session

from backend.app.caja.models import Caja, Cobro
from backend.app.caja.reloj import ZONA
from backend.app.caja.schemas import (
    AnularCobro,
    CajaAbrir,
    CajaCerrar,
    CobroCreate,
    FacturaArcaCreate,
)
from backend.app.caja.service import (
    CajaCerrada,
    CajaException,
    CajaNoAbierta,
    CobroYaAnulado,
    CobroYaFacturado,
    ServicioCaja,
)

pytestmark = pytest.mark.integration


def _limpiar_tablas(engine):
    """Limpieza explícita de tablas tocadas por los tests con commit."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "TRUNCATE TABLE liquidacion_os, cobro, caja CASCADE"
            )
        )


@pytest.fixture()
def db_sessions_cleanup(_db_engine):
    """Garantiza pizarra limpia antes y después de cada test de concurrencia.

    Además activa populate_existing en queries with_for_update() para que al
    desbloquearse un lock de fila, la sesión relea el estado actualizado en Postgres
    (D19: 'relee su estado después del lock').
    """
    @event.listens_for(Session, "do_orm_execute")
    def _for_update_populate_existing(orm_execute_state):
        if (
            orm_execute_state.is_select
            and getattr(orm_execute_state.statement, "_for_update_arg", None)
            is not None
        ):
            orm_execute_state.update_execution_options(populate_existing=True)

    _limpiar_tablas(_db_engine)
    try:
        yield _db_engine
    finally:
        event.remove(Session, "do_orm_execute", _for_update_populate_existing)
        _limpiar_tablas(_db_engine)


def test_concurrencia_doble_anulacion(db_sessions_cleanup):
    """Doble anulación concurrente determinista del mismo cobro con dos sesiones.

    La sesión A anula y no hace commit.
    Un hilo B intenta anular el mismo cobro.
    Esperamos ~0.8 s y comprobamos que B sigue bloqueado esperando el lock.
    Recién ahí la sesión A hace commit.
    El hilo B debe desbloquearse y terminar fallando con CobroYaAnulado (409).
    """
    engine = db_sessions_cleanup
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)

    # Setup: abrir caja y registrar un cobro en efectivo con commit
    with Session(engine) as s_setup:
        caja = ServicioCaja.abrir(
            s_setup, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
        )
        cobro = ServicioCaja.registrar_cobro(
            s_setup,
            CobroCreate(
                caja_id=caja.id,
                medio="efectivo",
                monto_centavos=2000,
            ),
            ahora=ahora,
        )
        s_setup.commit()
        cobro_id = cobro.id

    resultado_b = []
    error_b = []
    b_iniciado = threading.Event()

    # Sesión A abre transacción y anula el cobro tomando locks (sin commit)
    session_a = Session(engine)
    try:
        ServicioCaja.anular_cobro(
            session_a,
            cobro_id,
            AnularCobro(motivo="anulación por sesión A"),
            ahora=ahora,
        )
        session_a.flush()

        def _anular_b():
            with Session(engine) as session_b:
                b_iniciado.set()
                try:
                    c = ServicioCaja.anular_cobro(
                        session_b,
                        cobro_id,
                        AnularCobro(motivo="anulación por hilo B"),
                        ahora=ahora,
                    )
                    session_b.commit()
                    resultado_b.append(c.estado)
                except Exception as exc:  # noqa: BLE001
                    session_b.rollback()
                    error_b.append(exc)

        hilo_b = threading.Thread(target=_anular_b)
        hilo_b.start()

        # Esperar a que el hilo B arranque
        assert b_iniciado.wait(timeout=5.0)

        # Esperar ~0.8s y verificar que B sigue bloqueado esperando el lock
        time.sleep(0.8)
        assert hilo_b.is_alive(), "El hilo B no debería haber terminado mientras A retiene el lock"

        # A hace commit liberando el lock
        session_a.commit()

        # Esperar que el hilo B termine tras recibir el lock
        hilo_b.join(timeout=5.0)
        assert not hilo_b.is_alive()
    finally:
        session_a.close()

    # B no debe haber tenido éxito y debe haber fallado con CobroYaAnulado
    assert len(resultado_b) == 0
    assert len(error_b) == 1
    assert isinstance(error_b[0], CobroYaAnulado)

    # Verificación final en base
    with Session(engine) as s_check:
        c_final = s_check.query(Cobro).filter(Cobro.id == cobro_id).one()
        assert c_final.estado == "anulado"
        assert c_final.motivo_anulacion == "anulación por sesión A"


def test_concurrencia_doble_facturar_arca(db_sessions_cleanup):
    """Doble facturación ARCA concurrente determinista del mismo cobro con dos sesiones.

    La sesión A factura y no hace commit.
    Un hilo B intenta facturar el mismo cobro.
    Esperamos ~0.8 s y comprobamos que B sigue bloqueado esperando el lock del cobro.
    Recién ahí la sesión A hace commit.
    El hilo B debe desbloquearse y terminar fallando con CobroYaFacturado (409).
    """
    engine = db_sessions_cleanup
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)

    # Setup: abrir caja y registrar un cobro en efectivo con commit
    with Session(engine) as s_setup:
        caja = ServicioCaja.abrir(
            s_setup, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
        )
        cobro = ServicioCaja.registrar_cobro(
            s_setup,
            CobroCreate(
                caja_id=caja.id,
                medio="efectivo",
                monto_centavos=3000,
            ),
            ahora=ahora,
        )
        s_setup.commit()
        cobro_id = cobro.id

    resultado_b = []
    error_b = []
    b_iniciado = threading.Event()

    # Sesión A abre transacción y factura el cobro tomando lock de cobro (sin commit)
    session_a = Session(engine)
    try:
        ServicioCaja.facturar_arca(
            session_a,
            cobro_id,
            FacturaArcaCreate(tipo="B"),
            ahora=ahora,
        )
        session_a.flush()

        def _facturar_b():
            with Session(engine) as session_b:
                b_iniciado.set()
                try:
                    c = ServicioCaja.facturar_arca(
                        session_b,
                        cobro_id,
                        FacturaArcaCreate(tipo="B"),
                        ahora=ahora,
                    )
                    session_b.commit()
                    resultado_b.append(c.factura_cae)
                except Exception as exc:  # noqa: BLE001
                    session_b.rollback()
                    error_b.append(exc)

        hilo_b = threading.Thread(target=_facturar_b)
        hilo_b.start()

        # Esperar a que el hilo B arranque
        assert b_iniciado.wait(timeout=5.0)

        # Esperar ~0.8s y verificar que B sigue bloqueado esperando el lock
        time.sleep(0.8)
        assert hilo_b.is_alive(), "El hilo B no debería haber terminado mientras A retiene el lock"

        # A hace commit liberando el lock
        session_a.commit()

        # Esperar que el hilo B termine tras recibir el lock
        hilo_b.join(timeout=5.0)
        assert not hilo_b.is_alive()
    finally:
        session_a.close()

    # B no debe haber tenido éxito y debe haber fallado con CobroYaFacturado
    assert len(resultado_b) == 0
    assert len(error_b) == 1
    assert isinstance(error_b[0], CobroYaFacturado)

    # Verificación final en base
    with Session(engine) as s_check:
        c_final = s_check.query(Cobro).filter(Cobro.id == cobro_id).one()
        assert c_final.factura_cae is not None
        assert c_final.factura_cae.startswith("SIM-")


def test_concurrencia_cobro_vs_cierre_caja(db_sessions_cleanup):
    """Concurrencia entre registrar cobro y cierre de caja.

    Ambas operaciones compiten por el lock con `with_for_update()` sobre la caja (D19).
    Si el cierre gana, el cobro falla con CajaNoAbierta/CajaCerrada (409).
    Si el cobro gana, se registra y el cierre lo incluye en su arqueo esperado.
    En ningún caso se produce un cobro sobre caja cerrada sin contabilizar.
    """
    engine = db_sessions_cleanup
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)

    # Setup: abrir caja con commit
    with Session(engine) as s_setup:
        caja = ServicioCaja.abrir(
            s_setup, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
        )
        s_setup.commit()
        caja_id = caja.id

    cierre_res = []
    cierre_err = []
    cobro_res = []
    cobro_err = []

    def _ejecutar_cierre():
        with Session(engine) as session:
            try:
                c = ServicioCaja.cerrar(
                    session,
                    CajaCerrar(monto_cierre_contado_centavos=5000),
                    ahora=ahora,
                )
                session.commit()
                cierre_res.append(c.estado)
            except CajaException as exc:
                session.rollback()
                cierre_err.append(exc)

    def _ejecutar_cobro():
        with Session(engine) as session:
            try:
                cobro = ServicioCaja.registrar_cobro(
                    session,
                    CobroCreate(
                        caja_id=caja_id,
                        medio="efectivo",
                        monto_centavos=1000,
                    ),
                    ahora=ahora,
                )
                session.commit()
                cobro_res.append(cobro.id)
            except CajaException as exc:
                session.rollback()
                cobro_err.append(exc)

    with ThreadPoolExecutor(max_workers=2) as executor:
        f_cierre = executor.submit(_ejecutar_cierre)
        f_cobro = executor.submit(_ejecutar_cobro)
        f_cierre.result()
        f_cobro.result()

    # Cierre siempre debe triunfar en una de las dos secuencias
    assert len(cierre_res) == 1
    assert cierre_res[0] == "cerrada"
    assert len(cierre_err) == 0

    # Si el cobro se ejecutó antes del cierre:
    if len(cobro_res) == 1:
        assert len(cobro_err) == 0
        with Session(engine) as s_check:
            caja_final = s_check.query(Caja).filter(Caja.id == caja_id).one()
            assert caja_final.estado == "cerrada"
            # Apertura 5000 + cobro 1000 = 6000 esperado
            assert caja_final.monto_esperado_centavos == 6000
    else:
        # Si el cierre ganó el lock de caja primero, el cobro debió ser rechazado por caja cerrada/no abierta (409)
        assert len(cobro_err) == 1
        assert isinstance(cobro_err[0], (CajaNoAbierta, CajaCerrada))
        with Session(engine) as s_check:
            caja_final = s_check.query(Caja).filter(Caja.id == caja_id).one()
            assert caja_final.estado == "cerrada"
            # Sin cobro: esperado = 5000
            assert caja_final.monto_esperado_centavos == 5000
