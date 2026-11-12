/**
 * Shell interno de la aplicación — traducido de
 * design-system/components.html §Navegación (1016-1049), con los destinos que
 * fija el design D12. Los estilos viven en `shell.css` (mismas clases y
 * valores que la referencia, sin definir tokens).
 *
 * `/turnos/nuevo`, `/lista-espera` y `/admin` no tienen entrada en la
 * navegación aprobada (Q4): se declaran en la tabla de rutas, no acá.
 */
import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";

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

export default function Shell() {
  return (
    <div className="app-shell">
      <nav className="side" aria-label="Navegación principal">
        <div className="side__brand">
          <span>{NOMBRE_MARCA}</span>
        </div>
        <div>
          <p className="side__label">Operación</p>
          <div className="side__group">
            {ENLACES.map(({ nombre, destino, icono }) => (
              <NavLink key={destino} className="side__link" to={destino}>
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
            ))}
          </div>
        </div>
      </nav>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
