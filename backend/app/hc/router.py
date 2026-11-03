from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.db import get_session
from backend.app.hc.schemas import (
    EntradaHCCreate,
    EntradaHCOut,
    HistoriaClinicaCreate,
    HistoriaClinicaOut,
    HistoriaClinicaUpdate,
    OdontogramaCreate,
    OdontogramaOut,
    PlanItemCreate,
    PlanItemOut,
    PlanTratamientoCreate,
    PlanTratamientoOut,
    PlanTratamientoUpdate,
)
from backend.app.hc.service import (
    HistoriaDuplicada,
    HistoriaNoEncontrada,
    PacienteNoEncontrado,
    PiezaInvalida,
    PlanNoEditable,
    PlanNoEncontrado,
    PrestacionNoEncontrada,
    ProfesionalNoEncontrado,
    RegistroClinicoInvalido,
    ServicioHC,
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


_NOT_FOUND = (
    PacienteNoEncontrado,
    ProfesionalNoEncontrado,
    PrestacionNoEncontrada,
    HistoriaNoEncontrada,
    PlanNoEncontrado,
)


def _traducir(exc: Exception) -> HTTPException:
    if isinstance(exc, HistoriaDuplicada):
        return HTTPException(
            status_code=409, detail={"causa": exc.causa, "detalle": exc.detalle}
        )
    if isinstance(exc, PlanNoEditable):
        return HTTPException(
            status_code=409, detail={"causa": exc.causa, "detalle": exc.detalle}
        )
    if isinstance(exc, _NOT_FOUND):
        return HTTPException(status_code=404, detail=exc.detalle)
    if isinstance(exc, (PiezaInvalida, RegistroClinicoInvalido)):
        return HTTPException(status_code=422, detail=exc.detalle)
    raise exc


@router.post(
    "/historias-clinicas", response_model=HistoriaClinicaOut, status_code=201
)
def crear_historia(
    body: HistoriaClinicaCreate,
    session: Annotated[Session, Depends(get_db)],
):
    try:
        return ServicioHC.crear_historia(
            session,
            paciente_id=body.paciente_id,
            antecedentes=body.antecedentes,
            alergias=body.alergias,
            observaciones=body.observaciones,
        )
    except Exception as exc:
        raise _traducir(exc) from exc


@router.get(
    "/historias-clinicas/{hc_id}", response_model=HistoriaClinicaOut
)
def obtener_historia(
    hc_id: uuid.UUID, session: Annotated[Session, Depends(get_db)]
):
    try:
        return ServicioHC.obtener_historia(session, hc_id)
    except Exception as exc:
        raise _traducir(exc) from exc


@router.get(
    "/pacientes/{paciente_id}/historia-clinica",
    response_model=HistoriaClinicaOut,
)
def obtener_historia_por_paciente(
    paciente_id: uuid.UUID, session: Annotated[Session, Depends(get_db)]
):
    try:
        return ServicioHC.obtener_por_paciente(session, paciente_id)
    except Exception as exc:
        raise _traducir(exc) from exc


@router.patch(
    "/historias-clinicas/{hc_id}", response_model=HistoriaClinicaOut
)
def actualizar_historia(
    hc_id: uuid.UUID,
    body: HistoriaClinicaUpdate,
    session: Annotated[Session, Depends(get_db)],
):
    try:
        return ServicioHC.actualizar_historia(
            session, hc_id, body.model_dump(exclude_unset=True)
        )
    except Exception as exc:
        raise _traducir(exc) from exc


@router.post(
    "/historias-clinicas/{hc_id}/entradas",
    response_model=EntradaHCOut,
    status_code=201,
)
def agregar_entrada(
    hc_id: uuid.UUID,
    body: EntradaHCCreate,
    session: Annotated[Session, Depends(get_db)],
):
    try:
        return ServicioHC.agregar_entrada(
            session,
            hc_id=hc_id,
            profesional_id=body.profesional_id,
            fecha=body.fecha,
            texto=body.texto,
        )
    except Exception as exc:
        raise _traducir(exc) from exc


@router.get(
    "/historias-clinicas/{hc_id}/entradas",
    response_model=list[EntradaHCOut],
)
def listar_entradas(
    hc_id: uuid.UUID, session: Annotated[Session, Depends(get_db)]
):
    try:
        return ServicioHC.listar_entradas(session, hc_id)
    except Exception as exc:
        raise _traducir(exc) from exc


@router.post(
    "/pacientes/{paciente_id}/odontograma",
    response_model=OdontogramaOut,
    status_code=201,
)
def registrar_odontograma(
    paciente_id: uuid.UUID,
    body: OdontogramaCreate,
    session: Annotated[Session, Depends(get_db)],
):
    try:
        return ServicioHC.registrar_odontograma(
            session,
            paciente_id=paciente_id,
            pieza=body.pieza,
            estado=body.estado,
            profesional_id=body.profesional_id,
            fecha=body.fecha,
        )
    except Exception as exc:
        raise _traducir(exc) from exc


@router.get(
    "/pacientes/{paciente_id}/odontograma",
    response_model=list[OdontogramaOut],
)
def listar_odontograma(
    paciente_id: uuid.UUID,
    pieza: Annotated[str | None, Query()] = None,
    session: Annotated[Session, Depends(get_db)] = None,
):
    try:
        return ServicioHC.listar_odontograma(session, paciente_id, pieza=pieza)
    except Exception as exc:
        raise _traducir(exc) from exc


@router.post(
    "/planes-tratamiento", response_model=PlanTratamientoOut, status_code=201
)
def crear_plan(
    body: PlanTratamientoCreate,
    session: Annotated[Session, Depends(get_db)],
):
    try:
        plan = ServicioHC.crear_plan(
            session,
            paciente_id=body.paciente_id,
            profesional_id=body.profesional_id,
            estado=body.estado,
        )
        session.flush()
        return ServicioHC.obtener_plan(session, plan.id)
    except Exception as exc:
        raise _traducir(exc) from exc


@router.get(
    "/planes-tratamiento/{plan_id}", response_model=PlanTratamientoOut
)
def obtener_plan(
    plan_id: uuid.UUID, session: Annotated[Session, Depends(get_db)]
):
    try:
        return ServicioHC.obtener_plan(session, plan_id)
    except Exception as exc:
        raise _traducir(exc) from exc


@router.patch(
    "/planes-tratamiento/{plan_id}", response_model=PlanTratamientoOut
)
def actualizar_plan(
    plan_id: uuid.UUID,
    body: PlanTratamientoUpdate,
    session: Annotated[Session, Depends(get_db)],
):
    try:
        if body.estado is not None:
            ServicioHC.actualizar_plan(session, plan_id, body.estado)
        plan = ServicioHC.obtener_plan(session, plan_id)
        return plan
    except Exception as exc:
        raise _traducir(exc) from exc


@router.post(
    "/planes-tratamiento/{plan_id}/items",
    response_model=PlanItemOut,
    status_code=201,
)
def agregar_item(
    plan_id: uuid.UUID,
    body: PlanItemCreate,
    session: Annotated[Session, Depends(get_db)],
):
    try:
        return ServicioHC.agregar_item(
            session,
            plan_id=plan_id,
            pieza=body.pieza,
            prestacion_id=body.prestacion_id,
            estado=body.estado,
            monto_centavos=body.monto_centavos,
            monto_cobertura_centavos=body.monto_cobertura_centavos,
        )
    except Exception as exc:
        raise _traducir(exc) from exc


@router.get(
    "/pacientes/{paciente_id}/planes-tratamiento",
    response_model=list[PlanTratamientoOut],
)
def listar_planes_por_paciente(
    paciente_id: uuid.UUID, session: Annotated[Session, Depends(get_db)]
):
    try:
        return ServicioHC.listar_planes_por_paciente(session, paciente_id)
    except Exception as exc:
        raise _traducir(exc) from exc