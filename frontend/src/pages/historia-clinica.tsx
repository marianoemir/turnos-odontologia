import { useParams } from "react-router-dom";

import { EmptyState } from "../components/empty-state";
import { Skeleton } from "../components/skeleton";
import {
  clasificar404HistoriaClinica,
  useHistoriaPorPaciente,
  useOdontogramaPaciente,
  usePlanesPorPaciente,
} from "../services/hc";
import type { ApiError } from "../types/errors";
import {
  HistoriaClinicaCabeceraCrear,
  HistoriaClinicaCabeceraExistente,
} from "./historia-clinica-cabecera";
import { OdontogramaSection } from "./historia-clinica-odontograma";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esUuidValido(valor: string | undefined): valor is string {
  return typeof valor === "string" && UUID_REGEX.test(valor);
}

function HistoriaClinicaValida({ pacienteId }: { pacienteId: string }) {
  const hc = useHistoriaPorPaciente(pacienteId);
  const odonto = useOdontogramaPaciente(pacienteId);
  const planes = usePlanesPorPaciente(pacienteId);

  const cargando = hc.isPending || odonto.isPending || planes.isPending;

  const errores = [hc.error, odonto.error, planes.error].filter(
    (error): error is ApiError => error != null,
  );
  const errorHc = hc.error as ApiError | null;
  const clasificacionHc404 =
    hc.isError && errorHc?.status === 404
      ? clasificar404HistoriaClinica(errorHc)
      : null;
  const pacienteInexistente = clasificacionHc404 === "paciente_inexistente";
  const sinHistoria = clasificacionHc404 === "sin_historia";

  const accesoDenegado = errores.some((error) => error.status === 403);
  const hayErrorGenerico =
    !pacienteInexistente &&
    !sinHistoria &&
    (hc.isError || odonto.isError || planes.isError);

  return (
    <section>
      <h1 className="app-title">Historia clínica</h1>
      <p>Paciente {pacienteId}</p>

      {hc.isSuccess ? (
        <HistoriaClinicaCabeceraExistente historia={hc.data} />
      ) : sinHistoria ? (
        <HistoriaClinicaCabeceraCrear pacienteId={pacienteId} />
      ) : null}

      <OdontogramaSection observaciones={odonto.data ?? []} />

      {cargando ? <Skeleton aria-label="Cargando historia clínica" /> : null}

      {pacienteInexistente ? (
        <p role="alert">Paciente inexistente.</p>
      ) : accesoDenegado ? (
        <p role="alert">Acceso denegado.</p>
      ) : hayErrorGenerico ? (
        <EmptyState
          title="No se pudo cargar la historia clínica"
          description="Ocurrió un error al consultar la información clínica."
        />
      ) : null}
    </section>
  );
}

export default function HistoriaClinicaPage() {
  const { pacienteId } = useParams();

  if (!esUuidValido(pacienteId)) {
    return (
      <section>
        <h1 className="app-title">Historia clínica</h1>
        <p>Identificador de paciente inválido.</p>
      </section>
    );
  }

  return <HistoriaClinicaValida pacienteId={pacienteId} />;
}
