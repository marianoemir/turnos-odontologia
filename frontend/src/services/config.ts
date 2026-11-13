const rawBaseUrl = import.meta.env.VITE_API_BASE_URL;

/**
 * Prefijo de la API. `VITE_API_BASE_URL` se sustituye en tiempo de build; el
 * default `/api` lo resuelven el proxy de Vite en desarrollo y nginx en el
 * contenedor (design D1/D2).
 */
export const API_BASE_URL: string =
  typeof rawBaseUrl === "string" && rawBaseUrl.length > 0 ? rawBaseUrl : "/api";
