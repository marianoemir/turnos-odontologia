import { useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";

import { Button } from "../components/button";
import { Card } from "../components/card";
import { EmptyState } from "../components/empty-state";
import { Select } from "../components/select";
import { Skeleton } from "../components/skeleton";
import { TextField } from "../components/text-field";
import {
  useCrearReservaPublica,
  usePrestacionesPublicas,
  useSlotsPublicos,
} from "../services/reserva-publica";
import { ApiError } from "../types/errors";
import type {
  ReservaOutPublica,
  SlotPublico,
} from "../types/api-reserva-publica";

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

function mensajeDeErrorSlots(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "No se pudieron consultar los horarios disponibles.";
}

function mensajeDeErrorAlta(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "No se pudo completar la reserva.";
  }
  if (error.status === 409) {
    const causa =
      error.detalle !== "" ? error.detalle : error.message;
    return `El horario ya no está disponible. ${causa} Podés elegir otro horario o fecha.`;
  }
  if (error.status === 429) {
    return "Se alcanzó el límite de solicitudes. Intentá más tarde.";
  }
  if (error.status === 422) {
    return error.detalle !== "" ? error.detalle : error.message;
  }
  if (error.kind === "red" || error.kind === "timeout") {
    return error.message;
  }
  return error.message;
}

export default function ReservarPage() {
  const { profesional } = useParams();
  const profesionalId = profesional ?? "";
  const [prestacionId, setPrestacionId] = useState("");
  const [fecha, setFecha] = useState("");
  const [slotSeleccionado, setSlotSeleccionado] = useState<SlotPublico | null>(
    null,
  );
  const [nombre, setNombre] = useState("");
  const [dni, setDni] = useState("");
  const [contacto, setContacto] = useState("");
  const [reservaCreada, setReservaCreada] = useState<ReservaOutPublica | null>(
    null,
  );
  const [errorAlta, setErrorAlta] = useState<unknown>(null);

  const prestacionesQuery = usePrestacionesPublicas();
  const prestaciones = (prestacionesQuery.data ?? []).filter(
    (prestacion) => prestacion.activo,
  );
  const altaMutation = useCrearReservaPublica();

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
    setErrorAlta(null);
  }

  function cambiarFecha(valor: string): void {
    setFecha(valor);
    setSlotSeleccionado(null);
    setErrorAlta(null);
  }

  function seleccionarSlot(slot: SlotPublico): void {
    setSlotSeleccionado(slot);
    setErrorAlta(null);
  }

  async function enviarReserva(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (altaMutation.isPending || slotSeleccionado === null) {
      return;
    }
    setErrorAlta(null);
    const body: {
      nombre: string;
      dni: string;
      contacto?: string;
      profesional_id: string;
      prestacion_id: string;
      inicio: string;
    } = {
      nombre,
      dni,
      profesional_id: profesionalId,
      prestacion_id: prestacionId,
      inicio: slotSeleccionado.inicio,
    };
    if (contacto.length > 0) {
      body.contacto = contacto;
    }
    try {
      const respuesta = await altaMutation.mutateAsync(body);
      setReservaCreada(respuesta);
    } catch (error) {
      setErrorAlta(error);
    }
  }

  let contenido: ReactNode;
  if (!seleccionCompleta) {
    contenido = <p>{SIN_SELECCION}</p>;
  } else if (slotsQuery.isPending) {
    contenido = <Skeleton style={{ width: "100%" }} />;
  } else if (slotsQuery.isError) {
    contenido = <p role="alert">{mensajeDeErrorSlots(slotsQuery.error)}</p>;
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
                  onClick={() => seleccionarSlot(slot)}
                  variant={seleccionado ? "primary" : "secondary"}
                  style={{ minHeight: "2.75rem", minWidth: "2.75rem" }}
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

  if (reservaCreada !== null) {
    return (
      <section>
        <h1 className="app-title">Reservar turno</h1>
        <Card aria-label="Confirmación de reserva">
          <h2>Turno pendiente</h2>
          <dl>
            <dt>Turno</dt>
            <dd>{reservaCreada.turno_id}</dd>
            <dt>Profesional</dt>
            <dd>{reservaCreada.profesional_id}</dd>
            <dt>Prestación</dt>
            <dd>{reservaCreada.prestacion_id}</dd>
            <dt>Inicio</dt>
            <dd>{horaDe(reservaCreada.inicio)}</dd>
            <dt>Fin</dt>
            <dd>{horaDe(reservaCreada.fin)}</dd>
            <dt>Estado</dt>
            <dd>{reservaCreada.estado}</dd>
          </dl>
        </Card>
      </section>
    );
  }

  const envioEnCurso = altaMutation.isPending;
  const conflictoAgenda =
    errorAlta instanceof ApiError && errorAlta.status === 409;

  return (
    <section>
      <h1 className="app-title">Reservar turno</h1>

      <Card aria-label="Selección de turno">
        <Select
          label="Prestación"
          options={opcionesPrestacion}
          value={prestacionId}
          onChange={(event) => cambiarPrestacion(event.target.value)}
          style={{ minHeight: "2.75rem" }}
        />
        <TextField
          label="Fecha"
          type="date"
          value={fecha}
          onChange={(event) => cambiarFecha(event.target.value)}
          style={{ minHeight: "2.75rem" }}
        />
      </Card>

      {prestacionesQuery.isError ? (
        <p role="alert">{mensajeDeErrorSlots(prestacionesQuery.error)}</p>
      ) : null}

      {contenido}

      {slotSeleccionado === null ? null : (
        <>
          <p>Horario seleccionado: {etiquetaDeSlot(slotSeleccionado)}</p>
          <form aria-label="Alta de reserva" onSubmit={enviarReserva}>
            <TextField
              label="Nombre"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              style={{ minHeight: "2.75rem" }}
            />
            <TextField
              label="DNI"
              value={dni}
              onChange={(event) => setDni(event.target.value)}
              style={{ minHeight: "2.75rem" }}
            />
            <TextField
              label="Contacto (opcional)"
              value={contacto}
              onChange={(event) => setContacto(event.target.value)}
              style={{ minHeight: "2.75rem" }}
            />
            <Button
              type="submit"
              disabled={envioEnCurso}
              aria-busy={envioEnCurso || undefined}
              style={{ minHeight: "2.75rem", minWidth: "2.75rem" }}
            >
              Confirmar reserva
            </Button>
          </form>
        </>
      )}

      {errorAlta ? (
        <p role="alert">{mensajeDeErrorAlta(errorAlta)}</p>
      ) : null}

      {conflictoAgenda ? (
        <Button
          type="button"
          onClick={() => void slotsQuery.refetch()}
          style={{ minHeight: "2.75rem", minWidth: "2.75rem" }}
        >
          Reconsultar horarios
        </Button>
      ) : null}
    </section>
  );
}
