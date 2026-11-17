/**
 * RED/verde 1.1, 1.2, 6.4-6.7 — reserva pública (C-21).
 * Datos ficticios. 6.4 y 6.7 se verifican a nivel helper/hook.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notifyForbidden, notifyUnauthorized } from "../auth/auth-events";
import { setSession, clearSession } from "../auth/session";
import { ApiError } from "../types/errors";
import { resourceKeys } from "./query";
import { apiRequest } from "./http";
import {
  cancelarToken,
  confirmarToken,
  crearReservaPublica,
  obtenerPrestacionesPublicas,
  obtenerSlotsPublicos,
  prestacionesPublicasQueryKey,
  usePrestacionesPublicas,
} from "./reserva-publica";

vi.mock("./http", () => ({ apiRequest: vi.fn() }));
vi.mock("../auth/auth-events", () => ({
  notifyUnauthorized: vi.fn(),
  notifyForbidden: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);
const notifyUnauthorizedMock = vi.mocked(notifyUnauthorized);
const notifyForbiddenMock = vi.mocked(notifyForbidden);

const PROF_ID = "11111111-1111-4111-8111-111111111111";
const PREST_ID = "22222222-2222-4222-8222-222222222222";
const TURNO_ID = "33333333-3333-4333-8333-333333333333";
const TOKEN = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 43 chars URL-safe ficticio

beforeEach(() => {
  apiRequestMock.mockReset();
  notifyUnauthorizedMock.mockReset();
  notifyForbiddenMock.mockReset();
  clearSession();
});

afterEach(cleanup);

function nuevoCliente(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function crearWrapper(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

function setSesionActiva(): void {
  setSession({
    token: "jwt-ficticio-activo",
    rol: "recepcion",
    usuario: "usuario-ficticio",
    sucursalId: "44444444-4444-4444-8444-444444444444",
  });
}

describe("1.1 tipos/helpers de reserva pública y tokens", () => {
  it("GET /reservar/{profesional} consulta slots con publica:true, prestacion y fecha", async () => {
    setSesionActiva();
    const slots = [
      { inicio: "2026-11-20T09:00:00-03:00", fin: "2026-11-20T09:30:00-03:00" },
    ];
    apiRequestMock.mockResolvedValue(slots);

    const res = await obtenerSlotsPublicos(PROF_ID, {
      prestacion: PREST_ID,
      fecha: "2026-11-20",
    });

    expect(res).toEqual(slots);
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/reservar/${encodeURIComponent(PROF_ID)}?prestacion=${encodeURIComponent(PREST_ID)}&fecha=2026-11-20`,
      { publica: true },
    );
  });

  it("POST /reservar crea reserva con publica:true y cuerpo ReservaCreate (contacto opcional)", async () => {
    setSesionActiva();
    const body = {
      nombre: "Paciente Ficticio Uno",
      dni: "10000001",
      profesional_id: PROF_ID,
      prestacion_id: PREST_ID,
      inicio: "2026-11-20T09:00:00-03:00",
    };
    const respuesta = {
      turno_id: TURNO_ID,
      profesional_id: PROF_ID,
      prestacion_id: PREST_ID,
      inicio: "2026-11-20T09:00:00-03:00",
      fin: "2026-11-20T09:30:00-03:00",
      estado: "pendiente",
    };
    apiRequestMock.mockResolvedValue(respuesta);

    const res = await crearReservaPublica(body);

    expect(res).toEqual(respuesta);
    expect(apiRequestMock).toHaveBeenCalledWith("/reservar", {
      method: "POST",
      body,
      publica: true,
    });
  });

  it("POST /reservar preserva contacto cuando se envía", async () => {
    apiRequestMock.mockResolvedValue({ turno_id: TURNO_ID });
    const body = {
      nombre: "Paciente Ficticio Dos",
      dni: "10000002",
      contacto: "contacto-ficticio",
      profesional_id: PROF_ID,
      prestacion_id: PREST_ID,
      inicio: "2026-11-20T10:00:00-03:00",
    };

    await crearReservaPublica(body);

    expect(apiRequestMock).toHaveBeenCalledWith("/reservar", {
      method: "POST",
      body,
      publica: true,
    });
  });

  it("POST /confirmar/{token} y /cancelar/{token} usan publica:true y token codificado en ruta", async () => {
    setSesionActiva();
    const tokenRaro = "A/B C?+==";
    const resConfirmar = {
      resultado: "confirmado",
      turno_id: TURNO_ID,
      inicio: "2026-11-20T09:00:00-03:00",
    };
    const resCancelar = {
      resultado: "cancelado",
      turno_id: TURNO_ID,
      inicio: "2026-11-20T09:00:00-03:00",
    };
    apiRequestMock.mockResolvedValueOnce(resConfirmar).mockResolvedValueOnce(resCancelar);

    const c = await confirmarToken(tokenRaro);
    const x = await cancelarToken(tokenRaro);

    expect(c).toEqual(resConfirmar);
    expect(x).toEqual(resCancelar);
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      `/confirmar/${encodeURIComponent(tokenRaro)}`,
      { method: "POST", publica: true },
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      `/cancelar/${encodeURIComponent(tokenRaro)}`,
      { method: "POST", publica: true },
    );
  });
});

describe("1.2 lectura pública de prestaciones", () => {
  it("obtiene GET /prestaciones con publica:true y sin incluir_inactivos", async () => {
    setSesionActiva();
    const prestaciones = [
      { id: PREST_ID, nombre: "Limpieza ficticia", duracion_min: 30, activo: true },
    ];
    apiRequestMock.mockResolvedValue(prestaciones);

    const res = await obtenerPrestacionesPublicas();

    expect(res).toEqual(prestaciones);
    expect(apiRequestMock).toHaveBeenCalledWith("/prestaciones", { publica: true });
    const ruta = String(apiRequestMock.mock.calls[0][0]);
    expect(ruta).not.toContain("incluir_inactivos");
  });

  it("usa queryKey propia distinta de la de catalogo interno", () => {
    expect(prestacionesPublicasQueryKey).not.toEqual(resourceKeys.prestaciones.all);
    expect(JSON.stringify(prestacionesPublicasQueryKey)).not.toBe(
      JSON.stringify(resourceKeys.prestaciones.all),
    );
  });

  it("hook público usa la queryKey propia y no la de catalogo", async () => {
    apiRequestMock.mockResolvedValue([]);
    const client = nuevoCliente();
    const { result } = renderHook(() => usePrestacionesPublicas(), {
      wrapper: crearWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      client.getQueryCache().find({ queryKey: prestacionesPublicasQueryKey as readonly unknown[] }),
    ).toBeTruthy();
    expect(
      client.getQueryCache().find({ queryKey: resourceKeys.prestaciones.all }),
    ).toBeFalsy();
  });
});

describe("6.4 Reserva sin token de sesión (helper/hook)", () => {
  it("consulta slots sin Authorization con sesión activa y presenta respuesta exitosa", async () => {
    setSesionActiva();
    apiRequestMock.mockResolvedValue([]);

    const res = await obtenerSlotsPublicos(PROF_ID, {
      prestacion: PREST_ID,
      fecha: "2026-11-20",
    });

    expect(res).toEqual([]);
    expect(apiRequestMock).toHaveBeenCalledWith(expect.any(String), { publica: true });
    expect(notifyUnauthorizedMock).not.toHaveBeenCalled();
    expect(notifyForbiddenMock).not.toHaveBeenCalled();
  });

  it("alta sin Authorization con sesión activa y presenta 201 en helper", async () => {
    setSesionActiva();
    const respuesta = {
      turno_id: TURNO_ID,
      profesional_id: PROF_ID,
      prestacion_id: PREST_ID,
      inicio: "2026-11-20T09:00:00-03:00",
      fin: "2026-11-20T09:30:00-03:00",
      estado: "pendiente",
    };
    apiRequestMock.mockResolvedValue(respuesta);

    const res = await crearReservaPublica({
      nombre: "Paciente Ficticio Uno",
      dni: "10000001",
      profesional_id: PROF_ID,
      prestacion_id: PREST_ID,
      inicio: "2026-11-20T09:00:00-03:00",
    });

    expect(res).toEqual(respuesta);
    expect(apiRequestMock.mock.calls[0][1]).toMatchObject({ publica: true });
  });
});

describe("6.5 Error 401 o 403 en request pública no altera la sesión (helper/hook)", () => {
  it("401 público no llama notifyUnauthorized/notifyForbidden", async () => {
    setSesionActiva();
    apiRequestMock.mockImplementation(async (_ruta, opts) => {
      if (opts?.publica !== true) notifyUnauthorizedMock();
      throw new ApiError({ kind: "validacion", status: 401, mensaje: "No autorizado" });
    });

    await expect(
      obtenerSlotsPublicos(PROF_ID, { prestacion: PREST_ID, fecha: "2026-11-20" }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(apiRequestMock).toHaveBeenCalledWith(expect.any(String), { publica: true });
    expect(notifyUnauthorizedMock).not.toHaveBeenCalled();
    expect(notifyForbiddenMock).not.toHaveBeenCalled();
  });

  it("403 público no llama notifyUnauthorized/notifyForbidden", async () => {
    setSesionActiva();
    apiRequestMock.mockImplementation(async (_ruta, opts) => {
      if (opts?.publica !== true) notifyForbiddenMock();
      throw new ApiError({ kind: "permiso", status: 403, mensaje: "Prohibido" });
    });

    await expect(confirmarToken(TOKEN)).rejects.toBeInstanceOf(ApiError);

    expect(apiRequestMock).toHaveBeenCalledWith(
      `/confirmar/${TOKEN}`,
      { method: "POST", publica: true },
    );
    expect(notifyUnauthorizedMock).not.toHaveBeenCalled();
    expect(notifyForbiddenMock).not.toHaveBeenCalled();
  });
});

describe("6.6 Error 429 en request pública se maneja localmente (helper/hook)", () => {
  it("429 en alta no reintenta automáticamente (exactamente 1 request)", async () => {
    setSesionActiva();
    apiRequestMock.mockRejectedValue(
      new ApiError({ kind: "validacion", status: 429, mensaje: "rate_limit" }),
    );

    await expect(
      crearReservaPublica({
        nombre: "Paciente Ficticio Uno",
        dni: "10000001",
        profesional_id: PROF_ID,
        prestacion_id: PREST_ID,
        inicio: "2026-11-20T09:00:00-03:00",
      }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });

  it("429 en prestaciones públicas no reintenta automáticamente (exactamente 1 request)", async () => {
    setSesionActiva();
    apiRequestMock.mockRejectedValue(
      new ApiError({ kind: "validacion", status: 429, mensaje: "rate_limit" }),
    );

    await expect(obtenerPrestacionesPublicas()).rejects.toBeInstanceOf(ApiError);

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });
});

describe("6.7 Prestaciones se listan sin sesión (helper/hook)", () => {
  it("solicita GET /prestaciones público sin Authorization ni incluir_inactivos y con queryKey propia", async () => {
    setSesionActiva();
    const prestaciones = [
      { id: PREST_ID, nombre: "Limpieza ficticia", duracion_min: 30, activo: true },
    ];
    apiRequestMock.mockResolvedValue(prestaciones);
    const client = nuevoCliente();

    const { result } = renderHook(() => usePrestacionesPublicas(), {
      wrapper: crearWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(prestaciones);
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/prestaciones",
      expect.objectContaining({ publica: true }),
    );
    expect(String(apiRequestMock.mock.calls[0][0])).not.toContain("incluir_inactivos");
    expect(prestacionesPublicasQueryKey).not.toEqual(resourceKeys.prestaciones.all);
    expect(
      client.getQueryCache().find({ queryKey: prestacionesPublicasQueryKey as readonly unknown[] }),
    ).toBeTruthy();
  });

  it("401/403 en prestaciones públicas no dispara notifyUnauthorized/notifyForbidden", async () => {
    setSesionActiva();
    apiRequestMock.mockRejectedValueOnce(
      new ApiError({ kind: "validacion", status: 401, mensaje: "No autorizado" }),
    );

    await expect(obtenerPrestacionesPublicas()).rejects.toBeInstanceOf(ApiError);
    expect(notifyUnauthorizedMock).not.toHaveBeenCalled();
    expect(notifyForbiddenMock).not.toHaveBeenCalled();

    apiRequestMock.mockRejectedValueOnce(
      new ApiError({ kind: "permiso", status: 403, mensaje: "Prohibido" }),
    );
    await expect(obtenerPrestacionesPublicas()).rejects.toBeInstanceOf(ApiError);
    expect(notifyUnauthorizedMock).not.toHaveBeenCalled();
    expect(notifyForbiddenMock).not.toHaveBeenCalled();
  });
});
