import { useContext } from "react";

import { SessionContext, type SessionContextValue } from "./session-context-value";

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (context === null) {
    throw new Error("useSession debe usarse dentro de SessionProvider.");
  }
  return context;
}
