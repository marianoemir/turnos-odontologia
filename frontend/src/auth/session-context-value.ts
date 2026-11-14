import { createContext } from "react";

import type { Session } from "./session";

export interface SessionContextValue {
  session: Session | null;
  startSession: (session: Session) => void;
  endSession: () => void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);
