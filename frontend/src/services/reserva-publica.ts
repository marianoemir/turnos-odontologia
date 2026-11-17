import { useMutation, useQuery } from "@tanstack/react-query";

import type { Prestacion } from "../types/api";
import type {
  ReservaCreatePublica,
  ReservaOutPublica,
  ResolucionTokenOut,
  SlotPublico,
} from "../types/api-reserva-publica";
import { apiRequest } from "./http";

/** QueryKey propia de prestaciones públicas, separada de catálogo interno. */
export const prestacionesPublicasQueryKey = ["reserva-publica", "prestaciones"] as const;

/**
 * QueryKey propia de slots públicos (3.1): profesional + prestación + fecha.
 * Sin `dni` ni `token`; no comparte prefijo con `resourceKeys` de catálogo.
 * La selección forma parte de la clave, así que una respuesta de otra
 * prestación/fecha nunca se muestra como si fuera la vigente (3.3, design D7).
 */
export function slotsPublicosQueryKey(
  profesionalId: string,
  params: { prestacion: string; fecha: string },
) {
  return [
    "reserva-publica",
    "slots",
    profesionalId,
    params.prestacion,
    params.fecha,
  ] as const;
}

export function obtenerSlotsPublicos(
  profesionalId: string,
  params: { prestacion: string; fecha: string },
  signal?: AbortSignal,
): Promise<SlotPublico[]> {
  const search = new URLSearchParams({
    prestacion: params.prestacion,
    fecha: params.fecha,
  });
  const opciones =
    signal === undefined ? { publica: true } : { publica: true, signal };
  return apiRequest<SlotPublico[]>(
    `/reservar/${encodeURIComponent(profesionalId)}?${search.toString()}`,
    opciones,
  );
}

export function crearReservaPublica(
  body: ReservaCreatePublica,
): Promise<ReservaOutPublica> {
  return apiRequest<ReservaOutPublica>("/reservar", {
    method: "POST",
    body,
    publica: true,
  });
}

export function useCrearReservaPublica() {
  return useMutation({
    mutationFn: crearReservaPublica,
    retry: false,
  });
}

export function confirmarToken(token: string): Promise<ResolucionTokenOut> {
  return apiRequest<ResolucionTokenOut>(`/confirmar/${encodeURIComponent(token)}`, {
    method: "POST",
    publica: true,
  });
}

export function cancelarToken(token: string): Promise<ResolucionTokenOut> {
  return apiRequest<ResolucionTokenOut>(`/cancelar/${encodeURIComponent(token)}`, {
    method: "POST",
    publica: true,
  });
}

export function obtenerPrestacionesPublicas(): Promise<Prestacion[]> {
  return apiRequest<Prestacion[]>("/prestaciones", { publica: true });
}

export function usePrestacionesPublicas() {
  return useQuery({
    queryKey: prestacionesPublicasQueryKey,
    queryFn: ({ signal }) =>
      apiRequest<Prestacion[]>("/prestaciones", { publica: true, signal }),
    retry: false,
  });
}

/**
 * Slots públicos de una prestación en una fecha (3.1). `enabled` permite no
 * consultar hasta que la persona eligió prestación y fecha. El `signal` que
 * entrega TanStack se propaga al cliente para cancelar la request anterior.
 */
export function useSlotsPublicos(
  profesionalId: string,
  params: { prestacion: string; fecha: string },
  opciones?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: slotsPublicosQueryKey(profesionalId, params),
    queryFn: ({ signal }) =>
      obtenerSlotsPublicos(profesionalId, params, signal),
    enabled: opciones?.enabled ?? true,
    retry: false,
  });
}

export function useConfirmarToken() {
  return useMutation({
    mutationFn: (token: string) => confirmarToken(token),
    retry: false,
  });
}

export function useCancelarToken() {
  return useMutation({
    mutationFn: (token: string) => cancelarToken(token),
    retry: false,
  });
}
