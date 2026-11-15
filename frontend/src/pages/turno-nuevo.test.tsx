/**
 * RED de 2.1 y 2.2 (C-16) — wizard `/turnos/nuevo`.
 *
 * 2.1: recepción ve el formulario dentro del shell (buscador de paciente con
 * nombre + dni, selects de profesional/prestación/sillón solo con activos,
 * campo `inicio`); `odontologo`/`admin` redirigen a `/agenda` con aviso sin
 * requests. 2.2: el fin (`inicio + prestacion.duracion_min`) se muestra en
 * vivo antes de confirmar y recalcula al cambiar de prestación sin recargar.
 * Datos ficticios.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routes } from "../app/router";
import { clearSession, setSession } from "../auth/session";
import { SessionProvider } from "../auth/session-context";
import { apiRequest } from "../services/http";
import { bloqueoAplicable } from "./turno-nuevo-guia";import type {
  Bloqueo,
  HorarioAtencion,
  Paciente,
  Prestacion,
  Profesional,
  Sillon,
  Turno,
} from "../types/api";
import { ApiError as ApiErrorDePrueba } from "../types/errors";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const PACIENTE: Paciente = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  nombre: "Ana Ficticia",
  dni: "12345678",
  contacto: null,
  ficticio: true,
  activo: true,
};

const PROFESIONAL: Profesional = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  nombre: "Dra. Ficticia",
  matricula: "MAT-001",
  sucursal_id: null,
  activo: true,
};

const PROFESIONAL_INACTIVO: Profesional = {
  ...PROFESIONAL,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb0",
  nombre: "Dr. Inactivo",
  activo: false,
};

const SILLON: Sillon = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  nombre: "Sillón 1 Ficticio",
  sucursal_id: null,
  activo: true,
};

const SILLON_INACTIVO: Sillon = {
  ...SILLON,
  id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc0",
  nombre: "Sillón Inactivo",
  activo: false,
};

const PRESTACION_30: Prestacion = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  nombre: "Limpieza Ficticia",
  duracion_min: 30,
  activo: true,
};

const PRESTACION_60: Prestacion = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  nombre: "Conducto Ficticio",
  duracion_min: 60,
  activo: true,
};

const PRESTACION_INACTIVA: Prestacion = {
  ...PRESTACION_30,
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddd00",
  nombre: "Prestación Inactiva",
  activo: false,
};

/**
 * Datos de guía (3.1/3.2): se fijan por test antes de `renderAt` (el
 * `beforeEach` los vacía). Lunes 16/11/2026 = `dia_semana` 0.
 */
let HORARIOS: HorarioAtencion[] = [];
let BLOQUEOS: Bloqueo[] = [];

const HORARIO_LUNES_MANANA: HorarioAtencion = {
  id: "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0",
  profesional_id: PROFESIONAL.id,
  dia_semana: 0,
  desde: "09:00:00",
  hasta: "13:00:00",
  activo: true,
};

function bloqueoGlobal(desde: string, hasta: string): Bloqueo {
  return {
    id: "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1",
    profesional_id: null,
    sillon_id: null,
    desde,
    hasta,
    motivo: "Feriado ficticio",
  };
}

/** 201 del backend ante un inicio lunes 10:00 + prestación de 30 min. */
const TURNO_CREADO: Turno = {
  id: "11111111-1111-4111-8111-111111111111",
  paciente_id: PACIENTE.id,
  profesional_id: PROFESIONAL.id,
  sillon_id: SILLON.id,
  prestacion_id: PRESTACION_30.id,
  inicio: new Date("2026-11-16T10:00").toISOString(),
  fin: new Date("2026-11-16T10:30").toISOString(),
  estado: "pendiente",
  creado_por: null,
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

beforeEach(() => {
  apiRequestMock.mockReset();
  HORARIOS = [];
  BLOQUEOS = [];
  apiRequestMock.mockImplementation((ruta: string, opciones?: { method?: string }) => {
    const url = String(ruta);
    if (url.startsWith("/pacientes")) {
      return Promise.resolve({ items: [PACIENTE], total: 1, limit: 50, offset: 0 });
    }
    if (url.startsWith("/profesionales")) {
      return Promise.resolve([PROFESIONAL, PROFESIONAL_INACTIVO]);
    }
    if (url.startsWith("/sillones")) {
      return Promise.resolve([SILLON, SILLON_INACTIVO]);
    }
    if (url.startsWith("/prestaciones")) {
      return Promise.resolve([PRESTACION_30, PRESTACION_60, PRESTACION_INACTIVA]);
    }
    if (url.startsWith("/horarios-atencion")) {
      return Promise.resolve(HORARIOS);
    }
    if (url.startsWith("/bloqueos")) {
      return Promise.resolve(BLOQUEOS);
    }
    if (url === "/turnos" && opciones?.method === "POST") {
      return Promise.resolve(TURNO_CREADO);
    }
    return Promise.reject(new Error(`ruta no simulada: ${url}`));
  });
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("wizard /turnos/nuevo (2.1)", () => {
  it("recepción ve el formulario dentro del shell con buscador, selects activos e inicio", async () => {
    sesionDe("recepcion");
    renderAt("/turnos/nuevo");

    expect(await screen.findByRole("heading", { name: "Nuevo turno" })).toBeInTheDocument();
    expect(screen.getByText("Agenda Odontológica")).toBeInTheDocument();
    expect(screen.queryByText("Pantalla pendiente.")).not.toBeInTheDocument();

    expect(screen.getByRole("textbox", { name: "Paciente" })).toBeInTheDocument();
    expect(screen.getByLabelText("Inicio")).toBeInTheDocument();

    const profesional = await screen.findByRole("combobox", { name: "Profesional" });
    expect(within(profesional).getByRole("option", { name: "Dra. Ficticia" })).toBeInTheDocument();
    expect(
      within(profesional).queryByRole("option", { name: "Dr. Inactivo" }),
    ).not.toBeInTheDocument();

    const sillon = screen.getByRole("combobox", { name: "Sillón" });
    expect(within(sillon).getByRole("option", { name: "Sillón 1 Ficticio" })).toBeInTheDocument();
    expect(
      within(sillon).queryByRole("option", { name: "Sillón Inactivo" }),
    ).not.toBeInTheDocument();

    const prestacion = screen.getByRole("combobox", { name: "Prestación" });
    expect(
      within(prestacion).getByRole("option", { name: /Limpieza Ficticia/ }),
    ).toBeInTheDocument();
    expect(
      within(prestacion).queryByRole("option", { name: "Prestación Inactiva" }),
    ).not.toBeInTheDocument();
  });

  it("el buscador pide ?q= y ofrece el paciente con nombre y dni para elegir", async () => {
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await usuario.type(screen.getByRole("textbox", { name: "Paciente" }), "Ana");

    await waitFor(() => {
      expect(
        apiRequestMock.mock.calls.some(([ruta]) =>
          String(ruta).includes("/pacientes?q=Ana"),
        ),
      ).toBe(true);
    });
    const resultado = await screen.findByRole("button", { name: "Ana Ficticia — DNI 12345678" });
    await usuario.click(resultado);
    expect(await screen.findByText("Paciente elegido: Ana Ficticia")).toBeInTheDocument();
  });

  it.each(["odontologo", "admin"] as const)(
    "%s redirige a /agenda con aviso sin requests",
    async (rol) => {
      sesionDe(rol);
      renderAt("/turnos/nuevo");

      expect(await screen.findByRole("heading", { name: "Agenda" })).toBeInTheDocument();
      expect(await screen.findByRole("alert")).toHaveTextContent("Permiso insuficiente.");
      expect(apiRequestMock).not.toHaveBeenCalled();
    },
  );
});

describe("fin en vivo (2.2)", () => {
  it("elegir prestación de 30 min muestra inicio + 30 antes de confirmar sin POST", async () => {
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await usuario.selectOptions(
      await screen.findByRole("combobox", { name: "Prestación" }),
      PRESTACION_30.id,
    );
    fireEvent.change(screen.getByLabelText("Inicio"), {
      target: { value: "2026-11-20T10:00" },
    });

    expect(await screen.findByText("Fin estimado: 20/11/2026 10:30")).toBeInTheDocument();
    expect(
      apiRequestMock.mock.calls.some(([ruta]) => String(ruta) === "/turnos"),
    ).toBe(false);
  });

  it("cambiar de prestación recalcula el fin sin recargar", async () => {
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    const prestacion = await screen.findByRole("combobox", { name: "Prestación" });
    await usuario.selectOptions(prestacion, PRESTACION_30.id);
    fireEvent.change(screen.getByLabelText("Inicio"), {
      target: { value: "2026-11-20T10:00" },
    });
    expect(await screen.findByText("Fin estimado: 20/11/2026 10:30")).toBeInTheDocument();

    await usuario.selectOptions(prestacion, PRESTACION_60.id);

    expect(await screen.findByText("Fin estimado: 20/11/2026 11:00")).toBeInTheDocument();
    expect(screen.queryByText("Fin estimado: 20/11/2026 10:30")).not.toBeInTheDocument();
  });

  it("acepta inicio con segundos (:ss) y calcula el mismo fin", async () => {
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await usuario.selectOptions(
      await screen.findByRole("combobox", { name: "Prestación" }),
      PRESTACION_30.id,
    );
    fireEvent.change(screen.getByLabelText("Inicio"), {
      target: { value: "2026-11-20T10:00:00" },
    });

    expect(await screen.findByText("Fin estimado: 20/11/2026 10:30")).toBeInTheDocument();
  });
});

/**
 * Completa el wizard con datos válidos (paciente por buscador + selects +
 * inicio) para los tests de guía (3.1) y borde (3.2). Datos ficticios.
 */
async function completarFormulario(
  usuario: ReturnType<typeof userEvent.setup>,
  inicio: string,
  prestacionId: string,
): Promise<void> {
  await usuario.type(screen.getByRole("textbox", { name: "Paciente" }), "Ana");
  await usuario.click(await screen.findByRole("button", { name: "Ana Ficticia — DNI 12345678" }));
  await usuario.selectOptions(await screen.findByRole("combobox", { name: "Profesional" }), PROFESIONAL.id);
  await usuario.selectOptions(await screen.findByRole("combobox", { name: "Prestación" }), prestacionId);
  await usuario.selectOptions(await screen.findByRole("combobox", { name: "Sillón" }), SILLON.id);
  fireEvent.change(screen.getByLabelText("Inicio"), { target: { value: inicio } });
}

describe("guía de horario y bloqueos (3.1)", () => {
  it("fuera de horario advierte pero igual envía: el backend decide", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T15:00", PRESTACION_30.id);

    expect(await screen.findByText(/fuera del horario/i)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Crear turno" }));

    await waitFor(() => {
      expect(
        apiRequestMock.mock.calls.some(
          ([ruta, opciones]) => String(ruta) === "/turnos" && opciones?.method === "POST",
        ),
      ).toBe(true);
    });
  });

  it("sobre bloqueo advierte pero no bloquea el envío", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    BLOQUEOS = [bloqueoGlobal("2026-11-16T10:00:00", "2026-11-16T11:00:00")];
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T10:00", PRESTACION_30.id);

    expect(await screen.findByText(/bloqueo/i)).toBeInTheDocument();
    expect(screen.queryByText(/fuera del horario/i)).not.toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Crear turno" }));

    await waitFor(() => {
      expect(
        apiRequestMock.mock.calls.some(
          ([ruta, opciones]) => String(ruta) === "/turnos" && opciones?.method === "POST",
        ),
      ).toBe(true);
    });
  });

  it("dentro de horario y sin bloqueos no muestra avisos", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T10:00", PRESTACION_30.id);

    await screen.findByText("Fin estimado: 16/11/2026 10:30");
    expect(screen.queryByText(/fuera del horario/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bloqueo/i)).not.toBeInTheDocument();
  });
  it("la matriz respeta el alcance: bloqueo de otro profesional no avisa", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    BLOQUEOS = [
      {
        ...bloqueoGlobal("2026-11-16T10:00:00", "2026-11-16T11:00:00"),
        profesional_id: "99999999-9999-4999-8999-999999999999",
      },
    ];
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T10:00", PRESTACION_30.id);

    await screen.findByText("Fin estimado: 16/11/2026 10:30");
    expect(screen.queryByText(/bloqueo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fuera del horario/i)).not.toBeInTheDocument();
  });

  it("cruce de medianoche: suprime el aviso (decide el servidor) y permite enviar", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T23:45", PRESTACION_30.id);

    // El fin cae el martes 00:15: la guía solo evalúa el tramo del mismo día,
    // así que no emite "fuera de horario"; el servidor decide (201/409).
    expect(await screen.findByText("Fin estimado: 17/11/2026 00:15")).toBeInTheDocument();
    expect(screen.queryByText(/fuera del horario/i)).not.toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Crear turno" }));

    await waitFor(() => {
      expect(
        apiRequestMock.mock.calls.some(
          ([ruta, opciones]) => String(ruta) === "/turnos" && opciones?.method === "POST",
        ),
      ).toBe(true);
    });
  });
});

describe("borde adyacente inicio == fin (3.2)", () => {
  it("la guía cliente no conoce turnos: sin avisos y el borde lo decide el servidor (201)", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T10:00", PRESTACION_30.id);

    // La guía cliente solo advierte "fuera de horario" o "bloqueo": no conoce
    // turnos existentes, así que jamás emite "solape". El borde semiabierto
    // `[inicio, fin)` (RN-AG-04) lo decide el servidor con 201/409.
    await screen.findByText("Fin estimado: 16/11/2026 10:30");
    expect(screen.queryByText(/fuera del horario/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bloqueo/i)).not.toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Crear turno" }));

    expect(await screen.findByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText(/Ana Ficticia/)).toBeInTheDocument();
  });
});

describe("borde semiabierto [desde, hasta) de bloqueoAplicable (3.2)", () => {
  const BLOQUEO_10_A_1030 = bloqueoGlobal("2026-11-16T10:00:00", "2026-11-16T10:30:00");
  const aMs = (texto: string): number => new Date(texto).getTime();

  it("inicio == hasta del bloqueo no aplica (borde RN-AG-04)", () => {
    expect(
      bloqueoAplicable(
        BLOQUEO_10_A_1030,
        PROFESIONAL.id,
        SILLON.id,
        aMs("2026-11-16T10:30:00"),
        aMs("2026-11-16T11:00:00"),
      ),
    ).toBe(false);
  });

  it("fin == desde del bloqueo no aplica (borde RN-AG-04)", () => {
    expect(
      bloqueoAplicable(
        BLOQUEO_10_A_1030,
        PROFESIONAL.id,
        SILLON.id,
        aMs("2026-11-16T09:30:00"),
        aMs("2026-11-16T10:00:00"),
      ),
    ).toBe(false);
  });

  it("solape interior sí aplica", () => {
    expect(
      bloqueoAplicable(
        BLOQUEO_10_A_1030,
        PROFESIONAL.id,
        SILLON.id,
        aMs("2026-11-16T10:15:00"),
        aMs("2026-11-16T10:45:00"),
      ),
    ).toBe(true);
  });
});

/**
 * RED de 4.1 y 4.2 (C-16) — errores 409 por causa y 422 a campos.
 *
 * 4.1: cada `causa` del 409 tiene su mensaje junto al formulario, conserva
 * los datos y no reintenta. 4.2: el 422 del servidor se proyecta a sus
 * campos vía `applyApiFieldErrors` (sillón ausente → campo con
 * `aria-invalid`) y no crea nada. Datos ficticios.
 */

function simularFalloEnCrearTurno(error: ApiErrorDePrueba): void {
  apiRequestMock.mockImplementation((ruta: string, opciones?: { method?: string }) => {
    const url = String(ruta);
    if (url === "/turnos" && opciones?.method === "POST") {
      return Promise.reject(error);
    }
    if (url.startsWith("/pacientes")) {
      return Promise.resolve({ items: [PACIENTE], total: 1, limit: 50, offset: 0 });
    }
    if (url.startsWith("/profesionales")) {
      return Promise.resolve([PROFESIONAL, PROFESIONAL_INACTIVO]);
    }
    if (url.startsWith("/sillones")) {
      return Promise.resolve([SILLON, SILLON_INACTIVO]);
    }
    if (url.startsWith("/prestaciones")) {
      return Promise.resolve([PRESTACION_30, PRESTACION_60, PRESTACION_INACTIVA]);
    }
    if (url.startsWith("/horarios-atencion")) {
      return Promise.resolve(HORARIOS);
    }
    if (url.startsWith("/bloqueos")) {
      return Promise.resolve(BLOQUEOS);
    }
    return Promise.reject(new Error(`ruta no simulada: ${url}`));
  });
}

function contarPostsTurnos(): number {
  return apiRequestMock.mock.calls.filter(
    ([ruta, opciones]) => String(ruta) === "/turnos" && opciones?.method === "POST",
  ).length;
}

describe("errores 409 por causa (4.1)", () => {
  it("409 profesional muestra su mensaje, conserva el formulario y no reintenta", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    simularFalloEnCrearTurno(
      new ApiErrorDePrueba({
        kind: "conflicto",
        status: 409,
        causa: "profesional",
        mensaje: "Solape de profesional",
        detalle: "El profesional ya tiene un turno",
      }),
    );
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T10:00", PRESTACION_30.id);
    await usuario.click(screen.getByRole("button", { name: "Crear turno" }));

    expect(
      await screen.findByText("Ese profesional ya tiene un turno en ese horario."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Ese sillón ya está ocupado en ese horario."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Turno creado")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Profesional" })).toHaveValue(
      PROFESIONAL.id,
    );
    expect(screen.getByRole("combobox", { name: "Sillón" })).toHaveValue(SILLON.id);
    expect(screen.getByLabelText("Inicio")).toHaveValue("2026-11-16T10:00");
    expect(contarPostsTurnos()).toBe(1);
  });

  it("409 sillon muestra un mensaje visiblemente distinto, conserva y no reintenta", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    simularFalloEnCrearTurno(
      new ApiErrorDePrueba({
        kind: "conflicto",
        status: 409,
        causa: "sillon",
        mensaje: "Solape de sillón",
        detalle: "El sillón ya está ocupado",
      }),
    );
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T10:00", PRESTACION_30.id);
    await usuario.click(screen.getByRole("button", { name: "Crear turno" }));

    expect(
      await screen.findByText("Ese sillón ya está ocupado en ese horario."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Ese profesional ya tiene un turno en ese horario."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Turno creado")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Profesional" })).toHaveValue(
      PROFESIONAL.id,
    );
    expect(screen.getByRole("combobox", { name: "Sillón" })).toHaveValue(SILLON.id);
    expect(screen.getByLabelText("Inicio")).toHaveValue("2026-11-16T10:00");
    expect(contarPostsTurnos()).toBe(1);
  });

  it("409 horario muestra su mensaje sin perder los datos", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    simularFalloEnCrearTurno(
      new ApiErrorDePrueba({
        kind: "conflicto",
        status: 409,
        causa: "horario",
        mensaje: "Fuera de horario",
        detalle: "Sin cobertura ese día",
      }),
    );
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T10:00", PRESTACION_30.id);
    await usuario.click(screen.getByRole("button", { name: "Crear turno" }));

    expect(
      await screen.findByText("Está fuera del horario de atención del profesional."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Turno creado")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Inicio")).toHaveValue("2026-11-16T10:00");
    expect(contarPostsTurnos()).toBe(1);
  });

  it("409 bloqueo muestra su mensaje sin perder los datos", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    simularFalloEnCrearTurno(
      new ApiErrorDePrueba({
        kind: "conflicto",
        status: 409,
        causa: "bloqueo",
        mensaje: "Hay un bloqueo",
        detalle: "Feriado ficticio",
      }),
    );
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T10:00", PRESTACION_30.id);
    await usuario.click(screen.getByRole("button", { name: "Crear turno" }));

    expect(await screen.findByText("Hay un bloqueo en ese horario.")).toBeInTheDocument();
    expect(screen.queryByText("Turno creado")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Inicio")).toHaveValue("2026-11-16T10:00");
    expect(contarPostsTurnos()).toBe(1);
  });
});

describe("error 422 a campos (4.2)", () => {
  it("422 sobre sillon_id marca el campo sillón y no crea nada", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    simularFalloEnCrearTurno(
      new ApiErrorDePrueba({
        kind: "validacion",
        status: 422,
        mensaje: "La request tiene campos inválidos: body.sillon_id: Field required",
        detalle: "body.sillon_id: Field required",
        campos: [{ ubicacion: "body.sillon_id", mensaje: "Field required" }],
      }),
    );
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T10:00", PRESTACION_30.id);
    await usuario.click(screen.getByRole("button", { name: "Crear turno" }));

    const sillon = await screen.findByRole("combobox", { name: "Sillón" });
    expect(sillon).toHaveAttribute("aria-invalid", "true");
    expect(await screen.findByText("Field required")).toBeInTheDocument();
    expect(screen.queryByText("Turno creado")).not.toBeInTheDocument();
    expect(screen.queryByText("Pendiente")).not.toBeInTheDocument();
    expect(contarPostsTurnos()).toBe(1);
  });
});

/**
 * Fix E2E obs 2 (C-16) — sin duplicación guía + 409.
 *
 * Cuando ya existe un fallo 409 visible, el aviso de la guía correspondiente
 * (mismo texto) se oculta: la guía sigue visible mientras no hay fallo. Sin
 * cambiar la conducta de envío ni los mensajes. Datos ficticios.
 */
describe("fix obs 2: sin duplicación guía + 409", () => {
  it("slot con bloqueo: la guía se ve antes del 409 y tras el 409 solo queda la alerta", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    BLOQUEOS = [bloqueoGlobal("2026-11-16T10:00:00", "2026-11-16T11:00:00")];
    simularFalloEnCrearTurno(
      new ApiErrorDePrueba({
        kind: "conflicto",
        status: 409,
        causa: "bloqueo",
        mensaje: "Hay un bloqueo",
        detalle: "Feriado ficticio",
      }),
    );
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T10:00", PRESTACION_30.id);

    // Antes del 409 la guía sigue visible (orientación, no validación).
    expect(
      await screen.findByText("Hay un bloqueo en ese horario."),
    ).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Crear turno" }));

    // Tras el 409 solo la alerta: sin el mismo texto apilado.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Hay un bloqueo en ese horario.",
    );
    expect(
      screen.queryAllByText("Hay un bloqueo en ese horario."),
    ).toHaveLength(1);
    expect(contarPostsTurnos()).toBe(1);
  });

  it("slot fuera de horario: la guía se ve antes del 409 y tras el 409 solo queda la alerta", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    simularFalloEnCrearTurno(
      new ApiErrorDePrueba({
        kind: "conflicto",
        status: 409,
        causa: "horario",
        mensaje: "Fuera de horario",
        detalle: "Sin cobertura ese día",
      }),
    );
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T15:00", PRESTACION_30.id);

    // Antes del 409 la guía sigue visible (orientación, no validación).
    expect(
      await screen.findByText("Está fuera del horario de atención del profesional."),
    ).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Crear turno" }));

    // Tras el 409 solo la alerta: sin el mismo texto apilado.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Está fuera del horario de atención del profesional.",
    );
    expect(
      screen.queryAllByText("Está fuera del horario de atención del profesional."),
    ).toHaveLength(1);
    expect(contarPostsTurnos()).toBe(1);
  });
});

/**
 * Fix E2E obs 3 (C-16) — login con `returnTo` no autorizado avisa.
 *
 * Al loguearse con `?returnTo=/turnos/nuevo` como odontólogo, el aterrizaje
 * en `/agenda` muestra "Permiso insuficiente." (el destino presenta el aviso
 * porque la navegación original fue denegada). Solo presentación: sin tocar
 * auth/sesión/token. Datos ficticios.
 */
describe("fix obs 3: login con returnTo no autorizado avisa", () => {
  it("odontólogo que entra con ?returnTo=/turnos/nuevo aterriza en /agenda con aviso", async () => {
    apiRequestMock.mockImplementation((ruta: string, opciones?: { method?: string }) => {
      if (String(ruta) === "/login" && opciones?.method === "POST") {
        return Promise.resolve({
          token: "jwt-de-prueba",
          rol: "odontologo",
          usuario: "odontologo-ficticio",
          sucursal_id: null,
        });
      }
      return Promise.reject(new Error(`ruta no simulada: ${String(ruta)}`));
    });
    const usuario = userEvent.setup();
    renderAt("/login?returnTo=%2Fturnos%2Fnuevo");

    await screen.findByRole("heading", { name: "Ingresar" });
    await usuario.type(screen.getByLabelText("DNI"), "USUARIO-FICT-001");
    await usuario.type(screen.getByLabelText("Contraseña"), "secreto-ficticio");
    await usuario.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("heading", { name: "Agenda" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Permiso insuficiente.");
  });
});
/**
 * RED de 5.1 y 5.2 (C-16) — éxito: card en pendiente con resumen + crear otro.
 *
 * 5.1: el 201 presenta la `Card` con `EstadoBadge` en `pendiente`, resumen de
 * 6 datos (paciente, profesional, prestación, sillón, inicio, fin) y acción
 * "crear otro". 5.2: "crear otro" es `reset()` conservando la caché del
 * catálogo (el formulario vuelve a vacío sin requests nuevas). Datos ficticios.
 */

function contarRequestsCatalogo(): number {
  return apiRequestMock.mock.calls.filter(([ruta]) => {
    const url = String(ruta);
    return (
      url.startsWith("/pacientes") ||
      url.startsWith("/profesionales") ||
      url.startsWith("/sillones") ||
      url.startsWith("/prestaciones") ||
      url.startsWith("/horarios-atencion") ||
      url.startsWith("/bloqueos")
    );
  }).length;
}

describe("éxito: card en pendiente y crear otro (5.1, 5.2)", () => {
  it("happy path: 201 muestra la card en pendiente con resumen y crear otro", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T10:00", PRESTACION_30.id);
    await usuario.click(screen.getByRole("button", { name: "Crear turno" }));

    expect(await screen.findByText("Turno creado")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText(/Ana Ficticia/)).toBeInTheDocument();
    expect(screen.getByText("Dra. Ficticia")).toBeInTheDocument();
    expect(screen.getByText("Limpieza Ficticia")).toBeInTheDocument();
    expect(screen.getByText("Sillón 1 Ficticio")).toBeInTheDocument();
    expect(screen.getByText("16/11/2026 10:00")).toBeInTheDocument();
    expect(screen.getByText("16/11/2026 10:30")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /crear otro/i }),
    ).toBeInTheDocument();
  });

  it("crear otro resetea el formulario a vacío sin requests nuevas de catálogo", async () => {
    HORARIOS = [HORARIO_LUNES_MANANA];
    sesionDe("recepcion");
    const usuario = userEvent.setup();
    renderAt("/turnos/nuevo");

    await screen.findByRole("heading", { name: "Nuevo turno" });
    await completarFormulario(usuario, "2026-11-16T10:00", PRESTACION_30.id);
    await usuario.click(screen.getByRole("button", { name: "Crear turno" }));
    await screen.findByText("Turno creado");

    const catalogoAntes = contarRequestsCatalogo();
    await usuario.click(screen.getByRole("button", { name: /crear otro/i }));

    expect(await screen.findByRole("button", { name: "Crear turno" })).toBeInTheDocument();
    expect(screen.queryByText("Turno creado")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Profesional" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Prestación" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Sillón" })).toHaveValue("");
    expect(screen.getByLabelText("Inicio")).toHaveValue("");
    // Ventana mayor al debounce del buscador: si el reset refetcheara el
    // catálogo, la request nueva ya habría ocurrido.
    await new Promise((resolver) => setTimeout(resolver, 400));
    expect(contarRequestsCatalogo()).toBe(catalogoAntes);
    expect(contarPostsTurnos()).toBe(1);
  });
});
