import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routes } from "../app/router";
import { apiRequest } from "../services/http";
import { clearSession, getSession, setSession } from "./session";
import { SessionProvider } from "./session-context";

function renderAgenda(): void {
  const router = createMemoryRouter(routes, { initialEntries: ["/agenda"] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <SessionProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
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
    // La pantalla real de `/agenda` (C-17) pide profesionales al montar
    // (misma respuesta 401 del doble, sin reintento) + la llamada directa.
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    // La pantalla real de `/agenda` (C-17) también alerta su propio 403 de
    // profesionales: el aviso de permiso insuficiente sigue comunicado.
    const alertas = await screen.findAllByRole("alert");
    expect(
      alertas.some((alerta) => alerta.textContent?.includes("Permiso insuficiente.")),
    ).toBe(true);
    expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();
  });
});
