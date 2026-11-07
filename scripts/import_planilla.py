"""CLI de importación asistida (C-11, grupo 10).

Uso: `python -m scripts.import_planilla --archivo <ruta> [--dry-run]
[--reporte <ruta.csv>]` desde la raíz del repo (así `backend` es
importable). El commit final lo hace el CLI, no el servicio.
Códigos de salida: 0 todo procesado, 1 al menos un rechazo,
2 cabecera o archivo inválido (nada escrito).
"""

from __future__ import annotations

import argparse
import csv
import sys

from backend.app.db import get_session
from backend.app.migracion.service import importar_planilla


def main(
    argv: list[str] | None = None,
    session_factory=None,
) -> int:
    parser = argparse.ArgumentParser(
        description="Importa pacientes y profesionales desde una planilla CSV."
    )
    parser.add_argument("--archivo", required=True, help="Ruta al CSV a importar")
    parser.add_argument(
        "--dry-run", action="store_true", help="Simula sin escribir en la base"
    )
    parser.add_argument(
        "--reporte", default=None, help="Ruta opcional para escribir el reporte CSV"
    )
    args = parser.parse_args(argv)

    fabrica = session_factory or get_session
    try:
        session = fabrica()
    except RuntimeError as exc:  # sin DATABASE_URL no hay base
        print(f"Error: no se pudo abrir la base de datos: {exc}")
        return 2
    try:
        reporte = importar_planilla(session, args.archivo, dry_run=args.dry_run)
        if not args.dry_run and not reporte.cabecera_invalida:
            session.commit()
    finally:
        session.close()

    print(f"Creados: {reporte.creados}")
    print(f"Actualizados: {reporte.actualizados}")
    print(f"Rechazados: {reporte.rechazados}")
    if reporte.rechazos:
        print("Detalle de rechazos:")
        for rechazo in reporte.rechazos:
            print(f"  Línea {rechazo.nro_linea}: {rechazo.motivo}")
    if args.reporte:
        with open(args.reporte, "w", encoding="utf-8", newline="") as f:
            escritor = csv.writer(f)
            escritor.writerow(["nro_linea", "motivo"])
            for rechazo in reporte.rechazos:
                escritor.writerow([rechazo.nro_linea, rechazo.motivo])
        print(f"Reporte escrito en: {args.reporte}")
    return reporte.codigo


if __name__ == "__main__":
    sys.exit(main())
