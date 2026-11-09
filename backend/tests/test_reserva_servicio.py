"""ServicioReservaOnline.slots (C-08, task 2.1 RED). Solo datos ficticios.

Contrato esperado por estos tests RED:
- ServicioReservaOnline.slots(session, profesional_id=..., prestacion_id=..., fecha=date(...))
  -> lista de dicts ordenada ascendente, cada elemento con exactamente
  {inicio, fin} (sin nombre/dni/contacto/sillon_id/paciente_id), con
  fin = inicio + duracion de la prestacion.
- Slots enumerados desde HorarioAtencion activos con paso = duracion_min
  alineado a `desde` (D2). Seed: Lun-Vie 9-18, Consulta 30 min.
- Turnos activos (pendiente/confirmado) y bloqueos aplicables excluyen;
  cancelado/ausente no (RN-TU-01). Slot ofrecido solo si al menos un
  sillon activo lo permite (D5).
"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import text

from backend.app.agenda.models import (
    Bloqueo,
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
)
from backend.app.rbac.models import Sucursal  # noqa: F401 (registra sucursales para FKs)
from backend.app.seed.catalogo import seed_catalogo
from backend.app.turnos.models import Turno

pytestmark = pytest.mark.integration

TZ = ZoneInfo("America/Argentina/Buenos_Aires")
# Lunes futuro: evita filtro de slots pasados (D8) y el bloqueo global del
# seed (24-26 dic, año distinto). Sabado sin horario en el seed.
FECHA_LUNES = date(2030, 1, 7)
FECHA_SABADO = date(2030, 1, 12)


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
    }


def _insertar_turno(
    db_session,
    ids,
    *,
    estado,
    inicio,
    fin,
    profesional_id=None,
    sillon_id=None,
):
    """Inserta un turno en un estado arbitrario sin pasar por el servicio."""
    nuevo_id = db_session.execute(
        text(
            "INSERT INTO turnos (id, paciente_id, profesional_id, "
            "sillon_id, prestacion_id, inicio, fin, estado) "
            "VALUES (gen_random_uuid(), :pac, :prof, :sil, :pres, "
            ":inicio, :fin, :estado) RETURNING id"
        ),
        {
            "pac": ids["paciente"],
            "prof": profesional_id or ids["profesional"],
            "sil": sillon_id or ids["sillon"],
            "pres": ids["consulta30"],
            "inicio": inicio,
            "fin": fin,
            "estado": estado,
        },
    ).scalar_one()
    db_session.flush()
    return db_session.get(Turno, nuevo_id)


def _slots(db_session, ids, fecha=FECHA_LUNES):
    from backend.app.reserva_online.service import ServicioReservaOnline

    return ServicioReservaOnline.slots(
        db_session,
        profesional_id=ids["profesional"],
        prestacion_id=ids["consulta30"],
        fecha=fecha,
    )


def _inicios(slots):
    return [s["inicio"] for s in slots]


def _assert_forma(slots):
    # Cada elemento: exactamente {inicio, fin}, sin datos de terceros.
    for s in slots:
        assert set(s.keys()) == {"inicio", "fin"}
        assert "nombre" not in s
        assert "dni" not in s
        assert "contacto" not in s
        assert "sillon_id" not in s
        assert "paciente_id" not in s


def _slot(inicio, fin):
    return {"inicio": inicio, "fin": fin}


def test_slots_dia_laboral_libre(db_session):
    """Slots libres de un dia laboral: 9-18 con Consulta 30 -> 18 slots."""
    ids = _ids(db_session)

    slots = _slots(db_session, ids, FECHA_LUNES)

    _assert_forma(slots)
    assert len(slots) == 18
    assert slots[0] == _slot(
        datetime(2030, 1, 7, 9, 0, tzinfo=TZ),
        datetime(2030, 1, 7, 9, 30, tzinfo=TZ),
    )
    assert slots[1] == _slot(
        datetime(2030, 1, 7, 9, 30, tzinfo=TZ),
        datetime(2030, 1, 7, 10, 0, tzinfo=TZ),
    )
    assert slots[2] == _slot(
        datetime(2030, 1, 7, 10, 0, tzinfo=TZ),
        datetime(2030, 1, 7, 10, 30, tzinfo=TZ),
    )
    assert slots[-1] == _slot(
        datetime(2030, 1, 7, 17, 30, tzinfo=TZ),
        datetime(2030, 1, 7, 18, 0, tzinfo=TZ),
    )
    inicios = _inicios(slots)
    assert inicios == sorted(inicios)
    for s in slots:
        assert s["fin"] - s["inicio"] == timedelta(minutes=30)


def test_slots_dia_sin_horario_devuelve_vacio(db_session):
    """Dia sin horario devuelve vacio: sabado sin HorarioAtencion."""
    ids = _ids(db_session)

    slots = _slots(db_session, ids, FECHA_SABADO)

    assert slots == []


def test_slots_excluye_turno_activo(db_session):
    """Slot ocupado no se ofrece: turno pendiente 10:00-10:30 no aparece."""
    ids = _ids(db_session)
    _insertar_turno(
        db_session,
        ids,
        estado="pendiente",
        inicio=datetime(2030, 1, 7, 10, 0, tzinfo=TZ),
        fin=datetime(2030, 1, 7, 10, 30, tzinfo=TZ),
    )

    slots = _slots(db_session, ids, FECHA_LUNES)

    _assert_forma(slots)
    assert len(slots) == 17
    inicios = _inicios(slots)
    assert datetime(2030, 1, 7, 10, 0, tzinfo=TZ) not in inicios
    assert _slot(
        datetime(2030, 1, 7, 9, 30, tzinfo=TZ),
        datetime(2030, 1, 7, 10, 0, tzinfo=TZ),
    ) in slots
    assert _slot(
        datetime(2030, 1, 7, 10, 30, tzinfo=TZ),
        datetime(2030, 1, 7, 11, 0, tzinfo=TZ),
    ) in slots
    assert slots[0] == _slot(
        datetime(2030, 1, 7, 9, 0, tzinfo=TZ),
        datetime(2030, 1, 7, 9, 30, tzinfo=TZ),
    )
    assert slots[-1] == _slot(
        datetime(2030, 1, 7, 17, 30, tzinfo=TZ),
        datetime(2030, 1, 7, 18, 0, tzinfo=TZ),
    )


def test_slots_excluye_bloqueo(db_session):
    """Bloqueo excluye slots: bloqueo 14:00-15:00 quita 14:00 y 14:30."""
    ids = _ids(db_session)
    db_session.add(
        Bloqueo(
            profesional_id=ids["profesional"],
            sillon_id=None,
            desde=datetime(2030, 1, 7, 14, 0, tzinfo=TZ),
            hasta=datetime(2030, 1, 7, 15, 0, tzinfo=TZ),
            motivo="bloqueo ficticio de prueba",
        )
    )
    db_session.flush()

    slots = _slots(db_session, ids, FECHA_LUNES)

    _assert_forma(slots)
    assert len(slots) == 16
    inicios = _inicios(slots)
    assert datetime(2030, 1, 7, 14, 0, tzinfo=TZ) not in inicios
    assert datetime(2030, 1, 7, 14, 30, tzinfo=TZ) not in inicios
    assert _slot(
        datetime(2030, 1, 7, 13, 30, tzinfo=TZ),
        datetime(2030, 1, 7, 14, 0, tzinfo=TZ),
    ) in slots
    assert _slot(
        datetime(2030, 1, 7, 15, 0, tzinfo=TZ),
        datetime(2030, 1, 7, 15, 30, tzinfo=TZ),
    ) in slots
    assert slots[0] == _slot(
        datetime(2030, 1, 7, 9, 0, tzinfo=TZ),
        datetime(2030, 1, 7, 9, 30, tzinfo=TZ),
    )
    assert slots[-1] == _slot(
        datetime(2030, 1, 7, 17, 30, tzinfo=TZ),
        datetime(2030, 1, 7, 18, 0, tzinfo=TZ),
    )


def test_slots_cancelado_no_excluye(db_session):
    """RN-TU-01: cancelado no excluye el slot 10:00."""
    ids = _ids(db_session)
    _insertar_turno(
        db_session,
        ids,
        estado="cancelado",
        inicio=datetime(2030, 1, 7, 10, 0, tzinfo=TZ),
        fin=datetime(2030, 1, 7, 10, 30, tzinfo=TZ),
    )

    slots = _slots(db_session, ids, FECHA_LUNES)

    _assert_forma(slots)
    assert len(slots) == 18
    assert _slot(
        datetime(2030, 1, 7, 10, 0, tzinfo=TZ),
        datetime(2030, 1, 7, 10, 30, tzinfo=TZ),
    ) in slots
    assert slots[0] == _slot(
        datetime(2030, 1, 7, 9, 0, tzinfo=TZ),
        datetime(2030, 1, 7, 9, 30, tzinfo=TZ),
    )
    assert slots[-1] == _slot(
        datetime(2030, 1, 7, 17, 30, tzinfo=TZ),
        datetime(2030, 1, 7, 18, 0, tzinfo=TZ),
    )


def test_slots_ausente_no_excluye(db_session):
    """RN-TU-01: ausente no excluye el slot 10:00."""
    ids = _ids(db_session)
    _insertar_turno(
        db_session,
        ids,
        estado="ausente",
        inicio=datetime(2030, 1, 7, 10, 0, tzinfo=TZ),
        fin=datetime(2030, 1, 7, 10, 30, tzinfo=TZ),
    )

    slots = _slots(db_session, ids, FECHA_LUNES)

    _assert_forma(slots)
    assert len(slots) == 18
    assert _slot(
        datetime(2030, 1, 7, 10, 0, tzinfo=TZ),
        datetime(2030, 1, 7, 10, 30, tzinfo=TZ),
    ) in slots
    assert slots[0] == _slot(
        datetime(2030, 1, 7, 9, 0, tzinfo=TZ),
        datetime(2030, 1, 7, 9, 30, tzinfo=TZ),
    )
    assert slots[-1] == _slot(
        datetime(2030, 1, 7, 17, 30, tzinfo=TZ),
        datetime(2030, 1, 7, 18, 0, tzinfo=TZ),
    )


def test_slots_no_ofrece_si_ambos_sillones_ocupados(db_session):
    """D5: sin ningun sillon activo libre el slot 10:00 no se ofrece."""
    ids = _ids(db_session)
    db_session.add(
        Profesional(nombre="Odontologo Ficticio 3", matricula="MAT-FICT-003")
    )
    db_session.flush()
    profesional3 = db_session.query(Profesional).filter_by(
        matricula="MAT-FICT-003"
    ).one().id
    _insertar_turno(
        db_session,
        ids,
        estado="pendiente",
        inicio=datetime(2030, 1, 7, 10, 0, tzinfo=TZ),
        fin=datetime(2030, 1, 7, 10, 30, tzinfo=TZ),
        profesional_id=ids["profesional2"],
        sillon_id=ids["sillon"],
    )
    _insertar_turno(
        db_session,
        ids,
        estado="pendiente",
        inicio=datetime(2030, 1, 7, 10, 0, tzinfo=TZ),
        fin=datetime(2030, 1, 7, 10, 30, tzinfo=TZ),
        profesional_id=profesional3,
        sillon_id=ids["sillon2"],
    )

    slots = _slots(db_session, ids, FECHA_LUNES)

    _assert_forma(slots)
    assert len(slots) == 17
    inicios = _inicios(slots)
    assert datetime(2030, 1, 7, 10, 0, tzinfo=TZ) not in inicios
    assert _slot(
        datetime(2030, 1, 7, 9, 30, tzinfo=TZ),
        datetime(2030, 1, 7, 10, 0, tzinfo=TZ),
    ) in slots
    assert _slot(
        datetime(2030, 1, 7, 10, 30, tzinfo=TZ),
        datetime(2030, 1, 7, 11, 0, tzinfo=TZ),
    ) in slots


def test_slots_ofrece_si_un_sillon_libre(db_session):
    """D5: con un solo sillon ocupado el slot 10:00 sigue ofrecido."""
    ids = _ids(db_session)
    _insertar_turno(
        db_session,
        ids,
        estado="pendiente",
        inicio=datetime(2030, 1, 7, 10, 0, tzinfo=TZ),
        fin=datetime(2030, 1, 7, 10, 30, tzinfo=TZ),
        profesional_id=ids["profesional2"],
        sillon_id=ids["sillon"],
    )

    slots = _slots(db_session, ids, FECHA_LUNES)

    _assert_forma(slots)
    assert len(slots) == 18
    assert _slot(
        datetime(2030, 1, 7, 10, 0, tzinfo=TZ),
        datetime(2030, 1, 7, 10, 30, tzinfo=TZ),
    ) in slots
    assert slots[0] == _slot(
        datetime(2030, 1, 7, 9, 0, tzinfo=TZ),
        datetime(2030, 1, 7, 9, 30, tzinfo=TZ),
    )
    assert slots[-1] == _slot(
        datetime(2030, 1, 7, 17, 30, tzinfo=TZ),
        datetime(2030, 1, 7, 18, 0, tzinfo=TZ),
    )


def test_slots_sin_sillon_activo_devuelve_vacio(db_session):
    """D5: sin sillones activos no hay slots aunque el horario cubra."""
    ids = _ids(db_session)
    db_session.query(SillonBox).update({"activo": False})
    db_session.flush()

    slots = _slots(db_session, ids, FECHA_LUNES)

    assert slots == []
