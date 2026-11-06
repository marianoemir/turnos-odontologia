"""Servicio de procesamiento de recordatorios (C-07, D1-D4, D12, D14, D16).

`procesar` selecciona los turnos activos en la ventana de 48h, decide la etapa
mas urgente (D2/D4), persiste el recordatorio antes de enviar dentro de un
SAVEPOINT y omite el envio cuando el UNIQUE de dedupe ya lo tomo (D3). Hace
`flush` y NUNCA `commit`: el adaptador CLI es quien commitea (D1).
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError

from backend.app.agenda.models import Paciente
from backend.app.recordatorios.models import Recordatorio
from backend.app.recordatorios.notificadores import (
    NotificacionFallida,
    Notificador,
    construir_notificador,
)
from backend.app.recordatorios.reloj import ahora_local
from backend.app.turnos.models import ESTADOS_ACTIVOS, Turno
from backend.app.turnos.service import ZONA

VENTANA_24H = timedelta(hours=24)
VENTANA_48H = timedelta(hours=48)
CONSTRAINT_DEDUPE = "uq_recordatorio_dedupe"


@dataclass(frozen=True)
class ResumenProcesamiento:
    """Conteos de una ejecucion de `procesar` (D1)."""

    candidatos: int = 0
    enviados: int = 0
    omitidos: int = 0
    fallidos: int = 0


class ServicioRecordatorios:
    @staticmethod
    def procesar(
        session,
        *,
        ahora: datetime | None = None,
        notificador: Notificador | None = None,
        limite: int = 200,
    ) -> ResumenProcesamiento:
        instante = ahora if ahora is not None else ahora_local()
        if (
            instante.tzinfo is None
            or instante.tzinfo.utcoffset(instante) is None
        ):
            raise ValueError("ahora debe tener zona horaria")
        emisor = (
            notificador
            if notificador is not None
            else construir_notificador()
        )
        candidatos = (
            session.query(Turno)
            .filter(
                Turno.estado.in_(ESTADOS_ACTIVOS),
                Turno.inicio > instante,
                Turno.inicio <= instante + VENTANA_48H,
            )
            .order_by(Turno.inicio)
            .limit(limite)
            .all()
        )
        conteos = {
            "candidatos": len(candidatos),
            "enviados": 0,
            "omitidos": 0,
            "fallidos": 0,
        }
        for turno in candidatos:
            etapa = ServicioRecordatorios._etapa_debida(turno, instante)
            if etapa == "24h" and turno.estado != "pendiente":
                continue
            ServicioRecordatorios._procesar_turno(
                session, turno, etapa, instante, emisor, conteos
            )
        return ResumenProcesamiento(**conteos)

    @staticmethod
    def _etapa_debida(turno: Turno, instante: datetime) -> str:
        """D2/D4: etapa mas urgente debida; 24h solo si sigue pendiente."""
        if turno.inicio <= instante + VENTANA_24H:
            return "24h"
        return "48h"

    @staticmethod
    def _procesar_turno(
        session, turno, etapa, instante, emisor, conteos
    ) -> None:
        token = secrets.token_urlsafe(32)
        recordatorio = Recordatorio(
            turno_id=turno.id,
            canal=emisor.canal,
            etapa=etapa,
            estado="pendiente",
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expira_en=turno.inicio,
            inicio_turno=turno.inicio,
            mensaje=_mensaje(turno.inicio, "<token>"),
            creado_en=instante,
        )
        try:
            with session.begin_nested():
                session.add(recordatorio)
                session.flush()
        except IntegrityError as exc:
            if recordatorio in session:
                session.expunge(recordatorio)
            if _es_choque_de_dedupe(exc):
                conteos["omitidos"] += 1
                return
            raise

        contacto = ServicioRecordatorios._contacto(session, turno)
        if contacto is None:
            recordatorio.estado = "fallido"
            recordatorio.error = "sin_contacto"
            recordatorio.mensaje = None
            recordatorio.simulado = False
            session.flush()
            conteos["fallidos"] += 1
            return

        try:
            referencia = emisor.enviar(
                destinatario=contacto,
                mensaje=_mensaje(turno.inicio, token),
                token=token,
            )
        except NotificacionFallida as exc:
            recordatorio.estado = "fallido"
            recordatorio.error = str(exc) or "envio_fallido"
            recordatorio.simulado = False
            session.flush()
            conteos["fallidos"] += 1
            return

        recordatorio.estado = "enviado"
        recordatorio.proveedor_ref = referencia
        recordatorio.simulado = bool(emisor.simulado)
        recordatorio.enviado_en = instante
        recordatorio.error = None
        session.flush()
        conteos["enviados"] += 1

    @staticmethod
    def _contacto(session, turno: Turno) -> str | None:
        paciente = session.get(Paciente, turno.paciente_id)
        if paciente is None or paciente.contacto is None:
            return None
        contacto = paciente.contacto.strip()
        return contacto or None


def _mensaje(inicio: datetime, token: str) -> str:
    local = inicio.astimezone(ZONA)
    return (
        f"Recordatorio de turno: {local:%d/%m/%Y %H:%M}. "
        f"Confirmar: /confirmar/{token} Cancelar: /cancelar/{token}"
    )


def _es_choque_de_dedupe(exc: IntegrityError) -> bool:
    diag = getattr(exc.orig, "diag", None)
    return diag is not None and diag.constraint_name == CONSTRAINT_DEDUPE
