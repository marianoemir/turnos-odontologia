"""Reloj inyectable de recordatorios (C-07, D5).

`ZONA` se importa de turnos y no se redefine: es el unico punto compartido.
No se reutiliza `caja.reloj` para no acoplar recordatorios a un dominio ajeno
(D5); duplicar estas lineas es deliberado.
"""

from __future__ import annotations

from datetime import datetime

from backend.app.turnos.service import ZONA


def ahora_local() -> datetime:
    """Instante actual con zona horaria local."""
    return datetime.now(ZONA)
