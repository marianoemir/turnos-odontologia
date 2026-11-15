/**
 * Sección `/catalogo/pacientes` (C-15, tasks 2.1 y 2.2): tabla de pacientes
 * con buscador `?q=`, paginación del envelope, alta y edición en `Modal`.
 *
 * Patrón de `pages/admin-sucursales.tsx`: listado con `DataTable` +
 * `EmptyState` + `Skeleton` (vía `loading`), formulario RHF + zod en modal,
 * `409 duplicate_dni` al campo `dni` y 422 vía `applyApiFieldErrors`, sin
 * optimistic update (la mutación invalida la raíz `pacientes`).
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
import { pacienteFormResolver, type PacienteFormValues } from "../forms/schemas";
import {
  useActualizarPaciente,
  useCrearPaciente,
  usePacientes,
  type PacientePatch,
} from "../services/catalogo";
import type { Paciente } from "../types/api";
import { ApiError } from "../types/errors";

/** Fila de la tabla: `DataTable` muestra cada celda como texto. */
interface FilaPaciente {
  id: string;
  nombre: string;
  dni: string;
  contacto: string;
  estado: string;
  paciente: Paciente;
}

const COLUMNAS: { header: string; key: keyof FilaPaciente & string }[] = [
  { header: "Nombre", key: "nombre" },
  { header: "DNI", key: "dni" },
  { header: "Contacto", key: "contacto" },
  { header: "Estado", key: "estado" },
];

function aFila(paciente: Paciente): FilaPaciente {
  return {
    id: paciente.id,
    nombre: paciente.nombre,
    dni: paciente.dni,
    contacto: (paciente.contacto ?? "").trim() || "—",
    estado: paciente.activo ? "Activo" : "Inactivo",
    paciente,
  };
}

const LIMITE_PAGINA = 50;

type Dialogo = { tipo: "crear" } | { tipo: "editar"; paciente: Paciente };

function tituloDe(dialogo: Dialogo | null): string {
  if (dialogo === null) {
    return "";
  }
  switch (dialogo.tipo) {
    case "crear":
      return "Nuevo paciente";
    case "editar":
      return `Editar paciente ${dialogo.paciente.nombre}`;
  }
}

interface FormularioPacienteProps {
  /** `null` para el alta; el paciente a editar en la edición. */
  paciente: Paciente | null;
  onClose: () => void;
  onGuardado: (mensaje: string) => void;
}

function FormularioPaciente({ paciente, onClose, onGuardado }: FormularioPacienteProps) {
  const crear = useCrearPaciente();
  const actualizar = useActualizarPaciente();
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<PacienteFormValues>({
    defaultValues: {
      nombre: paciente?.nombre ?? "",
      dni: paciente?.dni ?? "",
      contacto: paciente?.contacto ?? "",
    },
    resolver: pacienteFormResolver,
  });
  const enCurso = crear.isPending || actualizar.isPending;

  async function guardar(valores: PacienteFormValues): Promise<void> {
    setMensajeError(null);
    const nombre = valores.nombre.trim();
    const dni = valores.dni.trim();
    const contacto = valores.contacto.trim();
    try {
      if (paciente === null) {
        await crear.mutateAsync({ nombre, dni, contacto });
        onGuardado("Paciente creado.");
        return;
      }
      const parche: PacientePatch = {};
      if (nombre !== paciente.nombre) {
        parche.nombre = nombre;
      }
      if (dni !== paciente.dni) {
        parche.dni = dni;
      }
      if (contacto !== (paciente.contacto ?? "")) {
        parche.contacto = contacto;
      }
      if (Object.keys(parche).length === 0) {
        onClose();
        return;
      }
      await actualizar.mutateAsync({ id: paciente.id, parche });
      onGuardado("Paciente actualizado.");
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.causa === "duplicate_dni"
      ) {
        setError("dni", {
          type: "server",
          message: "Ya existe un paciente con ese dni.",
        });
        return;
      }
      if (error instanceof ApiError) {
        const proyectado = applyApiFieldErrors(error, setError, [
          "nombre",
          "dni",
          "contacto",
        ]);
        if (proyectado) {
          return;
        }
        if (error.status === 403 || error.kind === "permiso") {
          setMensajeError("Permiso insuficiente.");
          return;
        }
      }
      setMensajeError("No se pudo guardar el paciente.");
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void handleSubmit(guardar)(evento)}>
      <TextField error={errors.nombre?.message} label="Nombre" {...register("nombre")} />
      <TextField error={errors.dni?.message} label="DNI" {...register("dni")} />
      <TextField error={errors.contacto?.message} label="Contacto" {...register("contacto")} />
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

export default function PacientesPage() {
  const [busqueda, setBusqueda] = useState("");
  const [offset, setOffset] = useState(0);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cerrarAviso = useCallback(() => setAviso(null), []);
  const cerrarDialogo = useCallback(() => setDialogo(null), []);

  const { data, isPending, isError, refetch } = usePacientes({
    q: busqueda,
    limit: LIMITE_PAGINA,
    offset,
  });

  function alTerminar(mensaje: string): void {
    setDialogo(null);
    setAviso(mensaje);
  }

  let contenido: ReactNode;
  if (isError) {
    contenido = (
      <div role="alert">
        <p>No se pudieron cargar los pacientes.</p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  } else if (isPending) {
    contenido = (
      <DataTable<FilaPaciente>
        columns={COLUMNAS}
        getRowId={(fila) => fila.id}
        loading
        rows={[]}
      />
    );
  } else if (data.items.length === 0) {
    contenido = (
      <EmptyState
        description="Probá con otra búsqueda o creá el primer paciente con «Nuevo paciente»."
        title="No hay pacientes."
      />
    );
  } else {
    const desde = data.total === 0 ? 0 : data.offset + 1;
    const hasta = Math.min(data.offset + data.items.length, data.total);
    const hayAnterior = data.offset > 0;
    const haySiguiente = data.offset + data.items.length < data.total;
    contenido = (
      <div>
        <DataTable
          columns={COLUMNAS}
          getRowId={(fila) => fila.id}
          renderActions={(fila) => (
            <Button
              aria-label={`Editar ${fila.paciente.nombre}`}
              onClick={() => setDialogo({ tipo: "editar", paciente: fila.paciente })}
              variant="ghost"
            >
              Editar
            </Button>
          )}
          rows={data.items.map(aFila)}
        />
        <p>
          Mostrando {desde}–{hasta} de {data.total}
        </p>
        <div>
          <Button
            disabled={!hayAnterior}
            onClick={() => setOffset((actual) => Math.max(0, actual - LIMITE_PAGINA))}
            variant="secondary"
          >
            Anterior
          </Button>
          <Button
            disabled={!haySiguiente}
            onClick={() => setOffset((actual) => actual + LIMITE_PAGINA)}
            variant="secondary"
          >
            Siguiente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section>
      <h2>Pacientes</h2>
      <div>
        <Button onClick={() => setDialogo({ tipo: "crear" })}>Nuevo paciente</Button>
      </div>
      <TextField
        label="Buscar pacientes"
        onChange={(evento) => {
          setBusqueda(evento.target.value);
          setOffset(0);
        }}
        type="search"
        value={busqueda}
      />
      {contenido}
      {aviso !== null ? <Toast onDismiss={cerrarAviso}>{aviso}</Toast> : null}
      <Modal onClose={cerrarDialogo} open={dialogo !== null} title={tituloDe(dialogo)}>
        {dialogo?.tipo === "crear" ? (
          <FormularioPaciente
            key="crear"
            onClose={cerrarDialogo}
            onGuardado={alTerminar}
            paciente={null}
          />
        ) : null}
        {dialogo?.tipo === "editar" ? (
          <FormularioPaciente
            key={`editar-${dialogo.paciente.id}`}
            onClose={cerrarDialogo}
            onGuardado={alTerminar}
            paciente={dialogo.paciente}
          />
        ) : null}
      </Modal>
    </section>
  );
}
