/**
 * RED de 4.3 (C-22) — sucursal activa de solo lectura en `/admin`.
 *
 * `apiRequest` se reemplaza por un backend simulado que respeta el parámetro
 * `incluir_inactivos`: sin él devuelve solo las sucursales activas, así que
 * resolver una sucursal inactiva exige pedirlas con inactivas incluidas. Datos
 * ficticios. La sucursal activa sale de la sesión (claim del token); el cliente
 * nunca la cambia ni envía `X-Sucursal-Id`. La autorización real es del backend.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession, getSession, setSession } from "../auth/session";
import { SessionProvider } from "../auth/session-context";
import { apiRequest } from "../services/http";
import type { Sucursal } from "../types/api-admin";
import { SucursalActiva } from "./admin-sucursal-activa";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

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

const ID_INEXISTENTE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const SUCURSALES: Sucursal[] = [CENTRO, NORTE];

function instalarBackend(): void {
  apiRequestMock.mockImplementation(((ruta: string) => {
    const todas = ruta.includes("incluir_inactivos=true");
    return Promise.resolve(SUCURSALES.filter((s) => todas || s.activo).map((s) => ({ ...s })));
  }) as never);
}

beforeEach(() => {
  apiRequestMock.mockReset();
  instalarBackend();
});

afterEach(() => {
  cleanup();
  clearSession();
});

function iniciarSesion(sucursalId: string | null): void {
  setSession({
    token: "jwt-de-prueba",
    rol: "admin",
    usuario: "admin-ficticio",
    sucursalId,
  });
}

function renderSucursalActiva() {
  const router = createMemoryRouter(
    [
      { path: "/admin", element: <SucursalActiva /> },
      { path: "/login", element: <p>Pantalla de ingreso</p> },
    ],
    { initialEntries: ["/admin"] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <SessionProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </SessionProvider>,
  );
  return router;
}

describe("/admin — sucursal activa de solo lectura", () => {
  it("muestra el nombre de la sucursal del token sin ningún control que la modifique", async () => {
    iniciarSesion(CENTRO.id);
    renderSucursalActiva();

    expect(await screen.findByText("Sede Centro")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Cambiar de sucursal" })).toBeInTheDocument();
  });

  it("resuelve también una sucursal inactiva, porque pide el listado con inactivas incluidas", async () => {
    iniciarSesion(NORTE.id);
    renderSucursalActiva();

    expect(await screen.findByText("Sede Norte")).toBeInTheDocument();
    expect(apiRequestMock.mock.calls.map(([ruta]) => ruta)).toContain(
      "/sucursales?incluir_inactivos=true",
    );
  });

  it("si el id del token no está en el listado lo dice en vez de inventar un nombre", async () => {
    iniciarSesion(ID_INEXISTENTE);
    renderSucursalActiva();

    expect(await screen.findByText("Sucursal desconocida")).toBeInTheDocument();
  });

  it("sin sucursal asociada indica que no hay sucursal y que no se aplica filtro", async () => {
    iniciarSesion(null);
    renderSucursalActiva();

    expect(screen.getByText("Sin sucursal asociada (sin filtro).")).toBeInTheDocument();
    expect(screen.queryByText("Sede Centro")).not.toBeInTheDocument();
  });

  it("si falla la carga del listado avisa que no pudo obtener el nombre", async () => {
    iniciarSesion(CENTRO.id);
    apiRequestMock.mockImplementation((() => Promise.reject(new Error("sin conexión"))) as never);
    renderSucursalActiva();

    expect(
      await screen.findByText("No se pudo cargar el nombre de la sucursal."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar de sucursal" })).toBeEnabled();
  });

  it("«Cambiar de sucursal» cierra la sesión y navega a /login", async () => {
    iniciarSesion(CENTRO.id);
    const router = renderSucursalActiva();
    const usuario = userEvent.setup();

    await screen.findByText("Sede Centro");
    await usuario.click(screen.getByRole("button", { name: "Cambiar de sucursal" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(getSession()).toBeNull();
    expect(screen.getByText("Pantalla de ingreso")).toBeInTheDocument();
  });

  it("ninguna request lleva X-Sucursal-Id", async () => {
    iniciarSesion(CENTRO.id);
    renderSucursalActiva();
    const usuario = userEvent.setup();

    await screen.findByText("Sede Centro");
    await usuario.click(screen.getByRole("button", { name: "Cambiar de sucursal" }));
    await waitFor(() => expect(getSession()).toBeNull());

    expect(apiRequestMock).toHaveBeenCalled();
    const conCabecera = apiRequestMock.mock.calls.filter(([, opciones]) =>
      JSON.stringify(opciones ?? {})
        .toLowerCase()
        .includes("x-sucursal-id"),
    );
    expect(conCabecera).toHaveLength(0);
  });
});
