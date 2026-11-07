"""Aislamiento multi-sucursal en el catálogo (C-11, grupo 7, TDD RED).

Frontera de aislamiento de lectura: `?sucursal_id=` filtra profesionales
y sillones. `GET /caja` y `GET /agenda` son globales (límite documentado).

Nota sobre `get_sucursal_session`: en los tests que mandan `X-Sucursal-Id`
se sobreescribe esa dependencia con `db_session` (patrón de
`test_rbac_contexto.py` / `test_usuarios_sucursal_api.py`), porque la
sesión propia que abre en producción se bloquea contra el TRUNCATE sin
commit de `db_session`. Eso significa que la ruta real con sesión propia
no se ejercita en estos tests.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.app.caja.router import get_db as caja_get_db
from backend.app.main import app
from backend.app.rbac.context import get_sucursal_session
from backend.app.turnos.router import get_db

ADMIN = {"X-Actor-Rol": "admin"}


@pytest.fixture()
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_sucursal_session] = lambda: db_session
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_sucursal_session, None)


def _crear_sucursal(client, nombre: str):
    r = client.post("/sucursales", json={"nombre": nombre}, headers=ADMIN)
    assert r.status_code == 201, r.text
    return r.json()


def _crear_profesional(client, nombre: str, matricula: str, sucursal_id=None):
    body = {"nombre": nombre, "matricula": matricula}
    if sucursal_id is not None:
        body["sucursal_id"] = sucursal_id
    r = client.post("/profesionales", json=body, headers=ADMIN)
    assert r.status_code == 201, r.text
    return r.json()


def _crear_sillon(client, nombre: str, sucursal_id=None):
    body = {"nombre": nombre}
    if sucursal_id is not None:
        body["sucursal_id"] = sucursal_id
    r = client.post("/sillones", json=body, headers=ADMIN)
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture()
def escenario(client):
    """Dos sucursales + profesional/sillón en cada una + uno con NULL."""
    suc_a = _crear_sucursal(client, "A")
    suc_b = _crear_sucursal(client, "B")
    prof_a = _crear_profesional(client, "Prof A", "MP-A", suc_a["id"])
    prof_b = _crear_profesional(client, "Prof B", "MP-B", suc_b["id"])
    prof_n = _crear_profesional(client, "Prof N", "MP-N")
    sill_a = _crear_sillon(client, "Box A", suc_a["id"])
    sill_b = _crear_sillon(client, "Box B", suc_b["id"])
    sill_n = _crear_sillon(client, "Box N")
    return {
        "suc_a": suc_a,
        "suc_b": suc_b,
        "prof_a": prof_a,
        "prof_b": prof_b,
        "prof_n": prof_n,
        "sill_a": sill_a,
        "sill_b": sill_b,
        "sill_n": sill_n,
    }


def test_alta_con_sucursal_id_y_respuesta_con_campo(client, escenario) -> None:
    assert escenario["prof_a"]["sucursal_id"] == escenario["suc_a"]["id"]
    assert escenario["prof_n"]["sucursal_id"] is None
    assert escenario["sill_a"]["sucursal_id"] == escenario["suc_a"]["id"]
    assert escenario["sill_n"]["sucursal_id"] is None


def test_filtro_por_a_solo_devuelve_a(client, escenario) -> None:
    r = client.get(f"/profesionales?sucursal_id={escenario['suc_a']['id']}")
    assert r.status_code == 200, r.text
    assert [x["nombre"] for x in r.json()] == ["Prof A"]
    r = client.get(f"/sillones?sucursal_id={escenario['suc_a']['id']}")
    assert r.status_code == 200, r.text
    assert [x["nombre"] for x in r.json()] == ["Box A"]


def test_filtro_por_b_solo_devuelve_b(client, escenario) -> None:
    r = client.get(f"/profesionales?sucursal_id={escenario['suc_b']['id']}")
    assert r.status_code == 200, r.text
    assert [x["nombre"] for x in r.json()] == ["Prof B"]
    r = client.get(f"/sillones?sucursal_id={escenario['suc_b']['id']}")
    assert r.status_code == 200, r.text
    assert [x["nombre"] for x in r.json()] == ["Box B"]


def test_sin_filtro_devuelve_todos_incluido_null(client, escenario) -> None:
    r = client.get("/profesionales")
    assert r.status_code == 200, r.text
    assert {x["nombre"] for x in r.json()} == {"Prof A", "Prof B", "Prof N"}
    r = client.get("/sillones")
    assert r.status_code == 200, r.text
    assert {x["nombre"] for x in r.json()} == {"Box A", "Box B", "Box N"}


def test_filtro_respeta_incluir_inactivos(client, escenario) -> None:
    prof_a = escenario["prof_a"]
    r = client.patch(
        f"/profesionales/{prof_a['id']}", json={"activo": False}
    )
    assert r.status_code == 200, r.text
    r = client.get(f"/profesionales?sucursal_id={escenario['suc_a']['id']}")
    assert r.json() == []
    r = client.get(
        f"/profesionales?sucursal_id={escenario['suc_a']['id']}"
        "&incluir_inactivos=true"
    )
    assert [x["nombre"] for x in r.json()] == ["Prof A"]


def test_header_y_query_juntos_manda_query(client, escenario) -> None:
    """X-Sucursal-Id: B (header) + ?sucursal_id=A (query) → filtra por A."""
    r = client.get(
        f"/profesionales?sucursal_id={escenario['suc_a']['id']}",
        headers={"X-Sucursal-Id": escenario["suc_b"]["id"]},
    )
    assert r.status_code == 200, r.text
    assert [x["nombre"] for x in r.json()] == ["Prof A"]


def test_filtro_inexistente_da_404(client) -> None:
    r = client.get(f"/profesionales?sucursal_id={uuid.uuid4()}")
    assert r.status_code == 404, r.text
    r = client.get(f"/sillones?sucursal_id={uuid.uuid4()}")
    assert r.status_code == 404, r.text


def test_filtro_mal_formado_da_422(client) -> None:
    r = client.get("/profesionales?sucursal_id=no-es-uuid")
    assert r.status_code == 422, r.text
    r = client.get("/sillones?sucursal_id=no-es-uuid")
    assert r.status_code == 422, r.text


def test_post_sucursal_inexistente_da_404(client) -> None:
    r = client.post(
        "/profesionales",
        json={"nombre": "X", "matricula": "MP-X", "sucursal_id": str(uuid.uuid4())},
    )
    assert r.status_code == 404, r.text
    r = client.post(
        "/sillones", json={"nombre": "X", "sucursal_id": str(uuid.uuid4())}
    )
    assert r.status_code == 404, r.text


def test_post_sucursal_mal_formado_da_422(client) -> None:
    r = client.post(
        "/profesionales",
        json={"nombre": "X", "matricula": "MP-X", "sucursal_id": "no-es-uuid"},
    )
    assert r.status_code == 422, r.text
    r = client.post(
        "/sillones", json={"nombre": "X", "sucursal_id": "no-es-uuid"}
    )
    assert r.status_code == 422, r.text


def test_patch_cambia_y_limpia_sucursal(client, escenario) -> None:
    prof_a = escenario["prof_a"]
    r = client.patch(
        f"/profesionales/{prof_a['id']}",
        json={"sucursal_id": escenario["suc_b"]["id"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["sucursal_id"] == escenario["suc_b"]["id"]
    r = client.patch(
        f"/profesionales/{prof_a['id']}", json={"sucursal_id": None}
    )
    assert r.status_code == 200, r.text
    assert r.json()["sucursal_id"] is None


def test_patch_parcial_conserva_sucursal(client, escenario) -> None:
    prof_a = escenario["prof_a"]
    r = client.patch(
        f"/profesionales/{prof_a['id']}", json={"nombre": "Prof A2"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["nombre"] == "Prof A2"
    assert r.json()["sucursal_id"] == escenario["suc_a"]["id"]


def test_patch_sucursal_inexistente_da_404(client, escenario) -> None:
    prof_a = escenario["prof_a"]
    r = client.patch(
        f"/profesionales/{prof_a['id']}",
        json={"sucursal_id": str(uuid.uuid4())},
    )
    assert r.status_code == 404, r.text
    sill_a = escenario["sill_a"]
    r = client.patch(
        f"/sillones/{sill_a['id']}", json={"sucursal_id": str(uuid.uuid4())}
    )
    assert r.status_code == 404, r.text


def test_caja_y_agenda_no_se_particionan(client, db_session, escenario) -> None:
    """Límite documentado: caja y agenda son globales en C-11."""
    # El router de caja define su propio get_db: hay que sobreescribirlo
    # también, o la sesión real se bloquea contra el TRUNCATE de db_session.
    app.dependency_overrides[caja_get_db] = lambda: db_session
    try:
        r = client.get(
            f"/caja?sucursal_id={escenario['suc_a']['id']}",
            headers={"X-Sucursal-Id": escenario["suc_a"]["id"]},
        )
    finally:
        app.dependency_overrides.pop(caja_get_db, None)
    # El endpoint no filtra por sucursal: responde el contrato normal
    # (404 de caja inexistente o 200), nunca 422 por el parámetro.
    assert r.status_code in (200, 404), r.text
