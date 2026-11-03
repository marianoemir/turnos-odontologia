# Proposal

## Why

Con C-02 (catálogo), C-03 (turnos) y C-06 (lista de espera) archivados, el repo
cubre agenda y turnos pero **no tiene ningún lugar donde registrar información
clínica**: hoy no existe historia clínica, ni estado por pieza dental, ni
presupuesto de tratamiento. Eso bloquea dos cosas concretas: C-19
(`frontend-hc-odontograma`, que necesita contratos reales que tipar) y C-11
(`roles-multisucursal-exportacion`, cuyo `GET /export` debe incluir HC).

La KB no aporta reglas clínicas: `knowledge-base/04_modelo_de_datos.md` §Dominios
clasifica "HC/odontograma" como **"Posterior (solo referencia)"**, y
`knowledge-base/06_funcionalidades.md` menciona US-007 en **una sola línea, sin
criterios de aceptación**. Por eso este change **autor escenarios de aceptación
propios** a partir del bullet de C-09 en `CHANGES.md`, y trata todo invariante
clínico como **decisión de diseño explícita**, no como regla derivada de la KB.

**Posición en el roadmap** (`CHANGES.md` §Árbol de dependencias y §Paralelismo):
C-09 vive en **FASE 3 "Clínico, cobros y cierre (posterior al TP)"**, depende
solo de **C-02** y corre en paralelo a toda FASE 1 (GATE 2). **Está fuera del
recorte del TP** (`C-01 → C-02 → C-03 → C-12 → C-13 → C-14 → C-15 → C-16`), lo
que afecta prioridad, no corrección.

## What Changes

- Nuevo módulo de backend `backend/app/hc/` con modelos `HistoriaClinica`,
  `EntradaHC`, `Odontograma`, `PlanTratamiento` y `PlanItem`.
- **Historia clínica por paciente**: una fila por paciente (`paciente_id`
  UNIQUE) con cabecera de antecedentes/alergias/observaciones, y entradas
  clínicas **append-only** con `profesional_id` + `fecha` (trazabilidad).
- **Odontograma como historial por pieza**: una fila por observación
  (`pieza` FDI, `estado`, `profesional_id`, `fecha`); se lee como historial
  ordenado por `fecha`. `estado` se guarda como texto, sin catálogo canónico
  (ver `Q-C09-01`).
- **Plan de tratamiento con items por pieza**: `monto_centavos` por item,
  `monto_cobertura_centavos` opcional informado por el cliente (snapshot, sin
  nomenclador), y **total calculado** como suma de items (sin columna
  `presupuesto`).
- Endpoints nuevos (**13 rutas**): CRUD de HC (`POST/GET/PATCH
  /historias-clinicas...`), entradas (`POST/GET .../entradas`), odontograma por
  paciente (`POST/GET /pacientes/{id}/odontograma`) y planes con items:
  `POST /planes-tratamiento` (crear), `GET /planes-tratamiento/{id}` (detalle
  con total y cobertura), `PATCH /planes-tratamiento/{id}` (solo estado),
  `POST /planes-tratamiento/{id}/items` y
  `GET /pacientes/{paciente_id}/planes-tratamiento` (listado del paciente, orden
  `creado_en` asc, `[]` si no hay).
- Migración Alembic **`004_hc_odontograma`**, encadenada sobre
  `003_lista_espera` (la "Migración 003" de `CHANGES.md` está desactualizada:
  003 ya la usa C-06).
- Tests pytest de integración (Postgres real): CRUD de HC, unicidad de
  `paciente_id` (409), historial por pieza con profesional+fecha, suma de
  presupuesto, cobertura nullable, borde de FDI y montos.

**No incluye** (ver `design.md` §Contexto): liquidación de OS, nomenclador,
porcentajes de cobertura, PDF, ARCA/CAE (C-10); roles, auth y exportación
(C-11); PACS/imágenes, CDSS/IA, adjuntos de archivos (posteriores).

## Capabilities

### New Capabilities

- `hc-odontograma`: historia clínica única por paciente con entradas
  append-only trazables, odontograma como historial de estados por pieza FDI,
  y planes de tratamiento con items por pieza, total calculado y cobertura
  informada de solo lectura.

### Modified Capabilities

- (ninguna) No se modifican requisitos de `agenda`, `catalogo-recursos`,
  `foundation`, `lista-espera` ni `turnos`; C-09 solo consume sus tablas.

## Impact

- **Código**: nuevo `backend/app/hc/{models,schemas,service,router}.py`, router
  registrado en `backend/app/main.py`, import de modelos en
  `backend/alembic/env.py`, nueva migración `004_hc_odontograma.py`.
- **Base de datos**: 5 tablas nuevas (`historia_clinica`, `entrada_hc`,
  `odontograma`, `plan_tratamiento`, `plan_item`). Sin cambios en tablas
  existentes.
- **API**: **13 endpoints nuevos** bajo `/historias-clinicas`,
  `/pacientes/{id}/odontograma`, `/planes-tratamiento` y
  `/pacientes/{paciente_id}/planes-tratamiento` (listado de planes del paciente,
  orden `creado_en` asc, `[]` si el paciente no tiene planes). Errores 404/409/422
  según el mapeo del resto de la API: FK bien formada pero inexistente → 404,
  input mal formado → 422.
- **Tests**: nuevos `test_hc_modelo.py`, `test_hc_servicio.py`, `test_hc_api.py`;
  `backend/tests/conftest.py` debe truncar las tablas nuevas.
- **Dependencias**: C-02 archivado (pacientes, profesionales, prestaciones,
  seed). Postgres real para los tests de integración. Ninguna dependencia de
  C-03/C-04/C-06.
- **Gobernanza ALTO**: el modelo clínico, la migración 004 y los invariantes de
  unicidad/append-only requieren revisión humana antes de implementar.

## Preguntas abiertas (detalle en `design.md` §Preguntas abiertas)

- `Q-C09-01`: catálogo canónico de estados de pieza ("18 estados DentalSoft" no
  están enumerados en el repo ni en la KB) → `estado` queda como texto libre.
- `Q-C09-02`: si la validación estructural FDI `[1-4][1-8]` es suficiente o
  hacen falta piezas temporarias/supernumerarias.
- `Q-C09-03`: fuente de cobertura de OS (no hay nomenclador en la KB; C-10 lo
  define) → el monto de cobertura es dato informado por el cliente.
- `Q-C09-04`: estados canónicos de plan e item (no hay regla en la KB) → set
  provisorio con CHECK, sujeto a migración si cambia.
- `Q-C09-05`: quién puede escribir HC (recepción vs odontólogo); la matriz RBAC
  de la KB marca HC como "Posterior" para Recepción y Odontólogo, y "—" (sin
  acceso) para Paciente; C-11 implementa roles.
- `Q-C09-06`: si hace falta registrar la cara del diente y una observación libre
  por pieza; `CHANGES.md` solo lista pieza, estado, profesional y fecha, así que
  se omiten y agregarlas sería una migración aditiva.
- `Q-C09-07`: el `estado` de un item de plan **solo se fija al crearlo**; no
  existe `PATCH /planes-tratamiento/{id}/items/{item_id}`. Falta decidir si hace
  falta poder cambiarlo (`pendiente`→`realizado`) o alcanza con fijarlo al crear;
  agregarlo es un endpoint nuevo, no una migración (el `CHECK` ya admite los tres
  estados).
