"""Tests puros de Pydantic para los schemas de caja (C-10, 7.4)."""

from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError

from backend.app.caja.models import MONTO_MAX_CENTAVOS
from backend.app.caja.schemas import (
    MODO_ARCA_SIMULADO,
    SIMULADO_ARCA,
    AnularCobro,
    CajaAbrir,
    CajaCerrar,
    CobroCreate,
    CobroOut,
    FacturaArcaCreate,
    FacturaArcaOut,
    LiquidacionOSOut,
)


def test_apertura_monto_negativo():
    with pytest.raises(ValidationError):
        CajaAbrir(monto_apertura_centavos=-1)


def test_apertura_monto_maximo():
    with pytest.raises(ValidationError):
        CajaAbrir(monto_apertura_centavos=MONTO_MAX_CENTAVOS + 1)


def test_apertura_valida():
    # Ignora extras como fecha (D30: fecha no se recibe en apertura)
    req = CajaAbrir.model_validate({"monto_apertura_centavos": 1000, "fecha": "2026-11-04"})
    assert req.monto_apertura_centavos == 1000
    assert not hasattr(req, "fecha")


def test_cierre_monto_negativo():
    with pytest.raises(ValidationError):
        CajaCerrar(monto_cierre_contado_centavos=-1)


def test_cierre_monto_maximo():
    with pytest.raises(ValidationError):
        CajaCerrar(monto_cierre_contado_centavos=MONTO_MAX_CENTAVOS + 1)


def test_cierre_valido():
    req = CajaCerrar(monto_cierre_contado_centavos=5000, fecha=date(2026, 11, 4))
    assert req.monto_cierre_contado_centavos == 5000
    assert req.fecha == date(2026, 11, 4)


def test_monto_no_positivo():
    with pytest.raises(ValidationError):
        CobroCreate(medio="efectivo", monto_centavos=0)
    with pytest.raises(ValidationError):
        CobroCreate(medio="efectivo", monto_centavos=-100)


def test_medio_invalido():
    with pytest.raises(ValidationError):
        CobroCreate(medio="bitcoin", monto_centavos=1000)


def test_monto_maximo():
    with pytest.raises(ValidationError):
        CobroCreate(medio="efectivo", monto_centavos=MONTO_MAX_CENTAVOS + 1)


def test_cobertura_mayor():
    with pytest.raises(ValidationError):
        CobroCreate(
            medio="obra_social",
            nomenclador_codigo="01.01",
            monto_centavos=5000,
            cobertura_centavos=6000,
        )


def test_campos_os_no_aplicables():
    with pytest.raises(ValidationError) as exc:
        CobroCreate(medio="efectivo", monto_centavos=5000, nomenclador_codigo="01.01")
    assert "campos_os_no_aplicables" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        CobroCreate(medio="tarjeta", monto_centavos=5000, cobertura_centavos=2000)
    assert "campos_os_no_aplicables" in str(exc.value)


def test_campos_os_sin_nomenclador():
    with pytest.raises(ValidationError):
        CobroCreate(medio="obra_social", monto_centavos=5000)


def test_anular_motivo():
    with pytest.raises(ValidationError):
        AnularCobro(motivo="")
    anulacion = AnularCobro(motivo="error de carga")
    assert anulacion.motivo == "error de carga"


def test_factura_tipo_invalido():
    with pytest.raises(ValidationError):
        FacturaArcaCreate(tipo="A")
    with pytest.raises(ValidationError):
        FacturaArcaCreate(tipo="X")
    f_b = FacturaArcaCreate(tipo="B")
    assert f_b.tipo == "B"
    f_c = FacturaArcaCreate(tipo="C")
    assert f_c.tipo == "C"


def test_constantes_arca():
    assert MODO_ARCA_SIMULADO == "simulado"
    assert SIMULADO_ARCA is True


def test_schemas_out():
    import uuid

    ahora = datetime.now(UTC)
    uid = uuid.uuid4()
    cobro_out = CobroOut(
        id=uid,
        caja_id=uid,
        medio="efectivo",
        concepto="total",
        monto_centavos=1000,
        estado="registrado",
        simulado=False,
        creado_en=ahora,
    )
    assert cobro_out.id == uid
    assert cobro_out.simulado is False

    factura_out = FacturaArcaOut(
        cobro_id=uid,
        tipo="B",
        cae="SIM-12345",
        qr="https://arca.gob.ar/qr?...",
        simulado=True,
        modo="simulado",
    )
    assert factura_out.cae == "SIM-12345"

    liq_out = LiquidacionOSOut(
        id=uid,
        cobro_id=uid,
        nomenclador_codigo="01.01",
        monto_total_centavos=5000,
        cobertura_centavos=4000,
        copago_centavos=1000,
        estado="pendiente",
        creado_en=ahora,
    )
    assert liq_out.copago_centavos == 1000



