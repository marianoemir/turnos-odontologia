"""Modelos de HC, odontograma y planes (C-09).

Solo estructura: ninguna regla clinica se inventa aca. `odontograma.estado`
es texto libre sin CHECK (Q-C09-01) y los estados de plan/item son un set
provisorio declarado en `ESTADOS_PLAN` / `ESTADOS_ITEM` (Q-C09-04).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db import Base

ESTADOS_PLAN = ("borrador", "propuesto", "aceptado", "rechazado", "cerrado")
ESTADOS_ITEM = ("pendiente", "realizado", "cancelado")


class HistoriaClinica(Base):
    __tablename__ = "historia_clinica"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    paciente_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pacientes.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    antecedentes: Mapped[str | None] = mapped_column(Text, nullable=True)
    alergias: Mapped[str | None] = mapped_column(Text, nullable=True)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class EntradaHC(Base):
    __tablename__ = "entrada_hc"
    __table_args__ = (
        Index("ix_entrada_hc_historia_fecha", "historia_clinica_id", "fecha"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    historia_clinica_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("historia_clinica.id", ondelete="RESTRICT"),
        nullable=False,
    )
    profesional_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profesionales.id", ondelete="RESTRICT"),
        nullable=False,
    )
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class Odontograma(Base):
    __tablename__ = "odontograma"
    __table_args__ = (
        CheckConstraint("pieza ~ '^[1-4][1-8]$'", name="pieza_fdi_valida"),
        Index(
            "ix_odontograma_paciente_pieza_fecha",
            "paciente_id",
            "pieza",
            "fecha",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    paciente_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pacientes.id", ondelete="RESTRICT"),
        nullable=False,
    )
    pieza: Mapped[str] = mapped_column(Text, nullable=False)
    estado: Mapped[str] = mapped_column(Text, nullable=False)
    profesional_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profesionales.id", ondelete="RESTRICT"),
        nullable=False,
    )
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class PlanTratamiento(Base):
    __tablename__ = "plan_tratamiento"
    __table_args__ = (
        CheckConstraint(
            "estado IN ('borrador','propuesto','aceptado','rechazado','cerrado')",
            name="estado_plan_valido",
        ),
        Index("ix_plan_tratamiento_paciente", "paciente_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    paciente_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pacientes.id", ondelete="RESTRICT"),
        nullable=False,
    )
    profesional_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profesionales.id", ondelete="RESTRICT"),
        nullable=False,
    )
    estado: Mapped[str] = mapped_column(
        Text, nullable=False, default="borrador", server_default=text("'borrador'")
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class PlanItem(Base):
    __tablename__ = "plan_item"
    __table_args__ = (
        CheckConstraint("pieza ~ '^[1-4][1-8]$'", name="pieza_fdi_valida"),
        CheckConstraint(
            "estado IN ('pendiente','realizado','cancelado')",
            name="estado_item_valido",
        ),
        CheckConstraint("monto_centavos >= 0", name="monto_no_negativo"),
        CheckConstraint(
            "monto_cobertura_centavos IS NULL OR monto_cobertura_centavos >= 0",
            name="cobertura_no_negativa",
        ),
        Index("ix_plan_item_plan", "plan_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plan_tratamiento.id", ondelete="CASCADE"),
        nullable=False,
    )
    pieza: Mapped[str] = mapped_column(Text, nullable=False)
    prestacion_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("prestaciones.id", ondelete="RESTRICT"),
        nullable=False,
    )
    estado: Mapped[str] = mapped_column(
        Text, nullable=False, default="pendiente", server_default=text("'pendiente'")
    )
    monto_centavos: Mapped[int] = mapped_column(Integer, nullable=False)
    monto_cobertura_centavos: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )