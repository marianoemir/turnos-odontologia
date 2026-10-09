"""T1.2 (C-02): Base declarativa + engine/Session perezosos.

La app debe importar sin DATABASE_URL (contrato foundation intacto):
la URL solo se lee cuando se pide un engine/sesion por primera vez.
"""

import pytest


def test_db_importa_sin_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    from backend.app import db

    assert hasattr(db, "Base")
    assert callable(db.get_engine)
    assert callable(db.get_session)


def test_get_engine_exige_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    from backend.app import db

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        db.get_engine()


def test_get_engine_no_conecta_al_crear(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql+psycopg://u:p@localhost:1/db"
    )
    from backend.app import db

    engine = db.get_engine()

    assert engine.url.drivername == "postgresql+psycopg"
