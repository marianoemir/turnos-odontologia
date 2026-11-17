import { useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";

import { Button } from "../components/button";
import { Card } from "../components/card";
import { EmptyState } from "../components/empty-state";
import { Select } from "../components/select";
import { Skeleton } from "../components/skeleton";
import { TextField } from "../components/text-field";
import {
  usePrestacionesPublicas,
  useSlotsPublicos,
} from "../services/reserva-publica";
import { ApiError } from "../types/errors";
import type { SlotPublico } from "../types/api-reserva-publica";

/**
 * Pantalla pública `/reservar/:profesional` (C-21, grupo 3).
 *
 * `:profesional` es un id: se usa tal cual en `GET /reservar/{profesional}` y
 * no se consulta ningún endpoint para mostrar su nombre. Sólo se muestran los
 * intervalos `{inicio, fin}` que devuelve el contrato público (design D4/D7);
 * el alta y sus errores son del apply 4.
 */

const SIN_SELECCION =
  "Elegí una prestación y una fecha para ver los horarios disponibles.";

function horaDe(iso: string): string {
  const coincidencia = /T(\d{2}:\d{2})/.exec(iso);
  return coincidencia === null ? iso : coincidencia[1];
}

/** `09:00 a 09:30`: sólo inicio y fin, nunca el objeto completo del slot. */
function etiquetaDeSlot(slot: SlotPublico): string {
  return `${horaDe(slot.inicio)} a ${horaDe(slot.fin)}`;
}

function mensajeDeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "No se pudieron consultar los horarios disponibles.";
}

export default function ReservarPage() {
  const { profesional } = useParams();
  const profesionalId = profesional ?? "";
  const [prestacionId, setPrestacionId] = useState("");
  const [fecha, setFecha] = useState("");
  const [slotSeleccionado, setSlotSeleccionado] = useState<SlotPublico | null>(
    null,
  );

  const prestacionesQuery = usePrestacionesPublicas();
  const prestaciones = (prestacionesQuery.data ?? []).filter(
    (prestacion) => prestacion.activo,
  );

  const seleccionCompleta = prestacionId.length > 0 && fecha.length > 0;
  const slotsQuery = useSlotsPublicos(
    profesionalId,
    { prestacion: prestacionId, fecha },
    { enabled: seleccionCompleta },
  );
  const slots = slotsQuery.data ?? [];

  const opcionesPrestacion = [
    { value: "", label: "Seleccionar prestación" },
    ...prestaciones.map((prestacion) => ({
      value: prestacion.id,
      label: prestacion.nombre,
    })),
  ];

  // 3.3: al cambiar la selección, el slot elegido deja de ser válido y no debe
  // seguir visible como si perteneciera a la prestación/fecha vigente.
  function cambiarPrestacion(valor: string): void {
    setPrestacionId(valor);
    setSlotSeleccionado(null);
  }

  function cambiarFecha(valor: string): void {
    setFecha(valor);
    setSlotSeleccionado(null);
  }

  let contenido: ReactNode;
  if (!seleccionCompleta) {
    contenido = <p>{SIN_SELECCION}</p>;
  } else if (slotsQuery.isPending) {
    contenido = <Skeleton style={{ width: "100%" }} />;
  } else if (slotsQuery.isError) {
    contenido = <p role="alert">{mensajeDeError(slotsQuery.error)}</p>;
  } else if (slots.length === 0) {
    contenido = (
      <EmptyState
        title="Sin turnos disponibles"
        description="No hay horarios disponibles para la prestación y la fecha elegidas. Podés cambiar la fecha o la prestación."
      />
    );
  } else {
    contenido = (
      <section aria-label="Horarios disponibles">
        <h2>Horarios disponibles</h2>
        <ul>
          {slots.map((slot) => {
            const etiqueta = etiquetaDeSlot(slot);
            const seleccionado = slotSeleccionado?.inicio === slot.inicio;
            return (
              <li key={slot.inicio}>
                <Button
                  aria-pressed={seleccionado}
                  onClick={() => setSlotSeleccionado(slot)}
                  variant={seleccionado ? "primary" : "secondary"}
                >
                  {etiqueta}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section>
      <h1 className="app-title">Reservar turno</h1>

      <Card aria-label="Selección de turno">
        <Select
          label="Prestación"
          options={opcionesPrestacion}
          value={prestacionId}
          onChange={(event) => cambiarPrestacion(event.target.value)}
        />
        <TextField
          label="Fecha"
          type="date"
          value={fecha}
          onChange={(event) => cambiarFecha(event.target.value)}
        />
      </Card>

      {prestacionesQuery.isError ? (
        <p role="alert">{mensajeDeError(prestacionesQuery.error)}</p>
      ) : null}

      {contenido}

      {slotSeleccionado === null ? null : (
        <p>Horario seleccionado: {etiquetaDeSlot(slotSeleccionado)}</p>
      )}
    </section>
  );
}
