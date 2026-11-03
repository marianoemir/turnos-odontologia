"""004 hc_odontograma: historia clinica, odontograma y planes (C-09).

- historia_clinica: una fila por paciente (paciente_id UNIQUE).
- entrada_hc: entradas append-only con profesional + fecha.
- odontograma: historial por pieza FDI (estado texto libre, sin CHECK).
- plan_tratamiento + plan_item: presupuesto calculado, sin columna total;
  cobertura de OS informada (snapshot, nullable).

Revision ID: 004_hc_odontograma
Revises: 003_lista_espera
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "004_hc_odontograma"
down_revision: str | Sequence[str] | None = "003_lista_espera"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "historia_clinica",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("paciente_id", sa.Uuid(), nullable=False),
        sa.Column("antecedentes", sa.Text(), nullable=True),
        sa.Column("alergias", sa.Text(), nullable=True),
        sa.Column("observaciones", sa.Text(), nullable=True),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["paciente_id"],
            ["pacientes.id"],
            name="fk_historia_clinica_paciente_id_pacientes",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_historia_clinica"),
        sa.UniqueConstraint(
            "paciente_id", name="uq_historia_clinica_paciente_id"
        ),
    )

    op.create_table(
        "entrada_hc",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("historia_clinica_id", sa.Uuid(), nullable=False),
        sa.Column("profesional_id", sa.Uuid(), nullable=False),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["historia_clinica_id"],
            ["historia_clinica.id"],
            name="fk_entrada_hc_historia_clinica_id_historia_clinica",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["profesional_id"],
            ["profesionales.id"],
            name="fk_entrada_hc_profesional_id_profesionales",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_entrada_hc"),
    )
    op.create_index(
        "ix_entrada_hc_historia_fecha",
        "entrada_hc",
        ["historia_clinica_id", "fecha"],
    )

    op.create_table(
        "odontograma",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("paciente_id", sa.Uuid(), nullable=False),
        sa.Column("pieza", sa.Text(), nullable=False),
        sa.Column("estado", sa.Text(), nullable=False),
        sa.Column("profesional_id", sa.Uuid(), nullable=False),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "pieza ~ '^[1-4][1-8]$'",
            name="pieza_fdi_valida",
        ),
        sa.ForeignKeyConstraint(
            ["paciente_id"],
            ["pacientes.id"],
            name="fk_odontograma_paciente_id_pacientes",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["profesional_id"],
            ["profesionales.id"],
            name="fk_odontograma_profesional_id_profesionales",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_odontograma"),
    )
    op.create_index(
        "ix_odontograma_paciente_pieza_fecha",
        "odontograma",
        ["paciente_id", "pieza", "fecha"],
    )

    op.create_table(
        "plan_tratamiento",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("paciente_id", sa.Uuid(), nullable=False),
        sa.Column("profesional_id", sa.Uuid(), nullable=False),
        sa.Column(
            "estado",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'borrador'"),
        ),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "estado IN ('borrador','propuesto','aceptado','rechazado','cerrado')",
            name="estado_plan_valido",
        ),
        sa.ForeignKeyConstraint(
            ["paciente_id"],
            ["pacientes.id"],
            name="fk_plan_tratamiento_paciente_id_pacientes",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["profesional_id"],
            ["profesionales.id"],
            name="fk_plan_tratamiento_profesional_id_profesionales",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_plan_tratamiento"),
    )
    op.create_index(
        "ix_plan_tratamiento_paciente",
        "plan_tratamiento",
        ["paciente_id"],
    )

    op.create_table(
        "plan_item",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("pieza", sa.Text(), nullable=False),
        sa.Column("prestacion_id", sa.Uuid(), nullable=False),
        sa.Column(
            "estado",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'pendiente'"),
        ),
        sa.Column("monto_centavos", sa.Integer(), nullable=False),
        sa.Column("monto_cobertura_centavos", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "pieza ~ '^[1-4][1-8]$'",
            name="pieza_fdi_valida",
        ),
        sa.CheckConstraint(
            "estado IN ('pendiente','realizado','cancelado')",
            name="estado_item_valido",
        ),
        sa.CheckConstraint(
            "monto_centavos >= 0", name="monto_no_negativo"
        ),
        sa.CheckConstraint(
            "monto_cobertura_centavos IS NULL OR monto_cobertura_centavos >= 0",
            name="cobertura_no_negativa",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["plan_tratamiento.id"],
            name="fk_plan_item_plan_id_plan_tratamiento",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["prestacion_id"],
            ["prestaciones.id"],
            name="fk_plan_item_prestacion_id_prestaciones",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_plan_item"),
    )
    op.create_index("ix_plan_item_plan", "plan_item", ["plan_id"])


def downgrade() -> None:
    op.drop_index("ix_plan_item_plan", table_name="plan_item")
    op.drop_table("plan_item")
    op.drop_index("ix_plan_tratamiento_paciente", table_name="plan_tratamiento")
    op.drop_table("plan_tratamiento")
    op.drop_index(
        "ix_odontograma_paciente_pieza_fecha", table_name="odontograma"
    )
    op.drop_table("odontograma")
    op.drop_index("ix_entrada_hc_historia_fecha", table_name="entrada_hc")
    op.drop_table("entrada_hc")
    op.drop_table("historia_clinica")