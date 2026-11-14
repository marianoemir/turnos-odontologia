/**
 * Sucursal activa de solo lectura de `/admin` y `/admin/sucursales` (C-22, task
 * 4.3).
 *
 * La sucursal activa es el claim `sucursal_id` del token: el backend ignora
 * `X-Sucursal-Id` y no hay endpoint de cambio, por eso la UI solo la muestra,
 * con el nombre resuelto contra `GET /sucursales` (inactivas incluidas). Cambiar
 * de sucursal es cerrar la sesión y volver a entrar por `/login`, donde C-14 ya
 * pide `sucursal_id` si el usuario tiene varias. Nunca modifica la sesión ni
 * envía `X-Sucursal-Id`. La autorización real es del backend.
 */
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useSession } from "../auth/use-session";
import { Button } from "../components/button";
import { useSucursales } from "../services/admin";

export function SucursalActiva() {
  const { session, endSession } = useSession();
  const navigate = useNavigate();
  const sucursales = useSucursales(true);
  const sucursalId = session?.sucursalId ?? null;

  function cambiarDeSucursal(): void {
    endSession();
    void navigate("/login", { replace: true });
  }

  let estado: ReactNode;
  if (sucursalId === null) {
    estado = <p>Sin sucursal asociada (sin filtro).</p>;
  } else if (sucursales.isError) {
    estado = <p>No se pudo cargar el nombre de la sucursal.</p>;
  } else if (sucursales.isPending) {
    estado = <p>Cargando sucursal…</p>;
  } else {
    const activa = (sucursales.data ?? []).find((s) => s.id === sucursalId);
    estado = (
      <p>
        Sucursal activa: <strong>{activa?.nombre ?? "Sucursal desconocida"}</strong>
      </p>
    );
  }

  return (
    <div>
      {estado}
      <Button variant="secondary" onClick={cambiarDeSucursal}>
        Cambiar de sucursal
      </Button>
    </div>
  );
}
