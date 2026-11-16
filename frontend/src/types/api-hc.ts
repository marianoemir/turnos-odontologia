/**
 * Contratos espejo de HC, odontograma, entradas y planes (C-09).
 * Fuente: backend/app/hc/schemas.py. UUID/date/datetime -> string, int -> number.
 */

export interface HistoriaClinicaCreate {
  paciente_id: string;
  antecedentes?: string | null;
  alergias?: string | null;
  observaciones?: string | null;
}

export interface HistoriaClinicaUpdate {
  antecedentes?: string | null;
  alergias?: string | null;
  observaciones?: string | null;
}

export interface HistoriaClinicaOut {
  id: string;
  paciente_id: string;
  antecedentes: string | null;
  alergias: string | null;
  observaciones: string | null;
  creado_en: string;
}

export interface EntradaHCCreate {
  profesional_id: string;
  fecha: string;
  texto: string;
}

export interface EntradaHCOut {
  id: string;
  historia_clinica_id: string;
  profesional_id: string;
  fecha: string;
  texto: string;
  creado_en: string;
}

export interface OdontogramaCreate {
  pieza: string;
  estado: string;
  profesional_id: string;
  fecha: string;
}

export interface OdontogramaOut {
  id: string;
  paciente_id: string;
  pieza: string;
  estado: string;
  profesional_id: string;
  fecha: string;
  creado_en: string;
}

export interface PlanItemOut {
  id: string;
  plan_id: string;
  pieza: string;
  prestacion_id: string;
  estado: string;
  monto_centavos: number;
  monto_cobertura_centavos: number | null;
}

export interface PlanTratamientoOut {
  id: string;
  paciente_id: string;
  profesional_id: string;
  estado: string;
  creado_en: string;
  items: PlanItemOut[];
  total_centavos: number;
  cobertura_centavos: number;
}
