"""002 turno: tabla turnos + red anti-solape (C-03, D2/D3).

- CREATE EXTENSION IF NOT EXISTS btree_gist (clases GiST para
  uuid; la imagen postgres:16 ya trae el modulo contribuido).
- Tabla turnos: 4 FKs RESTRICT, inicio/fin timestamptz NOT NULL,
  CHECK fin>inicio, estado TEXT DEFAULT pendiente + CHECK IN (5),
  creado_por TEXT NULL.
- Dos EXCLUDE USING gist con tstzrange(inicio,fin,'[)') (borde
  semiabierto: adyacencia inicio==fin permitida, RN-AG-04) + WHERE
  estado activo (cancelado/ausente liberan, RN-06).
- Indices btree de apoyo: parciales por profesional/sillon en
  activos + (paciente_id,inicio) observabilidad (S1: sin veto por
  paciente).

Downgrade: cae tabla + constraints + indices; la extension se
conserva (puede usarla otro objeto; re-ejecutar upgrade la
reutiliza con IF NOT EXISTS).

Revision ID: 002_turno
Revises: 001_catalogo
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "002_turno"
down_revision: str | Sequence[str] | None = "001_catalogo"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ESTADOS_ACTIVOS = "estado IN ('pendiente','confirmado')"


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.create_table(
        "turnos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("paciente_id", sa.Uuid(), nullable=False),
        sa.Column("profesional_id", sa.Uuid(), nullable=False),
        sa.Column("sillon_id", sa.Uuid(), nullable=False),
        sa.Column("prestacion_id", sa.Uuid(), nullable=False),
        sa.Column("inicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fin", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "estado",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'pendiente'"),
        ),
        sa.Column("creado_por", sa.Text(), nullable=True),
        sa.CheckConstraint("fin > inicio", name="fin_posterior_a_inicio"),
        sa.CheckConstraint(
            "estado IN "
            "('pendiente','confirmado','atendido','ausente','cancelado')",
            name="estado_valido",
        ),
        sa.ForeignKeyConstraint(
            ["paciente_id"],
            ["pacientes.id"],
            name="fk_turnos_paciente_id_pacientes",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["profesional_id"],
            ["profesionales.id"],
            name="fk_turnos_profesional_id_profesionales",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["sillon_id"],
            ["sillones.id"],
            name="fk_turnos_sillon_id_sillones",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["prestacion_id"],
            ["prestaciones.id"],
            name="fk_turnos_prestacion_id_prestaciones",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_turnos"),
    )
    op.execute(
        "ALTER TABLE turnos ADD CONSTRAINT ex_turnos_profesional_sin_solape "
        "EXCLUDE USING gist (profesional_id WITH =, "
        "tstzrange(inicio, fin, '[)') WITH &&) "
        f"WHERE ({_ESTADOS_ACTIVOS})"
    )
    op.execute(
        "ALTER TABLE turnos ADD CONSTRAINT ex_turnos_sillon_sin_solape "
        "EXCLUDE USING gist (sillon_id WITH =, "
        "tstzrange(inicio, fin, '[)') WITH &&) "
        f"WHERE ({_ESTADOS_ACTIVOS})"
    )
    op.execute(
        "CREATE INDEX ix_turnos_profesional_activo ON turnos "
        f"(profesional_id, inicio, fin) WHERE ({_ESTADOS_ACTIVOS})"
    )
    op.execute(
        "CREATE INDEX ix_turnos_sillon_activo ON turnos "
        f"(sillon_id, inicio, fin) WHERE ({_ESTADOS_ACTIVOS})"
    )
    # Nota: los parciales existen tambien en backend/app/turnos/models.py
    # (postgresql_where) para que `alembic check` no reporte drift.
    op.create_index(
        "ix_turnos_paciente_inicio", "turnos", ["paciente_id", "inicio"]
    )


def downgrade() -> None:
    op.drop_index("ix_turnos_paciente_inicio", table_name="turnos")
    op.execute("DROP INDEX IF EXISTS ix_turnos_sillon_activo")
    op.execute("DROP INDEX IF EXISTS ix_turnos_profesional_activo")
    op.drop_table("turnos")
    # La extension btree_gist se conserva a proposito.
