export const FILA_SUPERIOR = [
  "18", "17", "16", "15", "14", "13", "12", "11",
  "21", "22", "23", "24", "25", "26", "27", "28",
] as const;

export const FILA_INFERIOR = [
  "48", "47", "46", "45", "44", "43", "42", "41",
  "31", "32", "33", "34", "35", "36", "37", "38",
] as const;

export const PIEZAS_FDI = [...FILA_SUPERIOR, ...FILA_INFERIOR] as const;

export function cuadranteDePieza(pieza: string): string {
  const n = Number(pieza);
  if (n >= 11 && n <= 18) return "superior derecha";
  if (n >= 21 && n <= 28) return "superior izquierda";
  if (n >= 31 && n <= 38) return "inferior izquierda";
  if (n >= 41 && n <= 48) return "inferior derecha";
  return "";
}

export function labelPieza(pieza: string, estado: string | null): string {
  const cuadrante = cuadranteDePieza(pieza);
  if (estado == null) {
    return `Pieza ${pieza}, ${cuadrante}, sin estado registrado`;
  }
  return `Pieza ${pieza}, ${cuadrante}, estado ${estado}`;
}
