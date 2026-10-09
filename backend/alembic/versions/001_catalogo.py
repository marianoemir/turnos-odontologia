"""001 catalogo: pacientes, profesionales, sillones, prestaciones,
horarios y bloqueos. Sin Turno ni sus indices parciales (002 / C-03).

Revision ID: 001_catalogo
Revises: None
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "001_catalogo"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pacientes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nombre", sa.String(200), nullable=False),
        sa.Column("dni", sa.String(32), nullable=False),
        sa.Column("contacto", sa.Text(), nullable=True),
        sa.Column(
            "ficticio",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_pacientes"),
        sa.UniqueConstraint("dni", name="uq_pacientes_dni"),
    )
    op.create_table(
        "profesionales",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nombre", sa.String(200), nullable=False),
        sa.Column("matricula", sa.String(32), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_profesionales"),
        sa.UniqueConstraint("matricula", name="uq_profesionales_matricula"),
    )
    op.create_table(
        "sillones",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nombre", sa.String(100), nullable=False),
        sa.Column(
            "activo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sillones"),
        sa.UniqueConstraint("nombre", name="uq_sillones_nombre"),
    )
    op.create_index("ix_sillones_activo", "sillones", ["activo"])
    op.create_table(
        "prestaciones",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nombre", sa.String(100), nullable=False),
        sa.Column("duracion_min", sa.Integer(), nullable=False),
        sa.CheckConstraint("duracion_min > 0", name="duracion_positiva"),
        sa.PrimaryKeyConstraint("id", name="pk_prestaciones"),
        sa.UniqueConstraint("nombre", name="uq_prestaciones_nombre"),
    )
    op.create_table(
        "horarios",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("profesional_id", sa.Uuid(), nullable=False),
        sa.Column("dia_semana", sa.SmallInteger(), nullable=False),
        sa.Column("desde", sa.Time(), nullable=False),
        sa.Column("hasta", sa.Time(), nullable=False),
        sa.CheckConstraint("dia_semana BETWEEN 0 AND 6", name="dia_valido"),
        sa.CheckConstraint("desde < hasta", name="rango_valido"),
        sa.ForeignKeyConstraint(
            ["profesional_id"],
            ["profesionales.id"],
            name="fk_horarios_profesional_id_profesionales",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_horarios"),
    )
    op.create_table(
        "bloqueos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("profesional_id", sa.Uuid(), nullable=True),
        sa.Column("sillon_id", sa.Uuid(), nullable=True),
        sa.Column("desde", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hasta", sa.DateTime(timezone=True), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=False),
        sa.CheckConstraint("desde < hasta", name="rango_valido"),
        sa.ForeignKeyConstraint(
            ["profesional_id"],
            ["profesionales.id"],
            name="fk_bloqueos_profesional_id_profesionales",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["sillon_id"],
            ["sillones.id"],
            name="fk_bloqueos_sillon_id_sillones",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_bloqueos"),
    )


def downgrade() -> None:
    op.drop_table("bloqueos")
    op.drop_table("horarios")
    op.drop_table("prestaciones")
    op.drop_index("ix_sillones_activo", table_name="sillones")
    op.drop_table("sillones")
    op.drop_table("profesionales")
    op.drop_table("pacientes")
