"""Contratos HTTP de C-11 expuestos en /openapi.json (grupo 12, tarea 12.4).

Verifica que los endpoints administrativos nuevos y el filtro
`sucursal_id` figuran en el esquema OpenAPI servido por la app.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_openapi_expone_contratos_c11() -> None:
    r = TestClient(app).get("/openapi.json")
    assert r.status_code == 200, r.text
    paths = r.json()["paths"]
    for ruta in ("/roles", "/sucursales", "/usuarios-sucursal", "/export"):
        assert ruta in paths, ruta
    assert sorted(paths["/roles"]) == ["get", "post"]
    assert "patch" in paths["/roles/{rol_id}"]
    assert sorted(paths["/sucursales"]) == ["get", "post"]
    assert "patch" in paths["/sucursales/{sucursal_id}"]
    assert sorted(paths["/usuarios-sucursal"]) == ["get", "post"]
    assert "patch" in paths["/usuarios-sucursal/{usuc_id}"]
    assert "get" in paths["/export"]


def test_openapi_filtro_sucursal_id_en_catalogo() -> None:
    r = TestClient(app).get("/openapi.json")
    paths = r.json()["paths"]
    for ruta in ("/profesionales", "/sillones"):
        params = paths[ruta]["get"]["parameters"]
        nombres = [p["name"] for p in params]
        assert "sucursal_id" in nombres, (ruta, nombres)
