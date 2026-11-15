/**
 * RED de 4.1 y 4.2 (C-15) — sección `/catalogo/sillones`.
 *
 * `apiRequest` se reemplaza por un doble: las llamadas llegan en orden
 * (`GET /sillones` inicial, mutación, `GET` de refresco por
 * invalidación). Datos ficticios. Cubre alta exitosa con confirmación,
 * `409 duplicate_nombre_sillon` en campo, y toggle `activo` con
 * confirmación que advierte que desactivar no borra turnos
 * (confirma persiste, cancela no llama a la API).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../services/http";
import type { Sillon } from "../types/api";
import { ApiError } from "../types/errors";
import SillonesPage from "./catalogo-sillones";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const BOX_A: Sillon = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Box A Ficticio",
  sucursal_id: null,
  activo: true,
};

const BOX_B: Sillon = {
  id: "22222222-2222-4222-8222-222222222222",
  nombre: "Box B Ficticio",
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
      <SillonesPage />
    </QueryClientProvider>,
  );
}

describe("/catalogo/sillones — listado (4.1)", () => {
  it("muestra el estado de carga mientras pide la lista", async () => {
    apiRequestMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(await screen.findByLabelText("Cargando resultados")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(String(apiRequestMock.mock.calls[0]?.[0])).toBe(
      "/sillones?incluir_inactivos=true",
    );
  });

  it("muestra el estado vacío cuando no hay sillones", async () => {
    apiRequestMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("No hay sillones.")).toBeInTheDocument();
  });

  it("lista los sillones con su nombre y estado", async () => {
    apiRequestMock.mockResolvedValue([BOX_A, BOX_B]);
    renderPage();

    expect(await screen.findByRole("cell", { name: "Box A Ficticio" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Box B Ficticio" })).toBeInTheDocument();
    expect(apiRequestMock.mock.calls.map(([ruta]) => ruta)).toContain(
      "/sillones?incluir_inactivos=true",
    );
  });
});

describe("/catalogo/sillones — alta (4.1)", () => {
  it("el alta exitosa actualiza la tabla y anuncia la confirmación", async () => {
    const usuario = userEvent.setup();
    const NUEVO: Sillon = {
      id: "33333333-3333-4333-8333-333333333333",
      nombre: "Box C Ficticio",
      sucursal_id: null,
      activo: true,
    };
    apiRequestMock
      .mockResolvedValueOnce([BOX_A])
      .mockResolvedValueOnce(NUEVO)
      .mockResolvedValueOnce([BOX_A, NUEVO]);
    renderPage();

    await screen.findByRole("cell", { name: "Box A Ficticio" });
    await usuario.click(screen.getByRole("button", { name: "Nuevo sillón" }));
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo sillón" });
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Nombre" }),
      "Box C Ficticio",
    );
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock.mock.calls[1]).toEqual([
      "/sillones",
      { method: "POST", body: { nombre: "Box C Ficticio" } },
    ]);
    expect(await screen.findByRole("cell", { name: "Box C Ficticio" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Sillón creado.");
  });

  it("el nombre duplicado conserva los datos y muestra el error en el campo nombre", async () => {
    const usuario = userEvent.setup();
    const conflicto = new ApiError({
      kind: "conflicto",
      status: 409,
      causa: "duplicate_nombre_sillon",
      mensaje: "Ya existe un sillón con ese nombre.",
    });
    apiRequestMock.mockResolvedValueOnce([BOX_A]).mockRejectedValueOnce(conflicto);
    renderPage();

    await screen.findByRole("cell", { name: "Box A Ficticio" });
    await usuario.click(screen.getByRole("button", { name: "Nuevo sillón" }));
    const dialogo = await screen.findByRole("dialog", { name: "Nuevo sillón" });
    const campoNombre = within(dialogo).getByRole("textbox", { name: "Nombre" });
    await usuario.type(campoNombre, "Box A Ficticio");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    const errorNombre = await within(dialogo).findByRole("textbox", {
      name: "Nombre",
    });
    expect(errorNombre).toHaveAccessibleDescription(
      "Ya existe un sillón con ese nombre.",
    );
    expect(errorNombre).toHaveAttribute("aria-invalid", "true");
    expect(errorNombre).toHaveValue("Box A Ficticio");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
  });
});

describe("/catalogo/sillones — toggle activo con confirmación (4.2)", () => {
  it("desactivar avisa que conserva los turnos, confirma persiste y anuncia", async () => {
    const usuario = userEvent.setup();
    const DESACTIVADO: Sillon = { ...BOX_A, activo: false };
    apiRequestMock
      .mockResolvedValueOnce([BOX_A])
      .mockResolvedValueOnce(DESACTIVADO)
      .mockResolvedValueOnce([DESACTIVADO]);
    renderPage();

    await screen.findByRole("cell", { name: "Box A Ficticio" });
    await usuario.click(screen.getByRole("button", { name: "Desactivar Box A Ficticio" }));
    const dialogo = await screen.findByRole("dialog", {
      name: "Desactivar sillón Box A Ficticio",
    });
    expect(within(dialogo).getByText(/turnos/i)).toBeInTheDocument();
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock.mock.calls[1]).toEqual([
      `/sillones/${BOX_A.id}`,
      { method: "PATCH", body: { activo: false } },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Sillón desactivado.",
    );
  });

  it("cancelar la confirmación no envía ninguna request", async () => {
    const usuario = userEvent.setup();
    apiRequestMock.mockResolvedValueOnce([BOX_A]);
    renderPage();

    await screen.findByRole("cell", { name: "Box A Ficticio" });
    await usuario.click(screen.getByRole("button", { name: "Desactivar Box A Ficticio" }));
    const dialogo = await screen.findByRole("dialog", {
      name: "Desactivar sillón Box A Ficticio",
    });
    await usuario.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("activar pide confirmación y persiste activo true", async () => {
    const usuario = userEvent.setup();
    const ACTIVADO: Sillon = { ...BOX_B, activo: true };
    apiRequestMock
      .mockResolvedValueOnce([BOX_A, BOX_B])
      .mockResolvedValueOnce(ACTIVADO)
      .mockResolvedValueOnce([BOX_A, ACTIVADO]);
    renderPage();

    await screen.findByRole("cell", { name: "Box B Ficticio" });
    await usuario.click(screen.getByRole("button", { name: "Activar Box B Ficticio" }));
    const dialogo = await screen.findByRole("dialog", {
      name: "Activar sillón Box B Ficticio",
    });
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock.mock.calls[1]).toEqual([
      `/sillones/${BOX_B.id}`,
      { method: "PATCH", body: { activo: true } },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent("Sillón activado.");
  });
});
