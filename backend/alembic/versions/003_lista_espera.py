"""003 lista_espera: tabla lista_espera (C-06).

- Tabla lista_espera: paciente_id/profesional_id(prestacion)/prestacion_id
  FKs RESTRICT; profesional_id nullable; turno_id nullable FK SET NULL.
- CHECK estado IN (pendiente,ofrecido,asignado,baja).
- creado_en timestamptz NOT NULL default now().
- Indexes: (profesional_id, creado_en) para FIFO y (paciente_id).

Revision ID: 003_lista_espera
Revises: 002_turno
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "003_lista_espera"
down_revision: str | Sequence[str] | None = "002_turno"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lista_espera",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("paciente_id", sa.Uuid(), nullable=False),
        sa.Column("profesional_id", sa.Uuid(), nullable=True),
        sa.Column("prestacion_id", sa.Uuid(), nullable=False),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "estado",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'pendiente'"),
        ),
        sa.Column("turno_id", sa.Uuid(), nullable=True),
        sa.CheckConstraint(
            "estado IN ('pendiente','ofrecido','asignado','baja')",
            name="estado_lista_valido",
        ),
        sa.ForeignKeyConstraint(
            ["paciente_id"],
            ["pacientes.id"],
            name="fk_lista_espera_paciente_id_pacientes",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["profesional_id"],
            ["profesionales.id"],
            name="fk_lista_espera_profesional_id_profesionales",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["prestacion_id"],
            ["prestaciones.id"],
            name="fk_lista_espera_prestacion_id_prestaciones",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["turno_id"],
            ["turnos.id"],
            name="fk_lista_espera_turno_id_turnos",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_lista_espera"),
    )
    op.create_index(
        "ix_lista_espera_profesional_creado",
        "lista_espera",
        ["profesional_id", "creado_en"],
    )
    op.create_index(
        "ix_lista_espera_paciente", "lista_espera", ["paciente_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_lista_espera_paciente", table_name="lista_espera")
    op.drop_index(
        "ix_lista_espera_profesional_creado", table_name="lista_espera"
    )
    op.drop_table("lista_espera")