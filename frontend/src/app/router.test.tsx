/**
 * RED de 4.2 — tabla de rutas (design D10, D11).
 *
 * Las 11 rutas declaradas salen de la spec de C-13:
 * `/`, `/turnos/nuevo`, `/agenda`, `/catalogo/*`, `/lista-espera`,
 * `/hc/:pacienteId`, `/caja`, `/admin`, `/reservar/:profesional`,
 * `/confirmar/:token` y `/cancelar/:token`.
 *
 * Cada ruta debe resolver a una pantalla registrada y las rutas con parámetro
 * deben exponer el valor del segmento (`pacienteId`, `profesional`, `token`).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { routes } from "./router";

afterEach(cleanup);

/** Las 11 rutas declaradas, con el encabezado de la pantalla que las resuelve. */
const RUTAS_DECLARADAS: { path: string; heading: string }[] = [
  { path: "/", heading: "Inicio" },
  { path: "/turnos/nuevo", heading: "Nuevo turno" },
  { path: "/agenda", heading: "Agenda" },
  { path: "/catalogo/pacientes", heading: "Catálogo" },
  { path: "/lista-espera", heading: "Lista de espera" },
  { path: "/hc/pac-1", heading: "Historia clínica" },
  { path: "/caja", heading: "Caja" },
  { path: "/admin", heading: "Administración" },
  { path: "/reservar/dr-aguirre", heading: "Reservar turno" },
  { path: "/confirmar/tok-1", heading: "Confirmar turno" },
  { path: "/cancelar/tok-1", heading: "Cancelar turno" },
];

function renderEn(path: string): void {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

describe("tabla de rutas", () => {
  it.each(RUTAS_DECLARADAS)(
    "$path resuelve a la pantalla «$heading»",
    async ({ path, heading }) => {
      renderEn(path);

      expect(
        await screen.findByRole("heading", { name: heading }),
      ).toBeInTheDocument();
    },
  );

  it("expone pacienteId a la pantalla de historia clínica", async () => {
    renderEn("/hc/abc");

    expect(await screen.findByText("Paciente abc")).toBeInTheDocument();
  });

  it("expone profesional a la pantalla de reserva pública", async () => {
    renderEn("/reservar/dr-aguirre");

    expect(
      await screen.findByText("Profesional dr-aguirre"),
    ).toBeInTheDocument();
  });

  it("expone token a las pantallas de confirmación y cancelación", async () => {
    renderEn("/confirmar/tok-confirmar");
    expect(
      await screen.findByText("Token tok-confirmar"),
    ).toBeInTheDocument();
    cleanup();

    renderEn("/cancelar/tok-cancelar");
    expect(
      await screen.findByText("Token tok-cancelar"),
    ).toBeInTheDocument();
  });
});
