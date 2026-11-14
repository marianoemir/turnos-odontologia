/**
 * RED de 1.1 (C-20) — contratos/tipos de caja, cobros, facturas y liquidaciones.
 * Espejo de `backend/app/caja/schemas.py` (C-10/C-11).
 */
import { describe, expect, it } from "vitest";

// Runtime import para que la ausencia del contrato sea RED visible (1.1).
import "./api-caja";

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
} from "./api-caja";

const ID_CAJA = "11111111-1111-4111-8111-111111111111";
const ID_COBRO = "22222222-2222-4222-8222-222222222222";
const ID_TURNO = "33333333-3333-4333-8333-333333333333";
const ID_LIQ = "44444444-4444-4444-8444-444444444444";
const FECHA = "2026-11-14";
const ISO = "2026-11-14T12:00:00Z";

describe("tipos de caja/cobros (espejo de backend/app/caja/schemas.py)", () => {
  it("CajaAbrir y CajaCerrar usan montos en centavos enteros", () => {
    const abrir: CajaAbrir = { monto_apertura_centavos: 10000 };
    const cerrar: CajaCerrar = {
      fecha: FECHA,
      monto_cierre_contado_centavos: 0,
    };
    const cerrarSinFecha: CajaCerrar = { monto_cierre_contado_centavos: 500 };

    expect(abrir.monto_apertura_centavos).toBe(10000);
    expect(cerrar.fecha).toBe(FECHA);
    expect(cerrarSinFecha.fecha).toBeUndefined();
  });

  it("CajaOut refleja estado, totales por medio y campos de cierre nullable/esperado", () => {
    const abierta: CajaOut = {
      id: ID_CAJA,
      fecha: FECHA,
      monto_apertura_centavos: 10000,
      abierto_en: ISO,
      cerrado_en: null,
      monto_cierre_contado_centavos: null,
      monto_esperado_centavos: null,
      diferencia_centavos: null,
      estado: "abierta",
      totales_por_medio_centavos: { efectivo: 5000 },
    };
    const cerrada: CajaOut = {
      ...abierta,
      cerrado_en: ISO,
      monto_cierre_contado_centavos: 15000,
      monto_esperado_centavos: 15000,
      diferencia_centavos: 0,
      estado: "cerrada",
      totales_por_medio_centavos: {},
    };

    expect(abierta.monto_esperado_centavos).toBeNull();
    expect(cerrada.estado).toBe("cerrada");
  });

  it("CobroCreate cubre medios, conceptos, turno/caja opcionales y campos OS", () => {
    const efectivo: CobroCreate = {
      medio: "efectivo",
      concepto: "sena",
      monto_centavos: 2500,
      turno_id: ID_TURNO,
    };
    const obraSocial: CobroCreate = {
      medio: "obra_social",
      concepto: "total",
      monto_centavos: 10000,
      nomenclador_codigo: "03.01.01",
      cobertura_centavos: 8000,
    };
    const transferencia: CobroCreate = {
      medio: "transferencia",
      concepto: "saldo",
      monto_centavos: 1,
      caja_id: ID_CAJA,
    };

    expect(efectivo.turno_id).toBe(ID_TURNO);
    expect(obraSocial.nomenclador_codigo).toBe("03.01.01");
    expect(transferencia.caja_id).toBe(ID_CAJA);
  });

  it("CobroOut incluye trazas de anulación/factura ARCA y montos en centavos", () => {
    const cobro: CobroOut = {
      id: ID_COBRO,
      caja_id: ID_CAJA,
      turno_id: null,
      medio: "mercado_pago",
      concepto: "total",
      monto_centavos: 125050,
      estado: "registrado",
      motivo_anulacion: null,
      anulado_en: null,
      referencia_externa: "SIM-MP-123",
      factura_tipo: null,
      factura_cae: null,
      factura_qr: null,
      facturado_en: null,
      simulado: true,
      creado_en: ISO,
    };
    const facturado: CobroOut = {
      ...cobro,
      estado: "facturado",
      factura_tipo: "B",
      factura_cae: "SIM-CAE",
      factura_qr: "SIM-QR",
      facturado_en: ISO,
    };

    expect(cobro.monto_centavos).toBe(125050);
    expect(facturado.factura_tipo).toBe("B");
    expect(facturado.factura_cae).toBe("SIM-CAE");
    expect(facturado.factura_qr).toBe("SIM-QR");
    expect(facturado.facturado_en).toBe(ISO);
  });

  it("AnularCobro, FacturaArcaCreate/Out y LiquidacionOSOut reflejan contratos", () => {
    const anular: AnularCobro = { motivo: "Error de carga" };
    const facturaReq: FacturaArcaCreate = { tipo: "B" };
    const factura: FacturaArcaOut = {
      cobro_id: ID_COBRO,
      tipo: "B",
      cae: "SIM-CAE-1",
      qr: "SIM-QR-1",
      simulado: true,
      modo: "simulado",
    };
    const liquidacion: LiquidacionOSOut = {
      id: ID_LIQ,
      cobro_id: ID_COBRO,
      nomenclador_codigo: "03.01.01",
      descripcion: null,
      monto_total_centavos: 10000,
      cobertura_centavos: 8000,
      copago_centavos: 2000,
      estado: "pendiente",
      pdf_referencia: "SIM-LIQ-1",
      creado_en: ISO,
    };

    expect(anular.motivo).toBe("Error de carga");
    expect(facturaReq.tipo).toBe("B");
    expect(factura.modo).toBe("simulado");
    expect(liquidacion.pdf_referencia).toBe("SIM-LIQ-1");
  });
});
