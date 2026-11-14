import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { routes } from "../app/router";
import { clearSession, setSession } from "./session";
import { SessionProvider } from "./session-context";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>,
  );
  return router;
}

afterEach(() => {
  cleanup();
  clearSession();
});

describe("guardas de rutas", () => {
  it("redirige anónimos a login conservando sólo la ruta interna solicitada", async () => {
    const router = renderAt("/caja");

    expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
    expect(router.state.location.search).toBe("?returnTo=%2Fcaja");
  });

  it("redirige odontólogo fuera de agenda y comunica permiso insuficiente", async () => {
    setSession({
      token: "jwt-de-prueba",
      rol: "odontologo",
      usuario: "odontologo-ficticio",
      sucursalId: null,
    });

    renderAt("/caja");

    expect(await screen.findByRole("heading", { name: "Agenda" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Permiso insuficiente.");
  });

  it.each([
    ["/reservar/dr-aguirre", "Reservar turno"],
    ["/confirmar/token-publico", "Confirmar turno"],
    ["/cancelar/token-publico", "Cancelar turno"],
  ])("mantiene pública %s", async (path, heading) => {
    renderAt(path);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });
});
