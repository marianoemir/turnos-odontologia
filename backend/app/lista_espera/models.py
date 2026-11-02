from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db import Base

ESTADOS_LISTA = ("pendiente", "ofrecido", "asignado", "baja")


class ListaEspera(Base):
    __tablename__ = "lista_espera"
    __table_args__ = (
        CheckConstraint(
            "estado IN ('pendiente','ofrecido','asignado','baja')",
            name="estado_lista_valido",
        ),
        Index(
            "ix_lista_espera_profesional_creado",
            "profesional_id",
            "creado_en",
        ),
        Index("ix_lista_espera_paciente", "paciente_id"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    paciente_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pacientes.id", ondelete="RESTRICT"), nullable=False
    )
    profesional_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("profesionales.id", ondelete="RESTRICT"), nullable=True
    )
    prestacion_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("prestaciones.id", ondelete="RESTRICT"), nullable=False
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    estado: Mapped[str] = mapped_column(
        Text, nullable=False, default="pendiente", server_default=text("'pendiente'")
    )
    turno_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("turnos.id", ondelete="SET NULL"), nullable=True
    )