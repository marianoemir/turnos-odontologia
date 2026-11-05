"""Schemas Pydantic para caja, cobros y liquidaciones (C-10)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Literal, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)

from backend.app.caja.models import MONTO_MAX_CENTAVOS

MODO_ARCA_SIMULADO = "simulado"
SIMULADO_ARCA = True


class CajaAbrir(BaseModel):
    model_config = ConfigDict(extra="ignore")

    monto_apertura_centavos: int = Field(ge=0, le=MONTO_MAX_CENTAVOS)


class CajaCerrar(BaseModel):
    model_config = ConfigDict(extra="ignore")

    fecha: date | None = None
    monto_cierre_contado_centavos: int = Field(ge=0, le=MONTO_MAX_CENTAVOS)


class CajaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    fecha: date
    monto_apertura_centavos: int
    abierto_en: AwareDatetime
    cerrado_en: AwareDatetime | None = None
    monto_cierre_contado_centavos: int | None = None
    monto_esperado_centavos: int | None = None
    diferencia_centavos: int | None = None
    estado: str
    totales_por_medio_centavos: dict[str, int] = Field(default_factory=dict)


class CobroCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    caja_id: uuid.UUID | None = None
    turno_id: uuid.UUID | None = None
    medio: Literal[
        "efectivo",
        "tarjeta",
        "transferencia",
        "mercado_pago",
        "obra_social",
    ]
    concepto: Literal["sena", "saldo", "total"] = "total"
    monto_centavos: int = Field(gt=0, le=MONTO_MAX_CENTAVOS)
    nomenclador_codigo: str | None = None
    cobertura_centavos: int | None = Field(
        default=None, ge=0, le=MONTO_MAX_CENTAVOS
    )

    @model_validator(mode="after")
    def validar_campos_os(self) -> Self:
        if self.medio == "obra_social":
            if not self.nomenclador_codigo or not self.nomenclador_codigo.strip():
                raise ValueError(
                    "nomenclador_codigo es obligatorio para obra_social"
                )
            if self.cobertura_centavos is not None and not (
                0 <= self.cobertura_centavos <= self.monto_centavos
            ):
                raise ValueError(
                    "cobertura_centavos debe ser entre 0 y el monto total"
                )
        else:
            if (
                self.nomenclador_codigo is not None
                or self.cobertura_centavos is not None
            ):
                raise ValueError("campos_os_no_aplicables")
        return self


class CobroOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    caja_id: uuid.UUID
    turno_id: uuid.UUID | None = None
    medio: str
    concepto: str
    monto_centavos: int
    estado: str
    motivo_anulacion: str | None = None
    anulado_en: AwareDatetime | None = None
    referencia_externa: str | None = None
    factura_tipo: str | None = None
    factura_cae: str | None = None
    factura_qr: str | None = None
    facturado_en: AwareDatetime | None = None
    simulado: bool
    creado_en: AwareDatetime


class AnularCobro(BaseModel):
    model_config = ConfigDict(extra="ignore")

    motivo: str = Field(min_length=1)


class FacturaArcaCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    tipo: Literal["B", "C"]


class FacturaArcaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    cobro_id: uuid.UUID
    tipo: str
    cae: str
    qr: str
    simulado: bool = True
    modo: str = "simulado"


class LiquidacionOSOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    cobro_id: uuid.UUID
    nomenclador_codigo: str
    descripcion: str | None = None
    monto_total_centavos: int
    cobertura_centavos: int
    copago_centavos: int
    estado: str
    pdf_referencia: str | None = None
    creado_en: AwareDatetime


