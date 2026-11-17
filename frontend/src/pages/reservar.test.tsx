/**
 * Grupo 3A de C-21 — selección de prestación y fecha, slots y estados
 * (tasks 3.1–3.3, escenarios 6.8, 6.9 y 6.10 de `frontend-reserva-publica`).
 *
 * Re-verificación a nivel pantalla de 6.7 y de la parte de slots de 6.4: esas
 * tasks ya están cerradas a nivel helper; acá se comprueba que la pantalla
 * realmente pide las prestaciones y los slots como requests públicas.
 *
 * Se mockea `services/http` (el borde que usa la pantalla) y se monta la tabla
 * real de rutas, igual que `historia-clinica.test.tsx`. Los tests corren sin
 * sesión: la pantalla es pública.
 */
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
import { clearSession, getSession } from "../auth/session";
import { SessionProvider } from "../auth/session-context";
import { apiRequest } from "../services/http";
import type { Prestacion } from "../types/api";
import type { SlotPublico } from "../types/api-reserva-publica";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const PROF_ID = "11111111-1111-4111-8111-111111111111";
const PREST_A = "22222222-2222-4222-8222-222222222222";
const PREST_B = "33333333-3333-4333-8333-333333333333";
const PREST_INACTIVA = "44444444-4444-4444-8444-444444444444";
const FECHA = "2026-11-20";

const PRESTACIONES: Prestacion[] = [
  { id: PREST_A, nombre: "Limpieza ficticia", duracion_min: 30, activo: true },
  { id: PREST_B, nombre: "Control ficticio", duracion_min: 20, activo: true },
  {
    id: PREST_INACTIVA,
    nombre: "Prestación inactiva ficticia",
    duracion_min: 30,
    activo: false,
  },
];

const SLOTS_A: SlotPublico[] = [
  { inicio: "2026-11-20T09:00:00-03:00", fin: "2026-11-20T09:30:00-03:00" },
  { inicio: "2026-11-20T10:00:00-03:00", fin: "2026-11-20T10:30:00-03:00" },
];

beforeEach(() => {
  apiRequestMock.mockReset();
  clearSession();
});

afterEach(() => {
  cleanup();
  clearSession();
});

function renderReserva(): void {
  const router = createMemoryRouter(routes, {
    initialEntries: [`/reservar/${PROF_ID}`],
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <SessionProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </SessionProvider>,
  );
}

function diferida<T>(): { promesa: Promise<T>; resolver: (valor: T) => void } {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promesa, resolver };
}

function llamadasDeSlots(): string[] {
  return apiRequestMock.mock.calls
    .map(([ruta]) => String(ruta))
    .filter((ruta) => ruta.startsWith(`/reservar/${PROF_ID}?`));
}

function mockApi(responderSlots: (ruta: string) => Promise<SlotPublico[]>): void {
  apiRequestMock.mockImplementation((ruta: string) => {
    if (ruta === "/prestaciones") {
      return Promise.resolve(PRESTACIONES);
    }
    if (ruta.startsWith(`/reservar/${PROF_ID}?`)) {
      return responderSlots(ruta);
    }
    return Promise.resolve([]);
  });
}

async function elegirPrestacionYFecha(
  user: ReturnType<typeof userEvent.setup>,
  prestacion: string,
  fecha = FECHA,
): Promise<void> {
  const select = await screen.findByLabelText("Prestación");
  await waitFor(() =>
    expect(within(select).getAllByRole("option").length).toBeGreaterThan(1),
  );
  await user.selectOptions(select, prestacion);
  fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: fecha } });
}

describe("3.1 Selección de prestación, fecha y slots", () => {
  it("Slots disponibles se muestran tras elegir prestación y fecha", async () => {
    const user = userEvent.setup();
    mockApi(() => Promise.resolve(SLOTS_A));
    renderReserva();

    const select = await screen.findByLabelText("Prestación");
    await waitFor(() =>
      expect(
        within(select).getByRole("option", { name: "Limpieza ficticia" }),
      ).toBeInTheDocument(),
    );

    await elegirPrestacionYFecha(user, PREST_A);

    const primerSlot = await screen.findByRole("button", {
      name: "09:00 a 09:30",
    });
    expect(
      screen.getByRole("button", { name: "10:00 a 10:30" }),
    ).toBeInTheDocument();
    expect(llamadasDeSlots()).toEqual([
      `/reservar/${PROF_ID}?prestacion=${PREST_A}&fecha=${FECHA}`,
    ]);

    await user.click(primerSlot);

    expect(
      screen.getByRole("button", { name: "09:00 a 09:30" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("Horario seleccionado: 09:00 a 09:30"),
    ).toBeInTheDocument();
  });

  it("Los slots muestran solo inicio y fin", async () => {
    const user = userEvent.setup();
    const slotConExtras = {
      inicio: "2026-11-20T09:00:00-03:00",
      fin: "2026-11-20T09:30:00-03:00",
      sillon_id: "sillon-ficticio-nueve",
      paciente_id: "paciente-ficticio-tres",
    } as unknown as SlotPublico;
    mockApi(() => Promise.resolve([slotConExtras]));
    renderReserva();

    await elegirPrestacionYFecha(user, PREST_A);

    expect(
      await screen.findByRole("button", { name: "09:00 a 09:30" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sillon-ficticio-nueve/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/paciente-ficticio-tres/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/2026-11-20T09:00:00-03:00/),
    ).not.toBeInTheDocument();
  });
});

describe("3.2 Estado vacío de disponibilidad", () => {
  it("Respuesta vacía se comunica como ausencia de disponibilidad", async () => {
    const user = userEvent.setup();
    mockApi(() => Promise.resolve([]));
    renderReserva();

    await elegirPrestacionYFecha(user, PREST_A);

    expect(
      await screen.findByRole("heading", { name: "Sin turnos disponibles" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(llamadasDeSlots()).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Fecha"), {
      target: { value: "2026-11-21" },
    });

    await waitFor(() => expect(llamadasDeSlots()).toHaveLength(2));
    expect(
      await screen.findByRole("heading", { name: "Sin turnos disponibles" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Prestación")).toBeEnabled();
  });
});

describe("3.3 Respuestas obsoletas", () => {
  it("Respuesta tardía no reemplaza la selección vigente", async () => {
    const user = userEvent.setup();
    const lenta = diferida<SlotPublico[]>();
    const rapida = diferida<SlotPublico[]>();
    apiRequestMock.mockImplementation((ruta: string) => {
      if (ruta === "/prestaciones") {
        return Promise.resolve(PRESTACIONES);
      }
      if (ruta.includes(`prestacion=${PREST_A}`)) {
        return lenta.promesa;
      }
      if (ruta.includes(`prestacion=${PREST_B}`)) {
        return rapida.promesa;
      }
      return Promise.resolve([]);
    });

    renderReserva();
    await elegirPrestacionYFecha(user, PREST_A);
    await waitFor(() => expect(llamadasDeSlots()).toHaveLength(1));

    await user.selectOptions(screen.getByLabelText("Prestación"), PREST_B);
    await waitFor(() => expect(llamadasDeSlots()).toHaveLength(2));

    await act(async () => {
      rapida.resolver([
        { inicio: "2026-11-20T11:00:00-03:00", fin: "2026-11-20T11:30:00-03:00" },
      ]);
    });
    expect(
      await screen.findByRole("button", { name: "11:00 a 11:30" }),
    ).toBeInTheDocument();

    await act(async () => {
      lenta.resolver(SLOTS_A);
    });
    expect(
      screen.queryByRole("button", { name: "09:00 a 09:30" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "10:00 a 10:30" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "11:00 a 11:30" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "11:00 a 11:30" }));
    expect(
      screen.getByText("Horario seleccionado: 11:00 a 11:30"),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Prestación"), PREST_A);
    await waitFor(() =>
      expect(screen.queryByText(/Horario seleccionado/)).not.toBeInTheDocument(),
    );
  });
});

describe("Re-verificación a nivel pantalla", () => {
  it("Re-verificación 6.7: prestaciones públicas sin incluir_inactivos y solo activas", async () => {
    mockApi(() => Promise.resolve([]));
    renderReserva();

    expect(getSession()).toBeNull();
    const select = await screen.findByLabelText("Prestación");
    await waitFor(() =>
      expect(
        within(select).getByRole("option", { name: "Control ficticio" }),
      ).toBeInTheDocument(),
    );

    expect(
      within(select).queryByRole("option", {
        name: "Prestación inactiva ficticia",
      }),
    ).not.toBeInTheDocument();

    const llamada = apiRequestMock.mock.calls.find(
      ([ruta]) => String(ruta) === "/prestaciones",
    );
    expect(llamada).toBeDefined();
    expect(llamada?.[1]).toMatchObject({ publica: true });
    expect(String(llamada?.[0])).not.toContain("incluir_inactivos");
  });

  it("Re-verificación 6.4: slots públicos se presentan en la propia pantalla sin sesión", async () => {
    const user = userEvent.setup();
    mockApi(() => Promise.resolve(SLOTS_A));
    renderReserva();

    expect(getSession()).toBeNull();
    await elegirPrestacionYFecha(user, PREST_A);

    expect(
      await screen.findByRole("button", { name: "09:00 a 09:30" }),
    ).toBeInTheDocument();

    const llamada = apiRequestMock.mock.calls.find(([ruta]) =>
      String(ruta).startsWith(`/reservar/${PROF_ID}?`),
    );
    expect(llamada?.[1]).toMatchObject({ publica: true });
    expect(getSession()).toBeNull();
  });
});
