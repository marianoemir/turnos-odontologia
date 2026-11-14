/**
 * Índice de `/admin` (C-22): muestra la sucursal activa de solo lectura. Las
 * pantallas de roles, sucursales y datos son rutas hijas. La autorización real
 * es del backend.
 */
import { SucursalActiva } from "./admin-sucursal-activa";

export default function AdminPage() {
  return (
    <section>
      <h1 className="app-title">Administración</h1>
      <SucursalActiva />
    </section>
  );
}
