"""Capability → roles: única fuente de verdad para autorización (C-11 / D2).

La matriz PERMISOS_POR_ROL define qué puede cada rol. Todo lo demás
(se `roles_con_permiso`, superficies admin, verificación de endpoints)
se deriva de esta tabla unívoca.
"""

from __future__ import annotations

ROLES = ("admin", "recepcion", "odontologo", "paciente")

PERMISOS_POR_ROL: dict[str, frozenset[str]] = {
    "admin": frozenset({
        "caja:leer", "caja:escribir", "cobros:leer", "cobros:escribir",
        "cobros:facturar", "liquidaciones:leer", "admin:gestionar",
    }),
    "recepcion": frozenset({
        "caja:leer", "caja:escribir", "cobros:leer", "cobros:escribir",
        "cobros:facturar", "liquidaciones:leer",
    }),
    "odontologo": frozenset({"caja:leer", "cobros:leer", "liquidaciones:leer"}),
    "paciente": frozenset(),
}


def roles_con_permiso(capability: str) -> frozenset[str]:
    """Retorna los roles que poseen la capability dada.

    Es la derivación canónica usada por la verificación y por GET /roles.
    """
    return frozenset(r for r, caps in PERMISOS_POR_ROL.items() if capability in caps)