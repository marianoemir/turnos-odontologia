# Debug read-only — login multi-sucursal

Fecha: 2026-11-13

## Síntoma comprobado

El primer `POST /api/login` sin `sucursal_id` recibe el 422 exacto de C-24
`sucursal_requerida`, como corresponde. Luego de que la UI muestra el campo
**Sucursal ID**, se ingresó
`c1400000-0000-4000-8000-000000000001`, pero la respuesta volvió a ser el
mismo 422. Eso implica que la segunda request observada no contenía
`sucursal_id` (o que no era la request generada por el código fuente revisado).

## Trazabilidad del código actual

- `frontend/src/pages/login.tsx:51-57` crea el formulario RHF y obtiene
  `register`.
- `frontend/src/pages/login.tsx:75-77` activa `requiresSucursal` sólo ante el
  422 exacto.
- `frontend/src/pages/login.tsx:101-109` monta el control y conecta
  explícitamente `register("sucursalId")`; `TextField` propaga el `ref`, el
  `name` y los handlers al `<input>` mediante `...props`
  (`frontend/src/components/text-field.tsx:11-35`).
- `frontend/src/pages/login.tsx:59-73` toma el valor RHF, exige un UUID y pasa
  el valor validado como tercer argumento a `login`.
- `frontend/src/auth/login.ts:21-27` serializa, cuando ese argumento existe,
  exactamente `{ dni, password, sucursal_id: sucursalId }`.

Por lo tanto, en el código fuente actual no hay una rama que pueda mostrar ese
campo, aceptar ese UUID y enviar de nuevo el cuerpo sin `sucursal_id`.

## Hipótesis única

El navegador ejecutó un bundle de frontend desactualizado o de otro checkout
que ya mostraba el control, pero no contenía (o no había aplicado mediante HMR)
la serialización actual de `frontend/src/auth/login.ts:23-26`. No hay un proceso
Node/Vite activo al momento de esta investigación (`Get-Process node` no devolvió
procesos), así que no fue posible cotejar el bundle que sirvió la prueba manual.

HMR es una explicación posible, no demostrada: Vite normalmente propaga estos
cambios. La siguiente repetición debe arrancar una instancia Vite nueva desde
este checkout y hacer recarga completa con caché deshabilitada. Si el segundo
body sigue omitiendo `sucursal_id`, esta hipótesis queda descartada y se debe
capturar el request payload y el hash/URL del asset cargado antes de modificar
código.

## Reproducción determinista del código actual

La prueba existente
`frontend/src/auth/login.test.tsx:196-263` reproduce los dos envíos:

1. simula el 422 exacto;
2. escribe un UUID en **Sucursal ID**;
3. vuelve a enviar;
4. verifica el segundo `fetch` con
   `JSON.stringify({ dni, password, sucursal_id: sucursalId })`.

Ejecutada en esta revisión:

```text
npm run test:run -- src/auth/login.test.tsx
Test Files  1 passed
Tests       8 passed
```

El UUID reportado en la prueba manual cumple formato UUID v4; no debería quedar
bloqueado por la validación cliente de `login.tsx:62-68`. Si fuera una sucursal
no asociada, C-24 debería responder 403 `sucursal_no_asociada`, no repetir
`sucursal_requerida`.

## Plan mínimo TDD

1. Añadir una prueba E2E de navegador contra una instancia Vite recién iniciada
   desde este checkout. Interceptar `POST /api/login`: devolver primero el 422
   exacto y luego 403, completar el UUID y afirmar que el segundo body JSON
   contiene `sucursal_id`. Esta prueba cubre el bundle servido, no sólo el
   módulo con `fetch` mockeado.
2. Ejecutarla en rojo sólo si una instancia fresca reproduce la omisión. Antes
   de editar, conservar el body real de ambas requests y la URL/hash de los
   assets cargados.
3. Si la prueba E2E fresca pasa (lo esperado según la trazabilidad), no cambiar
   código: corregir el procedimiento de verificación manual (cold start +
   hard reload/caché deshabilitada).
4. Sólo si falla con el bundle fresco, arreglar el primer límite que omita el
   valor (RHF → `onSubmit` → `login` → `apiRequest`) y conservar el E2E como
   regresión.

## Estado de C-14

No corresponde reabrir la implementación de la task 4.6 con la evidencia
actual: su prueba de serialización pasa y el código tiene el recorrido exigido.
La task 5.3 continúa pendiente y no debe marcarse completa: su verificación
manual multi-sucursal falló. Repetirla con Vite arrancado en frío es el gate
necesario; reabrir 4.6 sólo si entonces se reproduce la omisión.
