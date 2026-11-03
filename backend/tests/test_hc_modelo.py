"""Modelo clínico: invariantes de esquema (C-09, fase 1)."""

from datetime import UTC

import pytest
from sqlalchemy.exc import IntegrityError

from backend.app.agenda.models import Paciente
from backend.app.hc.models import HistoriaClinica
from backend.app.seed.catalogo import seed_catalogo

pytestmark = pytest.mark.integration


def _ids(db_session):
    seed_catalogo(db_session)
    return {
        "paciente": db_session.query(Paciente).filter_by(dni="DNI-FICT-001").one().id,
    }


def test_historia_clinica_paciente_unico(db_session):
    ids = _ids(db_session)
    db_session.add(HistoriaClinica(paciente_id=ids["paciente"], antecedentes="ant"))
    db_session.flush()

    db_session.add(HistoriaClinica(paciente_id=ids["paciente"]))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_entrada_hc_restrict(db_session):
    ids = _ids(db_session)
    hc = HistoriaClinica(paciente_id=ids["paciente"])
    db_session.add(hc)
    db_session.flush()

    from backend.app.agenda.models import Profesional

    prof = db_session.query(Profesional).filter_by(matricula="MAT-FICT-001").one()
    from datetime import datetime

    from backend.app.hc.models import EntradaHC

    db_session.add(
        EntradaHC(
            historia_clinica_id=hc.id,
            profesional_id=prof.id,
            fecha=datetime.now(UTC),
            texto="nota",
        )
    )
    db_session.flush()

    # RESTRICT: borrar la HC con entradas debe fallar
    db_session.delete(hc)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_odontograma_append_only_y_fdi(db_session):
    ids = _ids(db_session)
    from datetime import datetime

    from backend.app.agenda.models import Profesional
    from backend.app.hc.models import Odontograma

    prof = db_session.query(Profesional).filter_by(matricula="MAT-FICT-001").one()
    fecha = datetime(2026, 1, 10, 10, 0, tzinfo=UTC)

    o1 = Odontograma(
        paciente_id=ids["paciente"], pieza="16", estado="sano",
        profesional_id=prof.id, fecha=fecha,
    )
    o2 = Odontograma(
        paciente_id=ids["paciente"], pieza="16", estado="cariado",
        profesional_id=prof.id, fecha=fecha,
    )
    db_session.add_all([o1, o2])
    db_session.flush()  # dos filas coexisten (append-only)

    # pieza fuera de rango falla por CHECK
    bad = Odontograma(
        paciente_id=ids["paciente"], pieza="19", estado="sano",
        profesional_id=prof.id, fecha=fecha,
    )
    db_session.add(bad)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_plan_item_cascade_y_montos(db_session):
    ids = _ids(db_session)
    from backend.app.agenda.models import Prestacion, Profesional
    from backend.app.hc.models import PlanItem, PlanTratamiento

    prof = db_session.query(Profesional).filter_by(matricula="MAT-FICT-001").one()
    prest = db_session.query(Prestacion).filter_by(nombre="Consulta").one()

    plan = PlanTratamiento(paciente_id=ids["paciente"], profesional_id=prof.id)
    db_session.add(plan)
    db_session.flush()

    item = PlanItem(
        plan_id=plan.id, pieza="16", prestacion_id=prest.id,
        monto_centavos=1000,
    )
    db_session.add(item)
    db_session.flush()

    # CASCADE: borrar el plan borra el item
    db_session.delete(plan)
    db_session.flush()
    assert db_session.query(PlanItem).count() == 0

    # monto negativo falla por CHECK
    plan2 = PlanTratamiento(paciente_id=ids["paciente"], profesional_id=prof.id)
    db_session.add(plan2)
    db_session.flush()
    bad = PlanItem(
        plan_id=plan2.id, pieza="16", prestacion_id=prest.id,
        monto_centavos=-1,
    )
    db_session.add(bad)
    with pytest.raises(IntegrityError):
        db_session.flush()