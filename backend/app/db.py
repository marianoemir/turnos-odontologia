"""Persistencia (C-02): Base declarativa + engine/Session perezosos.

Importar este modulo (y la app) NO requiere DATABASE_URL: la URL solo
se lee cuando se pide un engine/sesion por primera vez. Asi el contrato
foundation (arranque y GET /health sin Postgres) sigue intacto.
"""

from __future__ import annotations

import os

from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


_engines: dict = {}


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL no esta definida; "
            "exportarla para conectar a Postgres."
        )
    return url


def get_engine():
    """Crea (o reutiliza, por URL) el engine sin conectar hasta usarlo."""
    url = _database_url()
    engine = _engines.get(url)
    if engine is None:
        engine = create_engine(url)
        _engines[url] = engine
    return engine


def get_session():
    """Fabrica de sesiones ligada al engine perezoso."""
    return sessionmaker(bind=get_engine(), expire_on_commit=False)
