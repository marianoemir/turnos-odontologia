/**
 * Servicio de agenda del día (C-17, grupo 1, tasks 1.2-1.3).
 *
 * Contratos: `GET /agenda?profesional=&fecha=` (`AgendaItemOut` en
 * backend/app/agenda/schemas.py:18-27, ordenado por inicio en C-05),
 * `POST /turnos/{id}/cancelar` y `POST /turnos/{id}/reprogramar` con body
 * `{inicio}` (`TurnoReprogramar` en backend/app/turnos/schemas.py:37-40).
 *
 * La query cuelga de la raíz `turnos` de `resourceKeys` (design D2, la forma
 * que `services/query.ts` ya anticipa) y solo pide cuando hay profesional y
 * fecha válida (`enabled`). Ambas mutaciones usan `useResourceMutation`
 * ("turnos") para que el éxito invalide la raíz y refresque las vistas, sin
 * optimistic update — espejo del molde de `turnos.ts` y `catalogo.ts`.
 */
import { useQuery } from "@tanstack/react-query";

import type { AgendaItem, Turno } from "../types/api";
import { apiRequest } from "./http";
import { resourceKeys, useResourceMutation } from "./query";

/** `yyyy-mm-dd` (default hoy local, design D4); el backend la interpreta en `America/Argentina/Buenos_Aires`. */
const EXPRESION_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Clave de la agenda del día, anidada bajo la raíz `turnos`. */
export function claveAgenda(profesionalId: string, fecha: string) {
  return [...resourceKeys.turnos.all, "agenda", profesionalId, fecha] as const;
}

function rutaAgenda(profesionalId: string, fecha: string): string {
  const parametros = new URLSearchParams({
    profesional: profesionalId,
    fecha,
  });
  return `/agenda?${parametros.toString()}`;
}

/**
 * Agenda del día de un profesional. No emite request sin profesional o sin
 * fecha válida (`enabled`): la tabla espera a tener ambos filtros.
 */
export function useAgenda(profesionalId: string, fecha: string) {
  const profesional = profesionalId.trim();
  const habilitada =
    profesional.length > 0 && EXPRESION_FECHA.test(fecha);

  return useQuery({
    queryKey: claveAgenda(profesional, fecha),
    queryFn: ({ signal }) =>
      apiRequest<AgendaItem[]>(rutaAgenda(profesional, fecha), { signal }),
    enabled: habilitada,
  });
}

/**
 * Reprogramación de un turno: solo el nuevo inicio con zona horaria
 * (ISO-8601, `AwareDatetime` en el backend); sin `fin`, como en la creación.
 */
export interface Reprogramacion {
  id: string;
  inicio: string;
}

export function useCancelarTurno() {
  return useResourceMutation("turnos", (turnoId: string) =>
    apiRequest<Turno>(`/turnos/${encodeURIComponent(turnoId)}/cancelar`, {
      method: "POST",
    }),
  );
}

export function useReprogramarTurno() {
  return useResourceMutation("turnos", ({ id, inicio }: Reprogramacion) =>
    apiRequest<Turno>(`/turnos/${encodeURIComponent(id)}/reprogramar`, {
      method: "POST",
      body: { inicio },
    }),
  );
}
