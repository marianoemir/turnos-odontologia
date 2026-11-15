import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../types/errors";
import ListaEsperaPage from "./lista-espera";
import {
  crearEntradaListaEspera,
  listarEntradasListaEspera,
  listarPacientesCatalogo,
  listarPrestacionesCatalogo,
  listarProfesionalesCatalogo,
  listarSillonesCatalogo,
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
const listarEntradasListaEsperaMock = vi.mocked(listarEntradasListaEspera);
const listarPacientesCatalogoMock = vi.mocked(listarPacientesCatalogo);
const listarProfesionalesCatalogoMock = vi.mocked(listarProfesionalesCatalogo);
const listarPrestacionesCatalogoMock = vi.mocked(listarPrestacionesCatalogo);
const listarSillonesCatalogoMock = vi.mocked(listarSillonesCatalogo);

const ID_PACIENTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_PROFESIONAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ID_PRESTACION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_ENTRADA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

beforeEach(() => {
  crearEntradaListaEsperaMock.mockReset();
  listarEntradasListaEsperaMock.mockReset();
  listarPacientesCatalogoMock.mockReset();
  listarProfesionalesCatalogoMock.mockReset();
  listarPrestacionesCatalogoMock.mockReset();
  listarSillonesCatalogoMock.mockReset();
  listarEntradasListaEsperaMock.mockResolvedValue([]);
  listarPacientesCatalogoMock.mockResolvedValue({
    items: [],
    total: 0,
    limit: 200,
    offset: 0,
  });
  listarProfesionalesCatalogoMock.mockResolvedValue([]);
  listarPrestacionesCatalogoMock.mockResolvedValue([]);
  listarSillonesCatalogoMock.mockResolvedValue([]);
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

describe("4. Estados de carga, error, permiso y vacío", () => {
  it('Empty waitlist shows empty state (edge-case)', async () => {
    listarEntradasListaEsperaMock.mockResolvedValue([]);

    renderPage();

    expect(
      await screen.findByRole("status", { name: /sin entradas en lista de espera/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /pendiente/i })).not.toBeInTheDocument();
  });

  it('Waitlist query is loading (edge-case)', async () => {
    listarEntradasListaEsperaMock.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(await screen.findByRole("status", { busy: true })).toBeInTheDocument();
  });

  it('Waitlist query fails with a non-permission error (business-error)', async () => {
    listarEntradasListaEsperaMock.mockRejectedValue(
      new ApiError({
        kind: "servidor",
        status: 500,
        mensaje: "Error al cargar lista de espera",
        detalle: "Error al cargar lista de espera",
        causa: "servidor",
      }),
    );

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Error al cargar lista de espera/i);
    expect(screen.getByRole("heading", { name: "Lista de espera" })).toBeInTheDocument();
  });

  it('Permission error is shown without breaking the screen (business-error)', async () => {
    listarEntradasListaEsperaMock.mockRejectedValue(
      new ApiError({
        kind: "permiso",
        status: 403,
        mensaje: "Permiso denegado",
        detalle: "Permiso denegado",
        causa: "permiso_denegado",
      }),
    );

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Permiso denegado|permiso/i);
    expect(screen.getByRole("heading", { name: "Lista de espera" })).toBeInTheDocument();
  });
});

describe("3. Listado, filtro y nombres", () => {
  it('Entries are shown in backend FIFO order (happy-path)', async () => {
    listarEntradasListaEsperaMock.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        paciente_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        profesional_id: null,
        prestacion_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        creado_en: "2026-11-15T12:00:00-03:00",
        estado: "pendiente",
        turno_id: null,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        paciente_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
        profesional_id: null,
        prestacion_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc",
        creado_en: "2026-11-15T08:00:00-03:00",
        estado: "pendiente",
        turno_id: null,
      },
    ]);
    listarPacientesCatalogoMock.mockResolvedValue({
      items: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          nombre: "Paciente FIFO Primero",
          dni: "10000101",
          contacto: null,
          ficticio: true,
          activo: true,
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
          nombre: "Paciente FIFO Segundo",
          dni: "10000102",
          contacto: null,
          ficticio: true,
          activo: true,
        },
      ],
      total: 2,
      limit: 200,
      offset: 0,
    });
    listarProfesionalesCatalogoMock.mockResolvedValue([]);
    listarPrestacionesCatalogoMock.mockResolvedValue([]);
    listarSillonesCatalogoMock.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(listarEntradasListaEsperaMock).toHaveBeenCalled();
    });

    const first = await screen.findByText("Paciente FIFO Primero");
    const second = await screen.findByText("Paciente FIFO Segundo");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Professional filter includes general entries (edge-case)', async () => {
    const user = userEvent.setup();
    listarProfesionalesCatalogoMock.mockResolvedValue([
      {
        id: ID_PROFESIONAL,
        nombre: "Profesional Ficticio Uno",
        matricula: "MF-001",
        sucursal_id: null,
        activo: true,
      },
    ]);
    listarEntradasListaEsperaMock.mockImplementation(async (profesional?: string) => {
      if (profesional === ID_PROFESIONAL) {
        return [
          {
            id: "33333333-3333-4333-8333-333333333333",
            paciente_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad",
            profesional_id: ID_PROFESIONAL,
            prestacion_id: ID_PRESTACION,
            creado_en: "2026-11-15T09:00:00-03:00",
            estado: "pendiente",
            turno_id: null,
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            paciente_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae",
            profesional_id: null,
            prestacion_id: ID_PRESTACION,
            creado_en: "2026-11-15T09:30:00-03:00",
            estado: "pendiente",
            turno_id: null,
          },
        ];
      }
      return [];
    });
    listarPacientesCatalogoMock.mockResolvedValue({
      items: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad",
          nombre: "Paciente Filtro Especifico",
          dni: "10000103",
          contacto: null,
          ficticio: true,
          activo: true,
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae",
          nombre: "Paciente Filtro General",
          dni: "10000104",
          contacto: null,
          ficticio: true,
          activo: true,
        },
      ],
      total: 2,
      limit: 200,
      offset: 0,
    });
    listarPrestacionesCatalogoMock.mockResolvedValue([]);
    listarSillonesCatalogoMock.mockResolvedValue([]);

    renderPage();

    const filtro = await screen.findByLabelText(/^Filtrar por profesional$/i);
    await waitFor(() => {
      expect(filtro.querySelector(`option[value="${ID_PROFESIONAL}"]`)).not.toBeNull();
    });
    await user.selectOptions(filtro, ID_PROFESIONAL);

    await waitFor(() => {
      expect(listarEntradasListaEsperaMock).toHaveBeenCalledWith(ID_PROFESIONAL);
    });

    expect(await screen.findByText("Paciente Filtro Especifico")).toBeInTheDocument();
    expect(await screen.findByText("Paciente Filtro General")).toBeInTheDocument();
  });

  it('Names are visible in the table (happy-path)', async () => {
    listarEntradasListaEsperaMock.mockResolvedValue([
      {
        id: "55555555-5555-4555-8555-555555555555",
        paciente_id: ID_PACIENTE,
        profesional_id: ID_PROFESIONAL,
        prestacion_id: ID_PRESTACION,
        creado_en: "2026-11-15T09:00:00-03:00",
        estado: "pendiente",
        turno_id: null,
      },
    ]);
    listarPacientesCatalogoMock.mockResolvedValue({
      items: [
        {
          id: ID_PACIENTE,
          nombre: "Paciente Tabla Uno",
          dni: "10000011",
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
        nombre: "Profesional Tabla Uno",
        matricula: "MF-011",
        sucursal_id: null,
        activo: true,
      },
    ]);
    listarPrestacionesCatalogoMock.mockResolvedValue([
      {
        id: ID_PRESTACION,
        nombre: "Prestacion Tabla Uno",
        duracion_min: 30,
        activo: true,
      },
    ]);
    listarSillonesCatalogoMock.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("Paciente Tabla Uno")).toBeInTheDocument();
    expect(screen.getAllByText("Profesional Tabla Uno").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Prestacion Tabla Uno").length).toBeGreaterThan(0);
    expect(screen.queryByText(ID_PACIENTE)).not.toBeInTheDocument();
    expect(screen.queryByText(ID_PRESTACION)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(listarPacientesCatalogoMock).toHaveBeenCalledWith(
        expect.objectContaining({ incluir_inactivos: true }),
      );
      expect(listarProfesionalesCatalogoMock).toHaveBeenCalledWith({
        incluir_inactivos: true,
      });
      expect(listarPrestacionesCatalogoMock).toHaveBeenCalledWith({
        incluir_inactivos: true,
      });
    });
  });

  it('Unresolved reference shows a neutral label (edge-case)', async () => {
    const idPacienteDesconocido = "99999999-9999-4999-8999-999999999999";
    const idPrestacionDesconocida = "88888888-8888-4888-8888-888888888888";
    listarEntradasListaEsperaMock.mockResolvedValue([
      {
        id: "66666666-6666-4666-8666-666666666666",
        paciente_id: idPacienteDesconocido,
        profesional_id: null,
        prestacion_id: idPrestacionDesconocida,
        creado_en: "2026-11-15T09:00:00-03:00",
        estado: "pendiente",
        turno_id: null,
      },
    ]);
    listarPacientesCatalogoMock.mockResolvedValue({
      items: [],
      total: 0,
      limit: 200,
      offset: 0,
    });
    listarProfesionalesCatalogoMock.mockResolvedValue([]);
    listarPrestacionesCatalogoMock.mockResolvedValue([]);
    listarSillonesCatalogoMock.mockResolvedValue([]);

    renderPage();

    const labels = await screen.findAllByText("No disponible");
    expect(labels.length).toBeGreaterThan(0);
    expect(screen.queryByText(idPacienteDesconocido)).not.toBeInTheDocument();
    expect(screen.queryByText(idPrestacionDesconocida)).not.toBeInTheDocument();
  });

  it('Catalog read failure shows error without breaking the screen (edge-case)', async () => {
    listarEntradasListaEsperaMock.mockResolvedValue([
      {
        id: "77777777-7777-4777-8777-777777777777",
        paciente_id: ID_PACIENTE,
        profesional_id: null,
        prestacion_id: ID_PRESTACION,
        creado_en: "2026-11-15T09:00:00-03:00",
        estado: "pendiente",
        turno_id: null,
      },
    ]);
    listarPacientesCatalogoMock.mockRejectedValue(
      new ApiError({
        kind: "servidor",
        status: 500,
        mensaje: "Error al cargar catálogos",
        detalle: "Error al cargar catálogos",
        causa: "servidor",
      }),
    );
    listarProfesionalesCatalogoMock.mockResolvedValue([]);
    listarPrestacionesCatalogoMock.mockResolvedValue([]);
    listarSillonesCatalogoMock.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Error al cargar catálogos/i);
    expect(screen.getByRole("heading", { name: "Lista de espera" })).toBeInTheDocument();
  });
});
