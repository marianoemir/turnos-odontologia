import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { setAuthHandlers } from "./auth-events";
import { useSession } from "./use-session";

function expirationFromToken(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (payload === undefined) return null;
    const json = atob(payload.replaceAll("-", "+").replaceAll("_", "/"));
    const value: unknown = JSON.parse(json);
    if (
      typeof value !== "object" ||
      value === null ||
      !("exp" in value) ||
      typeof value.exp !== "number"
    ) {
      return null;
    }
    return value.exp * 1_000;
  } catch {
    return null;
  }
}

const MAX_TIMEOUT_MS = 2_147_483_647;

export function SessionExpiry() {
  const { session, endSession } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const navigationNotice =
    typeof location.state === "object" &&
    location.state !== null &&
    "notice" in location.state &&
    typeof location.state.notice === "string"
      ? location.state.notice
      : null;

  useEffect(
    () =>
      setAuthHandlers({
        onUnauthorized: () => {
          endSession();
          setAuthNotice("La sesión finalizó. Volvé a ingresar.");
          navigate("/login", { replace: true });
        },
        onForbidden: () => setAuthNotice("Permiso insuficiente."),
      }),
    [endSession, navigate],
  );

  useEffect(() => {
    if (session === null) return;
    const expiration = expirationFromToken(session.token);
    if (expiration === null) return;
    let timeout: number | undefined;
    const scheduleExpiration = () => {
      const remaining = expiration - Date.now();
      if (remaining <= 0) {
        endSession();
        navigate("/login", { replace: true });
        return;
      }
      timeout = window.setTimeout(scheduleExpiration, Math.min(remaining, MAX_TIMEOUT_MS));
    };
    scheduleExpiration();
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [endSession, navigate, session]);

  return (
    <>
      {authNotice ?? navigationNotice ? (
        <p role="alert">{authNotice ?? navigationNotice}</p>
      ) : null}
      <Outlet />
    </>
  );
}
