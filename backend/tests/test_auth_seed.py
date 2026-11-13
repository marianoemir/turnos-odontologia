"""Tests de seed de usuario ficticio (C-24, Grupo 6)."""

import pytest

from backend.app.auth.models import Usuario
from backend.app.auth.password import verificar_password
from backend.app.rbac.models import Rol
from backend.app.seed.usuario import seed_usuario

pytestmark = pytest.mark.integration


def test_seed_crea_un_unico_usuario_y_es_repetible(db_session, monkeypatch):
    """Scenario: Seed crea un único usuario y es repetible/idempotente."""
    rol_admin = db_session.query(Rol).filter_by(nombre="admin").first()
    if not rol_admin:
        rol_admin = Rol(nombre="admin")
        db_session.add(rol_admin)
        db_session.flush()

    monkeypatch.setenv("SEED_FICTICIO", "true")
    monkeypatch.setenv("SEED_USUARIO_PASSWORD", "clave-ficticia-admin-123")

    res1 = seed_usuario(db_session)
    assert res1["creado"] is True
    assert res1["dni"] == "USUARIO-FICT-001"

    u = db_session.query(Usuario).filter_by(dni="USUARIO-FICT-001").first()
    assert u is not None
    assert u.rol_id == rol_admin.id
    assert u.activo is True
    assert verificar_password("clave-ficticia-admin-123", u.password_hash) is True

    # Ejecutar de nuevo: repetible/idempotente
    res2 = seed_usuario(db_session)
    assert res2["creado"] is False
    assert db_session.query(Usuario).filter_by(dni="USUARIO-FICT-001").count() == 1


def test_seed_sin_password_definida_genera_una_al_azar(db_session, monkeypatch, capsys):
    """Scenario: Seed sin contraseña definida genera una al azar y la imprime."""
    rol_admin = db_session.query(Rol).filter_by(nombre="admin").first()
    if not rol_admin:
        rol_admin = Rol(nombre="admin")
        db_session.add(rol_admin)
        db_session.flush()

    monkeypatch.setenv("SEED_FICTICIO", "true")
    monkeypatch.delenv("SEED_USUARIO_PASSWORD", raising=False)

    res = seed_usuario(db_session)
    assert res["creado"] is True
    u = db_session.query(Usuario).filter_by(dni="USUARIO-FICT-001").first()
    assert u is not None

    captured = capsys.readouterr().out
    assert "USUARIO-FICT-001" in captured


def test_seed_inactivo_no_crea_usuarios(db_session, monkeypatch):
    """Scenario: Seed inactivo no crea usuarios."""
    monkeypatch.delenv("SEED_FICTICIO", raising=False)
    monkeypatch.setenv("SEED_FICTICIO", "false")

    res = seed_usuario(db_session)
    assert res["creado"] is False
    assert db_session.query(Usuario).filter_by(dni="USUARIO-FICT-001").first() is None
