"""Tests de los endpoints administrativos de sucursales (C-11, grupo 5).

Mismo patrón de `test_roles_api.py`: `dependency_overrides[get_db]`
con `db_session`.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.turnos.router import get_db

ADMIN = {"X-Actor-Rol": "admin"}


@pytest.fixture()
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(get_db, None)


def _crear_sucursal(client, nombre: str, direccion: str | None = None):
    r = client.post(
        "/sucursales", json={"nombre": nombre, "direccion": direccion}, headers=ADMIN
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_alta_201_y_listado_ordenado_por_nombre(client) -> None:
    # Inverse alphabetical creation order: only an ORDER BY makes this pass.
    _crear_sucursal(client, "Zona Sur")
    _crear_sucursal(client, "Centro")
    _crear_sucursal(client, "Belgrano")
    r = client.get("/sucursales", headers=ADMIN)
    assert r.status_code == 200, r.text
    nombres = [x["nombre"] for x in r.json()]
    assert nombres == ["Belgrano", "Centro", "Zona Sur"]


def test_post_duplicado_da_409(client) -> None:
    _crear_sucursal(client, "Centro")
    r = client.post("/sucursales", json={"nombre": "Centro"}, headers=ADMIN)
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["causa"] == "duplicate_nombre_sucursal"


def test_patch_duplicado_da_409(client) -> None:
    a = _crear_sucursal(client, "Alfa")
    _crear_sucursal(client, "Beta")
    r = client.patch(
        f"/sucursales/{a['id']}", json={"nombre": "Beta"}, headers=ADMIN
    )
    assert r.status_code == 409, r.text
    assert r.json()["detail"]["causa"] == "duplicate_nombre_sucursal"


def test_patch_baja_logica_y_filtro_inactivos(client) -> None:
    suc = _crear_sucursal(client, "Centro")
    r = client.patch(
        f"/sucursales/{suc['id']}", json={"activo": False}, headers=ADMIN
    )
    assert r.status_code == 200, r.text
    assert r.json()["activo"] is False
    r = client.get("/sucursales", headers=ADMIN)
    assert "Centro" not in [x["nombre"] for x in r.json()]
    r = client.get("/sucursales?incluir_inactivos=true", headers=ADMIN)
    assert "Centro" in [x["nombre"] for x in r.json()]


def test_patch_parcial_conserva_campos_no_enviados(client) -> None:
    suc = _crear_sucursal(client, "Centro", direccion="Calle Falsa 123")
    r = client.patch(
        f"/sucursales/{suc['id']}",
        json={"direccion": "Avenida Siempreviva 456"},
        headers=ADMIN,
    )
    assert r.status_code == 200, r.text
    assert r.json()["nombre"] == "Centro"
    assert r.json()["direccion"] == "Avenida Siempreviva 456"


def test_patch_inexistente_da_404(client) -> None:
    r = client.patch(
        f"/sucursales/{uuid.uuid4()}", json={"activo": False}, headers=ADMIN
    )
    assert r.status_code == 404, r.text


def test_post_invalido_y_extra_dan_422(client) -> None:
    r = client.post("/sucursales", json={}, headers=ADMIN)
    assert r.status_code == 422, r.text
    r = client.post(
        "/sucursales", json={"nombre": "Centro", "extra": "x"}, headers=ADMIN
    )
    assert r.status_code == 422, r.text


def test_patch_invalido_y_extra_dan_422(client) -> None:
    suc = _crear_sucursal(client, "Centro")
    r = client.patch(f"/sucursales/{suc['id']}", json={}, headers=ADMIN)
    assert r.status_code == 200, r.text  # empty patch is a no-op
    r = client.patch(
        f"/sucursales/{suc['id']}", json={"extra": "x"}, headers=ADMIN
    )
    assert r.status_code == 422, r.text
    r = client.patch(
        f"/sucursales/{suc['id']}", json={"nombre": ""}, headers=ADMIN
    )
    assert r.status_code == 422, r.text


@pytest.mark.parametrize("rol", ["recepcion", "odontologo", "paciente"])
def test_get_roles_no_admin_dan_403(client, rol: str) -> None:
    r = client.get("/sucursales", headers={"X-Actor-Rol": rol})
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["causa"] == "permiso_denegado"


@pytest.mark.parametrize("rol", ["recepcion", "odontologo", "paciente"])
def test_post_roles_no_admin_dan_403(client, rol: str) -> None:
    r = client.post(
        "/sucursales", json={"nombre": "X"}, headers={"X-Actor-Rol": rol}
    )
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["causa"] == "permiso_denegado"


@pytest.mark.parametrize("rol", ["recepcion", "odontologo", "paciente"])
def test_patch_roles_no_admin_dan_403(client, rol: str) -> None:
    suc = _crear_sucursal(client, "Centro")
    r = client.patch(
        f"/sucursales/{suc['id']}",
        json={"activo": False},
        headers={"X-Actor-Rol": rol},
    )
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["causa"] == "permiso_denegado"


@pytest.mark.parametrize("metodo", ["GET", "POST", "PATCH"])
def test_sin_header_da_403_en_los_tres(client, metodo: str) -> None:
    if metodo == "GET":
        r = client.get("/sucursales")
    elif metodo == "POST":
        r = client.post("/sucursales", json={"nombre": "X"})
    else:
        suc = _crear_sucursal(client, "Centro")
        r = client.patch(f"/sucursales/{suc['id']}", json={"activo": False})
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["causa"] == "permiso_denegado"
