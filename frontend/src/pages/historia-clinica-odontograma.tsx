import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Skeleton } from "../components/skeleton";
import type { OdontogramaOut, PlanTratamientoOut } from "../types/api-hc";
import type { ApiError } from "../types/errors";
import {
  FILA_INFERIOR,
  FILA_SUPERIOR,
  labelPieza,
} from "./historia-clinica-fdi";
import { PanelPieza } from "./historia-clinica-panel-pieza";

// Mapa de estilos por token de estado: vacío y extensible; estilo neutro único.
const estilosPorEstado: Record<string, React.CSSProperties> = {};

export function OdontogramaSection({
  pacienteId,
  observaciones,
  planes,
  isPending = false,
  isError = false,
  error = null,
}: {
  pacienteId: string;
  observaciones: OdontogramaOut[];
  planes: PlanTratamientoOut[];
  isPending?: boolean;
  isError?: boolean;
  error?: ApiError | null;
}) {
  const [active, setActive] = useState<{ row: 0 | 1; col: number }>({
    row: 0,
    col: 0,
  });
  const [selectedPieza, setSelectedPieza] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  const filas = useMemo(() => [FILA_SUPERIOR, FILA_INFERIOR] as const, []);

  const estadoPorPieza = useMemo(() => {
    const map: Record<string, string> = {};
    for (const obs of observaciones) {
      // El estado vigente por pieza es el último recibido para esa pieza en la lista.
      map[obs.pieza] = obs.estado;
    }
    return map;
  }, [observaciones]);

  const setActiveAndFocus = (row: 0 | 1, col: number) => {
    const pieza = filas[row][col];
    setActive({ row, col });
    refs.current[pieza]?.focus();
  };

  const selectPieza = (pieza: string) => {
    setSelectedPieza(pieza);
  };

  const onKeyDown = (
    e: KeyboardEvent<HTMLDivElement>,
    row: 0 | 1,
    col: number,
  ) => {
    const last = 15;
    switch (e.key) {
      case "ArrowRight": {
        if (col < last) {
          e.preventDefault();
          setActiveAndFocus(row, col + 1);
        }
        return;
      }
      case "ArrowLeft": {
        if (col > 0) {
          e.preventDefault();
          setActiveAndFocus(row, col - 1);
        }
        return;
      }
      case "ArrowDown": {
        if (row === 0) {
          e.preventDefault();
          setActiveAndFocus(1, col);
        }
        return;
      }
      case "ArrowUp": {
        if (row === 1) {
          e.preventDefault();
          setActiveAndFocus(0, col);
        }
        return;
      }
      case "Home": {
        e.preventDefault();
        setActiveAndFocus(row, 0);
        return;
      }
      case "End": {
        e.preventDefault();
        setActiveAndFocus(row, last);
        return;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        selectPieza(filas[row][col]);
        return;
      }
      default:
        return;
    }
  };

  return (
    <section aria-label="Odontograma">
      <h2>Odontograma</h2>
      {isPending ? <Skeleton aria-label="Cargando odontograma" /> : null}
      {isError ? (
        <p role="alert">
          {error?.message ?? error?.detalle ?? "No se pudo cargar el odontograma."}
        </p>
      ) : null}
      {!isPending && !isError ? (
        <>
          <div role="grid" aria-label="Odontograma FDI">
            {filas.map((fila, rowIndex) => (
              <div key={rowIndex} role="row" style={{ display: "flex" }}>
                {fila.map((pieza, colIndex) => {
                  const estado = estadoPorPieza[pieza] ?? null;
                  const isActive =
                    active.row === rowIndex && active.col === colIndex;
                  const isSelected = selectedPieza === pieza;
                  return (
                    <div
                      key={pieza}
                      ref={(el) => {
                        refs.current[pieza] = el;
                      }}
                      role="gridcell"
                      data-pieza={pieza}
                      tabIndex={isActive ? 0 : -1}
                      aria-label={labelPieza(pieza, estado)}
                      aria-selected={isSelected ? "true" : undefined}
                      onFocus={() =>
                        setActive({ row: rowIndex as 0 | 1, col: colIndex })
                      }
                      onKeyDown={(e) =>
                        onKeyDown(e, rowIndex as 0 | 1, colIndex)
                      }
                      onClick={() => {
                        setActive({ row: rowIndex as 0 | 1, col: colIndex });
                        selectPieza(pieza);
                      }}
                      style={estado ? (estilosPorEstado[estado] ?? {}) : {}}
                    >
                      <span>{pieza}</span>
                      <span>{estado ?? "sin estado registrado"}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {selectedPieza ? (
            <PanelPieza
              key={selectedPieza}
              pieza={selectedPieza}
              pacienteId={pacienteId}
              observaciones={observaciones}
              planes={planes}
              onFocusPieza={() => refs.current[selectedPieza]?.focus()}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
