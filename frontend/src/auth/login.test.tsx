import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearSession, getSession } from "./session";
import { SessionProvider } from "./session-context";
import { routes } from "../app/router";

afterEach(() => {
  cleanup();
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("login", () => {
  it("inicia la sesión desde la respuesta del servidor y vuelve sólo a la ruta interna permitida", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            token: "header.eyJleHAiOjQxMDAwMDAwMDB9.signature",
            rol: "recepcion",
            usuario: "usuario-ficticio",
            sucursal_id: "5b8f0d6e-3a2c-4a41-9f0e-7a1f6b0c9d21",
          }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const router = createMemoryRouter(routes, {
      initialEntries: ["/login?returnTo=%2Fturnos%2Fnuevo"],
    });
    const user = userEvent.setup();

    render(
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>,
    );
    await user.type(screen.getByLabelText("DNI"), "USUARIO-FICT-001");
    await user.type(screen.getByLabelText("Contraseña"), "secreto-no-renderizado");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("heading", { name: "Nuevo turno" })).toBeInTheDocument();
    expect(getSession()).toMatchObject({
      token: "header.eyJleHAiOjQxMDAwMDAwMDB9.signature",
      rol: "recepcion",
      usuario: "usuario-ficticio",
      sucursalId: "5b8f0d6e-3a2c-4a41-9f0e-7a1f6b0c9d21",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          dni: "USUARIO-FICT-001",
          password: "secreto-no-renderizado",
        }),
      }),
    );
    expect(screen.queryByText("secreto-no-renderizado")).not.toBeInTheDocument();
  });

  it.each([
    [401, { detail: { causa: "credenciales_invalidas", detalle: "No usar." } }, "Credenciales inválidas."],
    [403, { detail: { causa: "cuenta_inactiva", detalle: "No usar." } }, "No es posible iniciar sesión con esta cuenta."],
    [422, { detail: [{ loc: ["body", "dni"], msg: "No usar.", type: "value_error" }] }, "Revisá los datos ingresados."],
  ])("mantiene la sesión anónima y no filtra la contraseña ante %i", async (status, body, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
    );
    const router = createMemoryRouter(routes, { initialEntries: ["/login"] });
    const user = userEvent.setup();
    const password = "secreto-no-renderizado";

    render(
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>,
    );
    await user.type(screen.getByLabelText("DNI"), "USUARIO-FICT-001");
    await user.type(screen.getByLabelText("Contraseña"), password);
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(getSession()).toBeNull();
    expect(screen.queryByText(password)).not.toBeInTheDocument();
  });

  it("solicita una sucursal manual sólo para el 422 exacto de C-24 sin iniciar sesión", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            detail: {
              causa: "sucursal_requerida",
              detalle: "Debe especificar una sucursal_id entre las asociadas",
            },
          }),
          { status: 422 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const router = createMemoryRouter(routes, { initialEntries: ["/login"] });
    const user = userEvent.setup();

    render(
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>,
    );
    await user.type(screen.getByLabelText("DNI"), "USUARIO-FICT-001");
    await user.type(screen.getByLabelText("Contraseña"), "secreto-no-renderizado");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByLabelText("Sucursal ID")).toHaveAttribute("inputmode", "text");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSession()).toBeNull();
  });

  it("mantiene el tratamiento normal para un 422 parecido pero no exacto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              detail: {
                causa: "sucursal_requerida",
                detalle: "Detalle distinto.",
              },
            }),
            { status: 422 },
          ),
        ),
      ),
    );
    const router = createMemoryRouter(routes, { initialEntries: ["/login"] });
    const user = userEvent.setup();

    render(
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>,
    );
    await user.type(screen.getByLabelText("DNI"), "USUARIO-FICT-001");
    await user.type(screen.getByLabelText("Contraseña"), "secreto-no-renderizado");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Revisá los datos ingresados.");
    expect(screen.queryByLabelText("Sucursal ID")).not.toBeInTheDocument();
    expect(getSession()).toBeNull();
  });

  it("bloquea un identificador de sucursal que no es UUID antes de reintentar", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            detail: {
              causa: "sucursal_requerida",
              detalle: "Debe especificar una sucursal_id entre las asociadas",
            },
          }),
          { status: 422 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const router = createMemoryRouter(routes, { initialEntries: ["/login"] });
    const user = userEvent.setup();

    render(
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>,
    );
    await user.type(screen.getByLabelText("DNI"), "USUARIO-FICT-001");
    await user.type(screen.getByLabelText("Contraseña"), "secreto-no-renderizado");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    await user.type(await screen.findByLabelText("Sucursal ID"), "no-es-un-uuid");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ingresá una sucursal ID UUID válida.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSession()).toBeNull();
  });

  it("reintenta una vez con la sucursal manual y conserva el anonimato ante sucursal no asociada", async () => {
    const dni = "USUARIO-FICT-001";
    const password = "secreto-no-renderizado";
    const sucursalId = "5b8f0d6e-3a2c-4a41-9f0e-7a1f6b0c9d21";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: {
              causa: "sucursal_requerida",
              detalle: "Debe especificar una sucursal_id entre las asociadas",
            },
          }),
          { status: 422 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: {
              causa: "sucursal_no_asociada",
              detalle: "El usuario no está asociado a la sucursal indicada",
            },
          }),
          { status: 403 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const consoleLog = vi.spyOn(console, "log");
    const consoleWarn = vi.spyOn(console, "warn");
    const consoleError = vi.spyOn(console, "error");
    const router = createMemoryRouter(routes, { initialEntries: ["/login"] });
    const user = userEvent.setup();

    render(
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>,
    );
    await user.type(screen.getByLabelText("DNI"), dni);
    await user.type(screen.getByLabelText("Contraseña"), password);
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    await user.type(await screen.findByLabelText("Sucursal ID"), sucursalId);
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La sucursal indicada no está autorizada.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({ dni, password }),
      }),
    );
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({ dni, password, sucursal_id: sucursalId }),
      }),
    );
    expect(getSession()).toBeNull();
    expect(router.state.location.pathname + router.state.location.search).toBe("/login");
    expect(router.state.location.search).not.toContain(sucursalId);
    expect(router.state.location.search).not.toContain(password);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
