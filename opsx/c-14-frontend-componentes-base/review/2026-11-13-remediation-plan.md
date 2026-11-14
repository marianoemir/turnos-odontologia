# C-14 — decisión de remediación de revisión

Fecha: 2026-11-13

## Decisión

Los hallazgos importantes de la revisión final se incorporan al plan antes de archivar C-14. No se modificó código en esta actualización.

## Remediaciones aprobadas

1. **Task 4.7** endurece el límite de `apiRequest`: elimina cabeceras heredadas y cualquier `Authorization` suministrado por llamada antes de añadir, exclusivamente para una request protegida con sesión válida, el Bearer de la sesión. Incluye pruebas para inyección de cabeceras en requests protegidas y públicas.
2. **Task 5.4** vuelve independiente la integración de proxy de un Uvicorn en `8000`: backend falso en puerto efímero/configurable y teardown condicional/idempotente que no oculte fallos de setup. Incluye una ejecución con `8000` ocupado.

## Artefactos reconciliados

- `design.md`: D5 define la sanitización obligatoria de cabeceras por llamada y D10 la prueba de proxy con puerto efímero y cleanup seguro.
- `specs/frontend-foundation/spec.md`: agrega escenarios verificables para ambas garantías.
- `tasks.md`: agrega las tareas pendientes 4.7 y 5.4; las tareas 1.1–5.3 permanecen intactas como historia completada.

## Próximo paso

Aplicar únicamente 4.7 y 5.4 con `/opsx-apply c-14-frontend-componentes-base`, ejecutar los gates frontend y repetir la revisión antes de archivar.
