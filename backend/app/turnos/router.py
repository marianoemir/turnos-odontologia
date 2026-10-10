"""Router POST /turnos (C-03): 201 pendiente | 409 con causa |
422 input invalido | 404 FK inexistente."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.db import get_session
from backend.app.turnos.schemas import TurnoCreate, TurnoOut
from backend.app.turnos.service import (
    ConflictoTurno,
    ServicioTurnos,
    TurnoInvalido,
    TurnoNoEncontrado,
)

router = APIRouter()


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


@router.post("/turnos", response_model=TurnoOut, status_code=201)
def crear_turno(
    body: TurnoCreate, session: Annotated[Session, Depends(get_db)]
):
    try:
        return ServicioTurnos.crear(
            session,
            paciente_id=body.paciente_id,
            profesional_id=body.profesional_id,
            sillon_id=body.sillon_id,
            prestacion_id=body.prestacion_id,
            inicio=body.inicio,
            creado_por=body.creado_por,
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
