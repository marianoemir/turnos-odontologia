/**
 * Layout público (design D10, D11).
 *
 * Presenta las tres pantallas del paciente (`/reservar/:profesional`,
 * `/confirmar/:token`, `/cancelar/:token`) sin la navegación interna del
 * shell: quien abre estos enlaces no opera la agenda, así que no corresponde
 * ofrecerle Pacientes, Sillones, Caja ni Admin. Aporta sólo el landmark
 * principal, que es lo mismo que el shell aporta a las rutas internas.
 */
import { Outlet } from "react-router-dom";

export default function PublicLayout() {
  return (
    <main>
      <Outlet />
    </main>
  );
}
