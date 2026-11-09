"""Entrypoint CLI del procesamiento de recordatorios (C-07, task 4.3).

Tests unitarios de `main()` con una fabrica de sesion falsa: no tocan
Postgres ni el reloj real.
"""

from __future__ import annotations

from datetime import UTC, datetime

from backend.app.recordatorios import job
from backend.app.recordatorios.service import ResumenProcesamiento
from backend.app.turnos.service import ZONA


class FakeSession:
    def __init__(self):
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


def _stub_procesar(monkeypatch, *, resumen=None, error=None):
    capturado = {}

    class StubServicio:
        @staticmethod
        def procesar(session, *, ahora=None, notificador=None, limite=200):
            capturado.update(
                session=session, ahora=ahora, limite=limite
            )
            if error is not None:
                raise error
            return resumen or ResumenProcesamiento()

    monkeypatch.setattr(job, "ServicioRecordatorios", StubServicio)
    return capturado


def test_main_procesa_commitea_e_imprime_el_resumen(monkeypatch, capsys):
    sesion = FakeSession()
    capturado = _stub_procesar(
        monkeypatch,
        resumen=ResumenProcesamiento(
            candidatos=3, enviados=1, omitidos=1, fallidos=1
        ),
    )

    codigo = job.main(["--limite", "7"], session_factory=lambda: sesion)

    assert codigo == 0
    assert capturado["session"] is sesion
    assert capturado["limite"] == 7
    assert capturado["ahora"] is None
    assert sesion.committed is True
    assert sesion.closed is True
    salida = capsys.readouterr().out
    for conteo in (
        "candidatos=3",
        "enviados=1",
        "omitidos=1",
        "fallidos=1",
    ):
        assert conteo in salida


def test_main_interpreta_ahora_sin_zona_en_la_zona_local(
    monkeypatch, capsys
):
    sesion = FakeSession()
    capturado = _stub_procesar(monkeypatch)

    codigo = job.main(
        ["--ahora", "2026-11-10T10:00"], session_factory=lambda: sesion
    )

    assert codigo == 0
    assert capturado["ahora"] == datetime(
        2026, 11, 10, 10, 0, tzinfo=ZONA
    )
    assert (
        getattr(capturado["ahora"].tzinfo, "key", None)
        == "America/Argentina/Buenos_Aires"
    )
    assert sesion.committed is True


def test_main_conserva_el_offset_explicito_de_ahora(monkeypatch):
    sesion = FakeSession()
    capturado = _stub_procesar(monkeypatch)

    codigo = job.main(
        ["--ahora", "2026-11-10T13:00:00+00:00"],
        session_factory=lambda: sesion,
    )

    assert codigo == 0
    assert capturado["ahora"].utcoffset() == UTC.utcoffset(None)


def test_main_devuelve_1_y_hace_rollback_ante_error_de_infraestructura(
    monkeypatch,
):
    sesion = FakeSession()
    _stub_procesar(monkeypatch, error=RuntimeError("base caida"))

    codigo = job.main([], session_factory=lambda: sesion)

    assert codigo == 1
    assert sesion.committed is False
    assert sesion.rolled_back is True
    assert sesion.closed is True
