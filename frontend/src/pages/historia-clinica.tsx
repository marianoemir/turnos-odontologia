import { useParams } from "react-router-dom";

/**
 * Pantalla placeholder de C-13 para `/hc/:pacienteId` (design D10).
 *
 * Muestra el parámetro para probar el binding: la historia clínica real es de
 * un change posterior.
 */
export default function HistoriaClinicaPage() {
  const { pacienteId } = useParams();

  return (
    <section>
      <h1 className="app-title">Historia clínica</h1>
      {pacienteId ? <p>Paciente {pacienteId}</p> : null}
      <p>Pantalla pendiente.</p>
    </section>
  );
}
