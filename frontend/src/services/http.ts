/**
 * Cliente HTTP tipado (design D1/D2/D4/D5).
 *
 * Toda request pasa por acá: aplica el prefijo `API_BASE_URL`, el timeout y la
 * cancelación por aborto, arma las cabeceras de identidad y delega la
 * traducción de errores en `api-error.ts`. La discriminación de transporte es
 * por el **nombre del error** con el que rechaza `fetch`, nunca por el status
 * (no hay status cuando no hubo respuesta).
 */
import { ApiError } from "../types/errors";
import { errorDeCuerpoIlegible, normalizeApiError } from "./api-error";
import { API_BASE_URL } from "./config";
import { getActiveRole } from "./role";
import { getActiveSucursalId } from "./sucursal";

/** Plazo por defecto de una request, en milisegundos. */
export const TIMEOUT_MS = 15_000;

export type MetodoHttp = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface OpcionesRequest {
  method?: MetodoHttp;
  /** Cuerpo serializado como JSON; define `Content-Type: application/json`. */
  body?: unknown;
  headers?: Record<string, string>;
  /** Señal del llamador, combinada con el timeout. */
  signal?: AbortSignal;
  /** Plazo propio de esta request; por defecto `TIMEOUT_MS`. */
  timeoutMs?: number;
  /** Ruta pública del paciente: sin cabeceras de identidad (design D4). */
  publica?: boolean;
}

type ResultadoParseo =
  | { ok: true; valor: unknown }
  | { ok: false };

function parsearJson(texto: string): ResultadoParseo {
  try {
    return { ok: true, valor: JSON.parse(texto) as unknown };
  } catch {
    return { ok: false };
  }
}

function nombreDeError(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "name" in error) {
    const nombre = error.name;
    return typeof nombre === "string" ? nombre : null;
  }
  return null;
}

/**
 * Mapeo exacto de design D5: `TimeoutError` → `timeout`; `AbortError` y
 * `TypeError` (red caída) → `red`. Cualquier otro rechazo cae en `red`: la
 * excepción nunca se propaga sin capturar.
 */
function errorDeTransporte(error: unknown): ApiError {
  const nombre = nombreDeError(error);

  if (nombre === "TimeoutError") {
    return new ApiError({
      kind: "timeout",
      status: null,
      mensaje: "La solicitud superó el tiempo de espera.",
    });
  }

  if (nombre === "AbortError") {
    return new ApiError({
      kind: "red",
      status: null,
      mensaje: "La solicitud se canceló antes de recibir respuesta.",
    });
  }

  return new ApiError({
    kind: "red",
    status: null,
    mensaje: "No se pudo conectar con el servidor.",
  });
}

function combinarSenales(
  externa: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const limite = AbortSignal.timeout(timeoutMs);
  return externa === undefined ? limite : AbortSignal.any([externa, limite]);
}

/**
 * Ejecuta una request contra la API y devuelve el cuerpo parseado como `T`.
 *
 * Lanza siempre `ApiError` ante un error: de dominio si hubo respuesta con
 * forma conocida, `red`/`timeout` si no se pudo obtener o leer la respuesta.
 */
export async function apiRequest<T>(
  ruta: string,
  opciones: OpcionesRequest = {},
): Promise<T> {
  const headers = new Headers(opciones.headers);
  headers.set("Accept", "application/json");

  if (opciones.publica !== true) {
    // Rol y sucursal se leen en cada request (no se capturan al construir el
    // cliente): cuando C-14 conecte los selectores, todas las requests cambian
    // sin tocar este archivo (design D4).
    headers.set("X-Actor-Rol", getActiveRole());

    const sucursalId = getActiveSucursalId();
    if (sucursalId !== null) {
      headers.set("X-Sucursal-Id", sucursalId);
    }
  }

  let body: BodyInit | undefined;
  if (opciones.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opciones.body);
  }

  const signal = combinarSenales(
    opciones.signal,
    opciones.timeoutMs ?? TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${ruta}`, {
      method: opciones.method ?? "GET",
      headers,
      body,
      signal,
    });
  } catch (error) {
    throw errorDeTransporte(error);
  }

  let texto: string;
  try {
    texto = await response.text();
  } catch (error) {
    throw errorDeTransporte(error);
  }

  if (!response.ok) {
    const parseado = parsearJson(texto);
    if (!parseado.ok) {
      throw errorDeCuerpoIlegible(response.status, texto);
    }
    throw normalizeApiError(response.status, parseado.valor);
  }

  if (texto.trim().length === 0) {
    return undefined as T;
  }

  const parseado = parsearJson(texto);
  if (!parseado.ok) {
    throw errorDeCuerpoIlegible(response.status, texto);
  }
  return parseado.valor as T;
}
