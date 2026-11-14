/**
 * RED de 3.2 (C-22) — edición de la descripción de un rol en `/admin/roles`.
 *
 * `apiRequest` se reemplaza por un doble. Las llamadas llegan en orden: la
 * primera es `GET /roles`, la segunda el `PATCH` y, si el `PATCH` tiene éxito,
 * la tercera es el `GET` de refresco por la invalidación. Datos ficticios.
 *
 * El guard y el 403 son navegación y comodidad: la autorización real es del
 * backend. Acá se afirma cómo reacciona la pantalla a esas respuestas.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSession, getSession, setSession } from "../auth/session";
import { apiRequest } from "../services/http";
import type { Rol } from "../types/api-admin";
import { ApiError } from "../types/errors";
import AdminRolesPage from "./admin-roles";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const ADMIN: Rol = {
    id: "11111111-1111-4111-8111-111111111111",
    nombre: "admin",
    descripcion: "Acceso total",
    activo: true,
    permisos: ["admin:gestionar"],
};

const RECEPCION: Rol = {
    id: "22222222-2222-4222-8222-222222222222",
    nombre: "recepcion",
    descripcion: null,
    activo: true,
    permisos: [],
};

const ROLES: Rol[] = [ADMIN, RECEPCION];

beforeEach(() => {
    apiRequestMock.mockReset();
    setSession({ token: "jwt-de-prueba", rol: "admin", usuario: "usuario-ficticio", sucursalId: null });
});
afterEach(() => {
    cleanup();
    clearSession();
});

function renderPage(): void {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <AdminRolesPage />
        </QueryClientProvider>,
    );
}

async function abrirEdicion(nombre: string) {
    const usuario = userEvent.setup();
    await usuario.click(
        await screen.findByRole("button", { name: `Editar descripción de ${nombre}` }),
    );
    const dialogo = await screen.findByRole("dialog", {
        name: `Editar descripción de ${nombre}`,
    });
    return { usuario, dialogo };
}

async function guardarConTexto(
    usuario: ReturnType<typeof userEvent.setup>,
    dialogo: HTMLElement,
    texto: string,
): Promise<void> {
    const campo = within(dialogo).getByRole("textbox", { name: "Descripción" });
    await usuario.clear(campo);
    await usuario.type(campo, texto);
    await usuario.click(within(dialogo).getByRole("button", { name: "Guardar" }));
}

describe("/admin/roles — edición de la descripción", () => {
    it("abre un modal con la descripción actual y sin campo para el nombre", async () => {
        apiRequestMock.mockResolvedValue(ROLES);
        renderPage();

        const { dialogo } = await abrirEdicion("admin");

        expect(within(dialogo).getByRole("textbox", { name: "Descripción" })).toHaveValue(
            "Acceso total",
        );
        expect(within(dialogo).getAllByRole("textbox")).toHaveLength(1);
        expect(within(dialogo).queryAllByRole("checkbox")).toHaveLength(0);
    });

    it("un rol sin descripción abre el campo vacío", async () => {
        apiRequestMock.mockResolvedValue(ROLES);
        renderPage();

        const { dialogo } = await abrirEdicion("recepcion");

        expect(within(dialogo).getByRole("textbox", { name: "Descripción" })).toHaveValue("");
    });

    it("guarda enviando únicamente descripcion, cierra el modal y refresca el listado", async () => {
        apiRequestMock
            .mockResolvedValueOnce(ROLES)
            .mockResolvedValueOnce({ ...ADMIN, descripcion: "Acceso completo" })
            .mockResolvedValue([{ ...ADMIN, descripcion: "Acceso completo" }, RECEPCION]);
        renderPage();

        const { usuario, dialogo } = await abrirEdicion("admin");
        await guardarConTexto(usuario, dialogo, "Acceso completo");

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(apiRequestMock.mock.calls[1]).toEqual([
            `/roles/${ADMIN.id}`,
            { method: "PATCH", body: { descripcion: "Acceso completo" } },
        ]);
        expect(await screen.findByRole("cell", { name: "Acceso completo" })).toBeInTheDocument();
        expect(apiRequestMock).toHaveBeenCalledTimes(3);
    });

    it("ante el 409 rol_canonico_protegido avisa, conserva la descripción anterior y la sesión", async () => {
        const conflicto = new ApiError({
            kind: "conflicto",
            status: 409,
            causa: "rol_canonico_protegido",
            mensaje: "Rol canónico protegido",
        });
        apiRequestMock.mockResolvedValueOnce(ROLES).mockRejectedValueOnce(conflicto);
        renderPage();

        const { usuario, dialogo } = await abrirEdicion("admin");
        await guardarConTexto(usuario, dialogo, "Otra descripción");

        expect(await within(dialogo).findByRole("alert")).toHaveTextContent("está protegido");
        expect(screen.getByRole("cell", { name: "Acceso total" })).toBeInTheDocument();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(getSession()).not.toBeNull();
        expect(apiRequestMock).toHaveBeenCalledTimes(2);
    });

    it("ante el 403 informa permiso insuficiente y conserva la sesión", async () => {
        const prohibido = new ApiError({
            kind: "permiso",
            status: 403,
            causa: "permiso_denegado",
            mensaje: "La request fue rechazada (HTTP 403).",
        });
        apiRequestMock.mockResolvedValueOnce(ROLES).mockRejectedValueOnce(prohibido);
        renderPage();

        const { usuario, dialogo } = await abrirEdicion("admin");
        await guardarConTexto(usuario, dialogo, "Otra descripción");

        expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
            "Permiso insuficiente.",
        );
        expect(getSession()).not.toBeNull();
        expect(screen.getByRole("cell", { name: "Acceso total" })).toBeInTheDocument();
    });

    it("ante cualquier otro error muestra un aviso genérico y deja reintentar", async () => {
        apiRequestMock
            .mockResolvedValueOnce(ROLES)
            .mockRejectedValueOnce(new Error("sin conexión"));
        renderPage();

        const { usuario, dialogo } = await abrirEdicion("admin");
        await guardarConTexto(usuario, dialogo, "Otra descripción");

        expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
            "No se pudo guardar la descripción.",
        );
        expect(within(dialogo).getByRole("button", { name: "Guardar" })).toBeEnabled();
    });

    it("cancelar cierra el modal sin enviar ningún cambio", async () => {
        apiRequestMock.mockResolvedValue(ROLES);
        renderPage();

        const { usuario, dialogo } = await abrirEdicion("admin");
        await usuario.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(apiRequestMock).toHaveBeenCalledTimes(1);
    });
});