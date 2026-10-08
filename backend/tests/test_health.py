"""Cubre el delta foundation: GET /health sin dependencias externas."""

from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_health_responde_ok():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_sin_base_de_datos(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

