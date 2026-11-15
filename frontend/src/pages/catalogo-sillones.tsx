/**
 * Sección `/catalogo/sillones` (C-15, tasks 4.1 y 4.2): tabla de sillones
 * (inactivos incluidos), alta y toggle `activo` con confirmación.
 *
 * Patrón de `pages/catalogo-profesionales.tsx`: listado con `DataTable` +
 * `EmptyState` + `Skeleton` (vía `loading`), formulario RHF + zod en modal,
 * `409 duplicate_nombre_sillon` al campo `nombre` y 422 vía
 * `applyApiFieldErrors`, sin optimistic update (la mutación invalida la raíz
 * `sillones`). El toggle sigue el patrón de `pages/admin-sucursales.tsx`:
 * `Modal` de confirmación que solo al confirmar envía el `PATCH`; al
 * desactivar advierte que los turnos existentes se conservan (traza).
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
import { sillonFormResolver, type SillonFormValues } from "../forms/schemas";
import {
  useActualizarSillon,
  useCrearSillon,
  useSillones,
} from "../services/catalogo";
import type { Sillon } from "../types/api";
import { ApiError } from "../types/errors";

/** Fila de la tabla: `DataTable` muestra cada celda como texto. */
interface FilaSillon {
  id: string;
  nombre: string;
  estado: string;
  sillon: Sillon;
}

const COLUMNAS: { header: string; key: keyof FilaSillon & string }[] = [
  { header: "Nombre", key: "nombre" },
  { header: "Estado", key: "estado" },
];

function aFila(sillon: Sillon): FilaSillon {
  return {
    id: sillon.id,
    nombre: sillon.nombre,
    estado: sillon.activo ? "Activo" : "Inactivo",
    sillon,
  };
}

type Dialogo = { tipo: "crear" } | { tipo: "toggle"; sillon: Sillon };

function tituloDe(dialogo: Dialogo | null): string {
  if (dialogo === null) {
    return "";
  }
  switch (dialogo.tipo) {
    case "crear":
      return "Nuevo sillón";
    case "toggle":
      return dialogo.sillon.activo
        ? `Desactivar sillón ${dialogo.sillon.nombre}`
        : `Activar sillón ${dialogo.sillon.nombre}`;
  }
}

interface FormularioSillonProps {
  onClose: () => void;
  onGuardado: (mensaje: string) => void;
}

function FormularioSillon({ onClose, onGuardado }: FormularioSillonProps) {
  const crear = useCrearSillon();
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<SillonFormValues>({
    defaultValues: { nombre: "" },
    resolver: sillonFormResolver,
  });

  async function guardar(valores: SillonFormValues): Promise<void> {
    setMensajeError(null);
    try {
      await crear.mutateAsync({ nombre: valores.nombre.trim() });
      onGuardado("Sillón creado.");
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.causa === "duplicate_nombre_sillon"
      ) {
        setError("nombre", {
          type: "server",
          message: "Ya existe un sillón con ese nombre.",
        });
        return;
      }
      if (error instanceof ApiError) {
        const proyectado = applyApiFieldErrors(error, setError, ["nombre"]);
        if (proyectado) {
          return;
        }
        if (error.status === 403 || error.kind === "permiso") {
          setMensajeError("Permiso insuficiente.");
          return;
        }
      }
      setMensajeError("No se pudo guardar el sillón.");
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void handleSubmit(guardar)(evento)}>
      <TextField error={errors.nombre?.message} label="Nombre" {...register("nombre")} />
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

interface ConfirmarToggleProps {
  sillon: Sillon;
  onClose: () => void;
  onHecho: (mensaje: string) => void;
}

function ConfirmarToggle({ sillon, onClose, onHecho }: ConfirmarToggleProps) {
  const actualizar = useActualizarSillon();
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const desactiva = sillon.activo;

  async function confirmar(): Promise<void> {
    setMensajeError(null);
    try {
      await actualizar.mutateAsync({
        id: sillon.id,
        parche: { activo: !desactiva },
      });
      onHecho(desactiva ? "Sillón desactivado." : "Sillón activado.");
    } catch {
      setMensajeError(
        desactiva ? "No se pudo desactivar el sillón." : "No se pudo activar el sillón.",
      );
    }
  }

  return (
    <div>
      <p>
        {desactiva
          ? `El sillón «${sillon.nombre}» quedará inactivo. Desactivar no borra los turnos existentes: se conservan como traza y el sillón se puede seguir viendo en el listado.`
          : `El sillón «${sillon.nombre}» volverá a estar activo.`}
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

export default function SillonesPage() {
  const { data, isPending, isError, refetch } = useSillones(true);
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
        <p>No se pudieron cargar los sillones.</p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  } else if (isPending) {
    contenido = (
      <DataTable<FilaSillon>
        columns={COLUMNAS}
        getRowId={(fila) => fila.id}
        loading
        rows={[]}
      />
    );
  } else if (data.length === 0) {
    contenido = (
      <EmptyState
        description="Creá el primer sillón con «Nuevo sillón»."
        title="No hay sillones."
      />
    );
  } else {
    contenido = (
      <DataTable
        columns={COLUMNAS}
        getRowId={(fila) => fila.id}
        renderActions={(fila) => (
          <Button
            aria-label={`${fila.sillon.activo ? "Desactivar" : "Activar"} ${fila.sillon.nombre}`}
            onClick={() => setDialogo({ tipo: "toggle", sillon: fila.sillon })}
            variant="ghost"
          >
            {fila.sillon.activo ? "Desactivar" : "Activar"}
          </Button>
        )}
        rows={data.map(aFila)}
      />
    );
  }

  return (
    <section>
      <h2>Sillones</h2>
      <div>
        <Button onClick={() => setDialogo({ tipo: "crear" })}>Nuevo sillón</Button>
      </div>
      {contenido}
      {aviso !== null ? <Toast onDismiss={cerrarAviso}>{aviso}</Toast> : null}
      <Modal onClose={cerrarDialogo} open={dialogo !== null} title={tituloDe(dialogo)}>
        {dialogo?.tipo === "crear" ? (
          <FormularioSillon key="crear" onClose={cerrarDialogo} onGuardado={alTerminar} />
        ) : null}
        {dialogo?.tipo === "toggle" ? (
          <ConfirmarToggle
            key={`toggle-${dialogo.sillon.id}`}
            onClose={cerrarDialogo}
            onHecho={alTerminar}
            sillon={dialogo.sillon}
          />
        ) : null}
      </Modal>
    </section>
  );
}
