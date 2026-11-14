/**
 * Task 5.2 (C-22) — importación de planilla solo documentada en `/admin/datos`.
 *
 * La sección nombra el CLI `scripts/import_planilla` y la guía
 * `docs/migracion/README.md`, aclara que no hay endpoint y no ofrece ningún
 * control de subida de archivos. Sin backend ni sesión: es solo texto.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import AdminDatosPage from "./admin-datos";
import { SeccionImportacion } from "./admin-datos-importacion";

afterEach(cleanup);

describe("/admin/datos — importación documentada", () => {
  it("indica que se importa por línea de comandos, nombra el script y la guía y aclara que no hay endpoint", () => {
    render(<SeccionImportacion />);

    const seccion = screen.getByRole("region", { name: "Importación de planilla" });
    expect(within(seccion).getByText("scripts/import_planilla")).toBeInTheDocument();
    expect(within(seccion).getByText("docs/migracion/README.md")).toBeInTheDocument();
    expect(within(seccion).getByText(/línea de comandos/)).toBeInTheDocument();
    expect(within(seccion).getByText(/no existe un endpoint/i)).toBeInTheDocument();
  });

  it("no ofrece controles de subida: sin campos, botones ni enlaces", () => {
    const { container } = render(<SeccionImportacion />);

    expect(container.querySelector("input")).toBeNull();
    expect(screen.queryByLabelText(/archivo/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("la pantalla /admin/datos incluye la sección y ningún campo de carga de archivos", () => {
    const { container } = render(<AdminDatosPage />);

    expect(screen.getByRole("region", { name: "Importación de planilla" })).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });
});
