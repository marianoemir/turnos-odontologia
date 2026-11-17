import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setAuthHandlers } from "../auth/auth-events";
import { clearSession, getSession, setSession } from "../auth/session";
import { ApiError } from "../types/errors";
import type { ReservaCreatePublica } from "../types/api-reserva-publica";
import {
  cancelarToken,
  confirmarToken,
  crearReservaPublica,
  obtenerPrestacionesPublicas,
  obtenerSlotsPublicos,
  usePrestacionesPublicas,
} from "./reserva-publica";

type ImplementacionFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const PROF_ID = "11111111-1111-4111-8111-111111111111";
const PREST_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const JWT_FICTICIO = "jwt-ficticio-activo";

const SESION_FICTICIA = {
  token: JWT_FICTICIO,
  rol: "recepcion" as const,
  usuario: "usuario-ficticio",
  sucursalId: "44444444-4444-4444-8444-444444444444",
};

const BODY_RESERVA: ReservaCreatePublica = {
  nombre: "Paciente Ficticio Uno",
  dni: "10000001",
  profesional_id: PROF_ID,
  prestacion_id: PREST_ID,
  inicio: "2026-11-20T09:00:00-03:00",
};

function stubFetch(implementacion: ImplementacionFetch) {
  const mock = vi.fn(implementacion);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function respuestaJson(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function capturar(promesa: Promise<unknown>): Promise<ApiError> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("se esperaba un ApiError y la promesa resolvió");
}

function nuevoClienteSinRetryPorDefecto(): QueryClient {
  return new QueryClient();
}

function crearWrapper(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

function headersDe(mock: ReturnType<typeof stubFetch>, indice = 0): Headers {
  return new Headers(mock.mock.calls[indice][1]?.headers);
}

let onUnauthorized: () => void;
let onForbidden: () => void;
let desregistrarHandlers: () => void;

beforeEach(() => {
  clearSession();
  setSession(SESION_FICTICIA);
  onUnauthorized = vi.fn<() => void>();
  onForbidden = vi.fn<() => void>();
  desregistrarHandlers = setAuthHandlers({
    onUnauthorized,
    onForbidden,
  });
});

afterEach(() => {
  desregistrarHandlers();
  cleanup();
  vi.unstubAllGlobals();
  clearSession();
});

function esperarSesionActiva(): void {
  expect(onUnauthorized).not.toHaveBeenCalled();
  expect(onForbidden).not.toHaveBeenCalled();
  expect(getSession()?.token).toBe(JWT_FICTICIO);
}

function esperarRequestPublicaSinAuthorization(mock: ReturnType<typeof stubFetch>): void {
  const headers = headersDe(mock);
  expect(headers.has("Authorization")).toBe(false);
  expect(headers.has("X-Actor-Rol")).toBe(false);
  expect(headers.has("X-Actor-Usuario")).toBe(false);
  expect(headers.has("X-Sucursal-Id")).toBe(false);
}

type Caso401403 = {
  nombre: string;
  status: 401 | 403;
  ejecutar: () => Promise<unknown>;
};

const CASOS_401_403: Caso401403[] = [
  {
    nombre: "obtenerSlotsPublicos",
    status: 401,
    ejecutar: () =>
      obtenerSlotsPublicos(PROF_ID, { prestacion: PREST_ID, fecha: "2026-11-20" }),
  },
  {
    nombre: "obtenerSlotsPublicos",
    status: 403,
    ejecutar: () =>
      obtenerSlotsPublicos(PROF_ID, { prestacion: PREST_ID, fecha: "2026-11-20" }),
  },
  {
    nombre: "crearReservaPublica",
    status: 401,
    ejecutar: () => crearReservaPublica(BODY_RESERVA),
  },
  {
    nombre: "crearReservaPublica",
    status: 403,
    ejecutar: () => crearReservaPublica(BODY_RESERVA),
  },
  {
    nombre: "confirmarToken",
    status: 401,
    ejecutar: () => confirmarToken(TOKEN),
  },
  {
    nombre: "confirmarToken",
    status: 403,
    ejecutar: () => confirmarToken(TOKEN),
  },
  {
    nombre: "cancelarToken",
    status: 401,
    ejecutar: () => cancelarToken(TOKEN),
  },
  {
    nombre: "cancelarToken",
    status: 403,
    ejecutar: () => cancelarToken(TOKEN),
  },
  {
    nombre: "obtenerPrestacionesPublicas",
    status: 401,
    ejecutar: () => obtenerPrestacionesPublicas(),
  },
  {
    nombre: "obtenerPrestacionesPublicas",
    status: 403,
    ejecutar: () => obtenerPrestacionesPublicas(),
  },
];

describe("reserva-publica contra http real — 401/403 públicos no alteran sesión", () => {
  for (const caso of CASOS_401_403) {
    it(`${caso.nombre}: ${caso.status} produce ApiError, sale sin Authorization, no notifica handlers y conserva sesión`, async () => {
      const fetchMock = stubFetch(() =>
        Promise.resolve(
          respuestaJson(caso.status, {
            detail: caso.status === 401 ? "no autenticado" : "acceso denegado",
          }),
        ),
      );

      const error = await capturar(caso.ejecutar());

      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(caso.status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      esperarRequestPublicaSinAuthorization(fetchMock);
      esperarSesionActiva();
    });
  }

  it("usePrestacionesPublicas: 401 produce ApiError, sale sin Authorization, no notifica handlers y conserva sesión", async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(respuestaJson(401, { detail: "no autenticado" })),
    );
    const client = nuevoClienteSinRetryPorDefecto();
    const { result } = renderHook(() => usePrestacionesPublicas(), {
      wrapper: crearWrapper(client),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    esperarRequestPublicaSinAuthorization(fetchMock);
    esperarSesionActiva();
  });

  it("usePrestacionesPublicas: 403 produce ApiError, sale sin Authorization, no notifica handlers y conserva sesión", async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(respuestaJson(403, { detail: "acceso denegado" })),
    );
    const client = nuevoClienteSinRetryPorDefecto();
    const { result } = renderHook(() => usePrestacionesPublicas(), {
      wrapper: crearWrapper(client),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    esperarRequestPublicaSinAuthorization(fetchMock);
    esperarSesionActiva();
  });
});

describe("reserva-publica contra http real — 429 público local", () => {
  it("crearReservaPublica: 429 produce ApiError, fetch 1 vez y no notifica handlers", async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(respuestaJson(429, { detail: "limite excedido" })),
    );

    const error = await capturar(crearReservaPublica(BODY_RESERVA));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    esperarSesionActiva();
  });

  it("obtenerPrestacionesPublicas: 429 produce ApiError, fetch 1 vez y no notifica handlers", async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(respuestaJson(429, { detail: "limite excedido" })),
    );

    const error = await capturar(obtenerPrestacionesPublicas());

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    esperarSesionActiva();
  });
});

describe("reserva-publica contra http real — hook sin retry por defecto del cliente", () => {
  it("usePrestacionesPublicas: 429 con QueryClient sin retry por defecto llama fetch exactamente 1 vez", async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(respuestaJson(429, { detail: "limite excedido" })),
    );
    const client = nuevoClienteSinRetryPorDefecto();
    const { result } = renderHook(() => usePrestacionesPublicas(), {
      wrapper: crearWrapper(client),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    esperarSesionActiva();
  });

  it("usePrestacionesPublicas: 500 con QueryClient sin retry por defecto llama fetch exactamente 1 vez", async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(respuestaJson(500, { detail: "error interno" })),
    );
    const client = nuevoClienteSinRetryPorDefecto();
    const { result } = renderHook(() => usePrestacionesPublicas(), {
      wrapper: crearWrapper(client),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    esperarSesionActiva();
  });
});