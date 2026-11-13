/**
 * Tabla de rutas de la aplicación (design D10, D11).
 *
 * Declara las 11 rutas de la spec de C-13 y resuelve cada una a su pantalla
 * registrada. Las rutas internas viven bajo el shell con navegación; las tres
 * rutas del paciente viven bajo el layout público, sin navegación interna.
 *
 * Las rutas con parámetro exponen el segmento por `useParams()` en la pantalla
 * correspondiente.
 */
import type { RouteObject } from "react-router-dom";

import AdminPage from "../pages/admin";
import AgendaPage from "../pages/agenda";
import CajaPage from "../pages/caja";
import CancelarPage from "../pages/cancelar";
import CatalogoPage from "../pages/catalogo";
import ConfirmarPage from "../pages/confirmar";
import HistoriaClinicaPage from "../pages/historia-clinica";
import InicioPage from "../pages/inicio";
import ListaEsperaPage from "../pages/lista-espera";
import ReservarPage from "../pages/reservar";
import TurnoNuevoPage from "../pages/turno-nuevo";
import NotFound from "./not-found";
import PublicLayout from "./public-layout";
import Shell from "./shell";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <InicioPage /> },
      { path: "turnos/nuevo", element: <TurnoNuevoPage /> },
      { path: "agenda", element: <AgendaPage /> },
      { path: "catalogo/*", element: <CatalogoPage /> },
      { path: "lista-espera", element: <ListaEsperaPage /> },
      { path: "hc/:pacienteId", element: <HistoriaClinicaPage /> },
      { path: "caja", element: <CajaPage /> },
      { path: "admin", element: <AdminPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
  {
    element: <PublicLayout />,
    children: [
      { path: "/reservar/:profesional", element: <ReservarPage /> },
      { path: "/confirmar/:token", element: <ConfirmarPage /> },
      { path: "/cancelar/:token", element: <CancelarPage /> },
    ],
  },
];
