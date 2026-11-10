"""Router público de reserva online (C-08): sin RBAC (D3)."""

from __future__ import annotations

import os
import time
import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from backend.app.agenda.models import Prestacion, Profesional
from backend.app.db import get_session
from backend.app.reserva_online.schemas import ReservaCreate, ReservaOut, SlotOut
from backend.app.reserva_online.service import ServicioReservaOnline
from backend.app.turnos.service import (
    ConflictoTurno,
    TurnoInvalido,
    TurnoNoEncontrado,
)

router = APIRouter()

_RATE_LIMIT: dict[str, list[float]] = {}


def resetear_rate_limit() -> None:
    _RATE_LIMIT.clear()


def _verificar_rate_limit(request: Request) -> None:
    limite = int(os.environ.get("RESERVA_RATE_LIMIT_N", "5"))
    ventana = int(os.environ.get("RESERVA_RATE_LIMIT_VENTANA_SEG", "600"))
    ahora = time.monotonic()
    ip = request.client.host if request.client else "unknown"
    eventos = _RATE_LIMIT.get(ip, [])
    corte = ahora - ventana
    eventos = [t for t in eventos if t > corte]
    eventos.append(ahora)
    _RATE_LIMIT[ip] = eventos
    if len(eventos) > limite:
        raise HTTPException(
            status_code=429,
            detail={
                "causa": "rate_limit",
                "detalle": "se supero el umbral de solicitudes",
            },
        )


def get_db():
    session = get_session()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@router.get(
    "/reservar/{profesional}",
    response_model=list[SlotOut],
)
def listar_slots(
    profesional: uuid.UUID,
    prestacion: uuid.UUID,
    fecha: date,
    session: Annotated[Session, Depends(get_db)],
):
    if session.get(Profesional, profesional) is None:
        raise HTTPException(
            status_code=404, detail=f"profesional no existe: {profesional}"
        )
    if session.get(Prestacion, prestacion) is None:
        raise HTTPException(
            status_code=404, detail=f"prestacion no existe: {prestacion}"
        )
    return ServicioReservaOnline.slots(
        session,
        profesional_id=profesional,
        prestacion_id=prestacion,
        fecha=fecha,
    )


@router.post(
    "/reservar",
    response_model=ReservaOut,
    status_code=201,
    dependencies=[Depends(_verificar_rate_limit)],
)
def crear_reserva(
    body: ReservaCreate,
    session: Annotated[Session, Depends(get_db)],
):
    if session.get(Profesional, body.profesional_id) is None:
        raise HTTPException(
            status_code=404,
            detail=f"profesional no existe: {body.profesional_id}",
        )
    if session.get(Prestacion, body.prestacion_id) is None:
        raise HTTPException(
            status_code=404,
            detail=f"prestacion no existe: {body.prestacion_id}",
        )
    try:
        return ServicioReservaOnline.crear_reserva(
            session,
            nombre=body.nombre,
            dni=body.dni,
            contacto=body.contacto,
            profesional_id=body.profesional_id,
            prestacion_id=body.prestacion_id,
            inicio=body.inicio,
        )
    except ConflictoTurno as exc:
        raise HTTPException(
            status_code=409,
            detail={"causa": exc.causa, "detalle": exc.detalle},
        ) from exc
    except TurnoNoEncontrado as exc:
        raise HTTPException(status_code=404, detail=exc.detalle) from exc
    except TurnoInvalido as exc:
        raise HTTPException(status_code=422, detail=exc.detalle) from exc
