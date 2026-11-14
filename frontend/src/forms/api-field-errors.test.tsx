import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it } from "vitest";
import { TextField } from "../components/text-field";
import { ApiError } from "../types/errors";
import { applyApiFieldErrors } from "./api-field-errors";
import { prestacionFormResolver, type PrestacionFormValues } from "./schemas";

const errorDeDuracion = new ApiError({
  kind: "validacion",
  status: 422,
  mensaje: "La request tiene campos inválidos: body.duracion_min: Input should be greater than 0",
  campos: [
    {
      ubicacion: "body.duracion_min",
      mensaje: "Input should be greater than 0",
    },
    {
      ubicacion: "body.duracion_min",
      mensaje: "El valor debe ser un entero.",
    },
  ],
});

afterEach(cleanup);

function PrestacionFormConErrorApi() {
  const { formState: { errors }, register, setError } = useForm<PrestacionFormValues>({
    defaultValues: { duracion_min: "30" },
    resolver: prestacionFormResolver,
  });

  return (
    <>
      <TextField
        error={errors.duracion_min?.message}
        label="Duración"
        type="number"
        {...register("duracion_min")}
      />
      <button
        type="button"
        onClick={() => applyApiFieldErrors(errorDeDuracion, setError, ["duracion_min"])}
      >
        Simular respuesta
      </button>
    </>
  );
}

describe("errores 422 de campo en formularios", () => {
  it("anuncia el mensaje normalizado de la API en el campo sin sustituirlo por un resumen genérico", async () => {
    const user = userEvent.setup();
    render(<PrestacionFormConErrorApi />);

    await user.click(screen.getByRole("button", { name: "Simular respuesta" }));

    expect(screen.getByRole("spinbutton", { name: "Duración" })).toHaveAccessibleDescription(
      "Input should be greater than 0",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Input should be greater than 0");
    expect(
      screen.queryByText(/La request tiene campos inválidos/),
    ).not.toBeInTheDocument();
  });

  it("conserva el primer error del campo en el orden que informó FastAPI", async () => {
    const user = userEvent.setup();
    render(<PrestacionFormConErrorApi />);

    await user.click(screen.getByRole("button", { name: "Simular respuesta" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Input should be greater than 0",
    );
    expect(screen.queryByText("El valor debe ser un entero.")).not.toBeInTheDocument();
  });
});
