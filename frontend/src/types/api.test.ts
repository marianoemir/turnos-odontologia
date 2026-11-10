import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ESTADO_TURNO_LABELS,
  type Bloqueo,
  type EstadoTurno,
  type HorarioAtencion,
  type Paciente,
  type Prestacion,
  type Profesional,
  type Sillon,
  type SillonBox,
  type Turno,
} from "./api";

/**
 * Contratos espejo (design D6). Cada `toEqualTypeOf` exige igualdad exacta de tipo:
 * un campo de más, de menos o con otro tipo rompe `tsc -b`. `expectTypeOf` no
 * ejecuta nada; el valor está en que la compilación lo revisa.
 */
describe("contratos espejo de los schemas de lectura", () => {
  it("Paciente replica PacienteOut (agenda/schemas.py:60-68)", () => {
    expectTypeOf<Paciente>().toEqualTypeOf<{
      id: string;
      nombre: string;
      dni: string;
      contacto: string | null;
      ficticio: boolean;
      activo: boolean;
    }>();
  });

  it("Profesional replica ProfesionalOut (agenda/schemas.py:103-110)", () => {
    expectTypeOf<Profesional>().toEqualTypeOf<{
      id: string;
      nombre: string;
      matricula: string;
      sucursal_id: string | null;
      activo: boolean;
    }>();
  });

  it("SillonBox replica SillonOut (agenda/schemas.py:136-142)", () => {
    expectTypeOf<SillonBox>().toEqualTypeOf<{
      id: string;
      nombre: string;
      sucursal_id: string | null;
      activo: boolean;
    }>();
  });

  it("SillonBox es alias de Sillon (design Q3)", () => {
    expectTypeOf<SillonBox>().toEqualTypeOf<Sillon>();
  });

  it("Prestacion replica PrestacionOut (agenda/schemas.py:168-174)", () => {
    expectTypeOf<Prestacion>().toEqualTypeOf<{
      id: string;
      nombre: string;
      duracion_min: number;
      activo: boolean;
    }>();
  });

  it("HorarioAtencion replica HorarioOut (agenda/schemas.py:223-231)", () => {
    expectTypeOf<HorarioAtencion>().toEqualTypeOf<{
      id: string;
      profesional_id: string;
      dia_semana: number;
      desde: string;
      hasta: string;
      activo: boolean;
    }>();
  });

  it("Bloqueo replica BloqueoOut (agenda/schemas.py:251-259)", () => {
    expectTypeOf<Bloqueo>().toEqualTypeOf<{
      id: string;
      profesional_id: string | null;
      sillon_id: string | null;
      desde: string;
      hasta: string;
      motivo: string;
    }>();
  });

  it("Turno replica TurnoOut (turnos/schemas.py:23-34)", () => {
    expectTypeOf<Turno>().toEqualTypeOf<{
      id: string;
      paciente_id: string;
      profesional_id: string;
      sillon_id: string;
      prestacion_id: string;
      inicio: string;
      fin: string;
      estado: EstadoTurno;
      creado_por: string | null;
    }>();
  });

  it("rechaza en compilación un Paciente sin un campo obligatorio", () => {
    // @ts-expect-error — falta `activo`, obligatorio en PacienteOut.
    // Si el tipo se aflojara (`any` o firma de índice), la directiva quedaría sin
    // usar y `tsc -b` fallaría por "Unused '@ts-expect-error' directive".
    const pacienteIncompleto: Paciente = {
      id: "00000000-0000-0000-0000-000000000001",
      nombre: "Paciente Ficticio",
      dni: "00000000",
      contacto: null,
      ficticio: true,
    };

    expectTypeOf(pacienteIncompleto).toEqualTypeOf<Paciente>();
  });

  it("rechaza en compilación un Turno con estado de otro tipo", () => {
    const turnoInvalido: Turno = {
      id: "00000000-0000-0000-0000-000000000002",
      paciente_id: "00000000-0000-0000-0000-000000000001",
      profesional_id: "00000000-0000-0000-0000-000000000003",
      sillon_id: "00000000-0000-0000-0000-000000000004",
      prestacion_id: "00000000-0000-0000-0000-000000000005",
      inicio: "2026-11-10T09:00:00-03:00",
      fin: "2026-11-10T09:30:00-03:00",
      // @ts-expect-error — `estado` es `string` en TurnoOut, no un número.
      estado: 1,
      creado_por: null,
    };

    expectTypeOf(turnoInvalido).toEqualTypeOf<Turno>();
  });
});

/**
 * Estado de turno (design D6, spec "Estado de turno fuera de la unión"):
 * `EstadoTurno` es la unión de los cinco `ESTADOS` del dominio y el mapeo a
 * etiquetas es exhaustivo, con un `switch` que cierra en `never`.
 */
describe("EstadoTurno y el mapeo exhaustivo a etiquetas", () => {
  it("EstadoTurno es la unión de los 5 ESTADOS (turnos/models.py:27-33)", () => {
    expectTypeOf<EstadoTurno>().toEqualTypeOf<
      "pendiente" | "confirmado" | "atendido" | "ausente" | "cancelado"
    >();
  });

  it("ESTADO_TURNO_LABELS cubre exactamente las 5 claves del dominio", () => {
    expect(Object.keys(ESTADO_TURNO_LABELS).sort()).toEqual([
      "atendido",
      "ausente",
      "cancelado",
      "confirmado",
      "pendiente",
    ]);

    // Exactitud de claves en compilación: ni una de más ni una de menos.
    expectTypeOf<keyof typeof ESTADO_TURNO_LABELS>().toEqualTypeOf<EstadoTurno>();
  });

  it("ninguna etiqueta está vacía", () => {
    for (const etiqueta of Object.values(ESTADO_TURNO_LABELS)) {
      expect(typeof etiqueta).toBe("string");
      expect(etiqueta.trim().length).toBeGreaterThan(0);
    }
  });
});
