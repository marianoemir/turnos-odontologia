/**
 * Sección `/catalogo/horarios` (C-15, tasks 6.1 y 6.2): editor de horarios de
 * atención por profesional y día (Lun–Vie).
 *
 * Patrón de `pages/catalogo-prestaciones.tsx`: listado con `DataTable` +
 * `EmptyState` + `Skeleton` (vía `loading`), formulario RHF + zod en modal,
 * `409 solape_horario` como error del formulario conservando valores y 422
 * vía `applyApiFieldErrors`, sin optimistic update (la mutación invalida la
 * raíz `horarios`). Los horarios se consultan en una sola query y se filtran
 * por profesional en cliente (design D2); el formulario reutiliza
 * `horarioFormSchema` (`desde < hasta` bloquea el submit) extendido con el
 * profesional y el día. `HorarioPatch` no admite `profesional_id`, así que la
 * edición lo muestra como texto fijo.
 */
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../components/button";
import { DataTable } from "../components/data-table";
import { EmptyState } from "../components/empty-state";
import { Modal } from "../components/modal";
import { Select } from "../components/select";
import { TextField } from "../components/text-field";
import { Toast } from "../components/toast";
import { applyApiFieldErrors } from "../forms/api-field-errors";
import { horarioFormSchema } from "../forms/schemas";
import {
  useActualizarHorario,
  useCrearHorario,
  useHorarios,
  useProfesionales,
  type CambioDeHorario,
} from "../services/catalogo";
import { recursoInactivoDe } from "../services/api-error";
import type { HorarioAtencion, Profesional } from "../types/api";
import { ApiError } from "../types/errors";

/** Días editables: Lun–Vie (backend `dia_semana` 0–4, lunes = 0). */
const DIAS = [
  { value: "0", label: "Lunes" },
  { value: "1", label: "Martes" },
  { value: "2", label: "Miércoles" },
  { value: "3", label: "Jueves" },
  { value: "4", label: "Viernes" },
];

function etiquetaDia(dia: number): string {
  return DIAS[dia]?.label ?? `Día ${dia}`;
}

/**
 * El formulario reutiliza `horarioFormSchema` (el `refine` `desde < hasta`
 * se conserva en el `.extend()`) y agrega el profesional y el día como
 * selects. El día viaja como texto del `<select>` y se numera al enviar.
 */
const editorSchema = horarioFormSchema.extend({
  profesional_id: z.string().min(1, "Elegí un profesional."),
  dia_semana: z.string().min(1, "Elegí un día."),
});

type EditorValues = z.input<typeof editorSchema>;

/** `<input type="time">` entrega `HH:MM`; el backend espera `HH:MM:SS`. */
function aHoraEnvio(valor: string): string {
  const limpio = valor.trim();
  return limpio.length === 5 ? `${limpio}:00` : limpio;
}

/** `HH:MM:SS` del backend a `HH:MM` para el `<input type="time">`. */
function aHoraFormulario(valor: string): string {
  return valor.slice(0, 5);
}

/** Fila de la tabla: `DataTable` muestra cada celda como texto. */
interface FilaHorario {
  id: string;
  profesional: string;
  dia: string;
  desde: string;
  hasta: string;
  estado: string;
  horario: HorarioAtencion;
}

function aFila(horario: HorarioAtencion, nombreProfesional: string): FilaHorario {
  return {
    id: horario.id,
    profesional: nombreProfesional,
    dia: etiquetaDia(horario.dia_semana),
    desde: aHoraFormulario(horario.desde),
    hasta: aHoraFormulario(horario.hasta),
    estado: horario.activo ? "Activo" : "Inactivo",
    horario,
  };
}

const COLUMNAS: { header: string; key: keyof FilaHorario & string }[] = [
  { header: "Profesional", key: "profesional" },
  { header: "Día", key: "dia" },
  { header: "Desde", key: "desde" },
  { header: "Hasta", key: "hasta" },
  { header: "Estado", key: "estado" },
];

type Dialogo =
  | { tipo: "crear" }
  | { tipo: "editar"; horario: HorarioAtencion };

function tituloDe(dialogo: Dialogo | null): string {
  if (dialogo === null) {
    return "";
  }
  switch (dialogo.tipo) {
    case "crear":
      return "Nuevo horario";
    case "editar":
      return "Editar horario";
  }
}

interface FormularioHorarioProps {
  /** `null` para el alta; el horario a editar en la edición. */
  horario: HorarioAtencion | null;
  profesionales: Profesional[];
  onClose: () => void;
  onGuardado: (mensaje: string) => void;
}

function nombreDe(profesionales: Profesional[], id: string): string {
  return profesionales.find((profesional) => profesional.id === id)?.nombre ?? "Profesional";
}

function FormularioHorario({
  horario,
  profesionales,
  onClose,
  onGuardado,
}: FormularioHorarioProps) {
  const crear = useCrearHorario();
  const actualizar = useActualizarHorario();
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<EditorValues>({
    defaultValues: {
      profesional_id: horario?.profesional_id ?? "",
      dia_semana: horario !== null ? String(horario.dia_semana) : "0",
      desde: horario !== null ? aHoraFormulario(horario.desde) : "",
      hasta: horario !== null ? aHoraFormulario(horario.hasta) : "",
    },
    resolver: zodResolver(editorSchema),
  });
  const enCurso = crear.isPending || actualizar.isPending;

  async function guardar(valores: EditorValues): Promise<void> {
    setMensajeError(null);
    const dia_semana = Number(valores.dia_semana);
    const desde = aHoraEnvio(valores.desde);
    const hasta = aHoraEnvio(valores.hasta);
    try {
      if (horario === null) {
        await crear.mutateAsync({
          profesional_id: valores.profesional_id,
          dia_semana,
          desde,
          hasta,
        });
        onGuardado("Horario creado.");
        return;
      }
      const cambio: CambioDeHorario = { id: horario.id, parche: {} };
      if (dia_semana !== horario.dia_semana) {
        cambio.parche.dia_semana = dia_semana;
      }
      if (desde !== horario.desde) {
        cambio.parche.desde = desde;
      }
      if (hasta !== horario.hasta) {
        cambio.parche.hasta = hasta;
      }
      if (Object.keys(cambio.parche).length === 0) {
        onClose();
        return;
      }
      await actualizar.mutateAsync(cambio);
      onGuardado("Horario actualizado.");
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.causa === "solape_horario"
      ) {
        setError("hasta", {
          type: "server",
          message:
            error.detalle !== ""
              ? error.detalle
              : "El horario se solapa con otro horario del profesional.",
        });
        return;
      }
      if (error instanceof ApiError && error.status === 404) {
        setMensajeError(
          horario === null ? "El profesional no existe." : "El horario ya no existe.",
        );
        return;
      }
      if (error instanceof ApiError) {
        const proyectado = applyApiFieldErrors(error, setError, [
          "profesional_id",
          "dia_semana",
          "desde",
          "hasta",
        ]);
        if (proyectado) {
          return;
        }
        if (recursoInactivoDe(error) === "profesional") {
          setMensajeError("El profesional está inactivo.");
          return;
        }
        if (error.status === 403 || error.kind === "permiso") {
          setMensajeError("Permiso insuficiente.");
          return;
        }
      }
      setMensajeError("No se pudo guardar el horario.");
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void handleSubmit(guardar)(evento)}>
      {horario === null ? (
        <Select
          label="Profesional"
          options={[
            { value: "", label: "Elegí un profesional" },
            ...profesionales.map((profesional) => ({
              value: profesional.id,
              label: profesional.nombre,
            })),
          ]}
          {...register("profesional_id")}
          error={errors.profesional_id?.message}
        />
      ) : (
        <p>Profesional: {nombreDe(profesionales, horario.profesional_id)}</p>
      )}
      <Select
        label="Día"
        options={DIAS}
        {...register("dia_semana")}
        error={errors.dia_semana?.message}
      />
      <TextField
        error={errors.desde?.message}
        label="Desde"
        type="time"
        {...register("desde")}
      />
      <TextField
        error={errors.hasta?.message}
        label="Hasta"
        type="time"
        {...register("hasta")}
      />
      {mensajeError !== null ? <p role="alert">{mensajeError}</p> : null}
      <div>
        <Button disabled={enCurso} onClick={onClose} variant="secondary">
          Cancelar
        </Button>
        <Button disabled={enCurso} type="submit">
          {enCurso ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

export default function HorariosPage() {
  const profesionalesQuery = useProfesionales(true);
  const horariosQuery = useHorarios(true);
  const [filtroProfesional, setFiltroProfesional] = useState("");
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cerrarAviso = useCallback(() => setAviso(null), []);
  const cerrarDialogo = useCallback(() => setDialogo(null), []);

  function alTerminar(mensaje: string): void {
    setDialogo(null);
    setAviso(mensaje);
  }

  const tituloEditar =
    dialogo?.tipo === "editar"
      ? `Editar horario de ${nombreDe(profesionalesQuery.data ?? [], dialogo.horario.profesional_id)}`
      : tituloDe(dialogo);

  let contenido: ReactNode;
  if (profesionalesQuery.isError || horariosQuery.isError) {
    contenido = (
      <div role="alert">
        <p>No se pudieron cargar los horarios.</p>
        <Button
          variant="secondary"
          onClick={() => {
            void profesionalesQuery.refetch();
            void horariosQuery.refetch();
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  } else if (profesionalesQuery.isPending || horariosQuery.isPending) {
    contenido = (
      <DataTable<FilaHorario>
        columns={COLUMNAS}
        getRowId={(fila) => fila.id}
        loading
        rows={[]}
      />
    );
  } else {
    const profesionales = profesionalesQuery.data;
    const horarios = horariosQuery.data.filter(
      (horario) => filtroProfesional === "" || horario.profesional_id === filtroProfesional,
    );
    if (horarios.length === 0) {
      contenido = (
        <EmptyState
          description="Creá el primer horario con «Nuevo horario»."
          title="No hay horarios."
        />
      );
    } else {
      contenido = (
        <DataTable
          columns={COLUMNAS}
          getRowId={(fila) => fila.id}
          renderActions={(fila) => (
            <Button
              aria-label={`Editar ${fila.profesional} ${fila.dia}`}
              onClick={() => setDialogo({ tipo: "editar", horario: fila.horario })}
              variant="ghost"
            >
              Editar
            </Button>
          )}
          rows={horarios.map((horario) =>
            aFila(horario, nombreDe(profesionales, horario.profesional_id)),
          )}
        />
      );
    }
  }

  return (
    <section>
      <h2>Horarios</h2>
      <div>
        <Select
          label="Profesional"
          onChange={(evento) => setFiltroProfesional(evento.target.value)}
          options={[
            { value: "", label: "Todos" },
            ...((profesionalesQuery.data ?? []).map((profesional) => ({
              value: profesional.id,
              label: profesional.nombre,
            }))),
          ]}
          value={filtroProfesional}
        />
        <Button onClick={() => setDialogo({ tipo: "crear" })}>Nuevo horario</Button>
      </div>
      {contenido}
      {aviso !== null ? <Toast onDismiss={cerrarAviso}>{aviso}</Toast> : null}
      <Modal onClose={cerrarDialogo} open={dialogo !== null} title={tituloEditar}>
        {dialogo?.tipo === "crear" ? (
          <FormularioHorario
            key="crear"
            horario={null}
            onClose={cerrarDialogo}
            onGuardado={alTerminar}
            profesionales={profesionalesQuery.data ?? []}
          />
        ) : null}
        {dialogo?.tipo === "editar" ? (
          <FormularioHorario
            key={`editar-${dialogo.horario.id}`}
            horario={dialogo.horario}
            onClose={cerrarDialogo}
            onGuardado={alTerminar}
            profesionales={profesionalesQuery.data ?? []}
          />
        ) : null}
      </Modal>
    </section>
  );
}
