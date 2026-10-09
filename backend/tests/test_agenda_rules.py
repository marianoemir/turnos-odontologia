"""T2.4+T2.5 (C-02, unitarias): reglas puras sin DB, siempre corren."""

import uuid
from datetime import datetime, time
from zoneinfo import ZoneInfo

from backend.app.agenda.models import bloqueo_aplica, hay_solape_config

TZ = ZoneInfo("America/Argentina/Buenos_Aires")


def test_intervalos_solapados():
    assert hay_solape_config(time(9), time(13), time(12), time(14)) is True


def test_intervalo_contenido_solapa():
    assert hay_solape_config(time(9), time(18), time(10), time(11)) is True


def test_adyacencia_exacta_no_solapa():
    assert hay_solape_config(time(9), time(13), time(13), time(18)) is False


def test_intervalos_separados_no_solapan():
    assert hay_solape_config(time(9), time(10), time(11), time(12)) is False


def _bloqueo(profesional_id=None, sillon_id=None, desde=None, hasta=None):
    from backend.app.agenda.models import Bloqueo

    return Bloqueo(
        profesional_id=profesional_id,
        sillon_id=sillon_id,
        desde=desde or datetime(2026, 10, 12, 9, tzinfo=TZ),
        hasta=hasta or datetime(2026, 10, 12, 18, tzinfo=TZ),
        motivo="feriado ficticio",
    )


def _turno(h_desde=10, h_hasta=11):
    return (
        datetime(2026, 10, 12, h_desde, tzinfo=TZ),
        datetime(2026, 10, 12, h_hasta, tzinfo=TZ),
    )


def test_bloqueo_solo_profesional():
    prof_a, prof_b, sillon = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    bloq = _bloqueo(profesional_id=prof_a)
    inicio, fin = _turno()

    assert bloqueo_aplica(bloq, prof_a, sillon, inicio, fin) is True
    assert bloqueo_aplica(bloq, prof_b, sillon, inicio, fin) is False


def test_bloqueo_solo_sillon():
    prof, sil_a, sil_b = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    bloq = _bloqueo(sillon_id=sil_a)
    inicio, fin = _turno()

    assert bloqueo_aplica(bloq, prof, sil_b, inicio, fin) is False
    assert bloqueo_aplica(bloq, prof, sil_a, inicio, fin) is True


def test_bloqueo_global_aplica_a_todo():
    bloq = _bloqueo()
    inicio, fin = _turno()

    assert bloqueo_aplica(bloq, uuid.uuid4(), uuid.uuid4(), inicio, fin) is True


def test_bloqueo_pareja_concreta():
    prof_a, sil_a, sil_b = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    bloq = _bloqueo(profesional_id=prof_a, sillon_id=sil_a)
    inicio, fin = _turno()

    assert bloqueo_aplica(bloq, prof_a, sil_a, inicio, fin) is True
    assert bloqueo_aplica(bloq, prof_a, sil_b, inicio, fin) is False


def test_bloqueo_borde_semiabierto():
    prof, sillon = uuid.uuid4(), uuid.uuid4()
    bloq = _bloqueo(
        desde=datetime(2026, 10, 12, 9, tzinfo=TZ),
        hasta=datetime(2026, 10, 12, 10, tzinfo=TZ),
    )

    termina_cuando_empieza, _ = _turno(10, 11)
    assert (
        bloqueo_aplica(bloq, prof, sillon, termina_cuando_empieza, _) is False
    )
    empieza_antes, termina_dentro = _turno(9, 10)
    assert (
        bloqueo_aplica(bloq, prof, sillon, empieza_antes, termina_dentro)
        is True
    )
