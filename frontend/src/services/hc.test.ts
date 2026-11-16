import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../types/errors";
import { MAX_DETALLE } from "./api-error";
import {
  actualizarHistoriaClinica,
  clasificar404HistoriaClinica,
  crearEntradaHc,
  crearHistoriaClinica,
  crearOdontograma,
  listarEntradasHc,
  listarOdontogramaPaciente,
  listarPlanesPorPaciente,
  obtenerHistoriaPorPaciente,
  useActualizarHistoriaClinica,
  useCrearEntradaHc,
  useCrearHistoriaClinica,
  useCrearOdontograma,
  useEntradasHc,
  useHistoriaPorPaciente,
  useOdontogramaPaciente,
  usePlanesPorPaciente,
} from "./hc";
import { apiRequest } from "./http";
import {
  hcEntradasQueryKey,
  hcOdontogramaQueryKey,
  hcPlanesQueryKey,
  hcPorPacienteQueryKey,
  resourceKeys,
} from "./query";

vi.mock("./http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const PAC_ID = "550e8400-e29b-41d4-a716-446655440000";
const HC_ID = "660e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  apiRequestMock.mockReset();
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

describe("servicios HC (contratos C-09)", () => {
  it("GET /pacientes/{paciente_id}/historia-clinica obtiene HC por paciente", async () => {
    apiRequestMock.mockResolvedValue({ id: HC_ID, paciente_id: PAC_ID });
    await obtenerHistoriaPorPaciente(PAC_ID);
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/pacientes/${encodeURIComponent(PAC_ID)}/historia-clinica`,
    );
  });

  it("POST /historias-clinicas crea HC con método y cuerpo correctos", async () => {
    apiRequestMock.mockResolvedValue({ id: HC_ID, paciente_id: PAC_ID });
    const body = {
      paciente_id: PAC_ID,
      antecedentes: "a",
      alergias: null,
      observaciones: null,
    };
    await crearHistoriaClinica(body);
    expect(apiRequestMock).toHaveBeenCalledWith("/historias-clinicas", {
      method: "POST",
      body,
    });
  });

  it("PATCH /historias-clinicas/{id} actualiza cabecera con método y cuerpo correctos", async () => {
    apiRequestMock.mockResolvedValue({ id: HC_ID, paciente_id: PAC_ID });
    const body = { observaciones: "obs" };
    await actualizarHistoriaClinica(HC_ID, body);
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/historias-clinicas/${encodeURIComponent(HC_ID)}`,
      { method: "PATCH", body },
    );
  });

  it("GET /historias-clinicas/{id}/entradas preserva el orden recibido", async () => {
    const entradas = [
      { id: "e1", fecha: "2026-01-01T00:00:00Z", texto: "a" },
      { id: "e2", fecha: "2026-01-02T00:00:00Z", texto: "b" },
      { id: "e3", fecha: "2026-01-03T00:00:00Z", texto: "c" },
    ];
    apiRequestMock.mockResolvedValue(entradas);
    const res = await listarEntradasHc(HC_ID);
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/historias-clinicas/${encodeURIComponent(HC_ID)}/entradas`,
    );
    expect(res).toEqual(entradas);
  });

  it("POST /historias-clinicas/{id}/entradas crea entrada con método y cuerpo correctos y sin prestacion_id", async () => {
    apiRequestMock.mockResolvedValue({ id: "e1", historia_clinica_id: HC_ID });
    const body = {
      profesional_id: "p1",
      fecha: "2026-11-15T12:00:00Z",
      texto: "nota",
    };
    await crearEntradaHc(HC_ID, body);
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/historias-clinicas/${encodeURIComponent(HC_ID)}/entradas`,
      { method: "POST", body },
    );
    expect(body).not.toHaveProperty("prestacion_id");
  });

  it("GET /pacientes/{paciente_id}/odontograma preserva el orden recibido", async () => {
    const registros = [
      { id: "o1", pieza: "16", fecha: "2026-01-01T00:00:00Z" },
      { id: "o2", pieza: "11", fecha: "2026-01-02T00:00:00Z" },
      { id: "o3", pieza: "16", fecha: "2026-01-03T00:00:00Z" },
    ];
    apiRequestMock.mockResolvedValue(registros);
    const res = await listarOdontogramaPaciente(PAC_ID);
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/pacientes/${encodeURIComponent(PAC_ID)}/odontograma`,
    );
    expect(res).toEqual(registros);
  });

  it("GET /pacientes/{paciente_id}/odontograma devuelve lista vacía", async () => {
    apiRequestMock.mockResolvedValue([]);
    const res = await listarOdontogramaPaciente(PAC_ID);
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/pacientes/${encodeURIComponent(PAC_ID)}/odontograma`,
    );
    expect(res).toEqual([]);
  });

  it("POST /pacientes/{paciente_id}/odontograma crea observación con método y cuerpo correctos y sin prestacion_id", async () => {
    apiRequestMock.mockResolvedValue({ id: "o1", paciente_id: PAC_ID });
    const body = {
      pieza: "16",
      estado: "caries",
      profesional_id: "pr1",
      fecha: "2026-11-15T12:00:00Z",
    };
    await crearOdontograma(PAC_ID, body);
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/pacientes/${encodeURIComponent(PAC_ID)}/odontograma`,
      { method: "POST", body },
    );
    expect(body).not.toHaveProperty("prestacion_id");
  });

  it("GET /pacientes/{paciente_id}/planes-tratamiento devuelve lista vacía", async () => {
    apiRequestMock.mockResolvedValue([]);
    const res = await listarPlanesPorPaciente(PAC_ID);
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/pacientes/${encodeURIComponent(PAC_ID)}/planes-tratamiento`,
    );
    expect(res).toEqual([]);
  });

  it("GET /pacientes/{paciente_id}/planes-tratamiento devuelve planes con items y totales", async () => {
    const planes = [
      {
        id: "pl1",
        paciente_id: PAC_ID,
        profesional_id: "pr1",
        estado: "borrador",
        creado_en: "2026-01-01T00:00:00Z",
        items: [
          {
            id: "i1",
            plan_id: "pl1",
            pieza: "16",
            prestacion_id: "ps1",
            estado: "pendiente",
            monto_centavos: 1500000,
            monto_cobertura_centavos: 750000,
          },
        ],
        total_centavos: 1500000,
        cobertura_centavos: 750000,
      },
    ];
    apiRequestMock.mockResolvedValue(planes);
    const res = await listarPlanesPorPaciente(PAC_ID);
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/pacientes/${encodeURIComponent(PAC_ID)}/planes-tratamiento`,
    );
    expect(res).toEqual(planes);
  });
});

describe("clasificación 404 de historia clínica por paciente (D9)", () => {
  it("404 con detalle 'historia clinica no existe para paciente' es sin historia", () => {
    const error = new ApiError({
      kind: "no_encontrado",
      status: 404,
      mensaje: `historia clinica no existe para paciente: ${PAC_ID}`,
      detalle: `historia clinica no existe para paciente: ${PAC_ID}`,
    });
    expect(clasificar404HistoriaClinica(error)).toBe("sin_historia");
  });

  it("404 con detalle 'paciente no existe' es paciente inexistente", () => {
    const error = new ApiError({
      kind: "no_encontrado",
      status: 404,
      mensaje: `paciente no existe: ${PAC_ID}`,
      detalle: `paciente no existe: ${PAC_ID}`,
    });
    expect(clasificar404HistoriaClinica(error)).toBe("paciente_inexistente");
  });

  it("404 con detalle ausente o no reconocible es recurso inexistente", () => {
    const error = new ApiError({
      kind: "no_encontrado",
      status: 404,
      mensaje: "no encontrado",
      detalle: "no encontrado",
    });
    expect(clasificar404HistoriaClinica(error)).toBe("recurso_inexistente");
  });

  it("404 con detalle truncado conserva el inicio del mensaje y clasifica sin historia", () => {
    const prefijo = `historia clinica no existe para paciente: ${PAC_ID} `;
    const detalleLargo = `${prefijo}${"x".repeat(MAX_DETALLE + 20)}`.slice(
      0,
      MAX_DETALLE,
    );
    const error = new ApiError({
      kind: "no_encontrado",
      status: 404,
      mensaje: detalleLargo,
      detalle: detalleLargo,
    });
    expect(detalleLargo.length).toBe(MAX_DETALLE);
    expect(detalleLargo.startsWith("historia clinica no existe para paciente")).toBe(true);
    expect(clasificar404HistoriaClinica(error)).toBe("sin_historia");
  });
});

describe("propagación de errores HC", () => {
  it("409 historia_clinica_duplicada se propaga sin cambios (mismo ApiError)", async () => {
    const error409 = new ApiError({
      kind: "conflicto",
      status: 409,
      causa: "historia_clinica_duplicada",
      mensaje: "duplicada",
      detalle: "duplicada",
    });
    apiRequestMock.mockRejectedValue(error409);
    await expect(
      crearHistoriaClinica({ paciente_id: PAC_ID }),
    ).rejects.toBe(error409);
  });

  it("422 con detail string se propaga sin cambios", async () => {
    const error422 = new ApiError({
      kind: "validacion",
      status: 422,
      mensaje: "pieza inválida",
      detalle: "pieza inválida",
    });
    apiRequestMock.mockRejectedValue(error422);
    await expect(
      crearOdontograma(PAC_ID, {
        pieza: "99",
        estado: "x",
        profesional_id: "pr1",
        fecha: "2026-11-15T12:00:00Z",
      }),
    ).rejects.toBe(error422);
  });

  it("422 con detail lista se propaga sin cambios", async () => {
    const error422 = new ApiError({
      kind: "validacion",
      status: 422,
      mensaje: "La request tiene campos inválidos: body.texto: ...",
      detalle: "body.texto: ...",
      campos: [{ ubicacion: "body.texto", mensaje: "Field required" }],
    });
    apiRequestMock.mockRejectedValue(error422);
    await expect(
      crearEntradaHc(HC_ID, {
        profesional_id: "p1",
        fecha: "2026-11-15T12:00:00Z",
        texto: "",
      }),
    ).rejects.toBe(error422);
  });
});

describe("hooks HC (lecturas y mutaciones)", () => {
  it("useHistoriaPorPaciente usa la clave de query de HC por paciente", async () => {
    apiRequestMock.mockResolvedValue({ id: HC_ID, paciente_id: PAC_ID });
    const client = nuevoCliente();
    const { result } = renderHook(() => useHistoriaPorPaciente(PAC_ID), {
      wrapper: crearWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/pacientes/${encodeURIComponent(PAC_ID)}/historia-clinica`,
      { signal: expect.any(AbortSignal) },
    );
    expect(
      client.getQueryCache().find({ queryKey: hcPorPacienteQueryKey(PAC_ID) }),
    ).toBeTruthy();
  });

  it("useEntradasHc usa la clave de entradas por HC", async () => {
    apiRequestMock.mockResolvedValue([]);
    const client = nuevoCliente();
    const { result } = renderHook(() => useEntradasHc(HC_ID), {
      wrapper: crearWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/historias-clinicas/${encodeURIComponent(HC_ID)}/entradas`,
      { signal: expect.any(AbortSignal) },
    );
    expect(
      client.getQueryCache().find({ queryKey: hcEntradasQueryKey(HC_ID) }),
    ).toBeTruthy();
  });

  it("useOdontogramaPaciente usa la clave de odontograma por paciente", async () => {
    apiRequestMock.mockResolvedValue([]);
    const client = nuevoCliente();
    const { result } = renderHook(() => useOdontogramaPaciente(PAC_ID), {
      wrapper: crearWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/pacientes/${encodeURIComponent(PAC_ID)}/odontograma`,
      { signal: expect.any(AbortSignal) },
    );
    expect(
      client.getQueryCache().find({ queryKey: hcOdontogramaQueryKey(PAC_ID) }),
    ).toBeTruthy();
  });

  it("usePlanesPorPaciente usa la clave de planes por paciente", async () => {
    apiRequestMock.mockResolvedValue([]);
    const client = nuevoCliente();
    const { result } = renderHook(() => usePlanesPorPaciente(PAC_ID), {
      wrapper: crearWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/pacientes/${encodeURIComponent(PAC_ID)}/planes-tratamiento`,
      { signal: expect.any(AbortSignal) },
    );
    expect(
      client.getQueryCache().find({ queryKey: hcPlanesQueryKey(PAC_ID) }),
    ).toBeTruthy();
  });

  it("useCrearHistoriaClinica hace POST y invalida la raíz historiasClinicas", async () => {
    const client = nuevoCliente();
    client.setQueryData(resourceKeys.historiasClinicas.all, []);
    apiRequestMock.mockResolvedValue({ id: HC_ID, paciente_id: PAC_ID });
    const { result } = renderHook(() => useCrearHistoriaClinica(), {
      wrapper: crearWrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({ paciente_id: PAC_ID });
    });
    expect(apiRequestMock).toHaveBeenCalledWith("/historias-clinicas", {
      method: "POST",
      body: { paciente_id: PAC_ID },
    });
    expect(
      client.getQueryState(resourceKeys.historiasClinicas.all)?.isInvalidated,
    ).toBe(true);
  });

  it("useActualizarHistoriaClinica hace PATCH y no envía prestacion_id", async () => {
    const client = nuevoCliente();
    apiRequestMock.mockResolvedValue({ id: HC_ID, paciente_id: PAC_ID });
    const { result } = renderHook(() => useActualizarHistoriaClinica(), {
      wrapper: crearWrapper(client),
    });
    const body = { observaciones: "obs" };
    await act(async () => {
      await result.current.mutateAsync({ hcId: HC_ID, body });
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/historias-clinicas/${encodeURIComponent(HC_ID)}`,
      { method: "PATCH", body },
    );
    expect(body).not.toHaveProperty("prestacion_id");
  });

  it("useCrearEntradaHc hace POST y no envía prestacion_id", async () => {
    const client = nuevoCliente();
    apiRequestMock.mockResolvedValue({ id: "e1" });
    const { result } = renderHook(() => useCrearEntradaHc(), {
      wrapper: crearWrapper(client),
    });
    const body = { profesional_id: "p1", fecha: "2026-11-15T12:00:00Z", texto: "n" };
    await act(async () => {
      await result.current.mutateAsync({ hcId: HC_ID, body });
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/historias-clinicas/${encodeURIComponent(HC_ID)}/entradas`,
      { method: "POST", body },
    );
    expect(body).not.toHaveProperty("prestacion_id");
  });

  it("useCrearOdontograma hace POST y no envía prestacion_id", async () => {
    const client = nuevoCliente();
    apiRequestMock.mockResolvedValue({ id: "o1" });
    const { result } = renderHook(() => useCrearOdontograma(), {
      wrapper: crearWrapper(client),
    });
    const body = {
      pieza: "16",
      estado: "caries",
      profesional_id: "pr1",
      fecha: "2026-11-15T12:00:00Z",
    };
    await act(async () => {
      await result.current.mutateAsync({ pacienteId: PAC_ID, body });
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/pacientes/${encodeURIComponent(PAC_ID)}/odontograma`,
      { method: "POST", body },
    );
    expect(body).not.toHaveProperty("prestacion_id");
  });

  it("los hooks de mutación HC no reintentan en fallo", async () => {
    const client = nuevoCliente();
    apiRequestMock.mockRejectedValue(new Error("fallo"));
    const { result } = renderHook(() => useCrearHistoriaClinica(), {
      wrapper: crearWrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({ paciente_id: PAC_ID }).catch(() => undefined);
    });
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });
});
