"""Tests de integración para la API REST del catálogo de recursos (C-12, grupo 5).

Verifica endpoints de Pacientes contra PostgreSQL real:
- Smoke test: GET /pacientes responde 200
- Alta exitosa con POST /pacientes (ficticio por defecto true, activo=true)
- Paginación determinística y envelope {items, total, limit, offset}
- Paginación estable sin saltos ni duplicados entre páginas consecutivas
- Query params fuera de rango: limit (1..200) y offset (>= 0) -> 422
- Búsqueda con ?q= con escape de % y _ (coincidencia literal)
- Conteo total consistente con filtros de ?q= y ?incluir_inactivos=
- Conflicto 409 con duplicate_dni en POST y en PATCH
- Validación 422 por exceso de largo (nombre > 200, dni > 32)
- PATCH {} sin cambios
- PATCH con null explícito en NOT NULL -> 422
- PATCH con campo desconocido (extra=forbid) -> 422
- PATCH con id inexistente -> 404 (detail string)
Sin depender de la fecha real del sistema.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.app.agenda.models import Paciente
from backend.app.main import app
from backend.app.turnos.router import get_db

pytestmark = pytest.mark.integration


@pytest.fixture()
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_db, None)


# ============================================================================
# 1. Smoke test y Creación de Pacientes
# ============================================================================


def test_smoke_get_pacientes_responde_200(client):
    res = client.get("/pacientes")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data


def test_crear_paciente_exitoso(client):
    dni = f"DNI-{uuid.uuid4().hex[:8]}"
    payload = {
        "nombre": "Mariano Perez",
        "dni": dni,
        "contacto": "11-4444-5555",
    }
    res = client.post("/pacientes", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["nombre"] == "Mariano Perez"
    assert data["dni"] == dni
    assert data["contacto"] == "11-4444-5555"
    assert data["ficticio"] is True
    assert data["activo"] is True
    assert "id" in data


def test_crear_paciente_409_duplicate_dni(client):
    dni = f"DNI-{uuid.uuid4().hex[:8]}"
    client.post("/pacientes", json={"nombre": "Primero", "dni": dni})

    # Segundo con mismo DNI -> 409
    res = client.post("/pacientes", json={"nombre": "Segundo", "dni": dni})
    assert res.status_code == 409
    data = res.json()
    assert data["detail"]["causa"] == "duplicate_dni"
    assert "DNI" in data["detail"]["detalle"]


def test_crear_paciente_422_exceso_largo(client):
    # nombre > 200
    res = client.post(
        "/pacientes",
        json={"nombre": "A" * 201, "dni": "1234"},
    )
    assert res.status_code == 422

    # dni > 32
    res = client.post(
        "/pacientes",
        json={"nombre": "Juan", "dni": "D" * 33},
    )
    assert res.status_code == 422


# ============================================================================
# 2. Paginación determinística y Búsqueda
# ============================================================================


def test_paginacion_fuera_de_rango_422(client):
    # limit < 1
    assert client.get("/pacientes?limit=0").status_code == 422
    # limit > 200
    assert client.get("/pacientes?limit=201").status_code == 422
    # offset < 0
    assert client.get("/pacientes?offset=-1").status_code == 422


def test_paginacion_estable_sin_saltos_ni_duplicados(client, db_session):
    # Insertar 5 pacientes con nombres ordenados
    prefijo = f"PAG_{uuid.uuid4().hex[:6]}"
    for i in range(5):
        db_session.add(
            Paciente(
                nombre=f"{prefijo}_Paciente_{i:02d}",
                dni=f"DNI-PAG-{uuid.uuid4().hex[:8]}",
                ficticio=True,
                activo=True,
            )
        )
    db_session.flush()

    # Página 1 (limit 2, offset 0)
    p1 = client.get(f"/pacientes?q={prefijo}&limit=2&offset=0").json()
    assert p1["total"] == 5
    assert len(p1["items"]) == 2
    nombres_p1 = [item["nombre"] for item in p1["items"]]
    assert nombres_p1 == [f"{prefijo}_Paciente_00", f"{prefijo}_Paciente_01"]

    # Página 2 (limit 2, offset 2)
    p2 = client.get(f"/pacientes?q={prefijo}&limit=2&offset=2").json()
    assert len(p2["items"]) == 2
    nombres_p2 = [item["nombre"] for item in p2["items"]]
    assert nombres_p2 == [f"{prefijo}_Paciente_02", f"{prefijo}_Paciente_03"]

    # Página 3 (limit 2, offset 4)
    p3 = client.get(f"/pacientes?q={prefijo}&limit=2&offset=4").json()
    assert len(p3["items"]) == 1
    nombres_p3 = [item["nombre"] for item in p3["items"]]
    assert nombres_p3 == [f"{prefijo}_Paciente_04"]

    todos_ids = [item["id"] for item in p1["items"] + p2["items"] + p3["items"]]
    assert len(set(todos_ids)) == 5


def test_busqueda_q_con_escape_literal(client, db_session):
    u = uuid.uuid4().hex[:6]
    p_exacto = Paciente(
        nombre=f"Juan_Perez_{u}", dni=f"DNI-LIT-{u}-1", activo=True
    )
    p_espacio = Paciente(
        nombre=f"Juan Perez {u}", dni=f"DNI-LIT-{u}-2", activo=True
    )
    p_porc = Paciente(
        nombre=f"Juan%Perez_{u}", dni=f"DNI-LIT-{u}-3", activo=True
    )
    db_session.add_all([p_exacto, p_espacio, p_porc])
    db_session.flush()

    # Búsqueda literal de '_': solo debe coincidir Juan_Perez y Juan%Perez_, no Juan Perez
    res_guion = client.get(f"/pacientes?q=Juan_Perez_{u}").json()
    assert res_guion["total"] == 1
    assert res_guion["items"][0]["nombre"] == f"Juan_Perez_{u}"

    # Búsqueda literal de '%': solo debe coincidir Juan%Perez_
    res_porc = client.get(f"/pacientes?q=Juan%25Perez_{u}").json()
    assert res_porc["total"] == 1
    assert res_porc["items"][0]["nombre"] == f"Juan%Perez_{u}"


def test_total_consistente_con_filtros_y_activo(client, db_session):
    u = uuid.uuid4().hex[:6]
    p_activo = Paciente(nombre=f"Activo_{u}", dni=f"DNI-A-{u}", activo=True)
    p_inactivo = Paciente(
        nombre=f"Inactivo_{u}", dni=f"DNI-I-{u}", activo=False
    )
    db_session.add_all([p_activo, p_inactivo])
    db_session.flush()

    # Por defecto excluye inactivos
    res_def = client.get(f"/pacientes?q={u}").json()
    assert res_def["total"] == 1
    assert len(res_def["items"]) == 1
    assert res_def["items"][0]["id"] == str(p_activo.id)

    # Con incluir_inactivos=true
    res_all = client.get(f"/pacientes?q={u}&incluir_inactivos=true").json()
    assert res_all["total"] == 2
    assert len(res_all["items"]) == 2


# ============================================================================
# 3. PATCH de Pacientes
# ============================================================================


def test_patch_paciente_modifica_solo_presentes(client, db_session):
    u = uuid.uuid4().hex[:6]
    p = Paciente(
        nombre=f"Original_{u}",
        dni=f"DNI-ORI-{u}",
        contacto="original",
        activo=True,
    )
    db_session.add(p)
    db_session.flush()

    res = client.patch(
        f"/pacientes/{p.id}",
        json={"contacto": "modificado"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["contacto"] == "modificado"
    assert data["nombre"] == f"Original_{u}"
    assert data["dni"] == f"DNI-ORI-{u}"


def test_patch_paciente_vacio_sin_cambios(client, db_session):
    u = uuid.uuid4().hex[:6]
    p = Paciente(
        nombre=f"Original_{u}",
        dni=f"DNI-ORI-{u}",
        contacto="original",
        activo=True,
    )
    db_session.add(p)
    db_session.flush()

    res = client.patch(f"/pacientes/{p.id}", json={})
    assert res.status_code == 200
    data = res.json()
    assert data["contacto"] == "original"


def test_patch_paciente_404_id_inexistente(client):
    uid_inexistente = uuid.uuid4()
    res = client.patch(f"/pacientes/{uid_inexistente}", json={"nombre": "Nuevo"})
    assert res.status_code == 404
    assert isinstance(res.json()["detail"], str)
    assert str(uid_inexistente) in res.json()["detail"]


def test_patch_paciente_422_campo_desconocido(client, db_session):
    p = Paciente(nombre="Test", dni=f"DNI-{uuid.uuid4().hex[:8]}", activo=True)
    db_session.add(p)
    db_session.flush()

    res = client.patch(
        f"/pacientes/{p.id}",
        json={"campo_no_permitido": "valor"},
    )
    assert res.status_code == 422


def test_patch_paciente_422_null_en_not_null(client, db_session):
    p = Paciente(nombre="Test", dni=f"DNI-{uuid.uuid4().hex[:8]}", activo=True)
    db_session.add(p)
    db_session.flush()

    res = client.patch(
        f"/pacientes/{p.id}",
        json={"nombre": None},
    )
    assert res.status_code == 422


def test_patch_paciente_409_duplicate_dni(client, db_session):
    u = uuid.uuid4().hex[:6]
    p1 = Paciente(nombre=f"P1_{u}", dni=f"DNI-P1-{u}", activo=True)
    p2 = Paciente(nombre=f"P2_{u}", dni=f"DNI-P2-{u}", activo=True)
    db_session.add_all([p1, p2])
    db_session.flush()

    # Intentar asignar a p2 el DNI de p1
    res = client.patch(
        f"/pacientes/{p2.id}",
        json={"dni": f"DNI-P1-{u}"},
    )
    assert res.status_code == 409
    data = res.json()
    assert data["detail"]["causa"] == "duplicate_dni"
