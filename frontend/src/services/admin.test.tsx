/**
 * RED de 2.2 (C-22) — servicios de roles, sucursales y asignaciones.
 *
 * `apiRequest` se reemplaza por un doble: lo que se afirma es QUÉ pide cada
 * servicio (método, ruta, cuerpo) y QUÉ recurso invalida cada mutación, no el
 * transporte HTTP (eso ya lo cubre `http.test.ts`).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    useActualizarAsignacion,
    useActualizarDescripcionRol,
    useActualizarSucursal,
    useAsignaciones,
    useCrearAsignacion,
    useCrearSucursal,
    useRoles,
    useSucursales,
} from "./admin";
import { apiRequest } from "./http";
import { resourceKeys } from "./query";

vi.mock("./http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const ID_ROL = "11111111-1111-4111-8111-111111111111";
const ID_SUCURSAL = "22222222-2222-4222-8222-222222222222";
const ID_ASIGNACION = "33333333-3333-4333-8333-333333333333";

const RECURSOS = ["roles", "sucursales", "usuariosSucursal"] as const;

beforeEach(() => { apiRequestMock.mockReset(); });
afterEach(cleanup);

function nuevoCliente(): QueryClient {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function crearWrapper(client: QueryClient) {
    return function Wrapper({ children }: PropsWithChildren) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

/** Ejecuta una mutación con las tres raíces de caché pobladas. */
async function ejecutar<TVars>(
    usar: () => { mutateAsync: (variables: TVars) => Promise<unknown> },
    variables: TVars,
) {
    const client = nuevoCliente();
    for (const recurso of RECURSOS) {
        client.setQueryData(resourceKeys[recurso].all, [{ id: recurso }]);
    }
    apiRequestMock.mockResolvedValue({});

    const { result } = renderHook(usar, { wrapper: crearWrapper(client) });
    await act(async () => {
        await result.current.mutateAsync(variables);
    });

    const invalidados = RECURSOS.filter(
        (recurso) =>
            client.getQueryState(resourceKeys[recurso].all)?.isInvalidated === true,
    );
    return { invalidados, llamadas: [...apiRequestMock.mock.calls] };
}

describe("mutaciones de administración", () => {
    it("el PATCH de un rol envía únicamente descripcion e invalida solo roles", async () => {
        const { invalidados, llamadas } = await ejecutar(useActualizarDescripcionRol, {
            id: ID_ROL,
            descripcion: "Nueva descripción",
        });

        expect(llamadas).toHaveLength(1);
        expect(llamadas[0]).toEqual([
            `/roles/${ID_ROL}`,
            { method: "PATCH", body: { descripcion: "Nueva descripción" } },
        ]);
        expect(Object.keys(llamadas[0]?.[1]?.body as object)).toEqual(["descripcion"]);
        expect(invalidados).toEqual(["roles"]);
    });

    it("crear una sucursal hace POST /sucursales e invalida solo sucursales", async () => {
        const { invalidados, llamadas } = await ejecutar(useCrearSucursal, {
            nombre: "Norte",
        });

        expect(llamadas[0]).toEqual([
            "/sucursales",
            { method: "POST", body: { nombre: "Norte" } },
        ]);
        expect(invalidados).toEqual(["sucursales"]);
    });

    it("editar una sucursal hace PATCH /sucursales/{id} e invalida solo sucursales", async () => {
        const { invalidados, llamadas } = await ejecutar(useActualizarSucursal, {
            id: ID_SUCURSAL,
            parche: { activo: false },
        });

        expect(llamadas[0]).toEqual([
            `/sucursales/${ID_SUCURSAL}`,
            { method: "PATCH", body: { activo: false } },
        ]);
        expect(invalidados).toEqual(["sucursales"]);
    });

    it("crear una asignación hace POST /usuarios-sucursal e invalida solo usuariosSucursal", async () => {
        const alta = { usuario: "ana", rol_id: ID_ROL, sucursal_id: ID_SUCURSAL };
        const { invalidados, llamadas } = await ejecutar(useCrearAsignacion, alta);

        expect(llamadas[0]).toEqual([
            "/usuarios-sucursal",
            { method: "POST", body: alta },
        ]);
        expect(invalidados).toEqual(["usuariosSucursal"]);
    });

    it("editar una asignación hace PATCH /usuarios-sucursal/{id} e invalida solo usuariosSucursal", async () => {
        const { invalidados, llamadas } = await ejecutar(useActualizarAsignacion, {
            id: ID_ASIGNACION,
            parche: { activo: false },
        });

        expect(llamadas[0]).toEqual([
            `/usuarios-sucursal/${ID_ASIGNACION}`,
            { method: "PATCH", body: { activo: false } },
        ]);
        expect(invalidados).toEqual(["usuariosSucursal"]);
    });
});

describe("consultas de administración", () => {
    it("useRoles pide GET /roles", async () => {
        apiRequestMock.mockResolvedValue([]);
        const { result } = renderHook(() => useRoles(), {
            wrapper: crearWrapper(nuevoCliente()),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(apiRequestMock.mock.calls[0]?.[0]).toBe("/roles");
    });

    it("useAsignaciones pide GET /usuarios-sucursal", async () => {
        apiRequestMock.mockResolvedValue([]);
        const { result } = renderHook(() => useAsignaciones(), {
            wrapper: crearWrapper(nuevoCliente()),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(apiRequestMock.mock.calls[0]?.[0]).toBe("/usuarios-sucursal");
    });

    it("useSucursales no incluye inactivas por defecto", async () => {
        apiRequestMock.mockResolvedValue([]);
        const { result } = renderHook(() => useSucursales(), {
            wrapper: crearWrapper(nuevoCliente()),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(apiRequestMock.mock.calls[0]?.[0]).toBe("/sucursales");
    });

    it("useSucursales(true) pide incluir_inactivos=true", async () => {
        apiRequestMock.mockResolvedValue([]);
        const { result } = renderHook(() => useSucursales(true), {
            wrapper: crearWrapper(nuevoCliente()),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(apiRequestMock.mock.calls[0]?.[0]).toBe(
            "/sucursales?incluir_inactivos=true",
        );
    });

    it("la consulta con y sin inactivas no comparten caché pero cuelgan de la misma raíz", async () => {
        apiRequestMock.mockResolvedValue([]);
        const client = nuevoCliente();
        const wrapper = crearWrapper(client);

        const sin = renderHook(() => useSucursales(false), { wrapper });
        const con = renderHook(() => useSucursales(true), { wrapper });
        await waitFor(() => expect(sin.result.current.isSuccess).toBe(true));
        await waitFor(() => expect(con.result.current.isSuccess).toBe(true));

        expect(
            client.getQueryCache().findAll({ queryKey: resourceKeys.sucursales.all }),
        ).toHaveLength(2);
    });
});