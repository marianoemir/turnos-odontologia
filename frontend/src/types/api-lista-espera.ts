/**
 * Contratos espejo de lista de espera (C-18, capability backend lista-espera).
 *
 * Fuentes: backend/app/lista_espera/schemas.py y router/service.
 * - UUID / datetime -> string
 * - profesional_id / turno_id: string | null
 * - estado: union cerrada del dominio
 */
export type EstadoListaEspera = "pendiente" | "ofrecido" | "asignado" | "baja";

export interface ListaEsperaCreate {
  paciente_id: string;
  profesional_id?: string | null;
  prestacion_id: string;
}

export interface ListaEsperaOut {
  id: string;
  paciente_id: string;
  profesional_id: string | null;
  prestacion_id: string;
  creado_en: string;
  estado: EstadoListaEspera;
  turno_id: string | null;
}

export interface OfrecerHueco {
  inicio: string;
  profesional_id: string;
  sillon_id: string;
}

export interface RespuestaPaciente {
  acepta: boolean;
}

/** Solo `turno.estado` está probado como seguro en la respuesta de ofrecer. */
export interface TurnoOfrecidoResumen {
  estado: string;
}

export interface OfrecerHuecoResponse {
  lista: ListaEsperaOut;
  turno: TurnoOfrecidoResumen;
}
