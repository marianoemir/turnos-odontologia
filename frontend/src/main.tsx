import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import "./index.css";
import "../design-system/tokens.css";
import { routes } from "./app/router";
import { queryClient } from "./app/query-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "./auth/session-context";

const router = createBrowserRouter(routes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
