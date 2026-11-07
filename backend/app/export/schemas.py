"""Schemas del contrato de exportación (C-11, grupo 9).

Envelope con `contrato_version`, `zona`, `periodo` y los 4 dominios.
El contenido de cada dominio son dicts serializables construidos por
`backend.app.export.service`; aquí quedan los tipos del envelope.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict

CONTRATO_VERSION = "1.0"
ZONA_NOMBRE = "America/Argentina/Buenos_Aires"


class Periodo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    desde: str
    hasta: str
    dias: int


class HistoriaClinicaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    historias: list[dict[str, Any]]
    entradas: list[dict[str, Any]]
    odontogramas: list[dict[str, Any]]
    planes: list[dict[str, Any]]
    items: list[dict[str, Any]]


class AgendaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    turnos: list[dict[str, Any]]
    profesionales: list[dict[str, Any]]
    sillones: list[dict[str, Any]]
    prestaciones: list[dict[str, Any]]


class CajaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    cajas: list[dict[str, Any]]
    cobros: list[dict[str, Any]]
    liquidaciones_os: list[dict[str, Any]]


class ExportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    contrato_version: str
    generado_en: str
    zona: str
    periodo: Periodo
    pacientes: list[dict[str, Any]]
    historia_clinica: HistoriaClinicaOut
    agenda: AgendaOut
    caja: CajaOut
