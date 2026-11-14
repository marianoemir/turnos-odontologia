/**
 * RED de 3.2 — wrapper de `fetch` con timeout, aborto y cabeceras (design D5).
 *
 * `fetch` se stubbea con `vi.stubGlobal`. Las cuatro causas de transporte del
 * design se simulan con el error real que produce cada una: `TimeoutError` y
 * `AbortError` son `DOMException`; una red caída rechaza con `TypeError`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../types/errors";
import { apiRequest } from "./http";
import { clearSession, setSession } from "../auth/session";

type ImplementacionFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

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

beforeEach(clearSession);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest — respuestas exitosas y de error", () => {
  it("devuelve el valor tipado de un 201 con JSON", async () => {
    stubFetch(() =>
      Promise.resolve(
        respuestaJson(201, { id: "5b8f0d6e", estado: "pendiente" }),
      ),
    );

    const turno = await apiRequest<{ id: string; estado: string }>("/turnos", {
      method: "POST",
      body: { inicio: "2026-11-10T09:00:00-03:00" },
    });

    expect(turno).toEqual({ id: "5b8f0d6e", estado: "pendiente" });
  });

  it("traduce un 409 del backend a un ApiError de conflicto", async () => {
    stubFetch(() =>
      Promise.resolve(
        respuestaJson(409, {
          detail: {
            causa: "sillon",
            detalle: "el sillon ya tiene un turno activo en ese intervalo",
          },
        }),
      ),
    );

    const error = await capturar(apiRequest("/turnos", { method: "POST" }));

    expect(error.kind).toBe("conflicto");
    expect(error.status).toBe(409);
    expect(error.causa).toBe("sillon");
    expect(error.detalle).toBe(
      "el sillon ya tiene un turno activo en ese intervalo",
    );
  });
});

describe("apiRequest — las cuatro causas de transporte de D5", () => {
  it("mapea el rechazo con TimeoutError a kind timeout", async () => {
    stubFetch(() =>
      Promise.reject(
        new DOMException("The operation was aborted due to timeout", "TimeoutError"),
      ),
    );

    const error = await capturar(apiRequest("/agenda"));

    expect(error.kind).toBe("timeout");
    expect(error.status).toBeNull();
    expect(error.message).toMatch(/tiempo de espera/i);
  });

  it("mapea el aborto del llamador a kind red con un mensaje propio", async () => {
    const controller = new AbortController();
    stubFetch(
      (_input, init) =>
        new Promise<Response>((_resolver, rechazar) => {
          init?.signal?.addEventListener("abort", () => {
            rechazar(
              new DOMException("The operation was aborted.", "AbortError"),
            );
          });
        }),
    );

    const promesa = apiRequest("/agenda", { signal: controller.signal });
    controller.abort();
    const error = await capturar(promesa);

    expect(error.kind).toBe("red");
    expect(error.status).toBeNull();
    expect(error.message).toMatch(/cancel/i);
    expect(error.message).not.toMatch(/tiempo de espera/i);
  });

  it("mapea el rechazo con TypeError (red caída) a kind red", async () => {
    stubFetch(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    );

    const error = await capturar(apiRequest("/agenda"));

    expect(error.kind).toBe("red");
    expect(error.status).toBeNull();
    expect(error.message.length).toBeGreaterThan(0);
  });

  it("mapea un cuerpo no JSON a kind red conservando el status", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response("<html><head><title>502 Bad Gateway</title></head></html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );

    const error = await capturar(apiRequest("/agenda"));

    expect(error.kind).toBe("red");
    expect(error.status).toBe(502);
    expect(error.detalle).toContain("502 Bad Gateway");
  });
});

describe("apiRequest — cabeceras de la request", () => {
  it("envía exclusivamente Bearer y Content-Type en una request protegida", async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(respuestaJson(201, { id: "5b8f0d6e" })),
    );
    setSession({
      token: "jwt-de-prueba",
      rol: "recepcion",
      usuario: "usuario-ficticio",
      sucursalId: "5b8f0d6e-3a2c-4a41-9f0e-7a1f6b0c9d21",
    });

    await apiRequest("/turnos", { method: "POST", body: { inicio: "x" } });

    const [url, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);

    expect(String(url)).toBe("/api/turnos");
    expect(headers.get("Authorization")).toBe("Bearer jwt-de-prueba");
    expect(headers.has("X-Actor-Rol")).toBe(false);
    expect(headers.has("X-Actor-Usuario")).toBe(false);
    expect(headers.has("X-Sucursal-Id")).toBe(false);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(init?.method).toBe("POST");
  });

  it("descarta identidad inyectada y usa sólo el Bearer de la sesión", async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(respuestaJson(200, {})),
    );
    setSession({
      token: "jwt-de-sesion",
      rol: "recepcion",
      usuario: "usuario-ficticio",
      sucursalId: null,
    });

    await apiRequest("/agenda", {
      headers: {
        "x-actor-rol": "admin",
        "X-ACTOR-USUARIO": "intruso",
        "x-Sucursal-Id": "sucursal-inyectada",
        authorization: "Bearer token-inyectado",
        "X-Request-Id": "traza-segura",
      },
    });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer jwt-de-sesion");
    expect(headers.has("X-Actor-Rol")).toBe(false);
    expect(headers.has("X-Actor-Usuario")).toBe(false);
    expect(headers.has("X-Sucursal-Id")).toBe(false);
    expect(headers.get("X-Request-Id")).toBe("traza-segura");
  });
});

describe("apiRequest — rutas públicas", () => {
  function headersDe(mock: ReturnType<typeof stubFetch>, indice: number): Headers {
    return new Headers(mock.mock.calls[indice][1]?.headers);
  }

  it("una ruta pública no envía token ni cabeceras de identidad", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(respuestaJson(200, {})));
    setSession({
      token: "jwt-de-prueba",
      rol: "recepcion",
      usuario: "usuario-ficticio",
      sucursalId: null,
    });

    await apiRequest("/reservar/abc", { publica: true });

    const headers = headersDe(fetchMock, 0);
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.has("X-Actor-Rol")).toBe(false);
    expect(headers.has("X-Actor-Usuario")).toBe(false);
    expect(headers.has("X-Sucursal-Id")).toBe(false);
  });

  it("descarta toda identidad inyectada en una request pública", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(respuestaJson(200, {})));
    setSession({
      token: "jwt-de-sesion",
      rol: "recepcion",
      usuario: "usuario-ficticio",
      sucursalId: null,
    });

    await apiRequest("/reservar/abc", {
      publica: true,
      headers: {
        "X-ACTOR-ROL": "admin",
        "x-actor-usuario": "intruso",
        "X-sucursal-id": "sucursal-inyectada",
        AUTHORIZATION: "Bearer token-inyectado",
        "X-Request-Id": "traza-publica",
      },
    });

    const headers = headersDe(fetchMock, 0);
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.has("X-Actor-Rol")).toBe(false);
    expect(headers.has("X-Actor-Usuario")).toBe(false);
    expect(headers.has("X-Sucursal-Id")).toBe(false);
    expect(headers.get("X-Request-Id")).toBe("traza-publica");
  });
});
