"""Reloj inyectable de caja (C-10, D21).

La fecha local sale de un reloj que los tests pueden reemplazar, asi el borde
de las 23:30 es determinista. `ZONA` se importa de turnos; no se redefine.
"""

from __future__ import annotations

from datetime import date, datetime

from backend.app.turnos.service import ZONA


def ahora_local() -> datetime:
    """Instante actual con zona horaria local."""
    return datetime.now(ZONA)


def hoy_local(ahora: datetime | None = None) -> date:
    """Fecha local de `ahora` (o del reloj si es None), en `ZONA`."""
    instante = ahora if ahora is not None else ahora_local()
    return instante.astimezone(ZONA).date()
