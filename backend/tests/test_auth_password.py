"""Tests de hash y verificación de contraseñas con PBKDF2 (C-24, Grupo 2)."""


def test_hash_no_es_contrasena_y_sal_es_propia():
    """Scenario: El hash no es la contraseña y la sal es propia."""
    from backend.app.auth.password import hashear_password, verificar_password

    pass1 = "mi-password-secreto-123"
    hash1 = hashear_password(pass1)
    hash2 = hashear_password(pass1)

    assert pass1 not in hash1
    assert pass1 not in hash2
    assert hash1 != hash2
    assert hash1.startswith("pbkdf2_sha256$")

    assert verificar_password(pass1, hash1) is True
    assert verificar_password(pass1, hash2) is True
    assert verificar_password("password-erroneo", hash1) is False
