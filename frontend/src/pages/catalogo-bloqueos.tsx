/**
 * Sección `/catalogo/bloqueos` (C-15, tasks 7.1 y 7.2): alta de bloqueos con
 * cuatro alcances (global, profesional, sillón, pareja) y eliminación con
 * confirmación.
 *
 * Patrón de `pages/catalogo-horarios.tsx`: listado con `DataTable` +
 * `EmptyState` + `Skeleton` (vía `loading`), formulario RHF + zod en modal,
 * 404/422 del backend a mensaje y 422 vía `applyApiFieldErrors`, sin
 * optimistic update (la mutación invalida la raíz `bloqueos`). El formulario
 * usa `bloqueoFormSchema` (`desde < hasta` bloquea el submit); los `Select`
 * de profesional/sillón son opcionales (`""` es alcance global) y el envío
 * convierte `datetime-local` a ISO con zona horaria (el backend exige
 * `AwareDatetime`: `new Date(valor).toISOString()` lleva `Z`). No hay
 * edición: el bloqueo es temporal y se elimina físicamente con `DELETE`
 * (204) tras un `Modal` de confirmación, como los toggles de
 * `pages/catalogo-sillones.tsx`.
 */
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";

import { Button } from "../components/button";
import { DataTable } from "../components/data-table";
import { EmptyState } from "../components/empty-state";
import { Modal } from "../components/modal";
import { Select } from "../components/select";
import { TextField } from "../components/text-field";
import { Toast } from "../components/toast";
import { applyApiFieldErrors } from "../forms/api-field-errors";
import { recursoInactivoDe } from "../services/api-error";
import { bloqueoFormResolver, type BloqueoFormValues } from "../forms/schemas";
import {
  useBloqueos,
  useCrearBloqueo,
  useEliminarBloqueo,
  useProfesionales,
  useSillones,
} from "../services/catalogo";
import type { Bloqueo, Profesional, Sillon } from "../types/api";
import { ApiError } from "../types/errors";

/** `datetime-local` entrega `"YYYY-MM-DDTHH:MM"`; el backend exige aware. */
function aEnvioFecha(valor: string): string {
  return new Date(valor).toISOString();
}

/** ISO del backend a texto legible en la tabla (zona local del navegador). */
function aTextoFecha(iso: string): string {
  const fecha = new Date(iso);
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const hora = String(fecha.getHours()).padStart(2, "0");
  const minutos = String(fecha.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getFullYear()} ${hora}:${minutos}`;
}

function nombreProfesional(profesionales: Profesional[], id: string | null): string | null {
  if (id === null) {
    return null;
  }
  return profesionales.find((profesional) => profesional.id === id)?.nombre ?? "Profesional";
}

function nombreSillon(sillones: Sillon[], id: string | null): string | null {
  if (id === null) {
    return null;
  }
  return sillones.find((sillon) => sillon.id === id)?.nombre ?? "Sillón";
}

/** Etiqueta del alcance: global cuando ambos son nulos, si no los nombres. */
function etiquetaAlcance(
  bloqueo: Bloqueo,
  profesionales: Profesional[],
  sillones: Sillon[],
): string {
  const partes = [
    nombreProfesional(profesionales, bloqueo.profesional_id),
    nombreSillon(sillones, bloqueo.sillon_id),
  ].filter((parte): parte is string => parte !== null);
  return partes.length === 0 ? "Global" : partes.join(" · ");
}

/** Fila de la tabla: `DataTable` muestra cada celda como texto. */
interface FilaBloqueo {
  id: string;
  alcance: string;
  desde: string;
  hasta: string;
  motivo: string;
  bloqueo: Bloqueo;
}

function aFila(
  bloqueo: Bloqueo,
  profesionales: Profesional[],
  sillones: Sillon[],
): FilaBloqueo {
  return {
    id: bloqueo.id,
    alcance: etiquetaAlcance(bloqueo, profesionales, sillones),
    desde: aTextoFecha(bloqueo.desde),
    hasta: aTextoFecha(bloqueo.hasta),
    motivo: bloqueo.motivo,
    bloqueo,
  };
}

/** Orden del backend `GET /bloqueos`: `(desde, id)` ascendente. */
function ordenarBloqueos(bloqueos: Bloqueo[]): Bloqueo[] {
  return [...bloqueos].sort((a, b) => {
    if (a.desde !== b.desde) {
      return a.desde < b.desde ? -1 : 1;
    }
    return a.id < b.id ? -1 : 1;
  });
}

const COLUMNAS: { header: string; key: keyof FilaBloqueo & string }[] = [
  { header: "Alcance", key: "alcance" },
  { header: "Desde", key: "desde" },
  { header: "Hasta", key: "hasta" },
  { header: "Motivo", key: "motivo" },
];

type Dialogo =
  | { tipo: "crear" }
  | { tipo: "eliminar"; bloqueo: Bloqueo };

function tituloDe(dialogo: Dialogo | null): string {
  if (dialogo === null) {
    return "";
  }
  switch (dialogo.tipo) {
    case "crear":
      return "Nuevo bloqueo";
    case "eliminar":
      return "Eliminar bloqueo";
  }
}

interface FormularioBloqueoProps {
  profesionales: Profesional[];
  sillones: Sillon[];
  onClose: () => void;
  onGuardado: (mensaje: string) => void;
}

function FormularioBloqueo({
  profesionales,
  sillones,
  onClose,
  onGuardado,
}: FormularioBloqueoProps) {
  const crear = useCrearBloqueo();
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<BloqueoFormValues>({
    defaultValues: {
      profesional_id: "",
      sillon_id: "",
      desde: "",
      hasta: "",
      motivo: "",
    },
    resolver: bloqueoFormResolver,
  });

  async function guardar(valores: BloqueoFormValues): Promise<void> {
    setMensajeError(null);
    try {
      await crear.mutateAsync({
        profesional_id: valores.profesional_id === "" ? null : valores.profesional_id,
        sillon_id: valores.sillon_id === "" ? null : valores.sillon_id,
        desde: aEnvioFecha(valores.desde),
        hasta: aEnvioFecha(valores.hasta),
        motivo: valores.motivo.trim(),
      });
      onGuardado("Bloqueo creado.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        if (/profesional/i.test(error.message)) {
          setMensajeError("El profesional no existe.");
          return;
        }
        if (/sill[oó]n/i.test(error.message)) {
          setMensajeError("El sillón no existe.");
          return;
        }
        setMensajeError("El recurso no existe.");
        return;
      }
      if (error instanceof ApiError) {
        const proyectado = applyApiFieldErrors(error, setError, [
          "profesional_id",
          "sillon_id",
          "desde",
          "hasta",
          "motivo",
        ]);
        if (proyectado) {
          return;
        }
        const inactivo = recursoInactivoDe(error);
        if (inactivo === "profesional") {
          setMensajeError("El profesional está inactivo.");
          return;
        }
        if (inactivo === "sillon") {
          setMensajeError("El sillón está inactivo.");
          return;
        }
        if (error.status === 403 || error.kind === "permiso") {
          setMensajeError("Permiso insuficiente.");
          return;
        }
      }
      setMensajeError("No se pudo guardar el bloqueo.");
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void handleSubmit(guardar)(evento)}>
      <Select
        label="Profesional"
        helpText="Vacío: bloqueo global o solo de sillón."
        options={[
          { value: "", label: "Sin profesional (global)" },
          ...profesionales.map((profesional) => ({
            value: profesional.id,
            label: profesional.nombre,
          })),
        ]}
        {...register("profesional_id")}
        error={errors.profesional_id?.message}
      />
      <Select
        label="Sillón"
        helpText="Vacío: bloqueo global o solo de profesional."
        options={[
          { value: "", label: "Sin sillón (global)" },
          ...sillones.map((sillon) => ({
            value: sillon.id,
            label: sillon.nombre,
          })),
        ]}
        {...register("sillon_id")}
        error={errors.sillon_id?.message}
      />
      <TextField
        error={errors.desde?.message}
        label="Desde"
        type="datetime-local"
        {...register("desde")}
      />
      <TextField
        error={errors.hasta?.message}
        label="Hasta"
        type="datetime-local"
        {...register("hasta")}
      />
      <TextField error={errors.motivo?.message} label="Motivo" {...register("motivo")} />
      {mensajeError !== null ? <p role="alert">{mensajeError}</p> : null}
      <div>
        <Button disabled={crear.isPending} onClick={onClose} variant="secondary">
          Cancelar
        </Button>
        <Button disabled={crear.isPending} type="submit">
          {crear.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

interface ConfirmarEliminacionProps {
  bloqueo: Bloqueo;
  onClose: () => void;
  onHecho: (mensaje: string) => void;
}

function ConfirmarEliminacion({ bloqueo, onClose, onHecho }: ConfirmarEliminacionProps) {
  const eliminar = useEliminarBloqueo();
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  async function confirmar(): Promise<void> {
    setMensajeError(null);
    try {
      await eliminar.mutateAsync(bloqueo.id);
      onHecho("Bloqueo eliminado.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setMensajeError("El bloqueo ya no existe.");
        return;
      }
      setMensajeError("No se pudo eliminar el bloqueo.");
    }
  }

  return (
    <div>
      <p>
        {`Se eliminará el bloqueo «${bloqueo.motivo}». Esta acción no se puede deshacer.`}
      </p>
      {mensajeError !== null ? <p role="alert">{mensajeError}</p> : null}
      <div>
        <Button disabled={eliminar.isPending} onClick={onClose} variant="secondary">
          Cancelar
        </Button>
        <Button
          disabled={eliminar.isPending}
          onClick={() => void confirmar()}
          variant="danger"
        >
          {eliminar.isPending ? "Eliminando…" : "Confirmar"}
        </Button>
      </div>
    </div>
  );
}

export default function BloqueosPage() {
  const profesionalesQuery = useProfesionales(true);
  const sillonesQuery = useSillones(true);
  const bloqueosQuery = useBloqueos();
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cerrarAviso = useCallback(() => setAviso(null), []);
  const cerrarDialogo = useCallback(() => setDialogo(null), []);

  function alTerminar(mensaje: string): void {
    setDialogo(null);
    setAviso(mensaje);
  }

  let contenido: ReactNode;
  if (
    profesionalesQuery.isError ||
    sillonesQuery.isError ||
    bloqueosQuery.isError
  ) {
    contenido = (
      <div role="alert">
        <p>No se pudieron cargar los bloqueos.</p>
        <Button
          variant="secondary"
          onClick={() => {
            void profesionalesQuery.refetch();
            void sillonesQuery.refetch();
            void bloqueosQuery.refetch();
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  } else if (
    profesionalesQuery.isPending ||
    sillonesQuery.isPending ||
    bloqueosQuery.isPending
  ) {
    contenido = (
      <DataTable<FilaBloqueo>
        columns={COLUMNAS}
        getRowId={(fila) => fila.id}
        loading
        rows={[]}
      />
    );
  } else {
    const profesionales = profesionalesQuery.data;
    const sillones = sillonesQuery.data;
    const bloqueos = ordenarBloqueos(bloqueosQuery.data);
    if (bloqueos.length === 0) {
      contenido = (
        <EmptyState
          description="Creá el primer bloqueo con «Nuevo bloqueo»."
          title="No hay bloqueos."
        />
      );
    } else {
      contenido = (
        <DataTable
          columns={COLUMNAS}
          getRowId={(fila) => fila.id}
          renderActions={(fila) => (
            <Button
              aria-label={`Eliminar ${fila.bloqueo.motivo}`}
              onClick={() => setDialogo({ tipo: "eliminar", bloqueo: fila.bloqueo })}
              variant="ghost"
            >
              Eliminar
            </Button>
          )}
          rows={bloqueos.map((bloqueo) => aFila(bloqueo, profesionales, sillones))}
        />
      );
    }
  }

  return (
    <section>
      <h2>Bloqueos</h2>
      <div>
        <Button onClick={() => setDialogo({ tipo: "crear" })}>Nuevo bloqueo</Button>
      </div>
      {contenido}
      {aviso !== null ? <Toast onDismiss={cerrarAviso}>{aviso}</Toast> : null}
      <Modal onClose={cerrarDialogo} open={dialogo !== null} title={tituloDe(dialogo)}>
        {dialogo?.tipo === "crear" ? (
          <FormularioBloqueo
            key="crear"
            onClose={cerrarDialogo}
            onGuardado={alTerminar}
            profesionales={profesionalesQuery.data ?? []}
            sillones={sillonesQuery.data ?? []}
          />
        ) : null}
        {dialogo?.tipo === "eliminar" ? (
          <ConfirmarEliminacion
            key={`eliminar-${dialogo.bloqueo.id}`}
            bloqueo={dialogo.bloqueo}
            onClose={cerrarDialogo}
            onHecho={alTerminar}
          />
        ) : null}
      </Modal>
    </section>
  );
}
