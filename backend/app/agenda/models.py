"""Modelos del catalogo (C-02): pacientes, profesionales, sillones,
prestaciones, horarios y bloqueos. Sin Turno (scope C-03).
"""

from __future__ import annotations

import uuid
from datetime import datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db import Base


class Paciente(Base):
    __tablename__ = "pacientes"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    dni: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    contacto: Mapped[str | None] = mapped_column(Text, nullable=True)
    ficticio: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )


class Profesional(Base):
    __tablename__ = "profesionales"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    matricula: Mapped[str] = mapped_column(
        String(32), nullable=False, unique=True
    )


class SillonBox(Base):
    __tablename__ = "sillones"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(
        String(100), nullable=False, unique=True
    )
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true"),
        index=True,
    )


class Prestacion(Base):
    __tablename__ = "prestaciones"
    __table_args__ = (
        CheckConstraint("duracion_min > 0", name="duracion_positiva"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(
        String(100), nullable=False, unique=True
    )
    duracion_min: Mapped[int] = mapped_column(Integer, nullable=False)


def hay_solape_config(a_desde, a_hasta, b_desde, b_hasta) -> bool:
    """Solape de configuracion en borde semiabierto [desde, hasta).

    La adyacencia exacta (a_hasta == b_desde) NO es solape (RN-AG-04).
    """
    return a_desde < b_hasta and b_desde < a_hasta


class HorarioAtencion(Base):
    __tablename__ = "horarios"
    __table_args__ = (
        CheckConstraint("dia_semana BETWEEN 0 AND 6", name="dia_valido"),
        CheckConstraint("desde < hasta", name="rango_valido"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    profesional_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("profesionales.id", ondelete="CASCADE"), nullable=False
    )
    dia_semana: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    desde: Mapped[time] = mapped_column(Time, nullable=False)
    hasta: Mapped[time] = mapped_column(Time, nullable=False)


def validar_horario_sin_solape(
    session, profesional_id, dia_semana, desde, hasta
) -> None:
    """Rechaza con ValueError si el rango solapa otra fila del mismo
    profesional y dia. La adyacencia exacta esta permitida (D2)."""
    existentes = (
        session.query(HorarioAtencion)
        .filter_by(profesional_id=profesional_id, dia_semana=dia_semana)
        .all()
    )
    for fila in existentes:
        if hay_solape_config(fila.desde, fila.hasta, desde, hasta):
            raise ValueError(
                f"Solape de horario: [{desde}, {hasta}) intersecta "
                f"[{fila.desde}, {fila.hasta}) del mismo profesional y dia."
            )


def bloqueo_aplica(
    bloqueo, profesional_id, sillon_id, inicio, fin
) -> bool:
    """Matriz de aplicabilidad D1 en borde semiabierto [inicio, fin).

    Un bloqueo aplica ssi coinciden los ids no-null y los rangos
    intersectan (RN-AG-05). Global = ambos ids en null.
    """
    if (
        bloqueo.profesional_id is not None
        and bloqueo.profesional_id != profesional_id
    ):
        return False
    if bloqueo.sillon_id is not None and bloqueo.sillon_id != sillon_id:
        return False
    return bloqueo.desde < fin and inicio < bloqueo.hasta


class Bloqueo(Base):
    __tablename__ = "bloqueos"
    __table_args__ = (
        CheckConstraint("desde < hasta", name="rango_valido"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    profesional_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("profesionales.id", ondelete="CASCADE"), nullable=True
    )
    sillon_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sillones.id", ondelete="CASCADE"), nullable=True
    )
    desde: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    hasta: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
