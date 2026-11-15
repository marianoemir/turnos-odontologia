/**
 * RED de 7.1 y 7.2 (C-15) — sección `/catalogo/bloqueos`.
 *
 * `apiRequest` se reemplaza por un doble: las llamadas llegan en orden
 * (`GET /profesionales`, `GET /sillones` y `GET /bloqueos` iniciales,
 * mutación, `GET` de refresco por invalidación). Datos ficticios. Cubre el
 * alta con los cuatro alcances (global, profesional, sillón, pareja) con
 * `desde < hasta` y timezone (7.1: el rango invertido bloquea el submit sin
 * request y marca `hasta`), y el listado ordenado por `(desde, id)` con
 * eliminación confirmada (7.2: confirma quita la fila, cancela no llama a la
 * API, 404/422 de recursos van a mensaje).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../services/http";
import type { Bloqueo, Profesional, Sillon } from "../types/api";
import { ApiError } from "../types/errors";
import BloqueosPage from "./catalogo-bloqueos";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const PEREZ: Profesional = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Pérez Ficticia",
  matricula: "MAT-001",
  sucursal_id: null,
  activo: true,
};

const SILLON_A: Sillon = {
  id: "22222222-2222-4222-8222-222222222222",
  nombre: "Sillón A Ficticio",
  sucursal_id: null,
  activo: true,
};

function bloqueo(sobre: Partial<Bloqueo> & { id: string }): Bloqueo {
  return {
    profesional_id: null,
    sillon_id: null,
    desde: "2026-11-20T09:00:00-03:00",
    hasta: "2026-11-20T12:00:00-03:00",
    motivo: "Motivo ficticio",
    ...sobre,
  };
}

const B_GLOBAL = bloqueo({ id: "33333333-3333-4333-8333-333333333333" });

beforeEach(() => {
  apiRequestMock.mockReset();
});
afterEach(cleanup);

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BloqueosPage />
    </QueryClientProvider>,
  );
}

function llamadasDeLectura(): void {
  apiRequestMock
    .mockResolvedValueOnce([PEREZ])
    .mockResolvedValueOnce([SILLON_A])
    .mockResolvedValueOnce([B_GLOBAL]);
}

function rutasLlamadas(): unknown[] {
  return apiRequestMock.mock.calls.map(([ruta]) => ruta);
}

function aIsoLocal(valorDatetimeLocal: string): string {
  return new Date(valorDatetimeLocal).toISOString();
}

async function abrirAlta(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(await screen.findByRole("button", { name: "Nuevo bloqueo" }));
  const dialogo = await screen.findByRole("dialog", { name: "Nuevo bloqueo" });
  await within(dialogo).findByRole("option", { name: "Pérez Ficticia" });
  return dialogo;
}

function completarAlta(
  dialogo: HTMLElement,
  valores: { profesional?: string; sillon?: string; desde: string; hasta: string; motivo: string },
): void {
  fireEvent.change(within(dialogo).getByLabelText("Desde"), {
    target: { value: valores.desde },
  });
  fireEvent.change(within(dialogo).getByLabelText("Hasta"), {
    target: { value: valores.hasta },
  });
  fireEvent.change(within(dialogo).getByLabelText("Motivo"), {
    target: { value: valores.motivo },
  });
}

describe("/catalogo/bloqueos — alta con cuatro alcances (7.1)", () => {
  it.each([
    {
      alcance: "global",
      profesional: "",
      sillon: "",
      cuerpo: { profesional_id: null, sillon_id: null },
    },
    {
      alcance: "profesional",
      profesional: PEREZ.id,
      sillon: "",
      cuerpo: { profesional_id: PEREZ.id, sillon_id: null },
    },
    {
      alcance: "sillón",
      profesional: "",
      sillon: SILLON_A.id,
      cuerpo: { profesional_id: null, sillon_id: SILLON_A.id },
    },
    {
      alcance: "pareja",
      profesional: PEREZ.id,
      sillon: SILLON_A.id,
      cuerpo: { profesional_id: PEREZ.id, sillon_id: SILLON_A.id },
    },
  ])(
    "el alta $alcance confirma, persiste el alcance y actualiza la tabla",
    async ({ profesional, sillon, cuerpo }) => {
      const usuario = userEvent.setup();
      const NUEVO = bloqueo({
        id: "66666666-6666-4666-8666-666666666666",
        ...cuerpo,
        motivo: "Feriado ficticio",
      });
      apiRequestMock
        .mockResolvedValueOnce([PEREZ])
        .mockResolvedValueOnce([SILLON_A])
        .mockResolvedValueOnce([B_GLOBAL])
        .mockResolvedValueOnce(NUEVO)
        .mockResolvedValueOnce([B_GLOBAL, NUEVO]);
      renderPage();

      const dialogo = await abrirAlta(usuario);
      if (profesional !== "") {
        await usuario.selectOptions(
          within(dialogo).getByRole("combobox", { name: "Profesional" }),
          profesional,
        );
      }
      if (sillon !== "") {
        await usuario.selectOptions(
          within(dialogo).getByRole("combobox", { name: "Sillón" }),
          sillon,
        );
      }
      completarAlta(dialogo, {
        desde: "2026-11-21T09:00",
        hasta: "2026-11-21T12:00",
        motivo: "Feriado ficticio",
      });
      await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(apiRequestMock.mock.calls[3]).toEqual([
        "/bloqueos",
        {
          method: "POST",
          body: {
            ...cuerpo,
            desde: aIsoLocal("2026-11-21T09:00"),
            hasta: aIsoLocal("2026-11-21T12:00"),
            motivo: "Feriado ficticio",
          },
        },
      ]);
      expect(await screen.findByRole("cell", { name: "Feriado ficticio" })).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Bloqueo creado.");
    },
  );

  it("el rango invertido bloquea el submit sin request y marca hasta", async () => {
    const usuario = userEvent.setup();
    llamadasDeLectura();
    renderPage();

    const dialogo = await abrirAlta(usuario);
    completarAlta(dialogo, {
      desde: "2026-11-21T12:00",
      hasta: "2026-11-21T09:00",
      motivo: "Feriado ficticio",
    });
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    const campoHasta = await within(dialogo).findByLabelText("Hasta");
    expect(campoHasta).toHaveAccessibleDescription(
      "El fin debe ser posterior al inicio.",
    );
    expect(campoHasta).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(3);
  });

  it("el profesional inexistente (404) muestra mensaje sin cerrar", async () => {
    const usuario = userEvent.setup();
    const noEncontrado = new ApiError({
      kind: "no_encontrado",
      status: 404,
      mensaje: `Profesional ${PEREZ.id} no encontrado`,
    });
    apiRequestMock
      .mockResolvedValueOnce([PEREZ])
      .mockResolvedValueOnce([SILLON_A])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(noEncontrado);
    renderPage();

    const dialogo = await abrirAlta(usuario);
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Profesional" }),
      PEREZ.id,
    );
    completarAlta(dialogo, {
      desde: "2026-11-21T09:00",
      hasta: "2026-11-21T12:00",
      motivo: "Feriado ficticio",
    });
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "El profesional no existe.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("el sillón inactivo (422) muestra mensaje sin cerrar", async () => {
    const usuario = userEvent.setup();
    const inactivo = new ApiError({
      kind: "validacion",
      status: 422,
      mensaje: "Sillón inactivo",
    });
    apiRequestMock
      .mockResolvedValueOnce([PEREZ])
      .mockResolvedValueOnce([SILLON_A])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(inactivo);
    renderPage();

    const dialogo = await abrirAlta(usuario);
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Sillón" }),
      SILLON_A.id,
    );
    completarAlta(dialogo, {
      desde: "2026-11-21T09:00",
      hasta: "2026-11-21T12:00",
      motivo: "Feriado ficticio",
    });
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "El sillón está inactivo.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("/catalogo/bloqueos — listado y eliminación (7.2)", () => {
  it("lista ordenado por (desde, id) y muestra el alcance de cada bloqueo", async () => {
    const B_TARDE = bloqueo({
      id: "44444444-4444-4444-8444-444444444444",
      desde: "2026-11-20T14:00:00-03:00",
      hasta: "2026-11-20T18:00:00-03:00",
      motivo: "Tarde ficticia",
    });
    const B_PAREJA = bloqueo({
      id: "55555555-5555-4555-8555-555555555555",
      profesional_id: PEREZ.id,
      sillon_id: SILLON_A.id,
      motivo: "Pareja ficticia",
    });
    apiRequestMock
      .mockResolvedValueOnce([PEREZ])
      .mockResolvedValueOnce([SILLON_A])
      .mockResolvedValueOnce([B_TARDE, B_GLOBAL, B_PAREJA]);
    renderPage();

    const celdas = await screen.findAllByRole("cell", { name: "Motivo ficticio" });
    expect(celdas).toHaveLength(1);
    const filas = screen.getAllByRole("row");
    // Encabezado + 3 filas ordenadas por (desde, id): global, pareja, tarde.
    expect(filas).toHaveLength(4);
    expect(within(filas[1]).getByRole("cell", { name: "Motivo ficticio" })).toBeInTheDocument();
    expect(within(filas[2]).getByRole("cell", { name: "Pareja ficticia" })).toBeInTheDocument();
    expect(within(filas[3]).getByRole("cell", { name: "Tarde ficticia" })).toBeInTheDocument();
    expect(rutasLlamadas()).toContain("/bloqueos");
  });

  it("eliminar pide confirmación, confirma quita la fila y anuncia", async () => {
    const usuario = userEvent.setup();
    llamadasDeLectura();
    apiRequestMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce([]);
    renderPage();

    await screen.findByRole("cell", { name: "Motivo ficticio" });
    await usuario.click(
      screen.getByRole("button", { name: "Eliminar Motivo ficticio" }),
    );
    const dialogo = await screen.findByRole("dialog", { name: "Eliminar bloqueo" });
    expect(
      within(dialogo).getByText("Esta acción no se puede deshacer.", { exact: false }),
    ).toBeInTheDocument();

    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock.mock.calls[3]).toEqual([`/bloqueos/${B_GLOBAL.id}`, { method: "DELETE" }]);
    await waitFor(() =>
      expect(screen.queryByRole("cell", { name: "Motivo ficticio" })).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Bloqueo eliminado.")).toBeInTheDocument();
  });

  it("cancelar la eliminación no llama a la API y conserva la fila", async () => {
    const usuario = userEvent.setup();
    llamadasDeLectura();
    renderPage();

    await screen.findByRole("cell", { name: "Motivo ficticio" });
    await usuario.click(
      screen.getByRole("button", { name: "Eliminar Motivo ficticio" }),
    );
    const dialogo = await screen.findByRole("dialog", { name: "Eliminar bloqueo" });
    await usuario.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("cell", { name: "Motivo ficticio" })).toBeInTheDocument();
  });

  it("el bloqueo inexistente (404) muestra mensaje sin cerrar", async () => {
    const usuario = userEvent.setup();
    const noEncontrado = new ApiError({
      kind: "no_encontrado",
      status: 404,
      mensaje: `Bloqueo ${B_GLOBAL.id} no encontrado`,
    });
    llamadasDeLectura();
    apiRequestMock.mockRejectedValueOnce(noEncontrado);
    renderPage();

    await screen.findByRole("cell", { name: "Motivo ficticio" });
    await usuario.click(
      screen.getByRole("button", { name: "Eliminar Motivo ficticio" }),
    );
    const dialogo = await screen.findByRole("dialog", { name: "Eliminar bloqueo" });
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "El bloqueo ya no existe.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Motivo ficticio" })).toBeInTheDocument();
  });
});
