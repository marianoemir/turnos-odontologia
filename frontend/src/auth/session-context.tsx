import {
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

import {
  clearSession,
  getSession,
  setSession,
  subscribeToSession,
} from "./session";
import { SessionContext } from "./session-context-value";

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setCurrentSession] = useState(getSession);

  useEffect(() => subscribeToSession(() => setCurrentSession(getSession())), []);

  return (
    <SessionContext value={{ session, startSession: setSession, endSession: clearSession }}>
      {children}
    </SessionContext>
  );
}
