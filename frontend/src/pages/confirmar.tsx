import { useParams } from "react-router-dom";

import { useNoindex } from "../app/use-noindex";

/**
 * Pantalla placeholder de C-13 para `/confirmar/:token` (design D10).
 *
 * Ruta pública del paciente: en 4.6 pasa a vivir bajo el layout público.
 * C-21 (2.2): declara `noindex` mientras la pantalla está montada.
 */
export default function ConfirmarPage() {
  const { token } = useParams();
  useNoindex();

  return (
    <section>
      <h1 className="app-title">Confirmar turno</h1>
      {token ? <p>Token {token}</p> : null}
      <p>Pantalla pendiente.</p>
    </section>
  );
}
