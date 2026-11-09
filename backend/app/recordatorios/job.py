"""Entrypoint CLI del procesamiento de recordatorios (C-07, D1, task 4.3).

Uso:
    python -m backend.app.recordatorios.job [--ahora ISO-8601] [--limite N]

Abre su propia sesion, procesa el lote, commitea una sola vez al final e
imprime el resumen. `--ahora` sin zona horaria se interpreta en
America/Argentina/Buenos_Aires; con offset explicito se respeta tal cual.
Devuelve 0 salvo error de infraestructura (1). Un `fallido` no es error.
"""

from __future__ import annotations

import argparse
import logging
from datetime import datetime

from backend.app.db import get_session
from backend.app.recordatorios.service import (
    ResumenProcesamiento,
    ServicioRecordatorios,
)
from backend.app.turnos.service import ZONA

logger = logging.getLogger(__name__)


def _parse_ahora(valor: str) -> datetime:
    """ISO-8601; un valor naive se asume en `ZONA`."""
    instante = datetime.fromisoformat(valor)
    if instante.tzinfo is None or instante.tzinfo.utcoffset(instante) is None:
        instante = instante.replace(tzinfo=ZONA)
    return instante


def _construir_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m backend.app.recordatorios.job",
        description=(
            "Procesa los recordatorios debidos (48h/24h), commitea el lote "
            "e imprime el resumen."
        ),
    )
    parser.add_argument(
        "--ahora",
        type=_parse_ahora,
        default=None,
        metavar="ISO-8601",
        help=(
            "Instante de procesamiento. Sin zona horaria se interpreta en "
            "America/Argentina/Buenos_Aires; por defecto, el reloj local."
        ),
    )
    parser.add_argument(
        "--limite",
        type=int,
        default=200,
        metavar="N",
        help="Maximo de turnos candidatos a procesar (default: 200).",
    )
    return parser


def _formatear_resumen(resumen: ResumenProcesamiento) -> str:
    return (
        f"recordatorios: candidatos={resumen.candidatos} "
        f"enviados={resumen.enviados} omitidos={resumen.omitidos} "
        f"fallidos={resumen.fallidos}"
    )


def main(argv: list[str] | None = None, *, session_factory=None) -> int:
    args = _construir_parser().parse_args(argv)
    fabrica = session_factory if session_factory is not None else get_session()
    sesion = fabrica()
    try:
        resumen = ServicioRecordatorios.procesar(
            sesion, ahora=args.ahora, limite=args.limite
        )
        sesion.commit()
    except Exception:
        sesion.rollback()
        logger.exception("recordatorios: fallo de infraestructura")
        return 1
    finally:
        sesion.close()
    print(_formatear_resumen(resumen))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
