/**
 * RED de 1.2 (C-16) — servicio de turnos.
 *
 * `apiRequest` se reemplaza por un doble: lo que se afirma es QUÉ pide el
 * servicio (método, ruta, cuerpo sin `fin`) y QUÉ raíz invalida la mutación
 * (solo `turnos`), no el transporte HTTP (eso ya lo cubre `http.test.ts`).
 * Espejo de `catalogo.test.tsx`.
 *
 * Contratos: `POST /turnos` (`TurnoCreate` en
 * backend/app/turnos/schemas.py:12-20, sin `fin`: el servidor lo calcula e
 * ignora cualquier `fin` del cliente).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TurnoCreate } from "./turnos";
import { useCrearTurno } from "./turnos";
import { apiRequest } from "./http";
import { resourceKeys } from "./query";

vi.mock("./http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const ALTA: TurnoCreate = {
  paciente_id: "11111111-1111-4111-8111-111111111111",
  profesional_id: "22222222-2222-4222-8222-222222222222",
  sillon_id: "33333333-3333-4333-8333-333333333333",
  prestacion_id: "44444444-4444-4444-8444-444444444444",
  inicio: "2026-11-20T10:00:00.000Z",
};

beforeEach(() => {
  apiRequestMock.mockReset();
});
afterEach(cleanup);

function nuevoCliente(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function crearWrapper(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("servicio de turnos", () => {
  it("crear un turno hace POST /turnos con el body sin fin", async () => {
    apiRequestMock.mockResolvedValue({ id: "turno-1" });
    const client = nuevoCliente();

    const { result } = renderHook(() => useCrearTurno(), {
      wrapper: crearWrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync(ALTA);
    });

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const llamada = apiRequestMock.mock.calls[0];
    expect(llamada?.[0]).toBe("/turnos");
    expect(llamada?.[1]).toEqual({ method: "POST", body: ALTA });
    const cuerpo = (llamada?.[1] as { body?: Record<string, unknown> } | undefined)
      ?.body;
    expect(cuerpo).not.toHaveProperty("fin");
  });

  it("la creación exitosa invalida solo la raíz turnos", async () => {
    apiRequestMock.mockResolvedValue({ id: "turno-1" });
    const client = nuevoCliente();
    const raices = [
      "turnos",
      "pacientes",
      "profesionales",
      "sillones",
      "prestaciones",
    ] as const;
    for (const recurso of raices) {
      client.setQueryData(resourceKeys[recurso].all, [{ id: recurso }]);
    }

    const { result } = renderHook(() => useCrearTurno(), {
      wrapper: crearWrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync(ALTA);
    });

    const invalidados = raices.filter(
      (recurso) =>
        client.getQueryState(resourceKeys[recurso].all)?.isInvalidated === true,
    );
    expect(invalidados).toEqual(["turnos"]);
  });
});
