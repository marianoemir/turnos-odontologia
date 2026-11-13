"""Script para aplicar/revertir mutaciones de tareas 5.5 a 5.8."""

import sys
from pathlib import Path

CONTEXT_FILE = Path("backend/app/rbac/context.py")

MUTACION_5_5_ORIG = 'options={"require": ["sub", "rol", "exp"]},'
MUTACION_5_5_REPL = 'options={"require": ["sub", "rol", "exp"], "verify_exp": False},'

MUTACION_5_6_ORIG = 'if not usuario_db or not usuario_db.activo:'
MUTACION_5_6_REPL = 'if not usuario_db:'

MUTACION_5_7_ORIG = 'if not asoc:'
MUTACION_5_7_REPL = 'if False and not asoc:'

MUTACION_5_8_ORIG = 'if unverified_headers.get("alg") == "none":'
MUTACION_5_8_REPL = 'if False and unverified_headers.get("alg") == "none":'


def aplicar(nombre: str) -> None:
    contenido = CONTEXT_FILE.read_text(encoding="utf-8")
    if nombre == "5.5":
        orig, repl = MUTACION_5_5_ORIG, MUTACION_5_5_REPL
    elif nombre == "5.6":
        orig, repl = MUTACION_5_6_ORIG, MUTACION_5_6_REPL
    elif nombre == "5.7":
        orig, repl = MUTACION_5_7_ORIG, MUTACION_5_7_REPL
    elif nombre == "5.8":
        orig, repl = MUTACION_5_8_ORIG, MUTACION_5_8_REPL
    else:
        raise ValueError(f"Mutación desconocida: {nombre}")

    if orig not in contenido:
        print(f"ERROR: No se encontró texto para mutación {nombre}")
        sys.exit(1)

    nuevo = contenido.replace(orig, repl, 1)
    CONTEXT_FILE.write_text(nuevo, encoding="utf-8")
    print(f"Mutación {nombre} aplicada con éxito")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python scripts/mutaciones_grupo_5.py <5.5|5.6|5.7|5.8>")
        sys.exit(1)
    aplicar(sys.argv[1])
