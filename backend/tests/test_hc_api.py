"""API HC (C-09, fase 5/7). Solo datos ficticios."""

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.app.agenda.models import Paciente, Prestacion, Profesional
from backend.app.hc.router import get_db as hc_get_db
from backend.app.main import app
from backend.app.seed.catalogo import seed_catalogo

pytestmark = pytest.mark.integration

LUNES = "2026-10-12T10:00:00-03:00"


@pytest.fixture()
def ids(db_session):
    seed_catalogo(db_session)
    return {
        "paciente": db_session.query(Paciente).filter_by(dni="DNI-FICT-001").one().id,
        "paciente2": db_session.query(Paciente).filter_by(dni="DNI-FICT-002").one().id,
        "profesional": db_session.query(Profesional).filter_by(matricula="MAT-FICT-001").one().id,
        "prestacion": db_session.query(Prestacion).filter_by(nombre="Consulta").one().id,
    }


@pytest.fixture()
def client(db_session):
    def _override():
        yield db_session

    app.dependency_overrides[hc_get_db] = _override
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def _hc_body(ids, **extra):
    body = {"paciente_id": str(ids["paciente"])}
    body.update(extra)
    return body


# ---------- Historia clinica ----------

def test_creacion_valida(client, ids):
    r = client.post("/historias-clinicas", json=_hc_body(ids))
    assert r.status_code == 201
    data = r.json()
    assert data["paciente_id"] == str(ids["paciente"])
    assert data["antecedentes"] is None
    assert data["alergias"] is None
    assert data["observaciones"] is None


def test_hc_duplicada_devuelve_409(client, ids):
    client.post("/historias-clinicas", json=_hc_body(ids))
    r = client.post("/historias-clinicas", json=_hc_body(ids))
    assert r.status_code == 409
    assert r.json()["detail"]["causa"] == "historia_clinica_duplicada"


def test_hc_paciente_inexistente_404(client, ids):
    r = client.post(
        "/historias-clinicas", json={"paciente_id": str(uuid.uuid4())}
    )
    assert r.status_code == 404


def test_hc_paciente_sin_hc_404(client, ids):
    r = client.get(f"/pacientes/{ids['paciente']}/historia-clinica")
    assert r.status_code == 404


def test_patch_parcial(client, ids):
    r = client.post("/historias-clinicas", json=_hc_body(ids, antecedentes="ant", alergias="alg"))
    hc_id = r.json()["id"]
    r2 = client.patch(f"/historias-clinicas/{hc_id}", json={"alergias": "nueva"})
    assert r2.status_code == 200
    assert r2.json()["alergias"] == "nueva"
    assert r2.json()["antecedentes"] == "ant"


def test_patch_cuerpo_vacio(client, ids):
    r = client.post("/historias-clinicas", json=_hc_body(ids, antecedentes="ant"))
    hc_id = r.json()["id"]
    r2 = client.patch(f"/historias-clinicas/{hc_id}", json={})
    assert r2.status_code == 200
    assert r2.json()["antecedentes"] == "ant"


def test_patch_hc_inexistente_404(client, ids):
    r = client.patch(f"/historias-clinicas/{uuid.uuid4()}", json={"alergias": "x"})
    assert r.status_code == 404


def test_alta_entrada(client, ids):
    r = client.post("/historias-clinicas", json=_hc_body(ids))
    hc_id = r.json()["id"]
    r2 = client.post(
        f"/historias-clinicas/{hc_id}/entradas",
        json={
            "profesional_id": str(ids["profesional"]),
            "fecha": LUNES,
            "texto": "nota",
        },
    )
    assert r2.status_code == 201
    assert r2.json()["texto"] == "nota"


def test_entrada_hc_inexistente_404(client, ids):
    r = client.post(
        f"/historias-clinicas/{uuid.uuid4()}/entradas",
        json={
            "profesional_id": str(ids["profesional"]),
            "fecha": LUNES,
            "texto": "nota",
        },
    )
    assert r.status_code == 404


def test_entrada_profesional_inexistente_404(client, ids):
    r = client.post("/historias-clinicas", json=_hc_body(ids))
    hc_id = r.json()["id"]
    r2 = client.post(
        f"/historias-clinicas/{hc_id}/entradas",
        json={
            "profesional_id": str(uuid.uuid4()),
            "fecha": LUNES,
            "texto": "nota",
        },
    )
    assert r2.status_code == 404


def test_delete_entrada_405(client, ids):
    r = client.post("/historias-clinicas", json=_hc_body(ids))
    hc_id = r.json()["id"]
    r2 = client.delete(f"/historias-clinicas/{hc_id}/entradas")
    assert r2.status_code == 405


# ---------- Odontograma ----------

def test_registrar_odontograma(client, ids):
    r = client.post(
        f"/pacientes/{ids['paciente']}/odontograma",
        json={
            "pieza": "16",
            "estado": "cariado",
            "profesional_id": str(ids["profesional"]),
            "fecha": LUNES,
        },
    )
    assert r.status_code == 201
    assert r.json()["estado"] == "cariado"


def test_estado_libre_se_guarda_literal(client, ids):
    r = client.post(
        f"/pacientes/{ids['paciente']}/odontograma",
        json={
            "pieza": "16",
            "estado": "observacion-libre-no-catalogada",
            "profesional_id": str(ids["profesional"]),
            "fecha": LUNES,
        },
    )
    assert r.status_code == 201
    r2 = client.get(f"/pacientes/{ids['paciente']}/odontograma")
    assert r2.json()[0]["estado"] == "observacion-libre-no-catalogada"


def test_odontograma_vacio(client, ids):
    r = client.get(f"/pacientes/{ids['paciente']}/odontograma")
    assert r.status_code == 200
    assert r.json() == []


def test_pieza_fdi_limite(client, ids):
    for pieza in ("18", "48"):
        r = client.post(
            f"/pacientes/{ids['paciente']}/odontograma",
            json={
                "pieza": pieza,
                "estado": "sano",
                "profesional_id": str(ids["profesional"]),
                "fecha": LUNES,
            },
        )
        assert r.status_code == 201, pieza


def test_pieza_fdi_invalida(client, ids):
    for pieza in ("19", "55", "1"):
        r = client.post(
            f"/pacientes/{ids['paciente']}/odontograma",
            json={
                "pieza": pieza,
                "estado": "sano",
                "profesional_id": str(ids["profesional"]),
                "fecha": LUNES,
            },
        )
        assert r.status_code == 422, pieza


def test_odontograma_paciente_inexistente_404(client, ids):
    r = client.post(
        f"/pacientes/{uuid.uuid4()}/odontograma",
        json={
            "pieza": "16",
            "estado": "sano",
            "profesional_id": str(ids["profesional"]),
            "fecha": LUNES,
        },
    )
    assert r.status_code == 404


def test_odontograma_profesional_inexistente_404(client, ids):
    r = client.post(
        f"/pacientes/{ids['paciente']}/odontograma",
        json={
            "pieza": "16",
            "estado": "sano",
            "profesional_id": str(uuid.uuid4()),
            "fecha": LUNES,
        },
    )
    assert r.status_code == 404


# ---------- Planes ----------

def test_plan_con_items(client, ids):
    r = client.post(
        "/planes-tratamiento",
        json={
            "paciente_id": str(ids["paciente"]),
            "profesional_id": str(ids["profesional"]),
        },
    )
    assert r.status_code == 201
    plan_id = r.json()["id"]
    r2 = client.post(
        f"/planes-tratamiento/{plan_id}/items",
        json={
            "pieza": "16",
            "prestacion_id": str(ids["prestacion"]),
            "monto_centavos": 1000,
        },
    )
    assert r2.status_code == 201
    r3 = client.post(
        f"/planes-tratamiento/{plan_id}/items",
        json={
            "pieza": "26",
            "prestacion_id": str(ids["prestacion"]),
            "monto_centavos": 2000,
        },
    )
    assert r3.status_code == 201
    r4 = client.get(f"/planes-tratamiento/{plan_id}")
    assert r4.status_code == 200
    assert len(r4.json()["items"]) == 2


def test_item_plan_inexistente_404(client, ids):
    r = client.post(
        f"/planes-tratamiento/{uuid.uuid4()}/items",
        json={
            "pieza": "16",
            "prestacion_id": str(ids["prestacion"]),
            "monto_centavos": 1000,
        },
    )
    assert r.status_code == 404


def test_item_prestacion_inexistente_404(client, ids):
    r = client.post(
        "/planes-tratamiento",
        json={
            "paciente_id": str(ids["paciente"]),
            "profesional_id": str(ids["profesional"]),
        },
    )
    plan_id = r.json()["id"]
    r2 = client.post(
        f"/planes-tratamiento/{plan_id}/items",
        json={
            "pieza": "16",
            "prestacion_id": str(uuid.uuid4()),
            "monto_centavos": 1000,
        },
    )
    assert r2.status_code == 404


def test_monto_cero(client, ids):
    r = client.post(
        "/planes-tratamiento",
        json={
            "paciente_id": str(ids["paciente"]),
            "profesional_id": str(ids["profesional"]),
        },
    )
    plan_id = r.json()["id"]
    r2 = client.post(
        f"/planes-tratamiento/{plan_id}/items",
        json={
            "pieza": "16",
            "prestacion_id": str(ids["prestacion"]),
            "monto_centavos": 0,
        },
    )
    assert r2.status_code == 201
    r3 = client.get(f"/planes-tratamiento/{plan_id}")
    assert r3.json()["total_centavos"] >= 0


def test_monto_negativo(client, ids):
    r = client.post(
        "/planes-tratamiento",
        json={
            "paciente_id": str(ids["paciente"]),
            "profesional_id": str(ids["profesional"]),
        },
    )
    plan_id = r.json()["id"]
    r2 = client.post(
        f"/planes-tratamiento/{plan_id}/items",
        json={
            "pieza": "16",
            "prestacion_id": str(ids["prestacion"]),
            "monto_centavos": -1,
        },
    )
    assert r2.status_code == 422


def test_monto_decimal_o_ausente(client, ids):
    r = client.post(
        "/planes-tratamiento",
        json={
            "paciente_id": str(ids["paciente"]),
            "profesional_id": str(ids["profesional"]),
        },
    )
    plan_id = r.json()["id"]
    r2 = client.post(
        f"/planes-tratamiento/{plan_id}/items",
        json={
            "pieza": "16",
            "prestacion_id": str(ids["prestacion"]),
            "monto_centavos": 1500.5,
        },
    )
    assert r2.status_code == 422
    r3 = client.post(
        f"/planes-tratamiento/{plan_id}/items",
        json={
            "pieza": "16",
            "prestacion_id": str(ids["prestacion"]),
        },
    )
    assert r3.status_code == 422


def test_estado_plan_invalido_422(client, ids):
    r = client.post(
        "/planes-tratamiento",
        json={
            "paciente_id": str(ids["paciente"]),
            "profesional_id": str(ids["profesional"]),
        },
    )
    plan_id = r.json()["id"]
    r2 = client.patch(
        f"/planes-tratamiento/{plan_id}", json={"estado": "estado-inventado"}
    )
    assert r2.status_code == 422


def test_plan_no_editable_409(client, ids):
    r = client.post(
        "/planes-tratamiento",
        json={
            "paciente_id": str(ids["paciente"]),
            "profesional_id": str(ids["profesional"]),
        },
    )
    plan_id = r.json()["id"]
    client.patch(f"/planes-tratamiento/{plan_id}", json={"estado": "cerrado"})
    r2 = client.post(
        f"/planes-tratamiento/{plan_id}/items",
        json={
            "pieza": "16",
            "prestacion_id": str(ids["prestacion"]),
            "monto_centavos": 100,
        },
    )
    assert r2.status_code == 409


def test_plan_paciente_inexistente_404(client, ids):
    r = client.post(
        "/planes-tratamiento",
        json={
            "paciente_id": str(uuid.uuid4()),
            "profesional_id": str(ids["profesional"]),
        },
    )
    assert r.status_code == 404


def test_plan_profesional_inexistente_404(client, ids):
    r = client.post(
        "/planes-tratamiento",
        json={
            "paciente_id": str(ids["paciente"]),
            "profesional_id": str(uuid.uuid4()),
        },
    )
    assert r.status_code == 404


def test_plan_cerrado_conserva_items(client, ids):
    r = client.post(
        "/planes-tratamiento",
        json={
            "paciente_id": str(ids["paciente"]),
            "profesional_id": str(ids["profesional"]),
        },
    )
    plan_id = r.json()["id"]
    client.post(
        f"/planes-tratamiento/{plan_id}/items",
        json={
            "pieza": "16",
            "prestacion_id": str(ids["prestacion"]),
            "monto_centavos": 1000,
        },
    )
    client.post(
        f"/planes-tratamiento/{plan_id}/items",
        json={
            "pieza": "26",
            "prestacion_id": str(ids["prestacion"]),
            "monto_centavos": 2000,
        },
    )
    client.patch(f"/planes-tratamiento/{plan_id}", json={"estado": "cerrado"})
    r2 = client.get(f"/planes-tratamiento/{plan_id}")
    assert r2.status_code == 200
    assert r2.json()["estado"] == "cerrado"
    assert len(r2.json()["items"]) == 2
    assert r2.json()["total_centavos"] == 3000


def test_cobertura_ausente_null(client, ids):
    r = client.post(
        "/planes-tratamiento",
        json={
            "paciente_id": str(ids["paciente"]),
            "profesional_id": str(ids["profesional"]),
        },
    )
    plan_id = r.json()["id"]
    client.post(
        f"/planes-tratamiento/{plan_id}/items",
        json={
            "pieza": "16",
            "prestacion_id": str(ids["prestacion"]),
            "monto_centavos": 1000,
        },
    )
    r2 = client.get(f"/planes-tratamiento/{plan_id}")
    assert r2.json()["items"][0]["monto_cobertura_centavos"] is None
    assert r2.json()["cobertura_centavos"] == 0


def test_listado_planes_vacio(client, ids):
    r = client.get(f"/pacientes/{ids['paciente']}/planes-tratamiento")
    assert r.status_code == 200
    assert r.json() == []


def test_listado_planes_paciente_inexistente_404(client, ids):
    r = client.get(f"/pacientes/{uuid.uuid4()}/planes-tratamiento")
    assert r.status_code == 404


def test_delete_hc_405(client, ids):
    r = client.post("/historias-clinicas", json=_hc_body(ids))
    hc_id = r.json()["id"]
    r2 = client.delete(f"/historias-clinicas/{hc_id}")
    assert r2.status_code == 405