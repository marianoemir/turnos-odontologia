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


def test_slots_no_ofrece_inicios_pasados(db_session):
    """No se ofrecen inicios pasados (D8, Q-C08-06 pendiente de OK)."""
    ids = _ids(db_session)

    slots = _slots(db_session, ids, fecha=date(2020, 1, 6))

    assert slots == []


def _crear_reserva(db_session, ids, *, nombre, dni, contacto=None, inicio, profesional_id=None, prestacion_id=None):
    from backend.app.reserva_online.service import ServicioReservaOnline

    return ServicioReservaOnline.crear_reserva(
        db_session,
        nombre=nombre,
        dni=dni,
        contacto=contacto,
        profesional_id=profesional_id or ids["profesional"],
        prestacion_id=prestacion_id or ids["consulta30"],
        inicio=inicio,
    )


def test_crear_reserva_valida(db_session):
    """Reserva válida: pendiente, fin=inicio+30 (RN-AG-01), creado_por reserva_online."""
    ids = _ids(db_session)
    inicio = datetime(2030, 1, 7, 10, 0, tzinfo=TZ)

    res = _crear_reserva(
        db_session,
        ids,
        nombre="Paciente Reserva Ficticio",
        dni="DNI-RES-001",
        contacto="tel ficticio",
        inicio=inicio,
    )

    assert set(res.keys()) == {
        "turno_id",
        "profesional_id",
        "prestacion_id",
        "inicio",
        "fin",
        "estado",
    }
    assert res["estado"] == "pendiente"
    assert res["profesional_id"] == ids["profesional"]
    assert res["prestacion_id"] == ids["consulta30"]
    assert res["inicio"] == inicio
    assert res["fin"] == datetime(2030, 1, 7, 10, 30, tzinfo=TZ)
    turno = db_session.get(Turno, res["turno_id"])
    assert turno is not None
    assert turno.creado_por == "reserva_online"


def test_crear_reserva_solape_profesional(db_session):
    """Solape de profesional en otro sillón: ConflictoTurno profesional, sin nuevos turnos."""
    from backend.app.turnos.service import ConflictoTurno

    ids = _ids(db_session)
    inicio = datetime(2030, 1, 7, 10, 0, tzinfo=TZ)
    fin = datetime(2030, 1, 7, 10, 30, tzinfo=TZ)
    _insertar_turno(
        db_session,
        ids,
        estado="pendiente",
        inicio=inicio,
        fin=fin,
        profesional_id=ids["profesional"],
        sillon_id=ids["sillon"],
    )
    antes = db_session.query(Turno).count()

    with pytest.raises(ConflictoTurno) as exc_info:
        _crear_reserva(
            db_session,
            ids,
            nombre="Paciente Reserva Ficticio 2",
            dni="DNI-RES-002",
            contacto=None,
            inicio=inicio,
        )
    assert exc_info.value.causa == "profesional"
    assert db_session.query(Turno).count() == antes


def test_crear_reserva_fuera_de_horario(db_session):
    """Fuera de horario (sábado 10:00): ConflictoTurno horario, sin turnos nuevos."""
    from backend.app.turnos.service import ConflictoTurno

    ids = _ids(db_session)
    antes = db_session.query(Turno).count()

    with pytest.raises(ConflictoTurno) as exc_info:
        _crear_reserva(
            db_session,
            ids,
            nombre="Paciente Reserva Ficticio 3",
            dni="DNI-RES-003",
            contacto=None,
            inicio=datetime(2030, 1, 12, 10, 0, tzinfo=TZ),
        )
    assert exc_info.value.causa == "horario"
    assert db_session.query(Turno).count() == antes


def test_crear_reserva_borde_inicio_igual_fin(db_session):
    """Borde inicio == fin de otro turno: se acepta, 10:30-11:00 (RN-AG-04)."""
    ids = _ids(db_session)
    _insertar_turno(
        db_session,
        ids,
        estado="pendiente",
        inicio=datetime(2030, 1, 7, 10, 0, tzinfo=TZ),
        fin=datetime(2030, 1, 7, 10, 30, tzinfo=TZ),
        profesional_id=ids["profesional"],
        sillon_id=ids["sillon"],
    )

    res = _crear_reserva(
        db_session,
        ids,
        nombre="Paciente Reserva Ficticio 4",
        dni="DNI-RES-004",
        contacto=None,
        inicio=datetime(2030, 1, 7, 10, 30, tzinfo=TZ),
    )

    assert res["estado"] == "pendiente"
    assert res["inicio"] == datetime(2030, 1, 7, 10, 30, tzinfo=TZ)
    assert res["fin"] == datetime(2030, 1, 7, 11, 0, tzinfo=TZ)


def test_crear_reserva_inicio_sin_zona_horaria(db_session):
    """Inicio sin zona horaria: excepción según (a), sin turnos nuevos."""
    from backend.app.turnos.service import TurnoInvalido

    ids = _ids(db_session)
    antes = db_session.query(Turno).count()

    with pytest.raises(TurnoInvalido):
        _crear_reserva(
            db_session,
            ids,
            nombre="Paciente Reserva Ficticio 5",
            dni="DNI-RES-005",
            contacto=None,
            inicio=datetime(2030, 1, 7, 10, 0),
        )
    assert db_session.query(Turno).count() == antes


def test_crear_reserva_dni_nuevo_crea_paciente(db_session):
    """dni nuevo: crea paciente ficticio=True, activo=True; conteo sube en 1."""
    ids = _ids(db_session)
    antes = db_session.query(Paciente).count()

    res = _crear_reserva(
        db_session,
        ids,
        nombre="Paciente Nuevo Ficticio",
        dni="DNI-RES-NUEVO-001",
        contacto="contacto ficticio",
        inicio=datetime(2030, 1, 7, 11, 0, tzinfo=TZ),
    )

    assert db_session.query(Paciente).count() == antes + 1
    turno = db_session.get(Turno, res["turno_id"])
    paciente = db_session.get(Paciente, turno.paciente_id)
    assert paciente.dni == "DNI-RES-NUEVO-001"
    assert paciente.ficticio is True
    assert paciente.activo is True


def test_crear_reserva_dni_existente_reutiliza(db_session):
    """dni existente: reutiliza paciente, ignora nombre, no crea otro, misma forma."""
    ids = _ids(db_session)
    paciente_existente = db_session.get(Paciente, ids["paciente"])
    antes = db_session.query(Paciente).count()

    res = _crear_reserva(
        db_session,
        ids,
        nombre="Nombre Distinto Ignorado",
        dni=paciente_existente.dni,
        contacto="contacto ignorado",
        inicio=datetime(2030, 1, 7, 11, 30, tzinfo=TZ),
    )

    assert db_session.query(Paciente).count() == antes
    assert set(res.keys()) == {
        "turno_id",
        "profesional_id",
        "prestacion_id",
        "inicio",
        "fin",
        "estado",
    }
    turno = db_session.get(Turno, res["turno_id"])
    assert turno.paciente_id == paciente_existente.id


def test_crear_reserva_todos_sillones_ocupados(db_session):
    """Todos los sillones activos ocupados: ConflictoTurno sillon; sin turno ni paciente nuevos."""
    from backend.app.turnos.service import ConflictoTurno

    ids = _ids(db_session)
    inicio = datetime(2030, 1, 7, 12, 0, tzinfo=TZ)
    fin = datetime(2030, 1, 7, 12, 30, tzinfo=TZ)
    db_session.add(
        Profesional(nombre="Odontologo Ficticio 3", matricula="MAT-FICT-003")
    )
    db_session.flush()
    profesional3 = (
        db_session.query(Profesional).filter_by(matricula="MAT-FICT-003").one().id
    )
    _insertar_turno(
        db_session,
        ids,
        estado="pendiente",
        inicio=inicio,
        fin=fin,
        profesional_id=ids["profesional2"],
        sillon_id=ids["sillon"],
    )
    _insertar_turno(
        db_session,
        ids,
        estado="pendiente",
        inicio=inicio,
        fin=fin,
        profesional_id=profesional3,
        sillon_id=ids["sillon2"],
    )
    turnos_antes = db_session.query(Turno).count()
    pacientes_antes = db_session.query(Paciente).count()

    with pytest.raises(ConflictoTurno) as exc_info:
        _crear_reserva(
            db_session,
            ids,
            nombre="Paciente Reserva Ocupado",
            dni="DNI-RES-OCUP-001",
            contacto=None,
            inicio=inicio,
        )
    assert exc_info.value.causa == "sillon"
    assert db_session.query(Turno).count() == turnos_antes
    assert db_session.query(Paciente).count() == pacientes_antes


def test_crear_reserva_409_dni_nuevo_no_persiste_paciente(db_session):
    """409 con dni nuevo: no queda paciente nuevo (servicio usa begin_nested/equivalente)."""
    from backend.app.turnos.service import ConflictoTurno

    ids = _ids(db_session)
    inicio = datetime(2030, 1, 7, 13, 0, tzinfo=TZ)
    fin = datetime(2030, 1, 7, 13, 30, tzinfo=TZ)
    db_session.add(
        Profesional(nombre="Odontologo Ficticio 4", matricula="MAT-FICT-004")
    )
    db_session.flush()
    profesional4 = (
        db_session.query(Profesional).filter_by(matricula="MAT-FICT-004").one().id
    )
    _insertar_turno(
        db_session,
        ids,
        estado="pendiente",
        inicio=inicio,
        fin=fin,
        profesional_id=ids["profesional2"],
        sillon_id=ids["sillon"],
    )
    _insertar_turno(
        db_session,
        ids,
        estado="pendiente",
        inicio=inicio,
        fin=fin,
        profesional_id=profesional4,
        sillon_id=ids["sillon2"],
    )
    pacientes_antes = db_session.query(Paciente).count()

    with pytest.raises(ConflictoTurno) as exc_info:
        _crear_reserva(
            db_session,
            ids,
            nombre="Paciente Nuevo Falla 409",
            dni="DNI-RES-FAIL409-001",
            contacto=None,
            inicio=inicio,
        )
    assert exc_info.value.causa == "sillon"
    assert db_session.query(Paciente).count() == pacientes_antes
    assert (
        db_session.query(Paciente).filter_by(dni="DNI-RES-FAIL409-001").first()
        is None
    )


def test_crear_reserva_asignacion_determinista_sillon(db_session):
    """Con dos sillones libres elige el primero por (nombre, id); sillon_id en DB."""
    ids = _ids(db_session)

    res = _crear_reserva(
        db_session,
        ids,
        nombre="Paciente Determinista Ficticio",
        dni="DNI-RES-DET-001",
        contacto=None,
        inicio=datetime(2030, 1, 7, 15, 0, tzinfo=TZ),
    )

    turno = db_session.get(Turno, res["turno_id"])
    sillones = (
        db_session.query(SillonBox)
        .filter(SillonBox.activo.is_(True))
        .order_by(SillonBox.nombre, SillonBox.id)
        .all()
    )
    assert sillones
    assert turno.sillon_id == sillones[0].id
    assert "sillon_id" not in res


def test_crear_reserva_usa_siguiente_sillon_si_el_primero_esta_ocupado(
    db_session,
):
    """D5: si el primer sillon esta ocupado, se asigna el siguiente."""
    ids = _ids(db_session)
    sillones = (
        db_session.query(SillonBox)
        .filter(SillonBox.activo.is_(True))
        .order_by(SillonBox.nombre, SillonBox.id)
        .all()
    )
    inicio = datetime(2030, 1, 7, 16, 0, tzinfo=TZ)
    fin = datetime(2030, 1, 7, 16, 30, tzinfo=TZ)
    _insertar_turno(
        db_session,
        ids,
        estado="pendiente",
        inicio=inicio,
        fin=fin,
        profesional_id=ids["profesional2"],
        sillon_id=sillones[0].id,
    )
    antes = db_session.query(Turno).count()

    res = _crear_reserva(
        db_session,
        ids,
        nombre="Paciente Siguiente Sillon Ficticio",
        dni="DNI-RES-SIG-001",
        contacto=None,
        inicio=inicio,
    )

    assert res["estado"] == "pendiente"
    assert db_session.query(Turno).count() == antes + 1
    turno = db_session.get(Turno, res["turno_id"])
    assert turno.sillon_id == sillones[1].id
