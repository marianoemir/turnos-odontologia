/**
 * RED de 4.5 — límite de error dentro del shell (design D10).
 *
 * Monta el shell con un hijo de ruta que lanza durante el render: el fallback
 * tiene que aparecer DENTRO del contenido principal y la navegación lateral
 * tiene que seguir visible y operable (la app no queda en pantalla en blanco).
 *
 * El `console.error` esperado (React + `componentDidCatch`) se silencia en el
 * test: lo que se afirma es el comportamiento, no el log.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import Shell from "./shell";

afterEach(cleanup);

function Explota(): never {
  throw new Error("fallo de render esperado");
}

function PantallaAgenda() {
  return <h1>Agenda del día</h1>;
}

function renderConHijoQueExplota(): void {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <Shell />,
        children: [{ path: "boom", element: <Explota /> }],
      },
    ],
    { initialEntries: ["/boom"] },
  );

  render(<RouterProvider router={router} />);
}

describe("límite de error del shell", () => {
  it("muestra el fallback dentro del contenido principal", async () => {
    const erroresConsola = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      renderConHijoQueExplota();

      const main = await screen.findByRole("main");

      expect(
        within(main).getByRole("heading", {
          name: "No se pudo mostrar esta pantalla",
        }),
      ).toBeInTheDocument();
    } finally {
      erroresConsola.mockRestore();
    }
  });

  it("conserva la navegación visible y operable", async () => {
    const erroresConsola = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      renderConHijoQueExplota();

      const nav = await screen.findByRole("navigation", {
        name: "Navegación principal",
      });

      expect(within(nav).getAllByRole("link")).toHaveLength(4);
      expect(within(nav).getByRole("link", { name: "Agenda" })).toHaveAttribute(
        "href",
        "/agenda",
      );
    } finally {
      erroresConsola.mockRestore();
    }
  });

  it("no deja la pantalla en blanco: el fallback no tapa el shell", async () => {
    const erroresConsola = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      renderConHijoQueExplota();

      await screen.findByRole("alert");

      expect(screen.getByText("Agenda Odontológica")).toBeInTheDocument();
    } finally {
      erroresConsola.mockRestore();
    }
  });
});

/**
 * RED del defecto encontrado al usar el shell (2026-11-11): una vez que el
 * límite entra en error, navegar a otra pantalla sigue mostrando el fallback.
 * El límite tiene que resetearse cuando cambia la ruta, o la app queda
 * inservible hasta recargar el navegador.
 */
describe("límite de error del shell — recuperación al navegar", () => {
  it("vuelve a mostrar la pantalla nueva al cambiar de ruta", async () => {
    const erroresConsola = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const usuario = userEvent.setup();
      const router = createMemoryRouter(
        [
          {
            path: "/",
            element: <Shell />,
            children: [
              { path: "boom", element: <Explota /> },
              { path: "agenda", element: <PantallaAgenda /> },
            ],
          },
        ],
        { initialEntries: ["/boom"] },
      );

      render(<RouterProvider router={router} />);

      await screen.findByRole("alert");

      await usuario.click(screen.getByRole("link", { name: "Agenda" }));

      expect(router.state.location.pathname).toBe("/agenda");
      expect(
        await screen.findByRole("heading", { name: "Agenda del día" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      erroresConsola.mockRestore();
    }
  });
});
