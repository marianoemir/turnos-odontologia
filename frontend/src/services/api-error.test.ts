/**
 * RED de 3.1 — las cuatro formas de error del backend convergen en un único
 * error de dominio (design D5).
 *
 * Las fixtures son las respuestas reales: FastAPI envuelve el detalle en
 * `{"detail": ...}` (backend/app/turnos/router.py:54-62,
 * backend/app/recordatorios/router.py:53-63, backend/app/rbac/context.py:73-92,
 * backend/app/rbac/dependencies.py:38-44). El normalizador discrimina por la
 * forma de `detail`, no por el status, y descarta las claves extra.
 */
import { describe, expect, it } from "vitest";

import { errorDeCuerpoIlegible, normalizeApiError } from "./api-error";
import { ApiError } from "../types/errors";
import type { ApiErrorKind, CampoError } from "../types/errors";

interface Esperado {
  kind: ApiErrorKind;
  status: number;
  causa: string | null;
  detalle: string;
  campos?: readonly CampoError[];
}

type Caso =
  | {
      nombre: string;
      origen: "json";
      status: number;
      body: unknown;
      esperado: Esperado;
    }
  | {
      nombre: string;
      origen: "crudo";
      status: number;
      texto: string;
      esperado: Esperado;
    };

const CASOS: readonly Caso[] = [
  {
    nombre: "409 de conflicto con {causa, detalle}",
    origen: "json",
    status: 409,
    body: {
      detail: {
        causa: "profesional",
        detalle:
          "el profesional ya tiene un turno activo que intersecta [2026-11-10T09:00:00-03:00, 2026-11-10T09:30:00-03:00)",
      },
    },
    esperado: {
      kind: "conflicto",
      status: 409,
      causa: "profesional",
      detalle:
        "el profesional ya tiene un turno activo que intersecta [2026-11-10T09:00:00-03:00, 2026-11-10T09:30:00-03:00)",
    },
  },
  {
    nombre: "409 con la clave extra accion_previa (recordatorios)",
    origen: "json",
    status: 409,
    body: {
      detail: {
        causa: "ya_usado",
        detalle: "el token ya se uso para confirmar",
        accion_previa: "confirmar",
      },
    },
    esperado: {
      kind: "conflicto",
      status: 409,
      causa: "ya_usado",
      detalle: "el token ya se uso para confirmar",
    },
  },
  {
    nombre: "404 con detail string",
    origen: "json",
    status: 404,
    body: { detail: "paciente no existe: 5b8f0d6e-3a2c-4a41-9f0e-7a1f6b0c9d21" },
    esperado: {
      kind: "no_encontrado",
      status: 404,
      causa: null,
      detalle: "paciente no existe: 5b8f0d6e-3a2c-4a41-9f0e-7a1f6b0c9d21",
    },
  },
  {
    nombre: "422 de dominio con detail string",
    origen: "json",
    status: 422,
    body: { detail: "inicio debe tener zona horaria" },
    esperado: {
      kind: "validacion",
      status: 422,
      causa: null,
      detalle: "inicio debe tener zona horaria",
    },
  },
  {
    nombre: "422 de validación de FastAPI con detail lista",
    origen: "json",
    status: 422,
    body: {
      detail: [
        { loc: ["body", "inicio"], msg: "Field required", type: "missing" },
        {
          loc: ["body", "inicio"],
          msg: "Input should be a valid datetime",
          type: "datetime_parsing",
        },
      ],
    },
    esperado: {
      kind: "validacion",
      status: 422,
      causa: null,
      detalle:
        "body.inicio: Field required; body.inicio: Input should be a valid datetime",
      campos: [
        { ubicacion: "body.inicio", mensaje: "Field required" },
        {
          ubicacion: "body.inicio",
          mensaje: "Input should be a valid datetime",
        },
      ],
    },
  },
  {
    nombre: "422 de rol desconocido con {causa, detalle}",
    origen: "json",
    status: 422,
    body: {
      detail: {
        causa: "rol_desconocido",
        detalle: "Rol 'inventado' no reconocido",
      },
    },
    esperado: {
      kind: "validacion",
      status: 422,
      causa: "rol_desconocido",
      detalle: "Rol 'inventado' no reconocido",
    },
  },
  {
    nombre: "403 de permiso denegado con {causa, detalle}",
    origen: "json",
    status: 403,
    body: {
      detail: {
        causa: "permiso_denegado",
        detalle: "Rol recepcion no puede admin:gestionar",
      },
    },
    esperado: {
      kind: "permiso",
      status: 403,
      causa: "permiso_denegado",
      detalle: "Rol recepcion no puede admin:gestionar",
    },
  },
  {
    nombre: "cuerpo vacío (respuesta sin JSON)",
    origen: "crudo",
    status: 502,
    texto: "",
    esperado: {
      kind: "red",
      status: 502,
      causa: null,
      detalle: "",
    },
  },
  {
    nombre: "cuerpo HTML de un proxy (respuesta sin JSON)",
    origen: "crudo",
    status: 502,
    texto: "<html><head><title>502 Bad Gateway</title></head></html>",
    esperado: {
      kind: "red",
      status: 502,
      causa: null,
      detalle: "<html><head><title>502 Bad Gateway</title></head></html>",
    },
  },
];

function normalizar(caso: Caso): ApiError {
  return caso.origen === "json"
    ? normalizeApiError(caso.status, caso.body)
    : errorDeCuerpoIlegible(caso.status, caso.texto);
}

describe("las formas de error del backend convergen en ApiError", () => {
  for (const caso of CASOS) {
    it(caso.nombre, () => {
      const error = normalizar(caso);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe("ApiError");
      expect(error.kind).toBe(caso.esperado.kind);
      expect(error.status).toBe(caso.esperado.status);
      expect(error.causa).toBe(caso.esperado.causa);
      expect(error.detalle).toBe(caso.esperado.detalle);
      expect(error.campos).toEqual(caso.esperado.campos ?? []);
    });
  }

  it("ignora las claves extra del cuerpo y no las copia al error", () => {
    const error = normalizeApiError(409, {
      detail: {
        causa: "ya_usado",
        detalle: "el token ya se uso para cancelar",
        accion_previa: "cancelar",
      },
    });

    expect(error.causa).toBe("ya_usado");
    expect(error.detalle).toBe("el token ya se uso para cancelar");
    expect(Object.getOwnPropertyNames(error)).not.toContain("accion_previa");
  });

  it("una forma desconocida cae en servidor con el texto crudo", () => {
    const error = normalizeApiError(500, { detail: 42 });

    expect(error.kind).toBe("servidor");
    expect(error.status).toBe(500);
    expect(error.detalle).toBe("42");
  });

  it("trunca el detalle crudo largo en vez de volcarlo entero", () => {
    const texto = "x".repeat(500);
    const error = errorDeCuerpoIlegible(504, texto);

    expect(error.kind).toBe("red");
    expect(error.detalle.length).toBeLessThanOrEqual(201);
    expect(error.detalle.startsWith("x".repeat(200))).toBe(true);
  });
});
