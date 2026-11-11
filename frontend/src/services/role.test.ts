/**
 * RED de 3.3 — punto de enganche del rol para C-14 (design D4).
 *
 * El valor inicial replica el default del backend cuando falta `X-Actor-Rol`
 * (backend/app/rbac/context.py:94-100). `setActiveRole` valida contra `ROLES`
 * (backend/app/rbac/permissions.py:10) porque el backend compara exacto y un
 * rol fuera de la lista provoca 422 `rol_desconocido`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveRole, ROLES, setActiveRole } from "./role";

beforeEach(() => {
  setActiveRole("recepcion");
});

describe("rol activo", () => {
  it("sin selección el rol es recepcion", async () => {
    vi.resetModules();
    const modulo = await import("./role");

    expect(modulo.getActiveRole()).toBe("recepcion");
  });

  it("expone los cuatro roles del backend", () => {
    expect([...ROLES]).toEqual([
      "admin",
      "recepcion",
      "odontologo",
      "paciente",
    ]);
  });

  it("setActiveRole cambia el valor con un rol admitido", () => {
    setActiveRole("odontologo");

    expect(getActiveRole()).toBe("odontologo");
  });

  it("acepta cada rol del conjunto admitido", () => {
    for (const rol of ROLES) {
      setActiveRole(rol);
      expect(getActiveRole()).toBe(rol);
    }
  });

  it("descarta un rol no admitido y conserva el anterior", () => {
    setActiveRole("odontologo");

    for (const invalido of ["inventado", "", "ADMIN", " recepcion "]) {
      setActiveRole(invalido);
      expect(getActiveRole()).toBe("odontologo");
    }
  });
});
