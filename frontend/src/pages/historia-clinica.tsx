import { useParams } from "react-router-dom";

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
import { EntradasClinicasSection } from "./historia-clinica-entradas";
import { OdontogramaSection } from "./historia-clinica-odontograma";
import { PlanesSection } from "./historia-clinica-planes";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esUuidValido(valor: string | undefined): valor is string {
  return typeof valor === "string" && UUID_REGEX.test(valor);
}

function HistoriaClinicaValida({ pacienteId }: { pacienteId: string }) {
  const hc = useHistoriaPorPaciente(pacienteId);
  const odonto = useOdontogramaPaciente(pacienteId);
  const planes = usePlanesPorPaciente(pacienteId);

  const errorHc = hc.error as ApiError | null;
  const clasificacionHc404 =
    hc.isError && errorHc?.status === 404
      ? clasificar404HistoriaClinica(errorHc)
      : null;
  const pacienteInexistente = clasificacionHc404 === "paciente_inexistente";
  const sinHistoria = clasificacionHc404 === "sin_historia";
  const errorHcPropio = hc.isError && !pacienteInexistente && !sinHistoria;

  return (
    <section>
      <h1 className="app-title">Historia clínica</h1>
      <p>Paciente {pacienteId}</p>

      {hc.isPending ? (
        <section aria-label="Cabecera de historia clínica">
          <h2>Cabecera</h2>
          <Skeleton aria-label="Cargando cabecera" />
        </section>
      ) : null}

      {hc.isSuccess ? (
        <>
          <HistoriaClinicaCabeceraExistente historia={hc.data} />
          <EntradasClinicasSection hcId={hc.data.id} />
        </>
      ) : null}

      {sinHistoria ? <HistoriaClinicaCabeceraCrear pacienteId={pacienteId} /> : null}

      {errorHcPropio ? (
        <section aria-label="Cabecera de historia clínica">
          <h2>Cabecera</h2>
          <p role="alert">
            {errorHc?.message ?? errorHc?.detalle ?? "No se pudo cargar la historia clínica."}
          </p>
        </section>
      ) : null}

      {pacienteInexistente ? <p role="alert">Paciente inexistente.</p> : null}

      <OdontogramaSection
        pacienteId={pacienteId}
        observaciones={odonto.data ?? []}
        planes={planes.data ?? []}
        isPending={odonto.isPending}
        isError={odonto.isError}
        error={(odonto.error as ApiError | null) ?? null}
      />

      <PlanesSection
        planes={planes.data}
        isPending={planes.isPending}
        isError={planes.isError}
        error={(planes.error as ApiError | null) ?? null}
      />
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
