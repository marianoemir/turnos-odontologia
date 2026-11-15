/**
 * Sección `/catalogo/prestaciones` (C-15, tasks 5.1 y 5.2): tabla de
 * prestaciones (inactivas incluidas), alta y edición.
 *
 * Patrón de `pages/catalogo-profesionales.tsx`: listado con `DataTable` +
 * `EmptyState` + `Skeleton` (vía `loading`), formulario RHF + zod en modal,
 * `409 duplicate_nombre_prestacion` al campo `nombre` y 422 vía
 * `applyApiFieldErrors`, sin optimistic update (la mutación invalida la raíz
 * `prestaciones`). La duración se edita como texto y se valida en cliente
 * con `duracionMinSchema` (entero > 0 bloquea el submit sin request); en el
 * envío se convierte a número (`PrestacionCreate.duracion_min`).
 */
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";

import { Button } from "../components/button";
import { DataTable } from "../components/data-table";
import { EmptyState } from "../components/empty-state";
import { Modal } from "../components/modal";
import { TextField } from "../components/text-field";
import { Toast } from "../components/toast";
import { applyApiFieldErrors } from "../forms/api-field-errors";
import { prestacionFormResolver, type PrestacionFormValues } from "../forms/schemas";
import {
  useActualizarPrestacion,
  useCrearPrestacion,
  usePrestaciones,
  type PrestacionPatch,
} from "../services/catalogo";
import type { Prestacion } from "../types/api";
import { ApiError } from "../types/errors";

/** Fila de la tabla: `DataTable` muestra cada celda como texto. */
interface FilaPrestacion {
  id: string;
  nombre: string;
  duracion: string;
  estado: string;
  prestacion: Prestacion;
}

const COLUMNAS: { header: string; key: keyof FilaPrestacion & string }[] = [
  { header: "Nombre", key: "nombre" },
  { header: "Duración (min)", key: "duracion" },
  { header: "Estado", key: "estado" },
];

function aFila(prestacion: Prestacion): FilaPrestacion {
  return {
    id: prestacion.id,
    nombre: prestacion.nombre,
    duracion: String(prestacion.duracion_min),
    estado: prestacion.activo ? "Activo" : "Inactivo",
    prestacion,
  };
}

type Dialogo =
  | { tipo: "crear" }
  | { tipo: "editar"; prestacion: Prestacion };

function tituloDe(dialogo: Dialogo | null): string {
  if (dialogo === null) {
    return "";
  }
  switch (dialogo.tipo) {
    case "crear":
      return "Nueva prestación";
    case "editar":
      return `Editar prestación ${dialogo.prestacion.nombre}`;
  }
}

interface FormularioPrestacionProps {
  /** `null` para el alta; la prestación a editar en la edición. */
  prestacion: Prestacion | null;
  onClose: () => void;
  onGuardado: (mensaje: string) => void;
}

function FormularioPrestacion({
  prestacion,
  onClose,
  onGuardado,
}: FormularioPrestacionProps) {
  const crear = useCrearPrestacion();
  const actualizar = useActualizarPrestacion();
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<PrestacionFormValues>({
    defaultValues: {
      nombre: prestacion?.nombre ?? "",
      duracion_min: prestacion !== null ? String(prestacion.duracion_min) : "",
    },
    resolver: prestacionFormResolver,
  });
  const enCurso = crear.isPending || actualizar.isPending;

  async function guardar(valores: PrestacionFormValues): Promise<void> {
    setMensajeError(null);
    const nombre = valores.nombre.trim();
    const duracion_min = Number(valores.duracion_min.trim());
    try {
      if (prestacion === null) {
        await crear.mutateAsync({ nombre, duracion_min });
        onGuardado("Prestación creada.");
        return;
      }
      const parche: PrestacionPatch = {};
      if (nombre !== prestacion.nombre) {
        parche.nombre = nombre;
      }
      if (duracion_min !== prestacion.duracion_min) {
        parche.duracion_min = duracion_min;
      }
      if (Object.keys(parche).length === 0) {
        onClose();
        return;
      }
      await actualizar.mutateAsync({ id: prestacion.id, parche });
      onGuardado("Prestación actualizada.");
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.causa === "duplicate_nombre_prestacion"
      ) {
        setError("nombre", {
          type: "server",
          message: "Ya existe una prestación con ese nombre.",
        });
        return;
      }
      if (error instanceof ApiError) {
        const proyectado = applyApiFieldErrors(error, setError, [
          "nombre",
          "duracion_min",
        ]);
        if (proyectado) {
          return;
        }
        if (error.status === 403 || error.kind === "permiso") {
          setMensajeError("Permiso insuficiente.");
          return;
        }
      }
      setMensajeError("No se pudo guardar la prestación.");
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void handleSubmit(guardar)(evento)}>
      <TextField error={errors.nombre?.message} label="Nombre" {...register("nombre")} />
      <TextField
        error={errors.duracion_min?.message}
        inputMode="numeric"
        label="Duración (minutos)"
        {...register("duracion_min")}
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

export default function PrestacionesPage() {
  const { data, isPending, isError, refetch } = usePrestaciones(true);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cerrarAviso = useCallback(() => setAviso(null), []);
  const cerrarDialogo = useCallback(() => setDialogo(null), []);

  function alTerminar(mensaje: string): void {
    setDialogo(null);
    setAviso(mensaje);
  }

  let contenido: ReactNode;
  if (isError) {
    contenido = (
      <div role="alert">
        <p>No se pudieron cargar las prestaciones.</p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  } else if (isPending) {
    contenido = (
      <DataTable<FilaPrestacion>
        columns={COLUMNAS}
        getRowId={(fila) => fila.id}
        loading
        rows={[]}
      />
    );
  } else if (data.length === 0) {
    contenido = (
      <EmptyState
        description="Creá la primera prestación con «Nueva prestación»."
        title="No hay prestaciones."
      />
    );
  } else {
    contenido = (
      <DataTable
        columns={COLUMNAS}
        getRowId={(fila) => fila.id}
        renderActions={(fila) => (
          <Button
            aria-label={`Editar ${fila.prestacion.nombre}`}
            onClick={() => setDialogo({ tipo: "editar", prestacion: fila.prestacion })}
            variant="ghost"
          >
            Editar
          </Button>
        )}
        rows={data.map(aFila)}
      />
    );
  }

  return (
    <section>
      <h2>Prestaciones</h2>
      <div>
        <Button onClick={() => setDialogo({ tipo: "crear" })}>Nueva prestación</Button>
      </div>
      {contenido}
      {aviso !== null ? <Toast onDismiss={cerrarAviso}>{aviso}</Toast> : null}
      <Modal onClose={cerrarDialogo} open={dialogo !== null} title={tituloDe(dialogo)}>
        {dialogo?.tipo === "crear" ? (
          <FormularioPrestacion
            key="crear"
            onClose={cerrarDialogo}
            onGuardado={alTerminar}
            prestacion={null}
          />
        ) : null}
        {dialogo?.tipo === "editar" ? (
          <FormularioPrestacion
            key={`editar-${dialogo.prestacion.id}`}
            onClose={cerrarDialogo}
            onGuardado={alTerminar}
            prestacion={dialogo.prestacion}
          />
        ) : null}
      </Modal>
    </section>
  );
}
