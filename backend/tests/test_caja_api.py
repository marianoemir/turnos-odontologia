"""Tests de API HTTP para caja, cobros y liquidaciones (C-10, 7.3)."""


import pytest
from fastapi.testclient import TestClient

from backend.app.caja.router import (
    get_db as caja_get_db,
)
from backend.app.caja.router import (
    router as caja_router,
)
from backend.app.main import app

pytestmark = pytest.mark.integration

# Incluir router en la app si aún no está (para probar antes de registrar en main.py §6)
if not any(getattr(r, "path", None) == "/caja/abrir" for r in app.routes):
    app.include_router(caja_router)


@pytest.fixture(autouse=True)
def _bloquear_red(monkeypatch):
    """D31: Ningún test de caja puede realizar llamadas de red."""
    def _fallar(*args, **kwargs):
        pytest.fail("Llamada de red detectada en tests de caja (violación D31)")

    import urllib.request

    import httpx

    monkeypatch.setattr(urllib.request, "urlopen", _fallar)
    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", _fallar)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", _fallar)
    try:
        import requests.sessions
        monkeypatch.setattr(requests.sessions.Session, "send", _fallar)
    except ImportError:
        pass


@pytest.fixture()
def client(db_session):
    def _override_db():
        yield db_session

    app.dependency_overrides[caja_get_db] = _override_db
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def test_apertura_valida(client):
    r = client.post("/caja/abrir", json={"monto_apertura_centavos": 10000})
    assert r.status_code == 201
    data = r.json()
    assert data["monto_apertura_centavos"] == 10000
    assert data["estado"] == "abierta"
    assert data["totales_por_medio_centavos"] == {}


# ---------------------------------------------------------------------------
# 5.2: Mapeo de errores HTTP 409 y 422
# ---------------------------------------------------------------------------


def test_apertura_duplicada_409(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r = client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "caja_ya_abierta"


def test_apertura_caja_cerrada_409(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    client.post("/caja/cerrar", json={"monto_cierre_contado_centavos": 5000})
    r = client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "caja_ya_cerrada"


def test_apertura_monto_negativo_422(client):
    r = client.post("/caja/abrir", json={"monto_apertura_centavos": -1})
    assert r.status_code == 422


def test_apertura_monto_maximo_422(client):
    r = client.post(
        "/caja/abrir", json={"monto_apertura_centavos": 1_000_000_000_001}
    )
    assert r.status_code == 422


def test_cierre_sin_caja_409(client):
    r = client.post(
        "/caja/cerrar", json={"monto_cierre_contado_centavos": 1000}
    )
    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "caja_no_abierta"


def test_cierre_ya_cerrada_409(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    client.post("/caja/cerrar", json={"monto_cierre_contado_centavos": 5000})
    r = client.post(
        "/caja/cerrar", json={"monto_cierre_contado_centavos": 5000}
    )
    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "caja_ya_cerrada"


def test_cierre_monto_negativo_422(client):
    r = client.post(
        "/caja/cerrar", json={"monto_cierre_contado_centavos": -1}
    )
    assert r.status_code == 422


def test_cierre_monto_maximo_422(client):
    r = client.post(
        "/caja/cerrar", json={"monto_cierre_contado_centavos": 1_000_000_000_001}
    )
    assert r.status_code == 422


def test_cobro_monto_no_positivo_422(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r = client.post(
        "/cobros", json={"medio": "efectivo", "monto_centavos": 0}
    )
    assert r.status_code == 422


def test_cobro_monto_maximo_422(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r = client.post(
        "/cobros",
        json={"medio": "efectivo", "monto_centavos": 1_000_000_000_001},
    )
    assert r.status_code == 422


def test_cobro_medio_invalido_422(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r = client.post(
        "/cobros", json={"medio": "bitcoin", "monto_centavos": 1000}
    )
    assert r.status_code == 422


def test_cobro_caja_cerrada_409(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    client.post("/caja/cerrar", json={"monto_cierre_contado_centavos": 5000})
    r = client.post(
        "/cobros", json={"medio": "efectivo", "monto_centavos": 1000}
    )
    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "caja_no_abierta"


def test_cobro_caja_id_cerrada_409(client):
    r_abrir = client.post(
        "/caja/abrir", json={"monto_apertura_centavos": 5000}
    )
    caja_id = r_abrir.json()["id"]
    client.post("/caja/cerrar", json={"monto_cierre_contado_centavos": 5000})
    r = client.post(
        "/cobros",
        json={"caja_id": caja_id, "medio": "efectivo", "monto_centavos": 1000},
    )
    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "caja_no_abierta"


def test_cobro_concepto_invalido_422(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r = client.post(
        "/cobros",
        json={
            "medio": "efectivo",
            "concepto": "invalido",
            "monto_centavos": 1000,
        },
    )
    assert r.status_code == 422


def test_anulacion_ya_anulado_409(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r_cobro = client.post(
        "/cobros", json={"medio": "efectivo", "monto_centavos": 1000}
    )
    cobro_id = r_cobro.json()["id"]
    client.post(f"/cobros/{cobro_id}/anular", json={"motivo": "primero"})
    r = client.post(f"/cobros/{cobro_id}/anular", json={"motivo": "segundo"})
    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "cobro_ya_anulado"


def test_anulacion_caja_cerrada_409(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r_cobro = client.post(
        "/cobros", json={"medio": "efectivo", "monto_centavos": 1000}
    )
    cobro_id = r_cobro.json()["id"]
    client.post("/caja/cerrar", json={"monto_cierre_contado_centavos": 6000})
    r = client.post(f"/cobros/{cobro_id}/anular", json={"motivo": "tarde"})
    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "caja_cerrada"


def test_anulacion_cobro_facturado_409(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r_cobro = client.post(
        "/cobros", json={"medio": "efectivo", "monto_centavos": 1000}
    )
    cobro_id = r_cobro.json()["id"]
    client.post(f"/cobros/{cobro_id}/factura-arca", json={"tipo": "B"})
    r = client.post(
        f"/cobros/{cobro_id}/anular", json={"motivo": "con factura"}
    )
    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "cobro_facturado"


def test_anulacion_sin_motivo_422(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r_cobro = client.post(
        "/cobros", json={"medio": "efectivo", "monto_centavos": 1000}
    )
    cobro_id = r_cobro.json()["id"]
    r = client.post(f"/cobros/{cobro_id}/anular", json={"motivo": ""})
    assert r.status_code == 422


def test_cobro_os_sin_nomenclador_422(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r = client.post(
        "/cobros", json={"medio": "obra_social", "monto_centavos": 5000}
    )
    assert r.status_code == 422


def test_cobro_campos_os_invalidos_422(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r = client.post(
        "/cobros",
        json={
            "medio": "efectivo",
            "monto_centavos": 5000,
            "nomenclador_codigo": "01.01",
        },
    )
    assert r.status_code == 422
    assert "campos_os_no_aplicables" in str(r.json())


def test_factura_ya_emitida_409(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r_cobro = client.post(
        "/cobros", json={"medio": "efectivo", "monto_centavos": 1000}
    )
    cobro_id = r_cobro.json()["id"]
    client.post(f"/cobros/{cobro_id}/factura-arca", json={"tipo": "B"})
    r = client.post(f"/cobros/{cobro_id}/factura-arca", json={"tipo": "B"})
    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "cobro_ya_facturado"


def test_factura_cobro_anulado_409(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r_cobro = client.post(
        "/cobros", json={"medio": "efectivo", "monto_centavos": 1000}
    )
    cobro_id = r_cobro.json()["id"]
    client.post(f"/cobros/{cobro_id}/anular", json={"motivo": "anulado"})
    r = client.post(f"/cobros/{cobro_id}/factura-arca", json={"tipo": "B"})
    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "cobro_anulado"


def test_factura_cobro_os_409(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r_cobro = client.post(
        "/cobros",
        json={
            "medio": "obra_social",
            "monto_centavos": 5000,
            "nomenclador_codigo": "01.01",
        },
    )
    cobro_id = r_cobro.json()["id"]
    r = client.post(f"/cobros/{cobro_id}/factura-arca", json={"tipo": "B"})
    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "medio_no_facturable"


def test_factura_tipo_invalido_422(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r_cobro = client.post(
        "/cobros", json={"medio": "efectivo", "monto_centavos": 1000}
    )
    cobro_id = r_cobro.json()["id"]
    r = client.post(f"/cobros/{cobro_id}/factura-arca", json={"tipo": "A"})
    assert r.status_code == 422


def test_liquidacion_cobertura_mayor_422(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r = client.post(
        "/cobros",
        json={
            "medio": "obra_social",
            "monto_centavos": 5000,
            "nomenclador_codigo": "01.01",
            "cobertura_centavos": 6000,
        },
    )
    assert r.status_code == 422


def test_cobro_os_sin_nomenclador_no_crea_liquidacion_422(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r = client.post(
        "/cobros", json={"medio": "obra_social", "monto_centavos": 5000}
    )
    assert r.status_code == 422


def test_delete_cobro_405(client):
    from backend.app.caja.router import router

    delete_routes = [
        r.path
        for r in router.routes
        if hasattr(r, "methods") and "DELETE" in r.methods
    ]
    assert delete_routes == []

    r = client.delete("/cobros/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 405


