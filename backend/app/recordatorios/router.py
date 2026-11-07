"""Rutas publicas de confirmacion/cancelacion por token (C-07, D11).

Dos rutas sin autenticacion: el token es la capacidad. El formato se valida en
el `Path` (43 caracteres URL-safe -> 422 antes de tocar la base) y el servicio
resuelve el recordatorio con `with_for_update()`. `get_db` commitea al salir y
hace rollback ante excepcion, como el resto de los routers.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session

from backend.app.db import get_session
from backend.app.recordatorios.reloj import ahora_local
from backend.app.recordatorios.schemas import ResolucionOut
from backend.app.recordatorios.service import (
    AccionYaUsada,
    ServicioRecordatorios,
    TokenNoEncontrado,
)

router = APIRouter()

PATRON_TOKEN = r"^[A-Za-z0-9_-]{43}$"


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


def get_ahora() -> datetime:
    """Reloj inyectable para los tests (`dependency_overrides`)."""
    return ahora_local()


def _resolver(session, token: str, *, accion: str, ahora: datetime):
    try:
        return ServicioRecordatorios.resolver_token(
            session, token, accion=accion, ahora=ahora
        )
    except TokenNoEncontrado as exc:
        raise HTTPException(status_code=404, detail=exc.detalle) from exc
    except AccionYaUsada as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "causa": exc.causa,
                "detalle": exc.detalle,
                "accion_previa": exc.accion_previa,
            },
        ) from exc


@router.post("/confirmar/{token}", response_model=ResolucionOut)
def confirmar(
    token: Annotated[str, Path(pattern=PATRON_TOKEN)],
    session: Annotated[Session, Depends(get_db)],
    ahora: Annotated[datetime, Depends(get_ahora)],
):
    return _resolver(session, token, accion="confirmar", ahora=ahora)


@router.post("/cancelar/{token}", response_model=ResolucionOut)
def cancelar(
    token: Annotated[str, Path(pattern=PATRON_TOKEN)],
    session: Annotated[Session, Depends(get_db)],
    ahora: Annotated[datetime, Depends(get_ahora)],
):
    return _resolver(session, token, accion="cancelar", ahora=ahora)
