"""Notificadores de recordatorios (C-07, D10): siempre simulados, cero red.

`construir_notificador()` evalua unicamente la presencia de `WHATSAPP_TOKEN`
(`bool(os.environ.get(...))`); nunca lee ni registra su valor. `LogSimulado`
loguea la copia redactada del mensaje que arma el servicio (D12), sin el token
crudo.
"""

from __future__ import annotations

import logging
import os
import uuid
from typing import Protocol

logger = logging.getLogger(__name__)


class NotificacionFallida(Exception):
    """Fallo de entrega del notificador."""


class Notificador(Protocol):
    """Contrato de envio: devuelve el `proveedor_ref` del envio."""

    canal: str
    simulado: bool

    def enviar(
        self, *, destinatario: str, mensaje: str, token: str
    ) -> str: ...


class _NotificadorSimulado:
    """Base comun: referencia `SIM-` y traduccion de fallos, sin red."""

    canal: str = ""
    simulado: bool = True
    prefijo: str = "SIM-"

    def enviar(
        self, *, destinatario: str, mensaje: str, token: str
    ) -> str:
        try:
            return self._entregar(
                destinatario=destinatario, mensaje=mensaje
            )
        except NotificacionFallida:
            raise
        except Exception as exc:
            raise NotificacionFallida(
                f"fallo de envio simulado: {exc}"
            ) from exc

    def _entregar(self, *, destinatario: str, mensaje: str) -> str:
        return f"{self.prefijo}{uuid.uuid4().hex[:12]}"


class WhatsAppSimulado(_NotificadorSimulado):
    canal = "whatsapp"
    prefijo = "SIM-WA-"


class LogSimulado(_NotificadorSimulado):
    canal = "log"
    prefijo = "SIM-LOG-"

    def _entregar(self, *, destinatario: str, mensaje: str) -> str:
        logger.info(
            "recordatorio simulado a %s: %s", destinatario, mensaje
        )
        return super()._entregar(
            destinatario=destinatario, mensaje=mensaje
        )


def construir_notificador() -> Notificador:
    """WhatsApp simulado si hay `WHATSAPP_TOKEN`; si no, `log`."""
    if bool(os.environ.get("WHATSAPP_TOKEN")):
        return WhatsAppSimulado()
    return LogSimulado()
