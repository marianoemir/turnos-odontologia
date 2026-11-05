"""Router FastAPI para Catálogo de Recursos (C-12).

Endpoints de pacientes, profesionales, sillones, prestaciones, horarios y bloqueos.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.agenda.models import Paciente
from backend.app.agenda.schemas import (
    PacienteCreate,
    PacienteOut,
    PacientePatch,
    PacientesEnvelopeOut,
)
from backend.app.agenda.service_catalogo import (
    traducir_integridad_catalogo,
)
from backend.app.turnos.router import get_db

router = APIRouter(tags=["catalogo"])


def _escapar_like(texto: str) -> str:
    """Escapa los comodines % y _ para coincidencia literal en ILIKE."""
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# ============================================================================
# Pacientes
# ============================================================================


@router.get("/pacientes", response_model=PacientesEnvelopeOut)
def listar_pacientes(
    session: Annotated[Session, Depends(get_db)],
    q: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    incluir_inactivos: bool = False,
):
    query = session.query(Paciente)

    if not incluir_inactivos:
        query = query.filter(Paciente.activo.is_(True))

    if q:
        q_limpio = _escapar_like(q)
        patron = f"%{q_limpio}%"
        query = query.filter(
            or_(
                Paciente.nombre.ilike(patron, escape="\\"),
                Paciente.dni.ilike(patron, escape="\\"),
            )
        )

    total = query.count()
    items = (
        query.order_by(Paciente.nombre.asc(), Paciente.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return PacientesEnvelopeOut(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/pacientes",
    response_model=PacienteOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_paciente(
    body: PacienteCreate,
    session: Annotated[Session, Depends(get_db)],
):
    paciente = Paciente(
        nombre=body.nombre,
        dni=body.dni,
        contacto=body.contacto,
        ficticio=body.ficticio,
        activo=True,
    )
    session.add(paciente)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        conflicto = traducir_integridad_catalogo(exc)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=conflicto.detail_dict,
        ) from exc

    return paciente


@router.patch("/pacientes/{paciente_id}", response_model=PacienteOut)
def modificar_paciente(
    paciente_id: uuid.UUID,
    body: PacientePatch,
    session: Annotated[Session, Depends(get_db)],
):
    paciente = session.query(Paciente).filter_by(id=paciente_id).first()
    if paciente is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Paciente {paciente_id} no encontrado",
        )

    datos = body.model_dump(exclude_unset=True)
    for campo, valor in datos.items():
        setattr(paciente, campo, valor)

    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        conflicto = traducir_integridad_catalogo(exc)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=conflicto.detail_dict,
        ) from exc

    return paciente
