/**
 * RED de 1.3 (C-16) — esquema del formulario de creación de turnos.
 *
 * El submit incompleto no dispara request y cada campo faltante muestra su
 * error accesible (patrón de `form-schemas.test.tsx`). Triangulación con dos
 * casos: submit totalmente vacío (5 errores, sin request) y submit parcial
 * (solo paciente completo: sigue sin request y los 4 restantes con error).
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextField } from "../components/text-field";
import {
  turnoFormResolver,
  type TurnoFormValues,
} from "./schemas";

afterEach(cleanup);

function TurnoForm({
  onSubmit,
}: {
  onSubmit: (values: TurnoFormValues) => void;
}) {
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<TurnoFormValues>({
    resolver: turnoFormResolver,
  });

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      <TextField
        error={errors.paciente_id?.message}
        label="Paciente"
        {...register("paciente_id")}
      />
      <TextField
        error={errors.profesional_id?.message}
        label="Profesional"
        {...register("profesional_id")}
      />
      <TextField
        error={errors.prestacion_id?.message}
        label="Prestación"
        {...register("prestacion_id")}
      />
      <TextField
        error={errors.sillon_id?.message}
        label="Sillón"
        {...register("sillon_id")}
      />
      <TextField
        error={errors.inicio?.message}
        label="Inicio"
        type="datetime-local"
        {...register("inicio")}
      />
      <button type="submit">Crear turno</button>
    </form>
  );
}

describe("esquema del formulario de turnos", () => {
  it("el submit vacío no dispara request y cada campo muestra su error accesible", async () => {
    const user = userEvent.setup();
    const crear = vi.fn();
    render(<TurnoForm onSubmit={crear} />);

    await user.click(screen.getByRole("button", { name: "Crear turno" }));

    expect(crear).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: "Paciente" }),
    ).toHaveAccessibleDescription("Elegí un paciente.");
    expect(
      screen.getByRole("textbox", { name: "Profesional" }),
    ).toHaveAccessibleDescription("Elegí un profesional.");
    expect(
      screen.getByRole("textbox", { name: "Prestación" }),
    ).toHaveAccessibleDescription("Elegí una prestación.");
    expect(
      screen.getByRole("textbox", { name: "Sillón" }),
    ).toHaveAccessibleDescription("Elegí un sillón.");
    expect(screen.getByLabelText("Inicio")).toHaveAccessibleDescription(
      "Ingresá el inicio.",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(5);
  });

  it("el submit parcial no dispara request y solo los faltantes muestran error", async () => {
    const user = userEvent.setup();
    const crear = vi.fn();
    render(<TurnoForm onSubmit={crear} />);

    await user.type(screen.getByRole("textbox", { name: "Paciente" }), "pac-1");
    await user.click(screen.getByRole("button", { name: "Crear turno" }));

    expect(crear).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: "Paciente" }),
    ).not.toHaveAccessibleDescription("Elegí un paciente.");
    expect(
      screen.getByRole("textbox", { name: "Profesional" }),
    ).toHaveAccessibleDescription("Elegí un profesional.");
    expect(
      screen.getByRole("textbox", { name: "Sillón" }),
    ).toHaveAccessibleDescription("Elegí un sillón.");
    expect(screen.getByLabelText("Inicio")).toHaveAccessibleDescription(
      "Ingresá el inicio.",
    );
  });
});
