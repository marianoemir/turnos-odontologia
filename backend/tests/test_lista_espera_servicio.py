"""ServicioListaEspera (C-06). Solo ficticios."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from backend.app.agenda.models import (
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
)
from backend.app.lista_espera.models import ListaEspera
from backend.app.lista_espera.service import (
    ListaEsperaInvalida,
    ListaNoEncontrada,
    ServicioListaEspera,
)
from backend.app.seed.catalogo import seed_catalogo
from backend.app.turnos.models import Turno
from backend.app.turnos.service import ConflictoTurno

pytestmark = pytest.mark.integration

TZ = ZoneInfo("America/Argentina/Buenos_Aires")
LUNES_10 = datetime(2026, 10, 12, 10, 0, tzinfo=TZ)


def _ids(db_session):
    seed_catalogo(db_session)
    return {
        "paciente": db_session.query(Paciente).filter_by(dni="DNI-FICT-001").one().id,
        "paciente2": db_session.query(Paciente).filter_by(dni="DNI-FICT-002").one().id,
        "profesional": db_session.query(Profesional).filter_by(matricula="MAT-FICT-001").one().id,
        "profesional2": db_session.query(Profesional).filter_by(matricula="MAT-FICT-002").one().id,
        "sillon": db_session.query(SillonBox).filter_by(nombre="Sillon 1").one().id,
        "sillon2": db_session.query(SillonBox).filter_by(nombre="Sillon 2").one().id,
        "consulta30": db_session.query(Prestacion).filter_by(nombre="Consulta").one().id,
    }


def test_alta_crea_pendiente(db_session):
    ids = _ids(db_session)
    entrada = ServicioListaEspera.alta(
        db_session,
        paciente_id=ids["paciente"],
        profesional_id=ids["profesional"],
        prestacion_id=ids["consulta30"],
    )
    assert entrada.estado == "pendiente"
    assert entrada.creado_en is not None
    assert db_session.query(ListaEspera).count() == 1


def test_alta_sin_profesional(db_session):
    ids = _ids(db_session)
    entrada = ServicioListaEspera.alta(
        db_session,
        paciente_id=ids["paciente"],
        prestacion_id=ids["consulta30"],
    )
    assert entrada.profesional_id is None
    assert entrada.estado == "pendiente"


def test_alta_paciente_inexistente_404(db_session):
    import uuid

    ids = _ids(db_session)
    with pytest.raises(Exception) as exc:
        ServicioListaEspera.alta(
            db_session,
            paciente_id=uuid.uuid4(),
            prestacion_id=ids["consulta30"],
        )
    assert "no existe" in str(exc.value)


def test_listar_fifo_por_creado_en(db_session):
    ids = _ids(db_session)
    e1 = ServicioListaEspera.alta(
        db_session, paciente_id=ids["paciente"], prestacion_id=ids["consulta30"]
    )
    e2 = ServicioListaEspera.alta(
        db_session, paciente_id=ids["paciente2"], prestacion_id=ids["consulta30"]
    )
    e3 = ServicioListaEspera.alta(
        db_session, paciente_id=ids["paciente"], prestacion_id=ids["consulta30"]
    )
    lista = ServicioListaEspera.listar(db_session)
    assert [e.id for e in lista] == [e1.id, e2.id, e3.id]


def test_listar_filtra_por_profesional(db_session):
    ids = _ids(db_session)
    ServicioListaEspera.alta(
        db_session,
        paciente_id=ids["paciente"],
        profesional_id=ids["profesional"],
        prestacion_id=ids["consulta30"],
    )
    ServicioListaEspera.alta(
        db_session,
        paciente_id=ids["paciente2"],
        profesional_id=ids["profesional2"],
        prestacion_id=ids["consulta30"],
    )
    ServicioListaEspera.alta(
        db_session,
        paciente_id=ids["paciente"],
        prestacion_id=ids["consulta30"],
    )
    filtrado = ServicioListaEspera.listar(
        db_session, profesional_id=ids["profesional"]
    )
    # Spec "Filtro por profesional": las de ese profesional y las generales.
    assert {e.profesional_id for e in filtrado} == {ids["profesional"], None}
    assert len(filtrado) == 2
    assert filtrado[0].profesional_id == ids["profesional"]


def test_ofrecer_crea_turno_valido(db_session):
    ids = _ids(db_session)
    entrada = ServicioListaEspera.alta(
        db_session,
        paciente_id=ids["paciente"],
        prestacion_id=ids["consulta30"],
    )
    entrada, turno = ServicioListaEspera.ofrecer(
        db_session,
        entrada.id,
        inicio=LUNES_10,
        profesional_id=ids["profesional"],
        sillon_id=ids["sillon"],
    )
    assert turno.estado == "pendiente"
    assert entrada.estado == "ofrecido"
    assert entrada.turno_id == turno.id
    assert db_session.query(Turno).count() == 1


def test_ofrecer_conflicto_revierte_pendiente(db_session):
    ids = _ids(db_session)
    # turno base ocupando el slot
    from backend.app.turnos.service import ServicioTurnos

    ServicioTurnos.crear(
        db_session,
        paciente_id=ids["paciente"],
        profesional_id=ids["profesional"],
        sillon_id=ids["sillon"],
        prestacion_id=ids["consulta30"],
        inicio=LUNES_10,
    )
    entrada = ServicioListaEspera.alta(
        db_session,
        paciente_id=ids["paciente2"],
        prestacion_id=ids["consulta30"],
    )
    with pytest.raises(ConflictoTurno):
        ServicioListaEspera.ofrecer(
            db_session,
            entrada.id,
            inicio=LUNES_10,
            profesional_id=ids["profesional"],
            sillon_id=ids["sillon"],
        )
    db_session.expire_all()
    recargada = db_session.get(ListaEspera, entrada.id)
    assert recargada.estado == "pendiente"
    assert recargada.turno_id is None
    assert db_session.query(Turno).count() == 1


def test_ofrecer_entrada_inexistente(db_session):
    import uuid

    ids = _ids(db_session)
    with pytest.raises(ListaNoEncontrada):
        ServicioListaEspera.ofrecer(
            db_session,
            uuid.uuid4(),
            inicio=LUNES_10,
            profesional_id=ids["profesional"],
            sillon_id=ids["sillon"],
        )


def test_ofrecer_estado_invalido(db_session):
    ids = _ids(db_session)
    entrada = ServicioListaEspera.alta(
        db_session,
        paciente_id=ids["paciente"],
        prestacion_id=ids["consulta30"],
    )
    entrada.estado = "baja"
    db_session.flush()
    with pytest.raises(ListaEsperaInvalida):
        ServicioListaEspera.ofrecer(
            db_session,
            entrada.id,
            inicio=LUNES_10,
            profesional_id=ids["profesional"],
            sillon_id=ids["sillon"],
        )


def test_ofrecer_ya_ofrecido_no_duplica_turno(db_session):
    ids = _ids(db_session)
    entrada = ServicioListaEspera.alta(
        db_session,
        paciente_id=ids["paciente"],
        prestacion_id=ids["consulta30"],
    )
    _, turno1 = ServicioListaEspera.ofrecer(
        db_session,
        entrada.id,
        inicio=LUNES_10,
        profesional_id=ids["profesional"],
        sillon_id=ids["sillon"],
    )
    with pytest.raises(ListaEsperaInvalida):
        ServicioListaEspera.ofrecer(
            db_session,
            entrada.id,
            inicio=LUNES_10.replace(hour=11),
            profesional_id=ids["profesional"],
            sillon_id=ids["sillon"],
        )
    db_session.expire_all()
    recargada = db_session.get(ListaEspera, entrada.id)
    assert recargada.estado == "ofrecido"
    assert recargada.turno_id == turno1.id
    assert db_session.query(Turno).count() == 1


def test_aceptar_marca_asignado(db_session):
    ids = _ids(db_session)
    entrada = ServicioListaEspera.alta(
        db_session,
        paciente_id=ids["paciente"],
        prestacion_id=ids["consulta30"],
    )
    ServicioListaEspera.ofrecer(
        db_session,
        entrada.id,
        inicio=LUNES_10,
        profesional_id=ids["profesional"],
        sillon_id=ids["sillon"],
    )
    resultado = ServicioListaEspera.responder(
        db_session, entrada.id, acepta=True
    )
    ent = resultado[0] if isinstance(resultado, tuple) else resultado
    assert ent.estado == "asignado"


def test_rechazo_cancela_y_avanza(db_session):
    ids = _ids(db_session)
    e1 = ServicioListaEspera.alta(
        db_session,
        paciente_id=ids["paciente"],
        profesional_id=ids["profesional"],
        prestacion_id=ids["consulta30"],
    )
    e2 = ServicioListaEspera.alta(
        db_session,
        paciente_id=ids["paciente2"],
        profesional_id=ids["profesional"],
        prestacion_id=ids["consulta30"],
    )
    ServicioListaEspera.ofrecer(
        db_session,
        e1.id,
        inicio=LUNES_10,
        profesional_id=ids["profesional"],
        sillon_id=ids["sillon"],
    )
    resultado = ServicioListaEspera.responder(
        db_session, e1.id, acepta=False
    )
    entrada, siguiente = resultado
    assert entrada.estado == "baja"
    assert entrada.turno_id is not None  # preserva link? turno cancelado
    assert siguiente is not None
    assert siguiente.id == e2.id
    # turno ofrecido cancelado
    turno = db_session.get(Turno, entrada.turno_id)
    assert turno.estado == "cancelado"


def test_rechazo_no_da_baja_si_falla_la_cancelacion(db_session):
    ids = _ids(db_session)
    entrada = ServicioListaEspera.alta(
        db_session,
        paciente_id=ids["paciente"],
        profesional_id=ids["profesional"],
        prestacion_id=ids["consulta30"],
    )
    _, turno = ServicioListaEspera.ofrecer(
        db_session,
        entrada.id,
        inicio=LUNES_10,
        profesional_id=ids["profesional"],
        sillon_id=ids["sillon"],
    )
    turno_id = turno.id
    turno.estado = "atendido"  # cancelar() rechaza esta transicion
    db_session.flush()
    with pytest.raises(ConflictoTurno):
        ServicioListaEspera.responder(db_session, entrada.id, acepta=False)
    db_session.expire_all()
    recargada = db_session.get(ListaEspera, entrada.id)
    assert recargada.estado == "ofrecido"
    assert recargada.turno_id == turno_id


def test_rechazo_sin_oferta_409(db_session):
    ids = _ids(db_session)
    entrada = ServicioListaEspera.alta(
        db_session,
        paciente_id=ids["paciente"],
        prestacion_id=ids["consulta30"],
    )
    with pytest.raises(ListaEsperaInvalida):
        ServicioListaEspera.responder(db_session, entrada.id, acepta=False)


def test_responder_inexistente(db_session):
    import uuid

    _ids(db_session)
    with pytest.raises(ListaNoEncontrada):
        ServicioListaEspera.responder(
            db_session, uuid.uuid4(), acepta=True
        )