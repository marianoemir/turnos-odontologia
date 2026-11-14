import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routes } from "../app/router";
import { apiRequest } from "../services/http";
import { clearSession, getSession, setSession } from "./session";
import { SessionProvider } from "./session-context";

function renderAgenda(): void {
  const router = createMemoryRouter(routes, { initialEntries: ["/agenda"] });
  render(
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>,
  );
}

function startSession(): void {
  setSession({
    token: "jwt-de-prueba",
    rol: "recepcion",
    usuario: "usuario-ficticio",
    sucursalId: null,
  });
}

afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
});

describe("respuestas de autenticación del cliente", () => {
  it("ante 401 termina la sesión y vuelve al login sin reintentar", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ detail: { causa: "token_expirado", detalle: "Venció." } }), { status: 401 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    startSession();
    renderAgenda();

    await expect(apiRequest("/agenda")).rejects.toMatchObject({ status: 401 });

    expect(getSession()).toBeNull();
    expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ante 403 conserva la sesión y comunica permiso insuficiente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ detail: { causa: "permiso_denegado", detalle: "No permitido." } }), { status: 403 })),
      ),
    );
    startSession();
    renderAgenda();

    await expect(apiRequest("/admin")).rejects.toMatchObject({ status: 403 });

    expect(getSession()).not.toBeNull();
    expect(await screen.findByRole("alert")).toHaveTextContent("Permiso insuficiente.");
    expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();
  });
});
