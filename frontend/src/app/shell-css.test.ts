/// <reference types="node" />
/**
 * RED de la corrección de 4.4 (2026-11-11) — tamaño base de los íconos.
 *
 * El nav pone `className="ico"` en los `svg` de las cuatro entradas
 * (`design-system/components.html:1031-1046`). La regla base `.ico` vive en
 * `components.html:195`, fuera del rango 372-394 que citaba D12: sin ella el
 * SVG se renderiza con su tamaño por defecto y el ícono se ve enorme.
 *
 * El test lee el archivo real del disco (no una copia ni el módulo CSS que
 * Vitest stubea): si la regla desaparece de `shell.css`, el test se pone rojo.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import { describe, expect, it } from "vitest";

const shellCss = readFileSync(
  resolve(process.cwd(), "src/app/shell.css"),
  "utf8",
);

/** Devuelve el cuerpo de la regla con ese selector exacto, o `null`. */
function bloqueDe(selector: string): string | null {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const coincidencia = shellCss.match(
    new RegExp(`(?:^|\\n)\\s*${escapado}\\s*\\{([^}]*)\\}`),
  );

  return coincidencia ? coincidencia[1] : null;
}

function reglaBaseDeIcono(): string {
  const regla = bloqueDe(".ico");

  if (regla === null) {
    throw new Error("shell.css no define la regla base `.ico`");
  }

  return regla;
}

describe("shell.css — regla base de los íconos", () => {
  it("lee el archivo del shell y conserva las reglas del shell", () => {
    expect(bloqueDe(".side__link")).not.toBeNull();
  });

  it("define el tamaño base de `.ico` con width y height", () => {
    const regla = reglaBaseDeIcono();

    expect(regla).toMatch(/width:\s*1\.125rem/);
    expect(regla).toMatch(/height:\s*1\.125rem/);
  });

  it("saca al ícono del flujo y le quita el tamaño del texto", () => {
    const regla = reglaBaseDeIcono();

    expect(regla).toMatch(/flex:\s*none/);
    expect(regla).toMatch(/display:\s*block/);
  });
});
