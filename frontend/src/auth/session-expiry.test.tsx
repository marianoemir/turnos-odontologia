import { act, cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearSession, getSession, setSession } from "./session";
import { SessionProvider } from "./session-context";
import { routes } from "../app/router";

function tokenExpiringAt(exp: number): string {
  return `header.${btoa(JSON.stringify({ exp })).replaceAll("=", "")}.signature`;
}

afterEach(() => {
  cleanup();
  clearSession();
  vi.useRealTimers();
});

describe("vencimiento de sesión", () => {
  it("limpia la sesión y navega al login cuando vence exp, sin refresh", async () => {
    vi.useFakeTimers();
    setSession({
      token: tokenExpiringAt(Math.floor(Date.now() / 1000) + 1),
      rol: "recepcion",
      usuario: "usuario-ficticio",
      sucursalId: null,
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/agenda"] });

    render(
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>,
    );
    expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(getSession()).toBeNull();
    expect(screen.getByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
  });
});
