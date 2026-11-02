from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from backend.app.agenda.models import Paciente, Prestacion, Profesional
from backend.app.lista_espera.models import ListaEspera
from backend.app.turnos.service import (
    ConflictoTurno,
    ServicioTurnos,
    TurnoInvalido,
    TurnoNoEncontrado,
)


class ListaNoEncontrada(Exception):
    def __init__(self, ref_id):
        self.ref_id = ref_id
        self.detalle = f"entrada de lista no existe: {ref_id}"


class ListaEsperaInvalida(Exception):
    def __init__(self, detalle):
        self.detalle = detalle


class ServicioListaEspera:
    @staticmethod
    def alta(session, *, paciente_id, profesional_id=None, prestacion_id):
        if session.get(Paciente, paciente_id) is None:
            raise TurnoNoEncontrado("paciente", paciente_id)
        if profesional_id is not None and session.get(Profesional, profesional_id) is None:
            raise TurnoNoEncontrado("profesional", profesional_id)
        if session.get(Prestacion, prestacion_id) is None:
            raise TurnoNoEncontrado("prestacion", prestacion_id)
        entrada = ListaEspera(
            paciente_id=paciente_id,
            profesional_id=profesional_id,
            prestacion_id=prestacion_id,
            estado="pendiente",
        )
        session.add(entrada)
        session.flush()
        return entrada

    @staticmethod
    def listar(session, *, profesional_id=None):
        q = session.query(ListaEspera).filter(ListaEspera.estado == "pendiente")
        if profesional_id is not None:
            q = q.filter(ListaEspera.profesional_id == profesional_id)
        return q.order_by(ListaEspera.creado_en.asc()).all()

    @staticmethod
    def ofrecer(session, lista_id, *, inicio, profesional_id, sillon_id):
        entrada = session.get(ListaEspera, lista_id)
        if entrada is None:
            raise ListaNoEncontrada(lista_id)
        if entrada.estado not in ("pendiente", "ofrecido"):
            raise ListaEsperaInvalida(
                f"no se puede ofrecer una entrada en estado {entrada.estado}"
            )
        entrada.estado = "ofrecido"
        session.flush()
        try:
            turno = ServicioTurnos.crear(
                session,
                paciente_id=entrada.paciente_id,
                profesional_id=profesional_id,
                sillon_id=sillon_id,
                prestacion_id=entrada.prestacion_id,
                inicio=inicio,
            )
        except (ConflictoTurno, TurnoInvalido, TurnoNoEncontrado):
            entrada.estado = "pendiente"
            session.flush()
            raise
        entrada.turno_id = turno.id
        session.flush()
        return entrada, turno

    @staticmethod
    def responder(session, lista_id, *, acepta):
        entrada = session.get(ListaEspera, lista_id)
        if entrada is None:
            raise ListaNoEncontrada(lista_id)
        if entrada.estado != "ofrecido" or entrada.turno_id is None:
            raise ListaEsperaInvalida("no hay oferta pendiente de respuesta")
        if acepta:
            entrada.estado = "asignado"
            session.flush()
            return entrada
        try:
            ServicioTurnos.cancelar(session, entrada.turno_id)
        except Exception:
            pass
        entrada.estado = "baja"
        session.flush()
        siguiente = (
            session.query(ListaEspera)
            .filter(
                ListaEspera.estado == "pendiente",
                ListaEspera.profesional_id == entrada.profesional_id,
            )
            .order_by(ListaEspera.creado_en.asc())
            .first()
        )
        return entrada, siguiente