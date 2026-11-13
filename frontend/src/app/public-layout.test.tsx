/**
 * RED de 4.6 — layout público sin navegación interna (design D10).
 *
 * Las tres rutas del paciente (`/reservar/:profesional`, `/confirmar/:token`,
 * `/cancelar/:token`) viven bajo `PublicLayout`, no bajo el shell: la pantalla
 * se presenta sin el landmark de navegación interna.
 *
 * Nota de TDD: la sola ausencia de la nav ya era cierta antes de esta task
 * (las rutas estaban planas), así que el test exige además que la pantalla se
 * renderice DENTRO del layout público (`<main>`). Sin esa aserción no habría
 * RED posible.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { routes } from "./router";

afterEach(cleanup);

const RUTAS_PUBLICAS: { path: string; heading: string }[] = [
  { path: "/reservar/abc", heading: "Reservar turno" },
  { path: "/confirmar/abc", heading: "Confirmar turno" },
  { path: "/cancelar/abc", heading: "Cancelar turno" },
];

function renderEn(path: string): void {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

describe("layout público", () => {
  it.each(RUTAS_PUBLICAS)(
    "$path se presenta en el layout público y sin navegación interna",
    async ({ path, heading }) => {
      renderEn(path);

      const main = await screen.findByRole("main");
      expect(
        within(main).getByRole("heading", { name: heading }),
      ).toBeInTheDocument();

      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
      expect(screen.queryByText("Agenda Odontológica")).not.toBeInTheDocument();
    },
  );

  it("las rutas internas siguen presentándose bajo el shell", async () => {
    renderEn("/agenda");

    expect(
      await screen.findByRole("navigation", { name: "Navegación principal" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
