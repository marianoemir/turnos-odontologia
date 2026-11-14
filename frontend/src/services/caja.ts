import type {
  AnularCobro,
  CajaAbrir,
  CajaCerrar,
  CajaOut,
  CobroCreate,
  CobroOut,
  FacturaArcaCreate,
  FacturaArcaOut,
  LiquidacionOSOut,
} from "../types/api-caja";
import { MONTO_MAX_CENTAVOS } from "../types/api-caja";
import { apiRequest } from "./http";

function soloDigitos(valor: string): boolean {
  for (let i = 0; i < valor.length; i++) {
    const c = valor.charCodeAt(i);
    if (c < 48 || c > 57) {
      return false;
    }
  }
  return valor.length > 0;
}

function compararCentavosConMax(textoEntero: string, decimales: string): boolean {
  const maxStr = String(MONTO_MAX_CENTAVOS);
  const valor = `${textoEntero}${decimales}`.replace(/^0+(?=\d)/, "");
  if (valor.length < maxStr.length) {
    return false;
  }
  if (valor.length > maxStr.length) {
    return true;
  }
  return valor > maxStr;
}

/**
 * Parser puro de monto en pesos (string) a centavos enteros.
 * Acepta coma o punto como separador decimal, sin usar float/Number/parseFloat.
 * Rechaza vacío, cero, más de 2 decimales y valores > MONTO_MAX_CENTAVOS.
 */
export function parsePesosACentavos(entrada: string): number {
  const crudo = entrada.trim();
  if (crudo.length === 0) {
    throw new Error("Monto inválido");
  }

  let parteEntera = crudo;
  let parteDecimal = "";

  const ultimaComa = crudo.lastIndexOf(",");
  const ultimoPunto = crudo.lastIndexOf(".");
  const posDecimal = Math.max(ultimaComa, ultimoPunto);

  if (posDecimal >= 0) {
    const sep = crudo[posDecimal];
    const otro = sep === "," ? "." : ",";
    const despues = crudo.slice(posDecimal + 1);
    const antes = crudo.slice(0, posDecimal);

    if (antes.includes(sep)) {
      throw new Error("Monto inválido");
    }
    if (despues.length === 0 || despues.length > 2) {
      throw new Error("Monto inválido");
    }
    if (!soloDigitos(despues)) {
      throw new Error("Monto inválido");
    }
    parteDecimal = despues.padEnd(2, "0");
    parteEntera = antes.split(otro).join("");
  } else {
    parteDecimal = "00";
    parteEntera = crudo;
  }

  if (!soloDigitos(parteEntera)) {
    throw new Error("Monto inválido");
  }

  const enteroNormalizado = parteEntera.replace(/^0+(?=\d)/, "") || "0";
  if (enteroNormalizado === "0" && parteDecimal === "00") {
    throw new Error("Monto inválido");
  }

  if (compararCentavosConMax(enteroNormalizado, parteDecimal)) {
    throw new Error("Monto inválido");
  }

  const totalStr = `${enteroNormalizado}${parteDecimal}`.replace(/^0+(?=\d)/, "") || "0";
  return Number.parseInt(totalStr, 10);
}

export function obtenerCajaPorFecha(fecha: string): Promise<CajaOut> {
  return apiRequest<CajaOut>(`/caja?fecha=${encodeURIComponent(fecha)}`);
}

export function obtenerCajaPorId(id: string): Promise<CajaOut> {
  return apiRequest<CajaOut>(`/caja/${encodeURIComponent(id)}`);
}

export function abrirCaja(body: CajaAbrir): Promise<CajaOut> {
  return apiRequest<CajaOut>("/caja/abrir", { method: "POST", body });
}

export function cerrarCaja(body: CajaCerrar): Promise<CajaOut> {
  return apiRequest<CajaOut>("/caja/cerrar", { method: "POST", body });
}

export function registrarCobro(body: CobroCreate): Promise<CobroOut> {
  return apiRequest<CobroOut>("/cobros", { method: "POST", body });
}

export function obtenerCobro(id: string): Promise<CobroOut> {
  return apiRequest<CobroOut>(`/cobros/${encodeURIComponent(id)}`);
}

export function anularCobro(id: string, body: AnularCobro): Promise<CobroOut> {
  return apiRequest<CobroOut>(`/cobros/${encodeURIComponent(id)}/anular`, {
    method: "POST",
    body,
  });
}

export function facturarArca(
  id: string,
  body: FacturaArcaCreate,
): Promise<FacturaArcaOut> {
  return apiRequest<FacturaArcaOut>(
    `/cobros/${encodeURIComponent(id)}/factura-arca`,
    { method: "POST", body },
  );
}

export function listarLiquidaciones(): Promise<LiquidacionOSOut[]> {
  return apiRequest<LiquidacionOSOut[]>("/liquidaciones-os");
}
