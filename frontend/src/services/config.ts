const rawBaseUrl = import.meta.env.VITE_API_BASE_URL;

const SAME_ORIGIN = "https://frontend.invalid";

function normalizeApiBaseUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("//")) {
    return "/api";
  }

  try {
    const url = new URL(value, SAME_ORIGIN);
    const isRelativePath = value.startsWith("/");
    const isApiPath =
      url.pathname === "/api" || url.pathname.startsWith("/api/");

    if (
      !isRelativePath ||
      url.origin !== SAME_ORIGIN ||
      !isApiPath ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      return "/api";
    }

    return url.pathname.length > 4 && url.pathname.endsWith("/")
      ? url.pathname.slice(0, -1)
      : url.pathname;
  } catch {
    return "/api";
  }
}

/**
 * Prefijo de la API. `VITE_API_BASE_URL` se sustituye en tiempo de build; el
 * default `/api` lo resuelven el proxy de Vite en desarrollo y nginx en el
 * contenedor (design D1/D2).
 */
export const API_BASE_URL = normalizeApiBaseUrl(rawBaseUrl);
