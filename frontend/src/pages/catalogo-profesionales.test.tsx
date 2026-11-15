/**
 * RED de 3.1 y 3.2 (C-15) — sección `/catalogo/profesionales`.
 *
 * `apiRequest` se reemplaza por un doble: las llamadas llegan en orden
 * (`GET /profesionales` inicial, mutación, `GET` de refresco por
 * invalidación). Datos ficticios. Cubre alta exitosa con confirmación,
 * `409 duplicate_matricula` en campo, edición, y toggle `activo` con
 * confirmación (confirma persiste, cancela no llama a la API).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../services/http";
import type { Profesional } from "../types/api";
import { ApiError } from "../types/errors";
import ProfesionalesPage from "./catalogo-profesionales";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const ANA: Profesional = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Ana Ficticia",
  matricula: "MAT-FICT-001",
  sucursal_id: null,
  activo: true,
};

const BETO: Profesional = {
  id: "22222222-2222-4222-8222-222222222222",
  nombre: "Beto Ficticio",
  matricula: "MAT-FICT-002",
  sucursal_id: null,
  activo: false,
};

beforeEach(() => {
  apiRequestMock.mockReset();
});
afterEach(cleanup);

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProfesionalesPage />
    </QueryClientProvider>,
  );
}

describe("/catalogo/profesionales — listado (3.1)", () => {
  it("muestra el estado de carga mientras pide la lista", async () => {
    apiRequestMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(await screen.findByLabelText("Cargando resultados")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(String(apiRequestMock.mock.calls[0]?.[0])).toBe(
      "/profesionales?incluir_inactivos=true",
    );
  });

  it("muestra el estado vacío cuando no hay profesionales", async () => {
    apiRequestMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("No hay profesionales.")).toBeInTheDocument();
  });

  it("lista los profesionales con su matrícula y estado", async () => {
    apiRequestMock.mockResolvedValue([ANA, BETO]);
    renderPage();

    expect(await screen.findByRole("cell", { name: "Ana Ficticia" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "MAT-FICT-001" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Beto Ficticio" })).toBeInTheDocument();
    expect(apiRequestMock.mock.calls.map(([ruta]) => ruta)).toContain(
      "/profesionales?incluir_inactivos=true",
    );
  });
});

describe("/catalogo/profesionales — alta y edición (3.1)", () => {
  it("el alta exitosa actualiza la tabla y anuncia la confirmación", async () => {
    const usuario = userEvent.setup();
    const NUEVO: Profesional = {
      id: "33333333-3333-4333-8333-333333333333",
      nombre: "Ceci Ficticia",
      matricula: "MAT-FICT-003",
      sucursal_id: null,
      activo: true,
    };
    apiRequestMock
      .mockResolvedValueOnce([ANA])
      .mockResolvedValueOnce(NUEVO)
      .mockResolvedValueOnce([ANA, NUEVO]);
    renderPage();

    await screen.findByRole("cell", { name: "Ana Ficticia" });
    await usuario.click(screen.getByRole("button", { name: "Nuevo profesional" }));
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo profesional" });
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Nombre" }),
      "Ceci Ficticia",
    );
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Matrícula" }),
      "MAT-FICT-003",
    );
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock.mock.calls[1]).toEqual([
      "/profesionales",
      {
        method: "POST",
        body: { nombre: "Ceci Ficticia", matricula: "MAT-FICT-003" },
      },
    ]);
    expect(await screen.findByRole("cell", { name: "Ceci Ficticia" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Profesional creado.");
  });

  it("la matrícula duplicada conserva los datos y muestra el error en el campo matrícula", async () => {
    const usuario = userEvent.setup();
    const conflicto = new ApiError({
      kind: "conflicto",
      status: 409,
      causa: "duplicate_matricula",
      mensaje: "Ya existe un profesional con esa matrícula.",
    });
    apiRequestMock.mockResolvedValueOnce([ANA]).mockRejectedValueOnce(conflicto);
    renderPage();

    await screen.findByRole("cell", { name: "Ana Ficticia" });
    await usuario.click(screen.getByRole("button", { name: "Nuevo profesional" }));
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo profesional" });
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Nombre" }),
      "Ceci Ficticia",
    );
    const campoMatricula = within(dialogo).getByRole("textbox", { name: "Matrícula" });
    await usuario.type(campoMatricula, "MAT-FICT-001");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    const errorMatricula = await within(dialogo).findByRole("textbox", {
      name: "Matrícula",
    });
    expect(errorMatricula).toHaveAccessibleDescription(
      "Ya existe un profesional con esa matrícula.",
    );
    expect(errorMatricula).toHaveAttribute("aria-invalid", "true");
    expect(errorMatricula).toHaveValue("MAT-FICT-001");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
  });

  it("la edición exitosa persiste el cambio y anuncia la confirmación", async () => {
    const usuario = userEvent.setup();
    const EDITADO: Profesional = { ...ANA, nombre: "Ana Actualizada" };
    apiRequestMock
      .mockResolvedValueOnce([ANA])
      .mockResolvedValueOnce(EDITADO)
      .mockResolvedValueOnce([EDITADO]);
    renderPage();

    await screen.findByRole("cell", { name: "Ana Ficticia" });
    await usuario.click(screen.getByRole("button", { name: "Editar Ana Ficticia" }));
    const dialogo = await screen.findByRole("dialog", {
      name: "Editar profesional Ana Ficticia",
    });
    const campoNombre = within(dialogo).getByRole("textbox", { name: "Nombre" });
    await usuario.clear(campoNombre);
    await usuario.type(campoNombre, "Ana Actualizada");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock.mock.calls[1]).toEqual([
      `/profesionales/${ANA.id}`,
      { method: "PATCH", body: { nombre: "Ana Actualizada" } },
    ]);
    expect(await screen.findByRole("cell", { name: "Ana Actualizada" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Profesional actualizado.");
  });
});

describe("/catalogo/profesionales — toggle activo con confirmación (3.2)", () => {
  it("desactivar pide confirmación, confirma persiste y anuncia", async () => {
    const usuario = userEvent.setup();
    const DESACTIVADO: Profesional = { ...ANA, activo: false };
    apiRequestMock
      .mockResolvedValueOnce([ANA])
      .mockResolvedValueOnce(DESACTIVADO)
      .mockResolvedValueOnce([DESACTIVADO]);
    renderPage();

    await screen.findByRole("cell", { name: "Ana Ficticia" });
    await usuario.click(screen.getByRole("button", { name: "Desactivar Ana Ficticia" }));
    const dialogo = await screen.findByRole("dialog", {
      name: "Desactivar profesional Ana Ficticia",
    });
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock.mock.calls[1]).toEqual([
      `/profesionales/${ANA.id}`,
      { method: "PATCH", body: { activo: false } },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Profesional desactivado.",
    );
  });

  it("cancelar la confirmación no envía ninguna request", async () => {
    const usuario = userEvent.setup();
    apiRequestMock.mockResolvedValueOnce([ANA]);
    renderPage();

    await screen.findByRole("cell", { name: "Ana Ficticia" });
    await usuario.click(screen.getByRole("button", { name: "Desactivar Ana Ficticia" }));
    const dialogo = await screen.findByRole("dialog", {
      name: "Desactivar profesional Ana Ficticia",
    });
    await usuario.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("activar pide confirmación y persiste activo true", async () => {
    const usuario = userEvent.setup();
    const ACTIVADO: Profesional = { ...BETO, activo: true };
    apiRequestMock
      .mockResolvedValueOnce([ANA, BETO])
      .mockResolvedValueOnce(ACTIVADO)
      .mockResolvedValueOnce([ANA, ACTIVADO]);
    renderPage();

    await screen.findByRole("cell", { name: "Beto Ficticio" });
    await usuario.click(screen.getByRole("button", { name: "Activar Beto Ficticio" }));
    const dialogo = await screen.findByRole("dialog", {
      name: "Activar profesional Beto Ficticio",
    });
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock.mock.calls[1]).toEqual([
      `/profesionales/${BETO.id}`,
      { method: "PATCH", body: { activo: true } },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Profesional activado.",
    );
  });
});
