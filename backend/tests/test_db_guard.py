"""H1: `db_session` debe rehusar DBs fuera de `turnos` / `*_test`.

Fail-fast: el nombre se parsea de DATABASE_URL ANTES de conectar o
truncar. Vale con y sin CI=true (rehusar, nunca skipear).
"""

import pytest

from backend.tests import conftest


@pytest.mark.parametrize("nombre", ["turnos", "algo_test"])
def test_guard_permite_db_segura(nombre):
    url = f"postgresql+psycopg://odontologia:odontologia@localhost:5433/{nombre}"

    conftest._exigir_db_permitida(url)  # no debe lanzar


@pytest.mark.parametrize("nombre", ["otra", "produccion", "turnos_prod"])
def test_guard_rehusa_sin_conectar(monkeypatch, nombre):
    url = f"postgresql+psycopg://odontologia:odontologia@localhost:5433/{nombre}"

    def _no_conectar(*args, **kwargs):
        raise AssertionError(
            "no debe conectar ni truncar ante DB no permitida"
        )

    monkeypatch.setattr(conftest, "_postgres_alcanzable", _no_conectar)
    monkeypatch.setattr(
        "sqlalchemy.create_engine", _no_conectar, raising=False
    )

    with pytest.raises(RuntimeError, match=nombre) as excinfo:
        conftest._exigir_db_permitida(url)

    assert "_test" in str(excinfo.value)
