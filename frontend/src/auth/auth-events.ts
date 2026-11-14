export interface AuthHandlers {
  onForbidden: () => void;
  onUnauthorized: () => void;
}

let handlers: AuthHandlers | null = null;

export function setAuthHandlers(nextHandlers: AuthHandlers): () => void {
  handlers = nextHandlers;
  return () => {
    if (handlers === nextHandlers) handlers = null;
  };
}

export function notifyUnauthorized(): void {
  handlers?.onUnauthorized();
}

export function notifyForbidden(): void {
  handlers?.onForbidden();
}
