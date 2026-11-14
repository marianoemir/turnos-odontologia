/**
 * Importación de planilla de `/admin/datos` (C-22, task 5.2; design D8).
 *
 * Solo documentación: la importación se hace por el CLI `scripts/import_planilla`
 * y no existe un endpoint, así que no hay controles de subida de archivos. La
 * guía `docs/migracion/README.md` se nombra como texto: el SPA no sirve archivos
 * del repositorio y un enlace dependería de la rama y del acceso al repositorio.
 */
export function SeccionImportacion() {
  return (
    <section aria-labelledby="importacion-planilla">
      <h2 id="importacion-planilla">Importación de planilla</h2>
      <p>
        La importación se realiza por línea de comandos con <code>scripts/import_planilla</code>.
        No existe un endpoint de importación, por eso esta pantalla no tiene controles para subir
        archivos.
      </p>
      <p>
        El procedimiento está documentado en la guía <code>docs/migracion/README.md</code> del
        repositorio.
      </p>
    </section>
  );
}
