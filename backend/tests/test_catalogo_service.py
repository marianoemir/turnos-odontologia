"""Tests de integración para servicio de catálogo y solapes de horario (C-12, tarea 4.1).

Verifica contra PostgreSQL real:
- Violaciones reales de las 4 constraints únicas (uq_pacientes_dni,
  uq_profesionales_matricula, uq_sillones_nombre, uq_prestaciones_nombre)
  traducidas a 409 con causas específicas.
- Propagación sin traducir de otros IntegrityError (ej. CheckConstraint rango_valido en HorarioAtencion).
- validar_horario_sin_solape:
  - Solape real rechazado con ValueError
  - Solape con franja inactiva ignorado (permitido)
  - PATCH idempotente sin falso positivo (excluir_id)
  - Adyacencia exacta permitida (hasta == desde del otro)
Sin depender de la fecha real del sistema.
"""

from datetime import time

import pytest
from sqlalchemy.exc import IntegrityError

from backend.app.agenda.models import (
    HorarioAtencion,
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
    validar_horario_sin_solape,
)
from backend.app.agenda.service_catalogo import (
    ConflictoCatalogo,
    traducir_integridad_catalogo,
)

pytestmark = pytest.mark.integration


# ============================================================================
# 1. Mapeo selectivo de IntegrityError (PostgreSQL real)
# ============================================================================


def test_duplicado_dni_mapea_a_duplicate_dni(db_session):
    p1 = Paciente(nombre="Paciente Uno", dni="DNI-TEST-100", ficticio=True)
    db_session.add(p1)
    db_session.flush()

    p2 = Paciente(nombre="Paciente Dos", dni="DNI-TEST-100", ficticio=True)
    db_session.add(p2)

    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()

    conflicto = traducir_integridad_catalogo(exc_info.value)
    assert isinstance(conflicto, ConflictoCatalogo)
    assert conflicto.causa == "duplicate_dni"
    assert "DNI" in conflicto.detalle
    assert conflicto.detail_dict == {
        "causa": "duplicate_dni",
        "detalle": conflicto.detalle,
    }


def test_duplicado_matricula_mapea_a_duplicate_matricula(db_session):
    prof1 = Profesional(nombre="Dra. Uno", matricula="MAT-TEST-100")
    db_session.add(prof1)
    db_session.flush()

    prof2 = Profesional(nombre="Dr. Dos", matricula="MAT-TEST-100")
    db_session.add(prof2)

    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()

    conflicto = traducir_integridad_catalogo(exc_info.value)
    assert conflicto.causa == "duplicate_matricula"
    assert "matrícula" in conflicto.detalle


def test_duplicado_nombre_sillon_mapea_a_duplicate_nombre_sillon(db_session):
    s1 = SillonBox(nombre="Sillón Azul")
    db_session.add(s1)
    db_session.flush()

    s2 = SillonBox(nombre="Sillón Azul")
    db_session.add(s2)

    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()

    conflicto = traducir_integridad_catalogo(exc_info.value)
    assert conflicto.causa == "duplicate_nombre_sillon"
    assert "sillón" in conflicto.detalle


def test_duplicado_nombre_prestacion_mapea_a_duplicate_nombre_prestacion(
    db_session,
):
    pr1 = Prestacion(nombre="Ortodoncia Test", duracion_min=45)
    db_session.add(pr1)
    db_session.flush()

    pr2 = Prestacion(nombre="Ortodoncia Test", duracion_min=30)
    db_session.add(pr2)

    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()

    conflicto = traducir_integridad_catalogo(exc_info.value)
    assert conflicto.causa == "duplicate_nombre_prestacion"
    assert "prestación" in conflicto.detalle


def test_otro_integrity_error_se_propaga_sin_traducir(db_session):
    prof = Profesional(nombre="Dr. Horario", matricula="MAT-TEST-200")
    db_session.add(prof)
    db_session.flush()

    # Violación del CheckConstraint rango_valido (desde >= hasta)
    h_invalido = HorarioAtencion(
        profesional_id=prof.id,
        dia_semana=1,
        desde=time(14, 0),
        hasta=time(10, 0),
    )
    db_session.add(h_invalido)

    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()

    # Debe propagar la excepción original (no traduce a ConflictoCatalogo)
    with pytest.raises(IntegrityError):
        traducir_integridad_catalogo(exc_info.value)


# ============================================================================
# 2. validar_horario_sin_solape
# ============================================================================


def test_validar_horario_solape_real_rechazado(db_session):
    prof = Profesional(nombre="Dr. Solape", matricula="MAT-SOL-001")
    db_session.add(prof)
    db_session.flush()

    h1 = HorarioAtencion(
        profesional_id=prof.id,
        dia_semana=1,
        desde=time(9, 0),
        hasta=time(13, 0),
        activo=True,
    )
    db_session.add(h1)
    db_session.flush()

    # Intento de solape parcial 12:00 a 15:00
    with pytest.raises(ValueError, match="[Ss]olape"):
        validar_horario_sin_solape(
            db_session,
            profesional_id=prof.id,
            dia_semana=1,
            desde=time(12, 0),
            hasta=time(15, 0),
        )


def test_validar_horario_adyacencia_exacta_permitida(db_session):
    prof = Profesional(nombre="Dr. Adyacente", matricula="MAT-ADY-001")
    db_session.add(prof)
    db_session.flush()

    h1 = HorarioAtencion(
        profesional_id=prof.id,
        dia_semana=2,
        desde=time(9, 0),
        hasta=time(13, 0),
        activo=True,
    )
    db_session.add(h1)
    db_session.flush()

    # Adyacencia exacta (desde == 13:00, justo el fin de h1) no solapa (RN-AG-04)
    validar_horario_sin_solape(
        db_session,
        profesional_id=prof.id,
        dia_semana=2,
        desde=time(13, 0),
        hasta=time(18, 0),
    )


def test_validar_horario_ignora_inactivos(db_session):
    prof = Profesional(nombre="Dr. Inactivo", matricula="MAT-INA-001")
    db_session.add(prof)
    db_session.flush()

    # Horario existente pero inactivo en 09:00 - 13:00
    h_inactivo = HorarioAtencion(
        profesional_id=prof.id,
        dia_semana=3,
        desde=time(9, 0),
        hasta=time(13, 0),
        activo=False,
    )
    db_session.add(h_inactivo)
    db_session.flush()

    # Validar nuevo horario activo en el mismo rango exacto -> debe permitirse
    validar_horario_sin_solape(
        db_session,
        profesional_id=prof.id,
        dia_semana=3,
        desde=time(9, 0),
        hasta=time(13, 0),
    )


def test_validar_horario_patch_idempotente_con_excluir_id(db_session):
    prof = Profesional(nombre="Dr. Patch", matricula="MAT-PAT-001")
    db_session.add(prof)
    db_session.flush()

    h = HorarioAtencion(
        profesional_id=prof.id,
        dia_semana=4,
        desde=time(9, 0),
        hasta=time(13, 0),
        activo=True,
    )
    db_session.add(h)
    db_session.flush()

    # Sin excluir_id, validar el mismo horario chocaría con sí mismo
    with pytest.raises(ValueError, match="[Ss]olape"):
        validar_horario_sin_solape(
            db_session,
            profesional_id=prof.id,
            dia_semana=4,
            desde=time(9, 0),
            hasta=time(13, 0),
        )

    # Con excluir_id=h.id, el propio horario se omite y no produce falso positivo
    validar_horario_sin_solape(
        db_session,
        profesional_id=prof.id,
        dia_semana=4,
        desde=time(9, 0),
        hasta=time(13, 0),
        excluir_id=h.id,
    )

    # También permite modificar levemente el rango (ej. hasta las 14:00) excluyéndose a sí mismo
    validar_horario_sin_solape(
        db_session,
        profesional_id=prof.id,
        dia_semana=4,
        desde=time(9, 0),
        hasta=time(14, 0),
        excluir_id=h.id,
    )
