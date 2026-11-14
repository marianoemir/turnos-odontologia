import { describe, expect, it, vi } from "vitest";

describe("sesión en memoria", () => {
  it("no sobrevive la recarga completa del módulo", async () => {
    vi.resetModules();
    const primeraCarga = await import("./session");
    primeraCarga.setSession({
      token: "jwt-de-prueba",
      rol: "recepcion",
      usuario: "usuario-ficticio",
      sucursalId: null,
    });

    expect(primeraCarga.getSession()).not.toBeNull();

    vi.resetModules();
    const recargaCompleta = await import("./session");

    expect(recargaCompleta.getSession()).toBeNull();
  });
});
