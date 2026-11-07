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

from backend.app.agenda.models import (
    Bloqueo,
    HorarioAtencion,
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
    validar_horario_sin_solape,
)
from backend.app.agenda.schemas import (
    BloqueoCreate,
    BloqueoOut,
    HorarioCreate,
    HorarioOut,
    HorarioPatch,
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


def _exigir_sucursal(session: Session, sucursal_id: uuid.UUID | None) -> None:
    """404 si se indica una sucursal que no existe en la base."""
    if sucursal_id is None:
        return
    from backend.app.rbac.models import Sucursal

    existe = session.query(Sucursal).filter_by(id=sucursal_id).first()
    if existe is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sucursal {sucursal_id} no encontrada",
        )


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
    sucursal_id: uuid.UUID | None = None,
):
    query = session.query(Profesional)
    if not incluir_inactivos:
        query = query.filter(Profesional.activo.is_(True))
    if sucursal_id is not None:
        _exigir_sucursal(session, sucursal_id)
        query = query.filter(Profesional.sucursal_id == sucursal_id)

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
    _exigir_sucursal(session, body.sucursal_id)
    profesional = Profesional(
        nombre=body.nombre,
        matricula=body.matricula,
        sucursal_id=body.sucursal_id,
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
    if datos.get("sucursal_id") is not None:
        _exigir_sucursal(session, datos["sucursal_id"])
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
    sucursal_id: uuid.UUID | None = None,
):
    query = session.query(SillonBox)
    if not incluir_inactivos:
        query = query.filter(SillonBox.activo.is_(True))
    if sucursal_id is not None:
        _exigir_sucursal(session, sucursal_id)
        query = query.filter(SillonBox.sucursal_id == sucursal_id)

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
    _exigir_sucursal(session, body.sucursal_id)
    sillon = SillonBox(
        nombre=body.nombre,
        sucursal_id=body.sucursal_id,
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
    if datos.get("sucursal_id") is not None:
        _exigir_sucursal(session, datos["sucursal_id"])
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



# ============================================================================
# Horarios de Atención
# ============================================================================


@router.get("/horarios-atencion", response_model=list[HorarioOut])
def listar_horarios_atencion(
    session: Annotated[Session, Depends(get_db)],
    incluir_inactivos: bool = False,
):
    query = session.query(HorarioAtencion)
    if not incluir_inactivos:
        query = query.filter(HorarioAtencion.activo.is_(True))

    return query.order_by(
        HorarioAtencion.profesional_id.asc(),
        HorarioAtencion.dia_semana.asc(),
        HorarioAtencion.desde.asc(),
        HorarioAtencion.id.asc(),
    ).all()


@router.post(
    "/horarios-atencion",
    response_model=HorarioOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_horario_atencion(
    body: HorarioCreate,
    session: Annotated[Session, Depends(get_db)],
):
    profesional = (
        session.query(Profesional).filter_by(id=body.profesional_id).first()
    )
    if profesional is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profesional {body.profesional_id} no encontrado",
        )
    if not profesional.activo:
        raise HTTPException(
            status_code=422,
            detail="Profesional inactivo",
        )

    try:
        validar_horario_sin_solape(
            session=session,
            profesional_id=body.profesional_id,
            dia_semana=body.dia_semana,
            desde=body.desde,
            hasta=body.hasta,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"causa": "solape_horario", "detalle": str(exc)},
        ) from exc

    horario = HorarioAtencion(
        profesional_id=body.profesional_id,
        dia_semana=body.dia_semana,
        desde=body.desde,
        hasta=body.hasta,
        activo=True,
    )
    session.add(horario)
    _flush_o_409(session)
    return horario


@router.patch("/horarios-atencion/{horario_id}", response_model=HorarioOut)
def modificar_horario_atencion(
    horario_id: uuid.UUID,
    body: HorarioPatch,
    session: Annotated[Session, Depends(get_db)],
):
    horario = session.query(HorarioAtencion).filter_by(id=horario_id).first()
    if horario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Horario de atención {horario_id} no encontrado",
        )

    datos = body.model_dump(exclude_unset=True)

    dia_semana_res = datos.get("dia_semana", horario.dia_semana)
    desde_res = datos.get("desde", horario.desde)
    hasta_res = datos.get("hasta", horario.hasta)
    activo_res = datos.get("activo", horario.activo)

    if desde_res >= hasta_res:
        raise HTTPException(
            status_code=422,
            detail="desde debe ser menor que hasta",
        )

    if activo_res:
        try:
            validar_horario_sin_solape(
                session=session,
                profesional_id=horario.profesional_id,
                dia_semana=dia_semana_res,
                desde=desde_res,
                hasta=hasta_res,
                excluir_id=horario.id,
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"causa": "solape_horario", "detalle": str(exc)},
            ) from exc

    for campo, valor in datos.items():
        setattr(horario, campo, valor)

    _flush_o_409(session)
    return horario



# ============================================================================
# Bloqueos (Grupo 10)
# ============================================================================


@router.get("/bloqueos", response_model=list[BloqueoOut])
def listar_bloqueos(
    session: Annotated[Session, Depends(get_db)],
):
    return (
        session.query(Bloqueo)
        .order_by(Bloqueo.desde.asc(), Bloqueo.id.asc())
        .all()
    )


@router.post(
    "/bloqueos",
    response_model=BloqueoOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_bloqueo(
    body: BloqueoCreate,
    session: Annotated[Session, Depends(get_db)],
):
    if body.profesional_id is not None:
        profesional = (
            session.query(Profesional)
            .filter_by(id=body.profesional_id)
            .first()
        )
        if profesional is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Profesional {body.profesional_id} no encontrado",
            )
        if not profesional.activo:
            raise HTTPException(
                status_code=422,
                detail="Profesional inactivo",
            )

    if body.sillon_id is not None:
        sillon = (
            session.query(SillonBox)
            .filter_by(id=body.sillon_id)
            .first()
        )
        if sillon is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sillón {body.sillon_id} no encontrado",
            )
        if not sillon.activo:
            raise HTTPException(
                status_code=422,
                detail="Sillón inactivo",
            )

    bloqueo = Bloqueo(
        profesional_id=body.profesional_id,
        sillon_id=body.sillon_id,
        desde=body.desde,
        hasta=body.hasta,
        motivo=body.motivo,
    )
    session.add(bloqueo)
    _flush_o_409(session)
    return bloqueo


@router.delete(
    "/bloqueos/{bloqueo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def eliminar_bloqueo(
    bloqueo_id: uuid.UUID,
    session: Annotated[Session, Depends(get_db)],
):
    bloqueo = session.query(Bloqueo).filter_by(id=bloqueo_id).first()
    if bloqueo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bloqueo {bloqueo_id} no encontrado",
        )

    session.delete(bloqueo)
    session.flush()
