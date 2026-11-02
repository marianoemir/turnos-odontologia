from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.db import get_session
from backend.app.lista_espera.schemas import (
    ListaEsperaCreate,
    ListaEsperaOut,
    OfrecerHueco,
    RespuestaPaciente,
)
from backend.app.lista_espera.service import (
    ListaEsperaInvalida,
    ListaNoEncontrada,
    ServicioListaEspera,
)
from backend.app.turnos.service import (
    ConflictoTurno,
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


@router.post("/lista-espera", response_model=ListaEsperaOut, status_code=201)
def alta(body: ListaEsperaCreate, session: Annotated[Session, Depends(get_db)]):
    try:
        return ServicioListaEspera.alta(
            session,
            paciente_id=body.paciente_id,
            profesional_id=body.profesional_id,
            prestacion_id=body.prestacion_id,
        )
    except TurnoNoEncontrado as exc:
        raise HTTPException(status_code=404, detail=exc.detalle) from exc


@router.get("/lista-espera", response_model=list[ListaEsperaOut])
def listar(
    profesional: Annotated[uuid.UUID | None, Query()] = None,
    session: Annotated[Session, Depends(get_db)] = None,
):
    return ServicioListaEspera.listar(session, profesional_id=profesional)


@router.post("/lista-espera/{lista_id}/ofrecer")
def ofrecer(
    lista_id: uuid.UUID,
    body: OfrecerHueco,
    session: Annotated[Session, Depends(get_db)],
):
    try:
        entrada, turno = ServicioListaEspera.ofrecer(
            session,
            lista_id,
            inicio=body.inicio,
            profesional_id=body.profesional_id,
            sillon_id=body.sillon_id,
        )
        return {"lista": ListaEsperaOut.model_validate(entrada), "turno": turno}
    except ListaNoEncontrada as exc:
        raise HTTPException(status_code=404, detail=exc.detalle) from exc
    except ListaEsperaInvalida as exc:
        raise HTTPException(status_code=409, detail=exc.detalle) from exc
    except ConflictoTurno as exc:
        raise HTTPException(
            status_code=409, detail={"causa": exc.causa, "detalle": exc.detalle}
        ) from exc
    except TurnoNoEncontrado as exc:
        raise HTTPException(status_code=404, detail=exc.detalle) from exc
    except TurnoInvalido as exc:
        raise HTTPException(status_code=422, detail=exc.detalle) from exc


@router.post("/lista-espera/{lista_id}/responder", response_model=ListaEsperaOut)
def responder(
    lista_id: uuid.UUID,
    body: RespuestaPaciente,
    session: Annotated[Session, Depends(get_db)],
):
    try:
        resultado = ServicioListaEspera.responder(
            session, lista_id, acepta=body.acepta
        )
        entrada = resultado[0] if isinstance(resultado, tuple) else resultado
        return entrada
    except ListaNoEncontrada as exc:
        raise HTTPException(status_code=404, detail=exc.detalle) from exc
    except ListaEsperaInvalida as exc:
        raise HTTPException(status_code=409, detail=exc.detalle) from exc
    except ConflictoTurno as exc:
        raise HTTPException(
            status_code=409, detail={"causa": exc.causa, "detalle": exc.detalle}
        ) from exc