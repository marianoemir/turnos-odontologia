import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routes } from "../app/router";
import { SessionProvider } from "../auth/session-context";
import { clearSession, setSession } from "../auth/session";
import { apiRequest } from "../services/http";
import { ApiError } from "../types/errors";

vi.mock("../services/http", () => ({
  apiRequest: vi.fn(),
}));

const UUID = "550e8400-e29b-41d4-a716-446655440000";

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function renderHc(path: string): void {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient();
  render(
    <SessionProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </SessionProvider>,
  );
}

function mockHcExitoso(uuid: string): void {
  vi.mocked(apiRequest).mockImplementation((ruta: string) => {
    if (ruta === `/pacientes/${uuid}/historia-clinica`) {
      return Promise.resolve({
        id: "hc-1",
        paciente_id: uuid,
        antecedentes: null,
        alergias: null,
        observaciones: null,
        creado_en: "2026-01-01T10:00:00Z",
      });
    }
    if (
      ruta === `/pacientes/${uuid}/odontograma` ||
      ruta === `/pacientes/${uuid}/planes-tratamiento`
    ) {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  setSession({
    token: "jwt-de-prueba",
    rol: "recepcion",
    usuario: "usuario-ficticio",
    sucursalId: null,
  });
  vi.mocked(apiRequest).mockReset();
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("historia clínica", () => {
  it("Ruta directa con paciente identificado", async () => {
    mockHcExitoso(UUID);
    renderHc(`/hc/${UUID}`);

    expect(
      await screen.findByRole("heading", { name: "Historia clínica" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(new RegExp(UUID))).toBeInTheDocument();

    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(apiRequest).toHaveBeenCalledWith(
      `/pacientes/${UUID}/historia-clinica`,
      expect.any(Object),
    );
    expect(apiRequest).toHaveBeenCalledWith(
      `/pacientes/${UUID}/odontograma`,
      expect.any(Object),
    );
    expect(apiRequest).toHaveBeenCalledWith(
      `/pacientes/${UUID}/planes-tratamiento`,
      expect.any(Object),
    );
  });

  it("Identificador inválido no dispara consultas", async () => {
    renderHc("/hc/abc");

    expect(
      await screen.findByRole("heading", { name: "Historia clínica" }),
    ).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
    expect(
      screen.getByText(/identificador de paciente inválido/i),
    ).toBeInTheDocument();
  });

  it("Paciente inexistente informado por backend", async () => {
    const detalle = `paciente no existe: ${UUID}`;
    vi.mocked(apiRequest).mockImplementation((ruta: string) => {
      if (ruta === `/pacientes/${UUID}/historia-clinica`) {
        return Promise.reject(
          new ApiError({
            kind: "no_encontrado",
            status: 404,
            mensaje: detalle,
            detalle,
          }),
        );
      }
      if (
        ruta === `/pacientes/${UUID}/odontograma` ||
        ruta === `/pacientes/${UUID}/planes-tratamiento`
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    renderHc(`/hc/${UUID}`);

    expect(
      await screen.findByText(/paciente inexistente/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /crear/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/crear historia/i)).not.toBeInTheDocument();

    const hcCalls = vi
      .mocked(apiRequest)
      .mock.calls.filter(([ruta]) => ruta === `/pacientes/${UUID}/historia-clinica`);
    const odCalls = vi
      .mocked(apiRequest)
      .mock.calls.filter(([ruta]) => ruta === `/pacientes/${UUID}/odontograma`);
    const plCalls = vi
      .mocked(apiRequest)
      .mock.calls.filter(
        ([ruta]) => ruta === `/pacientes/${UUID}/planes-tratamiento`,
      );
    expect(hcCalls).toHaveLength(1);
    expect(odCalls).toHaveLength(1);
    expect(plCalls).toHaveLength(1);
  });

  it("Recepción accede a la ruta de historia clínica", async () => {
    mockHcExitoso(UUID);
    renderHc(`/hc/${UUID}`);

    expect(
      await screen.findByRole("heading", { name: "Historia clínica" }),
    ).toBeInTheDocument();
  });

  it("Rol sin permiso es redirigido a Agenda", async () => {
    setSession({
      token: "jwt-de-prueba",
      rol: "odontologo",
      usuario: "odontologo-ficticio",
      sucursalId: null,
    });
    renderHc(`/hc/${UUID}`);

    expect(
      await screen.findByRole("heading", { name: "Agenda" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Permiso insuficiente.",
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("Respuesta 403 del backend se trata como restricción informada", async () => {
    vi.mocked(apiRequest).mockImplementation((ruta: string) => {
      if (ruta === `/pacientes/${UUID}/historia-clinica`) {
        return Promise.resolve({
          id: "hc-1",
          paciente_id: UUID,
          antecedentes: null,
          alergias: null,
          observaciones: null,
          creado_en: "2026-01-01T10:00:00Z",
        });
      }
      if (ruta === `/pacientes/${UUID}/odontograma`) {
        return Promise.reject(
          new ApiError({
            kind: "permiso",
            status: 403,
            mensaje: "Permiso insuficiente.",
            detalle: "Permiso insuficiente.",
          }),
        );
      }
      if (ruta === `/pacientes/${UUID}/planes-tratamiento`) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    renderHc(`/hc/${UUID}`);

    expect(
      await screen.findByRole("heading", { name: "Historia clínica" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(new RegExp(UUID))).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Acceso denegado.",
    );

    const odCalls = vi
      .mocked(apiRequest)
      .mock.calls.filter(([ruta]) => ruta === `/pacientes/${UUID}/odontograma`);
    expect(odCalls).toHaveLength(1);
  });

  it("Paciente con historia clínica existente muestra cabecera", async () => {
    vi.mocked(apiRequest).mockImplementation((ruta: string) => {
      if (ruta === `/pacientes/${UUID}/historia-clinica`) {
        return Promise.resolve({
          id: "hc-1",
          paciente_id: UUID,
          antecedentes: "Hipertensión controlada",
          alergias: "Penicilina",
          observaciones: "Control semestral",
          creado_en: "2026-01-01T10:00:00Z",
        });
      }
      if (
        ruta === `/pacientes/${UUID}/odontograma` ||
        ruta === `/pacientes/${UUID}/planes-tratamiento`
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    renderHc(`/hc/${UUID}`);

    expect(
      await screen.findByRole("heading", { name: "Historia clínica" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Hipertensión controlada")).toBeInTheDocument();
    expect(screen.getByText("Penicilina")).toBeInTheDocument();
    expect(screen.getByText("Control semestral")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Editar cabecera" }),
    ).toBeInTheDocument();
  });

  it("Paciente existente sin historia clínica permite creación", async () => {
    const user = userEvent.setup();
    const detalle = `historia clinica no existe para paciente: ${UUID}`;
    let hcCreada = false;
    vi.mocked(apiRequest).mockImplementation((ruta: string, options?: unknown) => {
      const metodo = (options as { method?: string } | undefined)?.method ?? "GET";
      if (ruta === `/pacientes/${UUID}/historia-clinica` && metodo === "GET") {
        if (hcCreada) {
          return Promise.resolve({
            id: "hc-nueva",
            paciente_id: UUID,
            antecedentes: "Sin antecedentes",
            alergias: "Ninguna",
            observaciones: "Primera visita",
            creado_en: "2026-01-02T10:00:00Z",
          });
        }
        return Promise.reject(
          new ApiError({
            kind: "no_encontrado",
            status: 404,
            mensaje: detalle,
            detalle,
          }),
        );
      }
      if (ruta === "/historias-clinicas" && metodo === "POST") {
        hcCreada = true;
        return Promise.resolve({
          id: "hc-nueva",
          paciente_id: UUID,
          antecedentes: "Sin antecedentes",
          alergias: "Ninguna",
          observaciones: "Primera visita",
          creado_en: "2026-01-02T10:00:00Z",
        });
      }
      if (
        ruta === `/pacientes/${UUID}/odontograma` ||
        ruta === `/pacientes/${UUID}/planes-tratamiento`
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    renderHc(`/hc/${UUID}`);

    expect(
      await screen.findByRole("button", { name: "Crear historia clínica" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No se pudo cargar la historia clínica"),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Antecedentes"), "Sin antecedentes");
    await user.type(screen.getByLabelText("Alergias"), "Ninguna");
    await user.type(screen.getByLabelText("Observaciones"), "Primera visita");
    await user.click(screen.getByRole("button", { name: "Crear historia clínica" }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith("/historias-clinicas", {
        method: "POST",
        body: {
          paciente_id: UUID,
          antecedentes: "Sin antecedentes",
          alergias: "Ninguna",
          observaciones: "Primera visita",
        },
      });
    });
    expect(await screen.findByText("Sin antecedentes")).toBeInTheDocument();
    expect(screen.getByText("Ninguna")).toBeInTheDocument();
    expect(screen.getByText("Primera visita")).toBeInTheDocument();
  });

  it("Respuesta 404 sin detalle reconocible no ofrece crear historia", async () => {
    vi.mocked(apiRequest).mockImplementation((ruta: string) => {
      if (ruta === `/pacientes/${UUID}/historia-clinica`) {
        return Promise.reject(
          new ApiError({
            kind: "no_encontrado",
            status: 404,
            mensaje: "Recurso no encontrado.",
            detalle: "recurso no encontrado",
          }),
        );
      }
      if (
        ruta === `/pacientes/${UUID}/odontograma` ||
        ruta === `/pacientes/${UUID}/planes-tratamiento`
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    renderHc(`/hc/${UUID}`);

    expect(
      await screen.findByText("No se pudo cargar la historia clínica"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Crear historia clínica" }),
    ).not.toBeInTheDocument();

    await esperar(1500);
    const hcCalls = vi
      .mocked(apiRequest)
      .mock.calls.filter(([ruta]) => ruta === `/pacientes/${UUID}/historia-clinica`);
    expect(hcCalls).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Crear historia clínica" }),
    ).not.toBeInTheDocument();
  });

  it("Edición parcial de cabecera actualiza solo los campos enviados (sin escenario en la spec)", async () => {
    const user = userEvent.setup();
    let hcActualizada = false;
    vi.mocked(apiRequest).mockImplementation((ruta: string, options?: unknown) => {
      const metodo = (options as { method?: string } | undefined)?.method ?? "GET";
      if (ruta === `/pacientes/${UUID}/historia-clinica` && metodo === "GET") {
        if (hcActualizada) {
          return Promise.resolve({
            id: "hc-1",
            paciente_id: UUID,
            antecedentes: "Actualizado",
            alergias: "Ninguna",
            observaciones: "Sin cambios",
            creado_en: "2026-01-01T10:00:00Z",
          });
        }
        return Promise.resolve({
          id: "hc-1",
          paciente_id: UUID,
          antecedentes: "Previo",
          alergias: "Ninguna",
          observaciones: "Sin cambios",
          creado_en: "2026-01-01T10:00:00Z",
        });
      }
      if (ruta === "/historias-clinicas/hc-1" && metodo === "PATCH") {
        hcActualizada = true;
        return Promise.resolve({
          id: "hc-1",
          paciente_id: UUID,
          antecedentes: "Actualizado",
          alergias: "Ninguna",
          observaciones: "Sin cambios",
          creado_en: "2026-01-01T10:00:00Z",
        });
      }
      if (
        ruta === `/pacientes/${UUID}/odontograma` ||
        ruta === `/pacientes/${UUID}/planes-tratamiento`
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    renderHc(`/hc/${UUID}`);

    expect(await screen.findByText("Previo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar cabecera" }));
    const inputAntecedentes = await screen.findByLabelText("Antecedentes");
    await user.clear(inputAntecedentes);
    await user.type(inputAntecedentes, "Actualizado");
    await user.click(screen.getByRole("button", { name: "Guardar cabecera" }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith("/historias-clinicas/hc-1", {
        method: "PATCH",
        body: { antecedentes: "Actualizado" },
      });
    });
    expect(await screen.findByText("Actualizado")).toBeInTheDocument();
    expect(screen.queryByText("Previo")).not.toBeInTheDocument();
  });

  it("Conflicto de historia duplicada al crear cabecera", async () => {
    const user = userEvent.setup();
    const detalleGet = `historia clinica no existe para paciente: ${UUID}`;
    vi.mocked(apiRequest).mockImplementation((ruta: string, options?: unknown) => {
      const metodo = (options as { method?: string } | undefined)?.method ?? "GET";
      if (ruta === `/pacientes/${UUID}/historia-clinica` && metodo === "GET") {
        return Promise.reject(
          new ApiError({
            kind: "no_encontrado",
            status: 404,
            mensaje: detalleGet,
            detalle: detalleGet,
          }),
        );
      }
      if (ruta === "/historias-clinicas" && metodo === "POST") {
        return Promise.reject(
          new ApiError({
            kind: "conflicto",
            status: 409,
            mensaje: "historia clinica duplicada",
            causa: "historia_clinica_duplicada",
            detalle: "historia clinica duplicada",
          }),
        );
      }
      if (
        ruta === `/pacientes/${UUID}/odontograma` ||
        ruta === `/pacientes/${UUID}/planes-tratamiento`
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    renderHc(`/hc/${UUID}`);

    expect(
      await screen.findByRole("button", { name: "Crear historia clínica" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Antecedentes"), "Dato previo");
    await user.click(screen.getByRole("button", { name: "Crear historia clínica" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "historia clinica duplicada",
    );
    await esperar(1500);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "historia clinica duplicada",
    );
    expect(screen.getByLabelText("Antecedentes")).toHaveValue("Dato previo");
    expect(
      screen.getByRole("button", { name: "Crear historia clínica" }),
    ).toBeInTheDocument();

    const postCalls = vi
      .mocked(apiRequest)
      .mock.calls.filter(
        ([ruta, options]) =>
          ruta === "/historias-clinicas" &&
          (options as { method?: string } | undefined)?.method === "POST",
      );
    expect(postCalls).toHaveLength(1);
  });

  it("Error de validación al actualizar cabecera preserva valores anteriores", async () => {
    const user = userEvent.setup();
    let fase: "ok" | "422-string" | "422-lista" = "ok";
    vi.mocked(apiRequest).mockImplementation((ruta: string, options?: unknown) => {
      const metodo = (options as { method?: string } | undefined)?.method ?? "GET";
      if (ruta === `/pacientes/${UUID}/historia-clinica` && metodo === "GET") {
        return Promise.resolve({
          id: "hc-1",
          paciente_id: UUID,
          antecedentes: "Valor anterior",
          alergias: "Sin alergias",
          observaciones: "Observación previa",
          creado_en: "2026-01-01T10:00:00Z",
        });
      }
      if (ruta === "/historias-clinicas/hc-1" && metodo === "PATCH") {
        if (fase === "422-string") {
          return Promise.reject(
            new ApiError({
              kind: "validacion",
              status: 422,
              mensaje: "registro clínico inválido",
              detalle: "registro clínico inválido",
            }),
          );
        }
        if (fase === "422-lista") {
          return Promise.reject(
            new ApiError({
              kind: "validacion",
              status: 422,
              mensaje: "body.antecedentes: valor inválido",
              detalle: "",
              campos: [{ ubicacion: "body.antecedentes", mensaje: "valor inválido" }],
            }),
          );
        }
        return Promise.resolve({
          id: "hc-1",
          paciente_id: UUID,
          antecedentes: "Valor anterior",
          alergias: "Sin alergias",
          observaciones: "Observación previa",
          creado_en: "2026-01-01T10:00:00Z",
        });
      }
      if (
        ruta === `/pacientes/${UUID}/odontograma` ||
        ruta === `/pacientes/${UUID}/planes-tratamiento`
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    renderHc(`/hc/${UUID}`);

    expect(await screen.findByText("Valor anterior")).toBeInTheDocument();
    expect(screen.getByText("Sin alergias")).toBeInTheDocument();
    expect(screen.getByText("Observación previa")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar cabecera" }));
    let input = await screen.findByLabelText("Antecedentes");
    await user.clear(input);
    await user.type(input, "Intento inválido string");
    fase = "422-string";
    await user.click(screen.getByRole("button", { name: "Guardar cabecera" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "registro clínico inválido",
    );
    expect(screen.getByText("Valor anterior")).toBeInTheDocument();
    expect(screen.getByText("Sin alergias")).toBeInTheDocument();
    expect(screen.getByText("Observación previa")).toBeInTheDocument();
    expect(screen.queryByText("Intento inválido string")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar cabecera" }));
    input = await screen.findByLabelText("Antecedentes");
    await user.clear(input);
    await user.type(input, "Intento inválido lista");
    fase = "422-lista";
    await user.click(screen.getByRole("button", { name: "Guardar cabecera" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "body.antecedentes: valor inválido",
    );
    expect(screen.getByText("Valor anterior")).toBeInTheDocument();
    expect(screen.getByText("Sin alergias")).toBeInTheDocument();
    expect(screen.getByText("Observación previa")).toBeInTheDocument();
    expect(screen.queryByText("Intento inválido lista")).not.toBeInTheDocument();
  });

  it("Conflicto de negocio informado no dispara reintento automático", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest).mockImplementation((ruta: string, options?: unknown) => {
      const metodo = (options as { method?: string } | undefined)?.method ?? "GET";
      if (ruta === `/pacientes/${UUID}/historia-clinica` && metodo === "GET") {
        return Promise.resolve({
          id: "hc-1",
          paciente_id: UUID,
          antecedentes: "Valor confirmado",
          alergias: "Ninguna",
          observaciones: "Obs",
          creado_en: "2026-01-01T10:00:00Z",
        });
      }
      if (ruta === "/historias-clinicas/hc-1" && metodo === "PATCH") {
        return Promise.reject(
          new ApiError({
            kind: "conflicto",
            status: 409,
            mensaje: "Conflicto de negocio informado",
            detalle: "Conflicto de negocio informado",
          }),
        );
      }
      if (
        ruta === `/pacientes/${UUID}/odontograma` ||
        ruta === `/pacientes/${UUID}/planes-tratamiento`
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    renderHc(`/hc/${UUID}`);

    expect(await screen.findByText("Valor confirmado")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar cabecera" }));
    const input = await screen.findByLabelText("Antecedentes");
    await user.clear(input);
    await user.type(input, "Cambio");
    await user.click(screen.getByRole("button", { name: "Guardar cabecera" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Conflicto de negocio informado",
    );
    await esperar(1500);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Conflicto de negocio informado",
    );
    expect(screen.getByText("Valor confirmado")).toBeInTheDocument();

    const patchCalls = vi
      .mocked(apiRequest)
      .mock.calls.filter(
        ([ruta, options]) =>
          ruta === "/historias-clinicas/hc-1" &&
          (options as { method?: string } | undefined)?.method === "PATCH",
      );
    expect(patchCalls).toHaveLength(1);
  });

  it("Crear historia clínica en vuelo deshabilita el control y no emite otra request", async () => {
    const user = userEvent.setup();
    const detalleGet = `historia clinica no existe para paciente: ${UUID}`;
    let resolverPost: ((valor: unknown) => void) | null = null;
    vi.mocked(apiRequest).mockImplementation((ruta: string, options?: unknown) => {
      const metodo = (options as { method?: string } | undefined)?.method ?? "GET";
      if (ruta === `/pacientes/${UUID}/historia-clinica` && metodo === "GET") {
        return Promise.reject(
          new ApiError({
            kind: "no_encontrado",
            status: 404,
            mensaje: detalleGet,
            detalle: detalleGet,
          }),
        );
      }
      if (ruta === "/historias-clinicas" && metodo === "POST") {
        return new Promise((resolve) => {
          resolverPost = resolve;
        });
      }
      if (
        ruta === `/pacientes/${UUID}/odontograma` ||
        ruta === `/pacientes/${UUID}/planes-tratamiento`
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    renderHc(`/hc/${UUID}`);

    const boton = await screen.findByRole("button", { name: "Crear historia clínica" });
    await user.click(boton);

    await waitFor(() => {
      expect(boton).toBeDisabled();
    });
    await user.click(boton);

    const postCalls = vi
      .mocked(apiRequest)
      .mock.calls.filter(
        ([ruta, options]) =>
          ruta === "/historias-clinicas" &&
          (options as { method?: string } | undefined)?.method === "POST",
      );
    expect(postCalls).toHaveLength(1);

    if (resolverPost) {
      (resolverPost as (v: unknown) => void)({
        id: "hc-nueva",
        paciente_id: UUID,
        antecedentes: "",
        alergias: "",
        observaciones: "",
        creado_en: "2026-01-02T10:00:00Z",
      });
    }
  });

  it("Guardar cabecera sin cambios no emite PATCH (sin escenario en la spec)", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest).mockImplementation((ruta: string, options?: unknown) => {
      const metodo = (options as { method?: string } | undefined)?.method ?? "GET";
      if (ruta === `/pacientes/${UUID}/historia-clinica` && metodo === "GET") {
        return Promise.resolve({
          id: "hc-1",
          paciente_id: UUID,
          antecedentes: "Previo",
          alergias: "Ninguna",
          observaciones: "Sin cambios",
          creado_en: "2026-01-01T10:00:00Z",
        });
      }
      if (
        ruta === `/pacientes/${UUID}/odontograma` ||
        ruta === `/pacientes/${UUID}/planes-tratamiento`
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    renderHc(`/hc/${UUID}`);

    expect(await screen.findByText("Previo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar cabecera" }));
    expect(await screen.findByLabelText("Antecedentes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Guardar cabecera" }));

    expect(
      await screen.findByRole("button", { name: "Editar cabecera" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    const patchCalls = vi
      .mocked(apiRequest)
      .mock.calls.filter(
        ([ruta, options]) =>
          ruta === "/historias-clinicas/hc-1" &&
          (options as { method?: string } | undefined)?.method === "PATCH",
      );
    expect(patchCalls).toHaveLength(0);
  });

  it("Guardar cabecera en vuelo deshabilita el control y no emite otra request", async () => {
    const user = userEvent.setup();
    let resolverPatch: ((valor: unknown) => void) | null = null;
    vi.mocked(apiRequest).mockImplementation((ruta: string, options?: unknown) => {
      const metodo = (options as { method?: string } | undefined)?.method ?? "GET";
      if (ruta === `/pacientes/${UUID}/historia-clinica` && metodo === "GET") {
        return Promise.resolve({
          id: "hc-1",
          paciente_id: UUID,
          antecedentes: "Previo",
          alergias: "Ninguna",
          observaciones: "Sin cambios",
          creado_en: "2026-01-01T10:00:00Z",
        });
      }
      if (ruta === "/historias-clinicas/hc-1" && metodo === "PATCH") {
        return new Promise((resolve) => {
          resolverPatch = resolve;
        });
      }
      if (
        ruta === `/pacientes/${UUID}/odontograma` ||
        ruta === `/pacientes/${UUID}/planes-tratamiento`
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    renderHc(`/hc/${UUID}`);

    expect(await screen.findByText("Previo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar cabecera" }));
    const inputAntecedentes = await screen.findByLabelText("Antecedentes");
    await user.clear(inputAntecedentes);
    await user.type(inputAntecedentes, "Actualizado");

    const boton = screen.getByRole("button", { name: "Guardar cabecera" });
    await user.click(boton);

    await waitFor(() => {
      expect(boton).toBeDisabled();
    });
    await user.click(boton);

    const patchCalls = vi
      .mocked(apiRequest)
      .mock.calls.filter(
        ([ruta, options]) =>
          ruta === "/historias-clinicas/hc-1" &&
          (options as { method?: string } | undefined)?.method === "PATCH",
      );
    expect(patchCalls).toHaveLength(1);

    if (resolverPatch) {
      (resolverPatch as (v: unknown) => void)({
        id: "hc-1",
        paciente_id: UUID,
        antecedentes: "Actualizado",
        alergias: "Ninguna",
        observaciones: "Sin cambios",
        creado_en: "2026-01-01T10:00:00Z",
      });
    }
  });

  it("estructura role=\"grid\" con dos filas de 16 gridcell en orden anatómico D11", async () => {
    mockHcExitoso(UUID);
    renderHc(`/hc/${UUID}`);

    const grid = await screen.findByRole("grid");
    expect(grid).toBeInTheDocument();
    const filas = screen.getAllByRole("row");
    expect(filas).toHaveLength(2);
    const orden = [
      "18","17","16","15","14","13","12","11","21","22","23","24","25","26","27","28",
      "48","47","46","45","44","43","42","41","31","32","33","34","35","36","37","38",
    ];
    const celdas = screen.getAllByRole("gridcell");
    expect(celdas).toHaveLength(32);
    expect(celdas.map((c) => c.getAttribute("data-pieza"))).toEqual(orden);
  });

  it("Odontograma sin observaciones muestra estado vacío por pieza", async () => {
    mockHcExitoso(UUID);
    renderHc(`/hc/${UUID}`);

    const celdas = await screen.findAllByRole("gridcell");
    expect(celdas).toHaveLength(32);
    expect(screen.getByLabelText("Pieza 18, superior derecha, sin estado registrado")).toBeInTheDocument();
    expect(screen.getByLabelText("Pieza 38, inferior izquierda, sin estado registrado")).toBeInTheDocument();
  });

  it("Estado de texto largo permanece comprensible sin depender del color", async () => {
    const estadoLargo = "estado clinico extremadamente largo y no catalogado para la pieza";
    vi.mocked(apiRequest).mockImplementation((ruta: string) => {
      if (ruta === `/pacientes/${UUID}/historia-clinica`) {
        return Promise.resolve({
          id: "hc-1",
          paciente_id: UUID,
          antecedentes: null,
          alergias: null,
          observaciones: null,
          creado_en: "2026-01-01T10:00:00Z",
        });
      }
      if (ruta === `/pacientes/${UUID}/odontograma`) {
        return Promise.resolve([
          {
            id: "odo-1",
            paciente_id: UUID,
            pieza: "16",
            estado: estadoLargo,
            profesional_id: "prof-1",
            fecha: "2026-01-02T10:00:00Z",
            creado_en: "2026-01-02T10:00:00Z",
          },
        ]);
      }
      if (ruta === `/pacientes/${UUID}/planes-tratamiento`) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    renderHc(`/hc/${UUID}`);

    const pieza16 = await screen.findByLabelText(
      `Pieza 16, superior derecha, estado ${estadoLargo}`,
    );
    expect(pieza16).toBeInTheDocument();
    expect(pieza16).toHaveTextContent(estadoLargo);
  });

  it("Tab entra al odontograma en la pieza activa", async () => {
    const user = userEvent.setup();
    mockHcExitoso(UUID);
    renderHc(`/hc/${UUID}`);

    const celdas = await screen.findAllByRole("gridcell");
    expect(celdas).toHaveLength(32);
    const antes = document.createElement("button");
    antes.textContent = "antes";
    const grid = screen.getByRole("grid");
    grid.parentElement?.insertBefore(antes, grid);
    antes.focus();
    await user.tab();
    expect(screen.getByLabelText("Pieza 18, superior derecha, sin estado registrado")).toHaveFocus();
    expect(
      screen.getByLabelText("Pieza 18, superior derecha, sin estado registrado"),
    ).toHaveAttribute("tabindex", "0");
    const resto = celdas.filter(
      (c) =>
        c.getAttribute("aria-label") !==
        "Pieza 18, superior derecha, sin estado registrado",
    );
    for (const celda of resto) {
      expect(celda).toHaveAttribute("tabindex", "-1");
    }
  });

  it("Tab sale del odontograma sin recorrer las piezas", async () => {
    const user = userEvent.setup();
    mockHcExitoso(UUID);
    renderHc(`/hc/${UUID}`);

    const activa = await screen.findByLabelText(
      "Pieza 18, superior derecha, sin estado registrado",
    );
    const despues = document.createElement("button");
    despues.textContent = "despues";
    const grid = screen.getByRole("grid");
    grid.parentElement?.insertBefore(despues, grid.nextSibling);
    activa.focus();
    await user.tab();
    expect(despues).toHaveFocus();
  });

  it("Flechas llevan el foco a una pieza con aria-label correcto", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest).mockImplementation((ruta: string) => {
      if (ruta === `/pacientes/${UUID}/historia-clinica`) {
        return Promise.resolve({
          id: "hc-1",
          paciente_id: UUID,
          antecedentes: null,
          alergias: null,
          observaciones: null,
          creado_en: "2026-01-01T10:00:00Z",
        });
      }
      if (ruta === `/pacientes/${UUID}/odontograma`) {
        return Promise.resolve([
          {
            id: "odo-1",
            paciente_id: UUID,
            pieza: "16",
            estado: "caries",
            profesional_id: "prof-1",
            fecha: "2026-01-02T10:00:00Z",
            creado_en: "2026-01-02T10:00:00Z",
          },
        ]);
      }
      if (ruta === `/pacientes/${UUID}/planes-tratamiento`) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    renderHc(`/hc/${UUID}`);

    const p18 = await screen.findByLabelText("Pieza 18, superior derecha, sin estado registrado");
    p18.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByLabelText("Pieza 16, superior derecha, estado caries")).toHaveFocus();
  });

  it("Navegación por teclado alcanza una pieza de otro cuadrante", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest).mockImplementation((ruta: string) => {
      if (ruta === `/pacientes/${UUID}/historia-clinica`) {
        return Promise.resolve({
          id: "hc-1",
          paciente_id: UUID,
          antecedentes: null,
          alergias: null,
          observaciones: null,
          creado_en: "2026-01-01T10:00:00Z",
        });
      }
      if (ruta === `/pacientes/${UUID}/odontograma`) {
        return Promise.resolve([
          {
            id: "odo-38",
            paciente_id: UUID,
            pieza: "38",
            estado: "sano",
            profesional_id: "prof-1",
            fecha: "2026-01-02T10:00:00Z",
            creado_en: "2026-01-02T10:00:00Z",
          },
        ]);
      }
      if (ruta === `/pacientes/${UUID}/planes-tratamiento`) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    renderHc(`/hc/${UUID}`);

    const p18 = await screen.findByLabelText("Pieza 18, superior derecha, sin estado registrado");
    p18.focus();
    await user.keyboard("{ArrowDown}{End}");
    expect(screen.getByLabelText("Pieza 38, inferior izquierda, estado sano")).toHaveFocus();
  });

  it("Flecha derecha cruza la línea media", async () => {
    const user = userEvent.setup();
    mockHcExitoso(UUID);
    renderHc(`/hc/${UUID}`);

    const p11 = await screen.findByLabelText("Pieza 11, superior derecha, sin estado registrado");
    p11.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByLabelText("Pieza 21, superior izquierda, sin estado registrado")).toHaveFocus();
  });

  it("Flecha abajo conserva la columna", async () => {
    const user = userEvent.setup();
    mockHcExitoso(UUID);
    renderHc(`/hc/${UUID}`);

    const p11 = await screen.findByLabelText("Pieza 11, superior derecha, sin estado registrado");
    p11.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByLabelText("Pieza 41, inferior derecha, sin estado registrado")).toHaveFocus();
  });

  it("Home va a la primera pieza de la fila", async () => {
    const user = userEvent.setup();
    mockHcExitoso(UUID);
    renderHc(`/hc/${UUID}`);

    const p16 = await screen.findByLabelText("Pieza 16, superior derecha, sin estado registrado");
    p16.focus();
    await user.keyboard("{Home}");
    expect(screen.getByLabelText("Pieza 18, superior derecha, sin estado registrado")).toHaveFocus();
  });

  it("End va a la última pieza de la fila", async () => {
    const user = userEvent.setup();
    mockHcExitoso(UUID);
    renderHc(`/hc/${UUID}`);

    const p16 = await screen.findByLabelText("Pieza 16, superior derecha, sin estado registrado");
    p16.focus();
    await user.keyboard("{End}");
    expect(screen.getByLabelText("Pieza 28, superior izquierda, sin estado registrado")).toHaveFocus();
  });

  it("Sin envoltura en el borde de la fila", async () => {
    const user = userEvent.setup();
    mockHcExitoso(UUID);
    renderHc(`/hc/${UUID}`);

    const p18 = await screen.findByLabelText("Pieza 18, superior derecha, sin estado registrado");
    p18.focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByLabelText("Pieza 18, superior derecha, sin estado registrado")).toHaveFocus();
  });

  it("Enter sobre una pieza abre su panel", async () => {
    const user = userEvent.setup();
    mockHcExitoso(UUID);
    renderHc(`/hc/${UUID}`);

    const p16 = await screen.findByLabelText("Pieza 16, superior derecha, sin estado registrado");
    p16.focus();
    await user.keyboard("{Enter}");
    expect(p16).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: /pieza 16/i })).toBeInTheDocument();
  });

  it("Espacio sobre una pieza abre su panel", async () => {
    const user = userEvent.setup();
    mockHcExitoso(UUID);
    renderHc(`/hc/${UUID}`);

    const p16 = await screen.findByLabelText("Pieza 16, superior derecha, sin estado registrado");
    p16.focus();
    await user.keyboard(" ");
    expect(p16).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: /pieza 16/i })).toBeInTheDocument();
  });

  it("Mover el foco con flechas no cambia la pieza seleccionada", async () => {
    const user = userEvent.setup();
    mockHcExitoso(UUID);
    renderHc(`/hc/${UUID}`);

    const p16 = await screen.findByLabelText("Pieza 16, superior derecha, sin estado registrado");
    p16.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: /pieza 16/i })).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByLabelText("Pieza 15, superior derecha, sin estado registrado")).toHaveFocus();
    expect(screen.getByRole("heading", { name: /pieza 16/i })).toBeInTheDocument();
  });
});
