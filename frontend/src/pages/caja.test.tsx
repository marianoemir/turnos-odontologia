import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CajaOut, CobroOut, LiquidacionOSOut } from "../types/api-caja";
import { ApiError } from "../types/errors";
import { normalizeApiError } from "../services/api-error";
import CajaPage from "./caja";
import {
  abrirCaja,
  anularCobro,
  cerrarCaja,
  facturarArca,
  listarLiquidaciones,
  obtenerCajaPorFecha,
  obtenerCobro,
  registrarCobro,
} from "../services/caja";

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
const registrarCobroMock = vi.mocked(registrarCobro);
const anularCobroMock = vi.mocked(anularCobro);
const facturarArcaMock = vi.mocked(facturarArca);
const obtenerCobroMock = vi.mocked(obtenerCobro);
const listarLiquidacionesMock = vi.mocked(listarLiquidaciones);

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
  registrarCobroMock.mockReset();
  anularCobroMock.mockReset();
  facturarArcaMock.mockReset();
  obtenerCobroMock.mockReset();
  listarLiquidacionesMock.mockReset();
  listarLiquidacionesMock.mockResolvedValue([]);
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


function cobroOut(overrides: Partial<CobroOut> = {}): CobroOut {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    caja_id: ID_CAJA,
    turno_id: null,
    medio: "efectivo",
    concepto: "total",
    monto_centavos: 12500,
    estado: "registrado",
    motivo_anulacion: null,
    anulado_en: null,
    referencia_externa: null,
    factura_tipo: null,
    factura_cae: null,
    factura_qr: null,
    facturado_en: null,
    simulado: false,
    creado_en: "2026-11-14T12:00:00Z",
    ...overrides,
  };
}

describe("3.1 Registro de cobros", () => {
  it("registra un cobro en efectivo con concepto se�a y turno_id v�lido (happy-path)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    const creado = cobroOut({
      medio: "efectivo",
      concepto: "sena",
      monto_centavos: 12500,
      turno_id: "33333333-3333-4333-8333-333333333333",
      simulado: false,
    });
    registrarCobroMock.mockResolvedValue(creado);

    renderPage();
    await screen.findByText(/abierta/i);

    await user.selectOptions(screen.getByLabelText(/medio/i), "efectivo");
    await user.selectOptions(screen.getByLabelText(/concepto/i), "sena");
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "125,00");
    await user.type(
      screen.getByLabelText(/turno/i),
      "33333333-3333-4333-8333-333333333333",
    );
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    await waitFor(() => {
      expect(registrarCobroMock).toHaveBeenCalledTimes(1);
    });
    expect(registrarCobroMock).toHaveBeenCalledWith({
      medio: "efectivo",
      concepto: "sena",
      monto_centavos: 12500,
      turno_id: "33333333-3333-4333-8333-333333333333",
    });
    await waitFor(() => {
      expect(screen.getByText("Cobros registrados")).toBeInTheDocument();
    });
    expect(screen.getAllByText(/registrado/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/sena/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/efectivo/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/\$\s*125,00/)).toBeInTheDocument();
  });

  it("rechaza registro sin caja abierta con 409 caja_no_abierta, explica y no muestra cobro (business-error)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockRejectedValue(
      new ApiError({
        kind: "conflicto",
        status: 409,
        causa: "caja_no_abierta",
        mensaje: "no hay caja abierta para la fecha",
        detalle: "no hay caja abierta para la fecha",
      }),
    );

    renderPage();
    await screen.findByText(/abierta/i);

    await user.selectOptions(screen.getByLabelText(/medio/i), "efectivo");
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/abrir.*caja/i);
    expect(registrarCobroMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/registrado/i)).not.toBeInTheDocument();
  });

  it("obra social 422 nomenclador_codigo muestra error (forma DERIVADA, no medida)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    // Forma DERIVADA (NO medida en sonda; esperada en FastAPI + Pydantic v2 para un
    // model_validator sobre un body): Forma derivada, no medida contra el backend.
    // nomenclador informado (pasa validación local) para poder observar el render del 422 derivado.
    registrarCobroMock.mockRejectedValue(
      normalizeApiError(422, {
        detail: [
          {
            type: "value_error",
            loc: ["body"],
            msg: "Value error, nomenclador_codigo es obligatorio para obra_social",
            input: { medio: "obra_social", monto_centavos: 5000 },
            ctx: { error: {} },
          },
        ],
      }),
    );

    renderPage();
    await screen.findByText(/abierta/i);

    await user.selectOptions(screen.getByLabelText(/medio/i), "obra_social");
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "100,00");
    await user.type(screen.getByLabelText(/nomenclador/i), "ABC123");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    await waitFor(() => {
      expect(registrarCobroMock).toHaveBeenCalledTimes(1);
    });
    expect(registrarCobroMock).toHaveBeenCalledWith(
      expect.objectContaining({
        medio: "obra_social",
        nomenclador_codigo: "ABC123",
      }),
    );
    const alerta = await screen.findByRole("alert");
    // Texto exacto renderizado por normalizeApiError con loc ["body"] (derivado, no medido):
    expect(alerta).toHaveTextContent(
      "La request tiene campos inválidos: body: Value error, nomenclador_codigo es obligatorio para obra_social",
    );
    expect(screen.queryByText(/registrado/i)).not.toBeInTheDocument();
  });
  it("obra social con nomenclador vacio o solo espacios no envia y muestra aviso claro", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());

    renderPage();
    await screen.findByText(/abierta/i);

    await user.selectOptions(screen.getByLabelText(/medio/i), "obra_social");
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "100,00");
    await user.clear(screen.getByLabelText(/nomenclador/i));
    await user.type(screen.getByLabelText(/nomenclador/i), "   ");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    expect(registrarCobroMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/nomenclador/i);
  });

  it("bloquea turno_id con formato inv�lido antes de enviar (edge-case)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());

    renderPage();
    await screen.findByText(/abierta/i);

    await user.selectOptions(screen.getByLabelText(/medio/i), "efectivo");
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "50,00");
    await user.type(screen.getByLabelText(/turno/i), "no-es-uuid");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    expect(registrarCobroMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/uuid|turno/i);
  });

  it("turno_id inexistente devuelve 404 con detalle string sin romper ni mostrar cobro (edge-case)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockRejectedValue(
      new ApiError({
        kind: "no_encontrado",
        status: 404,
        mensaje: "turno no existe: 33333333-3333-4333-8333-333333333333",
        detalle: "turno no existe: 33333333-3333-4333-8333-333333333333",
      }),
    );

    renderPage();
    await screen.findByText(/abierta/i);

    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "50,00");
    await user.type(
      screen.getByLabelText(/turno/i),
      "33333333-3333-4333-8333-333333333333",
    );
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/turno no existe/i);
    expect(screen.getByText(/abierta/i)).toBeInTheDocument();
    expect(screen.queryByText(/registrado/i)).not.toBeInTheDocument();
  });

  it("marca visiblemente cobro Mercado Pago simulado con referencia SIM-MP- (edge-case)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    const creado = cobroOut({
      medio: "mercado_pago",
      concepto: "total",
      monto_centavos: 9900,
      simulado: true,
      referencia_externa: "SIM-MP-abc123",
    });
    registrarCobroMock.mockResolvedValue(creado);

    renderPage();
    await screen.findByText(/abierta/i);

    await user.selectOptions(screen.getByLabelText(/medio/i), "mercado_pago");
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "99,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    expect(await screen.findByText(/SIM-MP-abc123/)).toBeInTheDocument();
    expect(screen.getAllByText(/simulad/i).length).toBeGreaterThan(0);
  });


  it("parser de cobro rechaza valores inv�lidos (vac�o, cero, >2 decimales, excede m�ximo) sin float", async () => {
    const { parsePesosACentavos: realParse } = await vi.importActual<
      typeof import("../services/caja")
    >("../services/caja");
    expect(() => realParse("")).toThrow();
    expect(() => realParse("0")).toThrow();
    expect(() => realParse("0,00")).toThrow();
    expect(() => realParse("1,234")).toThrow();
    expect(() => realParse("10000000000,01")).toThrow();
  });

  it("parser de cobro acepta coma y punto como separador decimal", async () => {
    const { parsePesosACentavos: realParse } = await vi.importActual<
      typeof import("../services/caja")
    >("../services/caja");
    expect(realParse("1.250,50")).toBe(125050);
    expect(realParse("1250.5")).toBe(125050);
  });
});

describe("3.3 Triangulaci�n cobros", () => {
  it("registra cobro standalone sin turno_id (payload sin turno_id)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(
      cobroOut({ concepto: "total", medio: "efectivo", monto_centavos: 5000 }),
    );

    renderPage();
    await screen.findByText(/abierta/i);

    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "50,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    await waitFor(() => {
      expect(registrarCobroMock).toHaveBeenCalledWith({
        medio: "efectivo",
        concepto: "total",
        monto_centavos: 5000,
      });
    });
    expect(registrarCobroMock.mock.calls[0][0]).not.toHaveProperty("turno_id");
  });

  it("obra social con cobertura inv�lida muestra 422 en lista (Pydantic campos)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockRejectedValue(
      new ApiError({
        kind: "validacion",
        status: 422,
        mensaje:
          "La request tiene campos inv�lidos: body.cobertura_centavos: cobertura_centavos debe estar entre 0 y monto_centavos",
        detalle:
          "body.cobertura_centavos: cobertura_centavos debe estar entre 0 y monto_centavos",
        campos: [
          {
            ubicacion: "body.cobertura_centavos",
            mensaje: "cobertura_centavos debe estar entre 0 y monto_centavos",
          },
        ],
      }),
    );

    renderPage();
    await screen.findByText(/abierta/i);

    await user.selectOptions(screen.getByLabelText(/medio/i), "obra_social");
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "100,00");
    await user.type(screen.getByLabelText(/nomenclador/i), "42.01.01");
    await user.clear(screen.getByLabelText(/cobertura/i));
    await user.type(screen.getByLabelText(/cobertura/i), "200,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    await waitFor(() => {
      expect(registrarCobroMock).toHaveBeenCalledTimes(1);
    });
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/cobertura_centavos/i);
    expect(alerta).toHaveTextContent(/campos inv�lidos|validaci/i);
  });

  it("normaliza 404 con detail string en flujo de cobro (ApiError string)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockRejectedValue(
      new ApiError({
        kind: "no_encontrado",
        status: 404,
        mensaje: "turno no existe: 44444444-4444-4444-8444-444444444444",
        detalle: "turno no existe: 44444444-4444-4444-8444-444444444444",
      }),
    );

    renderPage();
    await screen.findByText(/abierta/i);

    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "30,00");
    await user.type(
      screen.getByLabelText(/turno/i),
      "44444444-4444-4444-8444-444444444444",
    );
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /turno no existe: 44444444-4444-4444-8444-444444444444/,
    );
  });

  it("normaliza 422 con detail string de dominio en flujo de cobro (ApiError string)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockRejectedValue(
      new ApiError({
        kind: "validacion",
        status: 422,
        mensaje: "monto invalido para el medio",
        detalle: "monto invalido para el medio",
      }),
    );

    renderPage();
    await screen.findByText(/abierta/i);

    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "30,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/monto invalido para el medio/i);
  });
});

  it("deshabilita el bot�n de registrar cobro mientras la request est� en vuelo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    let resolveCobro!: (v: CobroOut) => void;
    registrarCobroMock.mockImplementation(
      () => new Promise<CobroOut>((resolve) => { resolveCobro = resolve; }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    expect(screen.getByRole("button", { name: /registrar cobro/i })).toBeDisabled();
    resolveCobro(cobroOut({ monto_centavos: 1000 }));
    await waitFor(() => {
      expect(screen.getByText("Cobros registrados")).toBeInTheDocument();
    });
  });

  it("después de un cobro exitoso invalida caja y vuelve a consultar GET /caja (PASO 0b)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(
      cobroOut({ concepto: "total", medio: "efectivo", monto_centavos: 1000 }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await waitFor(() => {
      expect(obtenerCajaPorFechaMock).toHaveBeenCalledTimes(1);
    });

    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    await waitFor(() => {
      expect(registrarCobroMock).toHaveBeenCalledTimes(1);
    });
    // Invalidación de resourceKeys.caja.all dispara una nueva consulta por fecha.
    await waitFor(() => {
      expect(obtenerCajaPorFechaMock.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it("bloquea monto de cobro en cero (usa parser de cobro que no permite 0)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());

    renderPage();
    await screen.findByText(/abierta/i);

    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "0");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    // monto 0 no bloqueado: se llama al servicio (falla por aserción si el parser/guard permite 0)
    expect(registrarCobroMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/monto.*inv/i);
  });

const COBRO_ID_VALIDO = "22222222-2222-4222-8222-222222222222";
const COBRO_ID_OTRO = "33333333-3333-4333-8333-333333333333";

describe("4.1 Anulación y factura ARCA", () => {
  it("anulación exitosa con traza visible (happy-path) POST /cobros/{id}/anular", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    const creado = cobroOut({ id: COBRO_ID_VALIDO, estado: "registrado" });
    registrarCobroMock.mockResolvedValue(creado);
    const anulado = cobroOut({
      id: COBRO_ID_VALIDO,
      estado: "anulado",
      motivo_anulacion: "Error de carga",
      anulado_en: "2026-11-14T15:00:00Z",
    });
    anularCobroMock.mockResolvedValue(anulado);

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /anular/i }));
    const dialog = await screen.findByRole("dialog", { name: /anular/i });
    await user.type(within(dialog).getByLabelText(/motivo/i), "Error de carga");
    await user.click(within(dialog).getByRole("button", { name: /confirmar anulaci/i }));

    await waitFor(() => {
      expect(anularCobroMock).toHaveBeenCalledWith(COBRO_ID_VALIDO, { motivo: "Error de carga" });
    });
    expect((await screen.findAllByText(/anulado/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Error de carga/)).toBeInTheDocument();
    expect(screen.getByText(/2026-11-14T15:00:00Z/)).toBeInTheDocument();
  });

  it("factura rechazada por cobro ya facturado (409 cobro_ya_facturado)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));
    facturarArcaMock.mockRejectedValue(
      new ApiError({
        kind: "conflicto",
        status: 409,
        causa: "cobro_ya_facturado",
        mensaje: "el cobro ya tiene factura emitida",
        detalle: "el cobro ya tiene factura emitida",
      }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /facturar/i }));
    const dialog = await screen.findByRole("dialog", { name: /factur/i });
    await user.click(within(dialog).getByLabelText(/tipo\s*B|B/i));
    await user.click(within(dialog).getByRole("button", { name: /confirmar factur/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/ya tiene factura|facturad/i);
    await waitFor(() => {
      expect(facturarArcaMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText(/\bCAE:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Factura \(ARCA\)|Factura simulada \(ARCA\)/i)).not.toBeInTheDocument();
  });

  it("anulación conflictúa con caja cerrada (409 caja_cerrada)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO, estado: "registrado" }));
    anularCobroMock.mockRejectedValue(
      new ApiError({ kind: "conflicto", status: 409, causa: "caja_cerrada", mensaje: "caja cerrada", detalle: "caja cerrada" }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /anular/i }));
    const dialog = await screen.findByRole("dialog", { name: /anular/i });
    await user.type(within(dialog).getByLabelText(/motivo/i), "Error");
    await user.click(within(dialog).getByRole("button", { name: /confirmar anulaci/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/caja cerrada/i);
    expect(anularCobroMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/anulado_en|2026-11-14T15/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/registrado/i).length).toBeGreaterThan(0);
  });

  it("anulación conflictúa con cobro facturado (409 cobro_facturado)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO, estado: "registrado" }));
    anularCobroMock.mockRejectedValue(
      new ApiError({ kind: "conflicto", status: 409, causa: "cobro_facturado", mensaje: "cobro facturado", detalle: "cobro facturado" }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /anular/i }));
    const dialog = await screen.findByRole("dialog", { name: /anular/i });
    await user.type(within(dialog).getByLabelText(/motivo/i), "Error");
    await user.click(within(dialog).getByRole("button", { name: /confirmar anulaci/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/facturad/i);
    expect(anularCobroMock).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(/registrado/i).length).toBeGreaterThan(0);
  });

  it("anulación con motivo vacío se bloquea antes de enviar", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /anular/i }));
    const dialog = await screen.findByRole("dialog", { name: /anular/i });
    await user.clear(within(dialog).getByLabelText(/motivo/i));
    await user.click(within(dialog).getByRole("button", { name: /confirmar anulaci/i }));

    expect(anularCobroMock).not.toHaveBeenCalled();
  });

  it("anulacion con motivo solo espacios se bloquea antes de enviar (trim)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /anular/i }));
    const dialog = await screen.findByRole("dialog", { name: /anular/i });
    await user.type(within(dialog).getByLabelText(/motivo/i), "   ");
    await user.click(within(dialog).getByRole("button", { name: /confirmar anulaci/i }));

    expect(anularCobroMock).not.toHaveBeenCalled();
  });

  it("cobro pegado inexistente (404 string) se muestra sin romper (edge-case)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    obtenerCobroMock.mockRejectedValue(
      new ApiError({ kind: "no_encontrado", status: 404, mensaje: "cobro no existe: 33333333-3333-4333-8333-333333333333", detalle: "cobro no existe: 33333333-3333-4333-8333-333333333333" }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.type(screen.getByLabelText(/id de cobro/i), COBRO_ID_OTRO);
    await user.click(screen.getByRole("button", { name: /cargar cobro/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/cobro no existe/i);
    expect(screen.getByText(/abierta/i)).toBeInTheDocument();
  });

  it("texto de cobro no UUID no llama al backend (edge-case)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());

    renderPage();
    await screen.findByText(/abierta/i);
    await user.type(screen.getByLabelText(/id de cobro/i), "no-es-uuid");
    await user.click(screen.getByRole("button", { name: /cargar cobro/i }));

    expect(obtenerCobroMock).not.toHaveBeenCalled();
    expect(anularCobroMock).not.toHaveBeenCalled();
    expect(facturarArcaMock).not.toHaveBeenCalled();
  });

  it("triangulación: anulación 409 cobro_ya_anulado muestra conflicto sin reintento y sin marcar anulado", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO, estado: "registrado" }));
    anularCobroMock.mockRejectedValue(
      new ApiError({ kind: "conflicto", status: 409, causa: "cobro_ya_anulado", mensaje: "cobro ya anulado", detalle: "cobro ya anulado" }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /anular/i }));
    const dialog = await screen.findByRole("dialog", { name: /anular/i });
    await user.type(within(dialog).getByLabelText(/motivo/i), "Error");
    await user.click(within(dialog).getByRole("button", { name: /confirmar anulaci/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/ya anulado/i);
    expect(anularCobroMock).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(/registrado/i).length).toBeGreaterThan(0);
  });

  it("triangulación: factura 409 cobro_anulado muestra conflicto sin reintento ni factura", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));
    facturarArcaMock.mockRejectedValue(
      new ApiError({ kind: "conflicto", status: 409, causa: "cobro_anulado", mensaje: "cobro anulado", detalle: "cobro anulado" }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /facturar/i }));
    const dialog = await screen.findByRole("dialog", { name: /factur/i });
    await user.click(within(dialog).getByLabelText(/tipo\s*B|B/i));
    await user.click(within(dialog).getByRole("button", { name: /confirmar factur/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/anulad/i);
    await waitFor(() => {
      expect(facturarArcaMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText(/\bCAE:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Factura \(ARCA\)|Factura simulada \(ARCA\)/i)).not.toBeInTheDocument();
  });

  it("triangulación: factura 409 medio_no_facturable muestra conflicto sin reintento ni factura", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));
    facturarArcaMock.mockRejectedValue(
      new ApiError({ kind: "conflicto", status: 409, causa: "medio_no_facturable", mensaje: "medio no facturable", detalle: "medio no facturable" }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /facturar/i }));
    const dialog = await screen.findByRole("dialog", { name: /factur/i });
    await user.click(within(dialog).getByLabelText(/tipo\s*B|B/i));
    await user.click(within(dialog).getByRole("button", { name: /confirmar factur/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no facturable/i);
    await waitFor(() => {
      expect(facturarArcaMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText(/\bCAE:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Factura \(ARCA\)|Factura simulada \(ARCA\)/i)).not.toBeInTheDocument();
  });

  it("triangulación: factura tipo C envía tipo C elegido por usuario", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));
    facturarArcaMock.mockResolvedValue({
      cobro_id: COBRO_ID_VALIDO,
      tipo: "C",
      cae: "SIM-CAE-C-1",
      qr: "SIM-QR-C-1",
      simulado: true,
      modo: "simulado",
    });
    obtenerCobroMock.mockResolvedValue(
      cobroOut({
        id: COBRO_ID_VALIDO,
        estado: "facturado",
        factura_tipo: "C",
        factura_cae: "SIM-CAE-C-1",
        factura_qr: "SIM-QR-C-1",
      }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /facturar/i }));
    const dialog = await screen.findByRole("dialog", { name: /factur/i });
    await user.click(within(dialog).getByLabelText(/tipo\s*C|C/i));
    await user.click(within(dialog).getByRole("button", { name: /confirmar factur/i }));

    await waitFor(() => {
      expect(facturarArcaMock).toHaveBeenCalledWith(COBRO_ID_VALIDO, { tipo: "C" });
    });
    expect(await screen.findByText(/SIM-CAE-C-1/)).toBeInTheDocument();
  });

  it("factura ARCA simulada tipo B se marca explícitamente (edge-case)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));
    facturarArcaMock.mockResolvedValue({
      cobro_id: COBRO_ID_VALIDO,
      tipo: "B",
      cae: "SIM-CAE-123",
      qr: "SIM-QR-123",
      simulado: true,
      modo: "simulado",
    });
    obtenerCobroMock.mockResolvedValue(
      cobroOut({
        id: COBRO_ID_VALIDO,
        estado: "facturado",
        factura_tipo: "B",
        factura_cae: "SIM-CAE-123",
        factura_qr: "SIM-QR-123",
        facturado_en: "2026-11-14T16:00:00Z",
      }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /facturar/i }));
    const dialog = await screen.findByRole("dialog", { name: /factur/i });
    await user.click(within(dialog).getByLabelText(/tipo\s*B|B/i));
    await user.click(within(dialog).getByRole("button", { name: /confirmar factur/i }));

    await waitFor(() => {
      expect(facturarArcaMock).toHaveBeenCalledWith(COBRO_ID_VALIDO, { tipo: "B" });
    });
    expect(await screen.findByText(/SIM-CAE-123/)).toBeInTheDocument();
    expect(screen.getByText(/SIM-QR-123/)).toBeInTheDocument();
    expect(screen.getAllByText(/simulad/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/\bB\b/)).toBeInTheDocument();
  });

  it("factura real (CAE sin prefijo SIM-, simulado=false) muestra CAE y QR sin marca simulada", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));
    facturarArcaMock.mockResolvedValue({
      cobro_id: COBRO_ID_VALIDO,
      tipo: "B",
      cae: "12345678901234",
      qr: "QR-REAL-1",
      simulado: false,
      modo: "real",
    });
    obtenerCobroMock.mockResolvedValue(
      cobroOut({
        id: COBRO_ID_VALIDO,
        estado: "facturado",
        factura_tipo: "B",
        factura_cae: "12345678901234",
        factura_qr: "QR-REAL-1",
        simulado: false,
      }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /facturar/i }));
    const dialog = await screen.findByRole("dialog", { name: /factur/i });
    await user.click(within(dialog).getByLabelText(/tipo\s*B|B/i));
    await user.click(within(dialog).getByRole("button", { name: /confirmar factur/i }));

    expect(await screen.findByText(/12345678901234/)).toBeInTheDocument();
    expect(screen.getByText(/QR-REAL-1/)).toBeInTheDocument();
    expect(screen.queryByText(/Factura simulada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/simulado=true/i)).not.toBeInTheDocument();
  });

  it("factura simulada muestra la marca sin texto fijo simulado=true", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));
    facturarArcaMock.mockResolvedValue({
      cobro_id: COBRO_ID_VALIDO,
      tipo: "B",
      cae: "SIM-CAE-MARK",
      qr: "SIM-QR-MARK",
      simulado: true,
      modo: "simulado",
    });
    obtenerCobroMock.mockResolvedValue(
      cobroOut({
        id: COBRO_ID_VALIDO,
        estado: "facturado",
        factura_tipo: "B",
        factura_cae: "SIM-CAE-MARK",
        factura_qr: "SIM-QR-MARK",
        simulado: true,
      }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /facturar/i }));
    const dialog = await screen.findByRole("dialog", { name: /factur/i });
    await user.click(within(dialog).getByLabelText(/tipo\s*B|B/i));
    await user.click(within(dialog).getByRole("button", { name: /confirmar factur/i }));

    expect(await screen.findByText(/SIM-CAE-MARK/)).toBeInTheDocument();
    expect(screen.getByText(/SIM-QR-MARK/)).toBeInTheDocument();
    expect(screen.getAllByText(/simulad/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/simulado=true/i)).not.toBeInTheDocument();
  });
  it("factura con simulado=true y CAE sin prefijo SIM- muestra la marca simulada (cada condición por separado)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));
    facturarArcaMock.mockResolvedValue({
      cobro_id: COBRO_ID_VALIDO,
      tipo: "B",
      cae: "74125896301472",
      qr: "QR-REAL-SIMFLAG",
      simulado: true,
      modo: "simulado",
    });
    obtenerCobroMock.mockResolvedValue(
      cobroOut({
        id: COBRO_ID_VALIDO,
        estado: "facturado",
        factura_tipo: "B",
        factura_cae: "74125896301472",
        factura_qr: "QR-REAL-SIMFLAG",
        simulado: true,
      }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /facturar/i }));
    const dialog = await screen.findByRole("dialog", { name: /factur/i });
    await user.click(within(dialog).getByLabelText(/tipo\s*B|B/i));
    await user.click(within(dialog).getByRole("button", { name: /confirmar factur/i }));

    expect(await screen.findByText(/74125896301472/)).toBeInTheDocument();
    expect(screen.getByText(/QR-REAL-SIMFLAG/)).toBeInTheDocument();
    expect(screen.getByText(/^CAE:/i)).toBeInTheDocument();
    expect(screen.queryByText(/^CAE:\s*SIM-/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Factura simulada \(ARCA\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/simulad/i).length).toBeGreaterThan(0);
  });
  it("factura con CAE SIM- y simulado=false muestra marca simulada (triangulacion)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));
    facturarArcaMock.mockResolvedValue({
      cobro_id: COBRO_ID_VALIDO,
      tipo: "C",
      cae: "SIM-CAE-TRI",
      qr: "SIM-QR-TRI",
      simulado: false,
      modo: "simulado",
    });
    obtenerCobroMock.mockResolvedValue(
      cobroOut({
        id: COBRO_ID_VALIDO,
        estado: "facturado",
        factura_tipo: "C",
        factura_cae: "SIM-CAE-TRI",
        factura_qr: "SIM-QR-TRI",
        simulado: false,
      }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /facturar/i }));
    const dialog = await screen.findByRole("dialog", { name: /factur/i });
    await user.click(within(dialog).getByLabelText(/tipo\s*C|C/i));
    await user.click(within(dialog).getByRole("button", { name: /confirmar factur/i }));

    expect(await screen.findByText(/SIM-CAE-TRI/)).toBeInTheDocument();
    expect(screen.getByText(/SIM-QR-TRI/)).toBeInTheDocument();
    expect(screen.getAllByText(/simulad/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/simulado=true/i)).not.toBeInTheDocument();
  });
  it("guarda: botones anular/facturar deshabilitados mientras la acción está en vuelo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));
    let resolveAnular!: (v: CobroOut) => void;
    anularCobroMock.mockImplementation(
      () => new Promise<CobroOut>((resolve) => { resolveAnular = resolve; }),
    );

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /anular/i }));
    const dialog = await screen.findByRole("dialog", { name: /anular/i });
    await user.type(within(dialog).getByLabelText(/motivo/i), "Error");
    await user.click(within(dialog).getByRole("button", { name: /confirmar anulaci/i }));

    await waitFor(() => expect(anularCobroMock).toHaveBeenCalledTimes(1));
    // mientras la request está en vuelo, botones de acción del cobro deshabilitados
    expect(screen.getByRole("button", { name: /^Anular$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Facturar ARCA/ })).toBeDisabled();
    resolveAnular(cobroOut({ id: COBRO_ID_VALIDO, estado: "anulado", motivo_anulacion: "Error", anulado_en: "2026-11-14T15:00:00Z" }));
  });

  it("guarda: anulación requiere segundo paso (no envía en primer clic)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /anular/i }));
    // primer clic abre modal/paso 1, sin confirmar no debe enviar
    expect(anularCobroMock).not.toHaveBeenCalled();
  });

  it("guarda: factura requiere segundo paso (no envía en primer clic)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    await user.click(screen.getByRole("button", { name: /facturar/i }));
    expect(facturarArcaMock).not.toHaveBeenCalled();
  });
});

describe("Correccion foco CobroItem (grupo 4)", () => {
  it("al cerrar el modal de anulacion el foco vuelve al mismo boton Anular", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockResolvedValue(cobroOut({ id: COBRO_ID_VALIDO }));

    renderPage();
    await screen.findByText(/abierta/i);
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "10,00");
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));
    await screen.findByText("Cobros registrados");

    const anularBtn = screen.getByRole("button", { name: "Anular" });
    await user.click(anularBtn);

    const dialog = await screen.findByRole("dialog", { name: /anular cobro/i });
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(anularBtn).toBe(document.activeElement);
    expect(anularBtn.isConnected).toBe(true);
  });
});

function liquidacionOut(overrides: Partial<LiquidacionOSOut> = {}): LiquidacionOSOut {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    cobro_id: "22222222-2222-4222-8222-222222222222",
    nomenclador_codigo: "42.01.01",
    descripcion: "Consulta",
    monto_total_centavos: 10000,
    cobertura_centavos: 8000,
    copago_centavos: 2000,
    estado: "pendiente",
    pdf_referencia: "LIQ-2026-001",
    creado_en: "2026-11-14T12:00:00Z",
    ...overrides,
  };
}

describe("5.1 Listado de liquidaciones", () => {
  it('Liquidations list is displayed (happy-path): muestra filas incluida anulada en el orden recibido', async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    const primera = liquidacionOut({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      nomenclador_codigo: "10.01",
      estado: "pagada",
      descripcion: "Primera recibida",
      pdf_referencia: "REF-REAL-1",
      creado_en: "2026-11-14T18:00:00Z",
    });
    const anulada = liquidacionOut({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      nomenclador_codigo: "20.02",
      estado: "anulada",
      descripcion: "Anulada recibida",
      pdf_referencia: "REF-ANULADA-1",
      creado_en: "2026-11-14T17:00:00Z",
    });
    listarLiquidacionesMock.mockResolvedValue([primera, anulada]);

    renderPage();

    expect(await screen.findByRole("heading", { name: /liquidaciones/i })).toBeInTheDocument();
    const items = await screen.findAllByTestId("liquidacion-item");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText(/10\.01/)).toBeInTheDocument();
    expect(within(items[0]).getByText(/Estado:\s*pagada/i)).toBeInTheDocument();
    expect(within(items[1]).getByText(/20\.02/)).toBeInTheDocument();
    expect(within(items[1]).getByText(/Estado:\s*anulada/i)).toBeInTheDocument();
    expect(listarLiquidacionesMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link", { name: /descargar|pdf/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /descargar|pdf/i })).not.toBeInTheDocument();
  });

  it('Liquidations endpoint denies access as enforcement backstop (business-error): 403 muestra aviso de permiso sin romper ni reintentar', async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    listarLiquidacionesMock.mockRejectedValue(
      new ApiError({
        kind: "permiso",
        status: 403,
        causa: "permiso_denegado",
        mensaje: "permiso denegado",
        detalle: "permiso denegado",
      }),
    );

    renderPage();

    expect(await screen.findByRole("heading", { name: /liquidaciones/i })).toBeInTheDocument();
    const alertas = await screen.findAllByRole("alert");
    expect(alertas.some((a) => /permiso|denegad/i.test(a.textContent ?? ""))).toBe(true);
    await waitFor(() => {
      expect(listarLiquidacionesMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/abierta/i)).toBeInTheDocument();
  });

  it('Empty liquidations list shows empty state (edge-case)', async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    listarLiquidacionesMock.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByRole("heading", { name: /liquidaciones/i })).toBeInTheDocument();
    expect(
      await screen.findByText("No hay liquidaciones para mostrar."),
    ).toBeInTheDocument();
  });

  it('Simulated liquidation reference is marked as text without download (edge-case)', async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    listarLiquidacionesMock.mockResolvedValue([
      liquidacionOut({
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        nomenclador_codigo: "30.03",
        pdf_referencia: "SIM-OS-2026-001",
        descripcion: "Con ref simulada",
      }),
      liquidacionOut({
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        nomenclador_codigo: "40.04",
        pdf_referencia: "REF-REAL-9",
        descripcion: "Con ref real",
      }),
    ]);

    renderPage();

    expect(await screen.findByRole("heading", { name: /liquidaciones/i })).toBeInTheDocument();
    const simItem = (await screen.findByText(/SIM-OS-2026-001/)).closest('[data-testid="liquidacion-item"]');
    expect(simItem).not.toBeNull();
    expect(within(simItem as HTMLElement).getByText(/\(simulada\)/i)).toBeInTheDocument();

    const realItem = (await screen.findByText(/REF-REAL-9/)).closest('[data-testid="liquidacion-item"]');
    expect(realItem).not.toBeNull();
    expect(within(realItem as HTMLElement).queryByText(/\(simulada\)/i)).not.toBeInTheDocument();

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /descargar|pdf/i })).not.toBeInTheDocument();

  });
});

