/**
 * Layout de sección de C-15 para `/catalogo/*` (design D3).
 *
 * Reemplaza el placeholder de C-13: encabezado de sección con tabs a las seis
 * subrutas y `<Outlet/>` para la sección activa. Cada subruta renderiza su
 * pantalla real (grupos 2–7).
 */
import { NavLink, Outlet } from "react-router-dom";

const SECCIONES: { ruta: string; titulo: string }[] = [
  { ruta: "/catalogo/pacientes", titulo: "Pacientes" },
  { ruta: "/catalogo/profesionales", titulo: "Profesionales" },
  { ruta: "/catalogo/sillones", titulo: "Sillones" },
  { ruta: "/catalogo/prestaciones", titulo: "Prestaciones" },
  { ruta: "/catalogo/horarios", titulo: "Horarios" },
  { ruta: "/catalogo/bloqueos", titulo: "Bloqueos" },
];

export default function CatalogoPage() {
  return (
    <section>
      <h1 className="app-title">Catálogo</h1>
      <nav aria-label="Secciones de catálogo">
        {SECCIONES.map((seccion) => (
          <NavLink key={seccion.ruta} to={seccion.ruta}>
            {seccion.titulo}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </section>
  );
}
