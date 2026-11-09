"""Reloj y notificadores de recordatorios (C-07, tasks 2.1-2.3).

Sin red: los notificadores simulados solo formatean una referencia y, como
mucho, escriben en el logger. `WHATSAPP_TOKEN` se evalua solo por presencia:
su valor nunca se lee mas alla de la verdad booleana ni se loguea.
"""

from __future__ import annotations

import logging
import socket
from datetime import datetime

import pytest

from backend.app.recordatorios.notificadores import (
    LogSimulado,
    NotificacionFallida,
    WhatsAppSimulado,
    construir_notificador,
)
from backend.app.recordatorios.reloj import ahora_local

# ---------------------------------------------------------------------------
# Reloj (D5)
# ---------------------------------------------------------------------------


def test_ahora_local_devuelve_datetime_en_la_zona_local():
    ahora = ahora_local()

    assert isinstance(ahora, datetime)
    assert getattr(ahora.tzinfo, "key", None) == "America/Argentina/Buenos_Aires"


# ---------------------------------------------------------------------------
# Notificadores (D10)
# ---------------------------------------------------------------------------


def _prohibir_red(monkeypatch):
    def _prohibido(*args, **kwargs):
        raise AssertionError("el notificador intento usar la red")

    monkeypatch.setattr(socket, "socket", _prohibido)
    monkeypatch.setattr(socket, "create_connection", _prohibido)


def test_fabrica_elige_whatsapp_con_token_presente(monkeypatch):
    monkeypatch.setenv("WHATSAPP_TOKEN", "ficticio")

    notificador = construir_notificador()

    assert isinstance(notificador, WhatsAppSimulado)
    assert notificador.canal == "whatsapp"
    assert notificador.simulado is True


def test_fabrica_elige_log_sin_token(monkeypatch):
    monkeypatch.delenv("WHATSAPP_TOKEN", raising=False)

    notificador = construir_notificador()

    assert isinstance(notificador, LogSimulado)
    assert notificador.canal == "log"
    assert notificador.simulado is True


def test_fabrica_elige_log_con_token_vacio(monkeypatch):
    monkeypatch.setenv("WHATSAPP_TOKEN", "")

    notificador = construir_notificador()

    assert isinstance(notificador, LogSimulado)
    assert notificador.canal == "log"


def test_fabrica_no_loguea_el_valor_del_token(monkeypatch, caplog):
    monkeypatch.setenv("WHATSAPP_TOKEN", "valor-secreto-xyz")

    with caplog.at_level(logging.DEBUG):
        construir_notificador()

    assert "valor-secreto-xyz" not in caplog.text


@pytest.mark.parametrize(
    ("Fabrica", "prefijo"),
    [(WhatsAppSimulado, "SIM-WA-"), (LogSimulado, "SIM-LOG-")],
)
def test_notificador_simulado_devuelve_referencia_sim_sin_red(
    monkeypatch, Fabrica, prefijo
):
    _prohibir_red(monkeypatch)

    referencia = Fabrica().enviar(
        destinatario="tel ficticio",
        mensaje="Confirma: /confirmar/<token>",
        token="t" * 43,
    )

    assert isinstance(referencia, str)
    assert referencia.startswith(prefijo)
    assert len(referencia) > len(prefijo)


def test_log_simulado_loguea_la_copia_redactada_sin_el_token(caplog):
    with caplog.at_level(logging.INFO):
        LogSimulado().enviar(
            destinatario="tel ficticio",
            mensaje="Confirma: /confirmar/<token>",
            token="token-crudo-no-loguear",
        )

    assert "<token>" in caplog.text
    assert "token-crudo-no-loguear" not in caplog.text


def test_un_fallo_de_transporte_se_propaga_como_notificacion_fallida(
    monkeypatch,
):
    def _falla(self, *, destinatario, mensaje):
        raise RuntimeError("transporte caido")

    monkeypatch.setattr(WhatsAppSimulado, "_entregar", _falla)

    with pytest.raises(NotificacionFallida):
        WhatsAppSimulado().enviar(
            destinatario="tel ficticio",
            mensaje="hola",
            token="t" * 43,
        )
