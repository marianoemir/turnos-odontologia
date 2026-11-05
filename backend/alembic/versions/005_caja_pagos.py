"""005 caja_pagos: caja diaria, cobros y liquidaciones de OS (C-10).

- caja: una por dia (fecha UNIQUE, sin indice extra), apertura y cierre
  con arqueo (esperado vs contado).
- cobro: FK a caja y turno (RESTRICT), medio/concepto/estado con CHECK,
  columnas ARCA nullable y flag `simulado`.
- liquidacion_os: una por cobro (UNIQUE), cobertura/copago coherentes.
Dinero en centavos (BigInteger) con piso y tope 10^12 (D20). La migracion
no hace GRANT ni toca roles.

Revision ID: 005_caja_pagos
Revises: 004_hc_odontograma
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "005_caja_pagos"
down_revision: str | Sequence[str] | None = "004_hc_odontograma"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "caja",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("monto_apertura_centavos", sa.BigInteger(), nullable=False),
        sa.Column(
            "abierto_en",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("cerrado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "monto_cierre_contado_centavos", sa.BigInteger(), nullable=True
        ),
        sa.Column("monto_esperado_centavos", sa.BigInteger(), nullable=True),
        sa.Column("diferencia_centavos", sa.BigInteger(), nullable=True),
        sa.Column(
            "estado",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'abierta'"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_caja"),
        sa.UniqueConstraint("fecha", name="uq_caja_fecha"),
        sa.CheckConstraint(
            "monto_apertura_centavos BETWEEN 0 AND 1000000000000",
            name="monto_apertura_rango",
        ),
        sa.CheckConstraint(
            "monto_cierre_contado_centavos BETWEEN 0 AND 1000000000000",
            name="monto_contado_rango",
        ),
        sa.CheckConstraint(
            "monto_esperado_centavos >= 0", name="monto_esperado_no_negativo"
        ),
        sa.CheckConstraint(
            "estado IN ('abierta','cerrada')", name="estado_caja_valido"
        ),
    )

    op.create_table(
        "cobro",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("caja_id", sa.Uuid(), nullable=False),
        sa.Column("turno_id", sa.Uuid(), nullable=True),
        sa.Column("medio", sa.Text(), nullable=False),
        sa.Column(
            "concepto",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'total'"),
        ),
        sa.Column("monto_centavos", sa.BigInteger(), nullable=False),
        sa.Column(
            "estado",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'registrado'"),
        ),
        sa.Column("motivo_anulacion", sa.Text(), nullable=True),
        sa.Column("anulado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("referencia_externa", sa.Text(), nullable=True),
        sa.Column("factura_tipo", sa.Text(), nullable=True),
        sa.Column("factura_cae", sa.Text(), nullable=True),
        sa.Column("factura_qr", sa.Text(), nullable=True),
        sa.Column("facturado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "simulado",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["caja_id"],
            ["caja.id"],
            name="fk_cobro_caja_id_caja",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["turno_id"],
            ["turnos.id"],
            name="fk_cobro_turno_id_turnos",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_cobro"),
        sa.CheckConstraint(
            "medio IN ('efectivo','tarjeta','transferencia',"
            "'mercado_pago','obra_social')",
            name="medio_cobro_valido",
        ),
        sa.CheckConstraint(
            "concepto IN ('sena','saldo','total')",
            name="concepto_cobro_valido",
        ),
        sa.CheckConstraint(
            "monto_centavos BETWEEN 1 AND 1000000000000",
            name="monto_cobro_rango",
        ),
        sa.CheckConstraint(
            "estado IN ('registrado','anulado')", name="estado_cobro_valido"
        ),
    )
    op.create_index("ix_cobro_caja", "cobro", ["caja_id"])
    op.create_index("ix_cobro_turno", "cobro", ["turno_id"])

    op.create_table(
        "liquidacion_os",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("cobro_id", sa.Uuid(), nullable=False),
        sa.Column("nomenclador_codigo", sa.Text(), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("monto_total_centavos", sa.BigInteger(), nullable=False),
        sa.Column(
            "cobertura_centavos",
            sa.BigInteger(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "copago_centavos",
            sa.BigInteger(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "estado",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'pendiente'"),
        ),
        sa.Column("pdf_referencia", sa.Text(), nullable=True),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["cobro_id"],
            ["cobro.id"],
            name="fk_liquidacion_os_cobro_id_cobro",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_liquidacion_os"),
        sa.UniqueConstraint("cobro_id", name="uq_liquidacion_os_cobro_id"),
        sa.CheckConstraint(
            "monto_total_centavos BETWEEN 0 AND 1000000000000",
            name="monto_total_liquidacion_rango",
        ),
        sa.CheckConstraint(
            "cobertura_centavos BETWEEN 0 AND 1000000000000",
            name="cobertura_liquidacion_rango",
        ),
        sa.CheckConstraint(
            "cobertura_centavos <= monto_total_centavos",
            name="cobertura_no_excede_total",
        ),
        sa.CheckConstraint(
            "copago_centavos BETWEEN 0 AND 1000000000000",
            name="copago_liquidacion_rango",
        ),
        sa.CheckConstraint(
            "copago_centavos = monto_total_centavos - cobertura_centavos",
            name="copago_consistente",
        ),
        sa.CheckConstraint(
            "estado IN ('pendiente','liquidada','pagada','anulada')",
            name="estado_liquidacion_valido",
        ),
    )
    op.create_index(
        "ix_liquidacion_os_creado", "liquidacion_os", ["creado_en"]
    )


def downgrade() -> None:
    op.drop_index("ix_liquidacion_os_creado", table_name="liquidacion_os")
    op.drop_table("liquidacion_os")
    op.drop_index("ix_cobro_turno", table_name="cobro")
    op.drop_index("ix_cobro_caja", table_name="cobro")
    op.drop_table("cobro")
    op.drop_table("caja")
