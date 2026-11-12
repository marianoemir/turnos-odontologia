import { useParams } from "react-router-dom";

/**
 * Pantalla placeholder de C-13 para `/reservar/:profesional` (design D10).
 *
 * Ruta pública del paciente: en 4.6 pasa a vivir bajo el layout público.
 */
export default function ReservarPage() {
  const { profesional } = useParams();

  return (
    <section>
      <h1 className="app-title">Reservar turno</h1>
      {profesional ? <p>Profesional {profesional}</p> : null}
      <p>Pantalla pendiente.</p>
    </section>
  );
}
