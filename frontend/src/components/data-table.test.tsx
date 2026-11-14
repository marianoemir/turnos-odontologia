import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { DataTable } from "./data-table";

afterEach(cleanup);

type Turno = { paciente: string; hora: string };

const rows: Turno[] = [
  { paciente: "Zulma", hora: "09:00" },
  { paciente: "Ana", hora: "10:00" },
];

const columns = [
  { header: "Paciente", key: "paciente", sortable: true },
  { header: "Hora", key: "hora" },
] as const;

describe("DataTable", () => {
  it("preserves input order until a configured sortable column is activated", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} getRowId={(row) => row.paciente} rows={rows} />);

    expect(screen.getAllByRole("row").at(1)).toHaveTextContent("Zulma");
    expect(screen.getByRole("columnheader", { name: "Paciente" })).toHaveAttribute(
      "aria-sort",
      "none",
    );

    await user.click(screen.getByRole("button", { name: "Ordenar por Paciente" }));

    expect(screen.getAllByRole("row").at(1)).toHaveTextContent("Ana");
    expect(screen.getByRole("columnheader", { name: "Paciente" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
  });

  it("communicates empty and loading states instead of rendering an ambiguous table", () => {
    const { rerender } = render(
      <DataTable columns={columns} getRowId={(row) => row.paciente} rows={[] as Turno[]} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("No hay resultados.");

    rerender(
      <DataTable columns={columns} getRowId={(row) => row.paciente} loading rows={[] as Turno[]} />,
    );

    expect(screen.getByRole("status", { name: "Cargando resultados" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("marks data rows for the <=46rem card-grid layout", () => {
    render(<DataTable columns={columns} getRowId={(row) => row.paciente} rows={rows} />);

    const table = screen.getByRole("table");
    const dataRow = within(table).getAllByRole("row")[1];

    expect(table).toHaveClass("data-table");
    expect(dataRow).toHaveClass("data-table__row");
  });
});
