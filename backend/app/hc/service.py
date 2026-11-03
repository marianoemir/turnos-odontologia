"""Servicio de dominio HC / odontograma / planes (C-09)."""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.agenda.models import Paciente, Prestacion, Profesional
from backend.app.hc.models import (
    ESTADOS_ITEM,
    ESTADOS_PLAN,
    EntradaHC,
    HistoriaClinica,
    Odontograma,
    PlanItem,
    PlanTratamiento,
)


class HistoriaNoEncontrada(Exception):
    def __init__(self, detalle: str) -> None:
        super().__init__(detalle)
        self.detalle = detalle


class HistoriaDuplicada(Exception):
    def __init__(self, existente_id: uuid.UUID) -> None:
        super().__init__("historia clinica duplicada")
        self.existente_id = existente_id
        self.causa = "historia_clinica_duplicada"
        self.detalle = f"historia clinica ya existe: {existente_id}"


class PlanNoEncontrado(Exception):
    def __init__(self, detalle: str) -> None:
        super().__init__(detalle)
        self.detalle = detalle


class PlanNoEditable(Exception):
    def __init__(self, plan_id: uuid.UUID, estado: str) -> None:
        super().__init__("plan no editable")
        self.plan_id = plan_id
        self.estado = estado
        self.causa = "plan_no_editable"
        self.detalle = f"plan {plan_id} en estado {estado} no admite items"


class PacienteNoEncontrado(Exception):
    def __init__(self, detalle: str) -> None:
        super().__init__(detalle)
        self.detalle = detalle


class ProfesionalNoEncontrado(Exception):
    def __init__(self, detalle: str) -> None:
        super().__init__(detalle)
        self.detalle = detalle


class PrestacionNoEncontrada(Exception):
    def __init__(self, detalle: str) -> None:
        super().__init__(detalle)
        self.detalle = detalle


class PiezaInvalida(Exception):
    def __init__(self, detalle: str) -> None:
        super().__init__(detalle)
        self.detalle = detalle


class RegistroClinicoInvalido(Exception):
    def __init__(self, detalle: str) -> None:
        super().__init__(detalle)
        self.detalle = detalle


_PIEZA_RE = re.compile(r"^[1-4][1-8]$")


def _paciente(session: Session, paciente_id: uuid.UUID) -> Paciente:
    obj = session.query(Paciente).filter_by(id=paciente_id).one_or_none()
    if obj is None:
        raise PacienteNoEncontrado(f"paciente no existe: {paciente_id}")
    return obj


def _profesional(session: Session, profesional_id: uuid.UUID) -> Profesional:
    obj = session.query(Profesional).filter_by(id=profesional_id).one_or_none()
    if obj is None:
        raise ProfesionalNoEncontrado(f"profesional no existe: {profesional_id}")
    return obj


def _prestacion(session: Session, prestacion_id: uuid.UUID) -> Prestacion:
    obj = session.query(Prestacion).filter_by(id=prestacion_id).one_or_none()
    if obj is None:
        raise PrestacionNoEncontrada(f"prestacion no existe: {prestacion_id}")
    return obj


def _historia(session: Session, hc_id: uuid.UUID) -> HistoriaClinica:
    obj = session.query(HistoriaClinica).filter_by(id=hc_id).one_or_none()
    if obj is None:
        raise HistoriaNoEncontrada(f"historia clinica no existe: {hc_id}")
    return obj


def _historia_por_paciente(
    session: Session, paciente_id: uuid.UUID
) -> HistoriaClinica:
    obj = (
        session.query(HistoriaClinica)
        .filter_by(paciente_id=paciente_id)
        .one_or_none()
    )
    if obj is None:
        raise HistoriaNoEncontrada(
            f"historia clinica no existe para paciente: {paciente_id}"
        )
    return obj


def _plan(session: Session, plan_id: uuid.UUID) -> PlanTratamiento:
    obj = session.query(PlanTratamiento).filter_by(id=plan_id).one_or_none()
    if obj is None:
        raise PlanNoEncontrado(f"plan de tratamiento no existe: {plan_id}")
    return obj


def _validar_pieza(pieza: str) -> None:
    if not _PIEZA_RE.match(pieza):
        raise PiezaInvalida(f"pieza FDI invalida: {pieza}")


def _enriquecer_plan(session: Session, plan: PlanTratamiento) -> PlanTratamiento:
    items = (
        session.query(PlanItem)
        .filter_by(plan_id=plan.id)
        .order_by(PlanItem.id)
        .all()
    )
    plan.items = items
    plan.total_centavos = sum(i.monto_centavos for i in items)
    plan.cobertura_centavos = sum(
        (i.monto_cobertura_centavos or 0) for i in items
    )
    return plan


class ServicioHC:
    @staticmethod
    def crear_historia(
        session: Session,
        paciente_id: uuid.UUID,
        antecedentes: str | None = None,
        alergias: str | None = None,
        observaciones: str | None = None,
    ) -> HistoriaClinica:
        _paciente(session, paciente_id)
        existente = (
            session.query(HistoriaClinica)
            .filter_by(paciente_id=paciente_id)
            .one_or_none()
        )
        if existente is not None:
            raise HistoriaDuplicada(existente.id)
        hc = HistoriaClinica(
            paciente_id=paciente_id,
            antecedentes=antecedentes,
            alergias=alergias,
            observaciones=observaciones,
        )
        session.add(hc)
        try:
            session.flush()
        except IntegrityError as exc:
            session.rollback()
            existente = (
                session.query(HistoriaClinica)
                .filter_by(paciente_id=paciente_id)
                .one_or_none()
            )
            if existente is not None:
                raise HistoriaDuplicada(existente.id) from exc
            raise
        return hc

    @staticmethod
    def obtener_historia(
        session: Session, hc_id: uuid.UUID
    ) -> HistoriaClinica:
        return _historia(session, hc_id)

    @staticmethod
    def obtener_por_paciente(
        session: Session, paciente_id: uuid.UUID
    ) -> HistoriaClinica:
        _paciente(session, paciente_id)
        return _historia_por_paciente(session, paciente_id)

    @staticmethod
    def actualizar_historia(
        session: Session, hc_id: uuid.UUID, cambios: dict
    ) -> HistoriaClinica:
        hc = _historia(session, hc_id)
        for campo in ("antecedentes", "alergias", "observaciones"):
            if campo in cambios:
                setattr(hc, campo, cambios[campo])
        session.flush()
        return hc

    @staticmethod
    def agregar_entrada(
        session: Session,
        hc_id: uuid.UUID,
        profesional_id: uuid.UUID,
        fecha: datetime,
        texto: str,
    ) -> EntradaHC:
        hc = _historia(session, hc_id)
        _profesional(session, profesional_id)
        entrada = EntradaHC(
            historia_clinica_id=hc.id,
            profesional_id=profesional_id,
            fecha=fecha,
            texto=texto,
        )
        session.add(entrada)
        session.flush()
        return entrada

    @staticmethod
    def listar_entradas(
        session: Session, hc_id: uuid.UUID
    ) -> list[EntradaHC]:
        _historia(session, hc_id)
        return (
            session.query(EntradaHC)
            .filter_by(historia_clinica_id=hc_id)
            .order_by(EntradaHC.fecha.asc())
            .all()
        )

    @staticmethod
    def registrar_odontograma(
        session: Session,
        paciente_id: uuid.UUID,
        pieza: str,
        estado: str,
        profesional_id: uuid.UUID,
        fecha: datetime,
    ) -> Odontograma:
        _paciente(session, paciente_id)
        _profesional(session, profesional_id)
        _validar_pieza(pieza)
        obs = Odontograma(
            paciente_id=paciente_id,
            pieza=pieza,
            estado=estado,
            profesional_id=profesional_id,
            fecha=fecha,
        )
        session.add(obs)
        session.flush()
        return obs

    @staticmethod
    def listar_odontograma(
        session: Session, paciente_id: uuid.UUID, pieza: str | None = None
    ) -> list[Odontograma]:
        _paciente(session, paciente_id)
        q = session.query(Odontograma).filter_by(paciente_id=paciente_id)
        if pieza is not None:
            q = q.filter_by(pieza=pieza)
        return q.order_by(Odontograma.fecha.asc()).all()

    @staticmethod
    def crear_plan(
        session: Session,
        paciente_id: uuid.UUID,
        profesional_id: uuid.UUID,
        estado: str = "borrador",
    ) -> PlanTratamiento:
        _paciente(session, paciente_id)
        _profesional(session, profesional_id)
        if estado not in ESTADOS_PLAN:
            raise RegistroClinicoInvalido(
                f"estado de plan fuera del set provisorio: {estado}"
            )
        plan = PlanTratamiento(
            paciente_id=paciente_id,
            profesional_id=profesional_id,
            estado=estado,
        )
        session.add(plan)
        session.flush()
        return plan

    @staticmethod
    def actualizar_plan(
        session: Session, plan_id: uuid.UUID, estado: str
    ) -> PlanTratamiento:
        plan = _plan(session, plan_id)
        if estado not in ESTADOS_PLAN:
            raise RegistroClinicoInvalido(
                f"estado de plan fuera del set provisorio: {estado}"
            )
        plan.estado = estado
        session.flush()
        return plan

    @staticmethod
    def agregar_item(
        session: Session,
        plan_id: uuid.UUID,
        pieza: str,
        prestacion_id: uuid.UUID,
        estado: str = "pendiente",
        monto_centavos: int = 0,
        monto_cobertura_centavos: int | None = None,
    ) -> PlanItem:
        plan = _plan(session, plan_id)
        if plan.estado not in ("borrador", "propuesto"):
            raise PlanNoEditable(plan.id, plan.estado)
        _prestacion(session, prestacion_id)
        _validar_pieza(pieza)
        if estado not in ESTADOS_ITEM:
            raise RegistroClinicoInvalido(
                f"estado de item fuera del set provisorio: {estado}"
            )
        if monto_centavos < 0:
            raise RegistroClinicoInvalido("monto_centavos no puede ser negativo")
        if monto_cobertura_centavos is not None and monto_cobertura_centavos < 0:
            raise RegistroClinicoInvalido(
                "monto_cobertura_centavos no puede ser negativo"
            )
        item = PlanItem(
            plan_id=plan.id,
            pieza=pieza,
            prestacion_id=prestacion_id,
            estado=estado,
            monto_centavos=monto_centavos,
            monto_cobertura_centavos=monto_cobertura_centavos,
        )
        session.add(item)
        session.flush()
        return item

    @staticmethod
    def obtener_plan(
        session: Session, plan_id: uuid.UUID
    ) -> PlanTratamiento:
        plan = _plan(session, plan_id)
        return _enriquecer_plan(session, plan)

    @staticmethod
    def listar_planes_por_paciente(
        session: Session, paciente_id: uuid.UUID
    ) -> list[PlanTratamiento]:
        _paciente(session, paciente_id)
        planes = (
            session.query(PlanTratamiento)
            .filter_by(paciente_id=paciente_id)
            .order_by(PlanTratamiento.creado_en.asc())
            .all()
        )
        return [_enriquecer_plan(session, p) for p in planes]