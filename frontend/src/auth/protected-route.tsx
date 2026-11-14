import { Navigate, Outlet, useLocation } from "react-router-dom";

import { canNavigate } from "./navigation";
import { useSession } from "./use-session";

export function ProtectedRoute() {
  const { session } = useSession();
  const location = useLocation();

  if (session === null) {
    return (
      <Navigate
        replace
        to={`/login?returnTo=${encodeURIComponent(location.pathname)}`}
      />
    );
  }

  if (!canNavigate(session.rol, location.pathname)) {
    return (
      <Navigate
        replace
        state={{ notice: "Permiso insuficiente." }}
        to="/agenda"
      />
    );
  }

  return <Outlet />;
}
