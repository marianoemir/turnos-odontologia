import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./card";
import { Button } from "./button";
import { Select } from "./select";
import { TextField } from "./text-field";

describe("form controls", () => {
  it("keeps a primary action available by its accessible name", () => {
    render(<Button variant="primary">Guardar turno</Button>);

    expect(screen.getByRole("button", { name: "Guardar turno" })).toHaveClass(
      "btn--primary",
    );
  });

  it("associates text-field help and error content with an invalid input", () => {
    render(
      <TextField
        error="Ingresá un DNI válido."
        helpText="Sin puntos ni espacios."
        label="DNI"
        name="dni"
      />,
    );

    const input = screen.getByRole("textbox", { name: "DNI" });
    const error = screen.getByText("Ingresá un DNI válido.");
    const help = screen.getByText("Sin puntos ni espacios.");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "Sin puntos ni espacios. Ingresá un DNI válido.",
    );
    expect(input).toHaveAttribute(
      "aria-describedby",
      `${help.id} ${error.id}`,
    );
    expect(error).toHaveAttribute("role", "alert");
  });

  it("associates a select error and renders a surface card", () => {
    render(
      <Card aria-label="Detalle del turno">
        <Select
          error="Elegí un sillón."
          label="Sillón"
          name="sillon"
          options={[{ label: "Sillón 1", value: "1" }]}
        />
      </Card>,
    );

    expect(screen.getByRole("combobox", { name: "Sillón" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("Elegí un sillón.")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(screen.getByRole("region", { name: "Detalle del turno" })).toHaveClass(
      "card",
    );
  });
});
