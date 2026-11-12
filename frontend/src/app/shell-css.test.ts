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

const tokensCss = readFileSync(
  resolve(process.cwd(), "design-system/tokens.css"),
  "utf8",
);

/** Devuelve el cuerpo de la regla con ese selector exacto dentro de un CSS. */
function reglaEn(css: string, selector: string): string | null {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const coincidencia = css.match(
    new RegExp(`(?:^|\\n)\\s*${escapado}\\s*\\{([^}]*)\\}`),
  );

  return coincidencia ? coincidencia[1] : null;
}

/** Devuelve el cuerpo de la regla con ese selector exacto, o `null`. */
function bloqueDe(selector: string): string | null {
  return reglaEn(shellCss, selector);
}

/** Devuelve el cuerpo del bloque `@media (max-width: <consulta>)`, o `null`. */
function bloqueMedia(css: string, condicion: string): string | null {
  const inicio = css.indexOf(`@media ${condicion}`);

  if (inicio === -1) {
    return null;
  }

  const abre = css.indexOf("{", inicio);

  if (abre === -1) {
    return null;
  }

  let nivel = 0;

  for (let i = abre; i < css.length; i += 1) {
    if (css[i] === "{") {
      nivel += 1;
    } else if (css[i] === "}") {
      nivel -= 1;

      if (nivel === 0) {
        return css.slice(abre + 1, i);
      }
    }
  }

  return null;
}

function mediaDe46rem(): string {
  const bloque = bloqueMedia(shellCss, "(max-width: 46rem)");

  if (bloque === null) {
    throw new Error(
      "shell.css no define la media query `@media (max-width: 46rem)`",
    );
  }

  return bloque;
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

/**
 * RED de 4.7 (2026-11-11) — navegación compacta por debajo de 46rem.
 * La media query sale de `components.html:396-402` y vive en `shell.css`;
 * `tokens.css` sólo define variables (design D12), así que ahí no puede estar.
 */
describe("shell.css — navegación compacta a 46rem", () => {
  it("define la media query de 46rem exactamente una vez", () => {
    expect(mediaDe46rem()).not.toBe("");

    const apariciones = shellCss.split("@media (max-width: 46rem)").length - 1;

    expect(apariciones).toBe(1);
  });

  it("deja el shell en una columna y oculta las etiquetas del nav", () => {
    const bloque = mediaDe46rem();

    expect(reglaEn(bloque, ".app-shell")).toMatch(
      /grid-template-columns:\s*1fr/,
    );
    expect(reglaEn(bloque, ".side__label")).toMatch(/display:\s*none/);
  });

  it("convierte los grupos del nav en franja con wrap y achica el contenido", () => {
    const bloque = mediaDe46rem();

    expect(reglaEn(bloque, ".side__group")).toMatch(/display:\s*flex/);
    expect(reglaEn(bloque, ".side__group")).toMatch(/flex-wrap:\s*wrap/);
    expect(reglaEn(bloque, ".app-main")).toMatch(/padding:\s*var\(--space-4\)/);
  });

  it("no vive en tokens.css", () => {
    expect(bloqueMedia(tokensCss, "(max-width: 46rem)")).toBeNull();
  });
});
