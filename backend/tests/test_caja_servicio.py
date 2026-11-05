"""Tests de la capa de servicio de caja, cobros y liquidaciones (C-10, 7.2)."""

from datetime import date, datetime

import pytest

from backend.app.caja.models import MONTO_MAX_CENTAVOS, Caja, Cobro, LiquidacionOS
from backend.app.caja.reloj import ZONA
from backend.app.caja.schemas import (
    AnularCobro,
    CajaAbrir,
    CajaCerrar,
    CobroCreate,
    FacturaArcaCreate,
)
from backend.app.caja.service import (
    CajaCerrada,
    CajaNoAbierta,
    CajaNoEncontrada,
    CajaYaAbierta,
    CajaYaCerrada,
    CoberturaInvalida,
    CobroAnulado,
    CobroFacturado,
    CobroNoEncontrado,
    CobroYaAnulado,
    CobroYaFacturado,
    MedioNoFacturable,
    MontoInvalido,
    MotivoRequerido,
    ServicioCaja,
    TipoFacturaInvalido,
    TurnoNoEncontrado,
)

pytestmark = pytest.mark.integration


# ---------------------------------------------------------------------------
# 4.1: abrir y cerrar
# ---------------------------------------------------------------------------


def test_abrir_valido(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session,
        CajaAbrir(monto_apertura_centavos=10000),
        ahora=ahora,
    )
    assert caja.id is not None
    assert caja.fecha == date(2026, 11, 4)
    assert caja.monto_apertura_centavos == 10000
    assert caja.estado == "abierta"
    assert caja.abierto_en == ahora
    assert caja.cerrado_en is None
    assert caja.totales_por_medio_centavos == {}


def test_abrir_duplicado(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    ServicioCaja.abrir(
        db_session,
        CajaAbrir(monto_apertura_centavos=10000),
        ahora=ahora,
    )
    with pytest.raises(CajaYaAbierta):
        ServicioCaja.abrir(
            db_session,
            CajaAbrir(monto_apertura_centavos=5000),
            ahora=ahora,
        )


def test_abrir_caja_cerrada(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session,
        CajaAbrir(monto_apertura_centavos=10000),
        ahora=ahora,
    )
    ServicioCaja.cerrar(
        db_session,
        CajaCerrar(monto_cierre_contado_centavos=10000),
        ahora=ahora,
    )
    assert caja.estado == "cerrada"

    with pytest.raises(CajaYaCerrada):
        ServicioCaja.abrir(
            db_session,
            CajaAbrir(monto_apertura_centavos=5000),
            ahora=ahora,
        )


def test_abrir_fecha_local_2330(db_session):
    # 23:30 de Buenos Aires corresponde al día siguiente en UTC
    ahora = datetime(2026, 11, 4, 23, 30, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session,
        CajaAbrir(monto_apertura_centavos=5000),
        ahora=ahora,
    )
    assert caja.fecha == date(2026, 11, 4)


def test_abrir_monto_maximo(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session,
        CajaAbrir(monto_apertura_centavos=MONTO_MAX_CENTAVOS),
        ahora=ahora,
    )
    assert caja.monto_apertura_centavos == MONTO_MAX_CENTAVOS

    # Si se intenta abrir con monto fuera de rango directo al servicio
    with pytest.raises(MontoInvalido):
        ServicioCaja.abrir(
            db_session,
            CajaAbrir.model_construct(monto_apertura_centavos=-1),
            ahora=datetime(2026, 11, 5, 10, 0, tzinfo=ZONA),
        )


def test_cerrar_valido(db_session):
    ahora_abrir = datetime(2026, 11, 4, 9, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session,
        CajaAbrir(monto_apertura_centavos=5000),
        ahora=ahora_abrir,
    )

    # Agregamos cobros en efectivo y tarjeta
    cobro_ef = Cobro(
        caja_id=caja.id,
        medio="efectivo",
        concepto="total",
        monto_centavos=3000,
        estado="registrado",
        creado_en=ahora_abrir,
    )
    cobro_tj = Cobro(
        caja_id=caja.id,
        medio="tarjeta",
        concepto="total",
        monto_centavos=4000,
        estado="registrado",
        creado_en=ahora_abrir,
    )
    db_session.add_all([cobro_ef, cobro_tj])
    db_session.flush()

    ahora_cerrar = datetime(2026, 11, 4, 18, 0, tzinfo=ZONA)
    # Contado: 8500. Esperado: 5000 (apertura) + 3000 (efectivo) = 8000. Diferencia: +500
    caja_cerrada = ServicioCaja.cerrar(
        db_session,
        CajaCerrar(monto_cierre_contado_centavos=8500),
        ahora=ahora_cerrar,
    )
    assert caja_cerrada.estado == "cerrada"
    assert caja_cerrada.monto_esperado_centavos == 8000
    assert caja_cerrada.monto_cierre_contado_centavos == 8500
    assert caja_cerrada.diferencia_centavos == 500
    assert caja_cerrada.cerrado_en == ahora_cerrar
    assert caja_cerrada.totales_por_medio_centavos == {
        "efectivo": 3000,
        "tarjeta": 4000,
    }


def test_cierre_sin_caja(db_session):
    ahora = datetime(2026, 11, 4, 18, 0, tzinfo=ZONA)
    with pytest.raises(CajaNoAbierta):
        ServicioCaja.cerrar(
            db_session,
            CajaCerrar(monto_cierre_contado_centavos=1000),
            ahora=ahora,
        )


def test_cierre_ya_cerrada(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    ServicioCaja.abrir(
        db_session,
        CajaAbrir(monto_apertura_centavos=5000),
        ahora=ahora,
    )
    ServicioCaja.cerrar(
        db_session,
        CajaCerrar(monto_cierre_contado_centavos=5000),
        ahora=ahora,
    )
    with pytest.raises(CajaYaCerrada):
        ServicioCaja.cerrar(
            db_session,
            CajaCerrar(monto_cierre_contado_centavos=5000),
            ahora=ahora,
        )


def test_cierre_excluye_cobro_anulado(db_session):
    ahora = datetime(2026, 11, 4, 9, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session,
        CajaAbrir(monto_apertura_centavos=5000),
        ahora=ahora,
    )
    cobro_anulado = Cobro(
        caja_id=caja.id,
        medio="efectivo",
        concepto="total",
        monto_centavos=2000,
        estado="anulado",
        motivo_anulacion="error",
        anulado_en=ahora,
        creado_en=ahora,
    )
    cobro_ok = Cobro(
        caja_id=caja.id,
        medio="efectivo",
        concepto="total",
        monto_centavos=1000,
        estado="registrado",
        creado_en=ahora,
    )
    db_session.add_all([cobro_anulado, cobro_ok])
    db_session.flush()

    # Esperado: apertura 5000 + efectivo registrado 1000 = 6000 (el de 2000 no suma)
    caja_cerrada = ServicioCaja.cerrar(
        db_session,
        CajaCerrar(monto_cierre_contado_centavos=6000),
        ahora=ahora,
    )
    assert caja_cerrada.monto_esperado_centavos == 6000
    assert caja_cerrada.diferencia_centavos == 0
    assert caja_cerrada.totales_por_medio_centavos == {"efectivo": 1000}


# ---------------------------------------------------------------------------
# 4.2: obtener y obtener_por_fecha
# ---------------------------------------------------------------------------


def test_obtener_por_id(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session,
        CajaAbrir(monto_apertura_centavos=5000),
        ahora=ahora,
    )
    caja_obtenida = ServicioCaja.obtener(db_session, caja.id)
    assert caja_obtenida.id == caja.id
    assert caja_obtenida.fecha == caja.fecha
    assert caja_obtenida.totales_por_medio_centavos == {}


def test_obtener_inexistente(db_session):
    import uuid

    with pytest.raises(CajaNoEncontrada):
        ServicioCaja.obtener(db_session, uuid.uuid4())


def test_obtener_por_fecha_con_caja(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session,
        CajaAbrir(monto_apertura_centavos=5000),
        ahora=ahora,
    )
    caja_obtenida = ServicioCaja.obtener_por_fecha(
        db_session, date(2026, 11, 4)
    )
    assert caja_obtenida.id == caja.id

    # Si fecha es None, usa hoy_local(ahora)
    caja_hoy = ServicioCaja.obtener_por_fecha(db_session, ahora=ahora)
    assert caja_hoy.id == caja.id


def test_obtener_por_fecha_sin_caja(db_session):
    with pytest.raises(CajaNoEncontrada):
        ServicioCaja.obtener_por_fecha(db_session, date(2026, 1, 1))


def test_obtener_por_fecha_2330(db_session):
    # A las 23:30 de Buenos Aires la fecha local es 2026-11-04
    ahora_2330 = datetime(2026, 11, 4, 23, 30, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session,
        CajaAbrir(monto_apertura_centavos=5000),
        ahora=ahora_2330,
    )
    caja_obtenida = ServicioCaja.obtener_por_fecha(
        db_session, ahora=ahora_2330
    )
    assert caja_obtenida.id == caja.id
    assert caja_obtenida.fecha == date(2026, 11, 4)


# ---------------------------------------------------------------------------
# 4.3: registrar_cobro
# ---------------------------------------------------------------------------


def _crear_turno(db_session):
    from backend.app.agenda.models import (
        Paciente,
        Prestacion,
        Profesional,
        SillonBox,
    )
    from backend.app.seed.catalogo import seed_catalogo
    from backend.app.turnos.models import Turno

    seed_catalogo(db_session)
    pac = db_session.query(Paciente).filter_by(dni="DNI-FICT-001").one()
    prof = db_session.query(Profesional).filter_by(matricula="MAT-FICT-001").one()
    sil = db_session.query(SillonBox).first()
    prest = db_session.query(Prestacion).filter_by(nombre="Consulta").one()

    t = Turno(
        paciente_id=pac.id,
        profesional_id=prof.id,
        sillon_id=sil.id,
        prestacion_id=prest.id,
        inicio=datetime(2026, 11, 4, 10, 0, tzinfo=ZONA),
        fin=datetime(2026, 11, 4, 10, 30, tzinfo=ZONA),
        estado="pendiente",
    )
    db_session.add(t)
    db_session.flush()
    return t


def test_registrar_cobro_con_turno(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    turno = _crear_turno(db_session)

    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(
            caja_id=caja.id,
            turno_id=turno.id,
            medio="efectivo",
            concepto="total",
            monto_centavos=8000,
        ),
        ahora=ahora,
    )
    assert cobro.id is not None
    assert cobro.caja_id == caja.id
    assert cobro.turno_id == turno.id
    assert cobro.medio == "efectivo"
    assert cobro.monto_centavos == 8000
    assert cobro.estado == "registrado"
    assert cobro.simulado is False
    assert cobro.creado_en == ahora


def test_registrar_cobro_standalone(db_session):
    ahora = datetime(2026, 11, 4, 11, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(medio="mercado_pago", monto_centavos=4500),
        ahora=ahora,
    )
    assert cobro.caja_id == caja.id
    assert cobro.turno_id is None
    assert cobro.medio == "mercado_pago"
    assert cobro.simulado is True  # MP siempre simulado en C-10


def test_registrar_cobro_caja_cerrada(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    ServicioCaja.cerrar(
        db_session,
        CajaCerrar(monto_cierre_contado_centavos=5000),
        ahora=ahora,
    )

    with pytest.raises(CajaNoAbierta):
        ServicioCaja.registrar_cobro(
            db_session,
            CobroCreate(medio="efectivo", monto_centavos=1000),
            ahora=ahora,
        )


def test_registrar_cobro_caja_id_inexistente(db_session):
    import uuid

    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )

    with pytest.raises(CajaNoEncontrada):
        ServicioCaja.registrar_cobro(
            db_session,
            CobroCreate(
                caja_id=uuid.uuid4(), medio="efectivo", monto_centavos=1000
            ),
            ahora=ahora,
        )


def test_registrar_cobro_caja_id_cerrada(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    ServicioCaja.cerrar(
        db_session,
        CajaCerrar(monto_cierre_contado_centavos=5000),
        ahora=ahora,
    )

    with pytest.raises(CajaNoAbierta):
        ServicioCaja.registrar_cobro(
            db_session,
            CobroCreate(
                caja_id=caja.id, medio="efectivo", monto_centavos=1000
            ),
            ahora=ahora,
        )


def test_registrar_cobro_sin_caja_id_2330(db_session):
    ahora_2330 = datetime(2026, 11, 4, 23, 30, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora_2330
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(medio="efectivo", monto_centavos=2000),
        ahora=ahora_2330,
    )
    assert cobro.caja_id == caja.id


def test_cobro_os_genera_liquidacion(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(
            caja_id=caja.id,
            medio="obra_social",
            monto_centavos=10000,
            nomenclador_codigo="01.01",
            cobertura_centavos=7000,
        ),
        ahora=ahora,
    )
    liq = (
        db_session.query(LiquidacionOS)
        .filter(LiquidacionOS.cobro_id == cobro.id)
        .one()
    )
    assert liq.nomenclador_codigo == "01.01"
    assert liq.monto_total_centavos == 10000
    assert liq.cobertura_centavos == 7000
    assert liq.copago_centavos == 3000
    assert liq.estado == "pendiente"
    assert liq.creado_en == ahora


def test_registrar_cobro_os_calcula_copago(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(
            caja_id=caja.id,
            medio="obra_social",
            monto_centavos=8000,
            nomenclador_codigo="01.02",
            cobertura_centavos=5000,
        ),
        ahora=ahora,
    )
    liq = (
        db_session.query(LiquidacionOS)
        .filter(LiquidacionOS.cobro_id == cobro.id)
        .one()
    )
    assert liq.copago_centavos == 3000


def test_registrar_cobro_os_cobertura_ausente(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    # cobertura_centavos=None debe tratarse como 0 (D22)
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(
            caja_id=caja.id,
            medio="obra_social",
            monto_centavos=6000,
            nomenclador_codigo="01.03",
            cobertura_centavos=None,
        ),
        ahora=ahora,
    )
    liq = (
        db_session.query(LiquidacionOS)
        .filter(LiquidacionOS.cobro_id == cobro.id)
        .one()
    )
    assert liq.cobertura_centavos == 0
    assert liq.copago_centavos == 6000


def test_registrar_cobro_os_copago_no_genera_cobro(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(
            caja_id=caja.id,
            medio="obra_social",
            monto_centavos=10000,
            nomenclador_codigo="01.01",
            cobertura_centavos=7000,
        ),
        ahora=ahora,
    )
    # Solo debe existir 1 fila de cobro en toda la tabla
    todos_los_cobros = db_session.query(Cobro).all()
    assert len(todos_los_cobros) == 1
    assert todos_los_cobros[0].id == cobro.id


def test_registrar_cobro_os_cobertura_invalida(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    # Bypassear schema con construct para ejercitar la defensa en servicio
    datos_malos = CobroCreate.model_construct(
        caja_id=caja.id,
        medio="obra_social",
        monto_centavos=5000,
        nomenclador_codigo="01.01",
        cobertura_centavos=8000,
        concepto="total",
    )
    with pytest.raises(CoberturaInvalida):
        ServicioCaja.registrar_cobro(db_session, datos_malos, ahora=ahora)


# ---------------------------------------------------------------------------
# 4.4: anular
# ---------------------------------------------------------------------------


def test_anular_valido(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(caja_id=caja.id, medio="efectivo", monto_centavos=3000),
        ahora=ahora,
    )
    ahora_anular = datetime(2026, 11, 4, 12, 0, tzinfo=ZONA)
    cobro_anulado = ServicioCaja.anular_cobro(
        db_session,
        cobro.id,
        AnularCobro(motivo="error de tipeo"),
        ahora=ahora_anular,
    )
    assert cobro_anulado.id == cobro.id
    assert cobro_anulado.estado == "anulado"
    assert cobro_anulado.motivo_anulacion == "error de tipeo"
    assert cobro_anulado.anulado_en == ahora_anular


def test_anular_inexistente(db_session):
    import uuid

    with pytest.raises(CobroNoEncontrado):
        ServicioCaja.anular_cobro(
            db_session,
            uuid.uuid4(),
            AnularCobro(motivo="error"),
        )


def test_anular_ya_anulado(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(caja_id=caja.id, medio="efectivo", monto_centavos=3000),
        ahora=ahora,
    )
    ServicioCaja.anular_cobro(
        db_session, cobro.id, AnularCobro(motivo="primera")
    )
    with pytest.raises(CobroYaAnulado):
        ServicioCaja.anular_cobro(
            db_session, cobro.id, AnularCobro(motivo="segunda")
        )


def test_anular_caja_cerrada(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(caja_id=caja.id, medio="efectivo", monto_centavos=3000),
        ahora=ahora,
    )
    ServicioCaja.cerrar(
        db_session,
        CajaCerrar(monto_cierre_contado_centavos=8000),
        ahora=ahora,
    )
    with pytest.raises(CajaCerrada):
        ServicioCaja.anular_cobro(
            db_session, cobro.id, AnularCobro(motivo="tarde")
        )


def test_anular_cobro_facturado(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(caja_id=caja.id, medio="efectivo", monto_centavos=3000),
        ahora=ahora,
    )
    cobro.factura_cae = "SIM-99999"
    cobro.facturado_en = ahora
    db_session.flush()

    with pytest.raises(CobroFacturado):
        ServicioCaja.anular_cobro(
            db_session, cobro.id, AnularCobro(motivo="intento con factura")
        )


def test_anular_cobro_os_anula_liquidacion(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(
            caja_id=caja.id,
            medio="obra_social",
            monto_centavos=10000,
            nomenclador_codigo="01.01",
            cobertura_centavos=7000,
        ),
        ahora=ahora,
    )
    liq = (
        db_session.query(LiquidacionOS)
        .filter(LiquidacionOS.cobro_id == cobro.id)
        .one()
    )
    assert liq.estado == "pendiente"

    ServicioCaja.anular_cobro(
        db_session, cobro.id, AnularCobro(motivo="cancelado")
    )
    db_session.refresh(liq)
    assert liq.estado == "anulada"


def test_anular_sin_motivo(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(caja_id=caja.id, medio="efectivo", monto_centavos=3000),
        ahora=ahora,
    )
    with pytest.raises(MotivoRequerido):
        ServicioCaja.anular_cobro(
            db_session,
            cobro.id,
            AnularCobro.model_construct(motivo=""),
        )


# ---------------------------------------------------------------------------
# 4.5: facturar_arca
# ---------------------------------------------------------------------------


def test_factura_b_simulada(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(caja_id=caja.id, medio="efectivo", monto_centavos=3000),
        ahora=ahora,
    )
    ahora_fact = datetime(2026, 11, 4, 10, 30, tzinfo=ZONA)
    cobro_f = ServicioCaja.facturar_arca(
        db_session,
        cobro.id,
        FacturaArcaCreate(tipo="B"),
        ahora=ahora_fact,
    )
    assert cobro_f.id == cobro.id
    assert cobro_f.factura_tipo == "B"
    assert cobro_f.factura_cae is not None
    assert cobro_f.factura_cae.startswith("SIM-")
    assert cobro_f.factura_qr is not None
    assert cobro_f.facturado_en == ahora_fact


def test_factura_no_muta_simulado(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    # Cobro en efectivo nace con simulado=False
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(caja_id=caja.id, medio="efectivo", monto_centavos=3000),
        ahora=ahora,
    )
    assert cobro.simulado is False

    cobro_f = ServicioCaja.facturar_arca(
        db_session,
        cobro.id,
        FacturaArcaCreate(tipo="B"),
        ahora=ahora,
    )
    # Facturación no muta el flag del cobro (D8)
    assert cobro_f.simulado is False


def test_factura_ya_emitida(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(caja_id=caja.id, medio="efectivo", monto_centavos=3000),
        ahora=ahora,
    )
    ServicioCaja.facturar_arca(
        db_session,
        cobro.id,
        FacturaArcaCreate(tipo="B"),
        ahora=ahora,
    )
    with pytest.raises(CobroYaFacturado):
        ServicioCaja.facturar_arca(
            db_session,
            cobro.id,
            FacturaArcaCreate(tipo="B"),
            ahora=ahora,
        )


def test_factura_cobro_inexistente(db_session):
    import uuid

    with pytest.raises(CobroNoEncontrado):
        ServicioCaja.facturar_arca(
            db_session,
            uuid.uuid4(),
            FacturaArcaCreate(tipo="B"),
        )


def test_factura_cobro_anulado(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(caja_id=caja.id, medio="efectivo", monto_centavos=3000),
        ahora=ahora,
    )
    ServicioCaja.anular_cobro(
        db_session, cobro.id, AnularCobro(motivo="cancelado")
    )
    with pytest.raises(CobroAnulado):
        ServicioCaja.facturar_arca(
            db_session,
            cobro.id,
            FacturaArcaCreate(tipo="B"),
            ahora=ahora,
        )


def test_factura_cobro_os(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(
            caja_id=caja.id,
            medio="obra_social",
            monto_centavos=5000,
            nomenclador_codigo="01.01",
            cobertura_centavos=3000,
        ),
        ahora=ahora,
    )
    with pytest.raises(MedioNoFacturable):
        ServicioCaja.facturar_arca(
            db_session,
            cobro.id,
            FacturaArcaCreate(tipo="B"),
            ahora=ahora,
        )


def test_factura_tipo_invalido(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(caja_id=caja.id, medio="efectivo", monto_centavos=3000),
        ahora=ahora,
    )
    with pytest.raises(TipoFacturaInvalido):
        ServicioCaja.facturar_arca(
            db_session,
            cobro.id,
            FacturaArcaCreate.model_construct(tipo="A"),
            ahora=ahora,
        )


# ---------------------------------------------------------------------------
# 4.6: listar_liquidaciones
# ---------------------------------------------------------------------------


def test_listado_liquidaciones_vacio(db_session):
    liquidaciones = ServicioCaja.listar_liquidaciones(db_session)
    assert liquidaciones == []


def test_listado_liquidaciones_orden(db_session):
    ahora_1 = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    ahora_2 = datetime(2026, 11, 4, 11, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora_1
    )
    cobro_1 = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(
            caja_id=caja.id,
            medio="obra_social",
            monto_centavos=5000,
            nomenclador_codigo="01.01",
        ),
        ahora=ahora_1,
    )
    cobro_2 = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(
            caja_id=caja.id,
            medio="obra_social",
            monto_centavos=6000,
            nomenclador_codigo="01.02",
        ),
        ahora=ahora_2,
    )

    lista = ServicioCaja.listar_liquidaciones(db_session)
    assert len(lista) == 2
    # Orden creado_en desc: el segundo cobro primero
    assert lista[0].cobro_id == cobro_2.id
    assert lista[1].cobro_id == cobro_1.id


def test_listado_liquidaciones_pdf_referencia(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(
            caja_id=caja.id,
            medio="obra_social",
            monto_centavos=5000,
            nomenclador_codigo="01.01",
        ),
        ahora=ahora,
    )
    lista = ServicioCaja.listar_liquidaciones(db_session)
    assert len(lista) == 1
    liq = lista[0]
    assert liq.cobro_id == cobro.id
    assert liq.pdf_referencia is not None
    assert liq.pdf_referencia.startswith("SIM-liquidacion-")
    assert liq.pdf_referencia.endswith(".pdf")


def test_listado_liquidaciones_incluye_anulada(db_session):
    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    cobro = ServicioCaja.registrar_cobro(
        db_session,
        CobroCreate(
            caja_id=caja.id,
            medio="obra_social",
            monto_centavos=5000,
            nomenclador_codigo="01.01",
        ),
        ahora=ahora,
    )
    ServicioCaja.anular_cobro(
        db_session, cobro.id, AnularCobro(motivo="baja de cobro")
    )

    lista = ServicioCaja.listar_liquidaciones(db_session)
    assert len(lista) == 1
    assert lista[0].cobro_id == cobro.id
    assert lista[0].estado == "anulada"


# ---------------------------------------------------------------------------
# 4.7: FKs y traducción de IntegrityError
# ---------------------------------------------------------------------------


def test_cobro_turno_inexistente(db_session):
    import uuid

    ahora = datetime(2026, 11, 4, 10, 0, tzinfo=ZONA)
    caja = ServicioCaja.abrir(
        db_session, CajaAbrir(monto_apertura_centavos=5000), ahora=ahora
    )
    with pytest.raises(TurnoNoEncontrado):
        ServicioCaja.registrar_cobro(
            db_session,
            CobroCreate(
                caja_id=caja.id,
                turno_id=uuid.uuid4(),
                medio="efectivo",
                monto_centavos=2000,
            ),
            ahora=ahora,
        )


def test_integrity_error_traduce_409(db_session):
    from unittest.mock import patch

    from sqlalchemy.exc import IntegrityError

    orig_flush = db_session.flush

    def flush_wrapper(*args, **kwargs):
        for obj in db_session.new:
            if isinstance(obj, Caja):
                raise IntegrityError("INSERT", {}, Exception("duplicate key"))
        return orig_flush(*args, **kwargs)

    # Simular una colisión de unicidad que supere la consulta previa
    with patch.object(db_session, "flush", side_effect=flush_wrapper):  # noqa: SIM117
        with pytest.raises(CajaYaAbierta):
            ServicioCaja.abrir(
                db_session,
                CajaAbrir(monto_apertura_centavos=5000),
                ahora=datetime(2026, 11, 5, 10, 0, tzinfo=ZONA),
            )







