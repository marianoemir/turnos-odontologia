/**
 * Pantalla `/admin/roles` (C-22, tasks 3.1 y 3.2): listado de roles y sus
 * permisos en solo lectura, y edición de la `descripcion` en un modal.
 *
 * Solo la descripción es editable: el nombre, la desactivación y el alta de
 * roles no forman parte de la UI (spec `frontend-admin`), y el `PATCH` envía
 * únicamente `descripcion` (`useActualizarDescripcionRol`). La autorización
 * real es del backend (403 si el rol no es `admin`).
 */
import { useState } from "react";
import type { FormEvent } from "react";

import { Button } from "../components/button";
import { DataTable } from "../components/data-table";
import { EmptyState } from "../components/empty-state";
import { Modal } from "../components/modal";
import { TextField } from "../components/text-field";
import { useActualizarDescripcionRol, useRoles } from "../services/admin";
import type { Rol } from "../types/api-admin";
import { ApiError } from "../types/errors";

/** Fila de la tabla: `DataTable` muestra cada celda como texto. */
interface FilaRol {
  id: string;
  nombre: string;
  descripcion: string;
  estado: string;
  permisos: string;
  rol: Rol;
}

const COLUMNAS: { header: string; key: keyof FilaRol & string }[] = [
  { header: "Nombre", key: "nombre" },
  { header: "Descripción", key: "descripcion" },
  { header: "Estado", key: "estado" },
  { header: "Permisos", key: "permisos" },
];

function aFila(rol: Rol): FilaRol {
  return {
    id: rol.id,
    nombre: rol.nombre,
    descripcion: (rol.descripcion ?? "").trim() || "Sin descripción",
    estado: rol.activo ? "Activo" : "Inactivo",
    permisos: rol.permisos.length > 0 ? rol.permisos.join(", ") : "Sin permisos",
    rol,
  };
}

function mensajeDeError(error: unknown, nombreRol: string): string {
  if (error instanceof ApiError) {
    if (error.status === 409 && error.causa === "rol_canonico_protegido") {
      return `El rol «${nombreRol}» es canónico y está protegido: no se puede modificar.`;
    }
    if (error.status === 403 || error.kind === "permiso") {
      return "Permiso insuficiente.";
    }
  }
  return "No se pudo guardar la descripción.";
}

interface EditarDescripcionProps {
  rol: Rol;
  onClose: () => void;
}

function EditarDescripcion({ rol, onClose }: EditarDescripcionProps) {
  const [descripcion, setDescripcion] = useState(rol.descripcion ?? "");
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const mutacion = useActualizarDescripcionRol();

  async function guardar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setMensajeError(null);
    try {
      await mutacion.mutateAsync({ id: rol.id, descripcion: descripcion.trim() });
      onClose();
    } catch (error) {
      setMensajeError(mensajeDeError(error, rol.nombre));
    }
  }

  return (
    <form onSubmit={(evento) => void guardar(evento)}>
      <TextField
        label="Descripción"
        onChange={(evento) => setDescripcion(evento.target.value)}
        value={descripcion}
      />
      {mensajeError !== null ? <p role="alert">{mensajeError}</p> : null}
      <div>
        <Button disabled={mutacion.isPending} onClick={onClose} variant="secondary">
          Cancelar
        </Button>
        <Button disabled={mutacion.isPending} type="submit">
          {mutacion.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

export default function AdminRolesPage() {
  const { data, isPending, isError, refetch } = useRoles();
  const [rolEnEdicion, setRolEnEdicion] = useState<Rol | null>(null);

  let contenido;
  if (isError) {
    contenido = (
      <div role="alert">
        <p>No se pudieron cargar los roles.</p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  } else if (isPending) {
    contenido = (
      <DataTable<FilaRol> columns={COLUMNAS} getRowId={(fila) => fila.id} loading rows={[]} />
    );
  } else if (data.length === 0) {
    contenido = (
      <EmptyState
        description="El servidor no devolvió ningún rol."
        title="No hay roles."
      />
    );
  } else {
    contenido = (
      <DataTable
        columns={COLUMNAS}
        getRowId={(fila) => fila.id}
        renderActions={(fila) => (
          <Button
            aria-label={`Editar descripción de ${fila.rol.nombre}`}
            onClick={() => setRolEnEdicion(fila.rol)}
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
      <h1 className="app-title">Roles</h1>
      {contenido}
      <Modal
        onClose={() => setRolEnEdicion(null)}
        open={rolEnEdicion !== null}
        title={rolEnEdicion ? `Editar descripción de ${rolEnEdicion.nombre}` : ""}
      >
        {rolEnEdicion ? (
          <EditarDescripcion
            key={rolEnEdicion.id}
            onClose={() => setRolEnEdicion(null)}
            rol={rolEnEdicion}
          />
        ) : null}
      </Modal>
    </section>
  );
}