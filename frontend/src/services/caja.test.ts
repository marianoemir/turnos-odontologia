/**
 * RED de 1.1 (C-20) — contratos de servicios caja/cobros/liquidaciones y parser
 * puro de pesos a centavos. Cubre los 9 endpoints de backend/app/caja/router.py
 * y escenarios de parser "rejects invalid values" / "accepts comma and dot".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeApiError } from "./api-error";
import { apiRequest } from "./http";
import {
  abrirCaja,
  anularCobro,
  cerrarCaja,
  facturarArca,
  listarLiquidaciones,
  obtenerCajaPorFecha,
  obtenerCajaPorId,
  obtenerCobro,
  parseMontoCajaACentavos,
  parsePesosACentavos,
  registrarCobro,
} from "./caja";

vi.mock("./http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const ID_CAJA = "11111111-1111-4111-8111-111111111111";
const ID_COBRO = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("servicios de caja (contratos de los 9 endpoints)", () => {
  it("GET /caja?fecha= consulta caja por fecha", async () => {
    apiRequestMock.mockResolvedValue({ id: ID_CAJA });
    await obtenerCajaPorFecha("2026-11-14");

    expect(apiRequestMock).toHaveBeenCalledWith("/caja?fecha=2026-11-14");
  });

  it("GET /caja/{id} obtiene caja por id", async () => {
    apiRequestMock.mockResolvedValue({ id: ID_CAJA });
    await obtenerCajaPorId(ID_CAJA);

    expect(apiRequestMock).toHaveBeenCalledWith(
      `/caja/${encodeURIComponent(ID_CAJA)}`,
    );
  });

  it("POST /caja/abrir envía monto de apertura", async () => {
    apiRequestMock.mockResolvedValue({ id: ID_CAJA });
    const body = { monto_apertura_centavos: 10000 };
    await abrirCaja(body);

    expect(apiRequestMock).toHaveBeenCalledWith("/caja/abrir", {
      method: "POST",
      body,
    });
  });

  it("POST /caja/cerrar envía fecha y monto contado", async () => {
    apiRequestMock.mockResolvedValue({ id: ID_CAJA });
    const body = { fecha: "2026-11-14", monto_cierre_contado_centavos: 0 };
    await cerrarCaja(body);

    expect(apiRequestMock).toHaveBeenCalledWith("/caja/cerrar", {
      method: "POST",
      body,
    });
  });

  it("POST /cobros registra un cobro", async () => {
    apiRequestMock.mockResolvedValue({ id: ID_COBRO });
    const body = { medio: "efectivo" as const, concepto: "sena" as const, monto_centavos: 2500 };
    await registrarCobro(body);

    expect(apiRequestMock).toHaveBeenCalledWith("/cobros", {
      method: "POST",
      body,
    });
  });

  it("GET /cobros/{id} obtiene un cobro", async () => {
    apiRequestMock.mockResolvedValue({ id: ID_COBRO });
    await obtenerCobro(ID_COBRO);

    expect(apiRequestMock).toHaveBeenCalledWith(
      `/cobros/${encodeURIComponent(ID_COBRO)}`,
    );
  });

  it("POST /cobros/{id}/anular envía motivo", async () => {
    apiRequestMock.mockResolvedValue({ id: ID_COBRO });
    const body = { motivo: "Error de carga" };
    await anularCobro(ID_COBRO, body);

    expect(apiRequestMock).toHaveBeenCalledWith(
      `/cobros/${encodeURIComponent(ID_COBRO)}/anular`,
      { method: "POST", body },
    );
  });

  it("POST /cobros/{id}/factura-arca envía tipo B/C", async () => {
    apiRequestMock.mockResolvedValue({ cobro_id: ID_COBRO, tipo: "B" });
    const body = { tipo: "B" as const };
    await facturarArca(ID_COBRO, body);

    expect(apiRequestMock).toHaveBeenCalledWith(
      `/cobros/${encodeURIComponent(ID_COBRO)}/factura-arca`,
      { method: "POST", body },
    );
  });

  it("GET /liquidaciones-os lista liquidaciones", async () => {
    apiRequestMock.mockResolvedValue([]);
    await listarLiquidaciones();

    expect(apiRequestMock).toHaveBeenCalledWith("/liquidaciones-os");
  });
});

describe("parsePesosACentavos (puro, sin float)", () => {
  it("rechaza valores inválidos: vacío, cero, >2 decimales y >1_000_000_000_000", () => {
    expect(() => parsePesosACentavos("")).toThrow();
    expect(() => parsePesosACentavos("   ")).toThrow();
    expect(() => parsePesosACentavos("0")).toThrow();
    expect(() => parsePesosACentavos("0,00")).toThrow();
    expect(() => parsePesosACentavos("0.00")).toThrow();
    expect(() => parsePesosACentavos("1,234")).toThrow();
    expect(() => parsePesosACentavos("1.234")).toThrow();
    expect(() => parsePesosACentavos("1,001")).toThrow();
    // límite: 1_000_000_000_000 centavos = 10_000_000_000,00 pesos
    expect(() => parsePesosACentavos("10000000000,01")).toThrow();
    expect(() => parsePesosACentavos("10000000001,00")).toThrow();
  });

  it("acepta coma y punto como separador decimal y produce el mismo valor", () => {
    expect(parsePesosACentavos("1.250,50")).toBe(125050);
    expect(parsePesosACentavos("1250.5")).toBe(125050);
    expect(parsePesosACentavos("1250,50")).toBe(125050);
    expect(parsePesosACentavos("1250.50")).toBe(125050);
  });
});

describe("parseMontoCajaACentavos (apertura/cierre, permite cero)", () => {
  it("acepta cero y montos válidos, y rechaza inválidos", () => {
    expect(parseMontoCajaACentavos("0")).toBe(0);
    expect(parseMontoCajaACentavos("0,00")).toBe(0);
    expect(parseMontoCajaACentavos("0.00")).toBe(0);
    expect(parseMontoCajaACentavos("100,00")).toBe(10000);
    expect(() => parseMontoCajaACentavos("")).toThrow();
    expect(() => parseMontoCajaACentavos("1,234")).toThrow();
    expect(() => parseMontoCajaACentavos("10000000000,01")).toThrow();
  });
});

describe("triangulación contratos (1.3)", () => {
  it("obra social requiere nomenclador_codigo y acepta cobertura en el contrato", async () => {
    apiRequestMock.mockResolvedValue({ id: ID_COBRO });
    const body = {
      medio: "obra_social" as const,
      concepto: "total" as const,
      monto_centavos: 10000,
      nomenclador_codigo: "03.01.01",
      cobertura_centavos: 8000,
    };
    await registrarCobro(body);

    expect(apiRequestMock).toHaveBeenCalledWith("/cobros", {
      method: "POST",
      body,
    });
  });

  it("cobro facturable: contrato de factura ARCA tipo B y respuesta simulada", async () => {
    const facturaOut = {
      cobro_id: ID_COBRO,
      tipo: "B",
      cae: "SIM-CAE-1",
      qr: "SIM-QR-1",
      simulado: true,
      modo: "simulado",
    };
    apiRequestMock.mockResolvedValue(facturaOut);
    const body = { tipo: "B" as const };
    const res = await facturarArca(ID_COBRO, body);

    expect(apiRequestMock).toHaveBeenCalledWith(
      `/cobros/${encodeURIComponent(ID_COBRO)}/factura-arca`,
      { method: "POST", body },
    );
    expect(res).toMatchObject({
      cobro_id: ID_COBRO,
      tipo: "B",
      cae: "SIM-CAE-1",
      qr: "SIM-QR-1",
      simulado: true,
      modo: "simulado",
    });
  });

  it("ApiError normaliza detail string: 404 no_encontrado y 422/409 dominio a kind por status", () => {
    const noEncontrado = normalizeApiError(404, {
      detail: "caja no existe para la fecha 2026-11-14",
    });
    expect(noEncontrado.kind).toBe("no_encontrado");
    expect(noEncontrado.status).toBe(404);
    expect(noEncontrado.detalle).toContain("caja no existe");

    const conflicto409 = normalizeApiError(409, "conflicto de negocio");
    expect(conflicto409.kind).toBe("conflicto");
    expect(conflicto409.status).toBe(409);

    const dominio422 = normalizeApiError(422, "monto invalido");
    expect(dominio422.kind).toBe("validacion");
    expect(dominio422.status).toBe(422);
  });

  it("ApiError normaliza detail objeto {causa,detalle} y lista Pydantic 422 con campos", () => {
    const conflicto = normalizeApiError(409, {
      detail: { causa: "caja_ya_abierta", detalle: "ya existe caja abierta" },
    });
    expect(conflicto.kind).toBe("conflicto");
    expect(conflicto.causa).toBe("caja_ya_abierta");
    expect(conflicto.detalle).toContain("ya existe caja abierta");

    // Forma DERIVADA (NO medida en sonda; esperada en FastAPI + Pydantic v2 para un
    // model_validator sobre un body). Forma derivada, no medida contra el backend.
    const pydantic = normalizeApiError(422, {
      detail: [
        {
          type: "value_error",
          loc: ["body"],
          msg: "Value error, nomenclador_codigo es obligatorio para obra_social",
          input: { medio: "obra_social", monto_centavos: 5000 },
          ctx: { error: {} },
        },
      ],
    });
    expect(pydantic.kind).toBe("validacion");
    expect(pydantic.campos).toHaveLength(1);
    expect(pydantic.campos[0]?.ubicacion).toBe("body");
    expect(pydantic.campos[0]?.mensaje).toBe(
      "Value error, nomenclador_codigo es obligatorio para obra_social",
    );
    // Texto exacto renderizado (normalizeApiError.message / ApiError.message):
    expect(pydantic.message).toBe(
      "La request tiene campos inválidos: body: Value error, nomenclador_codigo es obligatorio para obra_social",
    );
    expect(pydantic.detalle).toBe(
      "body: Value error, nomenclador_codigo es obligatorio para obra_social",
    );
  });
});
