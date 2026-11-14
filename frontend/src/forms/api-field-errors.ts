import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "../types/errors";

function nombreDeCampo(ubicacion: string): string | null {
  const prefijo = "body.";
  if (!ubicacion.startsWith(prefijo)) {
    return null;
  }

  const campo = ubicacion.slice(prefijo.length);
  return campo.length > 0 && !campo.includes(".") ? campo : null;
}

/**
 * Proyecta los campos de una validación FastAPI 422 a un formulario RHF.
 *
 * La lista explícita evita crear errores invisibles para ubicaciones del body
 * que no pertenecen a este formulario.
 */
export function applyApiFieldErrors<TValues extends FieldValues>(
  error: ApiError,
  setError: UseFormSetError<TValues>,
  fields: readonly Path<TValues>[],
): boolean {
  if (error.status !== 422 || error.campos.length === 0) {
    return false;
  }

  const camposPermitidos = new Set<string>(fields);
  const camposAplicados = new Set<string>();
  let applied = false;

  for (const campo of error.campos) {
    const nombre = nombreDeCampo(campo.ubicacion);
    if (
      nombre === null ||
      !camposPermitidos.has(nombre) ||
      camposAplicados.has(nombre)
    ) {
      continue;
    }

    setError(nombre as Path<TValues>, {
      type: "server",
      message: campo.mensaje,
    });
    camposAplicados.add(nombre);
    applied = true;
  }

  return applied;
}
