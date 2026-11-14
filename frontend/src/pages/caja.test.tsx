import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CajaOut } from "../types/api-caja";
import { ApiError } from "../types/errors";
import CajaPage from "./caja";
import { abrirCaja, cerrarCaja, obtenerCajaPorFecha } from "../services/caja";

vi.mock("../services/caja", () => {
  const parseMontoCajaACentavos = (v: string) => {
    const crudo = v.trim();
    if (!crudo) throw new Error("Monto inválido");
    if (crudo === "0" || crudo === "0,00" || crudo === "0.00") return 0;
    const norm = crudo.replace(/\./g, "").replace(",", ".");
    const n = Number(norm);
    if (!Number.isFinite(n) || n < 0) throw new Error("Monto inválido");
    return Math.round(n * 100);
  };
  return {
    abrirCaja: vi.fn(),
    cerrarCaja: vi.fn(),
    obtenerCajaPorFecha: vi.fn(),
    obtenerCajaPorId: vi.fn(),
    registrarCobro: vi.fn(),
    obtenerCobro: vi.fn(),
    anularCobro: vi.fn(),
    facturarArca: vi.fn(),
    listarLiquidaciones: vi.fn(),
    parseMontoCajaACentavos,
    parsePesosACentavos: (v: string) => {
      const crudo = v.trim();
      if (!crudo) throw new Error("Monto inválido");
      if (crudo === "0" || crudo === "0,00" || crudo === "0.00") throw new Error("Monto inválido");
      const norm = crudo.replace(/\./g, "").replace(",", ".");
      const n = Number(norm);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Monto inválido");
      return Math.round(n * 100);
    },
  };
});

const obtenerCajaPorFechaMock = vi.mocked(obtenerCajaPorFecha);
const abrirCajaMock = vi.mocked(abrirCaja);
const cerrarCajaMock = vi.mocked(cerrarCaja);

const ID_CAJA = "11111111-1111-4111-8111-111111111111";

function cajaAbierta(overrides: Partial<CajaOut> = {}): CajaOut {
  return {
    id: ID_CAJA,
    fecha: "2026-11-14",
    monto_apertura_centavos: 10000,
    abierto_en: "2026-11-14T10:00:00Z",
    cerrado_en: null,
    monto_cierre_contado_centavos: null,
    monto_esperado_centavos: null,
    diferencia_centavos: null,
    estado: "abierta",
    totales_por_medio_centavos: { efectivo: 5000 },
    ...overrides,
  };
}

function cajaCerrada(overrides: Partial<CajaOut> = {}): CajaOut {
  return {
    id: ID_CAJA,
    fecha: "2026-11-14",
    monto_apertura_centavos: 10000,
    abierto_en: "2026-11-14T10:00:00Z",
    cerrado_en: "2026-11-14T18:00:00Z",
    monto_cierre_contado_centavos: 15000,
    monto_esperado_centavos: 15000,
    diferencia_centavos: 0,
    estado: "cerrada",
    totales_por_medio_centavos: { efectivo: 15000 },
    ...overrides,
  };
}

beforeEach(() => {
  obtenerCajaPorFechaMock.mockReset();
  abrirCajaMock.mockReset();
  cerrarCajaMock.mockReset();
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CajaPage />
    </QueryClientProvider>,
  );
}

describe("2.1 Consulta de caja por fecha", () => {
  it("muestra caja abierta sin montos de cierre finalizados (happy-path)", async () => {
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));

    renderPage();

    expect(await screen.findByText(/abierta/i)).toBeInTheDocument();
    expect(screen.getByText(/10[.,]?000|100,00|\$?\s*100/)).toBeInTheDocument();
    expect(screen.queryByText(/monto esperado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/diferencia/i)).not.toBeInTheDocument();
    expect(obtenerCajaPorFechaMock).toHaveBeenCalledWith("2026-11-14");
  });

  it("muestra caja cerrada con contado, esperado y diferencia (happy-path)", async () => {
    obtenerCajaPorFechaMock.mockResolvedValue(
      cajaCerrada({
        monto_cierre_contado_centavos: 14500,
        monto_esperado_centavos: 15000,
        diferencia_centavos: -500,
      }),
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));

    renderPage();

    expect(await screen.findByText(/cerrada/i)).toBeInTheDocument();
    expect(screen.getByText(/esperado/i)).toBeInTheDocument();
    expect(screen.getByText(/contado/i)).toBeInTheDocument();
    expect(screen.getByText(/diferencia/i)).toBeInTheDocument();
  });

  it("muestra error de permiso cuando backend responde 403 (respaldo)", async () => {
    obtenerCajaPorFechaMock.mockRejectedValue(
      new ApiError({
        kind: "permiso",
        status: 403,
        causa: "permiso_denegado",
        mensaje: "permiso denegado",
        detalle: "permiso denegado",
      }),
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));

    renderPage();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /abrir caja/i })).not.toBeInTheDocument();
  });

  it("trata 404 de la fecha como estado normal sin caja y ofrece abrir si es hoy", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    obtenerCajaPorFechaMock.mockRejectedValue(
      new ApiError({
        kind: "no_encontrado",
        status: 404,
        mensaje: "caja no existe para la fecha 2026-11-14",
        detalle: "caja no existe para la fecha 2026-11-14",
      }),
    );

    renderPage();

    expect(
      await screen.findByRole("button", { name: /abrir caja/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/fatal|error inesperado/i)).not.toBeInTheDocument();
  });

  it("usa por defecto la fecha local de Buenos Aires cerca del límite UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T02:30:00Z")); // 23:30 BA del 2026-11-14
    obtenerCajaPorFechaMock.mockRejectedValue(
      new ApiError({
        kind: "no_encontrado",
        status: 404,
        mensaje: "caja no existe",
        detalle: "caja no existe",
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(obtenerCajaPorFechaMock).toHaveBeenCalledWith("2026-11-14");
    });
  });
});

describe("2.3 Apertura y cierre", () => {
  it("abre la caja exitosamente con monto válido y deshabilita mientras envía (happy-path)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock
      .mockRejectedValueOnce(
        new ApiError({ kind: "no_encontrado", status: 404, mensaje: "no hay", detalle: "no hay" }),
      )
      .mockResolvedValueOnce(cajaAbierta());
    let resolveAbrir!: (v: CajaOut) => void;
    abrirCajaMock.mockImplementation(
      () => new Promise<CajaOut>((resolve) => { resolveAbrir = resolve; }),
    );

    renderPage();

    const abrirBtn = await screen.findByRole("button", { name: /abrir caja/i });
    await user.clear(screen.getByLabelText(/monto de apertura/i));
    await user.type(screen.getByLabelText(/monto de apertura/i), "100,00");
    await user.click(abrirBtn);

    expect(abrirCajaMock).toHaveBeenCalledWith({ monto_apertura_centavos: 10000 });
    expect(screen.getByRole("button", { name: /abrir caja/i })).toBeDisabled();
    resolveAbrir(cajaAbierta());

    expect(await screen.findByText(/abierta/i)).toBeInTheDocument();
  });

  it("rechaza apertura ya abierta con 409 sin reintento automático y refetch (business-error)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock
      .mockRejectedValueOnce(
        new ApiError({ kind: "no_encontrado", status: 404, mensaje: "no hay", detalle: "no hay" }),
      )
      .mockResolvedValueOnce(cajaAbierta());
    abrirCajaMock.mockRejectedValue(
      new ApiError({
        kind: "conflicto",
        status: 409,
        causa: "caja_ya_abierta",
        mensaje: "ya abierta",
        detalle: "ya abierta",
      }),
    );

    renderPage();

    await user.click(await screen.findByRole("button", { name: /abrir caja/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(abrirCajaMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(obtenerCajaPorFechaMock).toHaveBeenCalledTimes(2);
    });
  });

  it("requiere doble confirmación para cerrar, envía fecha seleccionada y acepta contado 0 (edge-case)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta({ fecha: "2026-11-14" }));
    cerrarCajaMock.mockResolvedValue(
      cajaCerrada({
        monto_cierre_contado_centavos: 0,
        monto_esperado_centavos: 5000,
        diferencia_centavos: -5000,
      }),
    );

    renderPage();

    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/monto contado al cierre/i));
    await user.type(screen.getByLabelText(/monto contado al cierre/i), "0");
    await user.click(screen.getByRole("button", { name: /cerrar caja/i }));

    expect(cerrarCajaMock).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", { name: /confirmar cierre de caja/i });
    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /confirmar cierre/i }));

    await waitFor(() => {
      expect(cerrarCajaMock).toHaveBeenCalledWith({
        fecha: "2026-11-14",
        monto_cierre_contado_centavos: 0,
      });
    });
  });

  it("triangulación: 409 caja_ya_cerrada en apertura aplica mismo conflicto/refetch", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock
      .mockRejectedValueOnce(
        new ApiError({ kind: "no_encontrado", status: 404, mensaje: "no hay", detalle: "no hay" }),
      )
      .mockResolvedValueOnce(cajaCerrada());
    abrirCajaMock.mockRejectedValue(
      new ApiError({
        kind: "conflicto",
        status: 409,
        causa: "caja_ya_cerrada",
        mensaje: "ya cerrada",
        detalle: "ya cerrada",
      }),
    );

    renderPage();

    await user.click(await screen.findByRole("button", { name: /abrir caja/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(abrirCajaMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(obtenerCajaPorFechaMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe("Errores no-409 muestran el message del ApiError", () => {
  it("abrir: muestra texto de ApiError en 500 (servidor)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockRejectedValue(
      new ApiError({ kind: "no_encontrado", status: 404, mensaje: "no hay", detalle: "no hay" }),
    );
    abrirCajaMock.mockRejectedValue(
      new ApiError({
        kind: "servidor",
        status: 500,
        mensaje: "Error interno del servidor",
        detalle: "detalle servidor",
      }),
    );

    renderPage();

    await user.click(await screen.findByRole("button", { name: /abrir caja/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Error interno del servidor");
  });

  it("abrir: muestra texto de ApiError en 422 de dominio con detail string", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockRejectedValue(
      new ApiError({ kind: "no_encontrado", status: 404, mensaje: "no hay", detalle: "no hay" }),
    );
    abrirCajaMock.mockRejectedValue(
      new ApiError({
        kind: "validacion",
        status: 422,
        mensaje: "Monto de apertura inválido",
        detalle: "Monto de apertura inválido",
      }),
    );

    renderPage();

    await user.click(await screen.findByRole("button", { name: /abrir caja/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Monto de apertura inválido");
  });

  it("abrir: muestra texto de ApiError en error de red/timeout", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockRejectedValue(
      new ApiError({ kind: "no_encontrado", status: 404, mensaje: "no hay", detalle: "no hay" }),
    );
    abrirCajaMock.mockRejectedValue(
      new ApiError({
        kind: "timeout",
        status: null,
        mensaje: "La solicitud tardó demasiado",
        detalle: "",
      }),
    );

    renderPage();

    await user.click(await screen.findByRole("button", { name: /abrir caja/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La solicitud tardó demasiado");
  });

  it("cerrar: muestra texto de ApiError en 500 (servidor)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta({ fecha: "2026-11-14" }));
    cerrarCajaMock.mockRejectedValue(
      new ApiError({
        kind: "servidor",
        status: 500,
        mensaje: "Error interno al cerrar",
        detalle: "detalle servidor",
      }),
    );

    renderPage();

    await screen.findByText(/abierta/i);
    await user.click(screen.getByRole("button", { name: /cerrar caja/i }));
    const dialog = await screen.findByRole("dialog", { name: /confirmar cierre de caja/i });
    await user.click(within(dialog).getByRole("button", { name: /confirmar cierre/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Error interno al cerrar");
  });

  it("cerrar: muestra texto de ApiError en 422 de dominio con detail string", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta({ fecha: "2026-11-14" }));
    cerrarCajaMock.mockRejectedValue(
      new ApiError({
        kind: "validacion",
        status: 422,
        mensaje: "Monto de cierre inválido",
        detalle: "Monto de cierre inválido",
      }),
    );

    renderPage();

    await screen.findByText(/abierta/i);
    await user.click(screen.getByRole("button", { name: /cerrar caja/i }));
    const dialog = await screen.findByRole("dialog", { name: /confirmar cierre de caja/i });
    await user.click(within(dialog).getByRole("button", { name: /confirmar cierre/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Monto de cierre inválido");
  });

  it("cerrar: muestra texto de ApiError en error de red/timeout", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta({ fecha: "2026-11-14" }));
    cerrarCajaMock.mockRejectedValue(
      new ApiError({
        kind: "red",
        status: null,
        mensaje: "No se pudo conectar con el servidor",
        detalle: "",
      }),
    );

    renderPage();

    await screen.findByText(/abierta/i);
    await user.click(screen.getByRole("button", { name: /cerrar caja/i }));
    const dialog = await screen.findByRole("dialog", { name: /confirmar cierre de caja/i });
    await user.click(within(dialog).getByRole("button", { name: /confirmar cierre/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor");
  });
});
