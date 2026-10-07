# turnos-odontologia — Instrucciones para Agentes

> Este archivo (y su copia `CLAUDE.md`) es lo PRIMERO que todo agente lee al entrar al repo.
> Generado a partir de `knowledge-base/` y `CHANGES.md`. No editar a mano sin re-sincronizar ambos archivos.

---

## Stack Tecnológico

> Stack decidido en Q6 (2026-10-07, change C-01): Node.js + TypeScript + Express + Jest.

| Capa | Tecnología | Versión |
|------|------------|---------|
| Lógica de dominio | Node.js LTS + TypeScript estricto + Express 4 | Node 24, TS 5.6+, Express 4.21+ |
| Persistencia | En memoria / SQLite para tests; Postgres solo si el change lo justifica | — |
| Presentación | Sin UI obligatoria; API REST mínima (Express) si el change la necesita | — |
| Tests | Jest + ts-jest, CommonJS (skill `tdd`) | Jest 29+ |
| Integraciones (posteriores) | WhatsApp, Mercado Pago, ARCA, OS | — |

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

> ⚠️ Resolver las preguntas de prioridad **Alta** de `10_preguntas_abiertas.md` (Q1 reserva solo-recepción, Q6 stack) antes de arrancar el primer change.

---

## Skills Disponibles

| Agente | Rol | Skills que carga |
|--------|-----|------------------|
| Núcleo agenda | Turnos, solapes, estados, tests | `tdd` |
| Orquestación | SDD / KB / roadmap / reglas | `kb-creator`, `roadmap-generator`, `agents-md-generator`, `find-skills`, `active-orchestrator` |
| Cambios OpenSpec | Proponer / aplicar / archivar / explorar | `openspec-propose`, `openspec-apply-change`, `openspec-archive-change`, `openspec-explore`, `openspec-sync-specs`, `openspec-update-change` |
| Meta | Crear o mejorar skills | `skill-creator` |

Cargá la skill correspondiente al contexto ANTES de escribir código.

> Los compact rules de cada skill los resuelve el orquestador desde `.atl/skill-registry.md` (generado por `skill-registry`; no versionado — no está en el repo). Esta tabla solo mapea skill→rol.

---

## Roadmap de Changes

El plan de implementación completo está en [CHANGES.md](CHANGES.md). Resumen:

- **Total**: 11 changes en 4 fases.
- **Camino crítico** (5): `C-01 → C-02 → C-03 → C-10 → C-11` (recorte TP: `C-01 → C-02 → C-03`).
- **Primer change**: `C-01` (foundation-setup).

**Antes de cualquier `/opsx:propose`**: leé [CHANGES.md](CHANGES.md), identificá las dependencias del change y los archivos de "Leer antes".

---

## Reglas Duras

> Global `~/.claude/CLAUDE.md` ausente: no hay reglas heredadas. Todo lo contractual vive acá. Son contrato; romperlas es un defecto. Confirmadas con el usuario (stack Node+TS+Express+Jest; reglas derivadas del dominio + universales).

- NUNCA datos reales de pacientes → solo datos ficticios en seeds y tests.
- NUNCA secretos commiteados → tokens/keys solo vía env; `.env.example` sin valores reales.
- NUNCA crear turno sin validar solape de profesional + sillón en `[inicio,fin)` en un único ServicioTurnos → aplica RN-AG-02/03/04 en un solo punto.
- NUNCA 200/500 ante conflicto de negocio → 409 conflicto (solape/horario/bloqueo) vs 422 input inválido.
- NUNCA hard delete de turnos → cancelar es cambio de estado (RN-ES-01); cancelado/ausente no cuenta para solapes.
- NUNCA cerrar change sin tests en verde → red-green con skill `tdd` (solape, borde inicio==fin, estados, 409/422).
- NUNCA commitear/pushear sin pedido explícito → commits en conventional commits, sin co-autoría IA.

---

## Flujo de Trabajo

```
1. Leer la KB relevante (knowledge-base/)        → entender el dominio
2. Identificar el change en CHANGES.md           → respetar dependencias
3. /opsx:propose C-NN-nombre                     → proposal + design + specs + tasks
4. Implementar las tasks (cargando skills)       → respetando las reglas duras
5. /opsx:archive C-NN-nombre + marcar [x]        → cerrar el change
```

Aplicar TODAS las reglas duras en cada paso. Ante conflicto entre la KB y este archivo, las reglas duras prevalecen.
