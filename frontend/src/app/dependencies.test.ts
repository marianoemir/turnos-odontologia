import { QueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("dependencias de la base de integración", () => {
  it("expone las APIs necesarias para cache y validación de formularios", () => {
    const client = new QueryClient();
    const schema = z.object({ dni: z.string().min(1) });

    expect(client.getQueryCache()).toBeDefined();
    expect(schema.safeParse({ dni: "USUARIO-FICT-001" }).success).toBe(true);
    expect(typeof useForm).toBe("function");
  });

  it("conserva el resultado inválido de Zod para entradas de formulario incompletas", () => {
    const schema = z.object({ dni: z.string().min(1) });

    expect(schema.safeParse({ dni: "" }).success).toBe(false);
  });
});
