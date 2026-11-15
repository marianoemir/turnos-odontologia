/**
 * C-15, task 8.1 — matriz de navegación del catálogo.
 *
 * `recepcion` accede a las seis secciones dentro del shell; `odontologo` y
 * `admin` redirigen a `/agenda` con el aviso de permiso insuficiente. El guard
 * es el `ProtectedRoute` heredado de `frontend-sesion` (`canNavigate`), no
 * lógica nueva: esta prueba solo verifica la matriz a través del router real.
 * La pantalla de destino (`/agenda`, C-17) carga sus propios profesionales y
 * su día; lo que se afirma es que el guard no pide nada de catálogo antes de
 * redirigir.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routes } from "./router";
import { SessionProvider } from "../auth/session-context";
import { clearSession, setSession } from "../auth/session";
import type { Rol } from "../auth/session";
import { apiRequest } from "../services/http";

// Las pantallas de catálogo consultan la API: se simula `apiRequest` (esta
// prueba solo verifica qué resuelve cada ruta según el rol, no el transporte).
vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

function nuevoCliente(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

afterEach(() => {
  cleanup();
  clearSession();
  apiRequestMock.mockReset();
});

function iniciarSesion(rol: Rol): void {
  setSession({
    token: "jwt-de-prueba",
    rol,
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

describe("matriz de navegación del catálogo", () => {
  it.each(SECCIONES)(
    "recepcion: $path presenta la sección «$seccion» dentro del shell",
    async ({ path, seccion }) => {
      apiRequestMock.mockImplementation((ruta: string) =>
        Promise.resolve(
          String(ruta).startsWith("/pacientes")
            ? { items: [], total: 0, limit: 50, offset: 0 }
            : [],
        ),
      );
      iniciarSesion("recepcion");
      renderEn(path);

      expect(
        await screen.findByRole("heading", { name: "Catálogo" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: seccion }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("navigation", { name: "Navegación principal" }),
      ).toBeInTheDocument();
    },
  );

  it.each(SECCIONES.map((s) => s.path))(
    "odontologo: %s redirige a /agenda con aviso y sin requests de catálogo",
    async (path) => {
      apiRequestMock.mockResolvedValue([]);
      iniciarSesion("odontologo");
      const router = renderEn(path);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Permiso insuficiente.",
      );
      expect(
        await screen.findByRole("heading", { name: "Agenda" }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/agenda");
      // Solo las cargas propias de la pantalla de destino (`/agenda`, C-17);
      // el guard no pidió nada antes de redirigir.
      const rutas = apiRequestMock.mock.calls.map(([ruta]) => String(ruta));
      expect(
        rutas.filter(
          (ruta) => !ruta.startsWith("/profesionales") && !ruta.startsWith("/agenda"),
        ),
      ).toEqual([]);
    },
  );

  it.each(SECCIONES.map((s) => s.path))(
    "admin: %s redirige a /agenda con aviso y sin requests de catálogo",
    async (path) => {
      apiRequestMock.mockResolvedValue([]);
      iniciarSesion("admin");
      const router = renderEn(path);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Permiso insuficiente.",
      );
      expect(
        await screen.findByRole("heading", { name: "Agenda" }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/agenda");
      // Solo las cargas propias de la pantalla de destino (`/agenda`, C-17);
      // el guard no pidió nada antes de redirigir.
      const rutas = apiRequestMock.mock.calls.map(([ruta]) => String(ruta));
      expect(
        rutas.filter(
          (ruta) => !ruta.startsWith("/profesionales") && !ruta.startsWith("/agenda"),
        ),
      ).toEqual([]);
    },
  );
});
