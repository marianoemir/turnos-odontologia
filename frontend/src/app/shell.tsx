/**
 * Shell interno de la aplicación — traducido de
 * design-system/components.html §Navegación (1016-1049), con los destinos que
 * fija el design D12. Los estilos viven en `shell.css` (mismas clases y
 * valores que la referencia, sin definir tokens).
 *
 * `/turnos/nuevo` y `/lista-espera` no tienen entrada en la navegación
 * aprobada (Q4): se declaran en la tabla de rutas, no acá. `/admin` se enlaza
 * en un grupo «Administración» aparte, fuera de «Operación» y solo para el rol
 * `admin` (C-22, opción (c) de C-13). Que el enlace no se muestre a otros
 * roles es comodidad de la interfaz: la autorización real es del backend.
 */
import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useSession } from "../auth/use-session";
import ErrorBoundary from "./error-boundary";
import "./shell.css";

/**
 * Nombre de marca visible. El design system lo mantiene provisorio en
 * `design-system/brand.js:14`; en React va en esta constante de la app
 * (`design-system/README.md:75`).
 */
export const NOMBRE_MARCA = "Agenda Odontológica";

type Enlace = { nombre: string; destino: string; icono: ReactNode };

const ENLACES: Enlace[] = [
  {
    nombre: "Agenda",
    destino: "/agenda",
    icono: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    nombre: "Pacientes",
    destino: "/catalogo/pacientes",
    icono: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20.5c0-3.9 3.4-6.5 7.5-6.5s7.5 2.6 7.5 6.5" />
      </>
    ),
  },
  {
    nombre: "Sillones",
    destino: "/catalogo/sillones",
    icono: <path d="M5 19V9.5M12 19V5M19 19v-6" />,
  },
  {
    nombre: "Caja",
    destino: "/caja",
    icono: (
      <>
        <path d="M4.5 8.5h15v10a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" />
        <path d="M8.5 8.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2.5" />
      </>
    ),
  },
];

/** Enlace del grupo «Administración» (solo `admin`). */
const ENLACE_ADMINISTRACION: Enlace = {
  nombre: "Panel de administración",
  destino: "/admin",
  icono: (
    <>
      <path d="M12 3.5 5 6.5v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9v-5z" />
      <path d="m9.5 12 1.8 1.8 3.2-3.6" />
    </>
  ),
};

function EnlaceDelNav({ nombre, destino, icono }: Enlace) {
  return (
    <NavLink className="side__link" to={destino}>
      <svg
        className="ico"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {icono}
      </svg>
      {nombre}
    </NavLink>
  );
}

export default function Shell() {
  const { pathname } = useLocation();
  const { session } = useSession();
  const esAdmin = session?.rol === "admin";

  return (
    <div className="app-shell">
      <nav className="side" aria-label="Navegación principal">
        <div className="side__brand">
          <span>{NOMBRE_MARCA}</span>
        </div>
        <div>
          <p className="side__label">Operación</p>
          <div className="side__group">
            {ENLACES.map((enlace) => (
              <EnlaceDelNav key={enlace.destino} {...enlace} />
            ))}
          </div>
        </div>
        {esAdmin && (
          <div>
            <p className="side__label">Administración</p>
            <div className="side__group">
              <EnlaceDelNav {...ENLACE_ADMINISTRACION} />
            </div>
          </div>
        )}
      </nav>

      <main className="app-main">
        {/* `key`: si una pantalla deja el límite en error, cambiar de ruta lo
            remonta y la app se recupera sin recargar el navegador. */}
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}