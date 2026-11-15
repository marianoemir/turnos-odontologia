/**
 * RED de Grupo 1 (C-17, tasks 1.2-1.3) — capa de datos de agenda.
 *
 * `apiRequest` se reemplaza por un doble: lo que se afirma es QUÉ pide cada
 * servicio (método, ruta, cuerpo) y QUÉ raíz invalida cada mutación (solo
 * `turnos`), no el transporte HTTP (eso ya lo cubre `http.test.ts`).
 * Espejo de `turnos.test.tsx` y `catalogo.test.tsx`.
 *
 * Contratos: `GET /agenda?profesional=&fecha=` (`AgendaItemOut` en
 * backend/app/agenda/schemas.py:18-27, ordenado por inicio en C-05),
 * `POST /turnos/{id}/cancelar` y `POST /turnos/{id}/reprogramar` con body
 * `{inicio}` (`TurnoReprogramar` en backend/app/turnos/schemas.py:37-40).
 * Sin optimistic update: ninguna fila cambia antes de la respuesta; el éxito
 * invalida la raíz `turnos` (design D2).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgendaItem } from "../types/api";
import { claveAgenda, useAgenda, useCancelarTurno, useReprogramarTurno } from "./agenda";
import { apiRequest } from "./http";
import { resourceKeys } from "./query";

vi.mock("./http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const ID_PROFESIONAL = "22222222-2222-4222-8222-222222222222";
const FECHA = "2026-11-20";
const ID_TURNO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NUEVO_INICIO = "2026-11-20T11:00:00.000-03:00";

const TURNO_AGENDA: AgendaItem = {
  id: ID_TURNO,
  inicio: "2026-11-20T10:00:00.000-03:00",
  fin: "2026-11-20T10:30:00.000-03:00",
  estado: "pendiente",
  paciente_nombre: "Paciente Ficticio",
  prestacion_nombre: "Prestación Ficticia",
  sillon_nombre: "Sillón Ficticio",
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

/** Ejecuta una mutación con las raíces `turnos` y `pacientes` pobladas. */
async function ejecutarConRaices<TVariables>(
  usar: () => { mutateAsync: (variables: TVariables) => Promise<unknown> },
  variables: TVariables,
) {
  const client = nuevoCliente();
  client.setQueryData(resourceKeys.turnos.all, [{ id: "turno-1" }]);
  client.setQueryData(resourceKeys.pacientes.all, [{ id: "paciente-1" }]);
  apiRequestMock.mockResolvedValue({ id: ID_TURNO });

  const { result } = renderHook(usar, { wrapper: crearWrapper(client) });
  await act(async () => {
    await result.current.mutateAsync(variables);
  });

  const invalidados = (["turnos", "pacientes"] as const).filter(
    (recurso) =>
      client.getQueryState(resourceKeys[recurso].all)?.isInvalidated === true,
  );
  return { client, invalidados, llamadas: [...apiRequestMock.mock.calls] };
}

describe("clave de agenda", () => {
  it("anida bajo la raíz turnos con profesional y fecha", () => {
    expect(claveAgenda(ID_PROFESIONAL, FECHA)).toEqual([
      ...resourceKeys.turnos.all,
      "agenda",
      ID_PROFESIONAL,
      FECHA,
    ]);
  });
});

describe("useAgenda", () => {
  it("pide GET /agenda con profesional y fecha", async () => {
    apiRequestMock.mockResolvedValue([TURNO_AGENDA]);
    const { result } = renderHook(() => useAgenda(ID_PROFESIONAL, FECHA), {
      wrapper: crearWrapper(nuevoCliente()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/agenda?profesional=${encodeURIComponent(ID_PROFESIONAL)}&fecha=${encodeURIComponent(FECHA)}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.data).toEqual([TURNO_AGENDA]);
  });

  it("no emite request sin profesional", async () => {
    const { result } = renderHook(() => useAgenda("", FECHA), {
      wrapper: crearWrapper(nuevoCliente()),
    });

    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 50));
    });

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("no emite request sin fecha válida", async () => {
    for (const fechaInvalida of ["", "no-fecha", "20-11-2026"]) {
      apiRequestMock.mockClear();
      const { result, unmount } = renderHook(
        () => useAgenda(ID_PROFESIONAL, fechaInvalida),
        { wrapper: crearWrapper(nuevoCliente()) },
      );

      await act(async () => {
        await new Promise((resolver) => setTimeout(resolver, 50));
      });

      expect(apiRequestMock).not.toHaveBeenCalled();
      expect(result.current.fetchStatus).toBe("idle");
      unmount();
    }
  });
});

describe("mutaciones de agenda", () => {
  it("cancelar hace POST /turnos/{id}/cancelar sin body", async () => {
    const { llamadas } = await ejecutarConRaices(useCancelarTurno, ID_TURNO);

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.[0]).toBe(
      `/turnos/${encodeURIComponent(ID_TURNO)}/cancelar`,
    );
    expect(llamadas[0]?.[1]).toEqual({ method: "POST" });
  });

  it("reprogramar hace POST /turnos/{id}/reprogramar solo con inicio", async () => {
    const { llamadas } = await ejecutarConRaices(useReprogramarTurno, {
      id: ID_TURNO,
      inicio: NUEVO_INICIO,
    });

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.[0]).toBe(
      `/turnos/${encodeURIComponent(ID_TURNO)}/reprogramar`,
    );
    expect(llamadas[0]?.[1]).toEqual({
      method: "POST",
      body: { inicio: NUEVO_INICIO },
    });
  });

  it("el éxito de cancelar o reprogramar invalida solo la raíz turnos", async () => {
    const alCancelar = await ejecutarConRaices(useCancelarTurno, ID_TURNO);
    expect(alCancelar.invalidados).toEqual(["turnos"]);

    const alReprogramar = await ejecutarConRaices(useReprogramarTurno, {
      id: ID_TURNO,
      inicio: NUEVO_INICIO,
    });
    expect(alReprogramar.invalidados).toEqual(["turnos"]);
  });

  it("sin optimistic update: la agenda visible no cambia hasta la respuesta", async () => {
    let resolver: (valor: unknown) => void = () => {};
    apiRequestMock.mockReturnValue(
      new Promise((res) => {
        resolver = res;
      }),
    );
    const client = nuevoCliente();
    client.setQueryData(resourceKeys.turnos.all, [{ id: "turno-1" }]);
    client.setQueryData(claveAgenda(ID_PROFESIONAL, FECHA), [TURNO_AGENDA]);

    const { result } = renderHook(() => useCancelarTurno(), {
      wrapper: crearWrapper(client),
    });
    act(() => {
      result.current.mutate(ID_TURNO);
    });

    expect(client.getQueryData(claveAgenda(ID_PROFESIONAL, FECHA))).toEqual([
      TURNO_AGENDA,
    ]);

    await act(async () => {
      resolver({ id: ID_TURNO });
    });
    await waitFor(() => {
      expect(
        client.getQueryState(resourceKeys.turnos.all)?.isInvalidated,
      ).toBe(true);
    });
  });
});
