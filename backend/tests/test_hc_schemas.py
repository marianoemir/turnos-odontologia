"""Validacion de schemas Pydantic de HC (C-09, fase 3)."""

import uuid

import pytest
from pydantic import ValidationError

from backend.app.hc.schemas import (
    EntradaHCCreate,
    HistoriaClinicaCreate,
    OdontogramaCreate,
    PlanItemCreate,
    PlanTratamientoCreate,
    PlanTratamientoUpdate,
)


def test_hc_create_ok():
    s = HistoriaClinicaCreate(paciente_id=uuid.uuid4())
    assert s.antecedentes is None
    assert s.alergias is None
    assert s.observaciones is None


def test_patch_cuerpo_vacio_no_modifica():
    # HistoriaClinicaUpdate con {} -> todos None (no-op en servicio)
    s = HistoriaClinicaCreate.__class__ and __import__(
        "backend.app.hc.schemas", fromlist=["HistoriaClinicaUpdate"]
    ).HistoriaClinicaUpdate()
    assert s.antecedentes is None
    assert s.alergias is None
    assert s.observaciones is None


def test_entrada_texto_vacio_422():
    with pytest.raises(ValidationError):
        EntradaHCCreate(
            profesional_id=uuid.uuid4(),
            fecha=__import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ),
            texto="",
        )


def test_pieza_fdi_limite():
    uid = uuid.uuid4()
    for pieza in ("18", "48"):
        s = OdontogramaCreate(
            paciente_id=uid, pieza=pieza, estado="sano",
            profesional_id=uid,
            fecha=__import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ),
        )
        assert s.pieza == pieza


def test_pieza_fdi_invalida():
    uid = uuid.uuid4()
    for pieza in ("19", "1", "55"):
        with pytest.raises(ValidationError):
            OdontogramaCreate(
                paciente_id=uid, pieza=pieza, estado="sano",
                profesional_id=uid,
                fecha=__import__("datetime").datetime.now(
                    __import__("datetime").timezone.utc
                ),
            )


def test_monto_cero():
    s = PlanItemCreate(pieza="16", prestacion_id=uuid.uuid4(), monto_centavos=0)
    assert s.monto_centavos == 0
    assert s.estado == "pendiente"


def test_monto_negativo():
    with pytest.raises(ValidationError):
        PlanItemCreate(pieza="16", prestacion_id=uuid.uuid4(), monto_centavos=-1)


def test_monto_decimal_o_ausente():
    with pytest.raises(ValidationError):
        PlanItemCreate(pieza="16", prestacion_id=uuid.uuid4(), monto_centavos=1500.50)  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        PlanItemCreate(pieza="16", prestacion_id=uuid.uuid4())


def test_estado_plan_invalido_422():
    with pytest.raises(ValidationError):
        PlanTratamientoUpdate(estado="estado-inventado")
    with pytest.raises(ValidationError):
        PlanTratamientoCreate(
            paciente_id=uuid.uuid4(), profesional_id=uuid.uuid4(),
            estado="estado-inventado",
        )