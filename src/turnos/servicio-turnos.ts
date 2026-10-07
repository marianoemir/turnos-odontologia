import { randomUUID } from 'node:crypto';
import type { Bloqueo, HorarioAtencion, Prestacion, SillonBox } from '../agenda/modelos';
import { solapan, type Intervalo } from './intervalos';
import type { RepositorioTurnos } from './repositorio-memoria';
import { ConflictoTurno, InputInvalido, type Turno } from './tipos';

export interface CrearTurnoInput {
  pacienteId: string;
  profesionalId: string;
  sillonId?: string;
  prestacion: Prestacion;
  inicio: Date;
}

export interface AgendaRef {
  horarios: HorarioAtencion[];
  bloqueos: Bloqueo[];
  sillones: SillonBox[];
}

/** Único punto de validación RN-AG-01..05. `validar` no persiste (reuso C-04). */
export class ServicioTurnos {
  constructor(private readonly repo: RepositorioTurnos) {}

  validar(input: CrearTurnoInput, agenda: AgendaRef): Turno {
    const sillon = agenda.sillones.find((s) => s.id === input.sillonId);
    if (!input.sillonId || !sillon || !sillon.activo) {
      throw new InputInvalido('sillon obligatorio y activo');
    }
    if (!input.prestacion || input.prestacion.duracionMin <= 0) {
      throw new InputInvalido('prestacion con duracionMin > 0');
    }
    const fin = new Date(input.inicio.getTime() + input.prestacion.duracionMin * 60000);
    const intervalo: Intervalo = { inicio: input.inicio, fin };

    const dia = input.inicio.getDay();
    const min = (d: Date) => d.getHours() * 60 + d.getMinutes();
    const enHorario = agenda.horarios.some(
      (h) =>
        h.profesionalId === input.profesionalId &&
        h.diaSemana === dia &&
        h.desdeMin <= min(input.inicio) &&
        min(fin) <= h.hastaMin,
    );
    if (!enHorario) throw new ConflictoTurno('horario');

    const chocaBloqueo = agenda.bloqueos.some(
      (b) =>
        (b.profesionalId === null || b.profesionalId === input.profesionalId) &&
        (b.sillonId === null || b.sillonId === input.sillonId) &&
        solapan(intervalo, { inicio: b.desde, fin: b.hasta }),
    );
    if (chocaBloqueo) throw new ConflictoTurno('bloqueo');

    const chocaProf = this.repo
      .activosPorProfesional(input.profesionalId)
      .some((t) => solapan(intervalo, t));
    if (chocaProf) throw new ConflictoTurno('profesional');

    const chocaSillon = this.repo
      .activosPorSillon(input.sillonId)
      .some((t) => solapan(intervalo, t));
    if (chocaSillon) throw new ConflictoTurno('sillon');

    return {
      id: randomUUID(),
      pacienteId: input.pacienteId,
      profesionalId: input.profesionalId,
      sillonId: input.sillonId,
      prestacionId: input.prestacion.id,
      inicio: input.inicio,
      fin,
      estado: 'pendiente',
    };
  }

  crear(input: CrearTurnoInput, agenda: AgendaRef): Turno {
    const turno = this.validar(input, agenda);
    this.repo.guardar(turno);
    return turno;
  }
}
