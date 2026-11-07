"""Tests de migración 007_roles_sucursales (C-11) - Fase RED.

Estos tests deben fallar (RED) hasta que la migración 007 y los modelos
estén correctamente implementados. El punto clave es verificar que:
  (A) Las tablas y columnas existen sobre db_session (que TRUNCATEa).
  (B) El seed de roles está disponible sobre _db_engine, independientemente
      del TRUNCATE, reaplicando la migración si es necesario.
"""

from __future__ import annotations

from sqlalchemy import inspect

# ---------- (A) Schema y constraints usando db_session ----------
# db_session TRUNCATEa _CATALOGO_TABLES al comenzar cada test.
# Por eso los roles NO persisten entre tests; la migración 007 debe
# haber sido aplicada previamente para que las tables existan.


def test_A_tables_existen_despues_de_migracion(db_session):
    """Después de alembic upgrade head, estas 3 tables deben existir."""
    bind = db_session.bind
    insp = inspect(bind)
    for nombre in ("roles", "sucursales", "usuarios_sucursal"):
        assert nombre in insp.get_table_names(), f"Tabla {nombre} no existe"


def test_B_columnas_profesionales_y_sillon(db_session):
    """profesionales y sillones deben tener sucursal_id nullable."""
    bind = db_session.bind
    insp = inspect(bind)
    for tabla in ("profesionales", "sillones"):
        cols = {c["name"]: c for c in insp.get_columns(tabla)}
        assert "sucursal_id" in cols, f"Falta sucursal_id en {tabla}"
        assert cols["sucursal_id"]["nullable"] is True, f"sucursal_id no nullable en {tabla}"


# ---------- (B) Seed sobre _db_engine, independiente del TRUNCATE ----------
# Para verificar roles canónicos sin depender del orden de tests,
# usamos una sesión propia sobre _db_engine. La dependencia del orden
# de ejecución se resuelve en el Paso 4.3 (decisión del usuario).


def test_C_roles_canonicos_desde_engine(_db_engine):
    """Los 4 roles canónicos deben estar presentes después de la migración 007."""
    from sqlalchemy.orm import Session

    from backend.app.rbac.models import Rol

    session = Session(bind=_db_engine)
    try:
        roles = session.query(Rol).all()
        nombres = {r.nombre for r in roles}
        assert nombres == {"admin", "recepcion", "odontologo", "paciente"}, (
            f"Expected 4 canonical roles, got {nombres}"
        )
    finally:
        session.close()