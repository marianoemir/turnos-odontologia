import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "../components/button";
import { Select } from "../components/select";
import { TextField } from "../components/text-field";
import { ApiError } from "../types/errors";
import type { Paciente, Prestacion, Profesional } from "../types/api";
import type { ListaEsperaCreate, ListaEsperaOut } from "../types/api-lista-espera";
import {
  crearEntradaListaEspera,
  listarPacientesCatalogo,
  listarPrestacionesCatalogo,
  listarProfesionalesCatalogo,
} from "../services/lista-espera";

function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message || error.detalle || "Error al registrar en lista de espera.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Error al registrar en lista de espera.";
}

export default function ListaEsperaPage() {
  const [busquedaPaciente, setBusquedaPaciente] = useState("");
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null);
  const [profesionalId, setProfesionalId] = useState("");
  const [prestacionId, setPrestacionId] = useState("");
  const [ultimaEntrada, setUltimaEntrada] = useState<ListaEsperaOut | null>(null);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  const pacientesQuery = useQuery({
    queryKey: ["lista-espera", "alta", "pacientes", busquedaPaciente],
    queryFn: () =>
      listarPacientesCatalogo({
        q: busquedaPaciente,
        limit: 200,
      }),
    enabled: busquedaPaciente.trim().length > 0,
  });

  const profesionalesQuery = useQuery({
    queryKey: ["lista-espera", "alta", "profesionales"],
    queryFn: () => listarProfesionalesCatalogo(),
  });

  const prestacionesQuery = useQuery({
    queryKey: ["lista-espera", "alta", "prestaciones"],
    queryFn: () => listarPrestacionesCatalogo(),
  });

  const altaMutation = useMutation({
    mutationFn: (body: ListaEsperaCreate) => crearEntradaListaEspera(body),
    onSuccess: (data) => {
      setUltimaEntrada(data);
      setErrorAlta(null);
    },
    onError: (error) => {
      setErrorAlta(mensajeDeError(error));
    },
  });

  const profesionales = profesionalesQuery.data ?? [];
  const prestaciones = prestacionesQuery.data ?? [];
  const pacientes = pacientesQuery.data?.items ?? [];

  const opcionesProfesional = [
    { value: "", label: "Sin profesional (opcional)" },
    ...profesionales.map((p: Profesional) => ({ value: p.id, label: p.nombre })),
  ];

  const opcionesPrestacion = [
    { value: "", label: "Seleccionar prestación" },
    ...prestaciones.map((p: Prestacion) => ({ value: p.id, label: p.nombre })),
  ];

  const puedeEnviar =
    pacienteSeleccionado !== null &&
    prestacionId.length > 0 &&
    !altaMutation.isPending;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pacienteSeleccionado || !prestacionId || altaMutation.isPending) {
      return;
    }
    setErrorAlta(null);
    const body: ListaEsperaCreate = {
      paciente_id: pacienteSeleccionado.id,
      prestacion_id: prestacionId,
    };
    if (profesionalId) {
      body.profesional_id = profesionalId;
    }
    altaMutation.mutate(body);
  }

  return (
    <section>
      <h1 className="app-title">Lista de espera</h1>

      <form aria-label="Alta en lista de espera" onSubmit={handleSubmit}>
        <TextField
          label="Buscar paciente"
          value={busquedaPaciente}
          onChange={(e) => {
            setBusquedaPaciente(e.target.value);
            setPacienteSeleccionado(null);
          }}
        />

        {busquedaPaciente.trim().length > 0 && pacientesQuery.isSuccess ? (
          <ul role="listbox" aria-label="Resultados de pacientes">
            {pacientes.map((paciente) => (
              <li key={paciente.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={pacienteSeleccionado?.id === paciente.id}
                  onClick={() => setPacienteSeleccionado(paciente)}
                >
                  {paciente.nombre}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {pacienteSeleccionado ? (
          <p>Paciente seleccionado: {pacienteSeleccionado.nombre}</p>
        ) : null}

        <Select
          label="Profesional (opcional)"
          value={profesionalId}
          onChange={(e) => setProfesionalId(e.target.value)}
          options={opcionesProfesional}
        />

        <Select
          label="Prestación"
          value={prestacionId}
          onChange={(e) => setPrestacionId(e.target.value)}
          options={opcionesPrestacion}
        />

        <Button type="submit" disabled={!puedeEnviar}>
          Agregar a lista de espera
        </Button>
      </form>

      {errorAlta ? <p role="alert">{errorAlta}</p> : null}

      {ultimaEntrada ? (
        <div>
          <p>Entrada registrada</p>
          <p>Estado: {ultimaEntrada.estado}</p>
        </div>
      ) : null}
    </section>
  );
}
