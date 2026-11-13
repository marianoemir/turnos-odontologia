"""009 auth usuarios: tabla de usuarios con contraseñas hasheadas (C-24).

Revision ID: 009_auth_usuarios
Revises: 008_recordatorio
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "009_auth_usuarios"
down_revision: str | Sequence[str] | None = "008_recordatorio"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "usuarios",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("dni", sa.String(length=32), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("rol_id", sa.Uuid(), nullable=False),
        sa.Column(
            "activo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["rol_id"],
            ["roles.id"],
            name="fk_usuarios_rol_id_roles",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_usuarios"),
        sa.UniqueConstraint("dni", name="uq_usuarios_dni"),
    )


def downgrade() -> None:
    op.drop_table("usuarios")
