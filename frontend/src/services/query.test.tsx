import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { resourceKeys, useResourceMutation } from "./query";

function CrearTurnoButton() {
  const mutation = useResourceMutation("turnos", async () => "creado");

  return (
    <button type="button" onClick={() => mutation.mutate()}>
      Crear turno
    </button>
  );
}

function FallarCrearTurnoButton() {
  const mutation = useResourceMutation("turnos", async () => {
    throw new Error("sin conexión");
  });

  return (
    <>
      <button type="button" onClick={() => mutation.mutate()}>
        Fallar creación
      </button>
      {mutation.isError ? <p role="status">Error</p> : null}
    </>
  );
}

describe("convenciones de cache por recurso", () => {
  it("invalida turnos después de una mutación exitosa sin invalidar pacientes", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(resourceKeys.turnos.all, [{ id: "turno-1" }]);
    queryClient.setQueryData(resourceKeys.pacientes.all, [{ id: "paciente-1" }]);

    render(
      <QueryClientProvider client={queryClient}>
        <CrearTurnoButton />
      </QueryClientProvider>,
    );

    await userEvent.setup().click(
      screen.getByRole("button", { name: "Crear turno" }),
    );

    await waitFor(() => {
      expect(
        queryClient.getQueryState(resourceKeys.turnos.all)?.isInvalidated,
      ).toBe(true);
    });
    expect(
      queryClient.getQueryState(resourceKeys.pacientes.all)?.isInvalidated,
    ).toBe(false);
  });

  it("conserva la consulta de turnos vigente cuando la mutación falla", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(resourceKeys.turnos.all, [{ id: "turno-1" }]);

    render(
      <QueryClientProvider client={queryClient}>
        <FallarCrearTurnoButton />
      </QueryClientProvider>,
    );

    await userEvent.setup().click(
      screen.getByRole("button", { name: "Fallar creación" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Error");
    });
    expect(
      queryClient.getQueryState(resourceKeys.turnos.all)?.isInvalidated,
    ).toBe(false);
  });
});
