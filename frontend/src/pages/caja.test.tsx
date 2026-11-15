import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CajaOut, CobroOut } from "../types/api-caja";
import { ApiError } from "../types/errors";
import CajaPage from "./caja";
import {
  abrirCaja,
  cerrarCaja,
  obtenerCajaPorFecha,
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

  it("obra social sin nomenclador_codigo env�a y muestra 422 con validaci�n de campos (business-error)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    obtenerCajaPorFechaMock.mockResolvedValue(cajaAbierta());
    registrarCobroMock.mockRejectedValue(
      new ApiError({
        kind: "validacion",
        status: 422,
        mensaje:
          "La request tiene campos inv�lidos: body.nomenclador_codigo: nomenclador_codigo es obligatorio para obra_social",
        detalle:
          "body.nomenclador_codigo: nomenclador_codigo es obligatorio para obra_social",
        campos: [
          {
            ubicacion: "body.nomenclador_codigo",
            mensaje: "nomenclador_codigo es obligatorio para obra_social",
          },
        ],
      }),
    );

    renderPage();
    await screen.findByText(/abierta/i);

    await user.selectOptions(screen.getByLabelText(/medio/i), "obra_social");
    await user.clear(screen.getByLabelText(/^Monto \(pesos\)$/i));
    await user.type(screen.getByLabelText(/^Monto \(pesos\)$/i), "100,00");
    // nomenclador vac�o: UI env�a igual
    await user.click(screen.getByRole("button", { name: /registrar cobro/i }));

    await waitFor(() => {
      expect(registrarCobroMock).toHaveBeenCalledTimes(1);
    });
    const alerta = await screen.findByRole("alert");
    // mensaje real normalizado desde ApiError (lista Pydantic, kind validacion, campos)
    expect(alerta).toHaveTextContent(/nomenclador_codigo es obligatorio para obra_social/i);
    expect(alerta).toHaveTextContent(/campos inv�lidos|validaci/i);
    expect(screen.queryByText(/registrado/i)).not.toBeInTheDocument();
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

    expect(registrarCobroMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/monto.*inv/i);
  });
