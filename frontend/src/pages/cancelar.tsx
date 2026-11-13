import { useParams } from "react-router-dom";

/**
 * Pantalla placeholder de C-13 para `/cancelar/:token` (design D10).
 *
 * Ruta pública del paciente: en 4.6 pasa a vivir bajo el layout público.
 */
export default function CancelarPage() {
  const { token } = useParams();

  return (
    <section>
      <h1 className="app-title">Cancelar turno</h1>
      {token ? <p>Token {token}</p> : null}
      <p>Pantalla pendiente.</p>
    </section>
  );
}
