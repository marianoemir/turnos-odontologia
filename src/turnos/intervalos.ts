export interface Intervalo {
  inicio: Date;
  fin: Date;
}

/** Intersección no vacía de intervalos semiabiertos [inicio, fin) (RN-AG-04). */
export function solapan(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fin && b.inicio < a.fin;
}
