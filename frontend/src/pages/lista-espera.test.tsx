import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../types/errors";
import ListaEsperaPage from "./lista-espera";
import {
  crearEntradaListaEspera,
  listarPacientesCatalogo,
  listarPrestacionesCatalogo,
  listarProfesionalesCatalogo,
} from "../services/lista-espera";

vi.mock("../services/lista-espera", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/lista-espera")>();
  return {
    ...actual,
    crearEntradaListaEspera: vi.fn(),
    listarEntradasListaEspera: vi.fn(),
    listarPacientesCatalogo: vi.fn(),
    listarProfesionalesCatalogo: vi.fn(),
    listarPrestacionesCatalogo: vi.fn(),
    listarSillonesCatalogo: vi.fn(),
  };
});

const crearEntradaListaEsperaMock = vi.mocked(crearEntradaListaEspera);
const listarPacientesCatalogoMock = vi.mocked(listarPacientesCatalogo);
const listarProfesionalesCatalogoMock = vi.mocked(listarProfesionalesCatalogo);
const listarPrestacionesCatalogoMock = vi.mocked(listarPrestacionesCatalogo);

const ID_PACIENTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_PROFESIONAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ID_PRESTACION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_ENTRADA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

beforeEach(() => {
  crearEntradaListaEsperaMock.mockReset();
  listarPacientesCatalogoMock.mockReset();
  listarProfesionalesCatalogoMock.mockReset();
  listarPrestacionesCatalogoMock.mockReset();
});

afterEach(() => {
  cleanup();
});

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ListaEsperaPage />
    </QueryClientProvider>,
  );
}

describe("2. Alta", () => {
  it('Successful waitlist registration (happy-path)', async () => {
    const user = userEvent.setup();

    listarPacientesCatalogoMock.mockResolvedValue({
      items: [
        {
          id: ID_PACIENTE,
          nombre: "Paciente Ficticio Uno",
          dni: "10000001",
          contacto: null,
          ficticio: true,
          activo: true,
        },
      ],
      total: 1,
      limit: 200,
      offset: 0,
    });
    listarProfesionalesCatalogoMock.mockResolvedValue([
      {
        id: ID_PROFESIONAL,
        nombre: "Profesional Ficticio Uno",
        matricula: "MF-001",
        sucursal_id: null,
        activo: true,
      },
    ]);
    listarPrestacionesCatalogoMock.mockResolvedValue([
      {
        id: ID_PRESTACION,
        nombre: "Prestacion Ficticia Uno",
        duracion_min: 30,
        activo: true,
      },
    ]);
    crearEntradaListaEsperaMock.mockResolvedValue({
      id: ID_ENTRADA,
      paciente_id: ID_PACIENTE,
      profesional_id: null,
      prestacion_id: ID_PRESTACION,
      creado_en: "2026-11-15T10:00:00-03:00",
      estado: "pendiente",
      turno_id: null,
    });

    renderPage();

    const buscarPaciente = await screen.findByLabelText(/buscar paciente/i);
    await user.type(buscarPaciente, "Ficticio");

    await waitFor(() => {
      expect(listarPacientesCatalogoMock).toHaveBeenCalledWith({
        q: "Ficticio",
        limit: 200,
      });
    });

    await user.click(await screen.findByRole("option", { name: /Paciente Ficticio Uno/i }));

    const prestacionSelect = await screen.findByLabelText(/prestaci[oó]n/i);
    await user.selectOptions(prestacionSelect, ID_PRESTACION);

    const submit = screen.getByRole("button", { name: /agregar a lista de espera|registrar en lista de espera|dar de alta/i });
    await user.click(submit);

    await waitFor(() => {
      expect(crearEntradaListaEsperaMock).toHaveBeenCalledTimes(1);
    });
    expect(crearEntradaListaEsperaMock).toHaveBeenCalledWith({
      paciente_id: ID_PACIENTE,
      prestacion_id: ID_PRESTACION,
    });

    expect(await screen.findByText(/pendiente/i)).toBeInTheDocument();
  });

  it('Backend rejects registration with entity not found (business-error)', async () => {
    const user = userEvent.setup();

    listarPacientesCatalogoMock.mockResolvedValue({
      items: [
        {
          id: ID_PACIENTE,
          nombre: "Paciente Ficticio Dos",
          dni: "10000002",
          contacto: null,
          ficticio: true,
          activo: true,
        },
      ],
      total: 1,
      limit: 200,
      offset: 0,
    });
    listarProfesionalesCatalogoMock.mockResolvedValue([]);
    listarPrestacionesCatalogoMock.mockResolvedValue([
      {
        id: ID_PRESTACION,
        nombre: "Prestacion Ficticia Dos",
        duracion_min: 30,
        activo: true,
      },
    ]);
    crearEntradaListaEsperaMock.mockRejectedValueOnce(
      new ApiError({
        kind: "no_encontrado",
        status: 404,
        mensaje: "Paciente no encontrado",
        detalle: "Paciente no encontrado",
        causa: "no_encontrado",
      }),
    );

    renderPage();

    const buscarPaciente = await screen.findByLabelText(/buscar paciente/i);
    await user.type(buscarPaciente, "Ficticio");
    await waitFor(() => {
      expect(listarPacientesCatalogoMock).toHaveBeenCalledWith({
        q: "Ficticio",
        limit: 200,
      });
    });
    await user.click(await screen.findByRole("option", { name: /Paciente Ficticio Dos/i }));

    const prestacionSelect = await screen.findByLabelText(/prestaci[oó]n/i);
    await user.selectOptions(prestacionSelect, ID_PRESTACION);

    const submit = screen.getByRole("button", { name: /agregar a lista de espera|registrar en lista de espera|dar de alta/i });
    await user.click(submit);

    expect(await screen.findByText(/Paciente no encontrado/i)).toBeInTheDocument();
    expect(crearEntradaListaEsperaMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/asignado/i)).not.toBeInTheDocument();
  });

  it('Backend rejects registration with validation error (business-error)', async () => {
    const user = userEvent.setup();

    listarPacientesCatalogoMock.mockResolvedValue({
      items: [
        {
          id: ID_PACIENTE,
          nombre: "Paciente Ficticio Tres",
          dni: "10000003",
          contacto: null,
          ficticio: true,
          activo: true,
        },
      ],
      total: 1,
      limit: 200,
      offset: 0,
    });
    listarProfesionalesCatalogoMock.mockResolvedValue([]);
    listarPrestacionesCatalogoMock.mockResolvedValue([
      {
        id: ID_PRESTACION,
        nombre: "Prestacion Ficticia Tres",
        duracion_min: 30,
        activo: true,
      },
    ]);
    crearEntradaListaEsperaMock.mockRejectedValueOnce(
      new ApiError({
        kind: "validacion",
        status: 422,
        mensaje: "Datos inválidos",
        detalle: "prestacion_id inválido",
        causa: "validacion",
      }),
    );

    renderPage();

    const buscarPaciente = await screen.findByLabelText(/buscar paciente/i);
    await user.type(buscarPaciente, "Ficticio");
    await waitFor(() => {
      expect(listarPacientesCatalogoMock).toHaveBeenCalledWith({
        q: "Ficticio",
        limit: 200,
      });
    });
    await user.click(await screen.findByRole("option", { name: /Paciente Ficticio Tres/i }));

    const prestacionSelect = await screen.findByLabelText(/prestaci[oó]n/i);
    await user.selectOptions(prestacionSelect, ID_PRESTACION);

    const submit = screen.getByRole("button", { name: /agregar a lista de espera|registrar en lista de espera|dar de alta/i });
    await user.click(submit);

    expect(await screen.findByText(/Datos inválidos|prestacion_id inválido/i)).toBeInTheDocument();
    expect(crearEntradaListaEsperaMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/^pendiente$/i)).not.toBeInTheDocument();
  });

  it('Submit is blocked while registration is in flight (edge-case)', async () => {
    const user = userEvent.setup();

    listarPacientesCatalogoMock.mockResolvedValue({
      items: [
        {
          id: ID_PACIENTE,
          nombre: "Paciente Ficticio Cuatro",
          dni: "10000004",
          contacto: null,
          ficticio: true,
          activo: true,
        },
      ],
      total: 1,
      limit: 200,
      offset: 0,
    });
    listarProfesionalesCatalogoMock.mockResolvedValue([]);
    listarPrestacionesCatalogoMock.mockResolvedValue([
      {
        id: ID_PRESTACION,
        nombre: "Prestacion Ficticia Cuatro",
        duracion_min: 30,
        activo: true,
      },
    ]);

    let resolver!: (valor: {
      id: string;
      paciente_id: string;
      profesional_id: string | null;
      prestacion_id: string;
      creado_en: string;
      estado: "pendiente";
      turno_id: string | null;
    }) => void;
    crearEntradaListaEsperaMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );

    renderPage();

    const buscarPaciente = await screen.findByLabelText(/buscar paciente/i);
    await user.type(buscarPaciente, "Ficticio");
    await waitFor(() => {
      expect(listarPacientesCatalogoMock).toHaveBeenCalledWith({
        q: "Ficticio",
        limit: 200,
      });
    });
    await user.click(await screen.findByRole("option", { name: /Paciente Ficticio Cuatro/i }));

    const prestacionSelect = await screen.findByLabelText(/prestaci[oó]n/i);
    await user.selectOptions(prestacionSelect, ID_PRESTACION);

    const submit = screen.getByRole("button", { name: /agregar a lista de espera|registrar en lista de espera|dar de alta/i });
    await user.click(submit);

    await waitFor(() => {
      expect(crearEntradaListaEsperaMock).toHaveBeenCalledTimes(1);
    });
    expect(submit).toBeDisabled();

    await user.click(submit);
    expect(crearEntradaListaEsperaMock).toHaveBeenCalledTimes(1);

    resolver({
      id: ID_ENTRADA,
      paciente_id: ID_PACIENTE,
      profesional_id: null,
      prestacion_id: ID_PRESTACION,
      creado_en: "2026-11-15T10:00:00-03:00",
      estado: "pendiente",
      turno_id: null,
    });

    await waitFor(() => {
      expect(submit).not.toBeDisabled();
    });
  });
});
