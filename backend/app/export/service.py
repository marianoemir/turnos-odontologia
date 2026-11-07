"""Servicio de exportación total (C-11, grupo 9, design D7).

Consulta los 4 dominios directamente con SQLAlchemy (sin HTTP interno).
Filtrado por período: turnos por `inicio`, cajas por `fecha`, cobros y
liquidaciones por `creado_en`. Pacientes, historia clínica y catálogo de
agenda (profesionales, sillones, prestaciones) se exportan completos.
El reloj llega inyectado desde el router (`backend.app.caja.reloj`).
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from backend.app.agenda.models import (
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
)
from backend.app.caja.models import Caja, Cobro, LiquidacionOS
from backend.app.export.schemas import (
    CONTRATO_VERSION,
    ZONA_NOMBRE,
)
from backend.app.hc.models import (
    EntradaHC,
    HistoriaClinica,
    Odontograma,
    PlanItem,
    PlanTratamiento,
)
from backend.app.turnos.models import Turno
from backend.app.turnos.service import ZONA

DIAS_MAXIMOS = 30


def resolver_periodo(
    ahora: datetime, desde: date | None, hasta: date | None
) -> tuple[date, date, int]:
    """Resuelve el período validando rango; levanta ValueError si es 422."""
    hoy = ahora.astimezone(ZONA).date()
    hasta_res = hasta if hasta is not None else hoy
    desde_res = desde if desde is not None else hasta_res - timedelta(days=29)
    dias = (hasta_res - desde_res).days + 1
    if dias < 1:
        raise ValueError("El período está invertido: desde es posterior a hasta")
    if dias > DIAS_MAXIMOS:
        raise ValueError(
            f"El período supera los {DIAS_MAXIMOS} días máximos "
            f"({dias} días pedidos)"
        )
    return desde_res, hasta_res, dias


def _rango_datetimes(desde: date, hasta: date) -> tuple[datetime, datetime]:
    inicio = datetime.combine(desde, time.min, tzinfo=ZONA)
    fin = datetime.combine(hasta + timedelta(days=1), time.min, tzinfo=ZONA)
    return inicio, fin


def _iso(valor: datetime | date | None) -> str | None:
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor.isoformat()
    return valor.isoformat()


def _dict_paciente(p: Paciente) -> dict:
    return {
        "id": str(p.id),
        "nombre": p.nombre,
        "dni": p.dni,
        "contacto": p.contacto,
        "ficticio": p.ficticio,
        "activo": p.activo,
    }


def _dict_turno(t: Turno) -> dict:
    return {
        "id": str(t.id),
        "paciente_id": str(t.paciente_id),
        "profesional_id": str(t.profesional_id),
        "sillon_id": str(t.sillon_id),
        "prestacion_id": str(t.prestacion_id),
        "inicio": _iso(t.inicio),
        "fin": _iso(t.fin),
        "estado": t.estado,
        "creado_por": t.creado_por,
    }


def _dict_caja(c: Caja) -> dict:
    return {
        "id": str(c.id),
        "fecha": _iso(c.fecha),
        "monto_apertura_centavos": c.monto_apertura_centavos,
        "abierto_en": _iso(c.abierto_en),
        "cerrado_en": _iso(c.cerrado_en),
        "monto_cierre_contado_centavos": c.monto_cierre_contado_centavos,
        "monto_esperado_centavos": c.monto_esperado_centavos,
        "diferencia_centavos": c.diferencia_centavos,
        "estado": c.estado,
    }


def _dict_cobro(c: Cobro) -> dict:
    return {
        "id": str(c.id),
        "caja_id": str(c.caja_id),
        "turno_id": str(c.turno_id) if c.turno_id else None,
        "medio": c.medio,
        "concepto": c.concepto,
        "monto_centavos": c.monto_centavos,
        "estado": c.estado,
        "motivo_anulacion": c.motivo_anulacion,
        "anulado_en": _iso(c.anulado_en),
        "creado_en": _iso(c.creado_en),
    }


def _dict_liquidacion(l: LiquidacionOS) -> dict:
    return {
        "id": str(l.id),
        "cobro_id": str(l.cobro_id),
        "nomenclador_codigo": l.nomenclador_codigo,
        "descripcion": l.descripcion,
        "monto_total_centavos": l.monto_total_centavos,
        "cobertura_centavos": l.cobertura_centavos,
        "copago_centavos": l.copago_centavos,
        "estado": l.estado,
        "pdf_referencia": l.pdf_referencia,
        "creado_en": _iso(l.creado_en),
    }


def construir_export(
    session: Session, ahora: datetime, desde: date | None, hasta: date | None
) -> dict:
    desde_res, hasta_res, dias = resolver_periodo(ahora, desde, hasta)
    inicio_dt, fin_dt = _rango_datetimes(desde_res, hasta_res)

    pacientes = [
        _dict_paciente(p)
        for p in session.query(Paciente).order_by(Paciente.nombre, Paciente.id)
    ]
    historias = [
        {
            "id": str(h.id),
            "paciente_id": str(h.paciente_id),
            "antecedentes": h.antecedentes,
            "alergias": h.alergias,
            "observaciones": h.observaciones,
            "creado_en": _iso(h.creado_en),
        }
        for h in session.query(HistoriaClinica).order_by(HistoriaClinica.id)
    ]
    entradas = [
        {
            "id": str(e.id),
            "historia_clinica_id": str(e.historia_clinica_id),
            "profesional_id": str(e.profesional_id),
            "fecha": _iso(e.fecha),
            "texto": e.texto,
            "creado_en": _iso(e.creado_en),
        }
        for e in session.query(EntradaHC).order_by(EntradaHC.fecha, EntradaHC.id)
    ]
    odontogramas = [
        {
            "id": str(o.id),
            "paciente_id": str(o.paciente_id),
            "pieza": o.pieza,
            "estado": o.estado,
            "profesional_id": str(o.profesional_id),
            "fecha": _iso(o.fecha),
            "creado_en": _iso(o.creado_en),
        }
        for o in session.query(Odontograma).order_by(Odontograma.fecha)
    ]
    planes = [
        {
            "id": str(p.id),
            "paciente_id": str(p.paciente_id),
            "profesional_id": str(p.profesional_id),
            "estado": p.estado,
            "creado_en": _iso(p.creado_en),
        }
        for p in session.query(PlanTratamiento).order_by(PlanTratamiento.id)
    ]
    items = [
        {
            "id": str(i.id),
            "plan_id": str(i.plan_id),
            "pieza": i.pieza,
            "prestacion_id": str(i.prestacion_id),
            "estado": i.estado,
            "monto_centavos": i.monto_centavos,
            "monto_cobertura_centavos": i.monto_cobertura_centavos,
        }
        for i in session.query(PlanItem).order_by(PlanItem.plan_id, PlanItem.id)
    ]

    turnos = [
        _dict_turno(t)
        for t in session.query(Turno)
        .filter(Turno.inicio >= inicio_dt, Turno.inicio < fin_dt)
        .order_by(Turno.inicio, Turno.id)
    ]
    profesionales = [
        {
            "id": str(p.id),
            "nombre": p.nombre,
            "matricula": p.matricula,
            "sucursal_id": str(p.sucursal_id) if p.sucursal_id else None,
            "activo": p.activo,
        }
        for p in session.query(Profesional).order_by(Profesional.nombre)
    ]
    sillones = [
        {
            "id": str(s.id),
            "nombre": s.nombre,
            "sucursal_id": str(s.sucursal_id) if s.sucursal_id else None,
            "activo": s.activo,
        }
        for s in session.query(SillonBox).order_by(SillonBox.nombre)
    ]
    prestaciones = [
        {
            "id": str(p.id),
            "nombre": p.nombre,
            "duracion_min": p.duracion_min,
            "activo": p.activo,
        }
        for p in session.query(Prestacion).order_by(Prestacion.nombre)
    ]

    cajas = [
        _dict_caja(c)
        for c in session.query(Caja)
        .filter(Caja.fecha >= desde_res, Caja.fecha <= hasta_res)
        .order_by(Caja.fecha)
    ]
    cobros = [
        _dict_cobro(c)
        for c in session.query(Cobro)
        .filter(Cobro.creado_en >= inicio_dt, Cobro.creado_en < fin_dt)
        .order_by(Cobro.creado_en, Cobro.id)
    ]
    liquidaciones = [
        _dict_liquidacion(l)
        for l in session.query(LiquidacionOS)
        .filter(LiquidacionOS.creado_en >= inicio_dt, LiquidacionOS.creado_en < fin_dt)
        .order_by(LiquidacionOS.creado_en, LiquidacionOS.id)
    ]

    return {
        "contrato_version": CONTRATO_VERSION,
        "generado_en": ahora.astimezone(ZONA).isoformat(),
        "zona": ZONA_NOMBRE,
        "periodo": {
            "desde": desde_res.isoformat(),
            "hasta": hasta_res.isoformat(),
            "dias": dias,
        },
        "pacientes": pacientes,
        "historia_clinica": {
            "historias": historias,
            "entradas": entradas,
            "odontogramas": odontogramas,
            "planes": planes,
            "items": items,
        },
        "agenda": {
            "turnos": turnos,
            "profesionales": profesionales,
            "sillones": sillones,
            "prestaciones": prestaciones,
        },
        "caja": {
            "cajas": cajas,
            "cobros": cobros,
            "liquidaciones_os": liquidaciones,
        },
    }
