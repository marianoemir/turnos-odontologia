/**
 * Sección de asignaciones usuario–sucursal de `/admin/sucursales` (C-22, task
 * 4.2): listado, alta y edición de rol y sucursal.
 *
 * `usuario` es texto libre y el `PATCH` del backend no lo acepta (solo
 * `rol_id`, `sucursal_id` y `activo`), por eso la edición lo muestra sin
 * dejarlo cambiar. No hay baja de asignaciones en la UI (la spec no la pide).
 * El `PATCH` envía solo los campos que cambiaron. La autorización real es del
 * backend (403 si el rol no es `admin`).
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
import { Select } from "../components/select";
import { TextField } from "../components/text-field";
import { Toast } from "../components/toast";
import {
  useActualizarAsignacion,
  useAsignaciones,
  useCrearAsignacion,
  useRoles,
  useSucursales,
} from "../services/admin";
import type {
  Rol,
  Sucursal,
  UsuarioSucursal,
  UsuarioSucursalPatch,
} from "../types/api-admin";
import { ApiError } from "../types/errors";

const asignacionFormSchema = z.object({
  usuario: z
    .string()
    .trim()
    .min(1, "Ingresá un usuario.")
    .max(200, "El usuario no puede superar los 200 caracteres."),
  rol_id: z.string().min(1, "Elegí un rol."),
  sucursal_id: z.string().min(1, "Elegí una sucursal."),
});

type AsignacionFormValues = z.input<typeof asignacionFormSchema>;

const asignacionFormResolver = zodResolver(asignacionFormSchema);

const MENSAJE_DUPLICADA = "Ya existe una asignación de ese usuario en esa sucursal.";
const MENSAJE_NO_ENCONTRADO =
  "El rol, la sucursal o la asignación ya no existen. Cerrá el formulario y actualizá la pantalla.";

/** Fila de la tabla: `DataTable` muestra cada celda como texto. */
interface FilaAsignacion {
  id: string;
  usuario: string;
  rol: string;
  sucursal: string;
  estado: string;
  asignacion: UsuarioSucursal;
}

const COLUMNAS: { header: string; key: keyof FilaAsignacion & string }[] = [
  { header: "Usuario", key: "usuario" },
  { header: "Rol", key: "rol" },
  { header: "Sucursal", key: "sucursal" },
  { header: "Estado", key: "estado" },
];

function aFila(
  asignacion: UsuarioSucursal,
  nombresDeRol: Map<string, string>,
  nombresDeSucursal: Map<string, string>,
): FilaAsignacion {
  return {
    id: asignacion.id,
    usuario: asignacion.usuario,
    rol: nombresDeRol.get(asignacion.rol_id) ?? "Rol desconocido",
    sucursal: nombresDeSucursal.get(asignacion.sucursal_id) ?? "Sucursal desconocida",
    estado: asignacion.activo ? "Activa" : "Inactiva",
    asignacion,
  };
}

interface ConNombre {
  id: string;
  nombre: string;
  activo: boolean;
}

/** Opción vacía inicial y solo los activos, más el valor actual aunque esté inactivo. */
function opcionesDe(items: readonly ConNombre[], actualId: string | null, vacia: string) {
  return [
    { label: vacia, value: "" },
    ...items
      .filter((item) => item.activo || item.id === actualId)
      .map((item) => ({ label: item.nombre, value: item.id })),
  ];
}

type Dialogo = { tipo: "crear" } | { tipo: "editar"; asignacion: UsuarioSucursal };

function tituloDe(dialogo: Dialogo | null): string {
  if (dialogo === null) {
    return "";
  }
  return dialogo.tipo === "crear"
    ? "Nueva asignación"
    : `Editar asignación de ${dialogo.asignacion.usuario}`;
}

interface FormularioAsignacionProps {
  /** `null` para el alta; la asignación a editar en la edición. */
  asignacion: UsuarioSucursal | null;
  roles: readonly Rol[];
  sucursales: readonly Sucursal[];
  onClose: () => void;
  onGuardada: (mensaje: string) => void;
}

function FormularioAsignacion({
  asignacion,
  roles,
  sucursales,
  onClose,
  onGuardada,
}: FormularioAsignacionProps) {
  const crear = useCrearAsignacion();
  const actualizar = useActualizarAsignacion();
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<AsignacionFormValues>({
    defaultValues: {
      usuario: asignacion?.usuario ?? "",
      rol_id: asignacion?.rol_id ?? "",
      sucursal_id: asignacion?.sucursal_id ?? "",
    },
    resolver: asignacionFormResolver,
  });
  const enCurso = crear.isPending || actualizar.isPending;

  async function guardar(valores: AsignacionFormValues): Promise<void> {
    setMensajeError(null);
    try {
      if (asignacion === null) {
        await crear.mutateAsync({
          usuario: valores.usuario.trim(),
          rol_id: valores.rol_id,
          sucursal_id: valores.sucursal_id,
        });
        onGuardada("Asignación creada.");
        return;
      }
      const parche: UsuarioSucursalPatch = {};
      if (valores.rol_id !== asignacion.rol_id) {
        parche.rol_id = valores.rol_id;
      }
      if (valores.sucursal_id !== asignacion.sucursal_id) {
        parche.sucursal_id = valores.sucursal_id;
      }
      if (Object.keys(parche).length === 0) {
        onClose();
        return;
      }
      await actualizar.mutateAsync({ id: asignacion.id, parche });
      onGuardada("Asignación actualizada.");
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.causa === "duplicate_usuario_sucursal"
      ) {
        setError(asignacion === null ? "usuario" : "sucursal_id", {
          type: "server",
          message: MENSAJE_DUPLICADA,
        });
        return;
      }
      if (error instanceof ApiError && error.status === 404) {
        setMensajeError(MENSAJE_NO_ENCONTRADO);
        return;
      }
      setMensajeError("No se pudo guardar la asignación.");
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void handleSubmit(guardar)(evento)}>
      {asignacion === null ? (
        <TextField error={errors.usuario?.message} label="Usuario" {...register("usuario")} />
      ) : (
        <p>
          Usuario: <strong>{asignacion.usuario}</strong>
        </p>
      )}
      <Select
        error={errors.rol_id?.message}
        label="Rol"
        options={opcionesDe(roles, asignacion?.rol_id ?? null, "Elegí un rol")}
        {...register("rol_id")}
      />
      <Select
        error={errors.sucursal_id?.message}
        label="Sucursal"
        options={opcionesDe(sucursales, asignacion?.sucursal_id ?? null, "Elegí una sucursal")}
        {...register("sucursal_id")}
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

export function SeccionAsignaciones() {
  const asignaciones = useAsignaciones();
  const roles = useRoles();
  const sucursales = useSucursales(true);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cerrarAviso = useCallback(() => setAviso(null), []);
  const cerrarDialogo = useCallback(() => setDialogo(null), []);

  const listaAsignaciones = asignaciones.data ?? [];
  const listaRoles = roles.data ?? [];
  const listaSucursales = sucursales.data ?? [];
  const hayError = asignaciones.isError || roles.isError || sucursales.isError;
  const cargando = asignaciones.isPending || roles.isPending || sucursales.isPending;

  function alTerminar(mensaje: string): void {
    setDialogo(null);
    setAviso(mensaje);
  }

  function reintentar(): void {
    void Promise.all([asignaciones.refetch(), roles.refetch(), sucursales.refetch()]);
  }

  let contenido: ReactNode;
  if (hayError) {
    contenido = (
      <div role="alert">
        <p>No se pudieron cargar las asignaciones.</p>
        <Button variant="secondary" onClick={reintentar}>
          Reintentar
        </Button>
      </div>
    );
  } else if (cargando) {
    contenido = (
      <DataTable<FilaAsignacion> columns={COLUMNAS} getRowId={(fila) => fila.id} loading rows={[]} />
    );
  } else if (listaAsignaciones.length === 0) {
    contenido = (
      <EmptyState
        description="Creá la primera con «Nueva asignación»."
        title="No hay asignaciones."
      />
    );
  } else {
    const nombresDeRol = new Map(listaRoles.map((rol) => [rol.id, rol.nombre]));
    const nombresDeSucursal = new Map(listaSucursales.map((s) => [s.id, s.nombre]));
    contenido = (
      <DataTable
        columns={COLUMNAS}
        getRowId={(fila) => fila.id}
        renderActions={(fila) => (
          <Button
            aria-label={`Editar asignación de ${fila.asignacion.usuario}`}
            onClick={() => setDialogo({ tipo: "editar", asignacion: fila.asignacion })}
            variant="ghost"
          >
            Editar
          </Button>
        )}
        rows={listaAsignaciones.map((a) => aFila(a, nombresDeRol, nombresDeSucursal))}
      />
    );
  }

  return (
    <section>
      <h2>Asignaciones</h2>
      <div>
        <Button
          disabled={cargando || hayError}
          onClick={() => setDialogo({ tipo: "crear" })}
        >
          Nueva asignación
        </Button>
      </div>
      {contenido}
      {aviso !== null ? <Toast onDismiss={cerrarAviso}>{aviso}</Toast> : null}
      <Modal onClose={cerrarDialogo} open={dialogo !== null} title={tituloDe(dialogo)}>
        {dialogo?.tipo === "crear" ? (
          <FormularioAsignacion
            asignacion={null}
            key="crear"
            onClose={cerrarDialogo}
            onGuardada={alTerminar}
            roles={listaRoles}
            sucursales={listaSucursales}
          />
        ) : null}
        {dialogo?.tipo === "editar" ? (
          <FormularioAsignacion
            asignacion={dialogo.asignacion}
            key={`editar-${dialogo.asignacion.id}`}
            onClose={cerrarDialogo}
            onGuardada={alTerminar}
            roles={listaRoles}
            sucursales={listaSucursales}
          />
        ) : null}
      </Modal>
    </section>
  );
}
