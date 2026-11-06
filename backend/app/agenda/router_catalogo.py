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

from backend.app.agenda.models import Paciente, Prestacion, Profesional, SillonBox
from backend.app.agenda.schemas import (
    PacienteCreate,
    PacienteOut,
    PacientePatch,
    PacientesEnvelopeOut,
    PrestacionCreate,
    PrestacionOut,
    PrestacionPatch,
    ProfesionalCreate,
    ProfesionalOut,
    ProfesionalPatch,
    SillonCreate,
    SillonOut,
    SillonPatch,
)
from backend.app.agenda.service_catalogo import (
    traducir_integridad_catalogo,
)
from backend.app.turnos.router import get_db

router = APIRouter(tags=["catalogo"])


def _escapar_like(texto: str) -> str:
    """Escapa los comodines % y _ para coincidencia literal en ILIKE."""
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _flush_o_409(session: Session) -> None:
    """Ejecuta session.flush() y traduce violaciones de integridad a HTTP 409."""
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        conflicto = traducir_integridad_catalogo(exc)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=conflicto.detail_dict,
        ) from exc


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
    _flush_o_409(session)
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

    _flush_o_409(session)
    return paciente


# ============================================================================
# Profesionales
# ============================================================================


@router.get("/profesionales", response_model=list[ProfesionalOut])
def listar_profesionales(
    session: Annotated[Session, Depends(get_db)],
    incluir_inactivos: bool = False,
):
    query = session.query(Profesional)
    if not incluir_inactivos:
        query = query.filter(Profesional.activo.is_(True))

    return (
        query.order_by(Profesional.nombre.asc(), Profesional.id.asc()).all()
    )


@router.post(
    "/profesionales",
    response_model=ProfesionalOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_profesional(
    body: ProfesionalCreate,
    session: Annotated[Session, Depends(get_db)],
):
    profesional = Profesional(
        nombre=body.nombre,
        matricula=body.matricula,
        activo=True,
    )
    session.add(profesional)
    _flush_o_409(session)
    return profesional


@router.patch("/profesionales/{profesional_id}", response_model=ProfesionalOut)
def modificar_profesional(
    profesional_id: uuid.UUID,
    body: ProfesionalPatch,
    session: Annotated[Session, Depends(get_db)],
):
    profesional = (
        session.query(Profesional).filter_by(id=profesional_id).first()
    )
    if profesional is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profesional {profesional_id} no encontrado",
        )

    datos = body.model_dump(exclude_unset=True)
    for campo, valor in datos.items():
        setattr(profesional, campo, valor)

    _flush_o_409(session)
    return profesional


# ============================================================================
# Sillones
# ============================================================================


@router.get("/sillones", response_model=list[SillonOut])
def listar_sillones(
    session: Annotated[Session, Depends(get_db)],
    incluir_inactivos: bool = False,
):
    query = session.query(SillonBox)
    if not incluir_inactivos:
        query = query.filter(SillonBox.activo.is_(True))

    return query.order_by(SillonBox.nombre.asc(), SillonBox.id.asc()).all()


@router.post(
    "/sillones",
    response_model=SillonOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_sillon(
    body: SillonCreate,
    session: Annotated[Session, Depends(get_db)],
):
    sillon = SillonBox(
        nombre=body.nombre,
        activo=True,
    )
    session.add(sillon)
    _flush_o_409(session)
    return sillon


@router.patch("/sillones/{sillon_id}", response_model=SillonOut)
def modificar_sillon(
    sillon_id: uuid.UUID,
    body: SillonPatch,
    session: Annotated[Session, Depends(get_db)],
):
    sillon = session.query(SillonBox).filter_by(id=sillon_id).first()
    if sillon is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sillón {sillon_id} no encontrado",
        )

    datos = body.model_dump(exclude_unset=True)
    for campo, valor in datos.items():
        setattr(sillon, campo, valor)

    _flush_o_409(session)
    return sillon


# ============================================================================
# Prestaciones
# ============================================================================


@router.get("/prestaciones", response_model=list[PrestacionOut])
def listar_prestaciones(
    session: Annotated[Session, Depends(get_db)],
    incluir_inactivos: bool = False,
):
    query = session.query(Prestacion)
    if not incluir_inactivos:
        query = query.filter(Prestacion.activo.is_(True))

    return (
        query.order_by(Prestacion.nombre.asc(), Prestacion.id.asc()).all()
    )


@router.post(
    "/prestaciones",
    response_model=PrestacionOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_prestacion(
    body: PrestacionCreate,
    session: Annotated[Session, Depends(get_db)],
):
    prestacion = Prestacion(
        nombre=body.nombre,
        duracion_min=body.duracion_min,
        activo=True,
    )
    session.add(prestacion)
    _flush_o_409(session)
    return prestacion


@router.patch("/prestaciones/{prestacion_id}", response_model=PrestacionOut)
def modificar_prestacion(
    prestacion_id: uuid.UUID,
    body: PrestacionPatch,
    session: Annotated[Session, Depends(get_db)],
):
    prestacion = session.query(Prestacion).filter_by(id=prestacion_id).first()
    if prestacion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prestación {prestacion_id} no encontrada",
        )

    datos = body.model_dump(exclude_unset=True)
    for campo, valor in datos.items():
        setattr(prestacion, campo, valor)

    _flush_o_409(session)
    return prestacion
