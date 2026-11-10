# turnos-odontologia — Instrucciones para Agentes

> `AGENTS.md` y `CLAUDE.md` son idénticos: es lo PRIMERO que todo agente lee al entrar al repo.
> Generado a partir de `knowledge-base/` y `CHANGES.md`. Si se edita uno, copiarlo sobre el otro y verificar con `(Get-FileHash AGENTS.md).Hash -eq (Get-FileHash CLAUDE.md).Hash` → `True`.

---

## Stack Tecnológico

> Stack impuesto por el profesor (2026-10-07). NO se cambia sin consultarlo.

| Capa | Tecnología | Versión |
|------|------------|---------|
| Backend | Python + FastAPI + SQLAlchemy + Alembic | Python 3.12+, FastAPI 0.115+, SQLAlchemy 2.0+ |
| Auth | Sin login real (C-11): la identidad llega por el header `X-Actor-Rol` (ausente → `recepcion`); `X-Sucursal-Id` es opcional. Supuesto de implementación, no control de seguridad | — |
| Persistencia | PostgreSQL vía Docker Compose | Postgres 16+ |
| Async | Redis — solo con funcionalidad asincrónica (posterior) | Redis 7+ |
| Frontend | React + TypeScript + Vite (C-13 a C-22, pendientes; el backend C-01..C-12 ya está archivado) | — |
| Tests | pytest directo (sin skill dedicada) | pytest 8+ |
| Infra local | Docker + Docker Compose (`docker-compose.yml` en raíz) | Docker 24+ |

Detalle completo: [knowledge-base/02_descripcion_general.md](knowledge-base/02_descripcion_general.md)

---

## Base de Conocimiento

La fuente de verdad del dominio vive en `knowledge-base/`. **Leé el archivo relevante ANTES de implementar.**

| Archivo | Cuándo leerlo |
|---------|---------------|
| [01_vision_y_objetivos.md](knowledge-base/01_vision_y_objetivos.md) | Entender propósito y alcance (v1 vs recorte primer change) |
| [03_actores_y_roles.md](knowledge-base/03_actores_y_roles.md) | RBAC mínimo (recepción escribe, odontólogo lee) |
| [04_modelo_de_datos.md](knowledge-base/04_modelo_de_datos.md) | Entidades, constraints de solape, índices, seed |
| [05_reglas_de_negocio.md](knowledge-base/05_reglas_de_negocio.md) | Reglas RN-AG / RN-TU / RN-ES (mapeo RN-01..08) |
| [06_funcionalidades.md](knowledge-base/06_funcionalidades.md) | US-001..004 por épica + posteriores |
| [07_flujos_principales.md](knowledge-base/07_flujos_principales.md) | Flujos crear / cancelar-reprogramar / agenda día |
| [08_arquitectura_propuesta.md](knowledge-base/08_arquitectura_propuesta.md) | Patrones, estructura, env vars |
| [10_preguntas_abiertas.md](knowledge-base/10_preguntas_abiertas.md) | ⚠️ Inconsistencias a resolver ANTES de codear |

> ⚠️ La pregunta de prioridad **Alta** restante de `10_preguntas_abiertas.md` (Q1, reserva online del paciente) sigue abierta y C-08 ya está implementado: decidirla con el PO o la cátedra. Los límites conocidos de C-08 están en el README. Q6 (stack) resuelta por el profesor.

---

## Skills Disponibles

| Agente | Rol | Skills que carga |
|--------|-----|------------------|
| Núcleo agenda | Turnos, solapes, estados, tests (pytest) | (sin skill dedicada — pytest directo) |
| Orquestación | SDD / KB / roadmap / reglas | `kb-creator`, `roadmap-generator`, `agent-instruction`, `find-skill`, `active-orchestrator` |
| Cambios OpenSpec | Proponer / aplicar / archivar / explorar | `openspec-propose`, `openspec-apply-change`, `openspec-archive-change`, `openspec-explore`, `openspec-sync-specs`, `openspec-update-change` |
| Meta | Crear o mejorar skills | `skill-creator` |
| Lista de espera (C-06) | Alta, orden y oferta de huecos de lista de espera | `lista-espera-odontologia` |

Cargá la skill correspondiente al contexto ANTES de escribir código.

> **`lista-espera-odontologia`** — Cuándo: al trabajar en la lista de espera (C-06 / US-004, "rellenar cancelaciones", "ofrecer hueco"). Necesita: C-03 archivado (`ServicioTurnos.crear()`), C-04 y las reglas de la KB. Cómo revisar el resultado: tests de alta, orden FIFO, filtro por profesional (incluye las generales), oferta (solo de entradas pendientes), conflicto (409 vs 422), rechazo (si falla la cancelación del turno no pasa a baja: 409) y aceptación en verde; sin hard delete; datos ficticios. El criterio de orden FIFO es decisión provisional (Q5 abierta).

> Los compact rules de cada skill los resuelve el orquestador desde `.atl/skill-registry.md` (generado por `skill-registry`; versionado en el repo). Esta tabla solo mapea skill→rol.

---

## Roadmap de Changes

El plan de implementación completo está en [CHANGES.md](CHANGES.md). Resumen (rectificado 2026-11-10, rev. 10; estados al 2026-11-10):

- **Total**: 23 changes en 6 fases (backend C-01..C-12 + corrección de infra C-23 + frontend C-13..C-22).
- **Estado**: 12 archivados (C-01 a C-07, C-09, C-10, C-11, C-12 y C-08) y 11 pendientes (C-13..C-22 y C-23).
- **Camino crítico backend** (5): `C-01 → C-02 → C-03 → C-10 → C-11`.
- **Camino crítico end-to-end con UI** (8): `C-01 → C-02 → C-03 → C-13 → C-14 → C-15 → C-16 → C-17`.
- **Recorte TP** (8, actualizado): `C-01 → C-02 → C-03 → C-12 → C-13 → C-14 → C-15 → C-16`. Archivados del recorte: C-01, C-02, C-03 y C-12 (además, fuera del recorte: C-04, C-05, C-06, C-07, C-08, C-09, C-10 y C-11). Pendientes del recorte: **C-13, C-14, C-15, C-16**.
- **En curso**: (ninguno). **Próximo del recorte**: `C-13` (`frontend-foundation`, depende de C-03, ya archivado). `C-23` (`fix-api-contenedor`) depende solo de C-03, no bloquea a ningún change y se cierra al llegar a `C-22` (decisión de Mariano, 2026-11-10). Migraciones: head `008_recordatorio` (`down_revision = "007_roles_sucursales"`); C-08 (`reserva-online`, archivado 2026-11-10) no agregó ninguna.
- **Frontend**: C-13 `frontend-foundation` (shell/ruteo/contratos) y C-14 `frontend-componentes-base` (componentes + data layer + rol) son la base; C-15..C-22 son un change por capability. Consumen `frontend/design-system/` (`Revision: 1`, `Mode: system-only`). Ningún change de frontend se adelanta al endpoint que consume.
- **Contratos vigentes (C-11 y C-08)**: no hay login real; el cliente envía `X-Actor-Rol` (sin el header la API actúa como `recepcion` y las pantallas de admin dan 403) y, opcional, `X-Sucursal-Id` (filtra solo profesionales y sillones). Las rutas públicas de C-08 (`GET /reservar/{profesional}`, `POST /reservar`) no usan cabeceras de rol. `GET /export`: JSON, 30 días, solo admin. La importación de planilla es solo por CLI.

**Antes de cualquier `/opsx:propose`**: leé [CHANGES.md](CHANGES.md), identificá las dependencias del change y los archivos de "Leer antes".

---

## Reglas Duras

> Global `~/.claude/CLAUDE.md` ausente: no hay reglas heredadas. Todo lo contractual vive acá. Son contrato; romperlas es un defecto. Confirmadas con el usuario (stack impuesto por el profesor, 2026-10-07; reglas derivadas del dominio + universales).

- NUNCA cambiar el stack sin consultar al profesor → Python/FastAPI/SQLAlchemy/PostgreSQL + React/Vite es imposición de cátedra.
- NUNCA datos reales de pacientes → solo datos ficticios en seeds y tests.
- NUNCA secretos commiteados → tokens/keys solo vía env; `.env.example` sin valores reales.
- NUNCA crear turno sin validar solape de profesional + sillón en `[inicio,fin)` en un único ServicioTurnos → aplica RN-AG-02/03/04 en un solo punto.
- NUNCA 200/500 ante conflicto de negocio → 409 conflicto (solape/horario/bloqueo) vs 422 input inválido.
- NUNCA hard delete de turnos → cancelar es cambio de estado (RN-ES-01); cancelado/ausente no cuenta para solapes.
- NUNCA cerrar change sin tests en verde → red-green manual (sin skill dedicada) (solape, borde inicio==fin, estados, 409/422).
- NUNCA commitear/pushear sin pedido explícito → commits en conventional commits, sin co-autoría IA.
- NUNCA trabajar en `main` → una rama por change o tarea, creada desde `main` actualizado y con su PR; la documentación general va en ramas `docs/...` aparte y se mergea antes de abrir ramas de changes.
- NUNCA `git add .` → rutas explícitas; antes de commitear: `git branch --show-current`, `git status --short` y `git --no-pager diff --cached --stat`.
- NUNCA reescribir el texto de changes archivados en `CHANGES.md` → las diferencias van en una nota de rectificación; solo se toca la línea `**Estado**` del change en curso.
- NUNCA citar una regla `RN-*` sin verificarla → `Select-String` sobre `knowledge-base/05_reglas_de_negocio.md`; lo ambiguo es pregunta abierta, no decisión silenciosa.
- NUNCA correr `pytest` con `DATABASE_URL` apuntando a la base `turnos` → los tests truncan tablas; usar `turnos_test`.
- NUNCA regenerar la fundación (`/active-orchestrator:init` y similares) ni dejar `AGENTS.md` y `CLAUDE.md` distintos.

---

## Flujo de Trabajo

```
1. Leer la KB relevante (knowledge-base/)        → entender el dominio
2. Identificar el change en CHANGES.md           → respetar dependencias
3. Crear la rama del change desde main           → nunca trabajar en main
4. /opsx:propose C-NN-nombre                     → proposal + design + specs + tasks; revisar los artefactos y verificar cada RN-* citada
5. /opsx:apply (cargando skills)                 → una task por vez con TDD: RED a la vista → GREEN mínimo → suite completa
6. /opsx:archive C-NN-nombre + marcar [x]        → cerrar el change
```

Aplicar TODAS las reglas duras en cada paso. Ante conflicto entre la KB y este archivo, las reglas duras prevalecen.

## Integración MCP: postgres (Postgres MCP Pro)

- **Propósito:** inspeccionar el esquema real de la base local de turnos
  (datos ficticios) al preparar changes, en vez de suponer constraints.
- **Herramientas verificadas:** `postgres_list_objects`,
  `postgres_get_object_details`, `postgres_execute_sql`.
- **Cuándo usarlo:** al explorar o escribir `design.md` y specs de un change
  que toque tablas, antes de asumir restricciones o índices.
- **Límites de acceso:** modo `restricted` (solo lectura). Toda consulta del
  agente a la base se hace únicamente con el MCP `postgres`. Al agente le
  está prohibido usar la terminal (`docker compose exec`, `psql` u otra vía) para consultar o
  modificar datos. Si el MCP rechaza una operación, informarlo tal cual y no
  buscar un atajo.
- **Requisito:** variable de entorno `DATABASE_URI` (nunca se guarda en el
  repositorio).
