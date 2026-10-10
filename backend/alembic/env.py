"""Alembic env (C-02): DATABASE_URL solo en tiempo de migracion.

Importar este modulo NO conecta: la URL se lee unicamente cuando se
ejecuta una migracion (D13). Usa Base.metadata como target.
"""

from __future__ import annotations

import os

from alembic import context
from sqlalchemy import create_engine

from backend.app.agenda import models  # noqa: F401  (metadata)
from backend.app.db import Base
from backend.app.turnos import models as _turnos_models  # noqa: F401

config = context.config
target_metadata = Base.metadata


def get_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL no esta definida; "
            "exportarla para migrar (ver README)."
        )
    return url


def run_migrations_offline() -> None:
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(get_url())
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
