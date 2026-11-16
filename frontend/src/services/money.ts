export function formatCentavos(centavos: number): string {
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(centavos));
  const pesos = Math.trunc(abs / 100);
  const resto = abs % 100;
  const restoStr = resto < 10 ? `0${resto}` : String(resto);
  const miles = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${signo}$ ${miles},${restoStr}`;
}