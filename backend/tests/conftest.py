"""Fixtures de Postgres real para tests de integracion (C-02).

- `db_session`: sesion con rollback transaccional por test.
- Si Postgres no es alcanzable (sin DATABASE_URL o conexion
  rechazada) los tests `integration` se skipean... salvo con CI=true,
  donde la ausencia de Postgres FALLA (fail-fast: un skip silencioso
  ocultaria que la integracion no corrio).
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import text

os.environ.setdefault("TZ", "America/Argentina/Buenos_Aires")


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "integration: requiere Postgres real con rollback"
    )


def _database_url() -> str | None:
    return os.environ.get("DATABASE_URL")


def _nombre_db(url: str) -> str:
    """Nombre de la base parseado de la URL, sin conectar."""
    from sqlalchemy.engine.url import make_url
    from sqlalchemy.exc import ArgumentError

    try:
        return make_url(url).database or ""
    except ArgumentError:
        return ""


def _db_permitida(nombre: str) -> bool:
    return nombre == "turnos" or nombre.endswith("_test")


def _exigir_db_permitida(url: str | None) -> None:
    """Fail-fast: rehusa DBs fuera de `turnos` / `*_test`.

    Solo parsea la URL (nunca conecta ni trunca). Lanza RuntimeError
    con el nombre ofensor y la regla permitida.
    """
    nombre = _nombre_db(url or "")
    if not _db_permitida(nombre):
        raise RuntimeError(
            f"DATABASE_URL apunta a la base '{nombre}': rehusado. "
            "Los tests truncan el catalogo de la base apuntada; "
            "solo se permite 'turnos' o una base terminada en '_test'."
        )


def _postgres_alcanzable(url: str) -> bool:
    from sqlalchemy import create_engine
    from sqlalchemy.exc import ArgumentError, OperationalError

    try:
        engine = create_engine(url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        engine.dispose()
        return True
    except (OperationalError, ArgumentError):
        return False


@pytest.fixture(scope="session")
def _db_url_or_skip() -> str:
    url = _database_url()
    if url:
        try:
            _exigir_db_permitida(url)
        except RuntimeError as exc:
            pytest.fail(str(exc))
    if url and _postgres_alcanzable(url):
        return url
    if os.environ.get("CI") == "true":
        pytest.fail(
            "CI=true y Postgres inalcanzable "
            f"(DATABASE_URL={'definida' if url else 'ausente'}); "
            "la integracion no debe skipearse en CI."
        )
    pytest.skip(
        "Postgres no alcanzable (sin DATABASE_URL o conexion "
        "rechazada); se requiere Postgres real."
    )


@pytest.fixture(scope="session")
def _db_engine(_db_url_or_skip, request):
    url = _db_url_or_skip
    os.environ["DATABASE_URL"] = url
    ini = os.path.join(str(request.config.rootdir), "backend", "alembic.ini")
    if os.path.exists(ini):
        from alembic import command
        from alembic.config import Config

        command.upgrade(Config(ini), "head")
    else:
        from sqlalchemy import create_engine

        from backend.app.db import Base

        Base.metadata.create_all(create_engine(url))
    from backend.app.db import get_engine

    return get_engine()


_CATALOGO_TABLES = (
    "pacientes, profesionales, sillones, "
    "prestaciones, horarios, bloqueos, turnos"
)


@pytest.fixture()
def db_session(_db_engine):
    from sqlalchemy.orm import Session

    try:
        _exigir_db_permitida(_database_url())
    except RuntimeError as exc:
        pytest.fail(str(exc))
    conn = _db_engine.connect()
    txn = conn.begin()
    # Pizarra en blanco por test: los scenarios parten de
    # "catalogo vacio". TRUNCATE es transaccional en Postgres,
    # asi el rollback del teardown restaura lo previo.
    conn.execute(text(f"TRUNCATE {_CATALOGO_TABLES}"))
    session = Session(bind=conn)
    yield session
    try:
        session.close()
    finally:
        if txn.is_active:
            txn.rollback()
        conn.close()
