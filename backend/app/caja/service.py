"""Servicio de caja, cobros, liquidaciones OS y facturación ARCA (C-10)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.caja.models import (
    CONCEPTOS_COBRO,
    MEDIOS_COBRO,
    MONTO_MAX_CENTAVOS,
    Caja,
    Cobro,
    LiquidacionOS,
)
from backend.app.caja.reloj import ahora_local, hoy_local
from backend.app.turnos.models import Turno

if TYPE_CHECKING:
    from backend.app.caja.schemas import (
        AnularCobro,
        CajaAbrir,
        CajaCerrar,
        CobroCreate,
        FacturaArcaCreate,
    )


# ---------------------------------------------------------------------------
# Excepciones de dominio
# ---------------------------------------------------------------------------


class CajaException(Exception):
    """Base para excepciones de caja."""


class CajaNoEncontrada(CajaException):
    pass


class CajaYaAbierta(CajaException):
    pass


class CajaNoAbierta(CajaException):
    pass


class CajaYaCerrada(CajaException):
    pass


class CajaCerrada(CajaException):
    pass


class CobroNoEncontrado(CajaException):
    pass


class CobroYaAnulado(CajaException):
    pass


class CobroAnulado(CajaException):
    pass


class CobroYaFacturado(CajaException):
    pass


class CobroFacturado(CajaException):
    pass


class MedioNoFacturable(CajaException):
    pass


class TurnoNoEncontrado(CajaException):
    pass


class MontoInvalido(CajaException):
    pass


class MedioInvalido(CajaException):
    pass


class TipoFacturaInvalido(CajaException):
    pass


class CoberturaInvalida(CajaException):
    pass


class MotivoRequerido(CajaException):
    pass


# ---------------------------------------------------------------------------
# Servicio
# ---------------------------------------------------------------------------


class ServicioCaja:
    """Servicio sin estado para operaciones de caja y cobros."""

    @staticmethod
    def _calcular_totales_por_medio(
        session: Session, caja_id: uuid.UUID
    ) -> dict[str, int]:
        cobros = (
            session.query(Cobro)
            .filter(Cobro.caja_id == caja_id, Cobro.estado == "registrado")
            .all()
        )
        totales: dict[str, int] = {}
        for c in cobros:
            totales[c.medio] = totales.get(c.medio, 0) + c.monto_centavos
        return totales

    @staticmethod
    def abrir(
        session: Session,
        datos: CajaAbrir,
        *,
        ahora: datetime | None = None,
    ) -> Caja:
        instante = ahora if ahora is not None else ahora_local()
        fecha = hoy_local(instante)

        if not (0 <= datos.monto_apertura_centavos <= MONTO_MAX_CENTAVOS):
            raise MontoInvalido("monto de apertura fuera de rango")

        existente = (
            session.query(Caja)
            .filter(Caja.fecha == fecha)
            .with_for_update()
            .one_or_none()
        )
        if existente:
            if existente.estado == "abierta":
                raise CajaYaAbierta(
                    f"Ya existe una caja abierta para la fecha {fecha}"
                )
            raise CajaYaCerrada(
                f"La caja para la fecha {fecha} ya fue cerrada"
            )

        caja = Caja(
            fecha=fecha,
            monto_apertura_centavos=datos.monto_apertura_centavos,
            abierto_en=instante,
            estado="abierta",
        )
        session.add(caja)
        try:
            session.flush()
        except IntegrityError as exc:
            raise CajaYaAbierta(
                f"Ya existe una caja abierta para la fecha {fecha}"
            ) from exc
        caja.totales_por_medio_centavos = {}
        return caja

    @staticmethod
    def cerrar(
        session: Session,
        datos: CajaCerrar,
        *,
        ahora: datetime | None = None,
    ) -> Caja:
        instante = ahora if ahora is not None else ahora_local()
        fecha = datos.fecha if datos.fecha is not None else hoy_local(instante)

        if not (0 <= datos.monto_cierre_contado_centavos <= MONTO_MAX_CENTAVOS):
            raise MontoInvalido("monto de cierre contado fuera de rango")

        caja = (
            session.query(Caja)
            .filter(Caja.fecha == fecha)
            .with_for_update()
            .one_or_none()
        )
        if not caja:
            raise CajaNoAbierta(f"No existe caja para la fecha {fecha}")
        if caja.estado == "cerrada":
            raise CajaYaCerrada(f"La caja del día {fecha} ya está cerrada")

        cobros = (
            session.query(Cobro)
            .filter(Cobro.caja_id == caja.id, Cobro.estado == "registrado")
            .all()
        )
        total_efectivo = sum(
            c.monto_centavos for c in cobros if c.medio == "efectivo"
        )
        esperado = caja.monto_apertura_centavos + total_efectivo
        diferencia = datos.monto_cierre_contado_centavos - esperado

        caja.monto_cierre_contado_centavos = datos.monto_cierre_contado_centavos
        caja.monto_esperado_centavos = esperado
        caja.diferencia_centavos = diferencia
        caja.cerrado_en = instante
        caja.estado = "cerrada"

        totales: dict[str, int] = {}
        for c in cobros:
            totales[c.medio] = totales.get(c.medio, 0) + c.monto_centavos
        caja.totales_por_medio_centavos = totales

        session.flush()
        return caja

    @classmethod
    def obtener(cls, session: Session, id: uuid.UUID) -> Caja:
        caja = session.query(Caja).filter(Caja.id == id).one_or_none()
        if not caja:
            raise CajaNoEncontrada(f"caja no existe: {id}")
        caja.totales_por_medio_centavos = cls._calcular_totales_por_medio(
            session, caja.id
        )
        return caja

    @classmethod
    def obtener_por_fecha(
        cls,
        session: Session,
        fecha: date | None = None,
        *,
        ahora: datetime | None = None,
    ) -> Caja:
        instante = ahora if ahora is not None else ahora_local()
        fecha_real = fecha if fecha is not None else hoy_local(instante)

        caja = (
            session.query(Caja)
            .filter(Caja.fecha == fecha_real)
            .one_or_none()
        )
        if not caja:
            raise CajaNoEncontrada(
                f"caja no existe para la fecha {fecha_real}"
            )
        caja.totales_por_medio_centavos = cls._calcular_totales_por_medio(
            session, caja.id
        )
        return caja

    @staticmethod
    def registrar_cobro(
        session: Session,
        datos: CobroCreate,
        *,
        ahora: datetime | None = None,
    ) -> Cobro:
        instante = ahora if ahora is not None else ahora_local()

        if datos.caja_id is not None:
            caja = (
                session.query(Caja)
                .filter(Caja.id == datos.caja_id)
                .with_for_update()
                .one_or_none()
            )
            if not caja:
                raise CajaNoEncontrada(f"caja no existe: {datos.caja_id}")
            if caja.estado == "cerrada":
                raise CajaNoAbierta(f"La caja {datos.caja_id} está cerrada")
        else:
            fecha_hoy = hoy_local(instante)
            caja = (
                session.query(Caja)
                .filter(Caja.fecha == fecha_hoy)
                .with_for_update()
                .one_or_none()
            )
            if not caja or caja.estado == "cerrada":
                raise CajaNoAbierta(
                    f"No hay caja abierta para la fecha {fecha_hoy}"
                )

        if datos.turno_id is not None:
            turno = (
                session.query(Turno)
                .filter(Turno.id == datos.turno_id)
                .one_or_none()
            )
            if not turno:
                raise TurnoNoEncontrado(f"turno no existe: {datos.turno_id}")

        if datos.medio not in MEDIOS_COBRO:
            raise MedioInvalido(f"medio inválido: {datos.medio}")
        if datos.concepto not in CONCEPTOS_COBRO:
            raise MedioInvalido(f"concepto inválido: {datos.concepto}")
        if not (1 <= datos.monto_centavos <= MONTO_MAX_CENTAVOS):
            raise MontoInvalido(f"monto fuera de rango: {datos.monto_centavos}")

        simulado = datos.medio == "mercado_pago"

        if datos.medio == "obra_social":
            cobertura = (
                datos.cobertura_centavos
                if datos.cobertura_centavos is not None
                else 0
            )
            if not (0 <= cobertura <= datos.monto_centavos):
                raise CoberturaInvalida(
                    "cobertura no puede exceder el monto total"
                )
            copago = datos.monto_centavos - cobertura
        else:
            cobertura = 0
            copago = 0

        cobro = Cobro(
            caja_id=caja.id,
            turno_id=datos.turno_id,
            medio=datos.medio,
            concepto=datos.concepto,
            monto_centavos=datos.monto_centavos,
            estado="registrado",
            simulado=simulado,
            creado_en=instante,
        )
        session.add(cobro)
        try:
            session.flush()
        except IntegrityError as exc:
            raise CajaNoAbierta(
                "Conflicto de integridad al registrar cobro contra caja"
            ) from exc

        if datos.medio == "obra_social":
            liq_id = uuid.uuid4()
            liq = LiquidacionOS(
                id=liq_id,
                cobro_id=cobro.id,
                nomenclador_codigo=datos.nomenclador_codigo or "",
                monto_total_centavos=datos.monto_centavos,
                cobertura_centavos=cobertura,
                copago_centavos=copago,
                estado="pendiente",
                pdf_referencia=f"SIM-liquidacion-{liq_id}.pdf",
                creado_en=instante,
            )
            session.add(liq)
            try:
                session.flush()
            except IntegrityError as exc:
                raise CajaNoAbierta(
                    "Conflicto de integridad al registrar liquidacion OS"
                ) from exc


        return cobro

    @staticmethod
    def obtener_cobro(session: Session, id: uuid.UUID) -> Cobro:
        cobro = session.query(Cobro).filter(Cobro.id == id).one_or_none()
        if not cobro:
            raise CobroNoEncontrado(f"cobro no existe: {id}")
        return cobro

    @staticmethod
    def anular_cobro(
        session: Session,
        id: uuid.UUID,
        datos: AnularCobro,
        *,
        ahora: datetime | None = None,
    ) -> Cobro:
        instante = ahora if ahora is not None else ahora_local()

        if not datos.motivo or not datos.motivo.strip():
            raise MotivoRequerido("motivo de anulación es obligatorio")

        cobro_previo = (
            session.query(Cobro).filter(Cobro.id == id).one_or_none()
        )
        if not cobro_previo:
            raise CobroNoEncontrado(f"cobro no existe: {id}")

        # Orden de locks (D19): caja -> cobro -> liquidacion_os
        caja = (
            session.query(Caja)
            .filter(Caja.id == cobro_previo.caja_id)
            .with_for_update()
            .one_or_none()
        )
        cobro = (
            session.query(Cobro)
            .filter(Cobro.id == id)
            .with_for_update()
            .one()
        )

        # Precedencia de rechazos (D26): cobro_ya_anulado -> caja_cerrada -> cobro_facturado
        if cobro.estado == "anulado":
            raise CobroYaAnulado(f"El cobro {id} ya está anulado")
        if caja and caja.estado == "cerrada":
            raise CajaCerrada(
                f"La caja {caja.id} está cerrada; no se puede anular el cobro"
            )
        if cobro.factura_cae is not None or cobro.facturado_en is not None:
            raise CobroFacturado(
                f"El cobro {id} ya tiene factura emitida y no puede anularse"
            )

        cobro.estado = "anulado"
        cobro.motivo_anulacion = datos.motivo.strip()
        cobro.anulado_en = instante

        if cobro.medio == "obra_social":
            liq = (
                session.query(LiquidacionOS)
                .filter(LiquidacionOS.cobro_id == cobro.id)
                .with_for_update()
                .one_or_none()
            )
            if liq:
                liq.estado = "anulada"

        session.flush()
        return cobro

    @staticmethod
    def facturar_arca(
        session: Session,
        id: uuid.UUID,
        datos: FacturaArcaCreate,
        *,
        ahora: datetime | None = None,
    ) -> Cobro:
        instante = ahora if ahora is not None else ahora_local()

        if datos.tipo not in ("B", "C"):
            raise TipoFacturaInvalido(
                f"tipo de factura inválido: {datos.tipo}"
            )

        cobro = (
            session.query(Cobro)
            .filter(Cobro.id == id)
            .with_for_update()
            .one_or_none()
        )
        if not cobro:
            raise CobroNoEncontrado(f"cobro no existe: {id}")
        if cobro.estado == "anulado":
            raise CobroAnulado(f"cobro {id} está anulado")
        if cobro.factura_cae is not None or cobro.facturado_en is not None:
            raise CobroYaFacturado(f"cobro {id} ya fue facturado")
        if cobro.medio == "obra_social":
            raise MedioNoFacturable(
                f"cobro {id} con medio obra_social no es facturable vía ARCA"
            )

        cobro.factura_tipo = datos.tipo
        cobro.factura_cae = f"SIM-{uuid.uuid4().hex[:14]}"
        cobro.factura_qr = f"https://www.afip.gob.ar/fe/qr/?p=SIM-{cobro.id}"
        cobro.facturado_en = instante

        session.flush()
        return cobro

    @staticmethod
    def listar_liquidaciones(session: Session) -> list[LiquidacionOS]:
        return (
            session.query(LiquidacionOS)
            .order_by(LiquidacionOS.creado_en.desc())
            .all()
        )





