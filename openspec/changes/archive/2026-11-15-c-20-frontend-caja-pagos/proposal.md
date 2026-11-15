# Proposal

## Why

La capability backend `caja-pagos` (C-10, archivada) ya expone apertura/cierre con arqueo, cobros por medio, anulación, factura ARCA simulada y liquidaciones OS, pero el frontend solo tiene un placeholder en `/caja`. C-20 cubre esa brecha de UI para recepción usando los endpoints existentes, respetando el orden de dependencias frontend (C-13/C-14) y las decisiones de diseño vigentes de C-24 (sesión JWT).

## What Changes

- Reemplaza la pantalla placeholder `/caja` por una UI operativa de caja y cobros consumiendo únicamente los 9 endpoints existentes de `backend/app/caja/router.py`.
- Agrega contratos TS espejo y servicios/hooks de caja/cobros/liquidaciones siguiendo el patrón de C-22 (`frontend/src/types/api-*.ts`, `frontend/src/services/*.ts`, `ApiError`/`http.ts`).
- Implementa apertura y cierre diario con arqueo (esperado, contado, diferencia, totales por medio) consultando la caja por fecha (`GET /caja?fecha=`), con la fecha del día en zona local de Buenos Aires como default de consulta en UI.
- Implementa registro de cobro (efectivo/tarjeta/transferencia/mercado_pago/obra_social), concepto (seña/saldo/total), monto en centavos, vínculo opcional a turno y captura de datos de obra social cuando corresponde.
- Implementa anulación con motivo obligatorio y doble confirmación, y facturación ARCA con doble confirmación, marcando visiblemente los resultados simulados (`simulado`, `modo`, prefijos `SIM-*`, `pdf_referencia` con prefijo `SIM-`).
- Implementa listado de liquidaciones OS desde `GET /liquidaciones-os`, mostrando `pdf_referencia` como texto y marcando como simulada cuando corresponda; sin descarga de PDF.
- **Rectificación de alcance respecto del scope original de C-20 en CHANGES.md** (decisiones de esta propuesta, revisables por PO/cátedra): (1) **no hay historial de cajas** porque el backend solo expone `GET /caja?fecha=` y `GET /caja/{id}` (no listado histórico); la pantalla consulta por fecha. (2) **no hay descarga de PDF** de liquidaciones porque el backend solo devuelve `pdf_referencia` textual; se muestra como referencia, sin acción de descarga.
- No modifica `frontend-sesion` ni el guard/ruteo: `/caja` queda restringida a `recepcion` en UI. `admin` no usa la caja desde la UI aunque el backend lo permite (limitación explícita de esta propuesta, D2). El guard del cliente no es seguridad; el respaldo es el 403 del backend.
- No expone credenciales en `VITE_*` ni en el bundle; no reintenta automáticamente POST ni 409; deshabilita acciones de envío mientras la request está en curso.
- No toca `frontend/src/services/http.ts` salvo necesidad imprescindible detectada en diseño/aplicación (si se requiere, se documenta antes en `design.md`/propuesta).

## Capabilities

### New Capabilities

- `frontend-caja`: Pantalla de caja para recepción que permite consultar caja por fecha, abrir/cerrar con arqueo, registrar cobros por medio (incluida obra social y seña), anular con doble paso y motivo, facturar ARCA simulada con doble paso y listar liquidaciones OS con referencia simulada visible, alineada a los endpoints y validaciones de `caja-pagos`.

### Modified Capabilities

- Ninguna. No se modifican requisitos de specs existentes; el contrato backend `caja-pagos` y la sesión frontend se consumen tal como están.

## Impact

- **Frontend (alcance previsto en apply, no ejecutado en esta propuesta):** `frontend/src/pages/caja.tsx`, nuevos `frontend/src/types/api-caja.ts` (o nombre equivalente), `frontend/src/services/caja.ts` (o equivalente), tests RTL asociados a la página/servicios según TDD; posible ajuste menor de wiring solo si es imprescindible y documentado.
- **Backend:** sin cambios; se consume `POST /caja/abrir`, `POST /caja/cerrar`, `GET /caja/{id}`, `GET /caja?fecha=`, `POST /cobros`, `GET /cobros/{id}`, `POST /cobros/{id}/anular`, `POST /cobros/{id}/factura-arca`, `GET /liquidaciones-os`.
- **Specs/KB de referencia:** `openspec/specs/caja-pagos/spec.md`, `knowledge-base/02_descripcion_general.md` §Integraciones externas, `knowledge-base/07_flujos_principales.md` §Flujo 1, `knowledge-base/05_reglas_de_negocio.md` §Dominio: Excepciones globales, `knowledge-base/08_arquitectura_propuesta.md` §Variables de entorno.
- **Riesgos/limitaciones conocidas:** sin historial de cajas y sin descarga de PDF (limitaciones por backend actual); `admin` sin acceso UI a caja pese a permiso backend (D2); `GET /caja?fecha=` devuelve 404 si no existe caja para la fecha (la UI debe tratarlo como estado "sin caja abierta/registrada" y no como error fatal).

## Decisiones registradas (revisables por PO/cátedra)

- **D2 (acceso UI):** `/caja` queda solo para `recepcion`. No hay delta sobre `frontend-sesion`. `admin` no usa la caja desde la UI aunque el backend se lo permite; se deja como limitación explícita.
- **D3 (consulta):** No hay historial de cajas. La pantalla consulta por fecha (`GET /caja?fecha=`).
- **D4 (liquidaciones/PDF):** No hay descarga de PDF. El listado de liquidaciones muestra `pdf_referencia` como texto, marcado como simulado si lleva el prefijo `SIM-`.
- **D5 (montos en UI):** Los montos se ingresan en pesos y se convierten a centavos enteros mediante parseo de string (máximo 2 decimales, acepta coma o punto), nunca con aritmética `float`. El parser rechaza vacío, cero, más de 2 decimales y valores que excedan `1_000_000_000_000` centavos (`MONTO_MAX_CENTAVOS`, verificado en backend). La visualización se formatea desde centavos enteros.
- **D6 (doble confirmación):** La confirmación en dos pasos usa el Modal de C-14 (focus trap, Escape). No se usa `confirm()` del navegador. El usuario elige el tipo de factura B o C y la UI envía el tipo elegido.
- **D9 [propuesta, revisable por PO/cátedra] (alcance anular/facturar sin listado de cobros):** No existe endpoint para listar cobros de una caja (verificado: `CajaOut`/endpoints no exponen cobros). La UI permite anular y facturar solo: (a) cobros creados en esta pantalla (estado en memoria, refrescable con `GET /cobros/{id}`) y (b) cobros abiertos pegando un id de cobro. Un id inexistente (404 con `detail` string) se muestra sin romper la UI; texto no UUID no llama al backend. Limitación: los cobros en memoria se pierden al recargar.
- **D10 (fecha al cerrar):** Por defecto la UI envía la fecha seleccionada en `POST /caja/cerrar` (no la omite). Verificado en backend: `ServicioCaja.cerrar` cierra la caja de la fecha provista.
- **D11 [propuesta, revisable por PO/cátedra] (turno/caja en cobro):** `turno_id` es un campo de texto opcional para UUID, validado en formato; 404 se muestra si no existe. `caja_id` no se expone en UI (backend usa la caja abierta del día). Alternativa revisable: selector de turno cuando exista C-15.
- **Nota:** D3/D4 rectifican el scope original de C-20 (historial de cajas; descarga de PDF) por no ser implementables con el backend actual. D9/D11 delimitan alcance por contratos/UX disponible.
