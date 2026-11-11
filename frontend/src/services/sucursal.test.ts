/**
 * RED de 3.4 — sucursal activa (design D4, simétrica al rol).
 *
 * `null` inicial: sin la cabecera el backend no abre sesión ni consulta la base
 * (backend/app/rbac/context.py:38-40); con un UUID inexistente responde 422
 * `sucursal_invalida` (context.py:85-92). Por eso se valida el formato antes de
 * aplicar el valor. Sin `localStorage`: eso es de C-14/C-22.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveSucursalId, setActiveSucursalId } from "./sucursal";

const UUID = "5b8f0d6e-3a2c-4a41-9f0e-7a1f6b0c9d21";
const OTRO_UUID = "0c4e2b1a-9d8f-4c7b-8a6e-1f2d3c4b5a69";

beforeEach(() => {
  setActiveSucursalId(null);
});

describe("sucursal activa", () => {
  it("sin selección la sucursal es null", async () => {
    vi.resetModules();
    const modulo = await import("./sucursal");

    expect(modulo.getActiveSucursalId()).toBeNull();
  });

  it("acepta un UUID y lo expone", () => {
    setActiveSucursalId(UUID);

    expect(getActiveSucursalId()).toBe(UUID);
  });

  it("acepta un UUID en mayúsculas", () => {
    const enMayusculas = UUID.toUpperCase();
    setActiveSucursalId(enMayusculas);

    expect(getActiveSucursalId()).toBe(enMayusculas);
  });

  it("descarta un valor que no es UUID y conserva el anterior", () => {
    setActiveSucursalId(UUID);

    for (const invalido of [
      "no-es-uuid",
      "",
      "5b8f0d6e-3a2c-4a41-9f0e",
      `${UUID}-extra`,
    ]) {
      setActiveSucursalId(invalido);
      expect(getActiveSucursalId()).toBe(UUID);
    }
  });

  it("setActiveSucursalId(null) la vuelve a omitir", () => {
    setActiveSucursalId(UUID);

    setActiveSucursalId(null);

    expect(getActiveSucursalId()).toBeNull();
  });

  it("cambiar la sucursal reemplaza el valor anterior", () => {
    setActiveSucursalId(UUID);
    setActiveSucursalId(OTRO_UUID);

    expect(getActiveSucursalId()).toBe(OTRO_UUID);
  });
});
