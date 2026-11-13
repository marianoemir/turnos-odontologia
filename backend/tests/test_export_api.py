"""GET /export: contrato de exportación total (C-11, grupo 9, TDD RED).

El contrato de abajo (claves, ventana, versión) está escrito a mano desde
design.md D7 y la spec exportacion-datos; no se importa del código.
Reloj fijo vía override de `get_ahora` → 06/11/2026.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from backend.app.agenda.models import (
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
)
from backend.app.auth.jwt_service import emitir_token
from backend.app.auth.models import Usuario
from backend.app.auth.password import hashear_password
from backend.app.caja.models import Caja, Cobro, LiquidacionOS
from backend.app.export.router import get_ahora as export_get_ahora
from backend.app.hc.models import EntradaHC, HistoriaClinica
from backend.app.main import app
from backend.app.rbac.context import get_sucursal_session
from backend.app.rbac.models import Rol
from backend.app.turnos.models import Turno
from backend.app.turnos.router import get_db
from backend.app.turnos.service import ZONA

ADMIN = {}  # Reemplazado por token JWT dinámico en fixture
AHORA_FIJO = datetime(2026, 11, 6, 10, 0, 0, tzinfo=ZONA)

CLAVES_ENVELOPE = {
    "contrato_version",
    "generado_en",
    "zona",
    "periodo",
    "pacientes",
    "historia_clinica",
    "agenda",
    "caja",
}
CLAVES_HC = {"historias", "entradas", "odontogramas", "planes", "items"}
CLAVES_AGENDA = {"turnos", "profesionales", "sillones", "prestaciones"}
CLAVES_CAJA = {"cajas", "cobros", "liquidaciones_os"}


@pytest.fixture()
def admin_headers(db_session):
    rol = db_session.query(Rol).filter_by(nombre="admin").first()
    if not rol:
        rol = Rol(nombre="admin")
        db_session.add(rol)
        db_session.flush()
    u = db_session.query(Usuario).filter_by(dni="99999901").first()
    if not u:
        u = Usuario(
            dni="99999901",
            password_hash=hashear_password("pwd-admin"),
            rol_id=rol.id,
            activo=True,
        )
        db_session.add(u)
        db_session.commit()
    token = emitir_token(usuario_id=u.id, rol="admin")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def client(db_session, admin_headers):
    global ADMIN
    ADMIN = admin_headers
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_sucursal_session] = lambda: db_session
    app.dependency_overrides[export_get_ahora] = lambda: AHORA_FIJO
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_sucursal_session, None)
    app.dependency_overrides.pop(export_get_ahora, None)


def _semilla(db_session):
    """Dentro y fuera del período por defecto (08/10/2026–06/11/2026)."""
    pac = Paciente(nombre="Paciente Viejo", dni="DNI-VIEJO", ficticio=True)
    pac2 = Paciente(nombre="Paciente Nuevo", dni="DNI-NUEVO", ficticio=True)
    prof = Profesional(nombre="Dr. A", matricula="MP-001")
    sill = SillonBox(nombre="Box 1")
    prest = Prestacion(nombre="Limpieza", duracion_min=30)
    db_session.add_all([pac, pac2, prof, sill, prest])
    db_session.flush()

    hc = HistoriaClinica(paciente_id=pac.id, antecedentes="ninguno")
    db_session.add(hc)
    db_session.flush()
    entrada = EntradaHC(
        historia_clinica_id=hc.id,
        profesional_id=prof.id,
        fecha=datetime(2026, 1, 5, tzinfo=ZONA),
        texto="control viejo",
    )
    db_session.add(entrada)

    inicio_in = datetime(2026, 11, 1, 10, 0, tzinfo=ZONA)
    inicio_out = datetime(2026, 10, 7, 10, 0, tzinfo=ZONA)
    turno_in = Turno(
        paciente_id=pac.id,
        profesional_id=prof.id,
        sillon_id=sill.id,
        prestacion_id=prest.id,
        inicio=inicio_in,
        fin=inicio_in + timedelta(hours=1),
    )
    turno_out = Turno(
        paciente_id=pac.id,
        profesional_id=prof.id,
        sillon_id=sill.id,
        prestacion_id=prest.id,
        inicio=inicio_out,
        fin=inicio_out + timedelta(hours=1),
    )
    caja_in = Caja(
        fecha=date(2026, 11, 1), monto_apertura_centavos=10000, estado="abierta"
    )
    caja_out = Caja(
        fecha=date(2026, 10, 1), monto_apertura_centavos=10000, estado="cerrada"
    )
    db_session.add_all([turno_in, turno_out, caja_in, caja_out])
    db_session.flush()

    cobro_in = Cobro(
        caja_id=caja_in.id,
        turno_id=turno_in.id,
        medio="efectivo",
        monto_centavos=15000,
        creado_en=datetime(2026, 11, 1, 12, 0, tzinfo=ZONA),
    )
    cobro_out = Cobro(
        caja_id=caja_out.id,
        medio="tarjeta",
        monto_centavos=20000,
        creado_en=datetime(2026, 10, 1, 12, 0, tzinfo=ZONA),
    )
    db_session.add_all([cobro_in, cobro_out])
    db_session.flush()

    liq_in = LiquidacionOS(
        cobro_id=cobro_in.id,
        nomenclador_codigo="OSDE-001",
        monto_total_centavos=15000,
        cobertura_centavos=10000,
        copago_centavos=5000,
        creado_en=datetime(2026, 11, 1, 13, 0, tzinfo=ZONA),
    )
    liq_out = LiquidacionOS(
        cobro_id=cobro_out.id,
        nomenclador_codigo="OSDE-002",
        monto_total_centavos=20000,
        cobertura_centavos=10000,
        copago_centavos=10000,
        creado_en=datetime(2026, 10, 1, 13, 0, tzinfo=ZONA),
    )
    db_session.add_all([liq_in, liq_out])
    db_session.flush()
    return {"turno_in": turno_in, "turno_out": turno_out}


def test_admin_200_contrato_y_contenido(client, db_session) -> None:
    _semilla(db_session)
    r = client.get("/export", headers=ADMIN)
    assert r.status_code == 200, r.text
    cd = r.headers["content-disposition"]
    assert re.match(
        r'^attachment; filename="export-turnos-20261106-\d{6}\.json"$', cd
    ), cd
    assert not r.content.startswith(b"\xef\xbb\xbf")  # sin BOM
    assert b'\n  "' in r.content  # indent=2
    data = r.json()
    assert set(data) == CLAVES_ENVELOPE
    assert data["contrato_version"] == "1.0"
    assert data["zona"] == "America/Argentina/Buenos_Aires"
    assert data["periodo"] == {
        "desde": "2026-10-08",
        "hasta": "2026-11-06",
        "dias": 30,
    }
    gen = datetime.fromisoformat(data["generado_en"])
    assert gen.tzinfo is not None and gen.utcoffset() is not None
    assert set(data["historia_clinica"]) == CLAVES_HC
    assert set(data["agenda"]) == CLAVES_AGENDA
    assert set(data["caja"]) == CLAVES_CAJA
    # Los 4 dominios con contenido
    assert {p["dni"] for p in data["pacientes"]} == {"DNI-VIEJO", "DNI-NUEVO"}
    assert data["historia_clinica"]["entradas"], "entradas vacías"
    assert data["agenda"]["turnos"], "turnos vacíos"
    assert data["caja"]["cobros"], "cobros vacíos"
    # Montos enteros (centavos)
    cobros = data["caja"]["cobros"]
    assert all(isinstance(c["monto_centavos"], int) for c in cobros)
    # Fechas ISO con offset
    assert "-" in data["agenda"]["turnos"][0]["inicio"]


def test_fuera_del_periodo_no_aparece_en_filtradas(client, db_session) -> None:
    rastro = _semilla(db_session)
    r = client.get("/export", headers=ADMIN)
    assert r.status_code == 200, r.text
    data = r.json()
    ids_turnos = {t["id"] for t in data["agenda"]["turnos"]}
    assert str(rastro["turno_in"].id) in ids_turnos
    assert str(rastro["turno_out"].id) not in ids_turnos
    fechas_cajas = {c["fecha"] for c in data["caja"]["cajas"]}
    assert "2026-11-01" in fechas_cajas
    assert "2026-10-01" not in fechas_cajas
    creados = sorted(c["creado_en"][:10] for c in data["caja"]["cobros"])
    assert creados == ["2026-11-01"]
    creados_liq = sorted(
        c["creado_en"][:10] for c in data["caja"]["liquidaciones_os"]
    )
    assert creados_liq == ["2026-11-01"]


def test_maestros_completos_aun_fuera_del_periodo(client, db_session) -> None:
    _semilla(db_session)
    r = client.get("/export", headers=ADMIN)
    data = r.json()
    # Historia clínica sin filtro: la entrada es de enero y aparece igual.
    assert any(
        e["fecha"][:10] == "2026-01-05"
        for e in data["historia_clinica"]["entradas"]
    )
    assert {p["dni"] for p in data["pacientes"]} == {"DNI-VIEJO", "DNI-NUEVO"}
    assert data["agenda"]["profesionales"], "profesionales incompletos"
    assert data["agenda"]["sillones"], "sillones incompletos"
    assert data["agenda"]["prestaciones"], "prestaciones incompletas"


def test_envelope_completo_aun_vacio(client) -> None:
    r = client.get("/export", headers=ADMIN)
    assert r.status_code == 200, r.text
    data = r.json()
    assert set(data) == CLAVES_ENVELOPE
    assert data["pacientes"] == []
    assert data["agenda"] == {
        "turnos": [],
        "profesionales": [],
        "sillones": [],
        "prestaciones": [],
    }
    assert data["caja"] == {
        "cajas": [],
        "cobros": [],
        "liquidaciones_os": [],
    }


def test_borde_desde_incluye_08_10(client, db_session) -> None:
    rastro = _semilla(db_session)
    turno_borde = Turno(
        paciente_id=db_session.query(Paciente).first().id,
        profesional_id=db_session.query(Profesional).first().id,
        sillon_id=db_session.query(SillonBox).first().id,
        prestacion_id=db_session.query(Prestacion).first().id,
        inicio=datetime(2026, 10, 8, 0, 0, tzinfo=ZONA),
        fin=datetime(2026, 10, 8, 1, 0, tzinfo=ZONA),
    )
    assert rastro is not None
    db_session.add(turno_borde)
    db_session.flush()
    r = client.get("/export", headers=ADMIN)
    ids = {t["id"] for t in r.json()["agenda"]["turnos"]}
    assert str(turno_borde.id) in ids


def test_rango_exactamente_30_dias_da_200(client, db_session) -> None:
    _semilla(db_session)
    r = client.get(
        "/export?desde=2026-10-08&hasta=2026-11-06", headers=ADMIN
    )
    assert r.status_code == 200, r.text


def test_rango_31_dias_da_422(client) -> None:
    r = client.get("/export?desde=2026-10-07&hasta=2026-11-06", headers=ADMIN)
    assert r.status_code == 422, r.text


def test_rango_invertido_da_422(client) -> None:
    r = client.get("/export?desde=2026-11-06&hasta=2026-11-01", headers=ADMIN)
    assert r.status_code == 422, r.text


def test_periodo_personalizado_10_dias(client, db_session) -> None:
    _semilla(db_session)
    r = client.get("/export?desde=2026-10-01&hasta=2026-10-10", headers=ADMIN)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["periodo"] == {
        "desde": "2026-10-01",
        "hasta": "2026-10-10",
        "dias": 10,
    }
    fechas = {c["fecha"] for c in data["caja"]["cajas"]}
    assert fechas == {"2026-10-01"}


@pytest.mark.parametrize("rol", ["recepcion", "odontologo", "paciente"])
def test_roles_no_admin_dan_403(client, db_session, rol: str) -> None:
    rol_obj = db_session.query(Rol).filter_by(nombre=rol).first()
    if not rol_obj:
        rol_obj = Rol(nombre=rol)
        db_session.add(rol_obj)
        db_session.flush()
    u = db_session.query(Usuario).filter_by(dni=f"88888{rol[:3]}").first()
    if not u:
        u = Usuario(
            dni=f"88888{rol[:3]}",
            password_hash=hashear_password("pwd"),
            rol_id=rol_obj.id,
            activo=True,
        )
        db_session.add(u)
        db_session.commit()
    token = emitir_token(usuario_id=u.id, rol=rol)
    r = client.get("/export", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["causa"] == "permiso_denegado"


def test_sin_header_da_401_token_ausente(client) -> None:
    r = client.get("/export")
    assert r.status_code == 401, r.text
    assert r.json()["detail"]["causa"] == "token_ausente"


def test_sin_secretos_en_la_respuesta(client, db_session) -> None:
    _semilla(db_session)
    texto = client.get("/export", headers=ADMIN).text.lower()
    for secreto in ("secret_key", "mp_access_token", "arca", "bearer", "password_hash"):
        assert secreto not in texto


def test_export_no_incluye_usuarios(client, db_session) -> None:
    """Verificación de tarea 5.3: GET /export no debe incluir la tabla de usuarios."""
    _semilla(db_session)
    data = client.get("/export", headers=ADMIN).json()
    assert "usuarios" not in data
    # Ni en ninguna de las secciones
    for seccion in ("pacientes", "historia_clinica", "agenda", "caja"):
        if isinstance(data.get(seccion), dict):
            assert "usuarios" not in data[seccion]
