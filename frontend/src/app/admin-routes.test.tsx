/**
 * C-22, task 1.3 — rutas de administración.
 *
 * `/admin` tiene subrutas (`roles`, `sucursales` y `datos`) que resuelven a una
 * pantalla registrada para `admin`; `recepcion` es redirigido a `/agenda` con el
 * aviso de permiso insuficiente y una visita anónima va a `/login` conservando
 * el destino. El guard es navegación, no seguridad: la autorización real es del
 * backend.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routes } from "./router";
import { SessionProvider } from "../auth/session-context";
import { clearSession, setSession } from "../auth/session";
import type { Rol } from "../auth/session";

// La pantalla de roles consulta la API: se simula `apiRequest` (esta prueba solo
// verifica qué pantalla resuelve cada ruta, no el transporte).
vi.mock("../services/http", () => ({
  apiRequest: vi.fn(() => Promise.resolve([])),
}));

function nuevoCliente(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

afterEach(() => {
  cleanup();
  clearSession();
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

const SUBRUTAS: { path: string; heading: string }[] = [
  { path: "/admin/roles", heading: "Roles" },
  { path: "/admin/sucursales", heading: "Sucursales" },
  { path: "/admin/datos", heading: "Datos" },
];

const RUTAS_DE_ADMINISTRACION = ["/admin", ...SUBRUTAS.map((s) => s.path)];

describe("rutas de administración", () => {
  it.each(SUBRUTAS)(
    "admin: $path resuelve a la pantalla «$heading»",
    async ({ path, heading }) => {
      iniciarSesion("admin");
      renderEn(path);

      expect(
        await screen.findByRole("heading", { name: heading }),
      ).toBeInTheDocument();
    },
  );

  it.each(RUTAS_DE_ADMINISTRACION)(
    "recepcion: %s redirige a /agenda con el aviso de permiso insuficiente",
    async (path) => {
      iniciarSesion("recepcion");
      const router = renderEn(path);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Permiso insuficiente.",
      );
      expect(router.state.location.pathname).toBe("/agenda");
    },
  );

  it.each(RUTAS_DE_ADMINISTRACION)(
    "anónimo: %s lleva a /login conservando el destino",
    async (path) => {
      const router = renderEn(path);

      await waitFor(() =>
        expect(router.state.location.pathname).toBe("/login"),
      );
      expect(router.state.location.search).toBe(
        `?returnTo=${encodeURIComponent(path)}`,
      );
    },
  );
});
