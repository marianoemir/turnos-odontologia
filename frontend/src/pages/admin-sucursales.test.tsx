/**
 * RED de 4.1 (C-22) — sección de sucursales de `/admin/sucursales`.
 *
 * `apiRequest` se reemplaza por un backend simulado con estado: responde según
 * el método y no según el orden de las llamadas, porque cada mutación vuelve a
 * pedir el listado. Datos ficticios.
 *
 * Afirma los escenarios de la spec `frontend-admin`: alta con confirmación, 409
 * `duplicate_nombre_sucursal` junto al campo `nombre` conservando lo escrito, y
 * baja lógica que pide confirmación y nunca borra. La autorización real es del
 * backend.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryRouter } from "react-router-dom";
import { SessionProvider } from "../auth/session-context";
import { apiRequest } from "../services/http";
import type { Sucursal, SucursalCreate, SucursalPatch } from "../types/api-admin";
import { ApiError } from "../types/errors";
import AdminSucursalesPage from "./admin-sucursales";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const CENTRO: Sucursal = {
  id: "33333333-3333-4333-8333-333333333333",
  nombre: "Sede Centro",
  direccion: "Calle Falsa 123",
  activo: true,
};

const NORTE: Sucursal = {
  id: "44444444-4444-4444-8444-444444444444",
  nombre: "Sede Norte",
  direccion: null,
  activo: false,
};

const ID_NUEVA = "55555555-5555-4555-8555-555555555555";

type Opciones = { method?: string; body?: unknown } | undefined;
type Usuario = ReturnType<typeof userEvent.setup>;

let sucursales: Sucursal[] = [];

function instalarBackend(rechazar?: (metodo: string) => Error | undefined): void {
  sucursales = [CENTRO, NORTE];
  apiRequestMock.mockImplementation(((ruta: string, opciones?: Opciones) => {
    const metodo = opciones?.method ?? "GET";
    const error = rechazar?.(metodo);
    if (error !== undefined) {
      return Promise.reject(error);
    }
    if (metodo === "POST") {
      const alta = opciones?.body as SucursalCreate;
      const nueva: Sucursal = {
        id: ID_NUEVA,
        nombre: alta.nombre,
        direccion: alta.direccion ?? null,
        activo: true,
      };
      sucursales = [...sucursales, nueva];
      return Promise.resolve(nueva);
    }
    if (metodo === "PATCH") {
      const id = ruta.split("/").at(-1);
      const parche = opciones?.body as SucursalPatch;
      sucursales = sucursales.map((s) => (s.id === id ? { ...s, ...parche } : s));
      return Promise.resolve(sucursales.find((s) => s.id === id));
    }
    if (!ruta.startsWith("/sucursales")) {
      return Promise.resolve([]);
    }
    return Promise.resolve(sucursales.map((s) => ({ ...s })));
  }) as never);
}

function duplicado(): ApiError {
  return new ApiError({
    kind: "conflicto",
    status: 409,
    causa: "duplicate_nombre_sucursal",
    mensaje: "Sucursal duplicada",
  });
}

beforeEach(() => {
  apiRequestMock.mockReset();
  instalarBackend();
});
afterEach(cleanup);

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SessionProvider><MemoryRouter><AdminSucursalesPage /></MemoryRouter></SessionProvider>
    </QueryClientProvider>,
  );
}

function llamadas(metodo: string) {
  return apiRequestMock.mock.calls.filter(([, opciones]) => (opciones?.method ?? "GET") === metodo);
}

async function abrirDialogo(boton: string, dialogo: string) {
  const usuario = userEvent.setup();
  await usuario.click(await screen.findByRole("button", { name: boton }));
  return { usuario, dialogo: await screen.findByRole("dialog", { name: dialogo }) };
}

async function escribir(
  usuario: Usuario,
  dialogo: HTMLElement,
  etiqueta: "Nombre" | "Dirección",
  texto: string,
): Promise<void> {
  const campo = within(dialogo).getByRole("textbox", { name: etiqueta });
  await usuario.clear(campo);
  if (texto !== "") {
    await usuario.type(campo, texto);
  }
}

async function guardar(usuario: Usuario, dialogo: HTMLElement): Promise<void> {
  await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));
}

describe("/admin/sucursales — sucursales", () => {
  it("lista las sucursales, inactivas incluidas, y solo ofrece desactivar las activas", async () => {
    renderPage();

    expect(await screen.findByRole("cell", { name: "Sede Centro" })).toBeInTheDocument();
    for (const encabezado of ["Nombre", "Dirección", "Estado", "Acciones"]) {
      expect(screen.getByRole("columnheader", { name: encabezado })).toBeInTheDocument();
    }
    expect(screen.getByRole("cell", { name: "Calle Falsa 123" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Sede Norte" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Sin dirección" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Activa" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Inactiva" })).toBeInTheDocument();
    expect(apiRequestMock.mock.calls.map(([ruta]) => ruta)).toContain("/sucursales?incluir_inactivos=true");
    expect(screen.getByRole("button", { name: "Desactivar Sede Centro" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desactivar Sede Norte" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar Sede Norte" })).toBeInTheDocument();
  });

  it("da de alta una sucursal: envía POST, cierra el modal, la lista y confirma", async () => {
    renderPage();

    const { usuario, dialogo } = await abrirDialogo("Nueva sucursal", "Nueva sucursal");
    await escribir(usuario, dialogo, "Nombre", "Sede Sur");
    await escribir(usuario, dialogo, "Dirección", "Ruta 40");
    await guardar(usuario, dialogo);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(llamadas("POST")).toEqual([
      ["/sucursales", { method: "POST", body: { nombre: "Sede Sur", direccion: "Ruta 40" } }],
    ]);
    expect(await screen.findByRole("cell", { name: "Sede Sur" })).toBeInTheDocument();
    expect(await screen.findByText("Sucursal creada.")).toHaveAttribute("role", "status");
  });

  it("el alta sin dirección envía solo el nombre", async () => {
    renderPage();

    const { usuario, dialogo } = await abrirDialogo("Nueva sucursal", "Nueva sucursal");
    await escribir(usuario, dialogo, "Nombre", "Sede Sur");
    await guardar(usuario, dialogo);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(llamadas("POST")).toEqual([
      ["/sucursales", { method: "POST", body: { nombre: "Sede Sur" } }],
    ]);
  });

  it("un nombre vacío muestra el error en el campo y no envía nada", async () => {
    renderPage();

    const { usuario, dialogo } = await abrirDialogo("Nueva sucursal", "Nueva sucursal");
    await guardar(usuario, dialogo);

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Ingresá un nombre.");
    expect(llamadas("POST")).toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("ante el 409 duplicate_nombre_sucursal lo asocia al campo nombre y conserva lo escrito", async () => {
    instalarBackend((metodo) => (metodo === "POST" ? duplicado() : undefined));
    renderPage();

    const { usuario, dialogo } = await abrirDialogo("Nueva sucursal", "Nueva sucursal");
    await escribir(usuario, dialogo, "Nombre", "Sede Centro");
    await escribir(usuario, dialogo, "Dirección", "Otra calle 9");
    await guardar(usuario, dialogo);

    const alerta = await within(dialogo).findByRole("alert");
    expect(alerta).toHaveTextContent("Ya existe una sucursal con ese nombre.");
    const campo = within(dialogo).getByRole("textbox", { name: "Nombre" });
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo.getAttribute("aria-describedby")).toBe(alerta.id);
    expect(campo).toHaveValue("Sede Centro");
    expect(within(dialogo).getByRole("textbox", { name: "Dirección" })).toHaveValue("Otra calle 9");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(/^Sucursal (creada|actualizada|desactivada)\.$/)).not.toBeInTheDocument();
  });

  it("ante cualquier otro error muestra un aviso genérico y deja reintentar", async () => {
    instalarBackend((metodo) => (metodo === "POST" ? new Error("sin conexión") : undefined));
    renderPage();

    const { usuario, dialogo } = await abrirDialogo("Nueva sucursal", "Nueva sucursal");
    await escribir(usuario, dialogo, "Nombre", "Sede Sur");
    await guardar(usuario, dialogo);

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "No se pudo guardar la sucursal.",
    );
    expect(within(dialogo).getByRole("button", { name: "Guardar" })).toBeEnabled();
    expect(screen.queryByText(/^Sucursal (creada|actualizada|desactivada)\.$/)).not.toBeInTheDocument();
  });

  it("edita una sucursal enviando solo los campos que cambiaron", async () => {
    renderPage();

    const { usuario, dialogo } = await abrirDialogo(
      "Editar Sede Centro",
      "Editar sucursal Sede Centro",
    );
    expect(within(dialogo).getByRole("textbox", { name: "Nombre" })).toHaveValue("Sede Centro");
    expect(within(dialogo).getByRole("textbox", { name: "Dirección" })).toHaveValue(
      "Calle Falsa 123",
    );
    await escribir(usuario, dialogo, "Nombre", "Sede Central");
    await guardar(usuario, dialogo);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(llamadas("PATCH")).toEqual([
      [`/sucursales/${CENTRO.id}`, { method: "PATCH", body: { nombre: "Sede Central" } }],
    ]);
    expect(await screen.findByRole("cell", { name: "Sede Central" })).toBeInTheDocument();
    expect(await screen.findByText("Sucursal actualizada.")).toHaveAttribute("role", "status");
  });

  it("vaciar la dirección envía cadena vacía y nunca null", async () => {
    renderPage();

    const { usuario, dialogo } = await abrirDialogo(
      "Editar Sede Centro",
      "Editar sucursal Sede Centro",
    );
    await escribir(usuario, dialogo, "Dirección", "");
    await guardar(usuario, dialogo);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(llamadas("PATCH")).toEqual([
      [`/sucursales/${CENTRO.id}`, { method: "PATCH", body: { direccion: "" } }],
    ]);
  });

  it("desactivar pide confirmación, envía activo false y no borra la sucursal", async () => {
    renderPage();

    const { usuario, dialogo } = await abrirDialogo(
      "Desactivar Sede Centro",
      "Desactivar sucursal Sede Centro",
    );
    expect(llamadas("PATCH")).toHaveLength(0);
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(llamadas("PATCH")).toEqual([
      [`/sucursales/${CENTRO.id}`, { method: "PATCH", body: { activo: false } }],
    ]);
    expect(llamadas("DELETE")).toHaveLength(0);
    await waitFor(() =>
      expect(screen.getAllByRole("cell", { name: "Inactiva" })).toHaveLength(2),
    );
    expect(screen.getByRole("cell", { name: "Sede Centro" })).toBeInTheDocument();
    expect(screen.queryAllByRole("cell", { name: "Activa" })).toHaveLength(0);
    expect(await screen.findByText("Sucursal desactivada.")).toHaveAttribute("role", "status");
  });

  it("cancelar la confirmación no envía nada y deja la sucursal activa", async () => {
    renderPage();

    const { usuario, dialogo } = await abrirDialogo(
      "Desactivar Sede Centro",
      "Desactivar sucursal Sede Centro",
    );
    await usuario.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(llamadas("PATCH")).toHaveLength(0);
    expect(llamadas("DELETE")).toHaveLength(0);
    expect(screen.getByRole("cell", { name: "Activa" })).toBeInTheDocument();
  });
});