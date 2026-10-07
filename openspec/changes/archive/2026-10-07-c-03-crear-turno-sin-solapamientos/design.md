# Design

## Context

Base C-01 lista (Node+TS+Express+Jest). `src/turnos/` y `src/agenda/` vacíos; modelos C-02 planificados en `knowledge-base/04_modelo_de_datos.md` (sin implementar: este change los consume como tipos/entidades que C-02 proveerá). Ver `proposal.md` (Why) y `specs/turnos/spec.md` (requisitos).

## Goals / Non-Goals

**Goals:**
- Un único punto de validación (`ServicioTurnos.crear`) que aplique RN-AG-01..05 y mapee a 409/422.
- Seams testeables para TDD red-green (intervalos, servicio con repositorio inyectado).

**Non-Goals:**
- Cancelar/reprogramar, agenda del día, lista de espera (C-04/C-05/C-06).
- Persistencia real (repositorio en memoria; interfaz lista para SQLite/Postgres en C-02 si decide).

## Decisions

- **Tipos de dominio inmutables + función pura `solapan(a, b)` con `[inicio, fin)`** sobre comparación con `<=` ad-hoc. Alternativa: librería de rangos — descartada, el borde RN-AG-04 se expresa en 3 líneas y sin dependencias.
- **`ServicioTurnos` recibe repositorios por constructor (inyección)** sobre singletons/imports directos. Alternativa singleton: impide tests aislados en memoria; la inyección es el seam que la skill `tdd` necesita.
- **Errores de dominio tipados (`ConflictoTurno {causa}` vs `InputInvalido`)** sobre códigos sueltos. Alternativa: lanzar `Error` genérico — pierde la causa 409 requerida por el spec; el mapeo HTTP (si C-03 expone Express) es trivial desde el tipo.
- **Sin capa HTTP obligatoria**: el servicio es el contrato testeado; un router Express fino (`POST /turnos`) solo si ayuda a demostrar 409/422, mapeando 1:1 los errores de dominio. Alternativa API-first: sobredimensiona; el TP no exige UI.
- **Modelos C-02 como interfaces mínimas locales** (Paciente/Profesional/Sillon/Prestacion/Horario/Bloqueo con los campos de KB 04) si C-02 sigue pendiente al implementar; se reemplazan por los reales sin cambiar el servicio. Alternativa esperar a C-02: bloquea el TP; el adaptador es barato.

## Risks / Trade-offs

- [Implementar contra interfaces provisorias si C-02 no está] → Mitigación: mismas formas de KB 04; tarea explícita de swap en tasks.
- [Zona horaria (timestamptz)] → Mitigación: `TZ` de `.env.example`, fechas ISO con offset en tests; casos borde DST fuera de alcance documentado.
- [Reprogramar (C-04) reutilizará esta validación] → Mitigación: `validar(...)` separada de `crear(...)` desde el día 1 para reutilizar sin duplicar.
