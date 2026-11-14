/**
 * RED de 4.2 (C-22) — asignaciones usuario–sucursal de `/admin/sucursales`.
 *
 * `apiRequest` se reemplaza por un backend simulado con estado que responde
 * según la ruta y el método: la sección pide roles, sucursales y asignaciones.
 * Datos ficticios. `usuario` es texto libre y el `PATCH` del backend no lo
 * acepta, por eso la edición lo muestra y no lo deja cambiar. La autorización
 * real es del backend.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../services/http";
import type {
  Rol,
  Sucursal,
  UsuarioSucursal,
  UsuarioSucursalCreate,
  UsuarioSucursalPatch,
} from "../types/api-admin";
import { ApiError } from "../types/errors";
import { SeccionAsignaciones } from "./admin-asignaciones";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const RECEPCION: Rol = {
  id: "22222222-2222-4222-8222-222222222222",
  nombre: "recepcion",
  descripcion: null,
  activo: true,
  permisos: [],
};

const ODONTOLOGO: Rol = {
  id: "77777777-7777-4777-8777-777777777777",
  nombre: "odontologo",
  descripcion: null,
  activo: true,
  permisos: [],
};

const PACIENTE: Rol = {
  id: "12121212-1212-4212-8212-121212121212",
  nombre: "paciente",
  descripcion: null,
  activo: false,
  permisos: [],
};

const ROLES: Rol[] = [RECEPCION, ODONTOLOGO, PACIENTE];

const CENTRO: Sucursal = {
  id: "33333333-3333-4333-8333-333333333333",
  nombre: "Sede Centro",
  direccion: null,
  activo: true,
};

const NORTE: Sucursal = {
  id: "44444444-4444-4444-8444-444444444444",
  nombre: "Sede Norte",
  direccion: null,
  activo: false,
};

const SUR: Sucursal = {
  id: "66666666-6666-4666-8666-666666666666",
  nombre: "Sede Sur",
  direccion: null,
  activo: true,
};

const SUCURSALES: Sucursal[] = [CENTRO, NORTE, SUR];

const ANA: UsuarioSucursal = {
  id: "88888888-8888-4888-8888-888888888888",
  usuario: "ana.perez",
  rol_id: RECEPCION.id,
  sucursal_id: CENTRO.id,
  activo: true,
  creado_en: "2026-01-05T10:00:00Z",
};

const BETO: UsuarioSucursal = {
  id: "99999999-9999-4999-8999-999999999999",
  usuario: "beto.gomez",
  rol_id: ODONTOLOGO.id,
  sucursal_id: NORTE.id,
  activo: false,
  creado_en: "2026-01-06T10:00:00Z",
};

const ID_NUEVA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Opciones = { method?: string; body?: unknown } | undefined;
type Usuario = ReturnType<typeof userEvent.setup>;

let asignaciones: UsuarioSucursal[] = [];

function instalarBackend(rechazar?: (metodo: string) => Error | undefined): void {
  asignaciones = [ANA, BETO];
  apiRequestMock.mockImplementation(((ruta: string, opciones?: Opciones) => {
    const metodo = opciones?.method ?? "GET";
    if (ruta.startsWith("/roles")) {
      return Promise.resolve(ROLES);
    }
    if (ruta.startsWith("/sucursales")) {
      return Promise.resolve(SUCURSALES);
    }
    const error = rechazar?.(metodo);
    if (error !== undefined) {
      return Promise.reject(error);
    }
    if (metodo === "POST") {
      const alta = opciones?.body as UsuarioSucursalCreate;
      const nueva: UsuarioSucursal = {
        id: ID_NUEVA,
        ...alta,
        activo: true,
        creado_en: "2026-02-01T10:00:00Z",
      };
      asignaciones = [...asignaciones, nueva];
      return Promise.resolve(nueva);
    }
    if (metodo === "PATCH") {
      const id = ruta.split("/").at(-1);
      const parche = opciones?.body as UsuarioSucursalPatch;
      asignaciones = asignaciones.map((a) => (a.id === id ? { ...a, ...parche } : a));
      return Promise.resolve(asignaciones.find((a) => a.id === id));
    }
    return Promise.resolve(asignaciones.map((a) => ({ ...a })));
  }) as never);
}

function duplicada(): ApiError {
  return new ApiError({
    kind: "conflicto",
    status: 409,
    causa: "duplicate_usuario_sucursal",
    mensaje: "Asignación duplicada",
  });
}

beforeEach(() => {
  apiRequestMock.mockReset();
  instalarBackend();
});
afterEach(cleanup);

function renderSeccion(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SeccionAsignaciones />
    </QueryClientProvider>,
  );
}

function llamadas(metodo: string) {
  return apiRequestMock.mock.calls.filter(([, opciones]) => (opciones?.method ?? "GET") === metodo);
}

async function abrirDialogo(boton: string, dialogo: string) {
  const usuario = userEvent.setup();
  await screen.findByRole("cell", { name: "ana.perez" });
  await usuario.click(screen.getByRole("button", { name: boton }));
  return { usuario, dialogo: await screen.findByRole("dialog", { name: dialogo }) };
}

async function elegir(
  usuario: Usuario,
  dialogo: HTMLElement,
  etiqueta: "Rol" | "Sucursal",
  opcion: string,
): Promise<void> {
  await usuario.selectOptions(within(dialogo).getByRole("combobox", { name: etiqueta }), opcion);
}

async function completarAlta(
  usuario: Usuario,
  dialogo: HTMLElement,
  nombre: string,
  rol: string,
  sucursal: string,
): Promise<void> {
  await usuario.type(within(dialogo).getByRole("textbox", { name: "Usuario" }), nombre);
  await elegir(usuario, dialogo, "Rol", rol);
  await elegir(usuario, dialogo, "Sucursal", sucursal);
}

async function guardar(usuario: Usuario, dialogo: HTMLElement): Promise<void> {
  await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));
}

function textos(select: HTMLElement): (string | null)[] {
  return within(select)
    .getAllByRole("option")
    .map((opcion) => opcion.textContent);
}

describe("/admin/sucursales — asignaciones usuario–sucursal", () => {
  it("lista las asignaciones con el nombre del rol y de la sucursal", async () => {
    renderSeccion();

    expect(await screen.findByRole("cell", { name: "ana.perez" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Asignaciones" })).toBeInTheDocument();
    for (const encabezado of ["Usuario", "Rol", "Sucursal", "Estado", "Acciones"]) {
      expect(screen.getByRole("columnheader", { name: encabezado })).toBeInTheDocument();
    }
    expect(screen.getByRole("cell", { name: "beto.gomez" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "recepcion" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "odontologo" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Sede Centro" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Sede Norte" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Activa" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Inactiva" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Editar asignación de ana.perez" }),
    ).toBeInTheDocument();
    const rutas = apiRequestMock.mock.calls.map(([ruta]) => ruta);
    expect(rutas).toContain("/usuarios-sucursal");
    expect(rutas).toContain("/roles");
    expect(rutas).toContain("/sucursales?incluir_inactivos=true");
  });

  it("el alta ofrece solo roles y sucursales activos, con una opción inicial vacía", async () => {
    renderSeccion();

    const { dialogo } = await abrirDialogo("Nueva asignación", "Nueva asignación");

    const rol = within(dialogo).getByRole("combobox", { name: "Rol" });
    const sucursal = within(dialogo).getByRole("combobox", { name: "Sucursal" });
    expect(rol).toHaveValue("");
    expect(sucursal).toHaveValue("");
    expect(textos(rol)).toEqual(["Elegí un rol", "recepcion", "odontologo"]);
    expect(textos(sucursal)).toEqual(["Elegí una sucursal", "Sede Centro", "Sede Sur"]);
  });

  it("da de alta una asignación: envía POST, cierra el modal, la lista y confirma", async () => {
    renderSeccion();

    const { usuario, dialogo } = await abrirDialogo("Nueva asignación", "Nueva asignación");
    await completarAlta(usuario, dialogo, "carla.diaz", "odontologo", "Sede Sur");
    await guardar(usuario, dialogo);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(llamadas("POST")).toEqual([
      [
        "/usuarios-sucursal",
        {
          method: "POST",
          body: { usuario: "carla.diaz", rol_id: ODONTOLOGO.id, sucursal_id: SUR.id },
        },
      ],
    ]);
    expect(await screen.findByRole("cell", { name: "carla.diaz" })).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Asignación creada.");
  });

  it("sin completar el formulario muestra los errores de cada campo y no envía nada", async () => {
    renderSeccion();

    const { usuario, dialogo } = await abrirDialogo("Nueva asignación", "Nueva asignación");
    await guardar(usuario, dialogo);

    expect(await within(dialogo).findByText("Ingresá un usuario.")).toBeInTheDocument();
    expect(within(dialogo).getByText("Elegí un rol.")).toBeInTheDocument();
    expect(within(dialogo).getByText("Elegí una sucursal.")).toBeInTheDocument();
    expect(llamadas("POST")).toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("ante el 409 duplicate_usuario_sucursal lo asocia al campo usuario y no agrega una fila", async () => {
    instalarBackend((metodo) => (metodo === "POST" ? duplicada() : undefined));
    renderSeccion();

    const { usuario, dialogo } = await abrirDialogo("Nueva asignación", "Nueva asignación");
    await completarAlta(usuario, dialogo, "ana.perez", "recepcion", "Sede Centro");
    await guardar(usuario, dialogo);

    const alerta = await within(dialogo).findByRole("alert");
    expect(alerta).toHaveTextContent("Ya existe una asignación de ese usuario en esa sucursal.");
    const campo = within(dialogo).getByRole("textbox", { name: "Usuario" });
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo.getAttribute("aria-describedby")).toBe(alerta.id);
    expect(campo).toHaveValue("ana.perez");
    expect(within(dialogo).getByRole("combobox", { name: "Rol" })).toHaveValue(RECEPCION.id);
    expect(within(dialogo).getByRole("combobox", { name: "Sucursal" })).toHaveValue(CENTRO.id);
    expect(screen.getAllByRole("cell", { name: "ana.perez" })).toHaveLength(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ante el 404 informa que el rol o la sucursal ya no existen, sin reintentar", async () => {
    instalarBackend((metodo) =>
      metodo === "POST"
        ? new ApiError({ kind: "no_encontrado", status: 404, mensaje: "Rol no encontrado" })
        : undefined,
    );
    renderSeccion();

    const { usuario, dialogo } = await abrirDialogo("Nueva asignación", "Nueva asignación");
    await completarAlta(usuario, dialogo, "carla.diaz", "odontologo", "Sede Sur");
    await guardar(usuario, dialogo);

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("ya no existen");
    expect(llamadas("POST")).toHaveLength(1);
    expect(within(dialogo).queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "carla.diaz" })).not.toBeInTheDocument();
  });

  it("ante cualquier otro error muestra un aviso genérico y deja reintentar", async () => {
    instalarBackend((metodo) => (metodo === "POST" ? new Error("sin conexión") : undefined));
    renderSeccion();

    const { usuario, dialogo } = await abrirDialogo("Nueva asignación", "Nueva asignación");
    await completarAlta(usuario, dialogo, "carla.diaz", "odontologo", "Sede Sur");
    await guardar(usuario, dialogo);

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "No se pudo guardar la asignación.",
    );
    expect(within(dialogo).getByRole("button", { name: "Guardar" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("edita el rol enviando solo lo que cambió y no deja cambiar el usuario", async () => {
    renderSeccion();

    const { usuario, dialogo } = await abrirDialogo(
      "Editar asignación de ana.perez",
      "Editar asignación de ana.perez",
    );
    expect(within(dialogo).getByText("ana.perez")).toBeInTheDocument();
    expect(within(dialogo).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(dialogo).getByRole("combobox", { name: "Rol" })).toHaveValue(RECEPCION.id);
    expect(within(dialogo).getByRole("combobox", { name: "Sucursal" })).toHaveValue(CENTRO.id);
    await elegir(usuario, dialogo, "Rol", "odontologo");
    await guardar(usuario, dialogo);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(llamadas("PATCH")).toEqual([
      [`/usuarios-sucursal/${ANA.id}`, { method: "PATCH", body: { rol_id: ODONTOLOGO.id } }],
    ]);
    await waitFor(() =>
      expect(screen.getAllByRole("cell", { name: "odontologo" })).toHaveLength(2),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Asignación actualizada.");
  });

  it("guardar sin cambios cierra el modal sin enviar nada", async () => {
    renderSeccion();

    const { usuario, dialogo } = await abrirDialogo(
      "Editar asignación de ana.perez",
      "Editar asignación de ana.perez",
    );
    await guardar(usuario, dialogo);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(llamadas("PATCH")).toHaveLength(0);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ante el 409 al cambiar de sucursal lo asocia al selector de sucursal", async () => {
    instalarBackend((metodo) => (metodo === "PATCH" ? duplicada() : undefined));
    renderSeccion();

    const { usuario, dialogo } = await abrirDialogo(
      "Editar asignación de ana.perez",
      "Editar asignación de ana.perez",
    );
    await elegir(usuario, dialogo, "Sucursal", "Sede Sur");
    await guardar(usuario, dialogo);

    const alerta = await within(dialogo).findByRole("alert");
    expect(alerta).toHaveTextContent("Ya existe una asignación de ese usuario en esa sucursal.");
    const selector = within(dialogo).getByRole("combobox", { name: "Sucursal" });
    expect(selector).toHaveAttribute("aria-invalid", "true");
    expect(selector.getAttribute("aria-describedby")).toBe(alerta.id);
    expect(llamadas("PATCH")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("al editar conserva ofrecida y seleccionada la sucursal inactiva de la asignación", async () => {
    renderSeccion();

    const { dialogo } = await abrirDialogo(
      "Editar asignación de beto.gomez",
      "Editar asignación de beto.gomez",
    );

    const sucursal = within(dialogo).getByRole("combobox", { name: "Sucursal" });
    expect(textos(sucursal)).toEqual([
      "Elegí una sucursal",
      "Sede Centro",
      "Sede Norte",
      "Sede Sur",
    ]);
    expect(sucursal).toHaveValue(NORTE.id);
  });

  it("si falla la carga muestra el aviso con reintento y deshabilita el alta", async () => {
    instalarBackend((metodo) => (metodo === "GET" ? new Error("sin conexión") : undefined));
    renderSeccion();

    expect(await screen.findByText("No se pudieron cargar las asignaciones.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Nueva asignación" })).toBeDisabled();
  });
});
