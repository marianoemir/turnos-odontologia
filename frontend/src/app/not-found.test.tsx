/**
 * RED de 4.3 — ruta no declarada o parámetro ausente (design D10).
 *
 * Los dos casos tienen que caer en el catch-all `*`, que se renderiza DENTRO
 * del `<Outlet/>` del shell: la navegación sigue visible y operable y la
 * consola no registra errores no capturados.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routes } from "./router";
import { SessionProvider } from "../auth/session-context";
import { clearSession, setSession } from "../auth/session";
import { apiRequest } from "../services/http";

// `/agenda` es una pantalla real (C-17): pide profesionales + agenda vía
// `apiRequest`; se simula con listas vacías (esta prueba solo verifica el
// shell y la navegación, no el contenido de la pantalla).
vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

beforeEach(() => {
  setSession({ token: "jwt", rol: "recepcion", usuario: "test", sucursalId: null });
  apiRequestMock.mockResolvedValue([]);
});
afterEach(() => { cleanup(); clearSession(); });

const ENLACES_DEL_NAV: { nombre: string; destino: string }[] = [
  { nombre: "Agenda", destino: "/agenda" },
  { nombre: "Pacientes", destino: "/catalogo/pacientes" },
  { nombre: "Sillones", destino: "/catalogo/sillones" },
  { nombre: "Caja", destino: "/caja" },
];

/** Ruta no declarada y ruta con parámetro cuyo segmento obligatorio falta. */
const PATHS_SIN_MATCH = ["/ruta-inexistente", "/hc/"];

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

describe("ruta no declarada o parámetro ausente", () => {
  it.each(PATHS_SIN_MATCH)(
    "%s muestra «No encontrado» dentro del shell y con la nav intacta",
    async (path) => {
      const erroresConsola = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        renderEn(path);

        const main = await screen.findByRole("main");
        expect(
          within(main).getByRole("heading", { name: "No encontrado" }),
        ).toBeInTheDocument();

        const nav = await screen.findByRole("navigation", {
          name: "Navegación principal",
        });
        expect(within(nav).getAllByRole("link")).toHaveLength(4);
        for (const { nombre, destino } of ENLACES_DEL_NAV) {
          expect(
            within(nav).getByRole("link", { name: nombre }),
          ).toHaveAttribute("href", destino);
        }

        expect(erroresConsola).not.toHaveBeenCalled();
      } finally {
        erroresConsola.mockRestore();
      }
    },
  );

  it("la navegación del shell sigue operable desde la pantalla de no encontrado", async () => {
    const user = userEvent.setup();
    renderEn("/ruta-inexistente");

    await screen.findByRole("heading", { name: "No encontrado" });
    await user.click(screen.getByRole("link", { name: "Agenda" }));

    expect(
      await screen.findByRole("heading", { name: "Agenda" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
