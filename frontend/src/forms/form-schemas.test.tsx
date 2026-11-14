import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { TextField } from "../components/text-field";
import {
  horarioFormResolver,
  type HorarioFormValues,
  pacienteFormResolver,
  type PacienteFormValues,
  prestacionFormResolver,
  type PrestacionFormValues,
} from "./schemas";

function PacienteForm({ onSubmit }: { onSubmit: (values: PacienteFormValues) => void }) {
  const { formState: { errors }, handleSubmit, register } = useForm<PacienteFormValues>({
    defaultValues: { dni: "" },
    resolver: pacienteFormResolver,
  });

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      <TextField error={errors.dni?.message} label="DNI" {...register("dni")} />
      <button type="submit">Guardar paciente</button>
    </form>
  );
}

function PrestacionForm({ onSubmit }: { onSubmit: (values: PrestacionFormValues) => void }) {
  const { formState: { errors }, handleSubmit, register } = useForm<PrestacionFormValues>({
    defaultValues: { duracion_min: "" },
    resolver: prestacionFormResolver,
  });

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      <TextField
        error={errors.duracion_min?.message}
        label="Duración"
        type="number"
        {...register("duracion_min")}
      />
      <button type="submit">Guardar prestación</button>
    </form>
  );
}

function HorarioForm({ onSubmit }: { onSubmit: (values: HorarioFormValues) => void }) {
  const { formState: { errors }, handleSubmit, register } = useForm<HorarioFormValues>({
    defaultValues: { desde: "", hasta: "" },
    resolver: horarioFormResolver,
  });

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      <TextField error={errors.desde?.message} label="Desde" type="time" {...register("desde")} />
      <TextField error={errors.hasta?.message} label="Hasta" type="time" {...register("hasta")} />
      <button type="submit">Guardar horario</button>
    </form>
  );
}

describe("schemas de formularios compartidos", () => {
  it("bloquea valores inválidos y anuncia cada error en su campo", async () => {
    const user = userEvent.setup();
    const guardarPaciente = vi.fn();
    const guardarPrestacion = vi.fn();
    const guardarHorario = vi.fn();

    render(
      <>
        <PacienteForm onSubmit={guardarPaciente} />
        <PrestacionForm onSubmit={guardarPrestacion} />
        <HorarioForm onSubmit={guardarHorario} />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Guardar paciente" }));
    await user.clear(screen.getByRole("spinbutton", { name: "Duración" }));
    await user.type(screen.getByRole("spinbutton", { name: "Duración" }), "0");
    await user.click(screen.getByRole("button", { name: "Guardar prestación" }));
    await user.type(screen.getByLabelText("Desde"), "10:00");
    await user.type(screen.getByLabelText("Hasta"), "10:00");
    await user.click(screen.getByRole("button", { name: "Guardar horario" }));

    expect(guardarPaciente).not.toHaveBeenCalled();
    expect(guardarPrestacion).not.toHaveBeenCalled();
    expect(guardarHorario).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "DNI" })).toHaveAccessibleDescription(
      "Ingresá un DNI.",
    );
    expect(screen.getByRole("spinbutton", { name: "Duración" })).toHaveAccessibleDescription(
      "La duración debe ser mayor que cero.",
    );
    expect(screen.getByLabelText("Hasta")).toHaveAccessibleDescription(
      "La hora hasta debe ser posterior a desde.",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(3);
  });
});
