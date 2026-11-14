/**
 * RED de 5.1 (C-22) — exportación de datos en `/admin/datos`.
 *
 * `apiRequest` se reemplaza por un backend simulado y `URL.createObjectURL` /
 * `revokeObjectURL` por funciones que registran sus llamadas (jsdom no las
 * tiene). El clic del enlace de descarga se intercepta para leer el nombre y el
 * destino sin navegar. Datos ficticios: la exportación real incluye datos de
 * pacientes. El guard no es seguridad; la autorización real es del backend.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession, getSession, setSession } from "../auth/session";
import { apiRequest } from "../services/http";
import { ApiError } from "../types/errors";
import AdminDatosPage from "./admin-datos";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const URL_FICTICIA = "blob:export-ficticio";

const EXPORTACION = {
  contrato_version: "1.0",
  generado_en: "2026-11-14T12:00:00-03:00",
  zona: "America/Argentina/Buenos_Aires",
  periodo: { desde: "2026-10-16", hasta: "2026-11-14" },
  pacientes: [{ id: "p-1", nombre: "Paciente Ficticio" }],
  historia_clinica: [],
  agenda: [],
  caja: [],
};

let blobs: Blob[] = [];
let urlsRevocadas: string[] = [];
let descargas: { download: string; href: string }[] = [];

function leerBlob(blob: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(lector.error);
    lector.readAsText(blob);
  });
}

beforeEach(() => {
  blobs = [];
  urlsRevocadas = [];
  descargas = [];
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: (blob: Blob) => {
      blobs.push(blob);
      return URL_FICTICIA;
    },
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: (url: string) => {
      urlsRevocadas.push(url);
    },
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    descargas.push({ download: this.download, href: this.href });
  });
  apiRequestMock.mockReset();
  apiRequestMock.mockImplementation((() => Promise.resolve(EXPORTACION)) as never);
  setSession({
    token: "jwt-de-prueba",
    rol: "admin",
    usuario: "admin-ficticio",
    sucursalId: null,
  });
});

afterEach(() => {
  cleanup();
  clearSession();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderDatos(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AdminDatosPage />
    </QueryClientProvider>,
  );
  return client;
}

function completar(etiqueta: "Desde" | "Hasta", valor: string): void {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}

async function descargar() {
  const usuario = userEvent.setup();
  await usuario.click(screen.getByRole("button", { name: "Descargar exportación" }));
}

describe("/admin/datos — exportación", () => {
  it("declara el contrato de salida antes de cualquier descarga", () => {
    renderDatos();

    const contrato = screen.getByRole("region", { name: "Contrato de salida" });
    expect(within(contrato).getByText(/JSON UTF-8/)).toBeInTheDocument();
    expect(within(contrato).getByText(/30 días/)).toBeInTheDocument();
    expect(within(contrato).getByText(/historia_clinica/)).toBeInTheDocument();
    expect(within(contrato).getByText(/pacientes/)).toBeInTheDocument();
    expect(within(contrato).getByText(/agenda/)).toBeInTheDocument();
    expect(within(contrato).getByText(/caja/)).toBeInTheDocument();
    expect(within(contrato).getByText(/secretos/)).toBeInTheDocument();
    expect(within(contrato).getByText(/10 MB/)).toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(blobs).toHaveLength(0);
  });

  it("descarga con el período por defecto: GET /export sin fechas y archivo con nombre fechado", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 14, 9, 5, 7));
    renderDatos();

    await descargar();

    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith("/export", { timeoutMs: 60_000 });
    expect(descargas[0]).toEqual({
      download: "export-turnos-20261114-090507.json",
      href: URL_FICTICIA,
    });
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toContain("application/json");
    expect(JSON.parse(await leerBlob(blobs[0]))).toEqual(EXPORTACION);
    expect(await screen.findByText("Exportación descargada.")).toBeInTheDocument();
  });

  it("revoca la URL del Blob después de la descarga", async () => {
    renderDatos();

    await descargar();

    await waitFor(() => expect(urlsRevocadas).toEqual([URL_FICTICIA]));
  });

  it("no deja el contenido en la caché de consultas ni de mutaciones", async () => {
    const client = renderDatos();

    await descargar();

    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  });

  it("con fechas completadas las envía como desde y hasta", async () => {
    renderDatos();
    completar("Desde", "2026-11-01");
    completar("Hasta", "2026-11-10");

    await descargar();

    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(apiRequestMock).toHaveBeenCalledWith("/export?desde=2026-11-01&hasta=2026-11-10", {
      timeoutMs: 60_000,
    });
  });

  it("un desde posterior a hasta anuncia el error en el campo y no envía nada", async () => {
    renderDatos();
    completar("Desde", "2026-11-10");
    completar("Hasta", "2026-11-01");

    await descargar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "«Desde» no puede ser posterior a «Hasta».",
    );
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(blobs).toHaveLength(0);
  });

  it("un período de 31 días inclusive se bloquea sin request", async () => {
    renderDatos();
    completar("Desde", "2026-10-15");
    completar("Hasta", "2026-11-14");

    await descargar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El período no puede superar los 30 días.",
    );
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(blobs).toHaveLength(0);
  });

  it("un período de exactamente 30 días inclusive se permite", async () => {
    renderDatos();
    completar("Desde", "2026-10-16");
    completar("Hasta", "2026-11-14");

    await descargar();

    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(apiRequestMock).toHaveBeenCalledWith("/export?desde=2026-10-16&hasta=2026-11-14", {
      timeoutMs: 60_000,
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ante el 422 del servidor muestra el error del período, no entrega archivo y conserva la sesión", async () => {
    apiRequestMock.mockImplementation((() =>
      Promise.reject(
        new ApiError({ kind: "validacion", status: 422, mensaje: "Período inválido" }),
      )) as never);
    renderDatos();

    await descargar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El servidor rechazó el período indicado. Revisá las fechas (máximo 30 días).",
    );
    expect(blobs).toHaveLength(0);
    expect(descargas).toHaveLength(0);
    expect(getSession()).not.toBeNull();
  });

  it("ante cualquier otro error muestra un aviso genérico y deja reintentar", async () => {
    apiRequestMock.mockImplementation((() => Promise.reject(new Error("sin conexión"))) as never);
    renderDatos();

    await descargar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo generar la exportación. Intentá de nuevo.",
    );
    expect(blobs).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Descargar exportación" })).toBeEnabled();
  });

  it("deshabilita el botón mientras genera la exportación", async () => {
    apiRequestMock.mockImplementation((() => new Promise<never>(() => undefined)) as never);
    renderDatos();

    await descargar();

    expect(await screen.findByRole("button", { name: "Generando…" })).toBeDisabled();
  });
});
