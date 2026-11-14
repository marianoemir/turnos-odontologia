/**
 * RED de 3.1 (C-22) — pantalla `/admin/roles`, listado en solo lectura.
 *
 * `apiRequest` se reemplaza por un doble: se afirma qué se muestra y qué se
 * pide, no el transporte (eso lo cubre `http.test.ts`). Los datos son
 * ficticios; los permisos de ejemplo no pretenden reflejar la matriz real.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../services/http";
import type { Rol } from "../types/api-admin";
import AdminRolesPage from "./admin-roles";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const ROLES: Rol[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    nombre: "admin",
    descripcion: "Acceso total",
    activo: true,
    permisos: ["admin:gestionar", "caja:cobrar"],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    nombre: "recepcion",
    descripcion: null,
    activo: true,
    permisos: [],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    nombre: "auditor",
    descripcion: "Solo lectura",
    activo: false,
    permisos: ["agenda:leer"],
  },
];

beforeEach(() => { apiRequestMock.mockReset(); });
afterEach(cleanup);

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AdminRolesPage />
    </QueryClientProvider>,
  );
}

describe("/admin/roles — listado en solo lectura", () => {
  it("muestra el estado de carga mientras espera la respuesta", async () => {
    apiRequestMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(
      await screen.findByRole("status", { name: "Cargando resultados" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Roles", level: 1 }),
    ).toBeInTheDocument();
  });

  it("lista cada rol con nombre, descripción, estado y permisos", async () => {
    apiRequestMock.mockResolvedValue(ROLES);
    renderPage();

    const tabla = await screen.findByRole("table");

    for (const encabezado of ["Nombre", "Descripción", "Estado", "Permisos"]) {
      expect(
        within(tabla).getByRole("columnheader", { name: encabezado }),
      ).toBeInTheDocument();
    }
    for (const celda of [
      "admin",
      "Acceso total",
      "admin:gestionar, caja:cobrar",
      "recepcion",
      "Sin descripción",
      "Sin permisos",
      "auditor",
      "Solo lectura",
      "Inactivo",
      "agenda:leer",
    ]) {
      expect(within(tabla).getByRole("cell", { name: celda })).toBeInTheDocument();
    }
    expect(within(tabla).getAllByRole("cell", { name: "Activo" })).toHaveLength(2);
    expect(apiRequestMock.mock.calls[0]?.[0]).toBe("/roles");
  });

  it("no ofrece controles para cambiar el nombre, desactivar ni crear roles", async () => {
    apiRequestMock.mockResolvedValue(ROLES);
    renderPage();

    await screen.findByRole("table");

    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(
      screen.queryAllByRole("button", { name: /activar|crear|nuevo|nombre/i }),
    ).toHaveLength(0);
  });

  it("muestra un estado vacío propio cuando no hay roles", async () => {
    apiRequestMock.mockResolvedValue([]);
    renderPage();

    expect(
      await screen.findByRole("status", { name: "No hay roles." }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("muestra el error de carga y permite reintentar", async () => {
    apiRequestMock
      .mockRejectedValueOnce(new Error("sin conexión"))
      .mockResolvedValueOnce(ROLES);
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudieron cargar los roles.",
    );

    await userEvent.setup().click(
      screen.getByRole("button", { name: "Reintentar" }),
    );

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
  });
});