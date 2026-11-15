/**
 * RED de 5.1 y 5.2 (C-15) — sección `/catalogo/prestaciones`.
 *
 * `apiRequest` se reemplaza por un doble: las llamadas llegan en orden
 * (`GET /prestaciones` inicial, mutación, `GET` de refresco por
 * invalidación). Datos ficticios. Cubre alta/edición con `duracion_min`
 * validada en cliente (cero, negativa y no numérica bloquean el submit sin
 * request con error accesible), alta válida que confirma y actualiza, 422 del
 * servidor proyectado al campo y `409 duplicate_nombre_prestacion` en el
 * campo `nombre` con `aria-invalid` sin cerrar el formulario.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../services/http";
import type { Prestacion } from "../types/api";
import { ApiError } from "../types/errors";
import PrestacionesPage from "./catalogo-prestaciones";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const LIMPIEZA: Prestacion = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Limpieza Ficticia",
  duracion_min: 30,
  activo: true,
};

const FLUOR: Prestacion = {
  id: "22222222-2222-4222-8222-222222222222",
  nombre: "Flúor Ficticio",
  duracion_min: 15,
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
      <PrestacionesPage />
    </QueryClientProvider>,
  );
}

async function abrirAlta(usuario: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("cell", { name: "Limpieza Ficticia" });
  await usuario.click(screen.getByRole("button", { name: "Nueva prestación" }));
  return screen.findByRole("dialog", { name: "Nueva prestación" });
}

describe("/catalogo/prestaciones — listado (5.1)", () => {
  it("muestra el estado de carga mientras pide la lista", async () => {
    apiRequestMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(await screen.findByLabelText("Cargando resultados")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(String(apiRequestMock.mock.calls[0]?.[0])).toBe(
      "/prestaciones?incluir_inactivos=true",
    );
  });

  it("muestra el estado vacío cuando no hay prestaciones", async () => {
    apiRequestMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("No hay prestaciones.")).toBeInTheDocument();
  });

  it("lista las prestaciones con su nombre, duración y estado", async () => {
    apiRequestMock.mockResolvedValue([LIMPIEZA, FLUOR]);
    renderPage();

    expect(await screen.findByRole("cell", { name: "Limpieza Ficticia" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "30" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Flúor Ficticio" })).toBeInTheDocument();
    expect(apiRequestMock.mock.calls.map(([ruta]) => ruta)).toContain(
      "/prestaciones?incluir_inactivos=true",
    );
  });
});

describe("/catalogo/prestaciones — alta con duración validada (5.1)", () => {
  it("el alta válida confirma y actualiza la tabla", async () => {
    const usuario = userEvent.setup();
    const NUEVA: Prestacion = {
      id: "33333333-3333-4333-8333-333333333333",
      nombre: "Extracción Ficticia",
      duracion_min: 45,
      activo: true,
    };
    apiRequestMock
      .mockResolvedValueOnce([LIMPIEZA])
      .mockResolvedValueOnce(NUEVA)
      .mockResolvedValueOnce([LIMPIEZA, NUEVA]);
    renderPage();

    const dialogo = await abrirAlta(usuario);
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Nombre" }),
      "Extracción Ficticia",
    );
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: /duración/i }),
      "45",
    );
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock.mock.calls[1]).toEqual([
      "/prestaciones",
      { method: "POST", body: { nombre: "Extracción Ficticia", duracion_min: 45 } },
    ]);
    expect(await screen.findByRole("cell", { name: "Extracción Ficticia" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Prestación creada.");
  });

  it.each([["0"], ["-15"]])(
    "la duración %s bloquea el submit sin request con error accesible",
    async (duracion) => {
      const usuario = userEvent.setup();
      apiRequestMock.mockResolvedValueOnce([LIMPIEZA]);
      renderPage();

      const dialogo = await abrirAlta(usuario);
      await usuario.type(
        within(dialogo).getByRole("textbox", { name: "Nombre" }),
        "Limpieza Ficticia",
      );
      await usuario.type(within(dialogo).getByRole("textbox", { name: /duración/i }), duracion);
      await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

      const campo = await within(dialogo).findByRole("textbox", { name: /duración/i });
      expect(campo).toHaveAccessibleDescription("La duración debe ser mayor que cero.");
      expect(campo).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
    },
  );

  it("la duración no numérica bloquea el submit sin request", async () => {
    const usuario = userEvent.setup();
    apiRequestMock.mockResolvedValueOnce([LIMPIEZA]);
    renderPage();

    const dialogo = await abrirAlta(usuario);
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Nombre" }),
      "Limpieza Ficticia",
    );
    await usuario.type(within(dialogo).getByRole("textbox", { name: /duración/i }), "abc");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    const campo = await within(dialogo).findByRole("textbox", { name: /duración/i });
    expect(campo).toHaveAccessibleDescription("La duración debe ser mayor que cero.");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });

  it("el 422 del servidor se proyecta al campo duración sin cerrar el formulario", async () => {
    const usuario = userEvent.setup();
    const invalido = new ApiError({
      kind: "validacion",
      status: 422,
      mensaje: "La request tiene campos inválidos: body.duracion_min: Valor inválido.",
      campos: [{ ubicacion: "body.duracion_min", mensaje: "Valor inválido." }],
    });
    apiRequestMock.mockResolvedValueOnce([LIMPIEZA]).mockRejectedValueOnce(invalido);
    renderPage();

    const dialogo = await abrirAlta(usuario);
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Nombre" }),
      "Limpieza Ficticia",
    );
    await usuario.type(within(dialogo).getByRole("textbox", { name: /duración/i }), "30");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(
      await within(dialogo).findByRole("textbox", { name: /duración/i }),
    ).toHaveAccessibleDescription("Valor inválido.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("la edición exitosa persiste el cambio y anuncia la confirmación", async () => {
    const usuario = userEvent.setup();
    const ACTUALIZADA: Prestacion = { ...LIMPIEZA, duracion_min: 60 };
    apiRequestMock
      .mockResolvedValueOnce([LIMPIEZA])
      .mockResolvedValueOnce(ACTUALIZADA)
      .mockResolvedValueOnce([ACTUALIZADA]);
    renderPage();

    await screen.findByRole("cell", { name: "Limpieza Ficticia" });
    await usuario.click(screen.getByRole("button", { name: "Editar Limpieza Ficticia" }));
    const dialogo = await screen.findByRole("dialog", {
      name: "Editar prestación Limpieza Ficticia",
    });
    const campoDuracion = within(dialogo).getByRole("textbox", { name: /duración/i });
    await usuario.clear(campoDuracion);
    await usuario.type(campoDuracion, "60");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock.mock.calls[1]).toEqual([
      `/prestaciones/${LIMPIEZA.id}`,
      { method: "PATCH", body: { duracion_min: 60 } },
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("Prestación actualizada.");
  });
});

describe("/catalogo/prestaciones — nombre duplicado (5.2)", () => {
  it("el nombre duplicado muestra el error en el campo nombre con aria-invalid sin cerrar", async () => {
    const usuario = userEvent.setup();
    const conflicto = new ApiError({
      kind: "conflicto",
      status: 409,
      causa: "duplicate_nombre_prestacion",
      mensaje: "Ya existe una prestación con ese nombre.",
    });
    apiRequestMock.mockResolvedValueOnce([LIMPIEZA]).mockRejectedValueOnce(conflicto);
    renderPage();

    const dialogo = await abrirAlta(usuario);
    const campoNombre = within(dialogo).getByRole("textbox", { name: "Nombre" });
    await usuario.type(campoNombre, "Limpieza Ficticia");
    await usuario.type(within(dialogo).getByRole("textbox", { name: /duración/i }), "30");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    const errorNombre = await within(dialogo).findByRole("textbox", { name: "Nombre" });
    expect(errorNombre).toHaveAccessibleDescription(
      "Ya existe una prestación con ese nombre.",
    );
    expect(errorNombre).toHaveAttribute("aria-invalid", "true");
    expect(errorNombre).toHaveValue("Limpieza Ficticia");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
  });
});
