"""Tests de integración para la API REST del catálogo de recursos (C-12).

Verifica endpoints de Pacientes, Profesionales, Sillones y Prestaciones contra PostgreSQL real:
- Pacientes (grupo 5): smoke, CRUD, paginación, búsqueda ?q=, 409, 422, 404.
- Profesionales (grupo 6): GET ordenado, inclusión/exclusión inactivos, POST, PATCH toggle activo, 409 duplicate_matricula, 422 largo, 404, 422 desconocido.
- Sillones (grupo 7): GET ordenado, inclusión/exclusión inactivos, POST, PATCH baja lógica activo=false, 409 duplicate_nombre_sillon, 422 largo, 404, 405 en DELETE.
- Prestaciones (grupo 8): GET ordenado, inclusión/exclusión inactivos, POST, PATCH, 422 duracion_min <= 0 (POST/PATCH), 409 duplicate_nombre_prestacion, 422 largo, 404.
Sin depender de la fecha real del sistema.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.app.agenda.models import Paciente, Prestacion, Profesional, SillonBox
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
# 1. Pacientes (Grupo 5)
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


# ============================================================================
# 2. Profesionales (Grupo 6)
# ============================================================================


def test_crear_profesional_exitoso(client):
    mat = f"MAT-{uuid.uuid4().hex[:8]}"
    res = client.post(
        "/profesionales",
        json={"nombre": "Dra. Gomez", "matricula": mat},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["nombre"] == "Dra. Gomez"
    assert data["matricula"] == mat
    assert data["activo"] is True
    assert "id" in data


def test_crear_profesional_409_duplicate_matricula(client):
    mat = f"MAT-{uuid.uuid4().hex[:8]}"
    client.post("/profesionales", json={"nombre": "Primero", "matricula": mat})

    res = client.post("/profesionales", json={"nombre": "Segundo", "matricula": mat})
    assert res.status_code == 409
    data = res.json()
    assert data["detail"]["causa"] == "duplicate_matricula"
    assert "matrícula" in data["detail"]["detalle"]


def test_crear_profesional_422_exceso_largo(client):
    assert client.post(
        "/profesionales",
        json={"nombre": "A" * 201, "matricula": "M1"},
    ).status_code == 422
    assert client.post(
        "/profesionales",
        json={"nombre": "Dr.", "matricula": "M" * 33},
    ).status_code == 422


def test_listar_profesionales_orden_y_filtro_inactivos(client, db_session):
    u = uuid.uuid4().hex[:6]
    p_b = Profesional(nombre=f"B_Dr_{u}", matricula=f"M-B-{u}", activo=True)
    p_a = Profesional(nombre=f"A_Dra_{u}", matricula=f"M-A-{u}", activo=True)
    p_inactivo = Profesional(
        nombre=f"0_Inactivo_{u}", matricula=f"M-I-{u}", activo=False
    )
    db_session.add_all([p_b, p_a, p_inactivo])
    db_session.flush()

    # Por defecto: solo activos y ordenados por nombre ASC
    res_def = client.get("/profesionales").json()
    items_u = [p for p in res_def if u in p["nombre"]]
    assert len(items_u) == 2
    assert items_u[0]["nombre"] == f"A_Dra_{u}"
    assert items_u[1]["nombre"] == f"B_Dr_{u}"

    # Con incluir_inactivos=true
    res_all = client.get("/profesionales?incluir_inactivos=true").json()
    items_all = [p for p in res_all if u in p["nombre"]]
    assert len(items_all) == 3
    assert items_all[0]["nombre"] == f"0_Inactivo_{u}"


def test_patch_profesional_toggle_activo_y_modificaciones(client, db_session):
    u = uuid.uuid4().hex[:6]
    prof = Profesional(nombre=f"Dr_{u}", matricula=f"M-{u}", activo=True)
    db_session.add(prof)
    db_session.flush()

    # Toggle activo a False
    res = client.patch(f"/profesionales/{prof.id}", json={"activo": False})
    assert res.status_code == 200
    assert res.json()["activo"] is False

    # PATCH vacío no modifica
    res_vacio = client.patch(f"/profesionales/{prof.id}", json={})
    assert res_vacio.status_code == 200
    assert res_vacio.json()["activo"] is False


def test_patch_profesional_404_422_409(client, db_session):
    u = uuid.uuid4().hex[:6]
    prof1 = Profesional(nombre=f"Dr1_{u}", matricula=f"M1-{u}", activo=True)
    prof2 = Profesional(nombre=f"Dr2_{u}", matricula=f"M2-{u}", activo=True)
    db_session.add_all([prof1, prof2])
    db_session.flush()

    # 404 id inexistente
    res_404 = client.patch(f"/profesionales/{uuid.uuid4()}", json={"nombre": "Nuevo"})
    assert res_404.status_code == 404
    assert isinstance(res_404.json()["detail"], str)

    # 422 campo desconocido
    res_422_extra = client.patch(
        f"/profesionales/{prof1.id}", json={"desconocido": 123}
    )
    assert res_422_extra.status_code == 422

    # 422 null en campo NOT NULL
    res_422_null = client.patch(
        f"/profesionales/{prof1.id}", json={"matricula": None}
    )
    assert res_422_null.status_code == 422

    # 409 duplicate_matricula en PATCH
    res_409 = client.patch(
        f"/profesionales/{prof2.id}", json={"matricula": f"M1-{u}"}
    )
    assert res_409.status_code == 409
    assert res_409.json()["detail"]["causa"] == "duplicate_matricula"


# ============================================================================
# 3. Sillones (Grupo 7)
# ============================================================================


def test_crear_sillon_exitoso(client):
    nom = f"Sillon_{uuid.uuid4().hex[:8]}"
    res = client.post("/sillones", json={"nombre": nom})
    assert res.status_code == 201
    data = res.json()
    assert data["nombre"] == nom
    assert data["activo"] is True
    assert "id" in data


def test_crear_sillon_409_duplicate_nombre_sillon(client):
    nom = f"Sillon_{uuid.uuid4().hex[:8]}"
    client.post("/sillones", json={"nombre": nom})

    res = client.post("/sillones", json={"nombre": nom})
    assert res.status_code == 409
    assert res.json()["detail"]["causa"] == "duplicate_nombre_sillon"


def test_crear_sillon_422_exceso_largo(client):
    assert client.post("/sillones", json={"nombre": "S" * 101}).status_code == 422


def test_listar_sillones_orden_y_filtro_inactivos(client, db_session):
    u = uuid.uuid4().hex[:6]
    s_b = SillonBox(nombre=f"B_Sillon_{u}", activo=True)
    s_a = SillonBox(nombre=f"A_Sillon_{u}", activo=True)
    s_inactivo = SillonBox(nombre=f"0_Inactivo_{u}", activo=False)
    db_session.add_all([s_b, s_a, s_inactivo])
    db_session.flush()

    res_def = client.get("/sillones").json()
    items_u = [s for s in res_def if u in s["nombre"]]
    assert len(items_u) == 2
    assert items_u[0]["nombre"] == f"A_Sillon_{u}"
    assert items_u[1]["nombre"] == f"B_Sillon_{u}"

    res_all = client.get("/sillones?incluir_inactivos=true").json()
    items_all = [s for s in res_all if u in s["nombre"]]
    assert len(items_all) == 3
    assert items_all[0]["nombre"] == f"0_Inactivo_{u}"


def test_patch_sillon_baja_logica_y_errores(client, db_session):
    u = uuid.uuid4().hex[:6]
    s1 = SillonBox(nombre=f"S1_{u}", activo=True)
    s2 = SillonBox(nombre=f"S2_{u}", activo=True)
    db_session.add_all([s1, s2])
    db_session.flush()

    # Baja lógica vía activo=false
    res_baja = client.patch(f"/sillones/{s1.id}", json={"activo": False})
    assert res_baja.status_code == 200
    assert res_baja.json()["activo"] is False

    # PATCH {}
    assert client.patch(f"/sillones/{s1.id}", json={}).status_code == 200

    # 404 id inexistente
    res_404 = client.patch(f"/sillones/{uuid.uuid4()}", json={"nombre": "Nuevo"})
    assert res_404.status_code == 404
    assert isinstance(res_404.json()["detail"], str)

    # 422 campo desconocido
    assert client.patch(f"/sillones/{s1.id}", json={"extra": 1}).status_code == 422

    # 422 null en nombre
    assert client.patch(f"/sillones/{s1.id}", json={"nombre": None}).status_code == 422

    # 409 duplicate_nombre_sillon en PATCH
    res_409 = client.patch(f"/sillones/{s2.id}", json={"nombre": f"S1_{u}"})
    assert res_409.status_code == 409
    assert res_409.json()["detail"]["causa"] == "duplicate_nombre_sillon"


def test_delete_sillon_rechazado_405(client):
    # RN: No existe DELETE en sillones (baja lógica vía PATCH)
    res = client.delete(f"/sillones/{uuid.uuid4()}")
    assert res.status_code == 405


# ============================================================================
# 4. Prestaciones (Grupo 8)
# ============================================================================


def test_crear_prestacion_exitosa(client):
    nom = f"Prestacion_{uuid.uuid4().hex[:8]}"
    res = client.post("/prestaciones", json={"nombre": nom, "duracion_min": 45})
    assert res.status_code == 201
    data = res.json()
    assert data["nombre"] == nom
    assert data["duracion_min"] == 45
    assert data["activo"] is True
    assert "id" in data


def test_crear_prestacion_409_duplicate_nombre_prestacion(client):
    nom = f"Prestacion_{uuid.uuid4().hex[:8]}"
    client.post("/prestaciones", json={"nombre": nom, "duracion_min": 30})

    res = client.post("/prestaciones", json={"nombre": nom, "duracion_min": 20})
    assert res.status_code == 409
    assert res.json()["detail"]["causa"] == "duplicate_nombre_prestacion"


def test_crear_prestacion_422_validaciones(client):
    # duracion_min <= 0
    assert client.post(
        "/prestaciones", json={"nombre": "P", "duracion_min": 0}
    ).status_code == 422
    assert client.post(
        "/prestaciones", json={"nombre": "P", "duracion_min": -10}
    ).status_code == 422

    # nombre > 100
    assert client.post(
        "/prestaciones", json={"nombre": "P" * 101, "duracion_min": 20}
    ).status_code == 422


def test_listar_prestaciones_orden_y_filtro_inactivos(client, db_session):
    u = uuid.uuid4().hex[:6]
    pr_b = Prestacion(nombre=f"B_Pres_{u}", duracion_min=30, activo=True)
    pr_a = Prestacion(nombre=f"A_Pres_{u}", duracion_min=20, activo=True)
    pr_inactiva = Prestacion(nombre=f"0_Inactiva_{u}", duracion_min=15, activo=False)
    db_session.add_all([pr_b, pr_a, pr_inactiva])
    db_session.flush()

    res_def = client.get("/prestaciones").json()
    items_u = [pr for pr in res_def if u in pr["nombre"]]
    assert len(items_u) == 2
    assert items_u[0]["nombre"] == f"A_Pres_{u}"
    assert items_u[1]["nombre"] == f"B_Pres_{u}"

    res_all = client.get("/prestaciones?incluir_inactivos=true").json()
    items_all = [pr for pr in res_all if u in pr["nombre"]]
    assert len(items_all) == 3
    assert items_all[0]["nombre"] == f"0_Inactiva_{u}"


def test_patch_prestacion_baja_logica_y_errores(client, db_session):
    u = uuid.uuid4().hex[:6]
    pr1 = Prestacion(nombre=f"PR1_{u}", duracion_min=30, activo=True)
    pr2 = Prestacion(nombre=f"PR2_{u}", duracion_min=40, activo=True)
    db_session.add_all([pr1, pr2])
    db_session.flush()

    # Baja lógica
    res_baja = client.patch(f"/prestaciones/{pr1.id}", json={"activo": False})
    assert res_baja.status_code == 200
    assert res_baja.json()["activo"] is False

    # PATCH {}
    assert client.patch(f"/prestaciones/{pr1.id}", json={}).status_code == 200

    # 404 id inexistente
    res_404 = client.patch(
        f"/prestaciones/{uuid.uuid4()}", json={"nombre": "Nuevo"}
    )
    assert res_404.status_code == 404
    assert isinstance(res_404.json()["detail"], str)

    # 422 duracion_min <= 0
    assert client.patch(
        f"/prestaciones/{pr1.id}", json={"duracion_min": 0}
    ).status_code == 422
    assert client.patch(
        f"/prestaciones/{pr1.id}", json={"duracion_min": -5}
    ).status_code == 422

    # 422 campo desconocido
    assert client.patch(
        f"/prestaciones/{pr1.id}", json={"extra": 99}
    ).status_code == 422

    # 422 null en nombre
    assert client.patch(
        f"/prestaciones/{pr1.id}", json={"nombre": None}
    ).status_code == 422

    # 409 duplicate_nombre_prestacion en PATCH
    res_409 = client.patch(
        f"/prestaciones/{pr2.id}", json={"nombre": f"PR1_{u}"}
    )
    assert res_409.status_code == 409
    assert res_409.json()["detail"]["causa"] == "duplicate_nombre_prestacion"
