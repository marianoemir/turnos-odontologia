import pytest


def test_arranque_sin_secret_key_falla(monkeypatch):
    """Scenario: Arranque sin SECRET_KEY falla."""
    monkeypatch.delenv("SECRET_KEY", raising=False)
    from backend.app.auth.config import AuthConfigError, get_auth_settings

    with pytest.raises(AuthConfigError, match="SECRET_KEY"):
        get_auth_settings()


def test_arranque_con_secret_key_vacia_falla(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "")
    from backend.app.auth.config import AuthConfigError, get_auth_settings

    with pytest.raises(AuthConfigError, match="SECRET_KEY"):
        get_auth_settings()


def test_arranque_con_valor_ejemplo_falla(monkeypatch):
    """Scenario: Arranque con valor de ejemplo falla."""
    monkeypatch.setenv("SECRET_KEY", "cambiar-en-produccion-solo-env")
    from backend.app.auth.config import AuthConfigError, get_auth_settings

    with pytest.raises(AuthConfigError, match="SECRET_KEY"):
        get_auth_settings()


def test_arranque_con_clave_corta_falla(monkeypatch):
    """Scenario: Clave de menos de 32 caracteres falla."""
    monkeypatch.setenv("SECRET_KEY", "clave-muy-corta-12345678901234")
    from backend.app.auth.config import AuthConfigError, get_auth_settings

    with pytest.raises(AuthConfigError, match="SECRET_KEY"):
        get_auth_settings()


def test_arranque_con_clave_valida_ok(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "esta-es-una-clave-secreta-ficticia-de-mas-de-32-caracteres")
    from backend.app.auth.config import get_auth_settings

    settings = get_auth_settings()
    assert settings.secret_key == "esta-es-una-clave-secreta-ficticia-de-mas-de-32-caracteres"
    assert settings.algorithm == "HS256"
    assert settings.access_token_expires_min == 60


def test_variable_de_algoritmo_no_cambia_el_algoritmo(monkeypatch):
    """Scenario: Una variable de algoritmo no cambia el algoritmo."""
    monkeypatch.setenv("SECRET_KEY", "esta-es-una-clave-secreta-ficticia-de-mas-de-32-caracteres")
    monkeypatch.setenv("JWT_ALGORITHM", "none")
    monkeypatch.setenv("ALGORITHM", "RS256")
    from backend.app.auth.config import get_auth_settings

    settings = get_auth_settings()
    assert settings.algorithm == "HS256"
