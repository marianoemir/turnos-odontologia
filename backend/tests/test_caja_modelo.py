"""Invariantes de esquema de caja, cobro y liquidacion_os (C-10, 7.1)."""

from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from backend.app.caja.models import (
    MONTO_MAX_CENTAVOS,
    Caja,
    Cobro,
    LiquidacionOS,
)

pytestmark = pytest.mark.integration


def test_caja_fecha_unica(db_session):
    c1 = Caja(fecha=date(2026, 11, 4), monto_apertura_centavos=1000)
    db_session.add(c1)
    db_session.flush()

    c2 = Caja(fecha=date(2026, 11, 4), monto_apertura_centavos=2000)
    db_session.add(c2)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_cobro_restrict_caja(db_session):
    caja = Caja(fecha=date(2026, 11, 4), monto_apertura_centavos=1000)
    db_session.add(caja)
    db_session.flush()

    cobro = Cobro(
        caja_id=caja.id,
        medio="efectivo",
        monto_centavos=1000,
    )
    db_session.add(cobro)
    db_session.flush()

    db_session.delete(caja)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_monto_cobro_positivo(db_session):
    caja = Caja(fecha=date(2026, 11, 4), monto_apertura_centavos=1000)
    db_session.add(caja)
    db_session.flush()

    cobro = Cobro(
        caja_id=caja.id,
        medio="efectivo",
        monto_centavos=0,
    )
    db_session.add(cobro)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_monto_cobro_tope(db_session):
    caja = Caja(fecha=date(2026, 11, 4), monto_apertura_centavos=1000)
    db_session.add(caja)
    db_session.flush()

    cobro = Cobro(
        caja_id=caja.id,
        medio="efectivo",
        monto_centavos=MONTO_MAX_CENTAVOS + 1,
    )
    db_session.add(cobro)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_liquidacion_unica_por_cobro(db_session):
    caja = Caja(fecha=date(2026, 11, 4), monto_apertura_centavos=1000)
    db_session.add(caja)
    db_session.flush()

    cobro = Cobro(
        caja_id=caja.id,
        medio="obra_social",
        monto_centavos=5000,
    )
    db_session.add(cobro)
    db_session.flush()

    liq1 = LiquidacionOS(
        cobro_id=cobro.id,
        nomenclador_codigo="01.01",
        monto_total_centavos=5000,
        cobertura_centavos=4000,
        copago_centavos=1000,
    )
    db_session.add(liq1)
    db_session.flush()

    liq2 = LiquidacionOS(
        cobro_id=cobro.id,
        nomenclador_codigo="01.02",
        monto_total_centavos=5000,
        cobertura_centavos=4000,
        copago_centavos=1000,
    )
    db_session.add(liq2)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_montos_liquidacion_no_negativos(db_session):
    caja = Caja(fecha=date(2026, 11, 4), monto_apertura_centavos=1000)
    db_session.add(caja)
    db_session.flush()

    cobro = Cobro(
        caja_id=caja.id,
        medio="obra_social",
        monto_centavos=5000,
    )
    db_session.add(cobro)
    db_session.flush()

    # monto_total negativo
    with pytest.raises(IntegrityError), db_session.begin_nested():
        db_session.add(
            LiquidacionOS(
                cobro_id=cobro.id,
                nomenclador_codigo="01.01",
                monto_total_centavos=-1,
                cobertura_centavos=0,
                copago_centavos=-1,
            )
        )
        db_session.flush()

    # cobertura negativa
    with pytest.raises(IntegrityError), db_session.begin_nested():
        db_session.add(
            LiquidacionOS(
                cobro_id=cobro.id,
                nomenclador_codigo="01.01",
                monto_total_centavos=5000,
                cobertura_centavos=-100,
                copago_centavos=5100,
            )
        )
        db_session.flush()


def test_liquidacion_check_cobertura_copago(db_session):
    caja = Caja(fecha=date(2026, 11, 4), monto_apertura_centavos=1000)
    db_session.add(caja)
    db_session.flush()

    cobro = Cobro(
        caja_id=caja.id,
        medio="obra_social",
        monto_centavos=5000,
    )
    db_session.add(cobro)
    db_session.flush()

    # cobertura mayor al total (cobertura_no_excede_total)
    with pytest.raises(IntegrityError), db_session.begin_nested():
        db_session.add(
            LiquidacionOS(
                cobro_id=cobro.id,
                nomenclador_codigo="01.01",
                monto_total_centavos=5000,
                cobertura_centavos=6000,
                copago_centavos=-1000,
            )
        )
        db_session.flush()

    # copago inconsistente (copago_consistente)
    with pytest.raises(IntegrityError), db_session.begin_nested():
        db_session.add(
            LiquidacionOS(
                cobro_id=cobro.id,
                nomenclador_codigo="01.01",
                monto_total_centavos=5000,
                cobertura_centavos=3000,
                copago_centavos=1000,  # debería ser 2000
            )
        )
        db_session.flush()


def test_montos_bigint(db_session):
    monto_grande = 5_000_000_000  # mayor a 2^31 - 1
    caja = Caja(fecha=date(2026, 11, 4), monto_apertura_centavos=monto_grande)
    db_session.add(caja)
    db_session.flush()

    cobro = Cobro(
        caja_id=caja.id,
        medio="obra_social",
        monto_centavos=monto_grande,
    )
    db_session.add(cobro)
    db_session.flush()

    liq = LiquidacionOS(
        cobro_id=cobro.id,
        nomenclador_codigo="01.01",
        monto_total_centavos=monto_grande,
        cobertura_centavos=3_000_000_000,
        copago_centavos=2_000_000_000,
    )
    db_session.add(liq)
    db_session.flush()

    db_session.refresh(caja)
    db_session.refresh(cobro)
    db_session.refresh(liq)
    assert caja.monto_apertura_centavos == monto_grande
    assert cobro.monto_centavos == monto_grande
    assert liq.monto_total_centavos == monto_grande
    assert liq.cobertura_centavos == 3_000_000_000
    assert liq.copago_centavos == 2_000_000_000
