import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://localhost:8000";

  return {
    plugins: [react()],
    // Contraparte de desarrollo del `location /api/` de nginx (design D1, D3):
    // mismo prefijo y mismo rewrite, que deja `/api/health` como `/health`.
    server: {
      proxy: {
        "/api": {
          target: apiProxyTarget,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
})
