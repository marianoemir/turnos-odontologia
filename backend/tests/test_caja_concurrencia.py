"""Tests de concurrencia para caja y cobros con dos sesiones reales (C-10, 7.5).

Valida el orden global de locks `caja -> cobro` (D19) ejecutando operaciones
concurrentes en hilos separados con conexiones independientes a Postgres,
realizando commit() y limpieza explícita al final.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.caja.models import Caja, Cobro
from backend.app.caja.reloj import ZONA
from backend.app.caja.schemas import AnularCobro, CajaAbrir, CajaCerrar, CobroCreate
from backend.app.caja.service import (
    CajaCerrada,
    CajaException,
    CajaNoAbierta,
    CobroYaAnulado,
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
    """Garantiza pizarra limpia antes y después de cada test de concurrencia."""
    _limpiar_tablas(_db_engine)
    yield _db_engine
    _limpiar_tablas(_db_engine)


def test_concurrencia_doble_anulacion(db_sessions_cleanup):
    """Doble anulación concurrente del mismo cobro con dos sesiones reales.

    El orden de locks `caja -> cobro` serializa ambas operaciones. Una sesión
    debe anular con éxito y la otra debe fallar con CobroYaAnulado (409).
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

    resultados = []
    errores = []

    def _anular(motivo: str):
        with Session(engine) as session:
            try:
                c = ServicioCaja.anular_cobro(
                    session,
                    cobro_id,
                    AnularCobro(motivo=motivo),
                    ahora=ahora,
                )
                session.commit()
                resultados.append(c.estado)
            except CajaException as exc:
                session.rollback()
                errores.append(exc)

    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(_anular, "anulacion concurrente 1")
        f2 = executor.submit(_anular, "anulacion concurrente 2")
        f1.result()
        f2.result()

    # Exactamente una tuvo éxito y una falló por CobroYaAnulado
    assert len(resultados) == 1
    assert resultados[0] == "anulado"
    assert len(errores) == 1
    assert isinstance(errores[0], CobroYaAnulado)

    # Verificación final en base
    with Session(engine) as s_check:
        c_final = s_check.query(Cobro).filter(Cobro.id == cobro_id).one()
        assert c_final.estado == "anulado"


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
