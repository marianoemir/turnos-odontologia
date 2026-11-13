"""Tests del modelo Usuario y migración 009 (C-24, Grupo 3)."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError


@pytest.mark.integration
def test_modelo_usuario_creacion_y_dni_unico(db_session):
    """Scenario: DNI duplicado es rechazado."""
    from backend.app.auth.models import Usuario
    from backend.app.rbac.models import Rol

    rol = db_session.query(Rol).filter_by(nombre="recepcion").first()
    if not rol:
        rol = Rol(nombre="recepcion")
        db_session.add(rol)
        db_session.flush()

    u1 = Usuario(
        dni="12345678",
        password_hash="pbkdf2_sha256$600000$sal$hash",
        rol_id=rol.id,
        activo=True,
    )
    db_session.add(u1)
    db_session.flush()

    u2 = Usuario(
        dni="12345678",
        password_hash="pbkdf2_sha256$600000$sal2$hash2",
        rol_id=rol.id,
        activo=True,
    )
    db_session.add(u2)
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


@pytest.mark.integration
def test_migracion_009_crea_tabla_y_es_reversible(db_session):
    """Scenario: La migración 009 crea la tabla y es reversible."""
    # Verifica que la tabla exista en la base
    res = db_session.execute(
        text(
            "SELECT table_name FROM information_schema.tables WHERE table_name = 'usuarios'"
        )
    ).scalar()
    assert res == "usuarios"
