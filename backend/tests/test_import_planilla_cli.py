"""Tests del CLI de importación (C-11, grupo 12, Parte A).

`main()` acepta `session_factory` inyectable (default: `get_session`,
comportamiento actual). Los tests de persistencia/commit usan una sesión
real sobre `_db_engine` — nunca dos corridas reales contra la base
compartida — y limpian lo creado antes de cerrar.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from backend.app.agenda.models import Paciente, Profesional
from scripts.import_planilla import main

CSV_OK = (
    "tipo,nombre,dni,matricula,contacto\n"
    "paciente,Paciente Uno,DNI-FICT-001,,111\n"
    "profesional,Profesional Uno,,MP-FICT-001,\n"
)
CSV_CON_RECHAZO = (
    "tipo,nombre,dni,matricula,contacto\n"
    "paciente,Uno,DNI-FICT-001,,1\n"
    "sillon,Box,,,\n"
)
CSV_CABECERA_Rota = "tipo,nombre\npaciente,Uno\n"


def _archivo(tmp_path, contenido: str, nombre: str = "planilla.csv") -> str:
    ruta = tmp_path / nombre
    ruta.write_text(contenido, encoding="utf-8")
    return str(ruta)


def test_codigo_0_con_csv_valido(db_session, tmp_path) -> None:
    codigo = main(
        ["--archivo", _archivo(tmp_path, CSV_OK)],
        session_factory=lambda: db_session,
    )
    assert codigo == 0


def test_codigo_1_con_rechazos(db_session, tmp_path) -> None:
    codigo = main(
        ["--archivo", _archivo(tmp_path, CSV_CON_RECHAZO)],
        session_factory=lambda: db_session,
    )
    assert codigo == 1


def test_codigo_2_con_cabecera_invalida(db_session, tmp_path) -> None:
    codigo = main(
        ["--archivo", _archivo(tmp_path, CSV_CABECERA_Rota)],
        session_factory=lambda: db_session,
    )
    assert codigo == 2


def test_resumen_en_espanol(db_session, tmp_path, capsys) -> None:
    main(
        ["--archivo", _archivo(tmp_path, CSV_OK)],
        session_factory=lambda: db_session,
    )
    salida = capsys.readouterr().out
    assert "Creados:" in salida
    assert "Actualizados:" in salida
    assert "Rechazados:" in salida


def test_reporte_genera_archivo(db_session, tmp_path) -> None:
    destino = tmp_path / "reporte.csv"
    codigo = main(
        [
            "--archivo",
            _archivo(tmp_path, CSV_CON_RECHAZO),
            "--reporte",
            str(destino),
        ],
        session_factory=lambda: db_session,
    )
    assert codigo == 1
    texto = destino.read_text(encoding="utf-8")
    assert "nro_linea" in texto
    assert "3" in texto  # línea del rechazo


def _limpiar(engine, dnis, matriculas) -> None:
    sesion = Session(bind=engine)
    try:
        sesion.query(Paciente).filter(Paciente.dni.in_(dnis)).delete(
            synchronize_session=False
        )
        sesion.query(Profesional).filter(
            Profesional.matricula.in_(matriculas)
        ).delete(synchronize_session=False)
        sesion.commit()
    finally:
        sesion.close()


def test_cli_commit_persiste_y_dry_run_no(_db_engine, tmp_path) -> None:
    ruta = _archivo(
        tmp_path,
        (
            "tipo,nombre,dni,matricula,contacto\n"
            "paciente,Paciente Cli,DNI-FICT-900,,9\n"
            "profesional,Prof Cli,,MP-FICT-900,\n"
        ),
    )
    # Corrida real: el commit del CLI persiste los datos.
    codigo = main(
        ["--archivo", ruta], session_factory=lambda: Session(bind=_db_engine)
    )
    assert codigo == 0
    verificacion = Session(bind=_db_engine)
    try:
        assert verificacion.query(Paciente).filter_by(dni="DNI-FICT-900").count() == 1
        assert verificacion.query(Profesional).filter_by(matricula="MP-FICT-900").count() == 1
    finally:
        verificacion.close()
    _limpiar(_db_engine, ["DNI-FICT-900"], ["MP-FICT-900"])

    # Dry-run contra la base ya limpia: no escribe nada.
    codigo = main(
        ["--archivo", ruta, "--dry-run"],
        session_factory=lambda: Session(bind=_db_engine),
    )
    assert codigo == 0
    verificacion = Session(bind=_db_engine)
    try:
        assert verificacion.query(Paciente).filter_by(dni="DNI-FICT-900").count() == 0
    finally:
        verificacion.close()


# ---------- Sesión espía: conteo de commits ----------


def _espia(db_session):
    """Mock que envuelve db_session contando commits; close es no-op
    para no cerrar la fixture de la sesión compartida."""
    from unittest.mock import Mock

    espia = Mock(wraps=db_session)
    espia.close = lambda: None
    return espia


def test_dry_run_no_commitea(db_session, tmp_path) -> None:
    espia = _espia(db_session)
    codigo = main(
        ["--archivo", _archivo(tmp_path, CSV_OK), "--dry-run"],
        session_factory=lambda: espia,
    )
    assert codigo == 0
    assert espia.commit.call_count == 0


def test_cabecera_invalida_no_commitea(db_session, tmp_path) -> None:
    espia = _espia(db_session)
    codigo = main(
        ["--archivo", _archivo(tmp_path, CSV_CABECERA_Rota)],
        session_factory=lambda: espia,
    )
    assert codigo == 2
    assert espia.commit.call_count == 0


def test_corrida_real_commitea_una_vez(db_session, tmp_path) -> None:
    espia = _espia(db_session)
    codigo = main(
        ["--archivo", _archivo(tmp_path, CSV_OK)],
        session_factory=lambda: espia,
    )
    assert codigo == 0
    assert espia.commit.call_count == 1


def test_fabrica_sin_base_da_codigo_2_en_espanol(capsys) -> None:
    def _sin_base():
        raise RuntimeError("sin base")

    codigo = main(
        ["--archivo", "inexistente.csv"], session_factory=_sin_base
    )
    assert codigo == 2
    salida = capsys.readouterr().out
    assert "no se pudo abrir la base de datos" in salida
