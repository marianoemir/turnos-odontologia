/**
 * Pantalla `/admin/sucursales` (C-22, task 4.1): listado de sucursales
 * (inactivas incluidas), alta, edición y baja lógica con confirmación.
 *
 * La baja es un `PATCH` con `activo: false`: nunca se borra una sucursal. El
 * `PATCH` envía solo los campos que cambiaron y, para vaciar la dirección,
 * una cadena vacía, porque el backend rechaza `null`. La autorización real es
 * del backend (403 si el rol no es `admin`).
 *
 * Las asignaciones (4.2) y la sucursal activa (4.3) se suman como secciones
 * aparte, sin tocar esta.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../components/button";
import { DataTable } from "../components/data-table";
import { EmptyState } from "../components/empty-state";
import { Modal } from "../components/modal";
import { TextField } from "../components/text-field";
import { Toast } from "../components/toast";
import {
  useActualizarSucursal,
  useCrearSucursal,
  useSucursales,
} from "../services/admin";
import type { Sucursal, SucursalPatch } from "../types/api-admin";
import { ApiError } from "../types/errors";
import { SeccionAsignaciones } from "./admin-asignaciones";
import { SucursalActiva } from "./admin-sucursal-activa";

const sucursalFormSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Ingresá un nombre.")
    .max(200, "El nombre no puede superar los 200 caracteres."),
  direccion: z.string().trim(),
});

type SucursalFormValues = z.input<typeof sucursalFormSchema>;

const sucursalFormResolver = zodResolver(sucursalFormSchema);

/** Fila de la tabla: `DataTable` muestra cada celda como texto. */
interface FilaSucursal {
  id: string;
  nombre: string;
  direccion: string;
  estado: string;
  sucursal: Sucursal;
}

const COLUMNAS: { header: string; key: keyof FilaSucursal & string }[] = [
  { header: "Nombre", key: "nombre" },
  { header: "Dirección", key: "direccion" },
  { header: "Estado", key: "estado" },
];

function aFila(sucursal: Sucursal): FilaSucursal {
  return {
    id: sucursal.id,
    nombre: sucursal.nombre,
    direccion: (sucursal.direccion ?? "").trim() || "Sin dirección",
    estado: sucursal.activo ? "Activa" : "Inactiva",
    sucursal,
  };
}

type Dialogo =
  | { tipo: "crear" }
  | { tipo: "editar"; sucursal: Sucursal }
  | { tipo: "desactivar"; sucursal: Sucursal };

function tituloDe(dialogo: Dialogo | null): string {
  if (dialogo === null) {
    return "";
  }
  switch (dialogo.tipo) {
    case "crear":
      return "Nueva sucursal";
    case "editar":
      return `Editar sucursal ${dialogo.sucursal.nombre}`;
    case "desactivar":
      return `Desactivar sucursal ${dialogo.sucursal.nombre}`;
  }
}

interface FormularioSucursalProps {
  /** `null` para el alta; la sucursal a editar en la edición. */
  sucursal: Sucursal | null;
  onClose: () => void;
  onGuardada: (mensaje: string) => void;
}

function FormularioSucursal({ sucursal, onClose, onGuardada }: FormularioSucursalProps) {
  const crear = useCrearSucursal();
  const actualizar = useActualizarSucursal();
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<SucursalFormValues>({
    defaultValues: {
      nombre: sucursal?.nombre ?? "",
      direccion: sucursal?.direccion ?? "",
    },
    resolver: sucursalFormResolver,
  });
  const enCurso = crear.isPending || actualizar.isPending;

  async function guardar(valores: SucursalFormValues): Promise<void> {
    setMensajeError(null);
    const nombre = valores.nombre.trim();
    const direccion = valores.direccion.trim();
    try {
      if (sucursal === null) {
        await crear.mutateAsync(direccion === "" ? { nombre } : { nombre, direccion });
        onGuardada("Sucursal creada.");
        return;
      }
      const parche: SucursalPatch = {};
      if (nombre !== sucursal.nombre) {
        parche.nombre = nombre;
      }
      if (direccion !== (sucursal.direccion ?? "")) {
        parche.direccion = direccion;
      }
      if (Object.keys(parche).length === 0) {
        onClose();
        return;
      }
      await actualizar.mutateAsync({ id: sucursal.id, parche });
      onGuardada("Sucursal actualizada.");
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.causa === "duplicate_nombre_sucursal"
      ) {
        setError("nombre", {
          type: "server",
          message: "Ya existe una sucursal con ese nombre.",
        });
        return;
      }
      setMensajeError("No se pudo guardar la sucursal.");
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void handleSubmit(guardar)(evento)}>
      <TextField error={errors.nombre?.message} label="Nombre" {...register("nombre")} />
      <TextField label="Dirección" {...register("direccion")} />
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

interface ConfirmarBajaProps {
  sucursal: Sucursal;
  onClose: () => void;
  onHecha: (mensaje: string) => void;
}

function ConfirmarBaja({ sucursal, onClose, onHecha }: ConfirmarBajaProps) {
  const actualizar = useActualizarSucursal();
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  async function confirmar(): Promise<void> {
    setMensajeError(null);
    try {
      await actualizar.mutateAsync({ id: sucursal.id, parche: { activo: false } });
      onHecha("Sucursal desactivada.");
    } catch {
      setMensajeError("No se pudo desactivar la sucursal.");
    }
  }

  return (
    <div>
      <p>
        La sucursal «{sucursal.nombre}» quedará inactiva. No se borra: se puede
        seguir viendo en el listado.
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
          {actualizar.isPending ? "Desactivando…" : "Confirmar"}
        </Button>
      </div>
    </div>
  );
}

function SeccionSucursales() {
  const { data, isPending, isError, refetch } = useSucursales(true);
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
        <p>No se pudieron cargar las sucursales.</p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  } else if (isPending) {
    contenido = (
      <DataTable<FilaSucursal> columns={COLUMNAS} getRowId={(fila) => fila.id} loading rows={[]} />
    );
  } else if (data.length === 0) {
    contenido = (
      <EmptyState
        description="Creá la primera sucursal con «Nueva sucursal»."
        title="No hay sucursales."
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
              aria-label={`Editar ${fila.sucursal.nombre}`}
              onClick={() => setDialogo({ tipo: "editar", sucursal: fila.sucursal })}
              variant="ghost"
            >
              Editar
            </Button>
            {fila.sucursal.activo ? (
              <Button
                aria-label={`Desactivar ${fila.sucursal.nombre}`}
                onClick={() => setDialogo({ tipo: "desactivar", sucursal: fila.sucursal })}
                variant="ghost"
              >
                Desactivar
              </Button>
            ) : null}
          </>
        )}
        rows={data.map(aFila)}
      />
    );
  }

  return (
    <div>
      <div>
        <Button onClick={() => setDialogo({ tipo: "crear" })}>Nueva sucursal</Button>
      </div>
      {contenido}
      {aviso !== null ? <Toast onDismiss={cerrarAviso}>{aviso}</Toast> : null}
      <Modal onClose={cerrarDialogo} open={dialogo !== null} title={tituloDe(dialogo)}>
        {dialogo?.tipo === "crear" ? (
          <FormularioSucursal key="crear" onClose={cerrarDialogo} onGuardada={alTerminar} sucursal={null} />
        ) : null}
        {dialogo?.tipo === "editar" ? (
          <FormularioSucursal
            key={`editar-${dialogo.sucursal.id}`}
            onClose={cerrarDialogo}
            onGuardada={alTerminar}
            sucursal={dialogo.sucursal}
          />
        ) : null}
        {dialogo?.tipo === "desactivar" ? (
          <ConfirmarBaja
            key={`desactivar-${dialogo.sucursal.id}`}
            onClose={cerrarDialogo}
            onHecha={alTerminar}
            sucursal={dialogo.sucursal}
          />
        ) : null}
      </Modal>
    </div>
  );
}

export default function AdminSucursalesPage() {
  return (
    <section>
      <h1 className="app-title">Sucursales</h1>
      <SucursalActiva />
      <SeccionSucursales />
      <SeccionAsignaciones />
    </section>
  );
}