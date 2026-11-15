/**
 * RED de 6.1 y 6.2 (C-15) — sección `/catalogo/horarios`.
 *
 * `apiRequest` se reemplaza por un doble: las llamadas llegan en orden
 * (`GET /profesionales` y `GET /horarios-atencion` iniciales, mutación, `GET`
 * de refresco por invalidación). Datos ficticios. Cubre el editor por
 * profesional y día sobre una sola query con filtro en cliente (6.1: rango
 * invertido bloquea el submit sin request y marca `hasta`; alta válida que
 * confirma y actualiza) y el mapeo de errores del backend (6.2: 409
 * `solape_horario` como error del formulario conservando valores en alta y
 * `PATCH`, 404 de profesional inexistente y 422 de profesional inactivo).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../services/http";
import type { HorarioAtencion, Profesional } from "../types/api";
import { ApiError } from "../types/errors";
import HorariosPage from "./catalogo-horarios";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const PEREZ: Profesional = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Pérez Ficticia",
  matricula: "MAT-001",
  sucursal_id: null,
  activo: true,
};

const GOMEZ: Profesional = {
  id: "22222222-2222-4222-8222-222222222222",
  nombre: "Gómez Ficticio",
  matricula: "MAT-002",
  sucursal_id: null,
  activo: true,
};

const H_LUNES: HorarioAtencion = {
  id: "33333333-3333-4333-8333-333333333333",
  profesional_id: PEREZ.id,
  dia_semana: 0,
  desde: "09:00:00",
  hasta: "12:00:00",
  activo: true,
};

const H_MARTES: HorarioAtencion = {
  id: "44444444-4444-4444-8444-444444444444",
  profesional_id: PEREZ.id,
  dia_semana: 1,
  desde: "14:00:00",
  hasta: "18:00:00",
  activo: true,
};

const H_GOMEZ: HorarioAtencion = {
  id: "55555555-5555-4555-8555-555555555555",
  profesional_id: GOMEZ.id,
  dia_semana: 0,
  desde: "08:00:00",
  hasta: "11:00:00",
  activo: true,
};

beforeEach(() => {
  apiRequestMock.mockReset();
});
afterEach(cleanup);

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <HorariosPage />
    </QueryClientProvider>,
  );
}

function rutasLlamadas(): unknown[] {
  return apiRequestMock.mock.calls.map(([ruta]) => ruta);
}

async function abrirAlta(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(await screen.findByRole("button", { name: "Nuevo horario" }));
  const dialogo = await screen.findByRole("dialog", { name: "Nuevo horario" });
  await within(dialogo).findByRole("option", { name: "Pérez Ficticia" });
  return dialogo;
}

function completarRango(dialogo: HTMLElement, desde: string, hasta: string): void {
  fireEvent.change(within(dialogo).getByLabelText("Desde"), { target: { value: desde } });
  fireEvent.change(within(dialogo).getByLabelText("Hasta"), { target: { value: hasta } });
}

describe("/catalogo/horarios — listado con filtro en cliente (6.1)", () => {
  it("muestra el estado de carga mientras pide profesionales y horarios", async () => {
    apiRequestMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(await screen.findByLabelText("Cargando resultados")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
    expect(rutasLlamadas()).toContain("/profesionales?incluir_inactivos=true");
    expect(rutasLlamadas()).toContain("/horarios-atencion?incluir_inactivos=true");
  });

  it("muestra el estado vacío cuando no hay horarios", async () => {
    apiRequestMock
      .mockResolvedValueOnce([PEREZ, GOMEZ])
      .mockResolvedValueOnce([]);
    renderPage();

    expect(await screen.findByText("No hay horarios.")).toBeInTheDocument();
  });

  it("lista los horarios y el filtro por profesional no dispara requests", async () => {
    const usuario = userEvent.setup();
    apiRequestMock
      .mockResolvedValueOnce([PEREZ, GOMEZ])
      .mockResolvedValueOnce([H_LUNES, H_MARTES, H_GOMEZ]);
    renderPage();

    await screen.findByRole("cell", { name: "Gómez Ficticio" });
    expect(screen.getAllByRole("cell", { name: "Pérez Ficticia" })).toHaveLength(2);
    expect(screen.getByRole("cell", { name: "Gómez Ficticio" })).toBeInTheDocument();

    await usuario.selectOptions(
      screen.getByRole("combobox", { name: "Profesional" }),
      GOMEZ.id,
    );

    await waitFor(() =>
      expect(screen.queryByRole("cell", { name: "Pérez Ficticia" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("cell", { name: "Gómez Ficticio" })).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
  });
});

describe("/catalogo/horarios — editor con rango validado (6.1)", () => {
  it("el rango invertido bloquea el submit sin request y marca hasta", async () => {
    const usuario = userEvent.setup();
    apiRequestMock
      .mockResolvedValueOnce([PEREZ, GOMEZ])
      .mockResolvedValueOnce([H_LUNES]);
    renderPage();

    const dialogo = await abrirAlta(usuario);
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Profesional" }),
      PEREZ.id,
    );
    completarRango(dialogo, "12:00", "09:00");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    const campoHasta = await within(dialogo).findByLabelText("Hasta");
    expect(campoHasta).toHaveAccessibleDescription(
      "La hora hasta debe ser posterior a desde.",
    );
    expect(campoHasta).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
  });

  it("el alta válida confirma y actualiza la tabla", async () => {
    const usuario = userEvent.setup();
    const NUEVO: HorarioAtencion = {
      id: "66666666-6666-4666-8666-666666666666",
      profesional_id: PEREZ.id,
      dia_semana: 2,
      desde: "09:00:00",
      hasta: "12:00:00",
      activo: true,
    };
    apiRequestMock
      .mockResolvedValueOnce([PEREZ, GOMEZ])
      .mockResolvedValueOnce([H_LUNES])
      .mockResolvedValueOnce(NUEVO)
      .mockResolvedValueOnce([H_LUNES, NUEVO]);
    renderPage();

    const dialogo = await abrirAlta(usuario);
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Profesional" }),
      PEREZ.id,
    );
    await usuario.selectOptions(within(dialogo).getByRole("combobox", { name: "Día" }), "2");
    completarRango(dialogo, "09:00", "12:00");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock.mock.calls[2]).toEqual([
      "/horarios-atencion",
      {
        method: "POST",
        body: {
          profesional_id: PEREZ.id,
          dia_semana: 2,
          desde: "09:00:00",
          hasta: "12:00:00",
        },
      },
    ]);
    expect(await screen.findByRole("cell", { name: "Miércoles" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Horario creado.");
  });

  it("la edición exitosa persiste el cambio y anuncia la confirmación", async () => {
    const usuario = userEvent.setup();
    const ACTUALIZADO: HorarioAtencion = { ...H_LUNES, hasta: "13:00:00" };
    apiRequestMock
      .mockResolvedValueOnce([PEREZ])
      .mockResolvedValueOnce([H_LUNES])
      .mockResolvedValueOnce(ACTUALIZADO)
      .mockResolvedValueOnce([ACTUALIZADO]);
    renderPage();

    await screen.findByRole("cell", { name: "Pérez Ficticia" });
    await usuario.click(
      screen.getByRole("button", { name: "Editar Pérez Ficticia Lunes" }),
    );
    const dialogo = await screen.findByRole("dialog", {
      name: "Editar horario de Pérez Ficticia",
    });
    completarRango(dialogo, "09:00", "13:00");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiRequestMock.mock.calls[2]).toEqual([
      `/horarios-atencion/${H_LUNES.id}`,
      { method: "PATCH", body: { hasta: "13:00:00" } },
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("Horario actualizado.");
  });
});

describe("/catalogo/horarios — errores del backend (6.2)", () => {
  it("el solape en el alta muestra el detalle sin cerrar ni perder datos", async () => {
    const usuario = userEvent.setup();
    const solape = new ApiError({
      kind: "conflicto",
      status: 409,
      causa: "solape_horario",
      mensaje: "Conflicto de horario.",
      detalle: "Se solapa con el horario de 09:00 a 12:00.",
    });
    apiRequestMock
      .mockResolvedValueOnce([PEREZ])
      .mockResolvedValueOnce([H_LUNES])
      .mockRejectedValueOnce(solape);
    renderPage();

    const dialogo = await abrirAlta(usuario);
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Profesional" }),
      PEREZ.id,
    );
    completarRango(dialogo, "10:00", "13:00");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    const campoHasta = await within(dialogo).findByLabelText("Hasta");
    expect(campoHasta).toHaveAccessibleDescription(
      "Se solapa con el horario de 09:00 a 12:00.",
    );
    expect(campoHasta).toHaveAttribute("aria-invalid", "true");
    expect(within(dialogo).getByLabelText("Desde")).toHaveValue("10:00");
    expect(campoHasta).toHaveValue("13:00");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(3);
  });

  it("el solape en la edición conserva los valores sin cerrar", async () => {
    const usuario = userEvent.setup();
    const solape = new ApiError({
      kind: "conflicto",
      status: 409,
      causa: "solape_horario",
      mensaje: "Conflicto de horario.",
      detalle: "Se solapa con otro horario del profesional.",
    });
    apiRequestMock
      .mockResolvedValueOnce([PEREZ])
      .mockResolvedValueOnce([H_LUNES, H_MARTES])
      .mockRejectedValueOnce(solape);
    renderPage();

    await screen.findByRole("button", { name: "Editar Pérez Ficticia Lunes" });
    await usuario.click(
      screen.getByRole("button", { name: "Editar Pérez Ficticia Lunes" }),
    );
    const dialogo = await screen.findByRole("dialog", {
      name: "Editar horario de Pérez Ficticia",
    });
    completarRango(dialogo, "09:00", "15:00");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(await within(dialogo).findByText("Se solapa con otro horario del profesional."))
      .toBeInTheDocument();
    expect(within(dialogo).getByLabelText("Desde")).toHaveValue("09:00");
    expect(within(dialogo).getByLabelText("Hasta")).toHaveValue("15:00");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
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
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(noEncontrado);
    renderPage();

    const dialogo = await abrirAlta(usuario);
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Profesional" }),
      PEREZ.id,
    );
    completarRango(dialogo, "09:00", "12:00");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "El profesional no existe.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("el profesional inactivo (422) muestra mensaje sin cerrar", async () => {
    const usuario = userEvent.setup();
    const inactivo = new ApiError({
      kind: "validacion",
      status: 422,
      mensaje: "Profesional inactivo",
    });
    apiRequestMock
      .mockResolvedValueOnce([PEREZ])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(inactivo);
    renderPage();

    const dialogo = await abrirAlta(usuario);
    await usuario.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Profesional" }),
      PEREZ.id,
    );
    completarRango(dialogo, "09:00", "12:00");
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "El profesional está inactivo.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
