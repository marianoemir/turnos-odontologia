/**
 * Sección `/catalogo/profesionales` (C-15, tasks 3.1 y 3.2): tabla de
 * profesionales (inactivos incluidos), alta, edición y toggle `activo` con
 * confirmación.
 *
 * Patrón de `pages/catalogo-pacientes.tsx`: listado con `DataTable` +
 * `EmptyState` + `Skeleton` (vía `loading`), formulario RHF + zod en modal,
 * `409 duplicate_matricula` al campo `matricula` y 422 vía
 * `applyApiFieldErrors`, sin optimistic update (la mutación invalida la raíz
 * `profesionales`). El toggle sigue el patrón de `pages/admin-sucursales.tsx`:
 * `Modal` de confirmación que solo al confirmar envía el `PATCH`.
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
import { profesionalFormResolver, type ProfesionalFormValues } from "../forms/schemas";
import {
  useActualizarProfesional,
  useCrearProfesional,
  useProfesionales,
  type ProfesionalPatch,
} from "../services/catalogo";
import type { Profesional } from "../types/api";
import { ApiError } from "../types/errors";

/** Fila de la tabla: `DataTable` muestra cada celda como texto. */
interface FilaProfesional {
  id: string;
  nombre: string;
  matricula: string;
  estado: string;
  profesional: Profesional;
}

const COLUMNAS: { header: string; key: keyof FilaProfesional & string }[] = [
  { header: "Nombre", key: "nombre" },
  { header: "Matrícula", key: "matricula" },
  { header: "Estado", key: "estado" },
];

function aFila(profesional: Profesional): FilaProfesional {
  return {
    id: profesional.id,
    nombre: profesional.nombre,
    matricula: profesional.matricula,
    estado: profesional.activo ? "Activo" : "Inactivo",
    profesional,
  };
}

type Dialogo =
  | { tipo: "crear" }
  | { tipo: "editar"; profesional: Profesional }
  | { tipo: "toggle"; profesional: Profesional };

function tituloDe(dialogo: Dialogo | null): string {
  if (dialogo === null) {
    return "";
  }
  switch (dialogo.tipo) {
    case "crear":
      return "Nuevo profesional";
    case "editar":
      return `Editar profesional ${dialogo.profesional.nombre}`;
    case "toggle":
      return dialogo.profesional.activo
        ? `Desactivar profesional ${dialogo.profesional.nombre}`
        : `Activar profesional ${dialogo.profesional.nombre}`;
  }
}

interface FormularioProfesionalProps {
  /** `null` para el alta; el profesional a editar en la edición. */
  profesional: Profesional | null;
  onClose: () => void;
  onGuardado: (mensaje: string) => void;
}

function FormularioProfesional({
  profesional,
  onClose,
  onGuardado,
}: FormularioProfesionalProps) {
  const crear = useCrearProfesional();
  const actualizar = useActualizarProfesional();
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<ProfesionalFormValues>({
    defaultValues: {
      nombre: profesional?.nombre ?? "",
      matricula: profesional?.matricula ?? "",
    },
    resolver: profesionalFormResolver,
  });
  const enCurso = crear.isPending || actualizar.isPending;

  async function guardar(valores: ProfesionalFormValues): Promise<void> {
    setMensajeError(null);
    const nombre = valores.nombre.trim();
    const matricula = valores.matricula.trim();
    try {
      if (profesional === null) {
        await crear.mutateAsync({ nombre, matricula });
        onGuardado("Profesional creado.");
        return;
      }
      const parche: ProfesionalPatch = {};
      if (nombre !== profesional.nombre) {
        parche.nombre = nombre;
      }
      if (matricula !== profesional.matricula) {
        parche.matricula = matricula;
      }
      if (Object.keys(parche).length === 0) {
        onClose();
        return;
      }
      await actualizar.mutateAsync({ id: profesional.id, parche });
      onGuardado("Profesional actualizado.");
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.causa === "duplicate_matricula"
      ) {
        setError("matricula", {
          type: "server",
          message: "Ya existe un profesional con esa matrícula.",
        });
        return;
      }
      if (error instanceof ApiError) {
        const proyectado = applyApiFieldErrors(error, setError, ["nombre", "matricula"]);
        if (proyectado) {
          return;
        }
        if (error.status === 403 || error.kind === "permiso") {
          setMensajeError("Permiso insuficiente.");
          return;
        }
      }
      setMensajeError("No se pudo guardar el profesional.");
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void handleSubmit(guardar)(evento)}>
      <TextField error={errors.nombre?.message} label="Nombre" {...register("nombre")} />
      <TextField error={errors.matricula?.message} label="Matrícula" {...register("matricula")} />
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

interface ConfirmarToggleProps {
  profesional: Profesional;
  onClose: () => void;
  onHecho: (mensaje: string) => void;
}

function ConfirmarToggle({ profesional, onClose, onHecho }: ConfirmarToggleProps) {
  const actualizar = useActualizarProfesional();
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const desactiva = profesional.activo;

  async function confirmar(): Promise<void> {
    setMensajeError(null);
    try {
      await actualizar.mutateAsync({
        id: profesional.id,
        parche: { activo: !desactiva },
      });
      onHecho(desactiva ? "Profesional desactivado." : "Profesional activado.");
    } catch {
      setMensajeError(
        desactiva
          ? "No se pudo desactivar el profesional."
          : "No se pudo activar el profesional.",
      );
    }
  }

  return (
    <div>
      <p>
        {desactiva
          ? `El profesional «${profesional.nombre}» quedará inactivo. No se borra: se puede seguir viendo en el listado.`
          : `El profesional «${profesional.nombre}» volverá a estar activo.`}
      </p>
      {mensajeError !== null ? <p role="alert">{mensajeError}</p> : null}
      <div>
        <Button disabled={actualizar.isPending} onClick={onClose} variant="secondary">
          Cancelar
        </Button>
        <Button
          disabled={actualizar.isPending}
          onClick={() => void confirmar()}
          variant="danger"
        >
          {actualizar.isPending ? "Guardando…" : "Confirmar"}
        </Button>
      </div>
    </div>
  );
}

export default function ProfesionalesPage() {
  const { data, isPending, isError, refetch } = useProfesionales(true);
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
        <p>No se pudieron cargar los profesionales.</p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  } else if (isPending) {
    contenido = (
      <DataTable<FilaProfesional>
        columns={COLUMNAS}
        getRowId={(fila) => fila.id}
        loading
        rows={[]}
      />
    );
  } else if (data.length === 0) {
    contenido = (
      <EmptyState
        description="Creá el primer profesional con «Nuevo profesional»."
        title="No hay profesionales."
      />
    );
  } else {
    contenido = (
      <DataTable
        columns={COLUMNAS}
        getRowId={(fila) => fila.id}
        renderActions={(fila) => (
          <>
            <Button
              aria-label={`Editar ${fila.profesional.nombre}`}
              onClick={() => setDialogo({ tipo: "editar", profesional: fila.profesional })}
              variant="ghost"
            >
              Editar
            </Button>
            <Button
              aria-label={`${fila.profesional.activo ? "Desactivar" : "Activar"} ${fila.profesional.nombre}`}
              onClick={() => setDialogo({ tipo: "toggle", profesional: fila.profesional })}
              variant="ghost"
            >
              {fila.profesional.activo ? "Desactivar" : "Activar"}
            </Button>
          </>
        )}
        rows={data.map(aFila)}
      />
    );
  }

  return (
    <section>
      <h2>Profesionales</h2>
      <div>
        <Button onClick={() => setDialogo({ tipo: "crear" })}>Nuevo profesional</Button>
      </div>
      {contenido}
      {aviso !== null ? <Toast onDismiss={cerrarAviso}>{aviso}</Toast> : null}
      <Modal onClose={cerrarDialogo} open={dialogo !== null} title={tituloDe(dialogo)}>
        {dialogo?.tipo === "crear" ? (
          <FormularioProfesional
            key="crear"
            onClose={cerrarDialogo}
            onGuardado={alTerminar}
            profesional={null}
          />
        ) : null}
        {dialogo?.tipo === "editar" ? (
          <FormularioProfesional
            key={`editar-${dialogo.profesional.id}`}
            onClose={cerrarDialogo}
            onGuardado={alTerminar}
            profesional={dialogo.profesional}
          />
        ) : null}
        {dialogo?.tipo === "toggle" ? (
          <ConfirmarToggle
            key={`toggle-${dialogo.profesional.id}`}
            onClose={cerrarDialogo}
            onHecho={alTerminar}
            profesional={dialogo.profesional}
          />
        ) : null}
      </Modal>
    </section>
  );
}
