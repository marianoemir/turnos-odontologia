/**
 * Contratos espejo de los schemas de lectura del backend (design D6).
 *
 * Fuentes y ninguna otra: `PacienteOut` (backend/app/agenda/schemas.py:60-68),
 * `ProfesionalOut` (:103-110), `SillonOut` (:136-142), `PrestacionOut` (:168-174),
 * `HorarioOut` (:223-231), `BloqueoOut` (:251-259) y `TurnoOut`
 * (backend/app/turnos/schemas.py:23-34).
 *
 * Traducción wire → TypeScript, sin campos inventados:
 * - `UUID`            -> `string`
 * - `datetime` / `AwareDatetime` -> `string` ISO-8601
 * - `time`            -> `string` "HH:MM:SS" (no `Date`: design D6)
 * - `str | None = None` -> `string | null` (la clave llega presente y nula)
 * - `int`             -> `number`
 *
 * `SillonBox` es el nombre del alcance; el alias exportado apunta a `Sillon`
 * (nombre del schema `SillonOut`, design Q3).
 */

/** PacienteOut — backend/app/agenda/schemas.py:60-68 */
export interface Paciente {
  id: string;
  nombre: string;
  dni: string;
  contacto: string | null;
  ficticio: boolean;
  activo: boolean;
}

/** ProfesionalOut — backend/app/agenda/schemas.py:103-110 */
export interface Profesional {
  id: string;
  nombre: string;
  matricula: string;
  sucursal_id: string | null;
  activo: boolean;
}

/** SillonOut — backend/app/agenda/schemas.py:136-142 */
export interface Sillon {
  id: string;
  nombre: string;
  sucursal_id: string | null;
  activo: boolean;
}

/** Nombre del alcance para el sillón/box (design Q3). */
export type SillonBox = Sillon;

/** PrestacionOut — backend/app/agenda/schemas.py:168-174 */
export interface Prestacion {
  id: string;
  nombre: string;
  duracion_min: number;
  activo: boolean;
}

/** HorarioOut — backend/app/agenda/schemas.py:223-231 */
export interface HorarioAtencion {
  id: string;
  profesional_id: string;
  dia_semana: number;
  /** `time` del backend: "HH:MM:SS". */
  desde: string;
  /** `time` del backend: "HH:MM:SS". */
  hasta: string;
  activo: boolean;
}

/** BloqueoOut — backend/app/agenda/schemas.py:251-259 */
export interface Bloqueo {
  id: string;
  profesional_id: string | null;
  sillon_id: string | null;
  /** `AwareDatetime` del backend, ISO-8601. */
  desde: string;
  /** `AwareDatetime` del backend, ISO-8601. */
  hasta: string;
  motivo: string;
}

/** TurnoOut — backend/app/turnos/schemas.py:23-34 */
export interface Turno {
  id: string;
  paciente_id: string;
  profesional_id: string;
  sillon_id: string;
  prestacion_id: string;
  /** `datetime` del backend, ISO-8601. */
  inicio: string;
  /** `datetime` del backend, ISO-8601. */
  fin: string;
  /** `str` en el schema; el dominio lo acota a `EstadoTurno` (design D6). */
  estado: EstadoTurno;
  creado_por: string | null;
}

/**
 * Estados admitidos por el dominio — `ESTADOS` en
 * backend/app/turnos/models.py:27-33 (el `CHECK estado_valido` de la tabla
 * repite la misma lista). `TurnoOut.estado` es `str` en el schema; el
 * frontend lo acota a esta unión (design D6).
 */
export type EstadoTurno =
  | "pendiente"
  | "confirmado"
  | "atendido"
  | "ausente"
  | "cancelado";

/**
 * Etiqueta legible de un estado. El `switch` cierra en `never`: agregar un
 * estado a `EstadoTurno` sin extender este mapeo rompe `tsc -b` por rama no
 * cubierta (spec "Estado de turno fuera de la unión").
 */
function etiquetaDeEstado(estado: EstadoTurno): string {
  switch (estado) {
    case "pendiente":
      return "Pendiente";
    case "confirmado":
      return "Confirmado";
    case "atendido":
      return "Atendido";
    case "ausente":
      return "Ausente";
    case "cancelado":
      return "Cancelado";
    default: {
      const estadoNoContemplado: never = estado;
      throw new Error(`Estado de turno no contemplado: ${estadoNoContemplado}`);
    }
  }
}

/**
 * Mapeo estado → etiqueta. El `Record<EstadoTurno, string>` garantiza en
 * compilación que están las cinco claves y ninguna de más.
 */
export const ESTADO_TURNO_LABELS: Record<EstadoTurno, string> = {
  pendiente: etiquetaDeEstado("pendiente"),
  confirmado: etiquetaDeEstado("confirmado"),
  atendido: etiquetaDeEstado("atendido"),
  ausente: etiquetaDeEstado("ausente"),
  cancelado: etiquetaDeEstado("cancelado"),
};
