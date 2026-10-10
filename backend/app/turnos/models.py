"""Modelo Turno (C-03): 4 FKs RESTRICT, inicio/fin timestamptz,
CHECK fin>inicio, estado con CHECK + default pendiente.

La red anti-solape vive en la migracion 002 (dos EXCLUDE USING gist
con tstzrange(inicio,fin,'[)') + WHERE estado activo): el modelo
declara la tabla, la DB impone el no-solape incluso concurrente.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db import Base

ESTADOS = (
    "pendiente",
    "confirmado",
    "atendido",
    "ausente",
    "cancelado",
)
ESTADOS_ACTIVOS = ("pendiente", "confirmado")


class Turno(Base):
    __tablename__ = "turnos"
    __table_args__ = (
        CheckConstraint("fin > inicio", name="fin_posterior_a_inicio"),
        CheckConstraint(
            "estado IN "
            "('pendiente','confirmado','atendido','ausente','cancelado')",
            name="estado_valido",
        ),
        Index(
            "ix_turnos_profesional_activo",
            "profesional_id",
            "inicio",
            "fin",
            postgresql_where=text(
                "estado IN ('pendiente','confirmado')"
            ),
        ),
        Index(
            "ix_turnos_sillon_activo",
            "sillon_id",
            "inicio",
            "fin",
            postgresql_where=text(
                "estado IN ('pendiente','confirmado')"
            ),
        ),
        Index("ix_turnos_paciente_inicio", "paciente_id", "inicio"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    paciente_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pacientes.id", ondelete="RESTRICT"), nullable=False
    )
    profesional_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profesionales.id", ondelete="RESTRICT"), nullable=False
    )
    sillon_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sillones.id", ondelete="RESTRICT"), nullable=False
    )
    prestacion_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("prestaciones.id", ondelete="RESTRICT"), nullable=False
    )
    inicio: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    fin: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    estado: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="pendiente",
        server_default=text("'pendiente'"),
    )
    creado_por: Mapped[str | None] = mapped_column(Text, nullable=True)
