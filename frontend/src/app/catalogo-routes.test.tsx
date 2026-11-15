/**
 * RED de 1.3 (C-15) — layout de catálogo con subrutas anidadas.
 *
 * `/catalogo/*` pasa de placeholder a layout de sección con tabs y `<Outlet/>`:
 * cada subruta renderiza el layout (encabezado «Catálogo» con sus seis tabs) y
 * su sección; una ruta inexistente muestra `NotFound` dentro del shell, con la
 * navegación principal operable. Espejo de `admin-routes.test.tsx`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routes } from "./router";
import { SessionProvider } from "../auth/session-context";
import { clearSession, setSession } from "../auth/session";

// Las seis secciones son pantallas reales que consultan la API; solo
// `/catalogo/pacientes` (grupo 2) pide el envelope de pacientes: se simula
// `apiRequest` para que la prueba solo verifique resolución de rutas.
vi.mock("../services/http", () => ({
  apiRequest: vi.fn((ruta: string) =>
    Promise.resolve(
      String(ruta).startsWith("/pacientes")
        ? { items: [], total: 0, limit: 50, offset: 0 }
        : [],
    ),
  ),
}));

function nuevoCliente(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

afterEach(() => {
  cleanup();
  clearSession();
});

function iniciarSesionRecepcion(): void {
  setSession({
    token: "jwt-de-prueba",
    rol: "recepcion",
    usuario: "usuario-ficticio",
    sucursalId: null,
  });
}

function renderEn(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <SessionProvider>
      <QueryClientProvider client={nuevoCliente()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </SessionProvider>,
  );
  return router;
}

const SECCIONES: { path: string; seccion: string }[] = [
  { path: "/catalogo/pacientes", seccion: "Pacientes" },
  { path: "/catalogo/profesionales", seccion: "Profesionales" },
  { path: "/catalogo/sillones", seccion: "Sillones" },
  { path: "/catalogo/prestaciones", seccion: "Prestaciones" },
  { path: "/catalogo/horarios", seccion: "Horarios" },
  { path: "/catalogo/bloqueos", seccion: "Bloqueos" },
];

describe("rutas de catálogo", () => {
  it.each(SECCIONES)(
    "$path renderiza el layout con sus tabs y la sección «$seccion»",
    async ({ path, seccion }) => {
      iniciarSesionRecepcion();
      renderEn(path);

      expect(
        await screen.findByRole("heading", { name: "Catálogo" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: seccion }),
      ).toBeInTheDocument();
      const tabs = screen.getByRole("navigation", {
        name: "Secciones de catálogo",
      });
      for (const { seccion: nombre } of SECCIONES) {
        expect(tabs).toHaveTextContent(nombre);
      }
    },
  );

  it("los tabs enlazan a las seis secciones", async () => {
    iniciarSesionRecepcion();
    renderEn("/catalogo/pacientes");

    const tabs = await screen.findByRole("navigation", {
      name: "Secciones de catálogo",
    });
    for (const { path, seccion } of SECCIONES) {
      const enlace = tabs.querySelector(`a[href="${path}"]`);
      expect(enlace).not.toBeNull();
      expect(enlace).toHaveTextContent(seccion);
    }
  });

  it("/catalogo redirige a la sección de pacientes", async () => {
    iniciarSesionRecepcion();
    const router = renderEn("/catalogo");

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/catalogo/pacientes"),
    );
    expect(
      await screen.findByRole("heading", { name: "Catálogo" }),
    ).toBeInTheDocument();
  });

  it("/catalogo/inexistente muestra No encontrado dentro del shell", async () => {
    iniciarSesionRecepcion();
    renderEn("/catalogo/inexistente");

    expect(
      await screen.findByRole("heading", { name: "No encontrado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Navegación principal" }),
    ).toBeInTheDocument();
  });
});
