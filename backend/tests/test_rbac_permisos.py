"""Coherencia de la matriz RBAC de caja con design.md D3 (Grupo 3, tarea 3.4).

La matriz de abajo está escrita a mano desde design.md §D3 (endpoint x rol)
y NO se deriva de `permissions.py`: si el código y el diseño divergen,
este test falla. Para cada uno de los 9 endpoints se afirma que
`roles_con_permiso(<capability>)` es exactamente la columna "allow".

El alcance de "GET /roles expone capabilities sin wildcard" queda fuera:
el endpoint se completa en el grupo 4.
"""

from __future__ import annotations

import pytest

from backend.app.rbac.permissions import roles_con_permiso

# Columna "allow" de la matriz 9x4 de design.md D3, copiada a mano.
MATRIZ_D3: list[tuple[str, str, frozenset[str]]] = [
    ("POST /caja/abrir", "caja:escribir", frozenset({"admin", "recepcion"})),
    ("POST /caja/cerrar", "caja:escribir", frozenset({"admin", "recepcion"})),
    (
        "GET /caja/{id}",
        "caja:leer",
        frozenset({"admin", "recepcion", "odontologo"}),
    ),
    (
        "GET /caja",
        "caja:leer",
        frozenset({"admin", "recepcion", "odontologo"}),
    ),
    ("POST /cobros", "cobros:escribir", frozenset({"admin", "recepcion"})),
    (
        "GET /cobros/{id}",
        "cobros:leer",
        frozenset({"admin", "recepcion", "odontologo"}),
    ),
    (
        "POST /cobros/{id}/anular",
        "cobros:escribir",
        frozenset({"admin", "recepcion"}),
    ),
    (
        "POST /cobros/{id}/factura-arca",
        "cobros:facturar",
        frozenset({"admin", "recepcion"}),
    ),
    (
        "GET /liquidaciones-os",
        "liquidaciones:leer",
        frozenset({"admin", "recepcion", "odontologo"}),
    ),
]


@pytest.mark.parametrize(
    "endpoint,capability,permitidos",
    MATRIZ_D3,
    ids=[f"{e[0]}" for e in MATRIZ_D3],
)
def test_matriz_d3(
    endpoint: str, capability: str, permitidos: frozenset[str]
) -> None:
    assert roles_con_permiso(capability) == permitidos, (
        f"{endpoint}: roles_con_permiso({capability!r})="
        f"{set(roles_con_permiso(capability))} != D3 allow={set(permitidos)}"
    )


def test_paciente_no_tiene_nada() -> None:
    """Paciente no aparece en ninguna columna allow de la matriz D3."""
    for _, capability, permitidos in MATRIZ_D3:
        assert "paciente" not in permitidos, capability
        assert "paciente" not in roles_con_permiso(capability), capability
