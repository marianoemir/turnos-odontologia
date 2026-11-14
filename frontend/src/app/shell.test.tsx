/**
 * RED de 4.4 — shell interno: navegación, topbar y estilos propios.
 *
 * La referencia es `design-system/components.html` §Navegación (líneas
 * 1016-1049) y los destinos son los que fija el design D12:
 * Agenda → `/agenda`, Pacientes → `/catalogo/pacientes`,
 * Sillones → `/catalogo/sillones`, Caja → `/caja`.
 *
 * `/turnos/nuevo`, `/lista-espera` y `/admin` se declaran y se prueban en 4.2
 * pero NO se enlazan: la navegación aprobada tiene cuatro enlaces (Q4).
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { routes } from "./router";
import { SessionProvider } from "../auth/session-context";
import { clearSession, setSession } from "../auth/session";

beforeEach(() => setSession({ token: "jwt", rol: "recepcion", usuario: "test", sucursalId: null }));
afterEach(() => { cleanup(); clearSession(); });

const ENLACES_DEL_NAV: { nombre: string; destino: string }[] = [
  { nombre: "Agenda", destino: "/agenda" },
  { nombre: "Pacientes", destino: "/catalogo/pacientes" },
  { nombre: "Sillones", destino: "/catalogo/sillones" },
  { nombre: "Caja", destino: "/caja" },
];

function renderEn(path: string): void {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<SessionProvider><RouterProvider router={router} /></SessionProvider>);
}

describe("shell interno", () => {
  it("muestra los cuatro enlaces del nav con su destino", async () => {
    renderEn("/agenda");

    const nav = await screen.findByRole("navigation", {
      name: "Navegación principal",
    });

    expect(within(nav).getAllByRole("link")).toHaveLength(4);
    for (const { nombre, destino } of ENLACES_DEL_NAV) {
      expect(within(nav).getByRole("link", { name: nombre })).toHaveAttribute(
        "href",
        destino,
      );
    }
  });

  it("muestra el nombre de marca del sistema visual", async () => {
    renderEn("/agenda");

    expect(
      await screen.findByText("Agenda Odontológica"),
    ).toBeInTheDocument();
  });

  it("marca el enlace de la ruta activa con aria-current", async () => {
    renderEn("/agenda");

    const nav = await screen.findByRole("navigation", {
      name: "Navegación principal",
    });

    expect(within(nav).getByRole("link", { name: "Agenda" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Pacientes" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("mantiene el grupo de navegación rotulado «Operación»", async () => {
    renderEn("/agenda");

    expect(await screen.findByText("Operación")).toBeInTheDocument();
  });

  it("renderiza la pantalla dentro del contenido principal del shell", async () => {
    renderEn("/agenda");

    const main = await screen.findByRole("main");

    expect(
      within(main).getByRole("heading", { name: "Agenda" }),
    ).toBeInTheDocument();
    expect(within(main).queryByRole("navigation")).not.toBeInTheDocument();
  });
});
