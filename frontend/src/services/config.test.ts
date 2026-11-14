import { afterEach, describe, expect, it, vi } from "vitest";

describe("API_BASE_URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it.each([
    ["vacía", ""],
    ["absoluta", "https://externo.example/api"],
    ["protocol-relative", "//externo.example/api"],
    ["relativa fuera de api", "/otro-prefijo"],
    ["relativa que escapa api", "/api/../otro-prefijo"],
  ])("normaliza una base %s a /api", async (_description, rawBaseUrl) => {
    vi.stubEnv("VITE_API_BASE_URL", rawBaseUrl);

    const { API_BASE_URL } = await import("./config");

    expect(API_BASE_URL).toBe("/api");
  });

  it("conserva una variante relativa normalizada bajo /api", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "/api/v1/");

    const { API_BASE_URL } = await import("./config");

    expect(API_BASE_URL).toBe("/api/v1");
  });

  it("dirige una request API al mismo origen bajo /api aunque la configuración sea absoluta", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://externo.example/api");
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { apiRequest } = await import("./http");
    await apiRequest("/agenda");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agenda",
      expect.any(Object),
    );
  });
});
