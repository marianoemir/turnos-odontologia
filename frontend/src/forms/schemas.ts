import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const dniSchema = z
  .string()
  .trim()
  .min(1, "Ingresá un DNI.")
  .max(32, "El DNI no puede superar los 32 caracteres.");

const duracionMinSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/, "La duración debe ser mayor que cero.");

const nombreSchema = z
  .string()
  .trim()
  .min(1, "Ingresá un nombre.")
  .max(200, "El nombre no puede superar los 200 caracteres.");

const contactoSchema = z.string().trim();

const matriculaSchema = z
  .string()
  .trim()
  .min(1, "Ingresá una matrícula.")
  .max(32, "La matrícula no puede superar los 32 caracteres.");

export const pacienteFormSchema = z.object({
  nombre: nombreSchema,
  dni: dniSchema,
  contacto: contactoSchema,
});

export const profesionalFormSchema = z.object({
  nombre: nombreSchema,
  matricula: matriculaSchema,
});

export const sillonFormSchema = z.object({
  nombre: nombreSchema,
});

export const prestacionFormSchema = z.object({
  nombre: nombreSchema,
  duracion_min: duracionMinSchema,
});

export const horarioFormSchema = z
  .object({
    desde: z.string().min(1, "Ingresá la hora desde."),
    hasta: z.string().min(1, "Ingresá la hora hasta."),
  })
  .refine(
    ({ desde, hasta }) => desde.length === 0 || hasta.length === 0 || desde < hasta,
    {
      message: "La hora hasta debe ser posterior a desde.",
      path: ["hasta"],
    },
  );

/**
 * Alta de bloqueo (C-15, task 7.1): profesional y sillón opcionales (texto del
 * `<select>`, `""` es global) que al enviar viajan como `null`, `desde`/`hasta`
 * en `datetime-local` (`"YYYY-MM-DDTHH:MM"` compara lexicográficamente igual
 * que cronológicamente) y `motivo` requerido. El `refine` `desde < hasta`
 * bloquea el submit antes de la request, igual que `horarioFormSchema`.
 */
export const bloqueoFormSchema = z
  .object({
    profesional_id: z.string(),
    sillon_id: z.string(),
    desde: z.string().min(1, "Ingresá el inicio."),
    hasta: z.string().min(1, "Ingresá el fin."),
    motivo: z.string().trim().min(1, "Ingresá un motivo."),
  })
  .refine(
    ({ desde, hasta }) => desde.length === 0 || hasta.length === 0 || desde < hasta,
    {
      message: "El fin debe ser posterior al inicio.",
      path: ["hasta"],
    },
  );

export type PacienteFormValues = z.input<typeof pacienteFormSchema>;
export type ProfesionalFormValues = z.input<typeof profesionalFormSchema>;
export type SillonFormValues = z.input<typeof sillonFormSchema>;
export type PrestacionFormValues = z.input<typeof prestacionFormSchema>;
export type HorarioFormValues = z.input<typeof horarioFormSchema>;
export type BloqueoFormValues = z.input<typeof bloqueoFormSchema>;

export const pacienteFormResolver = zodResolver(pacienteFormSchema);
export const profesionalFormResolver = zodResolver(profesionalFormSchema);
export const sillonFormResolver = zodResolver(sillonFormSchema);
export const prestacionFormResolver = zodResolver(prestacionFormSchema);
export const horarioFormResolver = zodResolver(horarioFormSchema);
export const bloqueoFormResolver = zodResolver(bloqueoFormSchema);
