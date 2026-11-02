# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| /active-orchestrator:init, /active-orchestrator:kb, /active-orchestrator:rules, /active-orchestrator:discovery, /active-orchestrator:openspec, /active-orchestrator:devops, /active-orchestrator:find-skill — or when starting a new project from scratch using the SDD/OpenSpec foundation flow | active-orchestrator | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\active-orchestrator\SKILL.md |
| when the user asks to create/generate/update AGENTS.md or CLAUDE.md, "armar las reglas del proyecto", "instrucciones para los agentes", "generar claude.md", or after kb-creator + roadmap-generator | agents-md-generator (agent-instruction) | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\agent-instruction\SKILL.md |
| define or audit a project's visual identity during Active Orchestrator foundation, or when an older project first needs UI work | design-system | C:\Users\andre\.config\opencode\skills\design-system\SKILL.md |
| when exact backward compatibility with the original v1 taste-skill is required | design-taste-frontend-v1 | C:\Users\andre\.config\opencode\skills\design-taste-frontend-v1\SKILL.md |
| when jr-orchestrator dispatches the discovery phase, or when the user wants to investigate the market/think what to build before having clarity | discovery-research | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\discovery-research\SKILL.md |
| when doing UI polish, component design, animation decisions, and invisible details that make software feel great | emil-design-eng | C:\Users\andre\.config\opencode\skills\emil-design-eng\SKILL.md |
| when looking for an installable skill for X ("how do I do X", "find a skill for X", "is there a skill that can...") | find-skills (find-skill) | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\find-skill\SKILL.md |
| when the user asks to create/build/generate a knowledge base, document a project from source docs (.txt/.docx/.pdf), or "armar base de conocimiento"/"crear KB"/"documentar proyecto" | kb-creator | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\kb-creator\SKILL.md |
| when the user asks "implementar lista de espera", "agregar lista de espera", "rellenar cancelaciones", "ofrecer hueco a paciente en lista", "waitlist", "C-06" or "US-004" (turnos-odontologia backend) | lista-espera-odontologia | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\lista-espera-odontologia\SKILL.md |
| when the user wants to start implementing, continue implementation, or work through tasks; also "openspec apply"/"opsx apply"/"openspec implement" | openspec-apply-change | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\openspec-apply-change\SKILL.md |
| when the user wants to finalize and archive a change after implementation is complete; also "openspec archive"/"opsx archive" | openspec-archive-change | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\openspec-archive-change\SKILL.md |
| when the user wants to think through something before or during an OpenSpec change; also "openspec explore"/"opsx explore" | openspec-explore | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\openspec-explore\SKILL.md |
| when the user wants to quickly describe what to build and get a complete proposal (design, specs, tasks); also "openspec propose"/"opsx propose" | openspec-propose | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\openspec-propose\SKILL.md |
| when the user wants to update main specs with changes from a delta spec without archiving; also "openspec sync"/"opsx sync" | openspec-sync-specs | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\openspec-sync-specs\SKILL.md |
| when the user wants to revise a change's plan, fold new decisions, or reconcile artifacts after an edit; also "openspec update change"/"opsx update" | openspec-update-change | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\openspec-update-change\SKILL.md |
| when the user asks to create/build/regenerate/update CHANGES.md, roadmap, change map, implementation plan; or "armar CHANGES"/"armar roadmap"/"crear mapa de changes"/"generar plan de implementación" | roadmap-generator | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\roadmap-generator\SKILL.md |
| when users want to create a skill from scratch, edit or optimize an existing skill, run evals, benchmark, or optimize a skill's description | skill-creator | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\skill-creator\SKILL.md |
| when the user asks to investigate/scrape a competitor from a URL, or discovery-research invokes it during Discovery | web-scraper | C:\Users\andre\Documents\GitHub\turnos-odontologia\.agents\skills\web-scraper\SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### active-orchestrator
- Owns `.active-orchestrator-state.json`; writes only `version`, `step`, `owner`; sub-skills write their own sections.
- Never reimplement a phase's logic inline — always route to its sub-skill (Skill for interactive, Agent for mechanical).
- Run foundation phases in order: discovery (optional) → kb-creator → roadmap-generator → find-skill → skill-registry → agent-instruction; checkpoint at every boundary.
- Never chain phases without a checkpoint; advance `step` only on explicit "Continuar".
- Never install skills autonomously — find-skill recommends, user picks at the install gate.
- Resume by default when state exists with step != "done".
- Graceful degradation: if a sub-skill is missing, offer install; otherwise skip the phase and mark it skipped in state.

### agents-md-generator
- Generate `AGENTS.md` + `CLAUDE.md` (copy) at project root; never inside `.claude/` or `openspec/`.
- Read KB (`02_descripcion_general.md`, `README.md`), `CHANGES.md`, `.atl/skill-registry.md` (source of truth for skills), `10_preguntas_abiertas.md`, and global `~/.claude/CLAUDE.md` to avoid duplicating inherited rules.
- Only interactive part: confirm hard rules (stack-aware, derived from the real stack) via AskUserQuestion; never hardcode language assumptions.
- `AGENTS.md` maps skill→rol only; do NOT copy compact rules (they live only in `.atl/skill-registry.md`).
- Pre-checks: `knowledge-base/` exists with `02`; `CHANGES.md` exists (else omit Roadmap section and warn).
- Global rules present → reference, don't duplicate; include universals the global lacks.

### design-system
- Resolve `visual_design.mode` once (system-and-mockups | system-only | off | deferred); honor recorded choice, don't re-ask unless user explicitly changes.
- For system-and-mockups/system-only, build portable foundation at project root: `design-system/README.md` (Mode, Revision, Approval), `brand.md`, `brand.js`, `tokens.css`, `components.html`, `assets/logo.svg`, `previews/`.
- Never overwrite an existing identity; audit real logo/colors/typography first in existing apps.
- Requires explicit user approval before `Approval: approved`; a revision bump resets approval to pending.
- Render `components.html` at 390x844 and 1440x900; save captures in `previews/`.
- For off/deferred, create only `README.md` with Mode/Approval; no provisional branding.

### design-taste-frontend-v1
- Baseline dials: DESIGN_VARIANCE 8, MOTION_INTENSITY 6, VISUAL_DENSITY 4 (adapt on explicit user request).
- Verify dependencies in `package.json` before importing any 3rd-party lib; never assume a library exists.
- RSC by default; isolate interactivity in leaf `'use client'` components; global state only in client components.
- Tailwind v3/v4: check version; v4 uses `@tailwindcss/postcss`, not the `tailwindcss` plugin.
- Never use emojis in code/markup/alt text; use icons/SVG.
- Never use `h-screen` for full-height hero; use `min-h-[100dvh]`; prefer CSS Grid over flex percentage math.
- Max 1 accent color, saturation <80%; ban "AI purple/blue" glows; use neutral bases (Zinc/Slate) with a singular accent.
- Never animate from `scale(0)`; start ≥ `scale(0.95)` with opacity; popovers origin-aware (modals centered).
- UI animations <300ms; never animate keyboard-initiated actions; use custom easing curves, never `ease-in`.
- Only animate `transform` & `opacity`; use CSS transitions over keyframes for interruptible UI.
- Respect `prefers-reduced-motion` (fewer/gentler, not zero); gate hover behind `@media (hover: hover) and (pointer: fine)`.

### discovery-research
- Runs before kb-creator; produces `discovery/discovery.md` + `state.discovery` (11-point checklist).
- Phase 1: ask for competitor URLs; if provided, invoke web-scraper per URL (don't reimplement scraping).
- Phase 2: Q&A over 11 points via `references/checklist.md`; don't re-ask what scraping already revealed.
- Phase 3: show summary of 11 points; never write files without explicit user confirmation.
- Phase 4: write `discovery/discovery.md` (prose) + `state.discovery` slice only; never touch `version`/`step`/`owner`/other sections.
- If web-scraper unavailable, continue with pure Q&A and warn the user.
- Governance MEDIO: checkpoints; assumption-mapping for risks/open questions.

### emil-design-eng
- Initial response when invoked without a specific question: only "I'm ready to help..." then wait.
- Review UI code using a markdown table Before/After/Why (not lists).
- Animation decision framework: should it animate (frequency-based: 100+/day none, tens/day reduce, occasional standard, rare delight); never animate keyboard-initiated actions.
- Easing: enter/exit → ease-out; on-screen movement → ease-in-out; hover/color → ease; constant → linear; never `ease-in` for UI; use custom curves (`cubic-bezier(0.23,1,0.32,1)`).
- UI animations <300ms; springs for drag/interruptible gestures; keep bounce subtle (0.1-0.3).
- Buttons: `scale(0.97)` on `:active`; never animate from `scale(0)`; popovers origin-aware (modals centered); tooltips skip delay on subsequent hovers.
- Use CSS transitions over keyframes for interruptible UI; blur ≤20px to mask imperfect transitions; `@starting-style` for entry.
- Only animate `transform` & `opacity`; CSS variables are inheritable (update `transform` directly in drawers, not the variable).
- Framer Motion `x`/`y` shorthand is not hardware-accelerated; use the `transform` string for GPU; CSS animations beat JS under load.
- Respect `prefers-reduced-motion` (fewer/gentler, not zero); gate hover behind a media query.

### find-skills
- Use `npx skills find [query] [--owner]` to search; check the skills.sh leaderboard first.
- Verify quality before recommending: prefer 1K+ installs, official sources, GitHub stars; caution under 100 installs.
- Present options with name, what it does, install count, source, install command, skills.sh link.
- Install with `npx skills add <owner/repo@skill> -g -y` (global).
- Categories: web dev, testing, devOps, docs, code quality, design, productivity.
- No matches → acknowledge, offer direct help, suggest `npx skills init`.

### kb-creator
- Auto-detect mode: Mode A (silent) if `docs/` has sources; Mode B (interactive) if no `docs/` or empty.
- Output the 10 canonical files + `README.md` in `knowledge-base/` at project root; never mix with `docs/`.
- Optional extras with `1X_` or `2X_` prefix.
- Mode A: read all sources, generate without questions; register doubts in `10_preguntas_abiertas.md`.
- Mode B: strategic partner; 3-5 strategic questions per round; propose approaches; iterate file by file.
- State integration: only writes `state.kb` if `.active-orchestrator-state.json` exists; sets source ingest/interactive; never touches step/owner/roadmap/skills/agents.
- Mode A → source "ingest"; Mode B → source "interactive".

### lista-espera-odontologia
- Implements C-06 lista-de-espera (US-004); depends on C-04; consumes `ServicioTurnos.crear()` from C-03; governance MEDIO.
- Hard rules: never create turno without solape validation via `ServicioTurnos.crear()`; never 200/500 on business conflict (409 vs 422); never hard delete (baja is state change); never close without green tests; only fictitious data.
- Create module `backend/app/lista_espera/` (models, schemas, service, router), migration `003`, tests; register router in `main.py` and table in `conftest._CATALOGO_TABLES`.
- Model `ListaEspera`: states pendiente/ofrecido/asignado/baja; FKs RESTRICT; `profesional_id` nullable; FIFO by `creado_en`.
- Ofrecer creates turno via `ServicioTurnos.crear()`; on conflict revert to pendiente and raise 409.
- Responder: acepta → asignado; rechaza → cancel turno, estado baja, return next in FIFO.
- Tests: alta pendiente, FIFO order, filter by profesional, ofrecer creates valid turno, conflict reverts, rechazo passes to next, aceptar marks asignado.

### openspec-apply-change
- Implements tasks from an OpenSpec change; planning boundary: planning artifacts only, never edit code during propose.
- Store selection: pass `--store <id>` when a store is named/used; otherwise acts on nearest local `openspec/` root.
- Project check: run `openspec list --json`; `root: null` means not set up (don't create the root as a side effect).
- Steps: select change → status → apply instructions → read context files → show progress → implement tasks loop → status.
- Mark task complete (`- [ ]` → `- [x]`) after each; pause on ambiguity/blocker/error.
- Guardrails: minimal focused changes; pause before guessing; surface added scope.

### openspec-archive-change
- Archives a completed change; store selection + project check same as apply.
- Archive only after implementation is complete; run store selection and project check before any write.
- Use `openspec archive` with the selected store flag when applicable.

### openspec-explore
- Thinking partner mode; never implements or writes code; may read files/search/run read-only commands.
- Never write code; if the user asks to implement, point to `/opsx-propose`.
- May create/update OpenSpec change artifacts within confirmed scope only after explicit confirmation.
- Use ASCII diagrams (plain ASCII only, no unicode glyphs).
- Ground in the actual codebase; don't fake understanding; don't rush.
- Guardrails: don't auto-capture; don't manually scaffold changes; do visualize.

### openspec-propose
- Propose a new change: create the change + generate all artifacts (proposal, specs, design, tasks) in one step.
- Planning boundary: planning only, never edit code; wait for a new user request to apply.
- Steps: clarify → load context → determine schema → create change dir → get build order → create every artifact in the required set (transitively) → final status.
- Read dependency artifacts from disk before creating; inspect the relevant project read-only.
- Never copy `context`/`rules` into artifact files (constraints only).

### openspec-sync-specs
- Sync delta specs from a change to main specs (agent-driven merge).
- Store selection + project check; main specs live under `planningHome.root/openspec/specs/`.
- Use `artifactPaths.specs.existingOutputPaths` as the only source of delta spec paths.
- Apply ADDED/MODIFIED/REMOVED/RENAMED intelligently; preserve content not mentioned; never copy delta as-is.
- For a new capability, only ADDED is allowed; MODIFIED/RENAMED block; REMOVED skipped + warn.
- Validate with `openspec validate --specs`; report summary.
- Never write an empty `## Requirements`; never leave an empty section.

### openspec-update-change
- Revise existing planning artifacts of a change; never edits code; never creates missing artifacts.
- Store selection + project check.
- Read existing artifacts + others; draft edit in conversation; reconcile inconsistencies in any direction.
- Confirm each edit with the user before writing; reject → leave unchanged.
- If intent changed (not refined), ask for a new change name and recommend `openspec new change`.

### roadmap-generator
- Generates `CHANGES.md` at project root; fire-and-forget, no questions.
- Pre-checks: `knowledge-base/` exists with 10 canónicos; `openspec/` exists; else stop with a clear message.
- Read 4 canonicals (04, 06, 07, 08) + optional (03, 05, 10).
- Output format fixed: how to use, dependency tree, parallelism gates, critical path, 3-agent plan, phases with C-NN changes (Estado, Scope, Dependencias, Governance, Leer antes).
- Rules: C-01 always foundation-setup; entities before references; backend before frontend; integrations/payments last; admin/dashboards last; visual refactors last.
- Governance: BAJO (scaffolding/CRUD/pages), MEDIO (state flows/sessions/WS non-critical), ALTO (notifications/roles/WS gateway/observability), CRITICO (auth/payments/security/core models).
- Scope: operational bullets (endpoints, migrations, tests), not descriptive.
- Leer antes: 3-5 canonical files per change with section refs.
- State integration: writes `state.roadmap` only if state file exists; never touches step/owner.

### skill-creator
- Create/improve skills; capture intent, interview, write SKILL.md, test cases, eval, iterate.
- SKILL.md: name, description (pushy triggering), optional compatibility, body <500 lines; progressive disclosure (metadata always, body on trigger, resources as needed).
- Test cases in `evals/evals.json`; run with-skill + baseline in parallel; grade; aggregate benchmark; launch viewer.
- Improve based on feedback; generalize; keep prompt lean; explain why.
- Description optimization: generate 20 trigger eval queries (should/shouldn't trigger), review with user, run optimization loop (`run_loop.py`), apply `best_description`.
- Never use `/skill-test`; use `generate_review.py`.

### web-scraper
- Convert a competitor URL into a structured markdown note (fixed 8-field schema) at `discovery/sources/<slug>.md`.
- Read-only external; no approval gate for a single URL; process multiple URLs one by one, report successes/failures.
- `WebFetch` with structured prompt for 8 fields; mark `(no publicado)` if not public; never invent data.
- On empty/blocked (403/paywall/CAPTCHA/SPA shell), report the limitation, don't evade; continue to the next URL.
- No crawling/mass scraping; only explicitly provided URLs.
- Slugify via `scripts/slugify.py` for consistent filenames.

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| AGENTS.md | AGENTS.md | Index — references files below |
| CLAUDE.md | CLAUDE.md | Copy of AGENTS.md (index) |
| 01_vision_y_objetivos.md | knowledge-base/01_vision_y_objetivos.md | Referenced by AGENTS.md |
| 02_descripcion_general.md | knowledge-base/02_descripcion_general.md | Referenced by AGENTS.md (stack table) |
| 03_actores_y_roles.md | knowledge-base/03_actores_y_roles.md | Referenced by AGENTS.md (RBAC) |
| 04_modelo_de_datos.md | knowledge-base/04_modelo_de_datos.md | Referenced by AGENTS.md (entities/constraints) |
| 05_reglas_de_negocio.md | knowledge-base/05_reglas_de_negocio.md | Referenced by AGENTS.md (RN-AG/RN-TU/RN-ES) |
| 06_funcionalidades.md | knowledge-base/06_funcionalidades.md | Referenced by AGENTS.md (US-001..004) |
| 07_flujos_principales.md | knowledge-base/07_flujos_principales.md | Referenced by AGENTS.md (flows) |
| 08_arquitectura_propuesta.md | knowledge-base/08_arquitectura_propuesta.md | Referenced by AGENTS.md (patterns/env) |
| 10_preguntas_abiertas.md | knowledge-base/10_preguntas_abiertas.md | Referenced by AGENTS.md (open questions) |
| CHANGES.md | CHANGES.md | Referenced by AGENTS.md (roadmap) |
| .atl/skill-registry.md | .atl/skill-registry.md | Referenced by AGENTS.md (compact rules source) |
| frontend/design-system/README.md | frontend/design-system/README.md | Referenced by AGENTS.md (design system, system-only) |

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.
