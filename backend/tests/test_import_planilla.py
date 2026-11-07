"""Importación asistida desde planilla CSV (C-11, grupo 10, TDD RED).

La idempotencia se prueba con dos pasadas dentro de la misma fixture
`db_session`: ambas comparten la transacción (el servicio no commitea),
así la segunda pasada ve la primera sin commitear. Nunca se ejecuta el
CLI dos veces contra la base compartida.
"""

from __future__ import annotations

import pytest

from backend.app.agenda.models import Paciente, Profesional
from backend.app.migracion.service import importar_planilla

CSV_BASICO = (
    "tipo,nombre,dni,matricula,contacto\n"
    "paciente,Paciente Uno,DNI-FICT-001,,111\n"
    "paciente,Paciente Dos,DNI-FICT-002,,222\n"
    "profesional,Profesional Uno,,MP-FICT-001,\n"
)


def _escribir(tmp_path, contenido: str, nombre: str = "planilla.csv"):
    ruta = tmp_path / nombre
    ruta.write_text(contenido, encoding="utf-8")
    return str(ruta)


def test_csv_valido_crea_pacientes_y_profesionales(db_session, tmp_path) -> None:
    reporte = importar_planilla(db_session, _escribir(tmp_path, CSV_BASICO))
    assert reporte.creados == 3, reporte
    assert reporte.actualizados == 0
    assert reporte.rechazados == 0
    assert db_session.query(Paciente).count() == 2
    assert db_session.query(Profesional).count() == 1


def test_segunda_corrida_no_duplica(db_session, tmp_path) -> None:
    ruta = _escribir(tmp_path, CSV_BASICO)
    importar_planilla(db_session, ruta)
    reporte = importar_planilla(db_session, ruta)
    assert reporte.creados == 0
    assert reporte.actualizados == 3
    assert reporte.rechazados == 0
    assert db_session.query(Paciente).count() == 2
    assert db_session.query(Profesional).count() == 1


def test_mismo_dni_con_otro_nombre_actualiza(db_session, tmp_path) -> None:
    ruta = _escribir(tmp_path, CSV_BASICO)
    importar_planilla(db_session, ruta)
    otro = (
        "tipo,nombre,dni,matricula,contacto\n"
        "paciente,Paciente Renombrado,DNI-FICT-001,,333\n"
    )
    reporte = importar_planilla(db_session, _escribir(tmp_path, otro, "o.csv"))
    assert reporte.actualizados == 1
    assert reporte.creados == 0
    assert db_session.query(Paciente).count() == 2
    pac = (
        db_session.query(Paciente).filter_by(dni="DNI-FICT-001").one()
    )
    assert pac.nombre == "Paciente Renombrado"
    assert pac.contacto == "333"


def test_clave_repetida_en_archivo_rechaza_segunda(db_session, tmp_path) -> None:
    contenido = (
        "tipo,nombre,dni,matricula,contacto\n"
        "paciente,Uno,DNI-FICT-001,,1\n"
        "paciente,UnoBis,DNI-FICT-001,,2\n"
    )
    reporte = importar_planilla(db_session, _escribir(tmp_path, contenido))
    assert reporte.creados == 1
    assert reporte.rechazados == 1
    assert len(reporte.rechazos) == 1
    assert reporte.rechazos[0].nro_linea == 3
    assert db_session.query(Paciente).count() == 1


def test_fila_sin_dni_rechazada_sin_revertir_validas(
    db_session, tmp_path
) -> None:
    contenido = (
        "tipo,nombre,dni,matricula,contacto\n"
        "paciente,Uno,DNI-FICT-001,,1\n"
        "paciente,SinDni,,,2\n"
        "profesional,Prof,,MP-FICT-001,\n"
    )
    reporte = importar_planilla(db_session, _escribir(tmp_path, contenido))
    assert reporte.rechazados == 1
    assert reporte.rechazos[0].nro_linea == 3
    assert reporte.creados == 2  # las válidas no se revierten
    assert db_session.query(Paciente).count() == 1
    assert db_session.query(Profesional).count() == 1


def test_tipo_desconocido_rechazado(db_session, tmp_path) -> None:
    contenido = (
        "tipo,nombre,dni,matricula,contacto\n"
        "sillon,Box 1,,,\n"
        "paciente,Uno,DNI-FICT-001,,1\n"
    )
    reporte = importar_planilla(db_session, _escribir(tmp_path, contenido))
    assert reporte.rechazados == 1
    assert reporte.rechazos[0].nro_linea == 2
    assert reporte.creados == 1


@pytest.mark.parametrize(
    "contenido",
    [
        # especialidad no existe en el modelo y no se admite
        (
            "tipo,nombre,dni,matricula,contacto,especialidad\n"
            "paciente,Uno,DNI-FICT-001,,,x\n"
        ),
        # cabecera sin matricula: inválida
        "tipo,nombre,dni,contacto\npaciente,Uno,DNI-FICT-001,1\n",
    ],
)
def test_cabecera_invalida_codigo_2(db_session, tmp_path, contenido) -> None:
    reporte = importar_planilla(db_session, _escribir(tmp_path, contenido))
    assert reporte.codigo == 2
    assert reporte.creados == 0
    assert reporte.actualizados == 0
    assert db_session.query(Paciente).count() == 0
    assert db_session.query(Profesional).count() == 0


def test_cabecera_sin_contacto_es_valida(db_session, tmp_path) -> None:
    contenido = (
        "tipo,nombre,dni,matricula\n"
        "paciente,Uno,DNI-FICT-001,\n"
        "profesional,Prof,,MP-FICT-001\n"
    )
    reporte = importar_planilla(db_session, _escribir(tmp_path, contenido))
    assert reporte.codigo == 0
    assert reporte.creados == 2
    pac = db_session.query(Paciente).one()
    assert pac.contacto is None


def test_dry_run_no_escribe(db_session, tmp_path) -> None:
    ruta = _escribir(tmp_path, CSV_BASICO)
    reporte = importar_planilla(db_session, ruta, dry_run=True)
    assert reporte.creados == 3
    assert db_session.query(Paciente).count() == 0
    assert db_session.query(Profesional).count() == 0
    # Sin dry-run sí escribe
    importar_planilla(db_session, ruta)
    assert db_session.query(Paciente).count() == 2


def test_pacientes_importados_con_ficticio_true(db_session, tmp_path) -> None:
    importar_planilla(db_session, _escribir(tmp_path, CSV_BASICO))
    pacientes = db_session.query(Paciente).all()
    assert pacientes
    assert all(p.ficticio is True for p in pacientes)


def test_error_de_base_en_una_fila_no_revierte_vecinas(
    db_session, tmp_path
) -> None:
    """El nombre de 300 caracteres viola VARCHAR(200) en el flush: el
    savepoint de esa fila la rechaza sin tocar las demás."""
    nombre_largo = "X" * 300
    contenido = (
        "tipo,nombre,dni,matricula,contacto\n"
        "paciente,Uno,DNI-FICT-001,,1\n"
        f"paciente,{nombre_largo},DNI-FICT-002,,2\n"
        "paciente,Tres,DNI-FICT-003,,3\n"
    )
    reporte = importar_planilla(db_session, _escribir(tmp_path, contenido))
    assert reporte.creados == 2
    assert reporte.rechazados == 1
    assert reporte.rechazos[0].nro_linea == 3
    assert {p.dni for p in db_session.query(Paciente).all()} == {
        "DNI-FICT-001",
        "DNI-FICT-003",
    }
