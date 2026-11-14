export const ROLES = ["admin", "recepcion", "odontologo", "paciente"] as const;

export type Rol = (typeof ROLES)[number];

export interface Session {
  token: string;
  rol: Rol;
  usuario: string;
  sucursalId: string | null;
}

let session: Session | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function getSession(): Session | null {
  return session;
}

export function setSession(nextSession: Session): void {
  session = nextSession;
  notify();
}

export function clearSession(): void {
  session = null;
  notify();
}

export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
