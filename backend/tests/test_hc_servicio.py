"""Servicio HC (C-09, fase 4)."""

from datetime import UTC, datetime

import pytest

from backend.app.agenda.models import Paciente, Prestacion, Profesional
from backend.app.hc.service import (
    HistoriaDuplicada,
    PlanNoEditable,
    ServicioHC,
)
from backend.app.seed.catalogo import seed_catalogo

pytestmark = pytest.mark.integration


def _ids(db_session):
    seed_catalogo(db_session)
    return {
        "paciente": db_session.query(Paciente).filter_by(dni="DNI-FICT-001").one().id,
        "profesional": db_session.query(Profesional).filter_by(matricula="MAT-FICT-001").one().id,
        "prestacion": db_session.query(Prestacion).filter_by(nombre="Consulta").one().id,
    }


def test_hc_duplicada(db_session):
    ids = _ids(db_session)
    ServicioHC.crear_historia(db_session, ids["paciente"], antecedentes="a")
    with pytest.raises(HistoriaDuplicada):
        ServicioHC.crear_historia(db_session, ids["paciente"])


def test_patch_parcial(db_session):
    ids = _ids(db_session)
    hc = ServicioHC.crear_historia(
        db_session, ids["paciente"], antecedentes="ant", alergias="alg"
    )
    db_session.flush()
    ServicioHC.actualizar_historia(
        db_session, hc.id, {"alergias": "nueva"}
    )
    db_session.flush()
    rec = ServicioHC.obtener_historia(db_session, hc.id)
    assert rec.alergias == "nueva"
    assert rec.antecedentes == "ant"


def test_patch_vacio(db_session):
    ids = _ids(db_session)
    hc = ServicioHC.crear_historia(
        db_session, ids["paciente"], antecedentes="ant", alergias="alg"
    )
    db_session.flush()
    ServicioHC.actualizar_historia(db_session, hc.id, {})
    db_session.flush()
    rec = ServicioHC.obtener_historia(db_session, hc.id)
    assert rec.antecedentes == "ant"
    assert rec.alergias == "alg"


def test_alta_entrada(db_session):
    ids = _ids(db_session)
    hc = ServicioHC.crear_historia(db_session, ids["paciente"])
    db_session.flush()
    e = ServicioHC.agregar_entrada(
        db_session, hc.id, ids["profesional"],
        datetime.now(UTC), "texto",
    )
    db_session.flush()
    assert e.texto == "texto"
    assert ServicioHC.obtener_historia(db_session, hc.id).antecedentes is None


def test_entradas_ordenadas(db_session):
    ids = _ids(db_session)
    hc = ServicioHC.crear_historia(db_session, ids["paciente"])
    db_session.flush()
    f1 = datetime(2026, 1, 1, tzinfo=UTC)
    f3 = datetime(2026, 3, 1, tzinfo=UTC)
    f2 = datetime(2026, 2, 1, tzinfo=UTC)
    ServicioHC.agregar_entrada(db_session, hc.id, ids["profesional"], f3, "c")
    ServicioHC.agregar_entrada(db_session, hc.id, ids["profesional"], f1, "a")
    ServicioHC.agregar_entrada(db_session, hc.id, ids["profesional"], f2, "b")
    db_session.flush()
    entradas = ServicioHC.listar_entradas(db_session, hc.id)
    assert [e.texto for e in entradas] == ["a", "b", "c"]


def test_odontograma_historial(db_session):
    ids = _ids(db_session)
    f1 = datetime(2026, 1, 10, tzinfo=UTC)
    f2 = datetime(2026, 2, 15, tzinfo=UTC)
    prof2_id = ids["profesional"]
    ServicioHC.registrar_odontograma(
        db_session, ids["paciente"], "16", "sano", ids["profesional"], f1
    )
    # segundo profesional: usar el mismo (no hay segundo en seed) -> ok, historial igual
    ServicioHC.registrar_odontograma(
        db_session, ids["paciente"], "16", "cariado", ids["profesional"], f2
    )
    db_session.flush()
    hist = ServicioHC.listar_odontograma(db_session, ids["paciente"], pieza="16")
    assert len(hist) == 2
    assert [h.estado for h in hist] == ["sano", "cariado"]
    assert all(h.profesional_id == prof2_id for h in hist)


def test_odontograma_vacio(db_session):
    ids = _ids(db_session)
    assert ServicioHC.listar_odontograma(db_session, ids["paciente"]) == []


def test_total_presupuesto(db_session):
    ids = _ids(db_session)
    plan = ServicioHC.crear_plan(
        db_session, ids["paciente"], ids["profesional"]
    )
    db_session.flush()
    ServicioHC.agregar_item(
        db_session, plan.id, "16", ids["prestacion"], monto_centavos=1500000
    )
    ServicioHC.agregar_item(
        db_session, plan.id, "26", ids["prestacion"], monto_centavos=2500000
    )
    db_session.flush()
    p = ServicioHC.obtener_plan(db_session, plan.id)
    assert p.total_centavos == 4000000


def test_total_sin_items(db_session):
    ids = _ids(db_session)
    plan = ServicioHC.crear_plan(
        db_session, ids["paciente"], ids["profesional"]
    )
    db_session.flush()
    p = ServicioHC.obtener_plan(db_session, plan.id)
    assert p.total_centavos == 0
    assert p.items == []


def test_total_se_actualiza(db_session):
    ids = _ids(db_session)
    plan = ServicioHC.crear_plan(
        db_session, ids["paciente"], ids["profesional"]
    )
    db_session.flush()
    ServicioHC.agregar_item(
        db_session, plan.id, "16", ids["prestacion"], monto_centavos=1000000
    )
    db_session.flush()
    ServicioHC.agregar_item(
        db_session, plan.id, "26", ids["prestacion"], monto_centavos=500000
    )
    db_session.flush()
    p = ServicioHC.obtener_plan(db_session, plan.id)
    assert p.total_centavos == 1500000


def test_cobertura_snapshot(db_session):
    ids = _ids(db_session)
    plan = ServicioHC.crear_plan(
        db_session, ids["paciente"], ids["profesional"]
    )
    db_session.flush()
    ServicioHC.agregar_item(
        db_session, plan.id, "16", ids["prestacion"],
        monto_centavos=1000000, monto_cobertura_centavos=750000,
    )
    db_session.flush()
    p = ServicioHC.obtener_plan(db_session, plan.id)
    assert p.items[0].monto_cobertura_centavos == 750000
    assert p.cobertura_centavos == 750000


def test_plan_no_editable(db_session):
    ids = _ids(db_session)
    plan = ServicioHC.crear_plan(
        db_session, ids["paciente"], ids["profesional"]
    )
    db_session.flush()
    ServicioHC.actualizar_plan(db_session, plan.id, "cerrado")
    db_session.flush()
    with pytest.raises(PlanNoEditable):
        ServicioHC.agregar_item(
            db_session, plan.id, "16", ids["prestacion"], monto_centavos=100
        )


def test_listado_planes_orden(db_session):
    ids = _ids(db_session)
    p1 = ServicioHC.crear_plan(db_session, ids["paciente"], ids["profesional"])
    db_session.flush()
    p2 = ServicioHC.crear_plan(db_session, ids["paciente"], ids["profesional"])
    db_session.flush()
    ServicioHC.agregar_item(
        db_session, p1.id, "16", ids["prestacion"], monto_centavos=1500000
    )
    ServicioHC.agregar_item(
        db_session, p2.id, "26", ids["prestacion"], monto_centavos=2500000
    )
    db_session.flush()
    planes = ServicioHC.listar_planes_por_paciente(db_session, ids["paciente"])
    assert [p.id for p in planes] == [p1.id, p2.id]
    assert planes[0].total_centavos == 1500000
    assert planes[1].total_centavos == 2500000


def test_listado_planes_totales(db_session):
    ids = _ids(db_session)
    plan = ServicioHC.crear_plan(db_session, ids["paciente"], ids["profesional"])
    db_session.flush()
    ServicioHC.agregar_item(
        db_session, plan.id, "16", ids["prestacion"],
        monto_centavos=1000, monto_cobertura_centavos=None,
    )
    db_session.flush()
    planes = ServicioHC.listar_planes_por_paciente(db_session, ids["paciente"])
    assert planes[0].cobertura_centavos == 0
    assert planes[0].items[0].monto_cobertura_centavos is None