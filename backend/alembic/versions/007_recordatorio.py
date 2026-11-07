"""007 recordatorio: recordatorios 48h/24h y token de un toque (C-07).

- recordatorio: FK RESTRICT a turnos, enums con CHECK (canal/etapa/estado),
  `token_hash` UNIQUE (solo se persiste el sha256), dedupe
  `(turno_id, etapa, inicio_turno)` para que el job sea idempotente y pueda
  re-notificar tras una reprogramacion, e indice por `turno_id`.
- ix_turnos_inicio_activo: indice parcial sobre `turnos(inicio)` que cubre la
  consulta de ventana del job. Tambien esta declarado en
  backend/app/turnos/models.py (postgresql_where) para que `alembic check`
  no reporte drift, igual que los parciales de la migracion 002.

Revision ID: 007_recordatorio
Revises: 006_catalogo_activo
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "007_recordatorio"
down_revision: str | Sequence[str] | None = "006_catalogo_activo"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recordatorio",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("turno_id", sa.Uuid(), nullable=False),
        sa.Column("canal", sa.Text(), nullable=False),
        sa.Column("etapa", sa.Text(), nullable=False),
        sa.Column(
            "estado",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'pendiente'"),
        ),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column(
            "expira_en", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column(
            "inicio_turno", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column("proveedor_ref", sa.Text(), nullable=True),
        sa.Column(
            "simulado",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("mensaje", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("enviado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "respondido_en", sa.DateTime(timezone=True), nullable=True
        ),
        sa.ForeignKeyConstraint(
            ["turno_id"],
            ["turnos.id"],
            name="fk_recordatorio_turno_id_turnos",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_recordatorio"),
        sa.UniqueConstraint(
            "token_hash", name="uq_recordatorio_token_hash"
        ),
        sa.UniqueConstraint(
            "turno_id",
            "etapa",
            "inicio_turno",
            name="uq_recordatorio_dedupe",
        ),
        sa.CheckConstraint(
            "canal IN ('whatsapp','email','log')",
            name="canal_recordatorio_valido",
        ),
        sa.CheckConstraint(
            "etapa IN ('48h','24h')",
            name="etapa_recordatorio_valida",
        ),
        sa.CheckConstraint(
            "estado IN ('pendiente','enviado','confirmado','cancelado',"
            "'fallido')",
            name="estado_recordatorio_valido",
        ),
    )
    op.create_index(
        "ix_recordatorio_turno_id", "recordatorio", ["turno_id"]
    )

    op.create_index(
        "ix_turnos_inicio_activo",
        "turnos",
        ["inicio"],
        postgresql_where=sa.text("estado IN ('pendiente','confirmado')"),
    )


def downgrade() -> None:
    op.drop_index("ix_turnos_inicio_activo", table_name="turnos")
    op.drop_index("ix_recordatorio_turno_id", table_name="recordatorio")
    op.drop_table("recordatorio")
