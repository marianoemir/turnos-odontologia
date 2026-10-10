"""ServicioTurnos.crear/validar (C-03, tasks 3.1-3.7). Solo ficticios.

Orden de validacion congelado (design): 1) schema/tipos 422;
2) FKs 404/422; 3) sillon activo 422; 4) horario 409; 5) bloqueo 409;
6) solape profesional 409; 7) solape sillon 409; 8) 201 pendiente.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from backend.app.agenda.models import (
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
)
from backend.app.seed.catalogo import seed_catalogo
from backend.app.turnos.models import Turno
from backend.app.turnos.service import (
    ConflictoTurno,
    ServicioTurnos,
    TurnoInvalido,
    TurnoNoEncontrado,
)

pytestmark = pytest.mark.integration

TZ = ZoneInfo("America/Argentina/Buenos_Aires")
# Lunes 2026-10-12 (seed: Lun-Vie 9-18), lejos del bloqueo 24-26 dic.
LUNES_10 = datetime(2026, 10, 12, 10, 0, tzinfo=TZ)


def _ids(db_session):
    seed_catalogo(db_session)
    return {
        "paciente": db_session.query(Paciente)
        .filter_by(dni="DNI-FICT-001")
        .one()
        .id,
        "profesional": db_session.query(Profesional)
        .filter_by(matricula="MAT-FICT-001")
        .one()
        .id,
        "profesional2": db_session.query(Profesional)
        .filter_by(matricula="MAT-FICT-002")
        .one()
        .id,
        "sillon": db_session.query(SillonBox)
        .filter_by(nombre="Sillon 1")
        .one()
        .id,
        "sillon2": db_session.query(SillonBox)
        .filter_by(nombre="Sillon 2")
        .one()
        .id,
        "consulta30": db_session.query(Prestacion)
        .filter_by(nombre="Consulta")
        .one()
        .id,
        "limpieza20": db_session.query(Prestacion)
        .filter_by(nombre="Limpieza")
        .one()
        .id,
    }


def _crear(db_session, ids, inicio=LUNES_10, **mas):
    kwargs = {
        "paciente_id": ids["paciente"],
        "profesional_id": ids["profesional"],
        "sillon_id": ids["sillon"],
        "prestacion_id": ids["consulta30"],
        "inicio": inicio,
    }
    kwargs.update(mas)
    return ServicioTurnos.crear(db_session, **kwargs)


def test_fin_igual_inicio_mas_duracion(db_session):
    ids = _ids(db_session)

    turno = _crear(db_session, ids)

    assert turno.fin == datetime(2026, 10, 12, 10, 30, tzinfo=TZ)
    assert turno.estado == "pendiente"


def test_fin_usa_duracion_de_cada_prestacion(db_session):
    ids = _ids(db_session)

    turno = _crear(
        db_session, ids, prestacion_id=ids["limpieza20"]
    )

    assert turno.fin == datetime(2026, 10, 12, 10, 20, tzinfo=TZ)


def test_solape_profesional_parcial_da_409(db_session):
    ids = _ids(db_session)
    _crear(db_session, ids)  # P en sillon A, 10:00-10:30

    with pytest.raises(ConflictoTurno) as exc:
        _crear(
            db_session,
            ids,
            inicio=datetime(2026, 10, 12, 10, 15, tzinfo=TZ),
            sillon_id=ids["sillon2"],
        )

    assert exc.value.causa == "profesional"
    assert exc.value.detalle


def test_solape_profesional_contenido_total_da_409(db_session):
    ids = _ids(db_session)
    _crear(db_session, ids)  # 10:00-10:30

    with pytest.raises(ConflictoTurno) as exc:
        _crear(
            db_session,
            ids,
            inicio=datetime(2026, 10, 12, 9, 45, tzinfo=TZ),
            sillon_id=ids["sillon2"],
        )

    assert exc.value.causa == "profesional"


def test_adyacencia_exacta_inicio_igual_fin_da_201(db_session):
    ids = _ids(db_session)
    _crear(db_session, ids)  # 10:00-10:30

    turno = _crear(
        db_session,
        ids,
        inicio=datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
    )

    assert turno.estado == "pendiente"
    assert turno.fin == datetime(2026, 10, 12, 11, 0, tzinfo=TZ)
    assert db_session.query(Turno).count() == 2


def test_solape_sillon_otro_profesional_da_409(db_session):
    ids = _ids(db_session)
    _crear(db_session, ids)  # P1 en sillon A, 10:00-10:30

    with pytest.raises(ConflictoTurno) as exc:
        _crear(
            db_session,
            ids,
            profesional_id=ids["profesional2"],
            inicio=datetime(2026, 10, 12, 10, 15, tzinfo=TZ),
        )

    assert exc.value.causa == "sillon"
    assert exc.value.detalle


def test_mismo_profesional_y_sillon_reporta_profesional(db_session):
    # Orden congelado: paso 6 (profesional) antes que paso 7 (sillon).
    ids = _ids(db_session)
    _crear(db_session, ids)  # P en sillon A, 10:00-10:30

    with pytest.raises(ConflictoTurno) as exc:
        _crear(
            db_session,
            ids,
            inicio=datetime(2026, 10, 12, 9, 45, tzinfo=TZ),
        )

    assert exc.value.causa == "profesional"


def test_sabado_fuera_de_horario_da_409(db_session):
    ids = _ids(db_session)

    with pytest.raises(ConflictoTurno) as exc:
        _crear(
            db_session,
            ids,
            inicio=datetime(2026, 10, 10, 10, 0, tzinfo=TZ),  # sabado
        )

    assert exc.value.causa == "horario"
    assert exc.value.detalle


def test_lunes_1830_fuera_de_horario_da_409(db_session):
    ids = _ids(db_session)

    with pytest.raises(ConflictoTurno) as exc:
        _crear(
            db_session,
            ids,
            inicio=datetime(2026, 10, 12, 18, 30, tzinfo=TZ),
        )

    assert exc.value.causa == "horario"


def test_horario_precede_a_solape(db_session):
    from sqlalchemy import text as _text

    ids = _ids(db_session)
    # Turno activo fuera de horario creado por via directa (bypass):
    # el nuevo pedido solapa Y esta fuera de horario -> manda horario.
    db_session.execute(
        _text(
            "INSERT INTO turnos (id, paciente_id, profesional_id, "
            "sillon_id, prestacion_id, inicio, fin, estado) "
            "VALUES (gen_random_uuid(), :pac, :prof, :sil, :pres, "
            ":inicio, :fin, 'pendiente')"
        ),
        {
            "pac": ids["paciente"],
            "prof": ids["profesional"],
            "sil": ids["sillon"],
            "pres": ids["consulta30"],
            "inicio": datetime(2026, 10, 12, 18, 0, tzinfo=TZ),
            "fin": datetime(2026, 10, 12, 18, 30, tzinfo=TZ),
        },
    )
    db_session.flush()

    with pytest.raises(ConflictoTurno) as exc:
        _crear(
            db_session,
            ids,
            inicio=datetime(2026, 10, 12, 18, 0, tzinfo=TZ),
        )

    assert exc.value.causa == "horario"


def test_bloqueo_global_da_409(db_session):
    ids = _ids(db_session)

    with pytest.raises(ConflictoTurno) as exc:
        _crear(
            db_session,
            ids,
            inicio=datetime(2026, 12, 25, 10, 0, tzinfo=TZ),  # viernes
        )

    assert exc.value.causa == "bloqueo"
    assert exc.value.detalle


def test_bloqueo_solo_sillon_no_aplica_a_otro_sillon(db_session):
    from backend.app.agenda.models import Bloqueo as _Bloqueo

    ids = _ids(db_session)
    db_session.add(
        _Bloqueo(
            profesional_id=None,
            sillon_id=ids["sillon"],
            desde=datetime(2026, 10, 19, 10, 0, tzinfo=TZ),  # lunes
            hasta=datetime(2026, 10, 19, 10, 30, tzinfo=TZ),
            motivo="mantenimiento ficticio sillon 1",
        )
    )
    db_session.flush()

    turno = _crear(
        db_session,
        ids,
        inicio=datetime(2026, 10, 19, 10, 0, tzinfo=TZ),
        sillon_id=ids["sillon2"],
    )

    assert turno.estado == "pendiente"


def test_sillon_inactivo_da_422(db_session):
    ids = _ids(db_session)
    db_session.query(SillonBox).filter_by(id=ids["sillon"]).update(
        {"activo": False}
    )
    db_session.flush()

    with pytest.raises(TurnoInvalido) as exc:
        _crear(db_session, ids)

    assert exc.value.detalle
    assert db_session.query(Turno).count() == 0


def test_profesional_inexistente_da_404(db_session):
    import uuid as _uuid

    ids = _ids(db_session)

    with pytest.raises(TurnoNoEncontrado) as exc:
        _crear(
            db_session, ids, profesional_id=_uuid.uuid4()
        )

    assert exc.value.recurso == "profesional"
    assert db_session.query(Turno).count() == 0


def test_inicio_naive_da_422(db_session):
    ids = _ids(db_session)

    with pytest.raises(TurnoInvalido):
        _crear(
            db_session,
            ids,
            inicio=datetime(2026, 10, 12, 10, 0),  # noqa: DTZ001
        )

    assert db_session.query(Turno).count() == 0


def test_cancelado_libera_el_slot_da_201(db_session):
    from sqlalchemy import text as _text

    ids = _ids(db_session)
    # Seed intacto: el turno cancelado se crea DENTRO del test.
    db_session.execute(
        _text(
            "INSERT INTO turnos (id, paciente_id, profesional_id, "
            "sillon_id, prestacion_id, inicio, fin, estado) "
            "VALUES (gen_random_uuid(), :pac, :prof, :sil, :pres, "
            ":inicio, :fin, 'cancelado')"
        ),
        {
            "pac": ids["paciente"],
            "prof": ids["profesional"],
            "sil": ids["sillon"],
            "pres": ids["consulta30"],
            "inicio": LUNES_10,
            "fin": datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
        },
    )
    db_session.flush()

    turno = _crear(db_session, ids)

    assert turno.estado == "pendiente"
    assert db_session.query(Turno).count() == 2


def test_ausente_libera_el_slot_da_201(db_session):
    from sqlalchemy import text as _text

    ids = _ids(db_session)
    db_session.execute(
        _text(
            "INSERT INTO turnos (id, paciente_id, profesional_id, "
            "sillon_id, prestacion_id, inicio, fin, estado) "
            "VALUES (gen_random_uuid(), :pac, :prof, :sil, :pres, "
            ":inicio, :fin, 'ausente')"
        ),
        {
            "pac": ids["paciente"],
            "prof": ids["profesional"],
            "sil": ids["sillon"],
            "pres": ids["consulta30"],
            "inicio": LUNES_10,
            "fin": datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
        },
    )
    db_session.flush()

    turno = _crear(db_session, ids)

    assert turno.estado == "pendiente"


def test_409_no_crea_nada(db_session):
    ids = _ids(db_session)
    _crear(db_session, ids)  # turno base 10:00-10:30
    assert db_session.query(Turno).count() == 1

    casos_409 = [
        # solape profesional
        {
            "inicio": datetime(2026, 10, 12, 10, 15, tzinfo=TZ),
            "sillon_id": ids["sillon2"],
        },
        # solape sillon con otro profesional
        {
            "profesional_id": ids["profesional2"],
            "inicio": datetime(2026, 10, 12, 10, 15, tzinfo=TZ),
        },
        # fuera de horario (sabado)
        {"inicio": datetime(2026, 10, 10, 10, 0, tzinfo=TZ)},
        # sobre bloqueo global del seed
        {"inicio": datetime(2026, 12, 25, 10, 0, tzinfo=TZ)},
    ]
    for caso in casos_409:
        with pytest.raises(ConflictoTurno):
            _crear(db_session, ids, **caso)
        assert db_session.query(Turno).count() == 1
