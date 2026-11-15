import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/button";
import { EmptyState } from "../components/empty-state";
import { Modal } from "../components/modal";
import { Select } from "../components/select";
import { Skeleton } from "../components/skeleton";
import { TextField } from "../components/text-field";
import { normalizeApiError } from "../services/api-error";
import { ApiError } from "../types/errors";
import type { Paciente, Prestacion, Profesional, Sillon } from "../types/api";
import type {
  ListaEsperaCreate,
  ListaEsperaOut,
  OfrecerHueco,
  OfrecerHuecoResponse,
} from "../types/api-lista-espera";
import {
  crearEntradaListaEspera,
  listarEntradasListaEspera,
  listarPacientesCatalogo,
  listarPrestacionesCatalogo,
  listarProfesionalesCatalogo,
  listarSillonesCatalogo,
  ofrecerHuecoListaEspera,
} from "../services/lista-espera";
import { resourceKeys } from "../services/query";

const NO_DISPONIBLE = "No disponible";

function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message || error.detalle || "Error al registrar en lista de espera.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Error al registrar en lista de espera.";
}

function errorNormalizado(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  return normalizeApiError(0, error);
}

function nombreDeCatalogo(
  id: string | null,
  mapa: Map<string, string>,
): string {
  if (id === null) {
    return NO_DISPONIBLE;
  }
  return mapa.get(id) ?? NO_DISPONIBLE;
}

function tieneOffsetZonaHoraria(valor: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(valor.trim());
}

export default function ListaEsperaPage() {
  const queryClient = useQueryClient();
  const [busquedaPaciente, setBusquedaPaciente] = useState("");
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null);
  const [profesionalId, setProfesionalId] = useState("");
  const [prestacionId, setPrestacionId] = useState("");
  const [ultimaEntrada, setUltimaEntrada] = useState<ListaEsperaOut | null>(null);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [filtroProfesional, setFiltroProfesional] = useState("");

  const [entradaOferta, setEntradaOferta] = useState<ListaEsperaOut | null>(null);
  const [pasoOferta, setPasoOferta] = useState<"form" | "confirm">("form");
  const [inicioOferta, setInicioOferta] = useState("");
  const [profesionalOfertaId, setProfesionalOfertaId] = useState("");
  const [sillonOfertaId, setSillonOfertaId] = useState("");
  const [errorInicioOferta, setErrorInicioOferta] = useState<string | null>(null);
  const [errorOferta, setErrorOferta] = useState<string | null>(null);
  const [ofertasPorEntrada, setOfertasPorEntrada] = useState<Record<string, OfrecerHuecoResponse>>({});

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
    queryKey: [...resourceKeys.profesionales.all, "lista-espera-select"],
    queryFn: () => listarProfesionalesCatalogo(),
  });

  const prestacionesQuery = useQuery({
    queryKey: [...resourceKeys.prestaciones.all, "lista-espera-select"],
    queryFn: () => listarPrestacionesCatalogo(),
  });

  const sillonesQuery = useQuery({
    queryKey: [...resourceKeys.sillones.all, "lista-espera-select"],
    queryFn: () => listarSillonesCatalogo(),
  });

  const pacientesTablaQuery = useQuery({
    queryKey: [...resourceKeys.pacientes.all, "lista-espera-tabla", { incluir_inactivos: true }],
    queryFn: () => listarPacientesCatalogo({ incluir_inactivos: true }),
  });

  const profesionalesTablaQuery = useQuery({
    queryKey: [...resourceKeys.profesionales.all, "lista-espera-tabla", { incluir_inactivos: true }],
    queryFn: () => listarProfesionalesCatalogo({ incluir_inactivos: true }),
  });

  const prestacionesTablaQuery = useQuery({
    queryKey: [...resourceKeys.prestaciones.all, "lista-espera-tabla", { incluir_inactivos: true }],
    queryFn: () => listarPrestacionesCatalogo({ incluir_inactivos: true }),
  });

  const sillonesTablaQuery = useQuery({
    queryKey: [...resourceKeys.sillones.all, "lista-espera-tabla", { incluir_inactivos: true }],
    queryFn: () => listarSillonesCatalogo({ incluir_inactivos: true }),
  });

  const listaEsperaQuery = useQuery({
    queryKey: [...resourceKeys.listaEspera.all, filtroProfesional],
    queryFn: () =>
      listarEntradasListaEspera(filtroProfesional || undefined),
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

  const ofertaMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: OfrecerHueco }) =>
      ofrecerHuecoListaEspera(id, body),
    onSuccess: (data, variables) => {
      setOfertasPorEntrada((prev) => ({
        ...prev,
        [variables.id]: data,
      }));
      setErrorOferta(null);
      setErrorInicioOferta(null);
      setPasoOferta("form");
      setEntradaOferta(null);
      setInicioOferta("");
      setProfesionalOfertaId("");
      setSillonOfertaId("");
      void queryClient.invalidateQueries({ queryKey: resourceKeys.listaEspera.all });
    },
    onError: (error) => {
      setErrorOferta(mensajeDeError(error));
    },
  });

  const profesionales = profesionalesQuery.data ?? [];
  const prestaciones = prestacionesQuery.data ?? [];
  const sillones = sillonesQuery.data ?? [];
  const pacientes = pacientesQuery.data?.items ?? [];
  const entradas = listaEsperaQuery.data ?? [];

  const mapaPacientesTabla = new Map(
    (pacientesTablaQuery.data?.items ?? []).map((p) => [p.id, p.nombre]),
  );
  const mapaProfesionalesTabla = new Map(
    (profesionalesTablaQuery.data ?? []).map((p) => [p.id, p.nombre]),
  );
  const mapaPrestacionesTabla = new Map(
    (prestacionesTablaQuery.data ?? []).map((p) => [p.id, p.nombre]),
  );
  // sillones resueltos para tabla (contrato exige lectura con incluir_inactivos=true)
  void sillonesTablaQuery.data;

  const errorCatalogo = [
    pacientesTablaQuery.error,
    profesionalesTablaQuery.error,
    prestacionesTablaQuery.error,
    sillonesTablaQuery.error,
  ].find(Boolean);

  const opcionesProfesional = [
    { value: "", label: "Sin profesional (opcional)" },
    ...profesionales.map((p: Profesional) => ({ value: p.id, label: p.nombre })),
  ];

  const opcionesPrestacion = [
    { value: "", label: "Seleccionar prestación" },
    ...prestaciones.map((p: Prestacion) => ({ value: p.id, label: p.nombre })),
  ];

  const opcionesFiltroProfesional = [
    { value: "", label: "Todos los profesionales" },
    ...profesionales.map((p: Profesional) => ({ value: p.id, label: p.nombre })),
  ];

  const opcionesProfesionalOferta = [
    { value: "", label: "Seleccionar profesional" },
    ...profesionales.map((p: Profesional) => ({ value: p.id, label: p.nombre })),
  ];

  const opcionesSillonOferta = [
    { value: "", label: "Seleccionar sillón" },
    ...sillones.map((s: Sillon) => ({ value: s.id, label: s.nombre })),
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

  function abrirOferta(entrada: ListaEsperaOut) {
    setEntradaOferta(entrada);
    setPasoOferta("form");
    setInicioOferta("");
    setProfesionalOfertaId(entrada.profesional_id ?? "");
    setSillonOfertaId("");
    setErrorInicioOferta(null);
    setErrorOferta(null);
  }

  function cerrarOferta() {
    if (ofertaMutation.isPending) {
      return;
    }
    setEntradaOferta(null);
    setPasoOferta("form");
    setErrorInicioOferta(null);
    setErrorOferta(null);
  }

  function continuarOferta() {
    setErrorInicioOferta(null);
    setErrorOferta(null);
    if (!tieneOffsetZonaHoraria(inicioOferta)) {
      setErrorInicioOferta("El inicio debe incluir offset de zona horaria.");
      return;
    }
    setPasoOferta("confirm");
  }

  function confirmarOferta() {
    if (!entradaOferta || ofertaMutation.isPending) {
      return;
    }
    if (!tieneOffsetZonaHoraria(inicioOferta)) {
      setErrorInicioOferta("El inicio debe incluir offset de zona horaria.");
      setPasoOferta("form");
      return;
    }
    setErrorOferta(null);
    ofertaMutation.mutate({
      id: entradaOferta.id,
      body: {
        inicio: inicioOferta.trim(),
        profesional_id: profesionalOfertaId,
        sillon_id: sillonOfertaId,
      },
    });
  }

  const ofertas = Object.entries(ofertasPorEntrada);

  let contenidoLista: React.ReactNode;
  if (listaEsperaQuery.isPending) {
    contenidoLista = <Skeleton style={{ width: "100%" }} />;
  } else if (listaEsperaQuery.isError) {
    const err = errorNormalizado(listaEsperaQuery.error);
    contenidoLista = <p role="alert">{err.message}</p>;
  } else if (entradas.length === 0) {
    contenidoLista = (
      <EmptyState
        title="Sin entradas en lista de espera"
        description="No hay pacientes en lista de espera."
      />
    );
  } else {
    contenidoLista = (
      <table aria-label="Entradas de lista de espera">
        <thead>
          <tr>
            <th scope="col">Paciente</th>
            <th scope="col">Profesional</th>
            <th scope="col">Prestación</th>
            <th scope="col">Estado</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {entradas.map((entrada) => (
            <tr key={entrada.id}>
              <td>{nombreDeCatalogo(entrada.paciente_id, mapaPacientesTabla)}</td>
              <td>{nombreDeCatalogo(entrada.profesional_id, mapaProfesionalesTabla)}</td>
              <td>{nombreDeCatalogo(entrada.prestacion_id, mapaPrestacionesTabla)}</td>
              <td>{entrada.estado}</td>
              <td>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => abrirOferta(entrada)}
                  disabled={ofertaMutation.isPending}
                >
                  Ofrecer hueco
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
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

      <Select
        label="Filtrar por profesional"
        value={filtroProfesional}
        onChange={(e) => setFiltroProfesional(e.target.value)}
        options={opcionesFiltroProfesional}
      />

      {errorCatalogo ? (
        <p role="alert">{mensajeDeError(errorCatalogo)}</p>
      ) : null}

      {contenidoLista}

      {ofertas.length > 0 ? (
        <section aria-label="Ofertas realizadas">
          <h2>Ofertas realizadas</h2>
          <ul>
            {ofertas.map(([id, oferta]) => (
              <li key={id}>
                <p>Entrada: {id}</p>
                <p>Estado de lista: {oferta.lista.estado}</p>
                <p>Estado de turno: {oferta.turno.estado}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Modal
        open={entradaOferta !== null}
        onClose={cerrarOferta}
        title="Ofrecer hueco"
      >
        {pasoOferta === "form" ? (
          <>
            <TextField
              label="Inicio"
              value={inicioOferta}
              onChange={(e) => setInicioOferta(e.target.value)}
              error={errorInicioOferta ?? undefined}
            />
            <Select
              label="Profesional"
              value={profesionalOfertaId}
              onChange={(e) => setProfesionalOfertaId(e.target.value)}
              options={opcionesProfesionalOferta}
            />
            <Select
              label="Sillón"
              value={sillonOfertaId}
              onChange={(e) => setSillonOfertaId(e.target.value)}
              options={opcionesSillonOferta}
            />
            {errorOferta ? <p role="alert">{errorOferta}</p> : null}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Button variant="secondary" onClick={cerrarOferta} disabled={ofertaMutation.isPending}>
                Cancelar
              </Button>
              <Button onClick={continuarOferta} disabled={ofertaMutation.isPending}>
                Continuar
              </Button>
            </div>
          </>
        ) : (
          <>
            <p>Confirmá la oferta del hueco para la entrada seleccionada.</p>
            <p>Inicio: {inicioOferta}</p>
            {errorOferta ? <p role="alert">{errorOferta}</p> : null}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Button
                variant="secondary"
                onClick={() => setPasoOferta("form")}
                disabled={ofertaMutation.isPending}
              >
                Volver
              </Button>
              <Button onClick={confirmarOferta} disabled={ofertaMutation.isPending}>
                Confirmar oferta
              </Button>
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}
