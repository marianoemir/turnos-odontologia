# Design — crear-turno-sin-solapamientos (C-03)

## Context

Ver `proposal.md` (Why) y `docs/explore/c03-crear-turno-sin-solapamientos.md` (relevo pre-propose, única fuente de dudas a cerrar). Estado heredado: C-01 y C-02 archivados; `backend/app/agenda/models.py` (167 líneas, 6 entidades + helpers `hay_solape_config`/`bloqueo_aplica`), `backend/app/db.py` (Base + engine perezoso), `main.py` (solo `GET /health`), `backend/app/turnos/` vacío (hogar reservado), `conftest.py` (rollback + TRUNCATE sin `turnos`, fail-fast con `CI=true`), revisión `001_catalogo`, seed sin turnos por spec C-02, `docker-compose.yml` con `postgres:16` + healthcheck + `depends_on: service_healthy`. CI existente en `.github/workflows/tests.yml` (job `tests` con servicio `postgres:16` + `DATABASE_URL`); el fail-fast vive en `conftest.py`).

## Goals / Non-Goals

**Goals:** `POST /turnos` con `ServicioTurnos.crear` como único punto de validación, tabla `turnos` con doble red (validación de servicio + `EXCLUDE` a nivel DB), revisión 002 reversible, tests red-green por comportamiento con PG real, `GET /health` sin DB intacto.

**Non-Goals (diseño):** sin máquina de transiciones (C-04 provee `validar()` reutilizable desde ya); sin endpoints de lectura (verificación por DB directa); sin cambios al seed, al catálogo ni al compose; sin workflow CI nuevo (ver D17).

## Decisions (cierran TODAS las dudas del Explore §3)

- **D1 — Concurrencia: servicio (A) como comportamiento + `EXCLUDE` (B) como red de seguridad.** Justificación: solo la DB cierra el race TOCTOU bajo creates concurrentes; el servicio solo no alcanza ni los índices parciales tampoco (un btree no expresa solape de rangos). Descartadas: C (locks pesimistas/advisory — serializan y son sutiles de testear), D (`SERIALIZABLE` + reintentos — errores espurios, overkill TP), E (índice único "poor man's" — imposible para rangos).
- **D2 — Restricciones exactas:** `EXCLUDE USING gist (profesional_id WITH =, tstzrange(inicio, fin, '[)') WITH &&) WHERE (estado IN ('pendiente','confirmado'))` y análoga por `sillon_id`. Justificación: el rango semiabierto `[)` implementa RN-AG-04 por construcción y el `WHERE` implementa RN-ES-02/RN-TU-01 (cancelado/ausente libera). Descartado: constraint único sin `WHERE` (bloquearía reutilizar slots cancelados, contradice RN-06).
- **D3 — `btree_gist` disponible en `postgres:16` (CI y compose), sin servicio extra.** Justificación: verificado contra la documentación oficial de PostgreSQL 16 (Apéndice F, módulos contribuidos): `btree_gist` provee las clases GiST con comportamiento btree para `uuid`/`timestamptz`/rangos y se habilita con `CREATE EXTENSION IF NOT EXISTS btree_gist` — la imagen oficial `postgres:16` ya la trae, no requiere superusuario extra en compose/CI ni servicio adicional. La migración 002 la crea primero (`op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")`). Descartado: agregar servicio/extensión al compose o workflow (innecesario; compose actual ya espera `service_healthy`).
- **D4 — El servicio valida primero y produce el 409 con causa; la violación `EXCLUDE` se mapea a 409 genérico.** Justificación: los mensajes con causa específica solo pueden venir de la validación ordenada del servicio; el constraint es última red (races, escrituras fuera del servicio) y su `IntegrityError`/`ExclusionViolation` se traduce a 409 genérico, nunca 500 por solape. Descartado: parsear el nombre del constraint para la causa (frágil) y dejar el 500 residual.
- **D5 — Scope fence (§3.2): solo `POST /turnos` (+ `GET /health` heredado).** Justificación: CHANGES §C-03 lista solo creación; `GET /agenda` es C-05, cancelar/reprogramar C-04, sobreturnos/lista de espera/reserva online/JWT/Redis/frontend son posteriores. Descartado: adelantar `GET /agenda` "para verificar" (los tests verifican por DB directa).
- **D6 — Q1 (solo-recepción escribe): `creado_por` texto libre nullable hasta C-11.** Justificación: sin tabla Usuario en C-02/C-03 ni auth en scope; un texto libre registra auditoría mínima sin inventar FK a una tabla inexistente (ver S4). Descartado: `creado_por` NOT NULL o FK (bloquearía el change por una decisión PO pendiente).
- **D7 — Q3 (solape del mismo paciente): NO se valida; se permite (Q3 queda ABIERTA para el PO).** Justificación: fidelidad literal a RN-AG-02/03 (KB 05 no veda solape por paciente); validar de más inventaría regla de negocio (ver S1). Descartado: 409 causa `paciente` (fuera de CHANGES y de RN).
- **D8 — Q2/Q4/Q5/Q7: fuera de C-03, solo registradas.** Justificación: anticipación mínima (C-04), sobreturnos/lista de espera (posteriores), "no evidenciado" (sin impacto). Descartado: implementarlas preventivamente.
- **D9 — TZ y cobertura de horario (§3.4.1): conversión con `ZoneInfo("America/Argentina/Buenos_Aires")`, `weekday()` 0=lunes, cobertura total del intervalo; turnos que cruzan medianoche exigen cobertura en cada día tocado.** Justificación: determinista y coherente con seed `range(5)` Lun–Vie 9–18; DST resuelto por `ZoneInfo`, no por aritmética manual. Descartado: comparar horas naive sin zona (rompe con `timestamptz`) y excluir turnos nocturnos por supuesto (innecesario: la regla de cobertura total ya los gobierna). Riesgo Windows mitigado: `tzdata` agregado a `backend/requirements.txt`, por lo que `ZoneInfo("America/Argentina/Buenos_Aires")` funciona sin base tz del sistema.
- **D10 — `fin` columna física calculada en el servicio (§3.4.2).** Justificación: `GENERATED ALWAYS AS` es imposible (requiere join a `prestaciones.duracion_min`); columna física indexable + `CHECK (fin > inicio)` protege escrituras manuales. Descartado: columna generada y no persistir `fin` (obligaría a recomputar el join en cada query de solape).
- **D11 — `Turno` vive en `backend/app/turnos/models.py` (§3.4 tabla).** Justificación: coherente con "ServicioTurnos" y KB 08; `backend/app/turnos/` está reservado y vacío para este change. Descartado: agregarlo a `agenda/models.py` (mezcla dominios; agenda es catálogo C-02).
- **D12 — `ServicioTurnos.crear` único punto + método interno `validar(...)` reutilizable por C-04 (RN-TU-02).** Justificación: reprogramar debe validar "igual que crear" sin duplicar lógica; `crear = validar + insert`. Descartado: validación inline en el router (C-04 la duplicaría).
- **D13 — 404 vs 422 en FKs (§1.3 paso 2): 404 si el UUID está bien formado pero no existe; 422 si el body es inválido (tipos, `sillon_id` ausente, datetimes sin zona).** Justificación: distingue "input malformado" de "referencia ausente", contrato testeable. Descartado: todo-422 (oculta ausencias) y todo-404 (rompe la semántica Pydantic).
- **D14 — Sillón inactivo → 422 (§1.2/RN-03).** Justificación: es input contra un recurso desactivado, no un conflicto de agenda. Descartado: 409 (reservado a horario/bloqueo/solapes).
- **D15 — `ondelete="RESTRICT"` en las 4 FKs de `turnos`.** Justificación: protege el historial de turnos (borrar un paciente/profesional con turnos debe ser rechazado, no en cascada); coherente con "nunca hard delete de turnos". Descartado: `CASCADE` de la 001 (borraría historia silenciosamente).
- **D16 — Capas 409/422 (§3.4.5): el servicio valida TODO antes de insertar; `IntegrityError` residual solo como última red (→ 409 genérico si es exclusión, 500 en otro caso).** Justificación: los CHECKs DB levantan `IntegrityError`, no 422/409 con causa. Descartado: confiar en atrapar `IntegrityError` para los 409 normales (pierde la causa ordenada).
- **D17 — Sin `GET` de verificación (§3.4.6) y sin cambios CI/compose (§3.4.7): tests por DB directa + respuesta 201; `TRUNCATE` extendida con `turnos`; fail-fast `CI=true` intacto (sin PG falla, nunca saltea).** Justificación: el job `tests` de `.github/workflows/tests.yml` ya provee el servicio `postgres:16` + env `DATABASE_URL` (imagen oficial, que trae el módulo contribuido `btree_gist`), por lo que `CREATE EXTENSION` en la migración 002 no requiere cambios CI/compose; y `docker-compose.yml` ya usa `postgres:16` con healthcheck + `depends_on: service_healthy` (suficiente para `btree_gist`); tipos de la 002 (`Uuid`, `timestamptz`, CHECKs, EXCLUDE) son estándar PG16. Descartado: crear workflow o servicio "por si acaso" y verificar por endpoints de lectura (son C-05).

## Supuestos numerados (lo NO dicho en KB 05 — sin inventar reglas)

- **S1 — Solape del mismo paciente con profesionales/sillones distintos: PERMITIDO en C-03; Q3 queda ABIERTA al PO/cátedra.** Sin índice de prohibición; el índice `(paciente_id,inicio)` es solo observabilidad.
- **S2 — Sillón inactivo (`activo=false`) rechaza con 422** (recomendación del Explore adoptada; KB no lo fija).
- **S3 — 404 si la FK está bien formada pero inexistente; 422 si el body es inválido** (KB/CHANGES no lo fijan; decisión explícita D13).
- **S4 — `creado_por`: texto libre nullable hasta C-11** (Q1 abierta; sin auth en C-03, uso interno/test).
- **S5 — Turnos que cruzan medianoche o límites DST se evalúan con cobertura total por día tocado bajo `ZoneInfo`** (KB no contempla el caso; la regla de cobertura lo gobierna sin escenarios nuevos).

## Orden de validación congelado (determina la causa del 409)

1. Schema Pydantic (tipos, `sillon_id` presente, datetimes con zona) → **422**.
2. FKs existen (paciente/profesional/sillón/prestación) → **404** (bien formado pero inexistente) / **422** (inválido).
3. Sillón `activo=true` → **422** si inactivo.
4. Cobertura total por `HorarioAtencion` del profesional (TZ `America/Argentina/Buenos_Aires`, `weekday()` 0=lunes) → **409** `{"detail": {"causa": "horario", "detalle": ...}}`.
5. Ningún `Bloqueo` aplicable (matriz `bloqueo_aplica` C-02) intersecta `[inicio,fin)` → **409** causa `bloqueo`.
6. Ningún turno activo mismo `profesional_id` con `inicio < fin_nuevo AND fin > inicio_nuevo` → **409** causa `profesional`.
7. Ningún turno activo mismo `sillon_id` con igual condición → **409** causa `sillon`.
8. Todo pasa → **201** con el turno en `pendiente`; `fin = inicio + duracion_min` calculada en servidor. Todo 409 es atómico (rollback, nada creado).

Formato exacto 409: `{"detail": {"causa": "profesional|sillon|horario|bloqueo", "detalle": "<texto humano no vacío>"}}`.

## Esquema de datos (002)

Tabla `turnos`: `id UUID PK`; `paciente_id/profesional_id/prestacion_id UUID NOT NULL RESTRICT`; `sillon_id UUID NOT NULL RESTRICT`; `inicio/fin timestamptz NOT NULL`; `CHECK (fin > inicio)`; `estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN (...5...))`; `creado_por TEXT NULL`. Extensión `btree_gist` (D3) + 2 `EXCLUDE` (D2) + índices btree de apoyo `(profesional_id,inicio,fin)` y `(sillon_id,inicio,fin)` parciales en activos + `(paciente_id,inicio)`. Downgrade: drop constraints/tabla/extensión solo si ningún otro objeto la usa (no hacerlo si `IF EXISTS` falla — documentar en la migración).

Compose de referencia (existente, sin cambios — prueba de que no se agrega nada):

```yaml
services:
  postgres:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U odontologia -d turnos"]
  api:
    depends_on:
      postgres:
        condition: service_healthy
```

## Risks / Trade-offs

- [Race residual entre validación de servicio y constraint] → Mitigación: el 409 con causa viene del servicio en el caso común; el `EXCLUDE` captura el race y se mapea a 409 genérico.
- [`CREATE EXTENSION` requiere privilegios en PG gestionados] → Mitigación: `IF NOT EXISTS` + rol owner en compose/CI local; si un PG futuro lo niega, el error es explícito en `upgrade`, no silencioso.
- [Mapeo 404/422 y sillón-inactivo-422 son decisiones, no KB] → Mitigación: congeladas en spec + supuestos S2/S3; el PO puede revertirlas en C-04 sin tocar el modelo.
- [Turnos multimedianoche] → Mitigación: S5 + 1 test de cobertura a caballo de dos días (en horario) o exclusión documentada si ningún horario lo cubre.

## Migration Plan

1. `alembic upgrade head` (002 aplica extensión + tabla + constraints + índices).
2. Despliegue sin downtime relevante (tabla nueva; ningún código viejo la toca).
3. Rollback: `alembic downgrade -1` (remueve tabla + constraints; la extensión se conserva si otros objetos la usan).

## Open Questions (diferibles — no cambian spec/diseño/tasks)

- Q1 al PO/cátedra: confirmar solo-recepción escribe (condiciona RBAC de C-11, no este change).
- Q3 al PO: ¿vedar solape por paciente en un change futuro? (hoy permitido, S1).
