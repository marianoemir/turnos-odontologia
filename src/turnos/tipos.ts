export type EstadoTurno = 'pendiente' | 'confirmado' | 'cancelado' | 'atendido' | 'ausente';

export type CausaConflicto = 'profesional' | 'sillon' | 'horario' | 'bloqueo';

export interface Turno {
  id: string;
  pacienteId: string;
  profesionalId: string;
  sillonId: string;
  prestacionId: string;
  inicio: Date;
  fin: Date;
  estado: EstadoTurno;
}

/** Conflicto de negocio → HTTP 409 con causa. */
export class ConflictoTurno extends Error {
  readonly causa: CausaConflicto;
  constructor(causa: CausaConflicto) {
    super(`conflicto de turno: ${causa}`);
    this.name = 'ConflictoTurno';
    this.causa = causa;
  }
}

/** Input inválido → HTTP 422. */
export class InputInvalido extends Error {
  constructor(motivo: string) {
    super(`input inválido: ${motivo}`);
    this.name = 'InputInvalido';
  }
}
