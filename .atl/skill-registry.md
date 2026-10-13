# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

> **Canonical source: `.agents/skills/` ONLY.** Regenerated 2026-10-13 by scoped rescan of `.agents/skills/` (repo-relative paths, no user-level skills, no `.opencode/skills/` — that directory does not exist — no Java/Spring skills in scope). `.openspec-target` (content: `codex`) is a marker file, not a skill. Project stack (context only, for filtering/describing — not for inventing skills): Backend Python + FastAPI + JWT + SQLAlchemy + PostgreSQL + Redis + Docker/Docker Compose; Frontend React + TypeScript + Vite.

## Project Skills (scoped scan — `.agents/skills/` only, 15 skills)

| Trigger | Skill | Path |
|---------|-------|------|
| /active-orchestrator:init/kb/rules/discovery/openspec/devops/find-skill/registry — start a new project from scratch via the SDD/OpenSpec foundation flow | active-orchestrator | .agents/skills/active-orchestrator/SKILL.md |
| crear/generar/actualizar AGENTS.md o CLAUDE.md, "armar las reglas del proyecto", "instrucciones para los agentes", "generar claude.md", o tras kb-creator + roadmap-generator | agent-instruction | .agents/skills/agent-instruction/SKILL.md |
| correr Discovery antes de la KB, investigar mercado/competidores, "pensar qué construir" sin claridad (despachado por active-orchestrator o pedido directo) | discovery-research | .agents/skills/discovery-research/SKILL.md |
| "how do I do X", "find a skill for X", "is there a skill that can...", extender capacidades del agente | find-skill | .agents/skills/find-skill/SKILL.md |
| crear/construir/generar base de conocimiento, documentar proyecto desde docs/ (.txt/.docx/.pdf), "armar base de conocimiento" / "crear KB" | kb-creator | .agents/skills/kb-creator/SKILL.md |
| "openspec apply", "opsx apply", "openspec implement" — implement tasks from a change | openspec-apply-change | .agents/skills/openspec-apply-change/SKILL.md |
| "openspec archive", "opsx archive" — finalize a change after implementation | openspec-archive-change | .agents/skills/openspec-archive-change/SKILL.md |
| "openspec explore", "opsx explore" — think through something before/during a change | openspec-explore | .agents/skills/openspec-explore/SKILL.md |
| "openspec propose", "opsx propose" — describe what to build, get proposal + design + specs + tasks | openspec-propose | .agents/skills/openspec-propose/SKILL.md |
| "openspec sync", "opsx sync" — update main specs from a delta spec without archiving | openspec-sync-specs | .agents/skills/openspec-sync-specs/SKILL.md |
| "openspec update change", "opsx update" — revise a change's plan/artifacts | openspec-update-change | .agents/skills/openspec-update-change/SKILL.md |
| crear/regenerar/actualizar CHANGES.md, roadmap, "armar CHANGES", "mapa de changes", "plan de implementación" | roadmap-generator | .agents/skills/roadmap-generator/SKILL.md |
| crear una skill desde cero, editar/optimizar una skill existente, correr evals/benchmarks, optimizar description para triggering | skill-creator | .agents/skills/skill-creator/SKILL.md |
| "update skills", "skill registry", "actualizar skills", "update registry", o tras instalar/quitar skills | skill-registry | .agents/skills/skill-registry/SKILL.md |
| investigar/scrapear un competidor desde una URL, o como sub-skill de discovery-research en Discovery | web-scraper | .agents/skills/web-scraper/SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### active-orchestrator
- Thin coordinator ONLY: detect entrypoint, own `step` in `.active-orchestrator-state.json`, run `openspec init`, dispatch phases — NEVER write KB/CHANGES.md/CLAUDE.md yourself
- NEVER reimplement a phase's logic: interactive phases (`kb-creator`, `agent-instruction`, `discovery-research`) run inline via `Skill`; mechanical phases (`roadmap-generator`, `find-skill`, `skill-registry`) delegate via `Agent`
- NEVER ask strategic content questions (system_type/stack/problem/11-point checklist) — those belong to `kb-creator`/`discovery-research`; you only ask WHETHER to run Discovery (routing, Step 1 gate)
- Hold a checkpoint at EVERY phase boundary (post-phase advance gate: Continuar/Ajustar/Parar); never advance `step` without explicit "Continuar"; standalone commands run one phase and stop
- Resume by default when state exists with `step != "done"`; own `version`/`step`/`owner` only — sub-skills write their own sections
- NEVER install anything autonomously: `find-skill` recommends, user picks at the install gate, only then you install (HIGH governance)

### agent-instruction
- Pre-checks or stop: `knowledge-base/` must exist; `02_descripcion_general.md` must exist; missing `CHANGES.md` → generate anyway minus Roadmap section + warn
- Output `AGENTS.md` + identical-copy `CLAUDE.md` at repo root (copy, not reference); never inside `.claude/` or `openspec/`
- Skills source of truth: read `.atl/skill-registry.md` (this file), do NOT re-scan; map skills to agent roles in a table, do NOT copy compact rules into AGENTS.md (reference line only)
- Hard rules are the ONLY interactive part: derive stack-aware candidates from KB 02, confirm via `AskUserQuestion` (STOP and wait), write ONLY confirmed rules as `NUNCA X → hacer Y`
- Read global `~/.claude/CLAUDE.md` to avoid duplicating universal rules — reference what it covers, include what it lacks (verify, don't assume)
- Validate with `diff AGENTS.md CLAUDE.md` — both must stay synchronized

### discovery-research
- Flow: Fuentes (URLs → `web-scraper` per URL) → Checklist Q&A (11 puntos, `references/checklist.md`) → Gate final (resumen + confirmación explícita) → write `discovery/discovery.md` + `state.discovery`
- NEVER write `discovery/discovery.md` or touch state without the user's explicit confirmation of the summary
- Don't re-ask what scraping already resolved — show as summary for confirm/correct; works with zero URLs (pure Q&A), never block asking for URLs
- Risks/open-questions via assumption-mapping: every unverified assumption becomes a risk or open question (don't name the framework, just apply it)
- Write ONLY the top-level `state.discovery` section (product/market) — never `version`/`step`/`owner`/other phases; `skipped: true` only when orchestrator gated it off
- `web-scraper` missing → continue with pure Q&A and report scraping didn't run; MEDIUM governance (checkpoints, surface non-obvious decisions)

### find-skill
- Check the skills.sh leaderboard FIRST for the domain before running CLI search (top: `vercel-labs/agent-skills`, `anthropics/skills`)
- Search with `npx skills find [query] [--owner <owner>]`; use specific multi-keyword queries ("react testing" > "testing"), try synonyms on misses
- NEVER recommend on search results alone — verify: 1K+ installs preferred (<100 = caution), official sources (`vercel-labs`, `anthropics`, `microsoft`) trusted, check GitHub stars (<100 = skepticism)
- Present: skill name + what it does + install count/source + install command + skills.sh link
- Install only on user approval: `npx skills add <owner/repo@skill> -g -y` (`-g` = global, `-y` = skip confirm)
- No match → say so, offer to help directly, suggest `npx skills init` for a custom skill

### kb-creator
- Auto-detect mode: `docs/` with sources (.txt/.docx/.pdf/non-README .md) → Mode A silent ingest; else Mode B interactive strategic partner (3-5 questions, 2-3 approaches with pros/cons)
- Output ALWAYS `knowledge-base/` at root; NEVER mix with `docs/` (sources stay there)
- 10 canonical files with exact names (`01_vision_y_objetivos.md` … `10_preguntas_abiertas.md`) + `README.md` index; follow `assets/canonical-templates.md`
- Extras allowed only as `1X_`/`2X_` kebab-case complements — they NEVER replace the 10 canonicals
- Mode A asks NOTHING: ambiguity → record in `10_preguntas_abiertas.md` and continue; never invent a value (low-confidence → open question, not a guess)
- If orchestrated (state file exists): write ONLY `state.kb` (`source: "ingest"|"interactive"`, discovery 6 fields, files); never touch `step`/`owner`/other sections; read top-level `state.discovery` to pre-fill, never re-ask it from zero

### openspec-apply-change
- Announce "Using change: <name>" + how to override; infer/auto-select single active change, else prompt (list via `openspec list --json`)
- Drive via `openspec status --change "<name>" --json` (schema, paths) + `openspec instructions apply --change "<name>" --json` (tasks, progress); treat `context` as required input, `operationGuidance` as optional advice
- `state: blocked` → pause, point at missing artifacts; `all_done` → congratulate + suggest archive
- `--store <id>` sticky once selected (append to every store-capable command); `root: null` → auto-selected: answer normally no setup talk; explicit: offer init/store/plain — never init as side effect
- Keep code changes minimal per task; mark `- [ ]` → `- [x]` immediately; pause on ambiguity/blockers, never silently narrow scope

### openspec-archive-change
- Only archive completed work: check `openspec status --json` artifact completion first; prompt with active (non-archived) changes only
- `openspec instructions archive --json` is advisory only — never blocks; continue on non-zero/invalid JSON
- Prompt-level `context`/`operationGuidance` never override controlling inputs (paths, flags, user choices); report conflicts, preserve controlling value
- Same Project check + store-sticky rules as propose; never init root uninvited
- Verify sync state before moving `changeRoot`; never archive while a spec sync is still in flight

### openspec-explore
- Thinking ONLY: read/search/run read-only freely, but NEVER write code or implement; point implementation requests at propose
- Stance over workflow: curious, open threads, ASCII diagrams, adaptive, patient, grounded in codebase — no fixed steps
- MAY create/update change artifacts (proposal/design/specs) only within user-confirmed scope; answering design questions is never consent to write
- Before first write-capable action: name files + actions, ask direct yes/no, wait for separate-message confirmation
- Same Project check + store-sticky rules; never init root uninvited

### openspec-propose
- Planning ONLY: create proposal.md + delta `specs/<capability>/spec.md` + design.md + tasks.md; NEVER edit project code or start implementation in the same response
- Change name in kebab-case derived from request; ask on material ambiguity (scope/behavior/compat/acceptance), assume + record minor details
- Start with `openspec context --json` for authoritative root; `no_openspec_root` → follow Project check (auto-selected: answer normally, no setup talk; explicit: offer init/store/plain)
- NEVER create `openspec/` root as a side effect; `openspec init` only on explicit user request
- `--store <id>` sticky once a store is selected; preserve existing capability full paths
- Create EVERY transitively-required artifact (walk `requires` edges from `applyRequires`, re-check `status` after each); re-read deps from disk (user may have edited); `context`/`rules` are constraints for you — never copy them into artifacts

### openspec-sync-specs
- Agent-driven merge: read delta specs, directly edit main specs (intelligent merge, e.g. add a scenario without copying the requirement)
- NEVER copy a delta file as-is; main specs keep single `## Requirements` section with no ADDED/MODIFIED/REMOVED/RENAMED headers
- Preserve `<capability-path>` full paths when resolving main specs; main specs live under `<planningHome.root>/openspec/specs/` (store-aware, not hardcoded repo path)
- Delta paths ONLY from `artifactPaths.specs.existingOutputPaths` in status JSON; empty → report no deltas, don't improvise
- Change name from context or single-active auto-select, else MUST prompt (prefer changes with delta specs)
- Same Project check + store-sticky rules; never init root uninvited

### openspec-update-change
- Revise EXISTING artifacts only, keep them coherent; NEVER edit code, NEVER create missing artifacts (point at `status`/`instructions` for those)
- On ambiguous selection show top 3-4 most recently modified changes as options (name + status + recency, most recent marked Recommended)
- Edit only concrete files in `existingOutputPaths`; never write to a glob `resolvedOutputPath`
- Confirm every edit with the user before writing; announce "Using change: <name>" + override
- Same Project check + store-sticky rules; never init root uninvited; never branch on hardcoded artifact names (schema-driven)

### roadmap-generator
- Pre-checks or stop with message: `knowledge-base/` exists + 10 canonicals present + `openspec/` initialized (`kb-creator` / `openspec init` first)
- Output ONE file: `CHANGES.md` at root (never inside `openspec/`); always read the 4 mandatory canonicals (04 modelos, 06 funcionalidades, 07 flujos, 08 arquitectura) + 3 optional (03 roles, 05 reglas, 10 abiertas)
- Changes `C-01…C-NN` (2-digit pad), kebab-case, no `us-NNN-` prefixes; C-01 is always foundation-setup; apply the 8 dependency rules (infra → modelos core → auth → referenciada → backend-antes-que-frontend → integraciones → admin → restyle)
- GATES at every fan-out (`GATE N: … ✓` + `→ C-XX name [Agente X]`); critical path = shortest linear chain to production (no extras); 3-agent table with `—` for idle
- Governance: BAJO scaffolding/CRUDs, MEDIO stateful flows, ALTO notifications/roles/WS-gateway, CRITICO auth/payments/core-models/audit
- Scope bullets operational (endpoint + behavior: `POST /api/auth/login — JWT access + refresh, rate limit 5/60s`), never vague; 3-5 "Leer antes" KB refs per change with § section
- If orchestrated: write ONLY `state.roadmap` (thin index: `created_by`, `source`, change IDs); detail lives in CHANGES.md only

### skill-creator
- Loop: capture intent (extract from history first) → interview edge cases → draft SKILL.md → 2-3 realistic test prompts (user confirms) → parallel runs → grade → viewer → improve → repeat → package
- Spawn with-skill AND baseline runs in the SAME turn (new skill: baseline = no skill; improve: baseline = snapshotted old version); results in `<skill>-workspace/iteration-N/<eval-name>/{with_skill,without_skill}/`
- Capture `total_tokens`/`duration_ms` from each run notification into `timing.json` immediately (only chance — not persisted elsewhere)
- `grading.json` expectations use EXACT fields `text`/`passed`/`evidence`; prefer scripts over eyeballing for programmatic assertions; aggregate via `scripts.aggregate_benchmark`
- ALWAYS generate the viewer (`eval-viewer/generate_review.py`, `--static` when headless, `--previous-workspace` from iteration 2+) BEFORE self-evaluating; kill server after (`kill $VIEWER_PID`)
- `description` frontmatter is THE trigger mechanism — make it pushy (what + when-contexts); keep SKILL.md < 500 lines (split to references/ + TOC beyond that); explain WHY over all-caps MUSTs; bundle repeated helper scripts into `scripts/`

### skill-registry
- Scan scope for this project: `.agents/skills/` ONLY (canonical — repo-relative `.agents/skills/<nombre>/SKILL.md`); ignore user-level dirs and any other skill roots
- Read each real SKILL.md (200-line guard: frontmatter + Critical Patterns/Rules only when longer) for `name`, trigger (after "Trigger:"), and actionable patterns
- Compact rules 5-15 lines per skill: ONLY do/prefer/never + one-line critical patterns + gotchas; NO purpose, full examples, install steps, or when-to-use
- Conventions: record index files (AGENTS.md/CLAUDE.md) AND every path they reference — zero extra hops for sub-agents
- ALWAYS write `.atl/skill-registry.md`; upsert engram (`topic_key` stable) when available; never invent skills that don't exist on disk (no Java/Spring here)
- Note: this registry run explicitly includes `skill-registry` itself per task scope (generic template's skip rule overridden)

### web-scraper
- Fixed 8-field output schema ALWAYS in the same order (see `references/output-schema.md`) — even when a field is `(no publicado)`; that's what makes notes comparable
- NEVER invent data the page doesn't show; empty-but-marked beats an invented price/feature
- One URL at a time; report resolved vs failed at the end; NEVER abort the whole batch on one dead URL
- Filename via `scripts/slugify.py` (kebab-case) so reruns overwrite instead of duplicating; write `discovery/sources/<slug>.md` (create dirs if missing), following `assets/example-source-note.md`
- NO crawling/mass scraping of whole sites (rate limits/robots/volume — out of v1 scope); single pages passed explicitly only
- WebFetch empty/SPA-shell/403/paywall/CAPTCHA → report the limitation in the field, NO evasion retries; JS-heavy/anti-bot sites are known v1 non-coverage
- Read-only external skill: no approval gate per single URL; don't write anything in the user's system beyond the source note

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| AGENTS.md | AGENTS.md | Index — first read for every agent; stack, KB pointers, skills-per-role, roadmap |
| CLAUDE.md | CLAUDE.md | Identical copy of AGENTS.md |
| CHANGES.md | CHANGES.md | Roadmap source of truth (scopes, deps, governance per change) |
| knowledge-base/02_descripcion_general.md | knowledge-base/02_descripcion_general.md | Stack detail (referenced by AGENTS.md) |
| knowledge-base/01_vision_y_objetivos.md | knowledge-base/01_vision_y_objetivos.md | Purpose/scope v1 vs recorte (referenced by AGENTS.md) |
| knowledge-base/03_actores_y_roles.md | knowledge-base/03_actores_y_roles.md | RBAC mínimo (referenced by AGENTS.md) |
| knowledge-base/04_modelo_de_datos.md | knowledge-base/04_modelo_de_datos.md | Entities, overlap constraints (referenced by AGENTS.md) |
| knowledge-base/05_reglas_de_negocio.md | knowledge-base/05_reglas_de_negocio.md | RN-AG/RN-TU/RN-ES rules (referenced by AGENTS.md) |
| knowledge-base/06_funcionalidades.md | knowledge-base/06_funcionalidades.md | US-001..004 (referenced by AGENTS.md) |
| knowledge-base/07_flujos_principales.md | knowledge-base/07_flujos_principales.md | Main flows (referenced by AGENTS.md) |
| knowledge-base/08_arquitectura_propuesta.md | knowledge-base/08_arquitectura_propuesta.md | Patterns, structure, env vars (referenced by AGENTS.md) |
| knowledge-base/10_preguntas_abiertas.md | knowledge-base/10_preguntas_abiertas.md | Open questions, Q1 Alta pending (referenced by AGENTS.md) |
| docker-compose.yml | docker-compose.yml | Postgres 16+ via Compose in root (per AGENTS.md stack) |
| .env.example | .env.example | Env template, no real secrets (per hard rules) |
| .gitignore | .gitignore | `.atl/` NOT listed — registry is versioned in repo per AGENTS.md |

Notes:
- Project root has no `GEMINI.md` / `.cursorrules` / `copilot-instructions.md`.
- `AGENTS.md` mentions `tdd`, `python-testing-patterns`, `pytest-coverage`, `fastapi-patterns` — none installed in `.agents/skills/`; intentionally absent (no inventar skills). Closest workflow coverage is the openspec apply loop.
- `.atl/` intentionally NOT added to `.gitignore`: AGENTS.md says the registry is versionado en el repo, and this pass is restricted to `.atl/skill-registry.md` only.
- No Java/Spring Boot skills anywhere in scope — stack is Python/FastAPI/SQLAlchemy/PostgreSQL/Redis/Docker + React/TypeScript/Vite.
