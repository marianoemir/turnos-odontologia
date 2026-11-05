"""Router FastAPI para caja, cobros, facturación ARCA y liquidaciones OS (C-10)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.caja.reloj import ahora_local
from backend.app.caja.schemas import (
    MODO_ARCA_SIMULADO,
    AnularCobro,
    CajaAbrir,
    CajaCerrar,
    CajaOut,
    CobroCreate,
    CobroOut,
    FacturaArcaCreate,
    FacturaArcaOut,
    LiquidacionOSOut,
)
from backend.app.caja.service import (
    CajaCerrada,
    CajaNoAbierta,
    CajaNoEncontrada,
    CajaYaAbierta,
    CajaYaCerrada,
    CoberturaInvalida,
    CobroAnulado,
    CobroFacturado,
    CobroNoEncontrado,
    CobroYaAnulado,
    CobroYaFacturado,
    MedioInvalido,
    MedioNoFacturable,
    MontoInvalido,
    MotivoRequerido,
    ServicioCaja,
    TipoFacturaInvalido,
    TurnoNoEncontrado,
)
from backend.app.db import get_session

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


def get_ahora() -> datetime:
    """Reloj inyectable para dependencias FastAPI (D21/D29)."""
    return ahora_local()


_MAPEO_409 = {
    CajaYaAbierta: "caja_ya_abierta",
    CajaNoAbierta: "caja_no_abierta",
    CajaYaCerrada: "caja_ya_cerrada",
    CajaCerrada: "caja_cerrada",
    CobroYaAnulado: "cobro_ya_anulado",
    CobroFacturado: "cobro_facturado",
    CobroAnulado: "cobro_anulado",
    CobroYaFacturado: "cobro_ya_facturado",
    MedioNoFacturable: "medio_no_facturable",
}


def _traducir_error(exc: Exception) -> HTTPException:
    for exc_cls, causa in _MAPEO_409.items():
        if isinstance(exc, exc_cls):
            return HTTPException(
                status_code=409,
                detail={"causa": causa, "detalle": str(exc)},
            )
    if isinstance(
        exc, (CajaNoEncontrada, CobroNoEncontrado, TurnoNoEncontrado)
    ):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(
        exc,
        (
            MontoInvalido,
            MedioInvalido,
            TipoFacturaInvalido,
            CoberturaInvalida,
            MotivoRequerido,
        ),
    ):
        return HTTPException(status_code=422, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# 1. POST /caja/abrir
# ---------------------------------------------------------------------------
@router.post("/caja/abrir", response_model=CajaOut, status_code=201)
def abrir_caja(
    body: CajaAbrir,
    session: Annotated[Session, Depends(get_db)],
    ahora: Annotated[datetime, Depends(get_ahora)],
):
    try:
        return ServicioCaja.abrir(session, body, ahora=ahora)
    except Exception as exc:
        raise _traducir_error(exc) from exc


# ---------------------------------------------------------------------------
# 2. POST /caja/cerrar
# ---------------------------------------------------------------------------
@router.post("/caja/cerrar", response_model=CajaOut, status_code=200)
def cerrar_caja(
    body: CajaCerrar,
    session: Annotated[Session, Depends(get_db)],
    ahora: Annotated[datetime, Depends(get_ahora)],
):
    try:
        return ServicioCaja.cerrar(session, body, ahora=ahora)
    except Exception as exc:
        raise _traducir_error(exc) from exc


# ---------------------------------------------------------------------------
# 3. GET /caja/{id}
# ---------------------------------------------------------------------------
@router.get("/caja/{id}", response_model=CajaOut, status_code=200)
def obtener_caja_por_id(
    id: uuid.UUID,
    session: Annotated[Session, Depends(get_db)],
):
    try:
        return ServicioCaja.obtener(session, id)
    except Exception as exc:
        raise _traducir_error(exc) from exc


# ---------------------------------------------------------------------------
# 4. GET /caja
# ---------------------------------------------------------------------------
@router.get("/caja", response_model=CajaOut, status_code=200)
def obtener_caja_por_fecha(
    session: Annotated[Session, Depends(get_db)],
    ahora: Annotated[datetime, Depends(get_ahora)],
    fecha: Annotated[date | None, Query()] = None,
):
    try:
        return ServicioCaja.obtener_por_fecha(session, fecha, ahora=ahora)
    except Exception as exc:
        raise _traducir_error(exc) from exc


# ---------------------------------------------------------------------------
# 5. POST /cobros
# ---------------------------------------------------------------------------
@router.post("/cobros", response_model=CobroOut, status_code=201)
def registrar_cobro(
    body: CobroCreate,
    session: Annotated[Session, Depends(get_db)],
    ahora: Annotated[datetime, Depends(get_ahora)],
):
    try:
        return ServicioCaja.registrar_cobro(session, body, ahora=ahora)
    except Exception as exc:
        raise _traducir_error(exc) from exc


# ---------------------------------------------------------------------------
# 6. GET /cobros/{id}
# ---------------------------------------------------------------------------
@router.get("/cobros/{id}", response_model=CobroOut, status_code=200)
def obtener_cobro_por_id(
    id: uuid.UUID,
    session: Annotated[Session, Depends(get_db)],
):
    try:
        return ServicioCaja.obtener_cobro(session, id)
    except Exception as exc:
        raise _traducir_error(exc) from exc


# ---------------------------------------------------------------------------
# 7. POST /cobros/{id}/anular
# ---------------------------------------------------------------------------
@router.post("/cobros/{id}/anular", response_model=CobroOut, status_code=200)
def anular_cobro(
    id: uuid.UUID,
    body: AnularCobro,
    session: Annotated[Session, Depends(get_db)],
    ahora: Annotated[datetime, Depends(get_ahora)],
):
    try:
        return ServicioCaja.anular_cobro(session, id, body, ahora=ahora)
    except Exception as exc:
        raise _traducir_error(exc) from exc


# ---------------------------------------------------------------------------
# 8. POST /cobros/{id}/factura-arca
# ---------------------------------------------------------------------------
@router.post(
    "/cobros/{id}/factura-arca",
    response_model=FacturaArcaOut,
    status_code=201,
)
def facturar_arca(
    id: uuid.UUID,
    body: FacturaArcaCreate,
    session: Annotated[Session, Depends(get_db)],
    ahora: Annotated[datetime, Depends(get_ahora)],
):
    try:
        cobro = ServicioCaja.facturar_arca(session, id, body, ahora=ahora)
        return FacturaArcaOut(
            cobro_id=cobro.id,
            tipo=cobro.factura_tipo or body.tipo,
            cae=cobro.factura_cae or "",
            qr=cobro.factura_qr or "",
            simulado=True,
            modo=MODO_ARCA_SIMULADO,
        )
    except Exception as exc:
        raise _traducir_error(exc) from exc


# ---------------------------------------------------------------------------
# 9. GET /liquidaciones-os
# ---------------------------------------------------------------------------
@router.get(
    "/liquidaciones-os",
    response_model=list[LiquidacionOSOut],
    status_code=200,
)
def listar_liquidaciones(
    session: Annotated[Session, Depends(get_db)],
):
    try:
        return ServicioCaja.listar_liquidaciones(session)
    except Exception as exc:
        raise _traducir_error(exc) from exc
