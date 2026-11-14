import type { Rol } from "./session";

const INTERNAL_PATHS = [
  "/",
  "/turnos/nuevo",
  "/agenda",
  "/catalogo/",
  "/lista-espera",
  "/hc/",
  "/caja",
  "/admin",
] as const;

export function isInternalPath(pathname: string): boolean {
  return INTERNAL_PATHS.some(
    (path) => pathname === path || (path.endsWith("/") && pathname.startsWith(path)),
  );
}

export function canNavigate(rol: Rol, pathname: string): boolean {
  return rol === "recepcion" || pathname === "/agenda";
}

export function safeReturnTo(value: string | null, rol: Rol): string {
  return value !== null && isInternalPath(value) && canNavigate(rol, value)
    ? value
    : "/agenda";
}
