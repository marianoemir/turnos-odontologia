import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";
import { EstadoBadge } from "./estado-badge";
import { Skeleton } from "./skeleton";

afterEach(cleanup);

describe("feedback components", () => {
  it.each([
    ["pendiente", "Pendiente"],
    ["confirmado", "Confirmado"],
    ["atendido", "Atendido"],
    ["ausente", "Ausente"],
    ["cancelado", "Cancelado"],
  ] as const)("shows the textual %s appointment state", (status, label) => {
    render(<EstadoBadge status={status} />);

    expect(screen.getByText(label)).toHaveClass(`estado--${status}`);
  });

  it("explains an empty result and exposes loading semantics", () => {
    render(
      <>
        <EmptyState
          description="Probá con otra fecha."
          title="No hay turnos para mostrar"
        />
        <Skeleton aria-label="Cargando agenda" />
      </>,
    );

    expect(screen.getByRole("status", { name: "No hay turnos para mostrar" }))
      .toHaveTextContent("Probá con otra fecha.");
    expect(screen.getByRole("status", { name: "Cargando agenda" }))
      .toHaveAttribute("aria-busy", "true");
  });
});
