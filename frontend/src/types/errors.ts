/**
 * Error de dominio único del cliente HTTP (design D5).
 *
 * El backend tiene cuatro formas de error (conflicto con objeto, detalle
 * textual, lista de campos de FastAPI y objeto de rol/sucursal/permiso) y tres
 * causas de transporte (timeout, aborto, red caída). Todas convergen acá: la
 * UI consume `kind` para decidir y `detalle` para mostrar, sin mirar el status.
 */

/** Clasificación de un error de dominio. */
export type ApiErrorKind =
  /** Conflicto de agenda (solape, horario, bloqueo) o estado ya usado. */
  | "conflicto"
  /** Recurso inexistente (404). */
  | "no_encontrado"
  /** Input inválido: dominio (422 string), FastAPI (422 lista) o rol/sucursal. */
  | "validacion"
  /** El rol activo no tiene la capability (403). */
  | "permiso"
  /** Forma desconocida o error 5xx con cuerpo legible. */
  | "servidor"
  /** No hubo respuesta HTTP: red caída, aborto del llamador o cuerpo ilegible. */
  | "red"
  /** Venció el plazo de `AbortSignal.timeout`. */
  | "timeout";

/** Campo inválido de una respuesta 422 de FastAPI (`detail: [{loc, msg, type}]`). */
export interface CampoError {
  /** Ubicación del campo unida con punto, p. ej. `body.inicio`. */
  ubicacion: string;
  /** Mensaje de validación del backend. */
  mensaje: string;
}

export interface ApiErrorInit {
  kind: ApiErrorKind;
  status?: number | null;
  /** Mensaje legible para el usuario final. */
  mensaje: string;
  /** `causa` del backend cuando el cuerpo la trae. */
  causa?: string | null;
  /** Detalle textual del backend o texto crudo truncado. */
  detalle?: string;
  /** Campos inválidos de una validación de FastAPI. */
  campos?: readonly CampoError[];
}

/**
 * Error de dominio del cliente. `message` es el texto legible; `detalle`
 * conserva el texto del backend y `campos` la lista de una validación de
 * request (design D5).
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;

  readonly status: number | null;

  readonly causa: string | null;

  readonly detalle: string;

  readonly campos: readonly CampoError[];

  constructor(init: ApiErrorInit) {
    super(init.mensaje);
    this.name = "ApiError";
    this.kind = init.kind;
    this.status = init.status ?? null;
    this.causa = init.causa ?? null;
    this.detalle = init.detalle ?? "";
    this.campos = init.campos ?? [];
  }
}
