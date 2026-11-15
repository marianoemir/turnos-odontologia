/**
 * Pantalla `/agenda` (C-17, grupos 2-5, tasks 2.1-2.4, 3.1-3.2, 4.1-4.3 y
 * 5.1-5.2):
 * agenda del día con filtros de profesional (activos del catálogo) + fecha
 * (default hoy local) y tabla ordenada por inicio, con acciones de cancelar
 * y reprogramar.
 *
 * Patrón de `pages/catalogo-profesionales.tsx` y `admin-sucursales.tsx`:
 * listado con `DataTable` + `EmptyState` + `Skeleton` (vía `loading`), error
 * normalizado en `role=alert` sin romper el shell. La tabla respeta el orden
 * de llegada del backend (ordenado por `inicio` en C-05): `DataTable` se usa
 * sin columnas ordenables y sin reordenar en cliente (design D4). Sin columna
 * de profesional: ya es el filtro y el backend solo devuelve su día.
 *
 * Cancelar (task 3.1): solo turnos `pendiente`/`confirmado` y solo rol
 * `recepcion` (`renderActions` con `Modal` de confirmación que envía un único
 * `POST /turnos/{id}/cancelar` vía `useCancelarTurno`, sin optimistic update;
 * el éxito cierra con `Toast` y la invalidación de la raíz `turnos` refresca
 * la agenda, donde la fila ya no aparece porque el backend excluye
 * `cancelado`). Ante 409 con causa `transicion` muestra el mensaje fijo de
 * design D6 sin reintentar y con la fila intacta; ante 404 muestra el error
 * normalizado `no_encontrado` (task 3.2). En ambos fallos el diálogo queda
 * abierto y los filtros/tabla intactos.
 *
 * Reprogramar (tasks 4.1-4.3): misma puerta (`pendiente`/`confirmado`, solo
 * `recepcion`) con `Modal` de nuevo inicio (`datetime-local` → ISO con zona
 * vía `new Date(...).toISOString()`, body solo `{inicio}` sin `fin`, como en
 * `/turnos/nuevo`). Validación cliente bloquea el envío sin inicio; el 409
 * muestra el mensaje de su causa (mismo texto que C-16) sin reintento y con el
 * original intacto; el 422 se proyecta al campo vía `applyApiFieldErrors`
 * sin cerrar el diálogo.
 *
 * Grupos 2-5 completos en este archivo (tasks 5.1-5.2 incluidas):
 * estados finales con acciones deshabilitadas y motivo, y puerta por rol.
 */
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";

import { useSession } from "../auth/use-session";
import { Button } from "../components/button";
import { DataTable } from "../components/data-table";
import { EmptyState } from "../components/empty-state";
import { EstadoBadge } from "../components/estado-badge";
import { Modal } from "../components/modal";
import { Select } from "../components/select";
import { TextField } from "../components/text-field";
import { Toast } from "../components/toast";
import { applyApiFieldErrors } from "../forms/api-field-errors";
import { useAgenda, useCancelarTurno, useReprogramarTurno } from "../services/agenda";
import { useProfesionales } from "../services/catalogo";
import type { AgendaItem, EstadoTurno, Profesional } from "../types/api";
import { ApiError } from "../types/errors";

/** Estados que admiten cancelar y reprogramar (spec, tasks 3.1 y 4.1). */
const ESTADOS_OPERABLES: readonly EstadoTurno[] = ["pendiente", "confirmado"];

/** Mensaje fijo ante el 409 con causa `transicion` (design D6). */
const MENSAJE_TRANSICION =
  "Ese turno ya no se puede cancelar en su estado actual.";

/** El 403 nunca expira la sesión: es permiso, no autenticación (auth-response). */
const MENSAJE_PERMISO = "Permiso insuficiente.";

function esPermisoInsuficiente(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 403 || error.kind === "permiso")
  );
}

/**
 * Motivo visible para los estados finales (spec, task 5.1): se expone como
 * `title` en los botones deshabilitados sin emitir requests.
 */
function motivoNoOperable(estado: EstadoTurno): string {
  switch (estado) {
    case "atendido":
      return "El turno ya fue atendido y no se puede operar.";
    case "ausente":
      return "El turno figura ausente y no se puede operar.";
    case "cancelado":
      return "El turno ya está cancelado.";
    default:
      return "El turno ya no se puede operar en su estado actual.";
  }
}

/** Fila de la tabla: `DataTable` muestra cada celda salvo `estado` como texto. */
interface FilaAgenda {
  id: string;
  inicio: string;
  fin: string;
  paciente: string;
  prestacion: string;
  sillon: string;
  estado: EstadoTurno;
  /** Turno original: alimenta la acción de cancelar (`renderActions`). */
  turno: AgendaItem;
}

const COLUMNAS: {
  header: string;
  key: keyof FilaAgenda & string;
  render?: (fila: FilaAgenda) => ReactNode;
}[] = [
  { header: "Inicio", key: "inicio" },
  { header: "Fin", key: "fin" },
  { header: "Paciente", key: "paciente" },
  { header: "Prestación", key: "prestacion" },
  { header: "Sillón", key: "sillon" },
  {
    header: "Estado",
    key: "estado",
    render: (fila) => <EstadoBadge status={fila.estado} />,
  },
];

function aFila(item: AgendaItem): FilaAgenda {
  return {
    id: item.id,
    inicio: aHora(item.inicio),
    fin: aHora(item.fin),
    paciente: item.paciente_nombre,
    prestacion: item.prestacion_nombre,
    sillon: item.sillon_nombre,
    estado: item.estado,
    turno: item,
  };
}

/** Hoy local `yyyy-mm-dd` (default del filtro; design D4, ver `ui` de caja). */
function hoyLocal(): string {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

/** `yyyy-mm-dd`: el mismo gate de `enabled` que `services/agenda.ts`. */
function esFechaValida(fecha: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha);
}

/**
 * `"HH:MM"` de la pared del ISO: el backend responde en
 * `America/Argentina/Buenos_Aires` (C-05), así que la hora del string ya es
 * la hora de agenda sin depender de la zona del navegador que la muestra.
 */
function aHora(iso: string): string {
  const coincidencia = /T(\d{2}:\d{2})/.exec(iso);
  return coincidencia?.[1] ?? iso;
}

function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "No se pudo cargar la agenda.";
}

interface ConfirmarCancelacionProps {
  turno: AgendaItem;
  onClose: () => void;
  onHecha: (mensaje: string) => void;
}

/**
 * Confirmación de cancelación (task 3.1, patrón `ConfirmarBaja` de
 * `admin-sucursales.tsx`): envía un único `POST /turnos/{id}/cancelar` y el
 * éxito invalida la raíz `turnos` (refresca la agenda sin optimistic update).
 * Ante 409 con causa `transicion` muestra el mensaje fijo de design D6 y el
 * diálogo queda abierto con la fila intacta; cualquier otro fallo muestra el
 * error normalizado (task 3.2, p. ej. 404 `no_encontrado`). Nunca reintenta.
 */
function ConfirmarCancelacion({ turno, onClose, onHecha }: ConfirmarCancelacionProps) {
  const cancelar = useCancelarTurno();
  const [error, setError] = useState<string | null>(null);

  async function confirmar(): Promise<void> {
    setError(null);
    try {
      await cancelar.mutateAsync(turno.id);
      onHecha("Turno cancelado.");
    } catch (desconocido) {
      if (esPermisoInsuficiente(desconocido)) {
        setError(MENSAJE_PERMISO);
        return;
      }
      if (
        desconocido instanceof ApiError &&
        desconocido.status === 409 &&
        desconocido.causa === "transicion"
      ) {
        setError(MENSAJE_TRANSICION);
        return;
      }
      setError(mensajeDeError(desconocido));
    }
  }

  return (
    <div>
      <p>
        {`El turno de «${turno.paciente_nombre}» de las ${aHora(turno.inicio)} quedará cancelado. No se borra: deja de aparecer en la agenda.`}
      </p>
      {error !== null ? <p role="alert">{error}</p> : null}
      <div>
        <Button disabled={cancelar.isPending} onClick={onClose} variant="secondary">
          Cancelar
        </Button>
        <Button
          disabled={cancelar.isPending}
          onClick={() => void confirmar()}
          variant="danger"
        >
          {cancelar.isPending ? "Cancelando…" : "Confirmar"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Mensaje por causa del 409 al reprogramar (design D6, task 4.2): idéntico al
 * de `turno-nuevo.tsx:89-102`. Una causa desconocida devuelve `null`
 * (mensaje genérico + detalle).
 */
function mensajePorCausa(causa: string | null): string | null {
  switch (causa) {
    case "profesional":
      return "Ese profesional ya tiene un turno en ese horario.";
    case "sillon":
      return "Ese sillón ya está ocupado en ese horario.";
    case "horario":
      return "Está fuera del horario de atención del profesional.";
    case "bloqueo":
      return "Hay un bloqueo en ese horario.";
    default:
      return null;
  }
}

interface ReprogramarValores {
  inicio: string;
}

interface ReprogramarTurnoProps {
  turno: AgendaItem;
  onClose: () => void;
  onHecha: (mensaje: string) => void;
}

/**
 * Reprogramación (tasks 4.1-4.3, espejo de `ConfirmarCancelacion`): `Modal`
 * con campo `datetime-local` convertido a ISO con zona
 * (`new Date(...).toISOString()`, como en `/turnos/nuevo`) y body solo
 * `{inicio}` sin `fin`. Validación cliente bloquea el envío sin inicio; el
 * éxito invalida la raíz `turnos` (refresca la agenda sin optimistic update).
 * Ante 409 muestra el mensaje de su causa sin reintentar y con el original
 * intacto; el 422 se proyecta al campo vía `applyApiFieldErrors` sin cerrar
 * el diálogo. Nunca reintenta.
 */
function ReprogramarTurno({ turno, onClose, onHecha }: ReprogramarTurnoProps) {
  const reprogramar = useReprogramarTurno();
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<ReprogramarValores>({ defaultValues: { inicio: "" } });
  const [fallo, setFallo] = useState<{ mensaje: string; detalle: string | null } | null>(
    null,
  );

  async function confirmar(valores: ReprogramarValores): Promise<void> {
    setFallo(null);
    try {
      await reprogramar.mutateAsync({
        id: turno.id,
        inicio: new Date(valores.inicio.trim()).toISOString(),
      });
      onHecha("Turno reprogramado.");
    } catch (desconocido) {
      if (desconocido instanceof ApiError) {
        if (esPermisoInsuficiente(desconocido)) {
          setFallo({ mensaje: MENSAJE_PERMISO, detalle: null });
          return;
        }
        if (applyApiFieldErrors(desconocido, setError, ["inicio"])) {
          return;
        }
        if (desconocido.status === 409) {
          const mensaje = mensajePorCausa(desconocido.causa);
          if (mensaje !== null) {
            setFallo({
              mensaje,
              detalle: desconocido.detalle === "" ? null : desconocido.detalle,
            });
            return;
          }
        }
      }
      setFallo({ mensaje: mensajeDeError(desconocido), detalle: null });
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void handleSubmit(confirmar)(evento)}>
      <p>
        {`El turno de «${turno.paciente_nombre}» de las ${aHora(turno.inicio)} pasará al nuevo inicio. El fin lo recalcula el servidor.`}
      </p>
      <TextField
        error={errors.inicio?.message}
        label="Nuevo inicio"
        type="datetime-local"
        {...register("inicio", {
          required: "Elegí el nuevo inicio.",
          validate: (valor) => {
            const texto = (valor ?? "").trim();
            if (texto === "") {
              return "Elegí el nuevo inicio.";
            }
            return Number.isNaN(new Date(texto).getTime())
              ? "Elegí una fecha válida."
              : true;
          },
        })}
      />
      {fallo !== null ? (
        <>
          <p role="alert">{fallo.mensaje}</p>
          {fallo.detalle !== null ? <p>{fallo.detalle}</p> : null}
        </>
      ) : null}
      <div>
        <Button disabled={reprogramar.isPending} onClick={onClose} variant="secondary">
          Cancelar
        </Button>
        <Button disabled={reprogramar.isPending} type="submit">
          {reprogramar.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

export default function AgendaPage() {
  const profesionalesQuery = useProfesionales();
  const { session } = useSession();
  const esRecepcion = session?.rol === "recepcion";
  const [profesionalId, setProfesionalId] = useState("");
  const [fecha, setFecha] = useState(hoyLocal);
  const [cancelando, setCancelando] = useState<AgendaItem | null>(null);
  const [reprogramando, setReprogramando] = useState<AgendaItem | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cerrarAviso = useCallback(() => setAviso(null), []);
  const cerrarDialogo = useCallback(() => setCancelando(null), []);
  const cerrarReprograma = useCallback(() => setReprogramando(null), []);

  function alTerminar(mensaje: string): void {
    setCancelando(null);
    setReprogramando(null);
    setAviso(mensaje);
  }

  const profesionales = Array.isArray(profesionalesQuery.data)
    ? profesionalesQuery.data.filter((profesional: Profesional) => profesional.activo)
    : [];
  // Default = primer activo una vez cargado (design D4); controlado sin
  // efecto: mientras no haya elección manual se usa el primero disponible.
  const profesionalElegido =
    profesionalId !== "" ? profesionalId : (profesionales[0]?.id ?? "");
  const agenda = useAgenda(profesionalElegido, fecha);

  let contenido: ReactNode;
  if (profesionalesQuery.isError) {
    contenido = (
      <div role="alert">
        <p>No se pudieron cargar los profesionales.</p>
        <Button variant="secondary" onClick={() => void profesionalesQuery.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  } else if (profesionalesQuery.isPending) {
    contenido = (
      <DataTable<FilaAgenda>
        columns={COLUMNAS}
        getRowId={(fila) => fila.id}
        loading
        rows={[]}
      />
    );
  } else if (profesionalElegido === "" || !esFechaValida(fecha)) {
    contenido = <p>Elegí un profesional y una fecha válida para ver la agenda.</p>;
  } else if (agenda.isPending) {
    contenido = (
      <DataTable<FilaAgenda>
        columns={COLUMNAS}
        getRowId={(fila) => fila.id}
        loading
        rows={[]}
      />
    );
  } else if (agenda.isError) {
    contenido = <p role="alert">{mensajeDeError(agenda.error)}</p>;
  } else if (agenda.data.length === 0) {
    contenido = (
      <EmptyState
        title="Sin turnos en este día"
        description="Probá con otro profesional u otra fecha."
      />
    );
  } else {
    contenido = (
      <DataTable
        columns={COLUMNAS}
        getRowId={(fila) => fila.id}
        renderActions={
          esRecepcion
            ? (fila) =>
                ESTADOS_OPERABLES.includes(fila.turno.estado) ? (
                  <>
                    <Button
                      aria-label={`Cancelar turno de ${fila.turno.paciente_nombre}`}
                      onClick={() => setCancelando(fila.turno)}
                      variant="ghost"
                    >
                      Cancelar
                    </Button>
                    <Button
                      aria-label={`Reprogramar turno de ${fila.turno.paciente_nombre}`}
                      onClick={() => setReprogramando(fila.turno)}
                      variant="ghost"
                    >
                      Reprogramar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      aria-label={`Cancelar turno de ${fila.turno.paciente_nombre}`}
                      disabled
                      title={motivoNoOperable(fila.turno.estado)}
                      variant="ghost"
                    >
                      Cancelar
                    </Button>
                    <Button
                      aria-label={`Reprogramar turno de ${fila.turno.paciente_nombre}`}
                      disabled
                      title={motivoNoOperable(fila.turno.estado)}
                      variant="ghost"
                    >
                      Reprogramar
                    </Button>
                  </>
                )
            : undefined
        }
        rows={agenda.data.map(aFila)}
      />
    );
  }

  return (
    <section>
      <h1 className="app-title">Agenda</h1>
      <Select
        label="Profesional"
        value={profesionalElegido}
        onChange={(evento) => setProfesionalId(evento.target.value)}
        options={[
          { label: "Elegí un profesional.", value: "" },
          ...profesionales.map((profesional) => ({
            label: profesional.nombre,
            value: profesional.id,
          })),
        ]}
      />
      <TextField
        label="Fecha"
        type="date"
        value={fecha}
        onChange={(evento) => setFecha(evento.target.value)}
      />
      {contenido}
      {aviso !== null ? <Toast onDismiss={cerrarAviso}>{aviso}</Toast> : null}
      <Modal onClose={cerrarDialogo} open={cancelando !== null} title="Cancelar turno">
        {cancelando !== null ? (
          <ConfirmarCancelacion
            key={cancelando.id}
            onClose={cerrarDialogo}
            onHecha={alTerminar}
            turno={cancelando}
          />
        ) : null}
      </Modal>
      <Modal onClose={cerrarReprograma} open={reprogramando !== null} title="Reprogramar turno">
        {reprogramando !== null ? (
          <ReprogramarTurno
            key={reprogramando.id}
            onClose={cerrarReprograma}
            onHecha={alTerminar}
            turno={reprogramando}
          />
        ) : null}
      </Modal>
    </section>
  );
}
