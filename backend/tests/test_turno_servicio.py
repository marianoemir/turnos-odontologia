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
    from sqlalchemy import text as _text

    nuevo_id = db_session.execute(
        _text(
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


def test_helper_inserta_estado_confirmado(db_session):
    """RED de la task 1.2: el helper aun no existe."""
    ids = _ids(db_session)

    turno = _insertar_turno(
        db_session,
        ids,
        estado="confirmado",
        inicio=LUNES_10,
        fin=datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
    )

    assert turno.estado == "confirmado"


def test_helper_inserta_estado_atendido(db_session):
    """TRIANGULATE de la task 1.2: acepta estados distintos."""
    ids = _ids(db_session)

    turno = _insertar_turno(
        db_session,
        ids,
        estado="atendido",
        inicio=LUNES_10,
        fin=datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
    )

    assert turno.estado == "atendido"
    assert db_session.query(Turno).count() == 1


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
            inicio=datetime(2026, 10, 12, 10, 0),  
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


def test_validar_sin_excluir_se_auto_colisiona(db_session):
    """Caracteriza el bug que motiva excluir_turno_id.

    Sin excluir el turno editado, validar choca contra el mismo turno.
    """
    ids = _ids(db_session)
    _crear(db_session, ids)  # 10:00-10:30

    with pytest.raises(ConflictoTurno) as exc:
        ServicioTurnos.validar(
            db_session,
            paciente_id=ids["paciente"],
            profesional_id=ids["profesional"],
            sillon_id=ids["sillon"],
            prestacion_id=ids["consulta30"],
            inicio=datetime(2026, 10, 12, 10, 15, tzinfo=TZ),
        )

    assert exc.value.causa == "profesional"


def test_validar_excluye_el_turno_editado(db_session):
    """RED/GREEN de la task 2.2: excluir el propio turno por id."""
    import inspect

    ids = _ids(db_session)
    turno = _crear(db_session, ids)  # 10:00-10:30

    fin = ServicioTurnos.validar(
        db_session,
        paciente_id=ids["paciente"],
        profesional_id=ids["profesional"],
        sillon_id=ids["sillon"],
        prestacion_id=ids["consulta30"],
        inicio=datetime(2026, 10, 12, 10, 15, tzinfo=TZ),
        excluir_turno_id=turno.id,
    )

    assert fin == datetime(2026, 10, 12, 10, 45, tzinfo=TZ)
    assert "excluir_turno_id" in inspect.signature(
        ServicioTurnos.validar
    ).parameters

    # TRIANGULATE: excluir un id ajeno no evita el solape real.
    import uuid as _uuid

    with pytest.raises(ConflictoTurno) as exc:
        ServicioTurnos.validar(
            db_session,
            paciente_id=ids["paciente"],
            profesional_id=ids["profesional"],
            sillon_id=ids["sillon"],
            prestacion_id=ids["consulta30"],
            inicio=datetime(2026, 10, 12, 10, 15, tzinfo=TZ),
            excluir_turno_id=_uuid.uuid4(),
        )

    assert exc.value.causa == "profesional"


def test_cancelar_pendiente_da_cancelado_y_conserva_intervalo(db_session):
    ids = _ids(db_session)
    turno = _crear(db_session, ids)
    fin_original = turno.fin

    ServicioTurnos.cancelar(db_session, turno.id)

    turno = db_session.get(Turno, turno.id)
    assert turno.estado == "cancelado"
    assert turno.inicio == LUNES_10
    assert turno.fin == fin_original
    assert db_session.query(Turno).count() == 1


def test_cancelar_confirmado_ok(db_session):
    ids = _ids(db_session)
    turno = _insertar_turno(
        db_session,
        ids,
        estado="confirmado",
        inicio=LUNES_10,
        fin=datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
    )

    ServicioTurnos.cancelar(db_session, turno.id)

    assert db_session.get(Turno, turno.id).estado == "cancelado"


def test_cancelar_atendido_da_409(db_session):
    ids = _ids(db_session)
    turno = _insertar_turno(
        db_session,
        ids,
        estado="atendido",
        inicio=LUNES_10,
        fin=datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
    )

    with pytest.raises(ConflictoTurno) as exc:
        ServicioTurnos.cancelar(db_session, turno.id)

    assert exc.value.causa == "transicion"
    db_session.expire_all()
    assert db_session.get(Turno, turno.id).estado == "atendido"


def test_cancelar_cancelado_da_409(db_session):
    ids = _ids(db_session)
    turno = _insertar_turno(
        db_session,
        ids,
        estado="cancelado",
        inicio=LUNES_10,
        fin=datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
    )

    with pytest.raises(ConflictoTurno) as exc:
        ServicioTurnos.cancelar(db_session, turno.id)

    assert exc.value.causa == "transicion"
    db_session.expire_all()
    assert db_session.get(Turno, turno.id).estado == "cancelado"


def test_cancelar_turno_inexistente_da_404(db_session):
    import uuid

    inexistente = uuid.uuid4()

    with pytest.raises(TurnoNoEncontrado) as exc:
        ServicioTurnos.cancelar(db_session, inexistente)

    assert exc.value.recurso == "turno"
    assert exc.value.ref_id == inexistente
    assert db_session.query(Turno).count() == 0


def test_cancelar_libera_el_slot_da_201(db_session):
    ids = _ids(db_session)
    turno = _crear(db_session, ids)
    ServicioTurnos.cancelar(db_session, turno.id)

    nuevo = _crear(db_session, ids)

    assert nuevo.estado == "pendiente"
    assert nuevo.id != turno.id
    assert db_session.query(Turno).count() == 2


def test_reprogramar_recalcula_fin_y_conserva_el_resto(db_session):
    ids = _ids(db_session)
    turno = _crear(db_session, ids)
    nuevo_inicio = datetime(2026, 10, 12, 11, 0, tzinfo=TZ)

    resultado = ServicioTurnos.reprogramar(
        db_session, turno.id, inicio=nuevo_inicio
    )

    assert resultado.id == turno.id
    assert resultado.inicio == nuevo_inicio
    assert resultado.fin == datetime(2026, 10, 12, 11, 30, tzinfo=TZ)
    assert resultado.paciente_id == ids["paciente"]
    assert resultado.profesional_id == ids["profesional"]
    assert resultado.sillon_id == ids["sillon"]
    assert resultado.prestacion_id == ids["consulta30"]
    assert resultado.estado == "pendiente"


def test_reprogramar_libera_el_inicio_original(db_session):
    ids = _ids(db_session)
    turno = _crear(db_session, ids)
    ServicioTurnos.reprogramar(
        db_session,
        turno.id,
        inicio=datetime(2026, 10, 12, 11, 0, tzinfo=TZ),
    )

    nuevo = _crear(db_session, ids)

    assert nuevo.inicio == LUNES_10
    assert db_session.query(Turno).count() == 2


@pytest.mark.parametrize("estado", ["cancelado", "atendido", "ausente"])
def test_reprogramar_estado_final_da_409(db_session, estado):
    ids = _ids(db_session)
    turno = _insertar_turno(
        db_session,
        ids,
        estado=estado,
        inicio=LUNES_10,
        fin=datetime(2026, 10, 12, 10, 30, tzinfo=TZ),
    )

    with pytest.raises(ConflictoTurno) as exc:
        ServicioTurnos.reprogramar(
            db_session,
            turno.id,
            inicio=datetime(2026, 10, 12, 11, 0, tzinfo=TZ),
        )

    assert exc.value.causa == "transicion"
    db_session.expire_all()
    recargado = db_session.get(Turno, turno.id)
    assert recargado.estado == estado
    assert recargado.inicio == LUNES_10


def test_reprogramar_turno_inexistente_da_404(db_session):
    import uuid

    with pytest.raises(TurnoNoEncontrado) as exc:
        ServicioTurnos.reprogramar(db_session, uuid.uuid4(), inicio=LUNES_10)

    assert exc.value.recurso == "turno"
    assert db_session.query(Turno).count() == 0


def _lunes(hora, minuto=0):
    return datetime(2026, 10, 12, hora, minuto, tzinfo=TZ)


def test_reprogramar_solape_profesional_da_409_original_intacto(db_session):
    ids = _ids(db_session)
    a = _crear(db_session, ids)
    _crear(db_session, ids, inicio=_lunes(11), sillon_id=ids["sillon2"])

    with pytest.raises(ConflictoTurno) as exc:
        ServicioTurnos.reprogramar(db_session, a.id, inicio=_lunes(11, 15))

    assert exc.value.causa == "profesional"
    db_session.expire_all()
    assert db_session.get(Turno, a.id).inicio == LUNES_10


def test_reprogramar_solape_sillon_da_409_original_intacto(db_session):
    ids = _ids(db_session)
    a = _crear(db_session, ids)
    _crear(
        db_session,
        ids,
        inicio=_lunes(11),
        profesional_id=ids["profesional2"],
    )

    with pytest.raises(ConflictoTurno) as exc:
        ServicioTurnos.reprogramar(db_session, a.id, inicio=_lunes(11, 15))

    assert exc.value.causa == "sillon"
    db_session.expire_all()
    assert db_session.get(Turno, a.id).inicio == LUNES_10


def test_reprogramar_adyacencia_inicio_igual_fin_ok(db_session):
    ids = _ids(db_session)
    a = _crear(db_session, ids)
    _crear(db_session, ids, inicio=_lunes(11))

    resultado = ServicioTurnos.reprogramar(
        db_session, a.id, inicio=_lunes(11, 30)
    )

    assert resultado.inicio == _lunes(11, 30)
    assert resultado.fin == _lunes(12)


def test_reprogramar_intervalo_identico_da_409(db_session):
    ids = _ids(db_session)
    a = _crear(db_session, ids)
    _crear(db_session, ids, inicio=_lunes(11))

    with pytest.raises(ConflictoTurno) as exc:
        ServicioTurnos.reprogramar(db_session, a.id, inicio=_lunes(11))

    assert exc.value.causa == "profesional"
    db_session.expire_all()
    assert db_session.get(Turno, a.id).inicio == LUNES_10


def test_reprogramar_fuera_de_horario_da_409_original_intacto(db_session):
    ids = _ids(db_session)
    a = _crear(db_session, ids)
    sabado = datetime(2026, 10, 17, 10, 0, tzinfo=TZ)

    with pytest.raises(ConflictoTurno) as exc:
        ServicioTurnos.reprogramar(db_session, a.id, inicio=sabado)

    assert exc.value.causa == "horario"
    db_session.expire_all()
    assert db_session.get(Turno, a.id).inicio == LUNES_10


def test_reprogramar_sobre_bloqueo_da_409_original_intacto(db_session):
    ids = _ids(db_session)
    a = _crear(db_session, ids)
    navidad = datetime(2026, 12, 25, 10, 0, tzinfo=TZ)

    with pytest.raises(ConflictoTurno) as exc:
        ServicioTurnos.reprogramar(db_session, a.id, inicio=navidad)

    assert exc.value.causa == "bloqueo"
    db_session.expire_all()
    assert db_session.get(Turno, a.id).inicio == LUNES_10


def test_reprogramar_solapando_su_propio_intervalo_ok(db_session):
    ids = _ids(db_session)
    a = _crear(db_session, ids)

    resultado = ServicioTurnos.reprogramar(
        db_session, a.id, inicio=_lunes(10, 15)
    )

    assert resultado.inicio == _lunes(10, 15)
    assert resultado.fin == _lunes(10, 45)


def _provocar_integrity_error(db_session, turno_id, inicio, fin):
    """UPDATE directo en un savepoint; devuelve el IntegrityError real."""
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    with pytest.raises(IntegrityError) as exc, db_session.begin_nested():
        db_session.execute(
            text("UPDATE turnos SET inicio = :i, fin = :f WHERE id = :id"),
            {"i": inicio, "f": fin, "id": turno_id},
        )
    return exc.value


def test_traducir_23p01_profesional_a_conflicto(db_session):
    ids = _ids(db_session)
    _crear(db_session, ids)
    b = _crear(db_session, ids, inicio=_lunes(11), sillon_id=ids["sillon2"])

    error = _provocar_integrity_error(
        db_session, b.id, _lunes(10, 15), _lunes(10, 45)
    )

    assert error.orig.sqlstate == "23P01"
    assert error.orig.diag.constraint_name == "ex_turnos_profesional_sin_solape"
    traducida = ServicioTurnos._traducir_integridad(error)
    assert traducida.causa == "profesional"
    assert db_session.query(Turno).count() == 2


def test_traducir_23p01_sillon_a_conflicto(db_session):
    ids = _ids(db_session)
    _crear(db_session, ids)
    b = _crear(
        db_session,
        ids,
        inicio=_lunes(11),
        profesional_id=ids["profesional2"],
    )

    error = _provocar_integrity_error(
        db_session, b.id, _lunes(10, 15), _lunes(10, 45)
    )

    assert error.orig.sqlstate == "23P01"
    assert error.orig.diag.constraint_name == "ex_turnos_sillon_sin_solape"
    traducida = ServicioTurnos._traducir_integridad(error)
    assert traducida.causa == "sillon"


def test_traducir_23514_no_se_convierte_en_409(db_session):
    from sqlalchemy.exc import IntegrityError

    ids = _ids(db_session)
    a = _crear(db_session, ids)

    error = _provocar_integrity_error(db_session, a.id, _lunes(11), _lunes(11))

    assert error.orig.sqlstate == "23514"
    with pytest.raises(IntegrityError):
        ServicioTurnos._traducir_integridad(error)

def test_turno_rechazado_si_horario_inactivo(db_session):
    from datetime import time

    from backend.app.agenda.models import HorarioAtencion

    ids = _ids(db_session)

    horario_sabado = HorarioAtencion(
        profesional_id=ids["profesional"],
        dia_semana=5,
        desde=time(10, 0),
        hasta=time(11, 0),
        activo=True,
    )
    db_session.add(horario_sabado)
    db_session.flush()

    # Control: con el horario activo, el turno dentro de esa franja se crea correctamente
    turno_control = _crear(
        db_session,
        ids,
        inicio=datetime(2026, 10, 10, 10, 0, tzinfo=TZ),
    )
    assert turno_control.estado == "pendiente"

    # Desactivamos el horario
    horario_sabado.activo = False
    db_session.flush()

    # Con el horario inactivo, el turno en esa franja debe ser rechazado por horario
    with pytest.raises(ConflictoTurno) as exc:
        _crear(
            db_session,
            ids,
            inicio=datetime(2026, 10, 17, 10, 0, tzinfo=TZ),
        )
    assert exc.value.causa == "horario"
