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

export const pacienteFormSchema = z.object({
  dni: dniSchema,
});

export const prestacionFormSchema = z.object({
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

export type PacienteFormValues = z.input<typeof pacienteFormSchema>;
export type PrestacionFormValues = z.input<typeof prestacionFormSchema>;
export type HorarioFormValues = z.input<typeof horarioFormSchema>;

export const pacienteFormResolver = zodResolver(pacienteFormSchema);
export const prestacionFormResolver = zodResolver(prestacionFormSchema);
export const horarioFormResolver = zodResolver(horarioFormSchema);
