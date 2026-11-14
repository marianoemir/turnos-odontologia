/**
 * C-22, task 1.1 — guard de navegación por rol.
 *
 * `admin` navega /agenda y toda ruta de administración; `recepcion` navega lo
 * interno salvo administración; el resto de los roles, sólo /agenda. El guard
 * es navegación, no seguridad: la autorización real es del backend.
 */
import { describe, expect, it } from "vitest";

import { canNavigate, isInternalPath, safeReturnTo } from "./navigation";
import { ROLES } from "./session";

const RUTAS_ADMIN = [
  "/admin",
  "/admin/roles",
  "/admin/sucursales",
  "/admin/datos",
];

const RUTAS_OPERATIVAS = [
  "/",
  "/turnos/nuevo",
  "/catalogo/pacientes",
  "/lista-espera",
  "/hc/abc",
  "/caja",
];

describe("canNavigate por rol", () => {
  it("admin navega /agenda y toda ruta de administración", () => {
    for (const ruta of ["/agenda", ...RUTAS_ADMIN]) {
      expect(canNavigate("admin", ruta), ruta).toBe(true);
    }
  });

  it("admin no navega las rutas operativas", () => {
    for (const ruta of RUTAS_OPERATIVAS) {
      expect(canNavigate("admin", ruta), ruta).toBe(false);
    }
  });

  it("recepcion navega /agenda y lo operativo pero no administración", () => {
    for (const ruta of ["/agenda", ...RUTAS_OPERATIVAS]) {
      expect(canNavigate("recepcion", ruta), ruta).toBe(true);
    }
    for (const ruta of RUTAS_ADMIN) {
      expect(canNavigate("recepcion", ruta), ruta).toBe(false);
    }
  });

  it("odontologo y paciente navegan sólo /agenda", () => {
    for (const rol of ["odontologo", "paciente"] as const) {
      expect(canNavigate(rol, "/agenda"), `${rol} /agenda`).toBe(true);
      for (const ruta of [...RUTAS_OPERATIVAS, ...RUTAS_ADMIN]) {
        expect(canNavigate(rol, ruta), `${rol} ${ruta}`).toBe(false);
      }
    }
  });

  it("un prefijo de texto no hereda el permiso de administración", () => {
    expect(canNavigate("admin", "/administracion")).toBe(false);
    expect(canNavigate("admin", "/admin-roles")).toBe(false);
  });

  it("/agenda es navegable por todos los roles", () => {
    for (const rol of ROLES) {
      expect(canNavigate(rol, "/agenda"), rol).toBe(true);
    }
  });
});

describe("rutas internas y retorno tras el login", () => {
  it("isInternalPath reconoce las subrutas de administración", () => {
    for (const ruta of RUTAS_ADMIN) {
      expect(isInternalPath(ruta), ruta).toBe(true);
    }
  });

  it("safeReturnTo retoma /admin/roles para admin", () => {
    expect(safeReturnTo("/admin/roles", "admin")).toBe("/admin/roles");
  });

  it("safeReturnTo no retoma /admin/roles para recepcion", () => {
    expect(safeReturnTo("/admin/roles", "recepcion")).toBe("/agenda");
  });
});
