/**
 * C-22, task 1.4 — grupo «Administración» del shell.
 *
 * El shell muestra un grupo «Administración» con un enlace a `/admin` sólo
 * cuando la sesión es de `admin`. Los demás roles ven exactamente los cuatro
 * enlaces de «Operación». Este archivo es aparte de `shell.test.tsx`, que debe
 * seguir pasando sin modificaciones.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { routes } from "./router";
import { SessionProvider } from "../auth/session-context";
import { clearSession, setSession } from "../auth/session";
import type { Rol } from "../auth/session";

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

async function navegacionEn(path: string): Promise<HTMLElement> {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>,
  );
  return screen.findByRole("navigation", { name: "Navegación principal" });
}

describe("grupo Administración del shell", () => {
  it("admin ve el grupo Administración con un enlace a /admin", async () => {
    iniciarSesion("admin");
    const nav = await navegacionEn("/agenda");

    expect(within(nav).getByText("Administración")).toBeInTheDocument();
    expect(
      within(nav).getByRole("link", { name: "Panel de administración" }),
    ).toHaveAttribute("href", "/admin");
  });

  it("admin conserva los cuatro enlaces de Operación y suma uno", async () => {
    iniciarSesion("admin");
    const nav = await navegacionEn("/agenda");

    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(within(nav).getByText("Operación")).toBeInTheDocument();
  });

  it.each(["recepcion", "odontologo"] as const)(
    "%s no ve el grupo y conserva exactamente los cuatro enlaces de Operación",
    async (rol) => {
      iniciarSesion(rol);
      const nav = await navegacionEn("/agenda");

      expect(within(nav).queryByText("Administración")).not.toBeInTheDocument();
      expect(
        within(nav).queryByRole("link", { name: "Panel de administración" }),
      ).not.toBeInTheDocument();
      expect(within(nav).getAllByRole("link")).toHaveLength(4);
    },
  );
});
