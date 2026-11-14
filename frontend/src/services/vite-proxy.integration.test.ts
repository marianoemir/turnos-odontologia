import { once } from "node:events";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";

interface RequestRecibida {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
}

const requests: RequestRecibida[] = [];
let api: Server | undefined;
let ocupanteDe8000: Server | undefined;
let vite: ViteDevServer | undefined;
let origin: string;
let proxyTargetOriginal: string | undefined;
let proxyTargetSaved = false;

function escuchar(server: Server, port: number): Promise<AddressInfo> {
  return new Promise((resolver, rechazar) => {
    const alEscuchar = () => {
      server.off("error", alError);
      resolver(server.address() as AddressInfo);
    };
    const alError = (error: Error) => {
      server.off("listening", alEscuchar);
      rechazar(error);
    };

    server.once("listening", alEscuchar);
    server.once("error", alError);
    server.listen(port, "127.0.0.1");
  });
}

async function cerrar(server: Server | undefined): Promise<void> {
  if (server?.listening !== true) {
    return;
  }
  server.close();
  await once(server, "close");
}

async function ocuparPuerto8000(): Promise<Server | undefined> {
  const ocupante = createHttpServer((_request, response) => {
    response.end("occupied");
  });

  try {
    await escuchar(ocupante, 8000);
    return ocupante;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EADDRINUSE"
    ) {
      return undefined;
    }
    throw error;
  }
}

beforeAll(async () => {
  proxyTargetOriginal = process.env.VITE_API_PROXY_TARGET;
  proxyTargetSaved = true;

  ocupanteDe8000 = await ocuparPuerto8000();

  api = createHttpServer((request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });
  const apiAddress = await escuchar(api, 0);

  process.env.VITE_API_PROXY_TARGET =
    `http://127.0.0.1:${apiAddress.port}`;

  vite = await createServer({
    configFile: "vite.config.ts",
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0 },
  });
  await vite.listen();

  const address = vite.httpServer?.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (proxyTargetSaved) {
    if (proxyTargetOriginal === undefined) {
      delete process.env.VITE_API_PROXY_TARGET;
    } else {
      process.env.VITE_API_PROXY_TARGET = proxyTargetOriginal;
    }
  }

  await Promise.allSettled([
    vite?.close(),
    cerrar(api),
    cerrar(ocupanteDe8000),
  ]);
});

beforeEach(() => {
  requests.length = 0;
});

describe("proxy same-origin de Vite", () => {
  it("reescribe POST /api/login al POST /login de FastAPI", async () => {
    const response = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dni: "USUARIO-FICT-001", password: "ficticia" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(requests).toEqual([
      { method: "POST", url: "/login", authorization: undefined },
    ]);
  });

  it("reenvía el resto de /api y deja /login para el SPA", async () => {
    const protegida = await fetch(`${origin}/api/agenda`, {
      headers: { Authorization: "Bearer token-ficticio" },
    });
    const loginSpa = await fetch(`${origin}/login`);

    expect(protegida.status).toBe(200);
    expect(requests).toEqual([
      {
        method: "GET",
        url: "/agenda",
        authorization: "Bearer token-ficticio",
      },
    ]);
    expect(loginSpa.status).toBe(200);
    expect(await loginSpa.text()).toContain('<div id="root"></div>');
    expect(requests).toHaveLength(1);
  });
});
