/**
 * RED de 3.2 (C-22) — columna opcional de acciones de `DataTable`.
 *
 * Cambio aditivo sobre el componente de C-14: sin `renderActions` la tabla se
 * comporta como antes (lo siguen cubriendo las pruebas de `data-table.test.tsx`,
 * que no se modifican).
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "./data-table";

afterEach(cleanup);

type Fila = { id: string; nombre: string };

const rows: Fila[] = [
  { id: "1", nombre: "Ana" },
  { id: "2", nombre: "Beto" },
];

const columns = [{ header: "Nombre", key: "nombre" }] as const;

describe("DataTable — columna de acciones", () => {
  it("no agrega ninguna columna cuando no se pasa renderActions", () => {
    render(<DataTable columns={columns} getRowId={(row) => row.id} rows={rows} />);

    expect(screen.getAllByRole("columnheader")).toHaveLength(1);
    expect(screen.queryByRole("columnheader", { name: "Acciones" })).not.toBeInTheDocument();
  });

  it("agrega la columna «Acciones» con el contenido de renderActions en cada fila", () => {
    render(
      <DataTable
        columns={columns}
        getRowId={(row) => row.id}
        renderActions={(row) => <button type="button">Editar {row.nombre}</button>}
        rows={rows}
      />,
    );

    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: "Acciones" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar Ana" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar Beto" })).toBeInTheDocument();
  });

  it("cada acción recibe la fila de su propio renglón", async () => {
    const alEditar = vi.fn();
    render(
      <DataTable
        columns={columns}
        getRowId={(row) => row.id}
        renderActions={(row) => (
          <button type="button" onClick={() => alEditar(row)}>
            Editar {row.nombre}
          </button>
        )}
        rows={rows}
      />,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Editar Beto" }));

    expect(alEditar).toHaveBeenCalledTimes(1);
    expect(alEditar).toHaveBeenCalledWith({ id: "2", nombre: "Beto" });
  });
});