/**
 * Wizard `/turnos/nuevo` (C-16, tasks 2.1, 2.2, 3.1 y 3.2): crear un turno en
 * una sola pantalla — buscador de paciente sobre `usePacientes({q})` (nombre
 * + dni), `Select` de profesional/prestación/sillón solo con activos, campo
 * `datetime-local`, fin estimado en vivo (`inicio + duracion_min`, RN-AG-01),
 * guía de horario (franjas del profesional + bloqueos aplicables, solo
 * advertencia: el backend decide) y card de éxito en `pendiente`.
 *
 * Patrón de `pages/catalogo-bloqueos.tsx`: RHF + zod (`turnoFormResolver`),
 * `datetime-local` → ISO con zona (`new Date(...).toISOString()`, el backend
 * exige `AwareDatetime`) y `useCrearTurno` (`useResourceMutation`, sin
 * optimistic update). El `POST` viaja sin `fin`: el servidor lo calcula.
 *
 * Alcance restante: los 409 por causa
 * muestran su mensaje junto al formulario (design D6, tasks 4.x) y los 422
 * se proyectan a sus campos vía `applyApiFieldErrors`.
 */
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "../components/button";
import { Card } from "../components/card";
import { EstadoBadge } from "../components/estado-badge";
import { Select } from "../components/select";
import { TextField } from "../components/text-field";
import { applyApiFieldErrors } from "../forms/api-field-errors";
import { turnoFormResolver, type TurnoFormValues } from "../forms/schemas";
import {
  useBloqueos,
  useHorarios,
  usePacientes,
  usePrestaciones,
  useProfesionales,
  useSillones,
} from "../services/catalogo";
import { useCrearTurno } from "../services/turnos";
import { ApiError } from "../types/errors";
import { bloqueoAplicable } from "./turno-nuevo-guia";
import type {
  HorarioAtencion,
  Paciente,
  Prestacion,
  Turno,
} from "../types/api";

/** Espera antes de fijar `q`: evita una request por cada tecla (design D5). */
const ESPERA_BUSQUEDA_MS = 200;

/** `datetime-local` entrega `"YYYY-MM-DDTHH:MM"`; otro texto no calcula fin. */
const PATRON_INICIO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/**
 * Texto apto para `new Date(...)`: `datetime-local` sin segundos o con
 * segundos (`:ss` opcional, según navegador/input); otro texto no calcula
 * fin ni alimenta la guía.
 */
function esTextoInicioValido(inicioTexto: string): boolean {
  return PATRON_INICIO.test(inicioTexto);
}

function aFinEstimado(inicioTexto: string, prestacion: Prestacion | undefined): Date | null {
  if (prestacion === undefined) {
    return null;
  }
  if (!esTextoInicioValido(inicioTexto)) {
    return null;
  }
  const inicioMs = new Date(inicioTexto).getTime();
  if (Number.isNaN(inicioMs)) {
    return null;
  }
  return new Date(inicioMs + prestacion.duracion_min * 60_000);
}

/** Fecha local legible, mismo formato que `catalogo-bloqueos.tsx:48-55`. */
function aTextoFecha(fecha: Date): string {
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const hora = String(fecha.getHours()).padStart(2, "0");
  const minutos = String(fecha.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getFullYear()} ${hora}:${minutos}`;
}

/**
 * Mensaje por causa del 409 (design D6, task 4.1): cada causa tiene su texto
 * fijo en español es-AR; el `detalle` del backend viaja como texto
 * secundario. Una causa desconocida devuelve `null` (mensaje genérico).
 */
function mensajePorCausa(causa: string | null): string | null {
  switch (causa) {
    case "profesional":
      return "Ese profesional ya tiene un turno en ese horario.";
    case "sillon":
      return "Ese sillón ya está ocupado en ese horario.";
    case "horario":
      return "Está fuera del horario de atención del profesional.";
    case "bloqueo":
      return "Hay un bloqueo en ese horario.";
    default:
      return null;
  }
}

/** Fallo junto al formulario: mensaje fijo por causa + detalle secundario. */
interface FalloFormulario {
  mensaje: string;
  detalle: string | null;
  /**
   * Causa del 409 que originó el fallo (`horario`/`bloqueo`/`profesional`/
   * `sillon`), `null` en el mensaje genérico. Sirve para ocultar el aviso de
   * la guía correspondiente (mismo texto apilado, fix E2E obs 2): la guía
   * sigue visible mientras no hay fallo.
   */
  causa: string | null;
}

/**
 * Guía de horario en cliente (design D4, task 3.1): orientación, nunca
 * validación. El backend (`ServicioTurnos.validar`) es la única validación:
 * la guía advierte "fuera de horario" o "bloqueo" pero no bloquea el envío,
 * y no conoce turnos existentes (el borde `inicio == fin`, RN-AG-04, nunca
 * muestra advertencia de solape: solo el 201/409 del servidor decide).
 */

/** `"HH:MM:SS"` del backend a minutos desde medianoche; otro texto no guía. */
function aMinutos(hora: string): number | null {
  const partes = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(hora);
  if (partes === null) {
    return null;
  }
  const minutos = Number(partes[1]) * 60 + Number(partes[2]);
  return Number.isNaN(minutos) ? null : minutos;
}

/** `weekday()` del backend: lunes = 0 (JS `getDay()`: domingo = 0). */
function aDiaSemana(fecha: Date): number {
  return (fecha.getDay() + 6) % 7;
}

/**
 * Cobertura del intervalo por las franjas del profesional en el día, con la
 * misma semántica de unión continua que `_dia_cubre` del backend. Solo cubre
 * el tramo del mismo día: si el turno cruza medianoche (`fin` en día
 * distinto al `inicio`) retorna false, y el aviso se suprime en el call site
 * (`fueraDeHorario` exige mismo día) porque la guía no bloquea — el servidor
 * decide (ver comentario en `fueraDeHorario`).
 */
function cubiertoPorHorario(
  franjas: HorarioAtencion[],
  inicio: Date,
  fin: Date,
): boolean {
  const iniMin = inicio.getHours() * 60 + inicio.getMinutes();
  const finMin = fin.getHours() * 60 + fin.getMinutes();
  if (finMin <= iniMin) {
    return false;
  }
  const rangos = franjas
    .map((franja) => {
      const desde = aMinutos(franja.desde);
      const hasta = aMinutos(franja.hasta);
      return desde === null || hasta === null
        ? null
        : { desde, hasta };
    })
    .filter((rango): rango is { desde: number; hasta: number } => rango !== null)
    .sort((a, b) => a.desde - b.desde);
  let cursor = iniMin;
  for (const rango of rangos) {
    if (rango.desde <= cursor) {
      cursor = Math.max(cursor, rango.hasta);
    }
    if (cursor >= finMin) {
      return true;
    }
  }
  return cursor >= finMin;
}

export default function TurnoNuevoPage() {
  const [busqueda, setBusqueda] = useState("");
  const [termino, setTermino] = useState("");
  const [pacienteElegido, setPacienteElegido] = useState<Paciente | null>(null);
  const [fallo, setFallo] = useState<FalloFormulario | null>(null);
  const [creado, setCreado] = useState<Turno | null>(null);
  const crear = useCrearTurno();

  useEffect(() => {
    const temporizador = window.setTimeout(
      () => setTermino(busqueda.trim()),
      ESPERA_BUSQUEDA_MS,
    );
    return () => window.clearTimeout(temporizador);
  }, [busqueda]);

  const pacientes = usePacientes({ q: termino });
  const profesionalesQuery = useProfesionales();
  const sillonesQuery = useSillones();
  const prestacionesQuery = usePrestaciones();
  const horariosQuery = useHorarios();
  const bloqueosQuery = useBloqueos();

  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
  } = useForm<TurnoFormValues>({
    defaultValues: {
      paciente_id: "",
      profesional_id: "",
      prestacion_id: "",
      sillon_id: "",
      inicio: "",
    },
    resolver: turnoFormResolver,
  });

  function elegirPaciente(paciente: Paciente): void {
    setPacienteElegido(paciente);
    setValue("paciente_id", paciente.id, { shouldValidate: true });
    setBusqueda("");
  }

  function quitarPaciente(): void {
    setPacienteElegido(null);
    setValue("paciente_id", "");
  }

  /**
   * 5.2 "crear otro": `reset()` de RHF a los valores vacíos + limpieza del
   * estado local (paciente elegido, buscador, fallo y card). Solo se invalidó
   * la raíz `turnos` al crear: el catálogo se repuebla desde la caché sin
   * requests nuevas. `setTermino("")` es sincrónico para que el debounce no
   * dispare una búsqueda posterior.
   */
  function crearOtro(): void {
    reset();
    setPacienteElegido(null);
    setBusqueda("");
    setTermino("");
    setFallo(null);
    setCreado(null);
  }

  async function confirmar(valores: TurnoFormValues): Promise<void> {
    setFallo(null);
    try {
      const turno = await crear.mutateAsync({
        paciente_id: valores.paciente_id,
        profesional_id: valores.profesional_id,
        sillon_id: valores.sillon_id,
        prestacion_id: valores.prestacion_id,
        inicio: new Date(valores.inicio).toISOString(),
      });
      setCreado(turno);
    } catch (error) {
      // 4.2: el 422 del servidor se proyecta a sus campos (el formulario
      // conserva los datos; `Select`/`TextField` marcan `aria-invalid`).
      if (error instanceof ApiError) {
        const proyectado = applyApiFieldErrors(error, setError, [
          "paciente_id",
          "profesional_id",
          "prestacion_id",
          "sillon_id",
          "inicio",
        ]);
        if (proyectado) {
          return;
        }
        // 4.1: cada causa del 409 tiene su mensaje junto al formulario,
        // sin reintento automático (los datos se conservan: no hay reset).
        if (error.status === 409) {
          const mensaje = mensajePorCausa(error.causa);
          if (mensaje !== null) {
            setFallo({
              mensaje,
              detalle: error.detalle === "" ? null : error.detalle,
              causa: error.causa,
            });
            return;
          }
        }
      }
      setFallo({ mensaje: "No se pudo crear el turno.", detalle: null, causa: null });
    }
  }

  // Guarda ante respuestas con forma inesperada (solo lectura, nunca escribe).
  const resultados = Array.isArray(pacientes.data?.items) ? pacientes.data.items : [];
  const profesionales = Array.isArray(profesionalesQuery.data)
    ? profesionalesQuery.data.filter((profesional) => profesional.activo)
    : [];
  const sillones = Array.isArray(sillonesQuery.data)
    ? sillonesQuery.data.filter((sillon) => sillon.activo)
    : [];
  const prestaciones = Array.isArray(prestacionesQuery.data)
    ? prestacionesQuery.data.filter((prestacion) => prestacion.activo)
    : [];
  const catalogoFallo =
    pacientes.isError ||
    profesionalesQuery.isError ||
    sillonesQuery.isError ||
    prestacionesQuery.isError;

  // `useWatch` por campo (fix lint `react(incompatible-library)`): suscribirse
  // con `watch()` múltiple por render impide la memoización del compilador;
  // un `useWatch` por campo es la API recomendada y elimina el warning.
  const prestacionIdElegida = useWatch({ control, name: "prestacion_id" });
  const profesionalIdElegido = useWatch({ control, name: "profesional_id" });
  const sillonIdElegido = useWatch({ control, name: "sillon_id" });
  const inicioTexto = useWatch({ control, name: "inicio" });
  const prestacionElegida = prestaciones.find(
    (prestacion) => prestacion.id === prestacionIdElegida,
  );
  const finEstimado = aFinEstimado(inicioTexto, prestacionElegida);

  // Guía en cliente (3.1): solo cuando hay profesional, sillón, prestación e
  // inicio válidos y las queries de guía ya respondieron con éxito. Nunca
  // bloquea el envío: el botón sigue habilitado y el backend decide.
  const inicioValido =
    esTextoInicioValido(inicioTexto) &&
    !Number.isNaN(new Date(inicioTexto).getTime());
  const guiaLista =
    profesionalIdElegido !== "" &&
    sillonIdElegido !== "" &&
    finEstimado !== null &&
    inicioValido &&
    horariosQuery.isSuccess &&
    bloqueosQuery.isSuccess;
  const inicioFecha = guiaLista ? new Date(inicioTexto) : null;
  const franjasDelDia =
    guiaLista && inicioFecha !== null
      ? (horariosQuery.data ?? []).filter(
          (franja) =>
            franja.activo &&
            franja.profesional_id === profesionalIdElegido &&
            franja.dia_semana === aDiaSemana(inicioFecha),
        )
      : [];
  // Medianoche: si `fin` cae en día distinto al `inicio`, la guía no emite
  // "fuera de horario" (falso positivo: `cubiertoPorHorario` solo evalúa el
  // tramo del mismo día). La guía es orientación y nunca bloquea el envío:
  // el tramo que cruza medianoche lo decide el servidor (201/409).
  const mismoDiaQueInicio =
    guiaLista &&
    inicioFecha !== null &&
    finEstimado !== null &&
    inicioFecha.getFullYear() === finEstimado.getFullYear() &&
    inicioFecha.getMonth() === finEstimado.getMonth() &&
    inicioFecha.getDate() === finEstimado.getDate();
  const fueraDeHorario =
    guiaLista &&
    mismoDiaQueInicio &&
    inicioFecha !== null &&
    finEstimado !== null &&
    !cubiertoPorHorario(franjasDelDia, inicioFecha, finEstimado);
  const hayBloqueo =
    guiaLista &&
    inicioFecha !== null &&
    finEstimado !== null &&
    (bloqueosQuery.data ?? []).some((bloqueo) =>
      bloqueoAplicable(
        bloqueo,
        profesionalIdElegido,
        sillonIdElegido,
        inicioFecha.getTime(),
        finEstimado.getTime(),
      ),
    );

  if (creado !== null) {
    const profesional = profesionales.find(
      (item) => item.id === creado.profesional_id,
    );
    const prestacion = prestaciones.find(
      (item) => item.id === creado.prestacion_id,
    );
    const sillon = sillones.find((item) => item.id === creado.sillon_id);
    return (
      <section>
        <h1 className="app-title">Nuevo turno</h1>
        <Card>
          <h2>Turno creado</h2>
          <EstadoBadge status="pendiente" />
          <dl>
            <dt>Paciente</dt>
            <dd>{pacienteElegido?.nombre ?? creado.paciente_id}</dd>
            <dt>Profesional</dt>
            <dd>{profesional?.nombre ?? creado.profesional_id}</dd>
            <dt>Prestación</dt>
            <dd>{prestacion?.nombre ?? creado.prestacion_id}</dd>
            <dt>Sillón</dt>
            <dd>{sillon?.nombre ?? creado.sillon_id}</dd>
            <dt>Inicio</dt>
            <dd>{aTextoFecha(new Date(creado.inicio))}</dd>
            <dt>Fin</dt>
            <dd>{aTextoFecha(new Date(creado.fin))}</dd>
          </dl>
          <Button onClick={crearOtro} variant="secondary">
            Crear otro
          </Button>
        </Card>
      </section>
    );
  }

  return (
    <section>
      <h1 className="app-title">Nuevo turno</h1>
      <form noValidate onSubmit={(evento) => void handleSubmit(confirmar)(evento)}>
        <input type="hidden" {...register("paciente_id")} />
        <TextField
          error={errors.paciente_id?.message}
          label="Paciente"
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar por nombre o DNI"
          value={busqueda}
        />
        {busqueda.trim().length > 0 ? (
          pacientes.isPending ? (
            <p>Cargando pacientes…</p>
          ) : resultados.length === 0 ? (
            <p>No hay pacientes para esa búsqueda.</p>
          ) : (
            <ul>
              {resultados.map((paciente) => (
                <li key={paciente.id}>
                  <Button onClick={() => elegirPaciente(paciente)} variant="ghost">
                    {`${paciente.nombre} — DNI ${paciente.dni}`}
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {pacienteElegido !== null ? (
          <p>
            {`Paciente elegido: ${pacienteElegido.nombre}`}{" "}
            <Button onClick={quitarPaciente} variant="ghost">
              Quitar
            </Button>
          </p>
        ) : null}
        <Select
          error={errors.profesional_id?.message}
          label="Profesional"
          options={[
            { label: "Elegí un profesional.", value: "" },
            ...profesionales.map((profesional) => ({
              label: profesional.nombre,
              value: profesional.id,
            })),
          ]}
          {...register("profesional_id")}
        />
        <Select
          error={errors.prestacion_id?.message}
          label="Prestación"
          options={[
            { label: "Elegí una prestación.", value: "" },
            ...prestaciones.map((prestacion) => ({
              label: `${prestacion.nombre} (${prestacion.duracion_min} min)`,
              value: prestacion.id,
            })),
          ]}
          {...register("prestacion_id")}
        />
        <Select
          error={errors.sillon_id?.message}
          label="Sillón"
          options={[
            { label: "Elegí un sillón.", value: "" },
            ...sillones.map((sillon) => ({ label: sillon.nombre, value: sillon.id })),
          ]}
          {...register("sillon_id")}
        />
        <TextField
          error={errors.inicio?.message}
          label="Inicio"
          type="datetime-local"
          {...register("inicio")}
        />
        {finEstimado !== null ? <p>{`Fin estimado: ${aTextoFecha(finEstimado)}`}</p> : null}
        {fueraDeHorario && fallo?.causa !== "horario" ? (
          <p>Está fuera del horario de atención del profesional.</p>
        ) : null}
        {hayBloqueo && fallo?.causa !== "bloqueo" ? <p>Hay un bloqueo en ese horario.</p> : null}
        {catalogoFallo ? <p role="alert">No se pudo cargar el catálogo.</p> : null}
        {fallo !== null ? (
          <>
            <p role="alert">{fallo.mensaje}</p>
            {fallo.detalle !== null ? <p>{fallo.detalle}</p> : null}
          </>
        ) : null}
        <Button disabled={crear.isPending} type="submit">
          {crear.isPending ? "Creando…" : "Crear turno"}
        </Button>
      </form>
    </section>
  );
}
