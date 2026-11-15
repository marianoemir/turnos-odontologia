/**
 * RED 1.1 (C-18 grupo 1) — contrato de servicio lista de espera.
 * Datos ficticios.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "./http";
import {
  crearEntradaListaEspera,
  listarEntradasListaEspera,
  ofrecerHuecoListaEspera,
  responderOfertaListaEspera,
  listarPacientesCatalogo,
  listarProfesionalesCatalogo,
  listarPrestacionesCatalogo,
  listarSillonesCatalogo,
} from "./lista-espera";

vi.mock("./http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const ID_PACIENTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_PRESTACION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_ENTRADA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ID_PROFESIONAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ID_SILLON = "ffffffff-ffff-4fff-8fff-ffffffffffff";

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe("servicios de lista de espera (contratos)", () => {
  it('service: Successful waitlist registration (happy-path)', async () => {
    apiRequestMock.mockResolvedValue({
      id: ID_ENTRADA,
      paciente_id: ID_PACIENTE,
      profesional_id: null,
      prestacion_id: ID_PRESTACION,
      creado_en: "2026-11-15T10:00:00-03:00",
      estado: "pendiente",
      turno_id: null,
    });

    const body = {
      paciente_id: ID_PACIENTE,
      prestacion_id: ID_PRESTACION,
    };

    const resultado = await crearEntradaListaEspera(body);

    expect(apiRequestMock).toHaveBeenCalledWith("/lista-espera", {
      method: "POST",
      body,
    });
    expect(resultado).toMatchObject({
      id: ID_ENTRADA,
      paciente_id: ID_PACIENTE,
      profesional_id: null,
      prestacion_id: ID_PRESTACION,
      estado: "pendiente",
      turno_id: null,
    });
  });

  it('service: Entries are shown in backend FIFO order (happy-path)', async () => {
    const respuesta = [
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        paciente_id: ID_PACIENTE,
        profesional_id: ID_PROFESIONAL,
        prestacion_id: ID_PRESTACION,
        creado_en: "2026-11-15T09:00:00-03:00",
        estado: "pendiente",
        turno_id: null,
      },
    ];
    apiRequestMock.mockResolvedValue(respuesta);

    const resultado = await listarEntradasListaEspera(ID_PROFESIONAL);

    expect(apiRequestMock).toHaveBeenCalledWith(
      `/lista-espera?profesional=${encodeURIComponent(ID_PROFESIONAL)}`,
    );
    expect(resultado).toEqual(respuesta);
  });

  it('service: Offer succeeds and shows offered result (happy-path)', async () => {
    const respuesta = {
      lista: {
        id: ID_ENTRADA,
        paciente_id: ID_PACIENTE,
        profesional_id: ID_PROFESIONAL,
        prestacion_id: ID_PRESTACION,
        creado_en: "2026-11-15T09:00:00-03:00",
        estado: "ofrecido",
        turno_id: "11111111-2222-4333-8444-555555555555",
      },
      turno: {
        estado: "pendiente",
        // campos extra no deben ser requeridos por el contrato tipado
        id: "11111111-2222-4333-8444-555555555555",
      },
    };
    apiRequestMock.mockResolvedValue(respuesta);

    const body = {
      inicio: "2026-11-20T10:00:00-03:00",
      profesional_id: ID_PROFESIONAL,
      sillon_id: ID_SILLON,
    };

    const resultado = await ofrecerHuecoListaEspera(ID_ENTRADA, body);

    expect(apiRequestMock).toHaveBeenCalledWith(
      `/lista-espera/${encodeURIComponent(ID_ENTRADA)}/ofrecer`,
      { method: "POST", body },
    );
    expect(resultado).toMatchObject({
      lista: { id: ID_ENTRADA, estado: "ofrecido" },
      turno: { estado: "pendiente" },
    });
  });

  it('service: Accepting an offer marks the entry as assigned (happy-path)', async () => {
    const respuesta = {
      id: ID_ENTRADA,
      paciente_id: ID_PACIENTE,
      profesional_id: ID_PROFESIONAL,
      prestacion_id: ID_PRESTACION,
      creado_en: "2026-11-15T09:00:00-03:00",
      estado: "asignado",
      turno_id: "11111111-2222-4333-8444-555555555555",
    };
    apiRequestMock.mockResolvedValue(respuesta);

    const resultado = await responderOfertaListaEspera(ID_ENTRADA, { acepta: true });

    expect(apiRequestMock).toHaveBeenCalledWith(
      `/lista-espera/${encodeURIComponent(ID_ENTRADA)}/responder`,
      { method: "POST", body: { acepta: true } },
    );
    expect(resultado).toMatchObject({ id: ID_ENTRADA, estado: "asignado" });
  });

  it('service: Rejecting an offer marks the entry as baja and refreshes the list (happy-path)', async () => {
    const respuesta = {
      id: ID_ENTRADA,
      paciente_id: ID_PACIENTE,
      profesional_id: ID_PROFESIONAL,
      prestacion_id: ID_PRESTACION,
      creado_en: "2026-11-15T09:00:00-03:00",
      estado: "baja",
      turno_id: "11111111-2222-4333-8444-555555555555",
    };
    apiRequestMock.mockResolvedValue(respuesta);

    const resultado = await responderOfertaListaEspera(ID_ENTRADA, { acepta: false });

    expect(apiRequestMock).toHaveBeenCalledWith(
      `/lista-espera/${encodeURIComponent(ID_ENTRADA)}/responder`,
      { method: "POST", body: { acepta: false } },
    );
    expect(resultado).toMatchObject({ id: ID_ENTRADA, estado: "baja" });
  });

  it('service: Names are visible in the table (happy-path)', async () => {
    const pacientesEnvelope = {
      items: [
        {
          id: ID_PACIENTE,
          nombre: "Paciente Ficticio Uno",
          dni: "10000001",
          contacto: null,
          ficticio: true,
          activo: true,
        },
      ],
      total: 1,
      limit: 200,
      offset: 0,
    };
    const profesionales = [
      {
        id: ID_PROFESIONAL,
        nombre: "Profesional Ficticio Uno",
        matricula: "MF-001",
        sucursal_id: null,
        activo: true,
      },
    ];
    const prestaciones = [
      {
        id: ID_PRESTACION,
        nombre: "Prestacion Ficticia Uno",
        duracion_min: 30,
        activo: true,
      },
    ];
    const sillones = [
      {
        id: ID_SILLON,
        nombre: "Sillon Ficticio Uno",
        sucursal_id: null,
        activo: true,
      },
    ];

    apiRequestMock
      .mockResolvedValueOnce(pacientesEnvelope)
      .mockResolvedValueOnce(profesionales)
      .mockResolvedValueOnce(prestaciones)
      .mockResolvedValueOnce(sillones);

    const resPacientes = await listarPacientesCatalogo({
      q: "Ficticio",
      limit: 200,
      incluir_inactivos: true,
    });
    const resProfesionales = await listarProfesionalesCatalogo({
      incluir_inactivos: true,
    });
    const resPrestaciones = await listarPrestacionesCatalogo({
      incluir_inactivos: true,
    });
    const resSillones = await listarSillonesCatalogo({
      incluir_inactivos: true,
    });

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/pacientes?q=Ficticio&limit=200&incluir_inactivos=true",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      "/profesionales?incluir_inactivos=true",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      3,
      "/prestaciones?incluir_inactivos=true",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      4,
      "/sillones?incluir_inactivos=true",
    );

    expect(resPacientes).toEqual(pacientesEnvelope);
    expect(resProfesionales).toEqual(profesionales);
    expect(resPrestaciones).toEqual(prestaciones);
    expect(resSillones).toEqual(sillones);
  });
});
