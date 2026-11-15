# Proposal

## Why

El backend de C-09 ya expone historias clínicas, odontograma por pieza FDI, planes de tratamiento y entradas clínicas, pero el frontend carece de la pantalla `/hc/:pacienteId` para consultarlos y editarlos. C-19 cierra esa brecha con una UI de governance ALTO que reutiliza la base de C-13/C-14 y consume exclusivamente los contratos vigentes de C-09, sin inventar endpoints, catálogos de estados ni reglas clínicas.

## What Changes

- Reemplaza el placeholder actual de `/hc/:pacienteId` por la pantalla de historia clínica del paciente, accesible por URL directa y sujeta al guard de rutas ya existente (`canNavigate` en `auth/navigation.ts`, sin modificaciones).
- Agrega lectura/edición acotada de la cabecera de HC (`antecedentes`, `alergias`, `observaciones`) y creación de HC cuando no exista, usando los endpoints reales de C-09.
- Agrega odontograma FDI de 32 piezas con selección por teclado (roving tabindex), estado literal no cromático, panel de historial por pieza en el orden entregado por el backend y alta de observación de estado (texto libre) con `pieza`, `estado`, `profesional_id` y `fecha` (únicos campos de `OdontogramaCreate`). El panel puede mostrar, en solo lectura, los ítems de plan de esa pieza con su prestación resuelta por catálogo existente, sin enviar prestación en el alta de odontograma.
- Agrega plan de tratamiento y presupuesto en solo lectura, mostrando `total_centavos` y `cobertura_centavos` tal como los entrega el backend (formateados a monto) y permitiendo ver ítems por pieza/prestación; no crea planes ni ítems.
- Agrega listado y alta de entradas clínicas (ampliación del scope nominal de CHANGES.md, justificada abajo) con profesional, fecha y texto.
- Incluye estados de carga, vacío y error con componentes de C-14, validación de `:pacienteId` como UUID antes de disparar requests, manejo explícito de 403/404/409/422 según contratos reales por endpoint sin optimistic update ni reintentos automáticos de mutaciones conflictivas, y actualización acotada de tests de ruteo existentes.
- No modifica el backend ni los contratos congelados de `frontend/src/services/http.ts`, `api-error.ts`, `errors.ts` ni `auth/navigation.ts`; no crea lecturas de catálogo propias ni un segundo formateador de centavos.

## Capabilities

### New Capabilities

- `frontend-hc-odontograma`: UI de historia clínica por paciente en `/hc/:pacienteId` que consume HC, odontograma, planes/ítems y entradas clínicas del backend C-09; incluye odontograma FDI navegable por teclado, historial por pieza, alta de estado/entrada, cabecera editable, presupuesto/cobertura en solo lectura, y manejo de permisos, errores y estados de interfaz según contratos reales.

### Modified Capabilities

- (none)

## Impact

- **Frontend (implementación futura, fuera de apply de este planning):** archivos nuevos `frontend/src/types/api-hc.ts`, `frontend/src/services/hc.ts`, `frontend/src/services/money.ts` (extracción de `formatCentavos`, ya decidida en `design.md` D12), `frontend/src/pages/historia-clinica-cabecera.tsx`, `historia-clinica-odontograma.tsx`, `historia-clinica-panel-pieza.tsx`, `historia-clinica-entradas.tsx`, `historia-clinica-planes.tsx` y `historia-clinica-fdi.ts`, más sus tests (`services/hc.test.ts`, `services/money.test.ts`, `pages/historia-clinica.test.tsx`). Modificados: `pages/historia-clinica.tsx` (reemplazo del placeholder), `services/query.ts` (una raíz `historiasClinicas` y claves anidadas), `app/router.test.tsx` (UUID válido y caso inválido), `pages/caja.tsx` (importa `formatCentavos` desde `services/money.ts` sin cambiar su comportamiento) y los demás archivos de C-20 que consuman el helper según el `git grep` de la task 1.2; `app/router.tsx` solo si hace falta. No se agregan lecturas de catálogo propias más allá del uso de hooks existentes (`useProfesionales`, `usePrestaciones`, `usePacientes`) justificado en `design.md`.
- **APIs consumidas (solo lectura/escritura existentes):** `POST|GET|PATCH /historias-clinicas`, `GET /pacientes/{paciente_id}/historia-clinica`, `POST|GET /historias-clinicas/{id}/entradas`, `POST|GET /pacientes/{paciente_id}/odontograma`, `GET /pacientes/{paciente_id}/planes-tratamiento` (ya trae los ítems anidados, por eso no se consume `GET /planes-tratamiento/{id}`). No existe `GET /pacientes/{id}` en backend; no se crea ni se asume.
- **Dependencias/sistemas:** React, TypeScript, Vite, TanStack Query y componentes de C-14 ya presentes; sin nuevas dependencias externas previstas. Sin cambios de backend, migraciones, Docker ni CI.
- **Alcance de CHANGES.md:** las entradas clínicas no se nombran explícitamente en el scope textual de C-19 pero forman parte del contrato vigente de C-09 y de la HC editable; se incluyen como ampliación de alcance registrada (la nota de rectificación de CHANGES.md se hará después, en rama `docs/...`, fuera de esta sesión).
- **Desajustes registrados:**
  - Q-C09-01 (estado de pieza texto libre, sin catálogo) y Q-C09-05 (backend sin permisos/capabilities de HC) abiertos.
  - KB marca HC "Posterior" para Recepción/Odontólogo pero el guard cliente solo permite `recepcion` en `/hc/`; no hay punto de entrada desde C-15; datos del paciente sin endpoint por id; ausencia de reglas clínicas nombradas en KB para HC.
  - **Prestación asociada al alta de estado de odontograma (scope nominal):** `OdontogramaCreate` (`backend/app/hc/schemas.py`) acepta solo `pieza`, `estado`, `profesional_id` y `fecha`; no incluye `prestacion_id` (la prestación pertenece a `PlanItem`). No se implementa envío de prestación en el alta de estado; la UI solo puede mostrar, en solo lectura, ítems de plan de la pieza con su prestación resuelta por `usePrestaciones` (`frontend/src/services/catalogo.ts`). No se inventa contrato backend.