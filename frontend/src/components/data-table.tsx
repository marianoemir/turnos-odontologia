import { useMemo, useState } from "react";
import { EmptyState } from "./empty-state";
import { Skeleton } from "./skeleton";
import "./ui.css";

type Column<T extends object> = {
  header: string;
  key: keyof T & string;
  sortable?: boolean;
};

type DataTableProps<T extends object> = {
  columns: readonly Column<T>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  rows: readonly T[];
};

type SortDirection = "ascending" | "descending";
type SortState<T extends object> = { direction: SortDirection; key: keyof T & string } | undefined;

export function DataTable<T extends object>({
  columns,
  getRowId,
  loading = false,
  rows,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState<T>>();
  const displayedRows = useMemo(() => {
    if (!sort) {
      return rows;
    }

    return [...rows].sort((first, second) => {
      const comparison = String(first[sort.key]).localeCompare(String(second[sort.key]), "es");
      return sort.direction === "ascending" ? comparison : -comparison;
    });
  }, [rows, sort]);

  function toggleSort(key: keyof T & string): void {
    setSort((current) => ({
      key,
      direction:
        current?.key === key && current.direction === "ascending"
          ? "descending"
          : "ascending",
    }));
  }

  if (loading) {
    return (
      <div className="data-table__loading">
        <Skeleton aria-label="Cargando resultados" />
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState description="Probá con otros filtros." title="No hay resultados." />;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((column) => {
            const direction = sort?.key === column.key ? sort.direction : "none";
            return (
              <th aria-sort={column.sortable ? direction : undefined} key={column.key} scope="col">
                {column.sortable ? (
                  <button
                    aria-label={`Ordenar por ${column.header}`}
                    className="data-table__sort"
                    onClick={() => toggleSort(column.key)}
                    type="button"
                  >
                    {column.header}
                  </button>
                ) : column.header}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {displayedRows.map((row) => (
          <tr className="data-table__row" key={getRowId(row)}>
            {columns.map((column) => (
              <td data-label={column.header} key={column.key}>{String(row[column.key])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
