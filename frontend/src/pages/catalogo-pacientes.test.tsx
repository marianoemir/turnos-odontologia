/**
 * RED de 2.1 y 2.2 (C-15) — sección `/catalogo/pacientes`.
 *
 * `apiRequest` se reemplaza por un doble: las llamadas llegan en orden
 * (`GET /pacientes` inicial, mutación, `GET` de refresco por invalidación).
 * Datos ficticios. Cubre búsqueda con `?q=`, vacío, carga, alta exitosa con
 * confirmación, `409 duplicate_dni` en campo y 422 proyectado a campos.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../services/http";
import type { Paciente } from "../types/api";
import { ApiError } from "../types/errors";
import PacientesPage from "./catalogo-pacientes";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const ANA: Paciente = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Ana Ficticia",
  dni: "DNI-FICT-001",
  contacto: "contacto-ficticio-1",
  ficticio: true,
  activo: true,
};

const BETO: Paciente = {
  id: "22222222-2222-4222-8222-222222222222",
  nombre: "Beto Ficticio",
  dni: "DNI-FICT-002",
  contacto: null,
  ficticio: true,
  activo: true,
};

function envelope(items: Paciente[], total = items.length) {
  return { items, total, limit: 50, offset: 0 };
}

beforeEach(() => {
  apiRequestMock.mockReset();
});
afterEach(cleanup);

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PacientesPage />
    </QueryClientProvider>,
  );
}

describe("/catalogo/pacientes — listado y búsqueda (2.1)", () => {
  it("muestra el estado de carga mientras pide el envelope", async () => {
    apiRequestMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(await screen.findByLabelText("Cargando resultados")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(String(apiRequestMock.mock.calls[0]?.[0])).toMatch(/^\/pacientes\?/);
  });

  it("muestra el estado vacío cuando el envelope no trae items", async () => {
    apiRequestMock.mockResolvedValue(envelope([]));
    renderPage();

    expect(await screen.findByText("No hay pacientes.")).toBeInTheDocument();
  });

  it("la búsqueda pide GET /pacientes con el q escrito", async () => {
    const usuario = userEvent.setup();
    apiRequestMock.mockResolvedValue(envelope([ANA]));
    renderPage();

    const buscador = await screen.findByRole("searchbox", { name: "Buscar pacientes" });
    await usuario.type(buscador, "Juan");

    await waitFor(() => {
      const llamadas = apiRequestMock.mock.calls.map((llamada) => String(llamada[0]));
      expect(llamadas.some((ruta) => ruta.includes("q=Juan"))).toBe(true);
    });
  });
});

describe("/catalogo/pacientes — alta y edición (2.2)", () => {
  it("el alta exitosa actualiza la tabla y anuncia la confirmación", async () => {
    const usuario = userEvent.setup();
    const NUEVA: Paciente = {
      id: "33333333-3333-4333-8333-333333333333",
      nombre: "Ceci Ficticia",
      dni: "DNI-FICT-003",
      contacto: null,
      ficticio: true,
      activo: true,
    };
    apiRequestMock
      .mockResolvedValueOnce(envelope([ANA]))
      .mockResolvedValueOnce(NUEVA)
      .mockResolvedValueOnce(envelope([ANA, NUEVA], 2));
    renderPage();

    await screen.findByRole("cell", { name: "Ana Ficticia" });
    await usuario.click(screen.getByRole("button", { name: "Nuevo paciente" }));
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo paciente" });
    await usuario.type(within(dialogo).getByRole("textbox", { name: "Nombre" }), "Ceci Ficticia");
    await usuario.type(within(dialogo).getByRole("textbox", { name: "DNI" }), "DNI-FICT-003");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock.mock.calls[1]).toEqual([
      "/pacientes",
      {
        method: "POST",
        body: { nombre: "Ceci Ficticia", dni: "DNI-FICT-003", contacto: "" },
      },
    ]);
    expect(await screen.findByRole("cell", { name: "Ceci Ficticia" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Paciente creado.");
  });

  it("el dni duplicado conserva los datos y muestra el error en el campo dni", async () => {
    const usuario = userEvent.setup();
    const conflicto = new ApiError({
      kind: "conflicto",
      status: 409,
      causa: "duplicate_dni",
      mensaje: "Ya existe un paciente con ese DNI.",
    });
    apiRequestMock.mockResolvedValueOnce(envelope([ANA])).mockRejectedValueOnce(conflicto);
    renderPage();

    await screen.findByRole("cell", { name: "Ana Ficticia" });
    await usuario.click(screen.getByRole("button", { name: "Nuevo paciente" }));
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo paciente" });
    await usuario.type(within(dialogo).getByRole("textbox", { name: "Nombre" }), "Ceci Ficticia");
    const campoDni = within(dialogo).getByRole("textbox", { name: "DNI" });
    await usuario.type(campoDni, "DNI-FICT-001");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    const errorDni = await within(dialogo).findByRole("textbox", { name: "DNI" });
    expect(errorDni).toHaveAccessibleDescription("Ya existe un paciente con ese dni.");
    expect(errorDni).toHaveAttribute("aria-invalid", "true");
    expect(errorDni).toHaveValue("DNI-FICT-001");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
  });

  it("el 422 del servidor se proyecta a sus campos sin cerrar el formulario", async () => {
    const usuario = userEvent.setup();
    const invalido = new ApiError({
      kind: "validacion",
      status: 422,
      mensaje: "La request tiene campos inválidos: body.nombre: Asegurate de que este valor tenga al menos 1 caracter.",
      campos: [{ ubicacion: "body.nombre", mensaje: "Valor inválido." }],
    });
    apiRequestMock.mockResolvedValueOnce(envelope([ANA])).mockRejectedValueOnce(invalido);
    renderPage();

    await screen.findByRole("cell", { name: "Ana Ficticia" });
    await usuario.click(screen.getByRole("button", { name: "Nuevo paciente" }));
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo paciente" });
    await usuario.type(within(dialogo).getByRole("textbox", { name: "Nombre" }), "X");
    await usuario.type(within(dialogo).getByRole("textbox", { name: "DNI" }), "DNI-FICT-009");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(await within(dialogo).findByRole("textbox", { name: "Nombre" })).toHaveAccessibleDescription(
      "Valor inválido.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("la edición exitosa persiste el cambio y anuncia la confirmación", async () => {
    const usuario = userEvent.setup();
    const EDITADA: Paciente = { ...ANA, contacto: "nuevo-contacto" };
    apiRequestMock
      .mockResolvedValueOnce(envelope([ANA]))
      .mockResolvedValueOnce(EDITADA)
      .mockResolvedValueOnce(envelope([EDITADA]));
    renderPage();

    await screen.findByRole("cell", { name: "Ana Ficticia" });
    await usuario.click(screen.getByRole("button", { name: "Editar Ana Ficticia" }));
    const dialogo = await screen.findByRole("dialog", { name: "Editar paciente Ana Ficticia" });
    const campoContacto = within(dialogo).getByRole("textbox", { name: "Contacto" });
    await usuario.clear(campoContacto);
    await usuario.type(campoContacto, "nuevo-contacto");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock.mock.calls[1]).toEqual([
      `/pacientes/${ANA.id}`,
      { method: "PATCH", body: { contacto: "nuevo-contacto" } },
    ]);
    expect(await screen.findByRole("cell", { name: "nuevo-contacto" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Paciente actualizado.");
  });

  it("la edición con dni duplicado muestra el error en el campo sin cerrar", async () => {
    const usuario = userEvent.setup();
    const conflicto = new ApiError({
      kind: "conflicto",
      status: 409,
      causa: "duplicate_dni",
      mensaje: "Ya existe un paciente con ese DNI.",
    });
    apiRequestMock.mockResolvedValueOnce(envelope([ANA, BETO])).mockRejectedValueOnce(conflicto);
    renderPage();

    await screen.findByRole("cell", { name: "Ana Ficticia" });
    await usuario.click(screen.getByRole("button", { name: "Editar Ana Ficticia" }));
    const dialogo = await screen.findByRole("dialog", { name: "Editar paciente Ana Ficticia" });
    const campoDni = within(dialogo).getByRole("textbox", { name: "DNI" });
    await usuario.clear(campoDni);
    await usuario.type(campoDni, "DNI-FICT-002");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    const errorDni = await within(dialogo).findByRole("textbox", { name: "DNI" });
    expect(errorDni).toHaveAccessibleDescription("Ya existe un paciente con ese dni.");
    expect(errorDni).toHaveAttribute("aria-invalid", "true");
    expect(errorDni).toHaveValue("DNI-FICT-002");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
