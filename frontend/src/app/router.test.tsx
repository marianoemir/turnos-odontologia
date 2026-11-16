/**
 * RED de 4.2 — tabla de rutas (design D10, D11).
 *
 * Las 11 rutas declaradas salen de la spec de C-13:
 * `/`, `/turnos/nuevo`, `/agenda`, `/catalogo/*`, `/lista-espera`,
 * `/hc/:pacienteId`, `/caja`, `/admin`, `/reservar/:profesional`,
 * `/confirmar/:token` y `/cancelar/:token`.
 *
 * Cada ruta debe resolver a una pantalla registrada y las rutas con parámetro
 * deben exponer el valor del segmento (`pacienteId`, `profesional`, `token`).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routes } from "./router";
import { SessionProvider } from "../auth/session-context";
import { clearSession, setSession } from "../auth/session";
import { apiRequest } from "../services/http";

// `/admin` muestra la sucursal activa y consulta la API: se simula `apiRequest`
// (esta prueba solo verifica qué pantalla resuelve cada ruta).
vi.mock("../services/http", () => ({
  apiRequest: vi.fn(() => Promise.resolve([])),
}));

const UUID_HC = "550e8400-e29b-41d4-a716-446655440000";

function mockHcPorRuta(uuid: string): void {
  vi.mocked(apiRequest).mockImplementation((ruta: string) => {
    if (ruta === `/pacientes/${uuid}/historia-clinica`) {
      return Promise.resolve({
        id: "hc-1",
        paciente_id: uuid,
        antecedentes: null,
        alergias: null,
        observaciones: null,
        creado_en: "2026-01-01T10:00:00Z",
      });
    }
    if (
      ruta === `/pacientes/${uuid}/odontograma` ||
      ruta === `/pacientes/${uuid}/planes-tratamiento`
    ) {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  setSession({
    token: "jwt-de-prueba",
    rol: "recepcion",
    usuario: "usuario-ficticio",
    sucursalId: null,
  });
  vi.mocked(apiRequest).mockImplementation(() => Promise.resolve([]));
});

afterEach(() => {
  cleanup();
  clearSession();
});

/** Las 11 rutas declaradas, con el encabezado de la pantalla que las resuelve. */
const RUTAS_DECLARADAS: { path: string; heading: string }[] = [
  { path: "/", heading: "Inicio" },
  { path: "/turnos/nuevo", heading: "Nuevo turno" },
  { path: "/agenda", heading: "Agenda" },
  { path: "/catalogo/pacientes", heading: "Catálogo" },
  { path: "/lista-espera", heading: "Lista de espera" },
  { path: `/hc/${UUID_HC}`, heading: "Historia clínica" },
  { path: "/caja", heading: "Caja" },
  { path: "/admin", heading: "Administración" },
  { path: "/reservar/dr-aguirre", heading: "Reservar turno" },
  { path: "/confirmar/tok-1", heading: "Confirmar turno" },
  { path: "/cancelar/tok-1", heading: "Cancelar turno" },
];

function renderEn(path: string): void {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <SessionProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </SessionProvider>,
  );
}

describe("tabla de rutas", () => {
  it.each(RUTAS_DECLARADAS)(
    "$path resuelve a la pantalla «$heading»",
    async ({ path, heading }) => {
      // C-22: `/admin` sólo la navega `admin`; el resto se prueba con `recepcion`.
      if (path === "/admin") {
        setSession({
          token: "jwt-de-prueba",
          rol: "admin",
          usuario: "usuario-ficticio",
          sucursalId: null,
        });
      }
      if (path === `/hc/${UUID_HC}`) {
        mockHcPorRuta(UUID_HC);
      }
      renderEn(path);

      expect(
        await screen.findByRole("heading", { name: heading }),
      ).toBeInTheDocument();
    },
  );

  it("expone pacienteId a la pantalla de historia clínica", async () => {
    mockHcPorRuta(UUID_HC);
    renderEn(`/hc/${UUID_HC}`);

    expect(
      await screen.findByText(`Paciente ${UUID_HC}`),
    ).toBeInTheDocument();
  });

  it("/hc/abc muestra aviso de identificador inválido y no emite requests", async () => {
    renderEn("/hc/abc");

    expect(
      await screen.findByRole("heading", { name: "Historia clínica" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/identificador de paciente inválido/i),
    ).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("expone profesional a la pantalla de reserva pública", async () => {
    renderEn("/reservar/dr-aguirre");

    expect(
      await screen.findByText("Profesional dr-aguirre"),
    ).toBeInTheDocument();
  });

  it("expone token a las pantallas de confirmación y cancelación", async () => {
    renderEn("/confirmar/tok-confirmar");
    expect(
      await screen.findByText("Token tok-confirmar"),
    ).toBeInTheDocument();
    cleanup();

    renderEn("/cancelar/tok-cancelar");
    expect(
      await screen.findByText("Token tok-cancelar"),
    ).toBeInTheDocument();
  });
});
