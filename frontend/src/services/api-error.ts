/**
 * Normalización de los errores del backend a `ApiError` (design D5).
 *
 * Se discrimina por la **forma** de `detail`, no por el status: el backend
 * publica `{"detail": ...}` con tres estructuras (objeto `{causa, detalle}`,
 * string, o lista de validación de FastAPI). Un status inesperado con forma
 * conocida sigue produciendo un error de dominio; una forma desconocida cae en
 * `kind: "servidor"` con el texto crudo truncado.
 *
 * El cuerpo entra como `unknown` y se estrecha: ninguna rama usa `any`.
 */
import { ApiError } from "../types/errors";
import type { ApiErrorKind, CampoError } from "../types/errors";

/** Causas de conflicto de agenda (backend/app/turnos/service.py:160-245). */
const CAUSAS_CONFLICTO: readonly string[] = [
  "profesional",
  "sillon",
  "horario",
  "bloqueo",
];

/** Causas de validación de identidad (backend/app/rbac/context.py:73-109). */
const CAUSAS_VALIDACION: readonly string[] = [
  "rol_desconocido",
  "sucursal_invalida",
];

/** Causa de autorización (backend/app/rbac/dependencies.py:38-44). */
const CAUSA_PERMISO = "permiso_denegado";

/** Longitud máxima del texto crudo que se conserva en `detalle`. */
export const MAX_DETALLE = 200;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function textoDe(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

function truncar(texto: string): string {
  return texto.length <= MAX_DETALLE
    ? texto
    : `${texto.slice(0, MAX_DETALLE)}…`;
}

/** Texto crudo legible de un cuerpo que no tiene la forma esperada. */
function textoCrudo(valor: unknown): string {
  if (typeof valor === "string") {
    return valor;
  }
  if (
    typeof valor === "number" ||
    typeof valor === "boolean" ||
    valor === null
  ) {
    return String(valor);
  }
  if (esObjeto(valor) || Array.isArray(valor)) {
    try {
      return JSON.stringify(valor);
    } catch {
      return "";
    }
  }
  return "";
}

function ubicacionDe(loc: unknown): string {
  if (!Array.isArray(loc)) {
    return textoDe(loc) ?? "";
  }
  return loc
    .filter(
      (parte): parte is string | number =>
        typeof parte === "string" || typeof parte === "number",
    )
    .join(".");
}

function camposDe(detalle: readonly unknown[]): CampoError[] {
  const campos: CampoError[] = [];
  for (const item of detalle) {
    if (!esObjeto(item)) {
      continue;
    }
    const mensaje = textoDe(item.msg);
    if (mensaje === null) {
      continue;
    }
    campos.push({ ubicacion: ubicacionDe(item.loc), mensaje });
  }
  return campos;
}

/** `kind` de reserva cuando el status no encaja en las causas conocidas. */
function kindPorStatus(status: number): ApiErrorKind {
  if (status === 409) {
    return "conflicto";
  }
  if (status === 403) {
    return "permiso";
  }
  if (status === 404) {
    return "no_encontrado";
  }
  if (status >= 400 && status < 500) {
    return "validacion";
  }
  return "servidor";
}

function kindDeCausa(causa: string, status: number): ApiErrorKind {
  if (CAUSAS_CONFLICTO.includes(causa)) {
    return "conflicto";
  }
  if (causa === CAUSA_PERMISO) {
    return "permiso";
  }
  if (CAUSAS_VALIDACION.includes(causa)) {
    return "validacion";
  }
  return kindPorStatus(status);
}

function mensajePorKind(kind: ApiErrorKind, status: number): string {
  if (kind === "servidor") {
    return `El servidor respondió con un error inesperado (HTTP ${status}).`;
  }
  return `La request fue rechazada (HTTP ${status}).`;
}

/**
 * Traduce una respuesta de error del backend a `ApiError`.
 *
 * @param status código HTTP de la respuesta
 * @param body cuerpo ya parseado como JSON (`unknown`); puede ser el objeto
 *   `{detail: ...}` completo o el `detail` suelto
 */
export function normalizeApiError(status: number, body: unknown): ApiError {
  const detail =
    esObjeto(body) && "detail" in body ? body.detail : body;

  if (Array.isArray(detail)) {
    const campos = camposDe(detail);
    const resumen = campos
      .map((campo) => `${campo.ubicacion}: ${campo.mensaje}`)
      .join("; ");
    return new ApiError({
      kind: "validacion",
      status,
      mensaje:
        resumen.length > 0
          ? `La request tiene campos inválidos: ${resumen}`
          : `La request tiene campos inválidos (HTTP ${status}).`,
      detalle: truncar(resumen),
      campos,
    });
  }

  if (typeof detail === "string") {
    const kind = kindPorStatus(status);
    return new ApiError({
      kind,
      status,
      mensaje:
        detail.length > 0 ? truncar(detail) : mensajePorKind(kind, status),
      detalle: truncar(detail),
    });
  }

  if (esObjeto(detail)) {
    const causa = textoDe(detail.causa);
    const detalleTexto = textoDe(detail.detalle) ?? "";
    if (causa !== null) {
      const kind = kindDeCausa(causa, status);
      return new ApiError({
        kind,
        status,
        causa,
        mensaje:
          detalleTexto.length > 0
            ? truncar(detalleTexto)
            : mensajePorKind(kind, status),
        detalle: truncar(detalleTexto),
      });
    }
    const crudo = truncar(textoCrudo(detail));
    return new ApiError({
      kind: "servidor",
      status,
      mensaje: `El servidor respondió con un error inesperado (HTTP ${status}).`,
      detalle: crudo,
    });
  }

  return new ApiError({
    kind: "servidor",
    status,
    mensaje: `El servidor respondió con un error inesperado (HTTP ${status}).`,
    detalle: truncar(textoCrudo(detail)),
  });
}

/**
 * Error de red cuando hubo respuesta pero el cuerpo no es JSON legible (HTML,
 * vacío o texto): no se puede leer el contrato de error, así que se conserva el
 * status y el texto crudo truncado (design D5).
 */
export function errorDeCuerpoIlegible(
  status: number,
  textoCrudoCuerpo: string,
): ApiError {
  return new ApiError({
    kind: "red",
    status,
    mensaje: `El servidor devolvió una respuesta ilegible (HTTP ${status}).`,
    detalle: truncar(textoCrudoCuerpo),
  });
}
