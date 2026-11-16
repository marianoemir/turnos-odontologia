import { describe, expect, it } from "vitest";

import { formatCentavos } from "./money";

describe("formatCentavos", () => {
  it.each([
    [0, "$ 0,00"],
    [1, "$ 0,01"],
    [100, "$ 1,00"],
    [4000000, "$ 40.000,00"],
    [750000, "$ 7.500,00"],
    [123456789, "$ 1.234.567,89"],
    [-5, "-$ 0,05"],
    [-123456, "-$ 1.234,56"],
  ])("formatea %i como %s", (centavos, esperado) => {
    expect(formatCentavos(centavos)).toBe(esperado);
  });
});