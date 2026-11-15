/**
 * Tabla de rutas de la aplicación (design D10, D11).
 *
 * Declara las 11 rutas de la spec de C-13 y resuelve cada una a su pantalla
 * registrada. Las rutas internas viven bajo el shell con navegación; las tres
 * rutas del paciente viven bajo el layout público, sin navegación interna.
 *
 * Las rutas con parámetro exponen el segmento por `useParams()` en la pantalla
 * correspondiente.
 *
 * C-22: `/admin` tiene subrutas (`roles`, `sucursales` y `datos`); `/admin`
 * sigue resolviendo a su pantalla índice.
 */
import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";

import AdminPage from "../pages/admin";
import AdminDatosPage from "../pages/admin-datos";
import AdminRolesPage from "../pages/admin-roles";
import AdminSucursalesPage from "../pages/admin-sucursales";
import { SessionExpiry } from "../auth/session-expiry";
import { ProtectedRoute } from "../auth/protected-route";
import AgendaPage from "../pages/agenda";
import CajaPage from "../pages/caja";
import CancelarPage from "../pages/cancelar";
import CatalogoPage from "../pages/catalogo";
import BloqueosPage from "../pages/catalogo-bloqueos";
import PacientesPage from "../pages/catalogo-pacientes";
import HorariosPage from "../pages/catalogo-horarios";
import PrestacionesPage from "../pages/catalogo-prestaciones";
import ProfesionalesPage from "../pages/catalogo-profesionales";
import SillonesPage from "../pages/catalogo-sillones";
import ConfirmarPage from "../pages/confirmar";
import HistoriaClinicaPage from "../pages/historia-clinica";
import InicioPage from "../pages/inicio";
import ListaEsperaPage from "../pages/lista-espera";
import LoginPage from "../pages/login";
import ReservarPage from "../pages/reservar";
import TurnoNuevoPage from "../pages/turno-nuevo";
import NotFound from "./not-found";
import PublicLayout from "./public-layout";
import Shell from "./shell";

export const routes: RouteObject[] = [
  {
    element: <SessionExpiry />,
    children: [
      { path: "/login", element: <LoginPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: "/",
            element: <Shell />,
            children: [
              { index: true, element: <InicioPage /> },
              { path: "turnos/nuevo", element: <TurnoNuevoPage /> },
              { path: "agenda", element: <AgendaPage /> },
              {
                path: "catalogo/*",
                element: <CatalogoPage />,
                children: [
                  { index: true, element: <Navigate replace to="pacientes" /> },
                  {
                    path: "pacientes",
                    element: <PacientesPage />,
                  },
                  {
                    path: "profesionales",
                    element: <ProfesionalesPage />,
                  },
                  {
                    path: "sillones",
                    element: <SillonesPage />,
                  },
                  {
                    path: "prestaciones",
                    element: <PrestacionesPage />,
                  },
                  {
                    path: "horarios",
                    element: <HorariosPage />,
                  },
                  {
                    path: "bloqueos",
                    element: <BloqueosPage />,
                  },
                  { path: "*", element: <NotFound /> },
                ],
              },
              { path: "lista-espera", element: <ListaEsperaPage /> },
              { path: "hc/:pacienteId", element: <HistoriaClinicaPage /> },
              { path: "caja", element: <CajaPage /> },
              {
                path: "admin",
                children: [
                  { index: true, element: <AdminPage /> },
                  { path: "roles", element: <AdminRolesPage /> },
                  { path: "sucursales", element: <AdminSucursalesPage /> },
                  { path: "datos", element: <AdminDatosPage /> },
                ],
              },
              { path: "*", element: <NotFound /> },
            ],
          },
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
    ],
  },
];
