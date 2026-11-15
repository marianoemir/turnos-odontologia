import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routes } from "../app/router";
import { clearSession, setSession } from "./session";
import { SessionProvider } from "./session-context";
import { apiRequest } from "../services/http";

// `/agenda` es una pantalla real (C-17): pide profesionales + agenda vía
// `apiRequest`; se simula con listas vacías (esta prueba solo verifica la
// guarda y el aviso, no el contenido de la pantalla).
vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  apiRequestMock.mockResolvedValue([]);
  render(
    <SessionProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
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
