/**
 * RED de 2.1 (C-22) — tipos espejo de roles, sucursales y asignaciones.
 *
 * Vitest no verifica tipos: el RED real es `tsc -b`, que falla mientras los
 * tipos no existen o no coinciden con los schemas de `backend/app/rbac/schemas.py`.
 * Los `@ts-expect-error` fijan lo que el backend rechaza (`extra="forbid"` y
 * valores nulos en los PATCH): si el tipo dejara de rechazarlo, `tsc -b` falla
 * por directiva sin uso.
 */
import { describe, expect, it } from "vitest";

import type {
  Rol,
  RolCreate,
  RolPatch,
  Sucursal,
  SucursalCreate,
  SucursalPatch,
  UsuarioSucursal,
  UsuarioSucursalCreate,
  UsuarioSucursalPatch,
} from "./api-admin";

const ID_ROL = "11111111-1111-4111-8111-111111111111";
const ID_SUCURSAL = "22222222-2222-4222-8222-222222222222";
const ID_ASIGNACION = "33333333-3333-4333-8333-333333333333";

describe("tipos de administración (espejo de backend/app/rbac/schemas.py)", () => {
  it("un rol lleva su descripción nullable y los permisos como lista de texto", () => {
    const rol: Rol = {
      id: ID_ROL,
      nombre: "admin",
      descripcion: null,
      activo: true,
      permisos: ["admin:gestionar"],
    };

    expect(rol.descripcion).toBeNull();
    expect(rol.permisos).toEqual(["admin:gestionar"]);
  });

  it("el PATCH de rol admite solo campos presentes, nunca null ni extras", () => {
    const soloDescripcion: RolPatch = { descripcion: "Acceso total" };
    // @ts-expect-error el backend rechaza null en el PATCH de rol
    const conNull: RolPatch = { descripcion: null };
    // @ts-expect-error `permisos` no es editable: el backend rechaza campos extra
    const conExtra: RolPatch = { descripcion: "x", permisos: [] };

    expect(Object.keys(soloDescripcion)).toEqual(["descripcion"]);
    expect([conNull, conExtra]).toHaveLength(2);
  });

  it("el alta de rol exige nombre y deja la descripción opcional", () => {
    const sinDescripcion: RolCreate = { nombre: "auditor" };
    const conDescripcionNula: RolCreate = { nombre: "auditor", descripcion: null };
    // @ts-expect-error el nombre es obligatorio
    const sinNombre: RolCreate = { descripcion: "x" };

    expect(sinDescripcion.nombre).toBe("auditor");
    expect([conDescripcionNula, sinNombre]).toHaveLength(2);
  });

  it("una sucursal lleva dirección nullable y se crea con nombre obligatorio", () => {
    const sucursal: Sucursal = {
      id: ID_SUCURSAL,
      nombre: "Centro",
      direccion: null,
      activo: true,
    };
    const alta: SucursalCreate = { nombre: "Norte" };
    // @ts-expect-error el nombre es obligatorio
    const altaSinNombre: SucursalCreate = { direccion: "Calle 1" };

    expect(sucursal.direccion).toBeNull();
    expect([alta, altaSinNombre]).toHaveLength(2);
  });

  it("el PATCH de sucursal admite nombre, dirección y activo sin null", () => {
    const parche: SucursalPatch = { nombre: "Centro", direccion: "Calle 1", activo: false };
    // @ts-expect-error el backend rechaza null en el PATCH de sucursal
    const conNull: SucursalPatch = { direccion: null };

    expect(parche.activo).toBe(false);
    expect([conNull]).toHaveLength(1);
  });

  it("una asignación usuario–sucursal lleva creado_en y se crea con los tres campos", () => {
    const asignacion: UsuarioSucursal = {
      id: ID_ASIGNACION,
      usuario: "ana",
      rol_id: ID_ROL,
      sucursal_id: ID_SUCURSAL,
      activo: true,
      creado_en: "2026-11-14T08:00:00Z",
    };
    const alta: UsuarioSucursalCreate = {
      usuario: "ana",
      rol_id: ID_ROL,
      sucursal_id: ID_SUCURSAL,
    };
    // @ts-expect-error falta sucursal_id
    const altaIncompleta: UsuarioSucursalCreate = { usuario: "ana", rol_id: ID_ROL };

    expect(asignacion.creado_en).toBe("2026-11-14T08:00:00Z");
    expect([alta, altaIncompleta]).toHaveLength(2);
  });

  it("el PATCH de asignación admite rol, sucursal y activo sin null", () => {
    const parche: UsuarioSucursalPatch = { activo: false };
    // @ts-expect-error el backend rechaza null en el PATCH de asignación
    const conNull: UsuarioSucursalPatch = { rol_id: null };
    // @ts-expect-error `usuario` no se edita por PATCH
    const conUsuario: UsuarioSucursalPatch = { usuario: "otra" };

    expect(parche.activo).toBe(false);
    expect([conNull, conUsuario]).toHaveLength(2);
  });
});
