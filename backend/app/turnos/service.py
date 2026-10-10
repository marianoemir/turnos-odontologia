"""ServicioTurnos (C-03, D12): unico punto de validacion.

`crear = validar + insert`. `validar` es reutilizable por C-04
(reprogramar valida "igual que crear"). Todo 409 es atomico: se
valida TODO antes de `session.add`, sin commit parcial.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from backend.app.agenda.models import (
    Bloqueo,
    HorarioAtencion,
    Paciente,
    Prestacion,
    Profesional,
    SillonBox,
    bloqueo_aplica,
)
from backend.app.turnos.models import ESTADOS_ACTIVOS, Turno

ZONA = ZoneInfo("America/Argentina/Buenos_Aires")


class TurnoInvalido(Exception):
    """Input malformado o recurso desactivado -> 422."""

    def __init__(self, detalle: str):
        super().__init__(detalle)
        self.detalle = detalle


class TurnoNoEncontrado(Exception):
    """FK bien formada pero inexistente -> 404."""

    def __init__(self, recurso: str, ref_id: uuid.UUID):
        super().__init__(f"{recurso} no existe: {ref_id}")
        self.recurso = recurso
        self.ref_id = ref_id
        self.detalle = f"{recurso} no existe: {ref_id}"


class ConflictoTurno(Exception):
    """Solape/horario/bloqueo -> 409 con causa ordenada."""

    def __init__(self, causa: str, detalle: str):
        super().__init__(detalle)
        self.causa = causa
        self.detalle = detalle


class ServicioTurnos:
    @staticmethod
    def crear(
        session,
        *,
        paciente_id: uuid.UUID,
        profesional_id: uuid.UUID,
        sillon_id: uuid.UUID,
        prestacion_id: uuid.UUID,
        inicio: datetime,
        creado_por: str | None = None,
    ) -> Turno:
        fin = ServicioTurnos.validar(
            session,
            paciente_id=paciente_id,
            profesional_id=profesional_id,
            sillon_id=sillon_id,
            prestacion_id=prestacion_id,
            inicio=inicio,
        )
        turno = Turno(
            paciente_id=paciente_id,
            profesional_id=profesional_id,
            sillon_id=sillon_id,
            prestacion_id=prestacion_id,
            inicio=inicio,
            fin=fin,
            estado="pendiente",
            creado_por=creado_por,
        )
        session.add(turno)
        session.flush()
        return turno

    @staticmethod
    def validar(
        session,
        *,
        paciente_id: uuid.UUID,
        profesional_id: uuid.UUID,
        sillon_id: uuid.UUID,
        prestacion_id: uuid.UUID,
        inicio: datetime,
    ) -> datetime:
        if inicio.tzinfo is None or inicio.tzinfo.utcoffset(inicio) is None:
            raise TurnoInvalido("inicio debe tener zona horaria")
        for recurso, modelo, ref_id in (
            ("paciente", Paciente, paciente_id),
            ("profesional", Profesional, profesional_id),
            ("sillon", SillonBox, sillon_id),
        ):
            if session.get(modelo, ref_id) is None:
                raise TurnoNoEncontrado(recurso, ref_id)
        prestacion = session.get(Prestacion, prestacion_id)
        if prestacion is None:
            raise TurnoNoEncontrado("prestacion", prestacion_id)
        sillon = session.get(SillonBox, sillon_id)
        if not sillon.activo:
            raise TurnoInvalido("el sillon esta inactivo")
        fin = inicio + timedelta(minutes=prestacion.duracion_min)
        if not ServicioTurnos._cubierto_por_horario(
            session, profesional_id, inicio, fin
        ):
            raise ConflictoTurno(
                "horario",
                "el profesional no atiende durante todo "
                f"[{inicio}, {fin}) en America/Argentina/Buenos_Aires",
            )
        bloqueo = ServicioTurnos._bloqueo_aplicable(
            session, profesional_id, sillon_id, inicio, fin
        )
        if bloqueo is not None:
            raise ConflictoTurno(
                "bloqueo",
                f"bloqueo aplicable: {bloqueo.motivo}",
            )
        solape_prof = (
            session.query(Turno)
            .filter(
                Turno.profesional_id == profesional_id,
                Turno.estado.in_(ESTADOS_ACTIVOS),
                Turno.inicio < fin,
                Turno.fin > inicio,
            )
            .first()
        )
        if solape_prof is not None:
            raise ConflictoTurno(
                "profesional",
                "el profesional ya tiene un turno activo que "
                f"intersecta [{inicio}, {fin})",
            )
        solape_sillon = (
            session.query(Turno)
            .filter(
                Turno.sillon_id == sillon_id,
                Turno.estado.in_(ESTADOS_ACTIVOS),
                Turno.inicio < fin,
                Turno.fin > inicio,
            )
            .first()
        )
        if solape_sillon is not None:
            raise ConflictoTurno(
                "sillon",
                "el sillon ya tiene un turno activo que "
                f"intersecta [{inicio}, {fin})",
            )
        return fin

    @staticmethod
    def _cubierto_por_horario(
        session, profesional_id: uuid.UUID, inicio: datetime, fin: datetime
    ) -> bool:
        """Cobertura total del intervalo por HorarioAtencion (D9).

        Convierte a America/Argentina/Buenos_Aires, parte por dia local
        (los turnos que cruzan medianoche exigen cobertura en cada dia
        tocado, S5) y exige union continua de filas por dia. `weekday()`
        0=lunes coincide con el seed (range(5) Lun-Vie).
        """
        ini_loc = inicio.astimezone(ZONA)
        fin_loc = fin.astimezone(ZONA)
        filas = (
            session.query(HorarioAtencion)
            .filter_by(profesional_id=profesional_id)
            .all()
        )
        por_dia: dict[int, list] = {}
        for fila in filas:
            por_dia.setdefault(fila.dia_semana, []).append(fila)

        dia = ini_loc.date()
        ultimo = fin_loc.date()
        while True:
            dia_ini = datetime.combine(dia, datetime.min.time(), tzinfo=ZONA)
            dia_fin = dia_ini + timedelta(days=1)
            seg_ini = max(ini_loc, dia_ini)
            seg_fin = min(fin_loc, dia_fin)
            if seg_ini < seg_fin and not ServicioTurnos._dia_cubre(
                por_dia.get(dia.weekday(), []), dia, seg_ini, seg_fin
            ):
                return False
            if dia == ultimo:
                return True
            dia = date.fromordinal(dia.toordinal() + 1)

    @staticmethod
    def _dia_cubre(filas, dia, seg_ini, seg_fin) -> bool:
        intervalos = sorted(
            (
                max(
                    seg_ini,
                    datetime.combine(dia, f.desde, tzinfo=ZONA),
                ),
                min(seg_fin, datetime.combine(dia, f.hasta, tzinfo=ZONA)),
            )
            for f in filas
        )
        cursor = seg_ini
        for desde, hasta in intervalos:
            if desde <= cursor:
                cursor = max(cursor, hasta)
            if cursor >= seg_fin:
                return True
        return cursor >= seg_fin

    @staticmethod
    def _bloqueo_aplicable(
        session,
        profesional_id: uuid.UUID,
        sillon_id: uuid.UUID,
        inicio: datetime,
        fin: datetime,
    ):
        candidatos = (
            session.query(Bloqueo)
            .filter(Bloqueo.desde < fin, Bloqueo.hasta > inicio)
            .all()
        )
        for bloqueo in candidatos:
            if bloqueo_aplica(
                bloqueo, profesional_id, sillon_id, inicio, fin
            ):
                return bloqueo
        return None
