"""Modelos de caja, cobro y liquidacion de obra social (C-10).

Dinero en centavos enteros (`BigInteger`, D18) con piso y tope
`MONTO_MAX_CENTAVOS` en toda columna declarada (D20). Los derivados
(`monto_esperado_centavos`, `diferencia_centavos`) se calculan al cerrar la
caja. Los timestamps los fija el servicio desde el reloj inyectable (D21);
`server_default=now()` es solo respaldo.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db import Base

MONTO_MAX_CENTAVOS = 1_000_000_000_000

ESTADOS_CAJA = ("abierta", "cerrada")
MEDIOS_COBRO = (
    "efectivo",
    "tarjeta",
    "transferencia",
    "mercado_pago",
    "obra_social",
)
CONCEPTOS_COBRO = ("sena", "saldo", "total")
ESTADOS_COBRO = ("registrado", "anulado")
ESTADOS_LIQUIDACION = ("pendiente", "liquidada", "pagada", "anulada")


def _en(columna: str, valores: tuple[str, ...]) -> str:
    lista = ",".join(f"'{v}'" for v in valores)
    return f"{columna} IN ({lista})"


class Caja(Base):
    __tablename__ = "caja"
    __table_args__ = (
        CheckConstraint(
            f"monto_apertura_centavos BETWEEN 0 AND {MONTO_MAX_CENTAVOS}",
            name="monto_apertura_rango",
        ),
        CheckConstraint(
            "monto_cierre_contado_centavos BETWEEN 0 "
            f"AND {MONTO_MAX_CENTAVOS}",
            name="monto_contado_rango",
        ),
        CheckConstraint(
            "monto_esperado_centavos >= 0", name="monto_esperado_no_negativo"
        ),
        CheckConstraint(_en("estado", ESTADOS_CAJA), name="estado_caja_valido"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    fecha: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    monto_apertura_centavos: Mapped[int] = mapped_column(
        BigInteger, nullable=False
    )
    abierto_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    cerrado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    monto_cierre_contado_centavos: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )
    monto_esperado_centavos: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )
    diferencia_centavos: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )
    estado: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="abierta",
        server_default=text("'abierta'"),
    )


class Cobro(Base):
    __tablename__ = "cobro"
    __table_args__ = (
        CheckConstraint(
            _en("medio", MEDIOS_COBRO), name="medio_cobro_valido"
        ),
        CheckConstraint(
            _en("concepto", CONCEPTOS_COBRO), name="concepto_cobro_valido"
        ),
        CheckConstraint(
            f"monto_centavos BETWEEN 1 AND {MONTO_MAX_CENTAVOS}",
            name="monto_cobro_rango",
        ),
        CheckConstraint(
            _en("estado", ESTADOS_COBRO), name="estado_cobro_valido"
        ),
        Index("ix_cobro_caja", "caja_id"),
        Index("ix_cobro_turno", "turno_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    caja_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("caja.id", ondelete="RESTRICT"), nullable=False
    )
    turno_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("turnos.id", ondelete="RESTRICT"), nullable=True
    )
    medio: Mapped[str] = mapped_column(Text, nullable=False)
    concepto: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="total",
        server_default=text("'total'"),
    )
    monto_centavos: Mapped[int] = mapped_column(BigInteger, nullable=False)
    estado: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="registrado",
        server_default=text("'registrado'"),
    )
    motivo_anulacion: Mapped[str | None] = mapped_column(Text, nullable=True)
    anulado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    referencia_externa: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    factura_tipo: Mapped[str | None] = mapped_column(Text, nullable=True)
    factura_cae: Mapped[str | None] = mapped_column(Text, nullable=True)
    factura_qr: Mapped[str | None] = mapped_column(Text, nullable=True)
    facturado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    simulado: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class LiquidacionOS(Base):
    __tablename__ = "liquidacion_os"
    __table_args__ = (
        CheckConstraint(
            f"monto_total_centavos BETWEEN 0 AND {MONTO_MAX_CENTAVOS}",
            name="monto_total_liquidacion_rango",
        ),
        CheckConstraint(
            f"cobertura_centavos BETWEEN 0 AND {MONTO_MAX_CENTAVOS}",
            name="cobertura_liquidacion_rango",
        ),
        CheckConstraint(
            "cobertura_centavos <= monto_total_centavos",
            name="cobertura_no_excede_total",
        ),
        CheckConstraint(
            f"copago_centavos BETWEEN 0 AND {MONTO_MAX_CENTAVOS}",
            name="copago_liquidacion_rango",
        ),
        CheckConstraint(
            "copago_centavos = monto_total_centavos - cobertura_centavos",
            name="copago_consistente",
        ),
        CheckConstraint(
            _en("estado", ESTADOS_LIQUIDACION),
            name="estado_liquidacion_valido",
        ),
        Index("ix_liquidacion_os_creado", "creado_en"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    cobro_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cobro.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    nomenclador_codigo: Mapped[str] = mapped_column(Text, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    monto_total_centavos: Mapped[int] = mapped_column(
        BigInteger, nullable=False
    )
    cobertura_centavos: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=text("0")
    )
    copago_centavos: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=text("0")
    )
    estado: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="pendiente",
        server_default=text("'pendiente'"),
    )
    pdf_referencia: Mapped[str | None] = mapped_column(Text, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
