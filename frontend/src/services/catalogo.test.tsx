/**
 * RED de 1.2 (C-15) — servicio de catálogo.
 *
 * `apiRequest` se reemplaza por un doble: lo que se afirma es QUÉ pide cada
 * servicio (método, ruta, cuerpo) y QUÉ raíz invalida cada mutación, no el
 * transporte HTTP (eso ya lo cubre `http.test.ts`). Espejo de `admin.test.tsx`.
 *
 * Contratos: `backend/app/agenda/router_catalogo.py` + `schemas.py`
 * (tipos de lectura en `../types/api`).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clavePacientes,
  useActualizarHorario,
  useActualizarPaciente,
  useActualizarPrestacion,
  useActualizarProfesional,
  useActualizarSillon,
  useBloqueos,
  useCrearBloqueo,
  useCrearHorario,
  useCrearPaciente,
  useCrearPrestacion,
  useCrearProfesional,
  useCrearSillon,
  useHorarios,
  usePacientes,
  usePrestaciones,
  useProfesionales,
  useSillones,
  useEliminarBloqueo,
} from "./catalogo";
import { apiRequest } from "./http";
import { resourceKeys } from "./query";

vi.mock("./http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const ID_PACIENTE = "11111111-1111-4111-8111-111111111111";
const ID_PROFESIONAL = "22222222-2222-4222-8222-222222222222";
const ID_SILLON = "33333333-3333-4333-8333-333333333333";
const ID_PRESTACION = "44444444-4444-4444-8444-444444444444";
const ID_HORARIO = "55555555-5555-4555-8555-555555555555";
const ID_BLOQUEO = "66666666-6666-4666-8666-666666666666";

const RAICES = [
  "pacientes",
  "profesionales",
  "sillones",
  "prestaciones",
  "horarios",
  "bloqueos",
] as const;

type Raiz = (typeof RAICES)[number];

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

/** Ejecuta una mutación con las seis raíces de catálogo pobladas. */
async function ejecutar<TVars>(
  usar: () => { mutateAsync: (variables: TVars) => Promise<unknown> },
  variables: TVars,
) {
  const client = nuevoCliente();
  for (const recurso of RAICES) {
    client.setQueryData(resourceKeys[recurso].all, [{ id: recurso }]);
  }
  apiRequestMock.mockResolvedValue({});

  const { result } = renderHook(usar, { wrapper: crearWrapper(client) });
  await act(async () => {
    await result.current.mutateAsync(variables);
  });

  const invalidados = RAICES.filter(
    (recurso) =>
      client.getQueryState(resourceKeys[recurso].all)?.isInvalidated === true,
  );
  return { invalidados, llamadas: [...apiRequestMock.mock.calls] };
}

function invalidacionUnica(
  invalidados: readonly Raiz[],
  esperada: Raiz,
): void {
  expect(invalidados).toEqual([esperada]);
}

describe("consultas de catálogo", () => {
  it("usePacientes pide el envelope con q, limit y offset", async () => {
    apiRequestMock.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });
    const { result } = renderHook(
      () => usePacientes({ q: "Juan", limit: 10, offset: 20 }),
      { wrapper: crearWrapper(nuevoCliente()) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const ruta = String(apiRequestMock.mock.calls[0]?.[0]);
    expect(ruta.startsWith("/pacientes?")).toBe(true);
    expect(ruta).toContain("q=Juan");
    expect(ruta).toContain("limit=10");
    expect(ruta).toContain("offset=20");
  });

  it("usePacientes incluye inactivos solo cuando se pide", async () => {
    apiRequestMock.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });
    const client = nuevoCliente();
    const { result: sin } = renderHook(() => usePacientes(), {
      wrapper: crearWrapper(client),
    });
    await waitFor(() => expect(sin.current.isSuccess).toBe(true));
    expect(String(apiRequestMock.mock.calls[0]?.[0])).toBe(
      "/pacientes?limit=50&offset=0",
    );
  });

  it("distintas búsquedas de pacientes no comparten caché pero cuelgan de la misma raíz", async () => {
    apiRequestMock.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });
    const client = nuevoCliente();
    const wrapper = crearWrapper(client);

    const primera = renderHook(() => usePacientes({ q: "Ana" }), { wrapper });
    const segunda = renderHook(() => usePacientes({ q: "Beto" }), { wrapper });
    await waitFor(() => expect(primera.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(segunda.result.current.isSuccess).toBe(true));

    expect(
      client.getQueryCache().findAll({ queryKey: resourceKeys.pacientes.all }),
    ).toHaveLength(2);
    expect(clavePacientes({ q: "Ana" })[0]).toBe("pacientes");
  });

  it("profesionales, sillones, prestaciones y horarios piden su lista plana", async () => {
    apiRequestMock.mockResolvedValue([]);
    const client = nuevoCliente();
    const wrapper = crearWrapper(client);

    const hooks = [
      renderHook(() => useProfesionales(), { wrapper }),
      renderHook(() => useSillones(), { wrapper }),
      renderHook(() => usePrestaciones(), { wrapper }),
      renderHook(() => useHorarios(), { wrapper }),
      renderHook(() => useBloqueos(), { wrapper }),
    ];
    for (const hook of hooks) {
      await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    }

    const rutas = apiRequestMock.mock.calls.map((llamada) => llamada[0]);
    expect(rutas).toEqual([
      "/profesionales",
      "/sillones",
      "/prestaciones",
      "/horarios-atencion",
      "/bloqueos",
    ]);
  });

  it("profesionales con inactivas pide incluir_inactivos=true", async () => {
    apiRequestMock.mockResolvedValue([]);
    const { result } = renderHook(() => useProfesionales(true), {
      wrapper: crearWrapper(nuevoCliente()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiRequestMock.mock.calls[0]?.[0]).toBe(
      "/profesionales?incluir_inactivos=true",
    );
  });
});

describe("mutaciones de catálogo", () => {
  it("crear un paciente hace POST /pacientes e invalida solo pacientes", async () => {
    const alta = { nombre: "Ana Ficticia", dni: "DNI-FICT-001" };
    const { invalidados, llamadas } = await ejecutar(useCrearPaciente, alta);

    expect(llamadas[0]).toEqual(["/pacientes", { method: "POST", body: alta }]);
    invalidacionUnica(invalidados, "pacientes");
  });

  it("editar un paciente hace PATCH /pacientes/{id} e invalida solo pacientes", async () => {
    const { invalidados, llamadas } = await ejecutar(useActualizarPaciente, {
      id: ID_PACIENTE,
      parche: { contacto: "nuevo-contacto" },
    });

    expect(llamadas[0]).toEqual([
      `/pacientes/${ID_PACIENTE}`,
      { method: "PATCH", body: { contacto: "nuevo-contacto" } },
    ]);
    invalidacionUnica(invalidados, "pacientes");
  });

  it("crear un profesional hace POST /profesionales e invalida solo profesionales", async () => {
    const alta = { nombre: "Dra. Ficticia", matricula: "MAT-FICT-001" };
    const { invalidados, llamadas } = await ejecutar(useCrearProfesional, alta);

    expect(llamadas[0]).toEqual([
      "/profesionales",
      { method: "POST", body: alta },
    ]);
    invalidacionUnica(invalidados, "profesionales");
  });

  it("editar un profesional hace PATCH /profesionales/{id} e invalida solo profesionales", async () => {
    const { invalidados, llamadas } = await ejecutar(useActualizarProfesional, {
      id: ID_PROFESIONAL,
      parche: { activo: false },
    });

    expect(llamadas[0]).toEqual([
      `/profesionales/${ID_PROFESIONAL}`,
      { method: "PATCH", body: { activo: false } },
    ]);
    invalidacionUnica(invalidados, "profesionales");
  });

  it("crear un sillón hace POST /sillones e invalida solo sillones", async () => {
    const { invalidados, llamadas } = await ejecutar(useCrearSillon, {
      nombre: "Sillón 1",
    });

    expect(llamadas[0]).toEqual([
      "/sillones",
      { method: "POST", body: { nombre: "Sillón 1" } },
    ]);
    invalidacionUnica(invalidados, "sillones");
  });

  it("editar un sillón hace PATCH /sillones/{id} e invalida solo sillones", async () => {
    const { invalidados, llamadas } = await ejecutar(useActualizarSillon, {
      id: ID_SILLON,
      parche: { activo: false },
    });

    expect(llamadas[0]).toEqual([
      `/sillones/${ID_SILLON}`,
      { method: "PATCH", body: { activo: false } },
    ]);
    invalidacionUnica(invalidados, "sillones");
  });

  it("crear una prestación hace POST /prestaciones e invalida solo prestaciones", async () => {
    const alta = { nombre: "Limpieza", duracion_min: 30 };
    const { invalidados, llamadas } = await ejecutar(useCrearPrestacion, alta);

    expect(llamadas[0]).toEqual([
      "/prestaciones",
      { method: "POST", body: alta },
    ]);
    invalidacionUnica(invalidados, "prestaciones");
  });

  it("editar una prestación hace PATCH /prestaciones/{id} e invalida solo prestaciones", async () => {
    const { invalidados, llamadas } = await ejecutar(useActualizarPrestacion, {
      id: ID_PRESTACION,
      parche: { duracion_min: 60 },
    });

    expect(llamadas[0]).toEqual([
      `/prestaciones/${ID_PRESTACION}`,
      { method: "PATCH", body: { duracion_min: 60 } },
    ]);
    invalidacionUnica(invalidados, "prestaciones");
  });

  it("crear un horario hace POST /horarios-atencion e invalida solo horarios", async () => {
    const alta = {
      profesional_id: ID_PROFESIONAL,
      dia_semana: 0,
      desde: "09:00:00",
      hasta: "18:00:00",
    };
    const { invalidados, llamadas } = await ejecutar(useCrearHorario, alta);

    expect(llamadas[0]).toEqual([
      "/horarios-atencion",
      { method: "POST", body: alta },
    ]);
    invalidacionUnica(invalidados, "horarios");
  });

  it("editar un horario hace PATCH /horarios-atencion/{id} e invalida solo horarios", async () => {
    const { invalidados, llamadas } = await ejecutar(useActualizarHorario, {
      id: ID_HORARIO,
      parche: { hasta: "13:00:00" },
    });

    expect(llamadas[0]).toEqual([
      `/horarios-atencion/${ID_HORARIO}`,
      { method: "PATCH", body: { hasta: "13:00:00" } },
    ]);
    invalidacionUnica(invalidados, "horarios");
  });

  it("crear un bloqueo hace POST /bloqueos e invalida solo bloqueos", async () => {
    const alta = {
      desde: "2026-11-20T09:00:00-03:00",
      hasta: "2026-11-20T13:00:00-03:00",
      motivo: "Feriado ficticio",
    };
    const { invalidados, llamadas } = await ejecutar(useCrearBloqueo, alta);

    expect(llamadas[0]).toEqual(["/bloqueos", { method: "POST", body: alta }]);
    invalidacionUnica(invalidados, "bloqueos");
  });

  it("eliminar un bloqueo hace DELETE /bloqueos/{id} e invalida solo bloqueos", async () => {
    const { invalidados, llamadas } = await ejecutar(
      useEliminarBloqueo,
      ID_BLOQUEO,
    );

    expect(llamadas[0]).toEqual([`/bloqueos/${ID_BLOQUEO}`, { method: "DELETE" }]);
    invalidacionUnica(invalidados, "bloqueos");
  });
});
