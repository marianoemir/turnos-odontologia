/**
 * Grupo 6 de C-21 — accesibilidad táctil y privacidad (tasks 5.1, 6.19, 6.21).
 *
 * 6.19: se prueba por clases/estilos/patrón del proyecto (clases `btn`, `input`,
 * `select` de C-14 y estilos inline de tamaño táctil aplicados en las pantallas
 * públicas), no por medición de layout en jsdom. `userEvent.click` sí despacha
 * eventos de puntero y mouse (incluidos `pointerover`/`mouseover`/`mouseenter` en
 * la secuencia del puntero), por lo que no prueba ausencia de comportamiento
 * hover; la cobertura de "sin hover" se apoya en la verificación estática del
 * código fuente de las pantallas (si se pudo compilar y ejecutar).
 *
 * 6.21: toda aserción de ausencia tiene control positivo y se incluyen campos
 * ajenos al contrato en los datos de prueba para detectar exposición accidental.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routes } from "../app/router";
import { clearSession } from "../auth/session";
import { SessionProvider } from "../auth/session-context";
import { apiRequest } from "../services/http";
import type { Prestacion } from "../types/api";
import type { SlotPublico } from "../types/api-reserva-publica";
import { ApiError } from "../types/errors";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const PROF_ID = "11111111-1111-4111-8111-111111111111";
const PREST_A = "22222222-2222-4222-8222-222222222222";
const FECHA = "2026-11-20";
const TURNO_ID = "55555555-5555-4555-8555-555555555555";
const TOKEN = "token-ficticio-c21-grupo6";

const PRESTACIONES: Prestacion[] = [
  { id: PREST_A, nombre: "Limpieza ficticia", duracion_min: 30, activo: true },
];

const SLOT_CON_EXTRAS = {
  inicio: "2026-11-20T09:00:00-03:00",
  fin: "2026-11-20T09:30:00-03:00",
  nombre: "Tercero Ficticio",
  dni: "99999999",
  paciente_id: "paciente-ajeno-ficticio",
  contacto: "tercero@ficticio.test",
  sillon_id: "sillon-ajeno-ficticio",
} as unknown as SlotPublico;

function diferida<T>(): { promesa: Promise<T>; resolver: (valor: T) => void; rechazar: (e: unknown) => void } {
  let resolver!: (valor: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((resolve, reject) => {
    resolver = resolve;
    rechazar = reject;
  });
  return { promesa, resolver, rechazar };
}

function renderEn(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <SessionProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </SessionProvider>,
  );
  return { router };
}

function pxDeMinHeight(elemento: HTMLElement): number {
  const valor = elemento.style.minHeight;
  if (valor.endsWith("rem")) return parseFloat(valor) * 16;
  if (valor.endsWith("px")) return parseFloat(valor);
  return Number.NaN;
}

function assertTactil(elemento: HTMLElement, patronClase: string): void {
  expect(elemento.className).toContain(patronClase);
  expect(pxDeMinHeight(elemento)).toBeGreaterThanOrEqual(44);
}

const RUTAS_PANTALLAS_PUBLICAS = [
  "src/pages/reservar.tsx",
  "src/pages/confirmar.tsx",
  "src/pages/cancelar.tsx",
] as const;

const PATRONES_HOVER = [
  "onMouseEnter",
  "onMouseOver",
  "onPointerEnter",
  "onPointerOver",
] as const;

function contienePatronHover(codigo: string): string | null {
  for (const patron of PATRONES_HOVER) {
    if (codigo.includes(patron)) {
      return patron;
    }
  }
  return null;
}

beforeEach(() => {
  apiRequestMock.mockReset();
  clearSession();
});

afterEach(() => {
  cleanup();
  clearSession();
});

async function elegirPrestacionYFecha(user: ReturnType<typeof userEvent.setup>) {
  const select = await screen.findByLabelText("Prestación");
  await waitFor(() =>
    expect(within(select).getByRole("option", { name: "Limpieza ficticia" })).toBeInTheDocument(),
  );
  await user.selectOptions(select, PREST_A);
  fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: FECHA } });
}

describe("grupo 6", () => {
  it("Controles táctiles y estados perceptibles", async () => {
    const user = userEvent.setup();

    // --- Reservar: controles táctiles por patrón/estilo y flujo sin hover ---
    apiRequestMock.mockImplementation((ruta: string, opciones?: { method?: string }) => {
      if (ruta === "/prestaciones") return Promise.resolve(PRESTACIONES);
      if (String(ruta).startsWith(`/reservar/${PROF_ID}?`)) {
        if (opciones?.method === "POST") return Promise.resolve({});
        // primera consulta error para role=alert perceptible, luego slots
        return Promise.reject(new ApiError({ kind: "red", status: null, mensaje: "Fallo de red ficticio." }));
      }
      if (ruta === "/reservar" && opciones?.method === "POST") {
        return Promise.reject(new ApiError({ kind: "conflicto", status: 409, causa: "profesional", mensaje: "conflicto", detalle: "conflicto ficticio" }));
      }
      return Promise.resolve([]);
    });
    renderEn(`/reservar/${PROF_ID}`);

    const selectPrest = await screen.findByLabelText("Prestación");
    const fecha = screen.getByLabelText("Fecha");
    assertTactil(selectPrest, "select");
    assertTactil(fecha, "input");

    await elegirPrestacionYFecha(user);
    const alertaSlots = await screen.findByRole("alert");
    expect(alertaSlots).toHaveTextContent("Fallo de red ficticio.");

    // recargar con slots para cubrir botones slot, submit y reconsultar
    cleanup();
    clearSession();
    apiRequestMock.mockReset();
    apiRequestMock.mockImplementation((ruta: string, opciones?: { method?: string }) => {
      if (ruta === "/prestaciones") return Promise.resolve(PRESTACIONES);
      if (String(ruta).startsWith(`/reservar/${PROF_ID}?`)) return Promise.resolve([SLOT_CON_EXTRAS]);
      if (ruta === "/reservar" && opciones?.method === "POST") {
        return Promise.reject(new ApiError({ kind: "conflicto", status: 409, causa: "profesional", mensaje: "conflicto", detalle: "conflicto ficticio" }));
      }
      return Promise.resolve([]);
    });
    renderEn(`/reservar/${PROF_ID}`);
    const user2 = userEvent.setup();
    await elegirPrestacionYFecha(user2);
    const botonSlot = await screen.findByRole("button", { name: "09:00 a 09:30" });
    assertTactil(botonSlot, "btn");
    await user2.click(botonSlot);
    assertTactil(screen.getByLabelText("Nombre"), "input");
    assertTactil(screen.getByLabelText("DNI"), "input");
    assertTactil(screen.getByLabelText("Contacto (opcional)"), "input");
    await user2.type(screen.getByLabelText("Nombre"), "Paciente Ficticio");
    await user2.type(screen.getByLabelText("DNI"), "10000001");
    const submit = screen.getByRole("button", { name: "Confirmar reserva" });
    assertTactil(submit, "btn");
    await user2.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(/ya no está disponible/i);
    const reconsultar = screen.getByRole("button", { name: "Reconsultar horarios" });
    assertTactil(reconsultar, "btn");

    // --- Confirmar: botón táctil, POST en curso disabled+aria-busy, reintentar táctil ---
    cleanup();
    clearSession();
    apiRequestMock.mockReset();
    const pendConfirmar = diferida<{ resultado: "confirmado"; turno_id: string; inicio: string }>();
    apiRequestMock.mockImplementation((ruta: string, opciones?: { method?: string }) => {
      if (ruta === `/confirmar/${TOKEN}` && opciones?.method === "POST") return pendConfirmar.promesa;
      return Promise.resolve([]);
    });
    renderEn(`/confirmar/${TOKEN}`);
    const user3 = userEvent.setup();
    const btnConfirmar = await screen.findByRole("button", { name: "Confirmar turno" });
    assertTactil(btnConfirmar, "btn");
    btnConfirmar.focus();
    await user3.keyboard("{Enter}");
    expect(btnConfirmar).toBeDisabled();
    expect(btnConfirmar).toHaveAttribute("aria-busy", "true");
    await act(async () => {
      pendConfirmar.rechazar(new ApiError({ kind: "red", status: null, mensaje: "No se pudo conectar con el servidor." }));
    });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    assertTactil(screen.getByRole("button", { name: "Reintentar" }), "btn");

    // --- Cancelar: botón táctil, POST en curso disabled+aria-busy, reintentar táctil ---
    cleanup();
    clearSession();
    apiRequestMock.mockReset();
    const pendCancelar = diferida<{ resultado: "cancelado"; turno_id: string; inicio: string }>();
    apiRequestMock.mockImplementation((ruta: string, opciones?: { method?: string }) => {
      if (ruta === `/cancelar/${TOKEN}` && opciones?.method === "POST") return pendCancelar.promesa;
      return Promise.resolve([]);
    });
    renderEn(`/cancelar/${TOKEN}`);
    const user4 = userEvent.setup();
    const btnCancelar = await screen.findByRole("button", { name: "Cancelar turno" });
    assertTactil(btnCancelar, "btn");
    await user4.click(btnCancelar);
    expect(btnCancelar).toBeDisabled();
    expect(btnCancelar).toHaveAttribute("aria-busy", "true");
    await act(async () => {
      pendCancelar.rechazar(new ApiError({ kind: "timeout", status: null, mensaje: "La solicitud superó el tiempo de espera." }));
    });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    assertTactil(screen.getByRole("button", { name: "Reintentar" }), "btn");
  });

  it("Confirmar reserva expone disabled y aria-busy durante el envío", async () => {
    const user = userEvent.setup();
    const altaPendiente = diferida<{
      turno_id: string;
      profesional_id: string;
      prestacion_id: string;
      inicio: string;
      fin: string;
      estado: "pendiente";
    }>();
    apiRequestMock.mockImplementation((ruta: string, opciones?: { method?: string }) => {
      if (ruta === "/prestaciones") return Promise.resolve(PRESTACIONES);
      if (String(ruta).startsWith(`/reservar/${PROF_ID}?`)) return Promise.resolve([SLOT_CON_EXTRAS]);
      if (ruta === "/reservar" && opciones?.method === "POST") return altaPendiente.promesa;
      return Promise.resolve([]);
    });
    renderEn(`/reservar/${PROF_ID}`);
    await elegirPrestacionYFecha(user);
    await user.click(await screen.findByRole("button", { name: "09:00 a 09:30" }));
    await user.type(screen.getByLabelText("Nombre"), "Paciente Ficticio");
    await user.type(screen.getByLabelText("DNI"), "10000001");
    const submit = screen.getByRole("button", { name: "Confirmar reserva" });
    await user.click(submit);
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
    await act(async () => {
      altaPendiente.resolver({
        turno_id: TURNO_ID,
        profesional_id: PROF_ID,
        prestacion_id: PREST_A,
        inicio: "2026-11-20T09:00:00-03:00",
        fin: "2026-11-20T09:30:00-03:00",
        estado: "pendiente",
      });
    });
    expect(await screen.findByRole("heading", { name: "Turno pendiente" })).toBeInTheDocument();
  });

  it("Contenido público no revela terceros", async () => {
    const user = userEvent.setup();

    // Slots + confirmación de alta: solo campos del contrato público
    apiRequestMock.mockImplementation((ruta: string, opciones?: { method?: string }) => {
      if (ruta === "/prestaciones") return Promise.resolve(PRESTACIONES);
      if (String(ruta).startsWith(`/reservar/${PROF_ID}?`)) return Promise.resolve([SLOT_CON_EXTRAS]);
      if (ruta === "/reservar" && opciones?.method === "POST") {
        return Promise.resolve({
          turno_id: TURNO_ID,
          profesional_id: PROF_ID,
          prestacion_id: PREST_A,
          inicio: "2026-11-20T09:00:00-03:00",
          fin: "2026-11-20T09:30:00-03:00",
          estado: "pendiente",
          paciente_id: "paciente-ajeno-ficticio",
          nombre: "Tercero Ficticio",
          dni: "99999999",
          contacto: "tercero@ficticio.test",
          sillon_id: "sillon-ajeno-ficticio",
        });
      }
      return Promise.resolve([]);
    });
    renderEn(`/reservar/${PROF_ID}`);
    await elegirPrestacionYFecha(user);
    const botonSlot = await screen.findByRole("button", { name: "09:00 a 09:30" });
    expect(botonSlot).toBeInTheDocument(); // control positivo: horario contrato
    expect(screen.queryByText(/Tercero Ficticio/)).not.toBeInTheDocument();
    expect(screen.queryByText(/99999999/)).not.toBeInTheDocument();
    expect(screen.queryByText(/paciente-ajeno-ficticio/)).not.toBeInTheDocument();
    expect(screen.queryByText(/tercero@ficticio\.test/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sillon-ajeno-ficticio/)).not.toBeInTheDocument();

    await user.click(botonSlot);
    await user.type(screen.getByLabelText("Nombre"), "Reservante Ficticio");
    await user.type(screen.getByLabelText("DNI"), "10000001");
    await user.click(screen.getByRole("button", { name: "Confirmar reserva" }));
    expect(await screen.findByRole("heading", { name: "Turno pendiente" })).toBeInTheDocument();
    expect(screen.getByText(TURNO_ID)).toBeInTheDocument(); // control positivo 201
    expect(screen.getByText("pendiente")).toBeInTheDocument(); // control positivo 201
    expect(screen.getByText(PROF_ID)).toBeInTheDocument(); // control positivo 201
    expect(screen.queryByText(/Tercero Ficticio/)).not.toBeInTheDocument();
    expect(screen.queryByText(/99999999/)).not.toBeInTheDocument();
    expect(screen.queryByText(/paciente-ajeno-ficticio/)).not.toBeInTheDocument();
    expect(screen.queryByText(/tercero@ficticio\.test/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sillon-ajeno-ficticio/)).not.toBeInTheDocument();

    // Resultados por token: solo campos públicos (turno_id, inicio, resultado)
    const casos = [
      { path: `/confirmar/${TOKEN}`, accion: "Confirmar turno", heading: "Turno confirmado", resultado: "confirmado" as const },
      { path: `/cancelar/${TOKEN}`, accion: "Cancelar turno", heading: "Turno cancelado", resultado: "cancelado" as const },
    ];
    for (const caso of casos) {
      cleanup();
      clearSession();
      apiRequestMock.mockReset();
      apiRequestMock.mockResolvedValue({
        resultado: caso.resultado,
        turno_id: TURNO_ID,
        inicio: "2026-11-20T09:00:00-03:00",
        nombre: "Tercero Ficticio",
        dni: "99999999",
        paciente_id: "paciente-ajeno-ficticio",
        contacto: "tercero@ficticio.test",
        sillon_id: "sillon-ajeno-ficticio",
      });
      renderEn(caso.path);
      const u = userEvent.setup();
      await u.click(await screen.findByRole("button", { name: caso.accion }));
      expect(await screen.findByRole("heading", { name: caso.heading })).toBeInTheDocument();
      expect(screen.getByText(TURNO_ID)).toBeInTheDocument(); // control positivo
      expect(screen.getByText("09:00")).toBeInTheDocument(); // control positivo
      expect(screen.getByText(caso.resultado)).toBeInTheDocument(); // control positivo
      expect(screen.queryByText(/Tercero Ficticio/)).not.toBeInTheDocument();
      expect(screen.queryByText(/99999999/)).not.toBeInTheDocument();
      expect(screen.queryByText(/paciente-ajeno-ficticio/)).not.toBeInTheDocument();
      expect(screen.queryByText(/tercero@ficticio\.test/)).not.toBeInTheDocument();
      expect(screen.queryByText(/sillon-ajeno-ficticio/)).not.toBeInTheDocument();
    }
  });

  it("Controles táctiles y estados perceptibles — sin hover", () => {
    for (const ruta of RUTAS_PANTALLAS_PUBLICAS) {
      const codigo = readFileSync(resolve(process.cwd(), ruta), "utf8");
      expect(contienePatronHover(codigo)).toBeNull();
    }
    const conHover = '<Button onMouseEnter={() => {}}>x</Button>';
    expect(contienePatronHover(conHover)).toBe("onMouseEnter");
  });
});
