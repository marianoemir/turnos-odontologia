"""007 roles_sucursales: roles, sucursales y asignacion usuario-sucursal (C-11).

- roles: catalogo de roles con los 4 canonicos sembrados (idempotente).
- sucursales: catalogo de sucursales.
- usuarios_sucursal: asignacion usuario (texto libre) + rol + sucursal.
- profesionales.sucursal_id y sillones.sucursal_id: nullable, FK RESTRICT.
La migracion es aditiva: no toca caja, cobro ni liquidacion_os (D5) y no
hace GRANT ni toca roles de base de datos.

Revision ID: 007_roles_sucursales
Revises: 006_catalogo_activo
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "007_roles_sucursales"
down_revision: str | Sequence[str] | None = "006_catalogo_activo"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column(
            "activo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_roles"),
        sa.UniqueConstraint("nombre", name="uq_roles_nombre"),
    )

    op.create_table(
        "sucursales",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nombre", sa.Text(), nullable=False),
        sa.Column("direccion", sa.Text(), nullable=True),
        sa.Column(
            "activo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sucursales"),
        sa.UniqueConstraint("nombre", name="uq_sucursales_nombre"),
    )

    op.create_table(
        "usuarios_sucursal",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("usuario", sa.Text(), nullable=False),
        sa.Column("rol_id", sa.Uuid(), nullable=False),
        sa.Column("sucursal_id", sa.Uuid(), nullable=False),
        sa.Column(
            "activo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
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
            name="fk_usuarios_sucursal_rol_id_roles",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["sucursal_id"],
            ["sucursales.id"],
            name="fk_usuarios_sucursal_sucursal_id_sucursales",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_usuarios_sucursal"),
        sa.UniqueConstraint(
            "usuario",
            "sucursal_id",
            name="uq_usuarios_sucursal_usuario_sucursal",
        ),
    )
    op.create_index(
        "ix_usuarios_sucursal_usuario", "usuarios_sucursal", ["usuario"]
    )

    op.add_column(
        "profesionales",
        sa.Column("sucursal_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_profesionales_sucursal_id_sucursales",
        "profesionales",
        "sucursales",
        ["sucursal_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_profesionales_sucursal", "profesionales", ["sucursal_id"]
    )

    op.add_column(
        "sillones",
        sa.Column("sucursal_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_sillones_sucursal_id_sucursales",
        "sillones",
        "sucursales",
        ["sucursal_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_sillones_sucursal", "sillones", ["sucursal_id"])

    # Seed idempotente de los 4 roles canonicos (UUID fijos).
    op.execute(
        """
        INSERT INTO roles (id, nombre, descripcion, activo)
        VALUES
            ('00000000-0000-0000-0000-000000000001', 'admin', NULL, true),
            ('00000000-0000-0000-0000-000000000002', 'recepcion', NULL, true),
            ('00000000-0000-0000-0000-000000000003', 'odontologo', NULL, true),
            ('00000000-0000-0000-0000-000000000004', 'paciente', NULL, true)
        ON CONFLICT (nombre) DO NOTHING
        """
    )


def downgrade() -> None:
    # Primero lo que referencia a sucursales (FK, indice y columna), despues
    # las tablas en orden inverso de dependencia. El seed de roles se va con
    # el drop de la tabla.
    op.drop_index("ix_sillones_sucursal", table_name="sillones")
    op.drop_constraint(
        "fk_sillones_sucursal_id_sucursales", "sillones", type_="foreignkey"
    )
    op.drop_column("sillones", "sucursal_id")

    op.drop_index("ix_profesionales_sucursal", table_name="profesionales")
    op.drop_constraint(
        "fk_profesionales_sucursal_id_sucursales",
        "profesionales",
        type_="foreignkey",
    )
    op.drop_column("profesionales", "sucursal_id")

    op.drop_index(
        "ix_usuarios_sucursal_usuario", table_name="usuarios_sucursal"
    )
    op.drop_table("usuarios_sucursal")
    op.drop_table("sucursales")
    op.drop_table("roles")
