/**
 * Contratos espejo de caja, cobros, facturación ARCA y liquidaciones (C-20).
 *
 * Fuentes y ninguna otra: `backend/app/caja/schemas.py` y
 * `backend/app/caja/router.py` (capability `caja-pagos`, C-10/C-11).
 *
 * Traducción wire → TypeScript:
 * - `UUID` / `date` / `AwareDatetime` -> `string`
 * - `int` (centavos)                   -> `number`
 * - `str | None`                       -> `string | null`
 */
export const MONTO_MAX_CENTAVOS = 1_000_000_000_000;

export type MedioCobro =
  | "efectivo"
  | "tarjeta"
  | "transferencia"
  | "mercado_pago"
  | "obra_social";

export type ConceptoCobro = "sena" | "saldo" | "total";

export type TipoFacturaArca = "B" | "C";

export interface CajaAbrir {
  monto_apertura_centavos: number;
}

export interface CajaCerrar {
  fecha?: string;
  monto_cierre_contado_centavos: number;
}

export interface CajaOut {
  id: string;
  fecha: string;
  monto_apertura_centavos: number;
  abierto_en: string;
  cerrado_en: string | null;
  monto_cierre_contado_centavos: number | null;
  monto_esperado_centavos: number | null;
  diferencia_centavos: number | null;
  estado: string;
  totales_por_medio_centavos: Record<string, number>;
}

export interface CobroCreate {
  caja_id?: string;
  turno_id?: string;
  medio: MedioCobro;
  concepto: ConceptoCobro;
  monto_centavos: number;
  nomenclador_codigo?: string | null;
  cobertura_centavos?: number | null;
}

export interface CobroOut {
  id: string;
  caja_id: string;
  turno_id: string | null;
  medio: string;
  concepto: string;
  monto_centavos: number;
  estado: string;
  motivo_anulacion: string | null;
  anulado_en: string | null;
  referencia_externa: string | null;
  factura_tipo: string | null;
  factura_cae: string | null;
  factura_qr: string | null;
  facturado_en: string | null;
  simulado: boolean;
  creado_en: string;
}

export interface AnularCobro {
  motivo: string;
}

export interface FacturaArcaCreate {
  tipo: TipoFacturaArca;
}

export interface FacturaArcaOut {
  cobro_id: string;
  tipo: string;
  cae: string;
  qr: string;
  simulado: boolean;
  modo: string;
}

export interface LiquidacionOSOut {
  id: string;
  cobro_id: string;
  nomenclador_codigo: string;
  descripcion: string | null;
  monto_total_centavos: number;
  cobertura_centavos: number;
  copago_centavos: number;
  estado: string;
  pdf_referencia: string | null;
  creado_en: string;
}
