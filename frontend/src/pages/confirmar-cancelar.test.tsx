import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routes } from "../app/router";
import { clearSession, getSession, setSession } from "../auth/session";
import { SessionProvider } from "../auth/session-context";
import { normalizeApiError } from "../services/api-error";
import { apiRequest } from "../services/http";
import { ApiError } from "../types/errors";

vi.mock("../services/http", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

const TOKEN_FICTICIO = "token-ficticio-c21-grupo5";
const TURNO_ID = "55555555-5555-4555-8555-555555555555";
const INICIO = "2026-11-20T09:00:00-03:00";

beforeEach(() => {
  apiRequestMock.mockReset();
  clearSession();
});

afterEach(() => {
  cleanup();
  clearSession();
});

function renderEn(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <SessionProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </SessionProvider>,
  );
  return { router };
}

function llamadasPostToken(): Array<[string, unknown]> {
  return apiRequestMock.mock.calls.filter(
    ([, opciones]) => (opciones as { method?: string } | undefined)?.method === "POST",
  ) as Array<[string, unknown]>;
}

function espiarConsola() {
  const spies = [
    vi.spyOn(console, "log").mockImplementation(() => {}),
    vi.spyOn(console, "info").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
    vi.spyOn(console, "error").mockImplementation(() => {}),
    vi.spyOn(console, "debug").mockImplementation(() => {}),
  ];
  return {
    afirmarSinToken() {
      for (const spy of spies) {
        for (const llamada of spy.mock.calls) {
          expect(JSON.stringify(llamada)).not.toContain(TOKEN_FICTICIO);
        }
      }
    },
    restaurar() {
      for (const spy of spies) {
        spy.mockRestore();
      }
    },
  };
}

async function conEspiaConsola<T>(
  ejecutar: () => Promise<T>,
): Promise<T> {
  const espia = espiarConsola();
  try {
    const resultado = await ejecutar();
    espia.afirmarSinToken();
    return resultado;
  } finally {
    espia.restaurar();
  }
}

function esperarTokenAusente(): void {
  expect(document.body.textContent ?? "").not.toContain(TOKEN_FICTICIO);
}

const PANTALLAS = [
  {
    path: `/confirmar/${TOKEN_FICTICIO}`,
    heading: "Confirmar turno",
    accion: "Confirmar turno",
    rutaApi: `/confirmar/${TOKEN_FICTICIO}`,
    resultadoExito: "confirmado" as const,
    textoExito: /confirmado/i,
    accionPreviaReal: "confirmar" as const,
  },
  {
    path: `/cancelar/${TOKEN_FICTICIO}`,
    heading: "Cancelar turno",
    accion: "Cancelar turno",
    rutaApi: `/cancelar/${TOKEN_FICTICIO}`,
    resultadoExito: "cancelado" as const,
    textoExito: /cancelado/i,
    accionPreviaReal: "cancelar" as const,
  },
];

describe("resolución pública por token (C-21 grupo 5)", () => {
  it("abrir el enlace no ejecuta la acción hasta que la persona la confirma", async () => {
    for (const pantalla of PANTALLAS) {
      renderEn(pantalla.path);

      expect(
        await screen.findByRole("heading", { name: pantalla.heading }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: pantalla.accion }),
      ).toBeInTheDocument();
      // Estado informativo inicial (no éxito/error final).
      expect(screen.getByText(/cuando estés listo/i)).toBeInTheDocument(); // control positivo: estado inicial
      expect(screen.queryByText(/turno confirmado/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/turno cancelado/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      esperarTokenAusente();
      expect(llamadasPostToken()).toHaveLength(0);
      expect(getSession()).toBeNull();
      expect(apiRequestMock).not.toHaveBeenCalled();

      cleanup();
      apiRequestMock.mockReset();
      clearSession();
    }
  });

  it("Confirmación o cancelación exitosa", async () => {
    const user = userEvent.setup();
    for (const pantalla of PANTALLAS) {
      await conEspiaConsola(async () => {
        apiRequestMock.mockResolvedValue({
          resultado: pantalla.resultadoExito,
          turno_id: TURNO_ID,
          inicio: INICIO,
        });
        renderEn(pantalla.path);
        esperarTokenAusente(); // inicial

        await user.click(
          await screen.findByRole("button", { name: pantalla.accion }),
        );

        await waitFor(() => expect(llamadasPostToken()).toHaveLength(1));
        expect(llamadasPostToken()[0][0]).toBe(pantalla.rutaApi);
        expect(llamadasPostToken()[0][1]).toMatchObject({
          method: "POST",
          publica: true,
        });
        expect(
          await screen.findByRole("heading", {
            name:
              pantalla.resultadoExito === "confirmado"
                ? "Turno confirmado"
                : "Turno cancelado",
          }),
        ).toBeInTheDocument(); // control positivo: éxito
        expect(screen.getByText(TURNO_ID)).toBeInTheDocument();
        esperarTokenAusente(); // estado final éxito
        // Solo campos del contrato en pantalla (sin datos personales de terceros).
        expect(screen.queryByText(/nombre/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/dni/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/paciente/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/contacto/i)).not.toBeInTheDocument();
      });

      cleanup();
      apiRequestMock.mockReset();
      clearSession();
    }
  });

  it("Token expirado o ya usado", async () => {
    const user = userEvent.setup();

    // expirado (200)
    for (const pantalla of PANTALLAS) {
      await conEspiaConsola(async () => {
        apiRequestMock.mockResolvedValue({
          resultado: "expirado",
          turno_id: TURNO_ID,
          inicio: INICIO,
        });
        renderEn(pantalla.path);
        esperarTokenAusente(); // inicial
        await user.click(
          await screen.findByRole("button", { name: pantalla.accion }),
        );

        expect(
          await screen.findByRole("heading", { name: "Enlace expirado" }),
        ).toBeInTheDocument(); // control positivo
        expect(screen.getByText(/no se pudo/i)).toBeInTheDocument();
        esperarTokenAusente(); // estado final expirado
        expect(screen.queryByText(pantalla.textoExito)).not.toBeInTheDocument();
        expect(screen.queryByText(/no encontrado/i)).not.toBeInTheDocument();
      });

      cleanup();
      apiRequestMock.mockReset();
      clearSession();
    }

    // ya usado (409) con accion_previa real (confirmar/cancelar)
    for (const pantalla of PANTALLAS) {
      await conEspiaConsola(async () => {
        const err = new ApiError({
          kind: "conflicto",
          status: 409,
          causa: "ya_usado",
          mensaje: "el token ya se uso",
          detalle: "el token ya se uso",
        });
        (err as ApiError & { accion_previa?: string }).accion_previa =
          pantalla.accionPreviaReal;
        apiRequestMock.mockRejectedValue(err);
        renderEn(pantalla.path);
        esperarTokenAusente(); // inicial
        await user.click(
          await screen.findByRole("button", { name: pantalla.accion }),
        );

        expect(
          await screen.findByRole("heading", { name: "Enlace ya usado" }),
        ).toBeInTheDocument(); // control positivo
        expect(screen.getByText(/Acción previa:/i)).toBeInTheDocument(); // control positivo
        expect(
          screen.getByText(
            (_, el) =>
              el?.tagName.toLowerCase() === "strong" &&
              el.textContent === pantalla.accionPreviaReal,
          ),
        ).toBeInTheDocument(); // (a) acción previa real visible
        esperarTokenAusente(); // estado final ya usado con acción previa
        expect(screen.queryByText(/no encontrado/i)).not.toBeInTheDocument();
        expect(
          screen.queryByRole("heading", {
            name:
              pantalla.resultadoExito === "confirmado"
                ? "Turno confirmado"
                : "Turno cancelado",
          }),
        ).not.toBeInTheDocument();
      });

      cleanup();
      apiRequestMock.mockReset();
      clearSession();
    }

    // ya usado (409) error normalizado real, sin accion_previa: muestra heading y message
    for (const pantalla of PANTALLAS) {
      await conEspiaConsola(async () => {
        const err = normalizeApiError(409, {
          detail: {
            causa: "ya_usado",
            detalle: `el token ya se uso para ${pantalla.accionPreviaReal}`,
            accion_previa: pantalla.accionPreviaReal,
          },
        });
        expect(
          (err as ApiError & { accion_previa?: string }).accion_previa,
        ).toBeUndefined(); // control: normalizeApiError descarta accion_previa
        apiRequestMock.mockRejectedValue(err);
        renderEn(pantalla.path);
        esperarTokenAusente(); // inicial
        await user.click(
          await screen.findByRole("button", { name: pantalla.accion }),
        );

        expect(
          await screen.findByRole("heading", { name: "Enlace ya usado" }),
        ).toBeInTheDocument(); // control positivo
        expect(
          screen.getByText(`el token ya se uso para ${pantalla.accionPreviaReal}`),
        ).toBeInTheDocument(); // (b) message del ApiError visible
        esperarTokenAusente(); // estado final ya usado sin acción previa
      });

      cleanup();
      apiRequestMock.mockReset();
      clearSession();
    }
  });

  it("Token inexistente o inválido y errores de transporte", async () => {
    const user = userEvent.setup();

    const casosError = [
      {
        nombre: "404",
        error: new ApiError({
          kind: "no_encontrado",
          status: 404,
          mensaje: "Token no encontrado",
          detalle: "Token no encontrado",
        }),
        texto: /no encontrado/i,
        heading: "Enlace no encontrado",
      },
      {
        nombre: "422",
        error: new ApiError({
          kind: "validacion",
          status: 422,
          mensaje: "Token inválido",
          detalle: "Token inválido",
        }),
        texto: /inv[aá]lido|error/i,
        heading: "Enlace inválido",
      },
      {
        nombre: "red",
        error: new ApiError({
          kind: "red",
          status: null,
          mensaje: "No se pudo conectar con el servidor.",
        }),
        texto: /no se pudo conectar|error/i,
        heading: null as string | null,
      },
      {
        nombre: "timeout",
        error: new ApiError({
          kind: "timeout",
          status: null,
          mensaje: "La solicitud superó el tiempo de espera.",
        }),
        texto: /tiempo de espera|error/i,
        heading: null as string | null,
      },
    ];

    for (const pantalla of PANTALLAS) {
      for (const caso of casosError) {
        await conEspiaConsola(async () => {
          setSession({
            token: "jwt-de-prueba",
            rol: "recepcion",
            usuario: "usuario-ficticio",
            sucursalId: null,
          });
          apiRequestMock.mockRejectedValueOnce(caso.error);
          const { router } = renderEn(pantalla.path);
          esperarTokenAusente(); // inicial

          await user.click(
            await screen.findByRole("button", { name: pantalla.accion }),
          );

          if (caso.heading) {
            expect(
              await screen.findByRole("heading", { name: caso.heading }),
            ).toBeInTheDocument(); // control positivo
          } else {
            expect(await screen.findByRole("alert")).toBeInTheDocument(); // control positivo transporte
          }
          expect(screen.getByText(caso.texto)).toBeInTheDocument();
          esperarTokenAusente(); // estado final error
          expect(router.state.location.pathname).toBe(pantalla.path);
          expect(getSession()?.token).toBe("jwt-de-prueba");
          expect(screen.queryByText(pantalla.textoExito)).not.toBeInTheDocument();

          // reintento manual disponible en fallo de transporte
          if (caso.nombre === "red" || caso.nombre === "timeout") {
            apiRequestMock.mockResolvedValueOnce({
              resultado: pantalla.resultadoExito,
              turno_id: TURNO_ID,
              inicio: INICIO,
            });
            const reintentar = screen.getByRole("button", {
              name: /reintentar|intentar/i,
            });
            await user.click(reintentar);
            expect(
              await screen.findByRole("heading", {
                name:
                  pantalla.resultadoExito === "confirmado"
                    ? "Turno confirmado"
                    : "Turno cancelado",
              }),
            ).toBeInTheDocument(); // control positivo tras reintento
            esperarTokenAusente(); // estado final tras reintento
          }
        });

        cleanup();
        apiRequestMock.mockReset();
        clearSession();
      }
    }
  });
});
