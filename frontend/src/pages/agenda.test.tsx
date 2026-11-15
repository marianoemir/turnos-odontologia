/**
 * RED de Grupo 2 (C-17, tasks 2.1-2.4) — pantalla `/agenda`: filtros y tabla.
 *
 * 2.1: pantalla real en el shell (filtros profesional activo + fecha default
 * hoy local), `DataTable` sin ordenables que respeta el orden del backend
 * (inicio, fin, paciente, prestación, sillón, `EstadoBadge`).
 * 2.2: `EmptyState` en día vacío y `Skeleton` durante la carga.
 * 2.3: patrón responsive ≤46rem (fila en grilla con línea de detalle, clases
 * de `ui.css` de `DataTable`), viewport 390×844 sin scroll horizontal.
 * 2.4: 404/422 de `GET /agenda` → error normalizado sin romper el shell,
 * conserva los filtros. Datos ficticios.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routes } from "../app/router";
import { clearSession, getSession, setSession } from "../auth/session";
import { SessionProvider } from "../auth/session-context";
import { apiRequest } from "../services/http";
import type { AgendaItem, Profesional } from "../types/api";
import { ApiError } from "../types/errors";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const PROFESIONAL_A: Profesional = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  nombre: "Dra. Ana Ficticia",
  matricula: "MAT-001",
  sucursal_id: null,
  activo: true,
};

const PROFESIONAL_B: Profesional = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  nombre: "Dr. Beto Ficticio",
  matricula: "MAT-002",
  sucursal_id: null,
  activo: true,
};

const PROFESIONAL_INACTIVO: Profesional = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  nombre: "Dr. Inactivo Ficticio",
  matricula: "MAT-003",
  sucursal_id: null,
  activo: false,
};

const TEMPRANO: AgendaItem = {
  id: "11111111-1111-4111-8111-111111111111",
  inicio: "2026-11-20T10:00:00.000-03:00",
  fin: "2026-11-20T10:30:00.000-03:00",
  estado: "pendiente",
  paciente_nombre: "Ana Temprana",
  prestacion_nombre: "Limpieza Ficticia",
  sillon_nombre: "Sillón 1 Ficticio",
};

const TARDIO: AgendaItem = {
  id: "22222222-2222-4222-8222-222222222222",
  inicio: "2026-11-20T11:00:00.000-03:00",
  fin: "2026-11-20T11:30:00.000-03:00",
  estado: "confirmado",
  paciente_nombre: "Beto Tardío",
  prestacion_nombre: "Conducto Ficticio",
  sillon_nombre: "Sillón 2 Ficticio",
};

function sesionDe(rol: "recepcion" | "odontologo" | "admin"): void {
  setSession({
    token: "jwt-de-prueba",
    rol,
    usuario: `${rol}-ficticio`,
    sucursalId: null,
  });
}

function renderAt(path: string): void {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

/** Respuestas base: catálogo con dos activos + un inactivo, agenda con dos turnos. */
function simularAgendaBase(agenda: AgendaItem[] = [TEMPRANO, TARDIO]): void {
  apiRequestMock.mockImplementation((ruta: string) => {
    const url = String(ruta);
    if (url.startsWith("/profesionales")) {
      return Promise.resolve([PROFESIONAL_A, PROFESIONAL_B, PROFESIONAL_INACTIVO]);
    }
    if (url.startsWith("/agenda")) {
      return Promise.resolve(agenda);
    }
    return Promise.reject(new Error(`ruta no simulada: ${url}`));
  });
}

beforeEach(() => {
  apiRequestMock.mockReset();
  // Hoy local fijo: viernes 2026-11-20 (el default del filtro de fecha).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T12:00:00-03:00"));
  simularAgendaBase();
});

afterEach(() => {
  cleanup();
  clearSession();
  vi.useRealTimers();
});

describe("pantalla /agenda con filtros y tabla (2.1)", () => {
  it("muestra la pantalla real en el shell con defaults y respeta el orden del backend", async () => {
    sesionDe("recepcion");
    renderAt("/agenda");

    expect(await screen.findByRole("heading", { name: "Agenda" })).toBeInTheDocument();
    expect(screen.getByText("Agenda Odontológica")).toBeInTheDocument();
    expect(screen.queryByText("Pantalla pendiente.")).not.toBeInTheDocument();

    // Filtros: fecha default hoy local, profesional con solo activos.
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-11-20");
    const profesional = screen.getByRole("combobox", { name: "Profesional" });
    expect(
      await within(profesional).findByRole("option", { name: "Dra. Ana Ficticia" }),
    ).toBeInTheDocument();
    expect(within(profesional).getByRole("option", { name: "Dr. Beto Ficticio" })).toBeInTheDocument();
    expect(
      within(profesional).queryByRole("option", { name: "Dr. Inactivo Ficticio" }),
    ).not.toBeInTheDocument();

    // Tabla: dos turnos en orden de llegada (ascendente por inicio).
    const filas = await screen.findAllByRole("row");
    expect(filas).toHaveLength(3);
    expect(filas[1]).toHaveTextContent("Ana Temprana");
    expect(filas[2]).toHaveTextContent("Beto Tardío");

    // Columnas completas + EstadoBadge, sin controles de orden.
    expect(screen.getByRole("columnheader", { name: "Inicio" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Fin" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Paciente" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Prestación" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Sillón" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Estado" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ordenar por/i })).not.toBeInTheDocument();
    const badgeTemprano = within(filas[1] as HTMLElement).getByText("Pendiente");
    expect(badgeTemprano).toHaveClass("estado--pendiente");
    const badgeTardio = within(filas[2] as HTMLElement).getByText("Confirmado");
    expect(badgeTardio).toHaveClass("estado--confirmado");
    expect(filas[1]).toHaveTextContent("10:00");
    expect(filas[1]).toHaveTextContent("10:30");
    expect(filas[1]).toHaveTextContent("Limpieza Ficticia");
    expect(filas[1]).toHaveTextContent("Sillón 1 Ficticio");

    // Pide la agenda del primer activo para hoy.
    await waitFor(() => {
      expect(
        apiRequestMock.mock.calls.some(
          ([ruta]) =>
            String(ruta) === `/agenda?profesional=${PROFESIONAL_A.id}&fecha=2026-11-20`,
        ),
      ).toBe(true);
    });
  });

  it("cambiar de profesional o fecha recarga el día con los nuevos parámetros", async () => {
    sesionDe("recepcion");
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt("/agenda");

    await screen.findByText("Ana Temprana");
    await usuario.selectOptions(
      screen.getByRole("combobox", { name: "Profesional" }),
      PROFESIONAL_B.id,
    );

    await waitFor(() => {
      expect(
        apiRequestMock.mock.calls.some(
          ([ruta]) =>
            String(ruta) === `/agenda?profesional=${PROFESIONAL_B.id}&fecha=2026-11-20`,
        ),
      ).toBe(true);
    });

    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-11-21" } });

    await waitFor(() => {
      expect(
        apiRequestMock.mock.calls.some(
          ([ruta]) =>
            String(ruta) === `/agenda?profesional=${PROFESIONAL_B.id}&fecha=2026-11-21`,
        ),
      ).toBe(true);
    });
  });
});

describe("día vacío y carga (2.2)", () => {
  it("día sin turnos muestra EmptyState en lugar de una tabla vacía", async () => {
    simularAgendaBase([]);
    sesionDe("recepcion");
    renderAt("/agenda");

    expect(
      await screen.findByRole("status", { name: "Sin turnos en este día" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Pantalla pendiente.")).not.toBeInTheDocument();
  });

  it("durante la carga muestra Skeleton sin tabla ambigua", async () => {
    let resolver!: (agenda: AgendaItem[]) => void;
    apiRequestMock.mockImplementation((ruta: string) => {
      const url = String(ruta);
      if (url.startsWith("/profesionales")) {
        return Promise.resolve([PROFESIONAL_A, PROFESIONAL_B]);
      }
      if (url.startsWith("/agenda")) {
        return new Promise<AgendaItem[]>((res) => {
          resolver = res;
        });
      }
      return Promise.reject(new Error(`ruta no simulada: ${url}`));
    });
    sesionDe("recepcion");
    renderAt("/agenda");

    // La agenda queda en vuelo: el Skeleton persiste hasta resolver.
    await waitFor(() => {
      expect(
        apiRequestMock.mock.calls.some(([ruta]) => String(ruta).startsWith("/agenda")),
      ).toBe(true);
    });
    const cargando = await screen.findByRole("status", { name: "Cargando resultados" });
    expect(cargando).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await act(async () => {
      resolver([TEMPRANO]);
    });
    expect(await screen.findByText("Ana Temprana")).toBeInTheDocument();
  });
});

describe("responsive ≤46rem (2.3)", () => {
  it("viewport 390×844: fila en grilla con detalle y sin scroll horizontal", async () => {
    window.innerWidth = 390;
    window.innerHeight = 844;
    window.dispatchEvent(new Event("resize"));
    sesionDe("recepcion");
    renderAt("/agenda");

    await screen.findByText("Ana Temprana");

    const tabla = screen.getByRole("table");
    expect(tabla).toHaveClass("data-table");
    const filas = screen.getAllByRole("row");
    expect(filas[1]).toHaveClass("data-table__row");
    // Cada celda expone su etiqueta: es lo que la grilla ≤46rem de `ui.css`
    // usa como línea de detalle (`td::before { content: attr(data-label) }`).
    for (const celda of within(filas[1] as HTMLElement).getAllByRole("cell")) {
      expect(celda.getAttribute("data-label")).toBeTruthy();
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });
});

describe("error normalizado de GET /agenda (2.4)", () => {
  it("404 muestra el error sin romper el shell y conserva los filtros", async () => {
    apiRequestMock.mockImplementation((ruta: string) => {
      const url = String(ruta);
      if (url.startsWith("/profesionales")) {
        return Promise.resolve([PROFESIONAL_A, PROFESIONAL_B]);
      }
      if (url.startsWith("/agenda")) {
        return Promise.reject(
          new ApiError({
            kind: "no_encontrado",
            status: 404,
            mensaje: "Profesional inexistente",
            detalle: "Profesional inexistente",
          }),
        );
      }
      return Promise.reject(new Error(`ruta no simulada: ${url}`));
    });
    sesionDe("recepcion");
    renderAt("/agenda");

    expect(await screen.findByRole("alert")).toHaveTextContent("Profesional inexistente");
    // El shell sigue intacto y los filtros conservan sus valores.
    expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();
    expect(screen.getByText("Agenda Odontológica")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Profesional" })).toHaveValue(PROFESIONAL_A.id);
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-11-20");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("422 muestra el error sin romper el shell y conserva los filtros", async () => {
    apiRequestMock.mockImplementation((ruta: string) => {
      const url = String(ruta);
      if (url.startsWith("/profesionales")) {
        return Promise.resolve([PROFESIONAL_A, PROFESIONAL_B]);
      }
      if (url.startsWith("/agenda")) {
        return Promise.reject(
          new ApiError({
            kind: "validacion",
            status: 422,
            mensaje: "La request tiene campos inválidos: fecha fuera de rango",
            detalle: "fecha fuera de rango",
          }),
        );
      }
      return Promise.reject(new Error(`ruta no simulada: ${url}`));
    });
    sesionDe("recepcion");
    renderAt("/agenda");

    expect(await screen.findByRole("alert")).toHaveTextContent(/campos inválidos/);
    expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();
    expect(screen.getByText("Agenda Odontológica")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Profesional" })).toHaveValue(PROFESIONAL_A.id);
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-11-20");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("cancelación con confirmación y refresco (3.1)", () => {
  it("cancelar libera la fila: un único POST, Toast y refetch sin la fila", async () => {
    let cancelado = false;
    apiRequestMock.mockImplementation((ruta: string) => {
      const url = String(ruta);
      if (url.startsWith("/profesionales")) {
        return Promise.resolve([PROFESIONAL_A, PROFESIONAL_B]);
      }
      if (url === `/turnos/${TEMPRANO.id}/cancelar`) {
        cancelado = true;
        return Promise.resolve({ id: TEMPRANO.id, estado: "cancelado" });
      }
      if (url.startsWith("/agenda")) {
        return Promise.resolve(cancelado ? [TARDIO] : [TEMPRANO, TARDIO]);
      }
      return Promise.reject(new Error(`ruta no simulada: ${url}`));
    });
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/agenda");

    await screen.findByText("Ana Temprana");
    await usuario.click(
      screen.getByRole("button", { name: "Cancelar turno de Ana Temprana" }),
    );
    const dialogo = await screen.findByRole("dialog", { name: "Cancelar turno" });
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText("Turno cancelado.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Ana Temprana")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Beto Tardío")).toBeInTheDocument();
    const posts = apiRequestMock.mock.calls.filter(
      ([ruta]) => String(ruta) === `/turnos/${TEMPRANO.id}/cancelar`,
    );
    expect(posts).toHaveLength(1);
  });

  it("solo recepcion ve la acción cancelar", async () => {
    sesionDe("odontologo");
    renderAt("/agenda");

    await screen.findByText("Ana Temprana");
    expect(screen.queryByRole("button", { name: /cancelar turno/i })).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("errores al cancelar (3.2)", () => {
  function simularFalloAlCancelar(error: ApiError): void {
    apiRequestMock.mockImplementation((ruta: string) => {
      const url = String(ruta);
      if (url.startsWith("/profesionales")) {
        return Promise.resolve([PROFESIONAL_A, PROFESIONAL_B]);
      }
      if (url === `/turnos/${TEMPRANO.id}/cancelar`) {
        return Promise.reject(error);
      }
      if (url.startsWith("/agenda")) {
        return Promise.resolve([TEMPRANO, TARDIO]);
      }
      return Promise.reject(new Error(`ruta no simulada: ${url}`));
    });
  }

  function llamadasAgenda(): number {
    return apiRequestMock.mock.calls.filter(([ruta]) =>
      String(ruta).startsWith("/agenda"),
    ).length;
  }

  async function abrirYConfirmar(): Promise<HTMLElement> {
    const usuario = userEvent.setup();
    await screen.findByText("Ana Temprana");
    await usuario.click(
      screen.getByRole("button", { name: "Cancelar turno de Ana Temprana" }),
    );
    const dialogo = await screen.findByRole("dialog", { name: "Cancelar turno" });
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar" }));
    return dialogo;
  }

  it("409 transicion: mensaje fijo, sin más requests y fila intacta", async () => {
    simularFalloAlCancelar(
      new ApiError({
        kind: "conflicto",
        status: 409,
        causa: "transicion",
        mensaje: "El turno ya cambió de estado",
        detalle: "El turno ya cambió de estado",
      }),
    );
    sesionDe("recepcion");
    renderAt("/agenda");

    const dialogo = await abrirYConfirmar();

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "Ese turno ya no se puede cancelar en su estado actual.",
    );
    // Un único POST y la fila sigue visible e intacta.
    expect(
      apiRequestMock.mock.calls.filter(
        ([ruta]) => String(ruta) === `/turnos/${TEMPRANO.id}/cancelar`,
      ),
    ).toHaveLength(1);
    expect(screen.getByText("Ana Temprana")).toBeInTheDocument();
    expect(screen.getByText("Beto Tardío")).toBeInTheDocument();
    // Sin más requests tras el rechazo: la agenda no se vuelve a pedir.
    const antes = llamadasAgenda();
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 100));
    });
    expect(llamadasAgenda()).toBe(antes);
  });

  it("404 al cancelar: error normalizado sin romper la pantalla", async () => {
    simularFalloAlCancelar(
      new ApiError({
        kind: "no_encontrado",
        status: 404,
        mensaje: "Turno no encontrado",
        detalle: "Turno no encontrado",
      }),
    );
    sesionDe("recepcion");
    renderAt("/agenda");

    const dialogo = await abrirYConfirmar();

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "Turno no encontrado",
    );
    // Filtros y tabla intactos: shell, valores elegidos y ambas filas.
    expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();
    expect(screen.getByText("Agenda Odontológica")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Profesional" })).toHaveValue(
      PROFESIONAL_A.id,
    );
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-11-20");
    expect(screen.getByText("Ana Temprana")).toBeInTheDocument();
    expect(screen.getByText("Beto Tardío")).toBeInTheDocument();
  });
});

/**
 * RED de Grupo 4 (C-17, tasks 4.1-4.3) — reprogramación.
 *
 * 4.1: acción reprogramar (solo pendiente/confirmado, solo recepcion) con
 * Modal de nuevo inicio (datetime-local → ISO con zona, body solo {inicio}),
 * validación cliente que bloquea sin inicio; happy 200 actualiza inicio/fin
 * tras refetch. 4.2: 409 por causa con el mismo texto que /turnos/nuevo, sin
 * reintento y original intacto. 4.3: 422 del servidor al campo sin cerrar.
 * Datos ficticios.
 */
describe("reprogramación happy path (4.1)", () => {
  const NUEVO_INICIO_TEXTO = "2026-11-20T14:00";
  const REPROGRAMADO: AgendaItem = {
    ...TEMPRANO,
    inicio: "2026-11-20T14:00:00.000-03:00",
    fin: "2026-11-20T14:30:00.000-03:00",
  };

  function simularReprogramacionExitosa(): void {
    let reprogramado = false;
    apiRequestMock.mockImplementation((ruta: string) => {
      const url = String(ruta);
      if (url.startsWith("/profesionales")) {
        return Promise.resolve([PROFESIONAL_A, PROFESIONAL_B]);
      }
      if (url === `/turnos/${TEMPRANO.id}/reprogramar`) {
        reprogramado = true;
        return Promise.resolve({ id: TEMPRANO.id, estado: "pendiente" });
      }
      if (url.startsWith("/agenda")) {
        return Promise.resolve(reprogramado ? [REPROGRAMADO, TARDIO] : [TEMPRANO, TARDIO]);
      }
      return Promise.reject(new Error(`ruta no simulada: ${url}`));
    });
  }

  function llamadasReprogramar(): number {
    return apiRequestMock.mock.calls.filter(
      ([ruta]) => String(ruta) === `/turnos/${TEMPRANO.id}/reprogramar`,
    ).length;
  }

  it("reprogramar actualiza inicio y fin tras refetch con un único POST sin fin", async () => {
    simularReprogramacionExitosa();
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/agenda");

    await screen.findByText("Ana Temprana");
    await usuario.click(
      screen.getByRole("button", { name: "Reprogramar turno de Ana Temprana" }),
    );
    const dialogo = await screen.findByRole("dialog", { name: "Reprogramar turno" });
    fireEvent.change(screen.getByLabelText("Nuevo inicio"), {
      target: { value: NUEVO_INICIO_TEXTO },
    });
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Turno reprogramado.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // El turno aparece con su nuevo inicio y fin recalculado.
    await waitFor(() => {
      expect(screen.getByText("Ana Temprana")).toBeInTheDocument();
    });
    expect(screen.queryByText("10:00")).not.toBeInTheDocument();
    // Un único POST con body solo {inicio} en ISO con zona.
    expect(llamadasReprogramar()).toBe(1);
    const llamada = apiRequestMock.mock.calls.find(
      ([ruta]) => String(ruta) === `/turnos/${TEMPRANO.id}/reprogramar`,
    );
    const opciones = llamada?.[1] as { body?: Record<string, unknown> } | undefined;
    const esperado = new Date(NUEVO_INICIO_TEXTO).toISOString();
    expect(opciones?.body).toEqual({ inicio: esperado });
  });

  it("sin nuevo inicio no emite request y el campo muestra su error", async () => {
    simularReprogramacionExitosa();
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/agenda");

    await screen.findByText("Ana Temprana");
    await usuario.click(
      screen.getByRole("button", { name: "Reprogramar turno de Ana Temprana" }),
    );
    const dialogo = await screen.findByRole("dialog", { name: "Reprogramar turno" });
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(llamadasReprogramar()).toBe(0);
    const campo = screen.getByLabelText("Nuevo inicio");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(await within(dialogo).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Reprogramar turno" })).toBeInTheDocument();
  });
});

describe("409 al reprogramar (4.2)", () => {
  const CASOS: { causa: string; mensaje: string }[] = [
    { causa: "profesional", mensaje: "Ese profesional ya tiene un turno en ese horario." },
    { causa: "sillon", mensaje: "Ese sillón ya está ocupado en ese horario." },
    { causa: "horario", mensaje: "Está fuera del horario de atención del profesional." },
    { causa: "bloqueo", mensaje: "Hay un bloqueo en ese horario." },
  ];

  function simularFalloAlReprogramar(error: ApiError): void {
    apiRequestMock.mockImplementation((ruta: string) => {
      const url = String(ruta);
      if (url.startsWith("/profesionales")) {
        return Promise.resolve([PROFESIONAL_A, PROFESIONAL_B]);
      }
      if (url === `/turnos/${TEMPRANO.id}/reprogramar`) {
        return Promise.reject(error);
      }
      if (url.startsWith("/agenda")) {
        return Promise.resolve([TEMPRANO, TARDIO]);
      }
      return Promise.reject(new Error(`ruta no simulada: ${url}`));
    });
  }

  function llamadasAgenda(): number {
    return apiRequestMock.mock.calls.filter(([ruta]) =>
      String(ruta).startsWith("/agenda"),
    ).length;
  }

  it.each(CASOS)("409 $causa: mensaje de su causa, sin reintento y original intacto", async ({ causa, mensaje }) => {
    simularFalloAlReprogramar(
      new ApiError({
        kind: "conflicto",
        status: 409,
        causa,
        mensaje: `detalle crudo de ${causa}`,
        detalle: `detalle crudo de ${causa}`,
      }),
    );
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/agenda");

    await screen.findByText("Ana Temprana");
    await usuario.click(
      screen.getByRole("button", { name: "Reprogramar turno de Ana Temprana" }),
    );
    const dialogo = await screen.findByRole("dialog", { name: "Reprogramar turno" });
    fireEvent.change(screen.getByLabelText("Nuevo inicio"), {
      target: { value: "2026-11-20T14:00" },
    });
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(mensaje);
    // Un único POST y el turno original sigue visible con inicio y fin anteriores.
    expect(
      apiRequestMock.mock.calls.filter(
        ([ruta]) => String(ruta) === `/turnos/${TEMPRANO.id}/reprogramar`,
      ),
    ).toHaveLength(1);
    expect(screen.getByText("Ana Temprana")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getByText("10:30")).toBeInTheDocument();
    // Sin reintento: la agenda no se vuelve a pedir tras el rechazo.
    const antes = llamadasAgenda();
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 100));
    });
    expect(llamadasAgenda()).toBe(antes);
  });
});

describe("422 al reprogramar (4.3)", () => {
  it("422 del servidor se proyecta al campo de inicio sin cerrar el diálogo", async () => {
    apiRequestMock.mockImplementation((ruta: string) => {
      const url = String(ruta);
      if (url.startsWith("/profesionales")) {
        return Promise.resolve([PROFESIONAL_A, PROFESIONAL_B]);
      }
      if (url === `/turnos/${TEMPRANO.id}/reprogramar`) {
        return Promise.reject(
          new ApiError({
            kind: "validacion",
            status: 422,
            mensaje: "La request tiene campos inválidos: body.inicio: Input should have timezone",
            detalle: "body.inicio: Input should have timezone",
            campos: [{ ubicacion: "body.inicio", mensaje: "Input should have timezone" }],
          }),
        );
      }
      if (url.startsWith("/agenda")) {
        return Promise.resolve([TEMPRANO, TARDIO]);
      }
      return Promise.reject(new Error(`ruta no simulada: ${url}`));
    });
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/agenda");

    await screen.findByText("Ana Temprana");
    await usuario.click(
      screen.getByRole("button", { name: "Reprogramar turno de Ana Temprana" }),
    );
    const dialogo = await screen.findByRole("dialog", { name: "Reprogramar turno" });
    fireEvent.change(screen.getByLabelText("Nuevo inicio"), {
      target: { value: "2026-11-20T14:00" },
    });
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    const campo = await screen.findByLabelText("Nuevo inicio");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(await within(dialogo).findByText("Input should have timezone")).toBeInTheDocument();
    // El diálogo sigue abierto y la tabla intacta.
    expect(screen.getByRole("dialog", { name: "Reprogramar turno" })).toBeInTheDocument();
    expect(screen.getByText("Ana Temprana")).toBeInTheDocument();
    expect(screen.queryByText("Turno reprogramado.")).not.toBeInTheDocument();
  });
});

/**
 * RED de Grupo 5 (C-17, tasks 5.1-5.2) — estados finales y roles.
 *
 * 5.1: `atendido`/`ausente`/`cancelado` muestran cancelar y reprogramar
 * deshabilitados con motivo visible y no emiten requests. 5.2: roles no
 * `recepcion` ven la tabla en solo lectura; un 403 conserva la sesión y
 * muestra permiso insuficiente (el respaldo del guard de cliente).
 * Datos ficticios.
 */
describe("estados finales deshabilitados con motivo (5.1)", () => {
  const ATENDIDO: AgendaItem = {
    id: "33333333-3333-4333-8333-333333333333",
    inicio: "2026-11-20T12:00:00.000-03:00",
    fin: "2026-11-20T12:30:00.000-03:00",
    estado: "atendido",
    paciente_nombre: "Ceci Atendida",
    prestacion_nombre: "Limpieza Ficticia",
    sillon_nombre: "Sillón 1 Ficticio",
  };

  const AUSENTE: AgendaItem = {
    id: "44444444-4444-4444-8444-444444444444",
    inicio: "2026-11-20T13:00:00.000-03:00",
    fin: "2026-11-20T13:30:00.000-03:00",
    estado: "ausente",
    paciente_nombre: "Dani Ausente",
    prestacion_nombre: "Conducto Ficticio",
    sillon_nombre: "Sillón 2 Ficticio",
  };

  const CANCELADO: AgendaItem = {
    id: "55555555-5555-4555-8555-555555555555",
    inicio: "2026-11-20T14:00:00.000-03:00",
    fin: "2026-11-20T14:30:00.000-03:00",
    estado: "cancelado",
    paciente_nombre: "Eve Cancelada",
    prestacion_nombre: "Limpieza Ficticia",
    sillon_nombre: "Sillón 1 Ficticio",
  };

  const CASOS = [
    { turno: ATENDIDO, nombre: "Ceci Atendida" },
    { turno: AUSENTE, nombre: "Dani Ausente" },
    { turno: CANCELADO, nombre: "Eve Cancelada" },
  ];

  function simularFinales(): void {
    apiRequestMock.mockImplementation((ruta: string) => {
      const url = String(ruta);
      if (url.startsWith("/profesionales")) {
        return Promise.resolve([PROFESIONAL_A, PROFESIONAL_B]);
      }
      if (url.startsWith("/agenda")) {
        return Promise.resolve([ATENDIDO, AUSENTE, CANCELADO]);
      }
      return Promise.reject(new Error(`ruta no simulada: ${url}`));
    });
  }

  it.each(CASOS)(
    "$nombre: cancelar y reprogramar deshabilitados con motivo y sin requests",
    async ({ nombre }) => {
      simularFinales();
      sesionDe("recepcion");
      const usuario = userEvent.setup();
      renderAt("/agenda");

      await screen.findByText(nombre);
      const cancelar = screen.getByRole("button", {
        name: `Cancelar turno de ${nombre}`,
      });
      const reprogramar = screen.getByRole("button", {
        name: `Reprogramar turno de ${nombre}`,
      });
      expect(cancelar).toBeDisabled();
      expect(reprogramar).toBeDisabled();
      // Motivo visible: el `title` explica por qué no se puede operar.
      expect(cancelar.getAttribute("title")).toBeTruthy();
      expect(reprogramar.getAttribute("title")).toBeTruthy();

      // Activar un control deshabilitado no emite ninguna request ni abre diálogo.
      const llamadasAntes = apiRequestMock.mock.calls.length;
      await usuario.click(cancelar);
      await usuario.click(reprogramar);
      expect(apiRequestMock.mock.calls.length).toBe(llamadasAntes);
      expect(
        apiRequestMock.mock.calls.filter(([ruta]) => String(ruta).startsWith("/turnos/")),
      ).toEqual([]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByText(nombre)).toBeInTheDocument();
    },
  );
});

describe("tabla en solo lectura y 403 con sesión intacta (5.2)", () => {
  it.each(["odontologo", "admin"] as const)(
    "%s lee filtros y tabla sin acciones",
    async (rol) => {
      sesionDe(rol);
      renderAt("/agenda");

      await screen.findByText("Ana Temprana");
      expect(screen.getByLabelText("Fecha")).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Profesional" })).toBeInTheDocument();
      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /cancelar turno/i })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /reprogramar turno/i }),
      ).not.toBeInTheDocument();
      // Sin columna de acciones en solo lectura.
      expect(screen.queryByRole("columnheader", { name: "Acciones" })).not.toBeInTheDocument();
      // Solo catálogo + agenda: ninguna mutación de turnos.
      expect(
        apiRequestMock.mock.calls.filter(([ruta]) => String(ruta).startsWith("/turnos/")),
      ).toEqual([]);
    },
  );

  it("403 al cancelar conserva la sesión y muestra permiso insuficiente", async () => {
    apiRequestMock.mockImplementation((ruta: string) => {
      const url = String(ruta);
      if (url.startsWith("/profesionales")) {
        return Promise.resolve([PROFESIONAL_A, PROFESIONAL_B]);
      }
      if (url === `/turnos/${TEMPRANO.id}/cancelar`) {
        return Promise.reject(
          new ApiError({
            kind: "permiso",
            status: 403,
            causa: "permiso_denegado",
            mensaje: "La request fue rechazada (HTTP 403).",
            detalle: "No permitido.",
          }),
        );
      }
      if (url.startsWith("/agenda")) {
        return Promise.resolve([TEMPRANO, TARDIO]);
      }
      return Promise.reject(new Error(`ruta no simulada: ${url}`));
    });
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/agenda");

    await screen.findByText("Ana Temprana");
    await usuario.click(
      screen.getByRole("button", { name: "Cancelar turno de Ana Temprana" }),
    );
    const dialogo = await screen.findByRole("dialog", { name: "Cancelar turno" });
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "Permiso insuficiente.",
    );
    // La sesión sigue intacta (el 403 no expira) y la pantalla no se rompe.
    expect(getSession()).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Ingresar" })).not.toBeInTheDocument();
    expect(screen.getByText("Ana Temprana")).toBeInTheDocument();
    expect(screen.getByText("Beto Tardío")).toBeInTheDocument();
  });

  it("403 al reprogramar conserva la sesión y muestra permiso insuficiente", async () => {
    apiRequestMock.mockImplementation((ruta: string) => {
      const url = String(ruta);
      if (url.startsWith("/profesionales")) {
        return Promise.resolve([PROFESIONAL_A, PROFESIONAL_B]);
      }
      if (url === `/turnos/${TEMPRANO.id}/reprogramar`) {
        return Promise.reject(
          new ApiError({
            kind: "permiso",
            status: 403,
            causa: "permiso_denegado",
            mensaje: "La request fue rechazada (HTTP 403).",
            detalle: "No permitido.",
          }),
        );
      }
      if (url.startsWith("/agenda")) {
        return Promise.resolve([TEMPRANO, TARDIO]);
      }
      return Promise.reject(new Error(`ruta no simulada: ${url}`));
    });
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/agenda");

    await screen.findByText("Ana Temprana");
    await usuario.click(
      screen.getByRole("button", { name: "Reprogramar turno de Ana Temprana" }),
    );
    const dialogo = await screen.findByRole("dialog", { name: "Reprogramar turno" });
    fireEvent.change(screen.getByLabelText("Nuevo inicio"), {
      target: { value: "2026-11-20T14:00" },
    });
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "Permiso insuficiente.",
    );
    expect(getSession()).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Ingresar" })).not.toBeInTheDocument();
    expect(screen.getByText("Ana Temprana")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
  });
});

/**
 * Hallazgo E2E #2 (C-17): Escape debe cerrar los modales de agenda sin
 * operar, esté donde esté el foco (el handler anterior solo vivía en el
 * `onKeyDown` del div del diálogo y no recibía la tecla si el foco estaba
 * fuera, como ocurre en el navegador real). Sin requests en ambos casos.
 */
describe("Escape cierra los modales sin operar (hallazgo E2E #2)", () => {
  it("Escape cierra el modal de cancelar sin requests", async () => {
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/agenda");

    await screen.findByText("Ana Temprana");
    await usuario.click(
      screen.getByRole("button", { name: "Cancelar turno de Ana Temprana" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Cancelar turno" }),
    ).toBeInTheDocument();

    // Foco fuera del diálogo (condición E2E) + Escape a nivel de documento.
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Ana Temprana")).toBeInTheDocument();
    expect(
      apiRequestMock.mock.calls.filter(([ruta]) => String(ruta).startsWith("/turnos/")),
    ).toEqual([]);
  });

  it("Escape cierra el modal de reprogramar sin requests", async () => {
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/agenda");

    await screen.findByText("Ana Temprana");
    await usuario.click(
      screen.getByRole("button", { name: "Reprogramar turno de Ana Temprana" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Reprogramar turno" }),
    ).toBeInTheDocument();

    // Foco fuera del diálogo (condición E2E) + Escape a nivel de documento.
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Ana Temprana")).toBeInTheDocument();
    expect(
      apiRequestMock.mock.calls.filter(([ruta]) => String(ruta).startsWith("/turnos/")),
    ).toEqual([]);
  });
});
