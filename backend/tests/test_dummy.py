"""Prueba de cableado: la suite pytest descubre y ejecuta backend/tests."""


def test_backend_package_importable():
    import backend

    assert backend.__name__ == "backend"

