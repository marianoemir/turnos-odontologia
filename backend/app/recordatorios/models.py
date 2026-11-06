"""Modelo Recordatorio (C-07): recordatorios 48h/24h y token de un toque.

`token_hash` guarda sha256 hex del token crudo (D6); el token nunca se
persiste. El dedupe `(turno_id, etapa, inicio_turno)` hace idempotente al
job incluso con dos ejecuciones concurrentes (D3) y permite re-notificar
tras una reprogramacion (D13). `inicio_turno` es el snapshot usado tambien
como `expira_en`. Los timestamps los fija el servicio desde el reloj
inyectable (D5); `server_default=now()` es solo respaldo.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db import Base

CANALES_RECORDATORIO = ("whatsapp", "email", "log")
ETAPAS_RECORDATORIO = ("48h", "24h")
ESTADOS_RECORDATORIO = (
    "pendiente",
    "enviado",
    "confirmado",
    "cancelado",
    "fallido",
)


def _en(columna: str, valores: tuple[str, ...]) -> str:
    lista = ",".join(f"'{v}'" for v in valores)
    return f"{columna} IN ({lista})"


class Recordatorio(Base):
    __tablename__ = "recordatorio"
    __table_args__ = (
        CheckConstraint(
            _en("canal", CANALES_RECORDATORIO),
            name="canal_recordatorio_valido",
        ),
        CheckConstraint(
            _en("etapa", ETAPAS_RECORDATORIO),
            name="etapa_recordatorio_valida",
        ),
        CheckConstraint(
            _en("estado", ESTADOS_RECORDATORIO),
            name="estado_recordatorio_valido",
        ),
        UniqueConstraint(
            "token_hash", name="uq_recordatorio_token_hash"
        ),
        UniqueConstraint(
            "turno_id",
            "etapa",
            "inicio_turno",
            name="uq_recordatorio_dedupe",
        ),
        Index("ix_recordatorio_turno_id", "turno_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    turno_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("turnos.id", ondelete="RESTRICT"), nullable=False
    )
    canal: Mapped[str] = mapped_column(Text, nullable=False)
    etapa: Mapped[str] = mapped_column(Text, nullable=False)
    estado: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="pendiente",
        server_default=text("'pendiente'"),
    )
    token_hash: Mapped[str] = mapped_column(Text, nullable=False)
    expira_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    inicio_turno: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    proveedor_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    simulado: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    mensaje: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    enviado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    respondido_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
