/**
 * Contratos espejo de reserva pública (C-08, reserva-online) y tokens (C-07).
 * Fuentes: backend/app/reserva_online/schemas.py, backend/app/recordatorios/schemas.py.
 * UUID/date/datetime -> string. Sin campos inventados.
 */

export interface SlotPublico {
  inicio: string;
  fin: string;
}

export interface ReservaCreatePublica {
  nombre: string;
  dni: string;
  contacto?: string | null;
  profesional_id: string;
  prestacion_id: string;
  /** ISO-8601 con timezone (AwareDatetime). */
  inicio: string;
}

export interface ReservaOutPublica {
  turno_id: string;
  profesional_id: string;
  prestacion_id: string;
  inicio: string;
  fin: string;
  estado: string;
}

export type ResultadoToken = "confirmado" | "cancelado" | "expirado";

export interface ResolucionTokenOut {
  resultado: ResultadoToken;
  turno_id: string;
  inicio: string;
}
