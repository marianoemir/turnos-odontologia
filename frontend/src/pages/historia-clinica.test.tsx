import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
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
});
