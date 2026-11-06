"""006 catalogo activo: agrega activo a pacientes, profesionales, prestaciones y horarios.

Revision ID: 006_catalogo_activo
Revises: 005_caja_pagos
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "006_catalogo_activo"
down_revision: str | Sequence[str] | None = "005_caja_pagos"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. pacientes
    op.add_column(
        "pacientes",
        sa.Column(
            "activo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.create_index("ix_pacientes_activo", "pacientes", ["activo"])

    # 2. profesionales
    op.add_column(
        "profesionales",
        sa.Column(
            "activo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.create_index("ix_profesionales_activo", "profesionales", ["activo"])

    # 3. prestaciones
    op.add_column(
        "prestaciones",
        sa.Column(
            "activo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.create_index("ix_prestaciones_activo", "prestaciones", ["activo"])

    # 4. horarios
    op.add_column(
        "horarios",
        sa.Column(
            "activo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.create_index("ix_horarios_activo", "horarios", ["activo"])


def downgrade() -> None:
    # 4. horarios
    op.drop_index("ix_horarios_activo", table_name="horarios")
    op.drop_column("horarios", "activo")

    # 3. prestaciones
    op.drop_index("ix_prestaciones_activo", table_name="prestaciones")
    op.drop_column("prestaciones", "activo")

    # 2. profesionales
    op.drop_index("ix_profesionales_activo", table_name="profesionales")
    op.drop_column("profesionales", "activo")

    # 1. pacientes
    op.drop_index("ix_pacientes_activo", table_name="pacientes")
    op.drop_column("pacientes", "activo")
