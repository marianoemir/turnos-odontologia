import { afterEach, describe, expect, it, vi } from "vitest";

describe("API_BASE_URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("usa el valor definido en VITE_API_BASE_URL", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:9000");
    vi.resetModules();

    const { API_BASE_URL } = await import("./config");

    expect(API_BASE_URL).toBe("http://localhost:9000");
  });

  it("cae en /api cuando VITE_API_BASE_URL no está definido", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.resetModules();

    const { API_BASE_URL } = await import("./config");

    expect(API_BASE_URL).toBe("/api");
  });
});
