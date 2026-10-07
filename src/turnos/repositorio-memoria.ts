import type { Turno } from './tipos';

const ACTIVOS = new Set(['pendiente', 'confirmado']);

export function esActivo(t: Turno): boolean {
  return ACTIVOS.has(t.estado);
}

export interface RepositorioTurnos {
  guardar(t: Turno): void;
  todos(): Turno[];
  activosPorProfesional(profesionalId: string): Turno[];
  activosPorSillon(sillonId: string): Turno[];
}

export class RepositorioMemoria implements RepositorioTurnos {
  private turnos: Turno[] = [];

  guardar(t: Turno): void {
    this.turnos.push(t);
  }

  todos(): Turno[] {
    return [...this.turnos];
  }

  activosPorProfesional(profesionalId: string): Turno[] {
    return this.turnos.filter((t) => t.profesionalId === profesionalId && esActivo(t));
  }

  activosPorSillon(sillonId: string): Turno[] {
    return this.turnos.filter((t) => t.sillonId === sillonId && esActivo(t));
  }
}
