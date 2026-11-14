import { ApiError } from "../types/errors";
import { apiRequest } from "../services/http";
import { ROLES, type Rol, type Session } from "./session";

interface LoginResponse {
  token: string;
  rol: string;
  usuario: string;
  sucursal_id?: string | null;
}

function isRol(value: string): value is Rol {
  return (ROLES as readonly string[]).includes(value);
}

export async function login(
  dni: string,
  password: string,
  sucursalId?: string,
): Promise<Session> {
  const response = await apiRequest<LoginResponse>("/login", {
    method: "POST",
    body:
      sucursalId === undefined
        ? { dni, password }
        : { dni, password, sucursal_id: sucursalId },
    publica: true,
  });
  if (!isRol(response.rol) || response.token.length === 0 || response.usuario.length === 0) {
    throw new ApiError({
      kind: "servidor",
      mensaje: "El servidor devolvió una sesión inválida.",
    });
  }
  return {
    token: response.token,
    rol: response.rol,
    usuario: response.usuario,
    sucursalId: response.sucursal_id ?? null,
  };
}
