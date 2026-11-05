"""Servicio de Catálogo y traducción selectiva de errores de integridad (C-12).

D3: Para las restricciones únicas reales (uq_pacientes_dni,
uq_profesionales_matricula, uq_sillones_nombre, uq_prestaciones_nombre),
captura IntegrityError y mapea a ConflictoCatalogo (409) con causas específicas:
- duplicate_dni
- duplicate_matricula
- duplicate_nombre_sillon
- duplicate_nombre_prestacion

Cualquier otro IntegrityError se propaga sin traducir.
"""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError


class ConflictoCatalogo(Exception):
    """Conflicto de negocio en catálogo -> HTTP 409 con causa y detalle."""

    def __init__(self, causa: str, detalle: str):
        super().__init__(detalle)
        self.causa = causa
        self.detalle = detalle

    @property
    def detail_dict(self) -> dict[str, str]:
        return {"causa": self.causa, "detalle": self.detalle}


MAPA_CONSTRAINTS_409: dict[str, tuple[str, str]] = {
    "uq_pacientes_dni": (
        "duplicate_dni",
        "Ya existe un paciente registrado con el mismo DNI.",
    ),
    "uq_profesionales_matricula": (
        "duplicate_matricula",
        "Ya existe un profesional registrado con la misma matrícula.",
    ),
    "uq_sillones_nombre": (
        "duplicate_nombre_sillon",
        "Ya existe un sillón registrado con el mismo nombre.",
    ),
    "uq_prestaciones_nombre": (
        "duplicate_nombre_prestacion",
        "Ya existe una prestación registrada con el mismo nombre.",
    ),
}


def traducir_integridad_catalogo(exc: IntegrityError) -> ConflictoCatalogo:
    """Traduce un IntegrityError de PostgreSQL a ConflictoCatalogo si coincide

    con alguna de las restricciones únicas del catálogo. De lo contrario,
    vuelve a lanzar la excepción original sin modificar.
    """
    orig = getattr(exc, "orig", None)
    diag = getattr(orig, "diag", None)
    constraint = getattr(diag, "constraint_name", None)

    if constraint in MAPA_CONSTRAINTS_409:
        causa, detalle = MAPA_CONSTRAINTS_409[constraint]
        return ConflictoCatalogo(causa=causa, detalle=detalle)

    raise exc
