"""Tests de API HTTP para caja, cobros y liquidaciones (C-10, 7.3)."""


from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from backend.app.caja.reloj import ZONA
from backend.app.caja.router import (
    get_ahora,
)
from backend.app.caja.router import (
    get_db as caja_get_db,
)
from backend.app.caja.service import ServicioCaja
from backend.app.main import app

pytestmark = pytest.mark.integration


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


def test_flujo_exito_completo(client):
    # 1. Éxito abrir (201)
    r_abrir = client.post("/caja/abrir", json={"monto_apertura_centavos": 10000})
    assert r_abrir.status_code == 201
    caja_id = r_abrir.json()["id"]

    # 2. Éxito cobro (201)
    r_cobro = client.post(
        "/cobros",
        json={"medio": "efectivo", "monto_centavos": 2500, "concepto": "total"},
    )
    assert r_cobro.status_code == 201
    cobro_id = r_cobro.json()["id"]

    # 3. Éxito factura ARCA (201)
    r_factura = client.post(
        f"/cobros/{cobro_id}/factura-arca", json={"tipo": "B"}
    )
    assert r_factura.status_code == 201
    assert r_factura.json()["tipo"] == "B"
    assert r_factura.json()["cae"].startswith("SIM-")

    # 4. Éxito otro cobro y anular (200)
    r_cobro2 = client.post(
        "/cobros",
        json={"medio": "efectivo", "monto_centavos": 1500},
    )
    assert r_cobro2.status_code == 201
    cobro2_id = r_cobro2.json()["id"]

    r_anular = client.post(
        f"/cobros/{cobro2_id}/anular", json={"motivo": "error de tipeo"}
    )
    assert r_anular.status_code == 200
    assert r_anular.json()["estado"] == "anulado"
    assert r_anular.json()["motivo_anulacion"] == "error de tipeo"

    # 5. Éxito cerrar (200)
    r_cerrar = client.post(
        "/caja/cerrar",
        json={"monto_cierre_contado_centavos": 12500},
    )
    assert r_cerrar.status_code == 200
    data_cierre = r_cerrar.json()
    assert data_cierre["estado"] == "cerrada"
    assert data_cierre["monto_esperado_centavos"] == 12500
    assert data_cierre["diferencia_centavos"] == 0
    assert data_cierre["id"] == caja_id


def test_consultas_get_y_404(client):
    r_abrir = client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    caja_id = r_abrir.json()["id"]
    fecha_caja = r_abrir.json()["fecha"]

    r_cobro = client.post(
        "/cobros", json={"medio": "efectivo", "monto_centavos": 2000}
    )
    cobro_id = r_cobro.json()["id"]

    # GET /caja/{id} exitoso
    r_caja = client.get(f"/caja/{caja_id}")
    assert r_caja.status_code == 200
    assert r_caja.json()["id"] == caja_id

    # GET /caja/{id} 404
    r_caja_404 = client.get("/caja/00000000-0000-0000-0000-000000000000")
    assert r_caja_404.status_code == 404

    # GET /caja sin fecha (hoy)
    r_caja_hoy = client.get("/caja")
    assert r_caja_hoy.status_code == 200
    assert r_caja_hoy.json()["id"] == caja_id

    # GET /caja con fecha existente
    r_caja_fecha = client.get(f"/caja?fecha={fecha_caja}")
    assert r_caja_fecha.status_code == 200
    assert r_caja_fecha.json()["id"] == caja_id

    # GET /caja con fecha inexistente 404
    r_caja_fecha_404 = client.get("/caja?fecha=2000-01-01")
    assert r_caja_fecha_404.status_code == 404

    # GET /cobros/{id} exitoso
    r_cobro_get = client.get(f"/cobros/{cobro_id}")
    assert r_cobro_get.status_code == 200
    assert r_cobro_get.json()["id"] == cobro_id

    # GET /cobros/{id} 404
    r_cobro_404 = client.get("/cobros/00000000-0000-0000-0000-000000000000")
    assert r_cobro_404.status_code == 404


def test_get_liquidaciones_os_orden_desc(client):
    # La caja se abre con el mismo reloj inyectado que los cobros:
    # sin esto el test depende de la fecha real del dia.
    app.dependency_overrides[get_ahora] = lambda: datetime(
        2026, 11, 4, 9, 0, tzinfo=ZONA
    )
    r_abrir = client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    assert r_abrir.status_code == 201

    # Liquidación 1 con t1
    app.dependency_overrides[get_ahora] = lambda: datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    client.post(
        "/cobros",
        json={
            "medio": "obra_social",
            "monto_centavos": 5000,
            "nomenclador_codigo": "01.01",
        },
    )

    # Liquidación 2 con t2 posterior
    app.dependency_overrides[get_ahora] = lambda: datetime(2026, 11, 4, 11, 0, tzinfo=ZONA)
    client.post(
        "/cobros",
        json={
            "medio": "obra_social",
            "monto_centavos": 8000,
            "nomenclador_codigo": "01.02",
        },
    )

    r = client.get("/liquidaciones-os")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 2
    # El más reciente (01.02) debe estar primero
    assert items[0]["nomenclador_codigo"] == "01.02"
    assert items[1]["nomenclador_codigo"] == "01.01"

    app.dependency_overrides.pop(get_ahora, None)


def test_borde_2330_con_reloj_inyectable(client):
    ahora_2330 = datetime(2026, 11, 3, 23, 30, tzinfo=ZONA)
    app.dependency_overrides[get_ahora] = lambda: ahora_2330

    try:
        # Abrir a las 23:30 toma fecha local 2026-11-03
        r_abrir = client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
        assert r_abrir.status_code == 201
        assert r_abrir.json()["fecha"] == "2026-11-03"

        # GET /caja a las 23:30 sin query param fecha usa la fecha local 2026-11-03
        r_get = client.get("/caja")
        assert r_get.status_code == 200
        assert r_get.json()["fecha"] == "2026-11-03"

        # Cobro sin caja_id a las 23:30 encuentra la caja abierta de hoy
        r_cobro = client.post(
            "/cobros",
            json={"medio": "efectivo", "monto_centavos": 1000},
        )
        assert r_cobro.status_code == 201
        assert r_cobro.json()["caja_id"] == r_abrir.json()["id"]

        # Cerrar a las 23:30 cierra la caja del día local 2026-11-03
        r_cerrar = client.post(
            "/caja/cerrar",
            json={"monto_cierre_contado_centavos": 6000},
        )
        assert r_cerrar.status_code == 200
        assert r_cerrar.json()["estado"] == "cerrada"
    finally:
        app.dependency_overrides.pop(get_ahora, None)


def test_cobro_caja_id_inexistente_404(client):
    r = client.post(
        "/cobros",
        json={
            "caja_id": "00000000-0000-0000-0000-000000000000",
            "medio": "efectivo",
            "monto_centavos": 1000,
        },
    )
    assert r.status_code == 404


def test_cobro_turno_id_inexistente_404(client):
    client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    r = client.post(
        "/cobros",
        json={
            "turno_id": "00000000-0000-0000-0000-000000000000",
            "medio": "efectivo",
            "monto_centavos": 1000,
        },
    )
    assert r.status_code == 404


def test_error_interno_500_logger(client, monkeypatch):
    def _excepcion_inesperada(*args, **kwargs):
        raise RuntimeError("Fallo catastrófico imprevisto")

    monkeypatch.setattr(ServicioCaja, "abrir", _excepcion_inesperada)
    r = client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
    assert r.status_code == 500
    assert r.json() == {"detail": "error interno"}


def test_totales_por_medio_excluyen_cobros_anulados(client):
    """GET /caja/{id} y GET /caja no incluyen cobros anulados en totales_por_medio_centavos.

    Se registra un cobro en efectivo ($3000), uno con tarjeta ($4500) y uno anulado ($2000).
    Los totales deben reflejar únicamente los cobros no anulados.
    """
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    app.dependency_overrides[get_ahora] = lambda: ahora

    try:
        r_abrir = client.post("/caja/abrir", json={"monto_apertura_centavos": 10000})
        assert r_abrir.status_code == 201
        caja_id = r_abrir.json()["id"]

        # 1. Cobro efectivo (3000)
        r1 = client.post(
            "/cobros",
            json={"medio": "efectivo", "monto_centavos": 3000},
        )
        assert r1.status_code == 201

        # 2. Cobro tarjeta (4500)
        r2 = client.post(
            "/cobros",
            json={"medio": "tarjeta", "monto_centavos": 4500},
        )
        assert r2.status_code == 201

        # 3. Cobro efectivo a anular (2000)
        r3 = client.post(
            "/cobros",
            json={"medio": "efectivo", "monto_centavos": 2000},
        )
        assert r3.status_code == 201
        cobro3_id = r3.json()["id"]

        # Anular cobro 3
        r_anular = client.post(
            f"/cobros/{cobro3_id}/anular",
            json={"motivo": "pago duplicado"},
        )
        assert r_anular.status_code == 200

        # Verificar GET /caja/{id}
        r_caja_id = client.get(f"/caja/{caja_id}")
        assert r_caja_id.status_code == 200
        totales_id = r_caja_id.json()["totales_por_medio_centavos"]
        assert totales_id.get("efectivo") == 3000  # Excluye los 2000 anulados
        assert totales_id.get("tarjeta") == 4500

        # Verificar GET /caja (sin fecha, usa ahora inyectado)
        r_caja_hoy = client.get("/caja")
        assert r_caja_hoy.status_code == 200
        totales_hoy = r_caja_hoy.json()["totales_por_medio_centavos"]
        assert totales_hoy.get("efectivo") == 3000
        assert totales_hoy.get("tarjeta") == 4500
    finally:
        app.dependency_overrides.pop(get_ahora, None)


def test_precedencia_d26_caja_cerrada_sobre_cobro_facturado(client):
    """Precedencia D26: cobro facturado en una caja ya cerrada al anular da 409 caja_cerrada.

    El orden de precedencia es: cobro_ya_anulado -> caja_cerrada -> cobro_facturado.
    Si el cobro no está anulado pero está facturado y la caja está cerrada, debe fallar con
    causa: 'caja_cerrada' (no 'cobro_facturado').
    """
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    app.dependency_overrides[get_ahora] = lambda: ahora

    try:
        r_abrir = client.post("/caja/abrir", json={"monto_apertura_centavos": 5000})
        assert r_abrir.status_code == 201

        # Registrar cobro
        r_cobro = client.post(
            "/cobros",
            json={"medio": "efectivo", "monto_centavos": 2000},
        )
        assert r_cobro.status_code == 201
        cobro_id = r_cobro.json()["id"]

        # Facturar cobro
        r_factura = client.post(
            f"/cobros/{cobro_id}/factura-arca",
            json={"tipo": "B"},
        )
        assert r_factura.status_code == 201

        # Cerrar caja
        r_cerrar = client.post(
            "/caja/cerrar",
            json={"monto_cierre_contado_centavos": 7000},
        )
        assert r_cerrar.status_code == 200

        # Intentar anular el cobro facturado en la caja cerrada
        r_anular = client.post(
            f"/cobros/{cobro_id}/anular",
            json={"motivo": "intento de anulación"},
        )
        assert r_anular.status_code == 409
        body = r_anular.json()
        assert body["detail"]["causa"] == "caja_cerrada"
    finally:
        app.dependency_overrides.pop(get_ahora, None)




