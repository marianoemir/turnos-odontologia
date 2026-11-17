import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { routes } from "./router";
import { SessionProvider } from "../auth/session-context";
import { clearSession, getSession, setSession } from "../auth/session";

/**
 * C-21, grupo 2 — enrutado público y `noindex` (design D1, D8).
 *
 * 6.1, 6.2 y 6.20 corren sin sesión; sólo 6.3 arranca una sesión interna.
 * La sesión del repo vive en memoria (`auth/session.ts`), no en storage, así
 * que 6.3 la verifica con `getSession()`.
 *
 * La ausencia de redirección se comprueba sobre el `pathname` del router: es
 * lo único que distingue "se quiso mostrar /login" de "se redirigió". El
 * heading de login es "Ingresar" (`pages/login.tsx`), no "Iniciar sesión".
 */

const RUTAS_CON_TOKEN = [
  { path: "/confirmar/abc", heading: "Confirmar turno" },
  { path: "/cancelar/abc", heading: "Cancelar turno" },
] as const;

beforeEach(() => clearSession());

afterEach(() => {
  cleanup();
  clearSession();
  const meta = document.head.querySelector('meta[name="robots"]');
  if (meta) {
    meta.remove();
  }
});

function renderEn(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const { unmount } = render(
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>,
  );
  return { router, unmount };
}

function sinShellInterno(): void {
  expect(
    screen.queryByRole("navigation", { name: "Navegación principal" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Agenda" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Ingresar" })).not.toBeInTheDocument();
}

describe("rutas publicas de reserva (C-21 grupo 2)", () => {
  it("Visitante anónimo accede a la reserva pública", async () => {
    const { router } = renderEn("/reservar/abc");

    expect(
      await screen.findByRole("heading", { name: "Reservar turno" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/reservar/abc");
    sinShellInterno();
  });

  it("Visitante anónimo accede a rutas con token", async () => {
    for (const caso of RUTAS_CON_TOKEN) {
      const { router, unmount } = renderEn(caso.path);

      expect(
        await screen.findByRole("heading", { name: caso.heading }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(caso.path);
      sinShellInterno();

      unmount();
      cleanup();
    }
  });

  it("Sesión interna activa no interfiere con rutas públicas", async () => {
    setSession({
      token: "jwt-de-prueba",
      rol: "recepcion",
      usuario: "usuario-ficticio",
      sucursalId: null,
    });

    for (const caso of [
      { path: "/reservar/abc", heading: "Reservar turno" },
      ...RUTAS_CON_TOKEN,
    ] as const) {
      const { router, unmount } = renderEn(caso.path);

      expect(
        await screen.findByRole("heading", { name: caso.heading }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(caso.path);
      expect(getSession()?.token).toBe("jwt-de-prueba");
      sinShellInterno();

      unmount();
      cleanup();
    }
  });

  it("Rutas con token declaran noindex", async () => {
    for (const caso of RUTAS_CON_TOKEN) {
      const { unmount } = renderEn(caso.path);

      await screen.findByRole("heading", { name: caso.heading });
      const meta = document.head.querySelector('meta[name="robots"]');
      expect(meta).not.toBeNull();
      expect(meta?.getAttribute("content") ?? "").toMatch(/noindex/i);

      unmount();
      cleanup();
      expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    }

    renderEn("/reservar/abc");
    await screen.findByRole("heading", { name: "Reservar turno" });
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});
