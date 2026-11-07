"""Servicio de importación asistida desde planilla CSV (C-11, grupo 10, D8).

`importar_planilla(session, ruta, dry_run=False)` recibe la sesión
inyectada y NO hace commit ni close: el commit final es de quien invoca.
Aislamiento por fila con savepoint (`session.begin_nested()`); claves
naturales `dni` (paciente) y `matricula` (profesional); duplicados
intra-archivo rechazados en su segunda aparición.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.app.agenda.models import Paciente, Profesional

# Registra las tablas de rbac (sucursales, roles) para que el FK
# `profesionales.sucursal_id` resuelva fuera de la app web.
from backend.app.rbac import models as _rbac  # noqa: F401

COLUMNAS_OBLIGATORIAS = ("tipo", "nombre", "dni", "matricula")
COLUMNAS_PERMITIDAS = ("tipo", "nombre", "dni", "matricula", "contacto")


@dataclass
class Rechazo:
    nro_linea: int
    motivo: str


@dataclass
class ReporteImportacion:
    creados: int = 0
    actualizados: int = 0
    rechazados: int = 0
    rechazos: list[Rechazo] = field(default_factory=list)
    cabecera_invalida: bool = False
    creados_por_tipo: dict[str, int] = field(default_factory=dict)
    actualizados_por_tipo: dict[str, int] = field(default_factory=dict)
    rechazados_por_tipo: dict[str, int] = field(default_factory=dict)

    @property
    def codigo(self) -> int:
        if self.cabecera_invalida:
            return 2
        return 1 if self.rechazados else 0


def _rechazar(reporte: ReporteImportacion, tipo: str, nro: int, motivo: str) -> None:
    reporte.rechazados += 1
    reporte.rechazos.append(Rechazo(nro_linea=nro, motivo=motivo))
    reporte.rechazados_por_tipo[tipo] = (
        reporte.rechazados_por_tipo.get(tipo, 0) + 1
    )


def importar_planilla(
    session: Session, ruta: str, dry_run: bool = False
) -> ReporteImportacion:
    """Importa una planilla CSV. No commitea ni cierra la sesión."""
    reporte = ReporteImportacion()
    with open(ruta, encoding="utf-8", newline="") as f:
        lector = csv.DictReader(f)
        cabecera = list(lector.fieldnames or [])
        desconocidas = [c for c in cabecera if c not in COLUMNAS_PERMITIDAS]
        faltantes = [c for c in COLUMNAS_OBLIGATORIAS if c not in cabecera]
        if desconocidas or faltantes:
            reporte.cabecera_invalida = True
            return reporte

        vistas: set[tuple[str, str]] = set()
        for indice, fila in enumerate(lector):
            nro_linea = indice + 2
            tipo = (fila.get("tipo") or "").strip()
            nombre = (fila.get("nombre") or "").strip()
            dni = (fila.get("dni") or "").strip()
            matricula = (fila.get("matricula") or "").strip()
            contacto = fila.get("contacto")

            if tipo not in ("paciente", "profesional"):
                _rechazar(reporte, tipo or "?", nro_linea, f"tipo desconocido: {tipo!r}")
                continue

            if tipo == "paciente":
                if not nombre:
                    _rechazar(reporte, tipo, nro_linea, "falta nombre")
                    continue
                if not dni:
                    _rechazar(reporte, tipo, nro_linea, "falta dni")
                    continue
                clave = dni
            else:
                if not nombre:
                    _rechazar(reporte, tipo, nro_linea, "falta nombre")
                    continue
                if not matricula:
                    _rechazar(reporte, tipo, nro_linea, "falta matricula")
                    continue
                clave = matricula

            if (tipo, clave) in vistas:
                _rechazar(
                    reporte, tipo, nro_linea,
                    f"clave duplicada en el archivo: {clave}",
                )
                continue
            vistas.add((tipo, clave))

            if dry_run:
                existe = _existe(session, tipo, clave)
                if existe:
                    reporte.actualizados += 1
                    reporte.actualizados_por_tipo[tipo] = (
                        reporte.actualizados_por_tipo.get(tipo, 0) + 1
                    )
                else:
                    reporte.creados += 1
                    reporte.creados_por_tipo[tipo] = (
                        reporte.creados_por_tipo.get(tipo, 0) + 1
                    )
                continue

            try:
                with session.begin_nested():
                    actualizo = _aplicar(
                        session, tipo, nombre, dni, matricula, contacto, clave
                    )
            except SQLAlchemyError as exc:
                _rechazar(
                    reporte, tipo, nro_linea,
                    f"error de base en la fila: {exc.__class__.__name__}",
                )
                continue
            if actualizo:
                reporte.actualizados += 1
                reporte.actualizados_por_tipo[tipo] = (
                    reporte.actualizados_por_tipo.get(tipo, 0) + 1
                )
            else:
                reporte.creados += 1
                reporte.creados_por_tipo[tipo] = (
                    reporte.creados_por_tipo.get(tipo, 0) + 1
                )
    return reporte


def _existe(session: Session, tipo: str, clave: str) -> bool:
    if tipo == "paciente":
        return (
            session.query(Paciente).filter_by(dni=clave).first() is not None
        )
    return (
        session.query(Profesional).filter_by(matricula=clave).first()
        is not None
    )


def _aplicar(
    session: Session,
    tipo: str,
    nombre: str,
    dni: str,
    matricula: str,
    contacto: str | None,
    clave: str,
) -> bool:
    """Crea o actualiza por clave natural. True si actualizó."""
    if tipo == "paciente":
        pac = session.query(Paciente).filter_by(dni=clave).first()
        if pac is None:
            session.add(
                Paciente(
                    nombre=nombre,
                    dni=dni,
                    contacto=contacto or None,
                    ficticio=True,
                    activo=True,
                )
            )
            return False
        pac.nombre = nombre
        pac.contacto = contacto or None
        pac.activo = True
        return True
    prof = session.query(Profesional).filter_by(matricula=clave).first()
    if prof is None:
        session.add(
            Profesional(
                nombre=nombre, matricula=matricula, activo=True
            )
        )
        return False
    prof.nombre = nombre
    prof.activo = True
    return True
