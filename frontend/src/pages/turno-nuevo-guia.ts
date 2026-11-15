/**
 * Guía de horario en cliente (C-16, task 3.1): lógica pura de aplicabilidad
 * de bloqueos, espejo de `bloqueo_aplica`
 * (`backend/app/agenda/models.py:160`).
 *
 * Vive en módulo propio (no en `turno-nuevo.tsx`) para poder exportarla al
 * test unitario directo del borde sin romper el lint
 * (`react(only-export-components)`). Sin conducta de producto: la guía solo
 * advierte, nunca bloquea; el servidor decide (201/409).
 */
import type { Bloqueo } from "../types/api";

/**
 * Aplican los bloqueos cuyos ids no-null coinciden, en borde semiabierto
 * `[desde, hasta)` (RN-AG-04/05): `inicio == hasta` o `fin == desde` no
 * aplica; el solape interior sí.
 */
export function bloqueoAplicable(
  bloqueo: Bloqueo,
  profesionalId: string,
  sillonId: string,
  inicioMs: number,
  finMs: number,
): boolean {
  if (bloqueo.profesional_id !== null && bloqueo.profesional_id !== profesionalId) {
    return false;
  }
  if (bloqueo.sillon_id !== null && bloqueo.sillon_id !== sillonId) {
    return false;
  }
  const desdeMs = new Date(bloqueo.desde).getTime();
  const hastaMs = new Date(bloqueo.hasta).getTime();
  if (Number.isNaN(desdeMs) || Number.isNaN(hastaMs)) {
    return false;
  }
  return desdeMs < finMs && inicioMs < hastaMs;
}
