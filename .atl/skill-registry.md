# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| /active-orchestrator:init, /active-orchestrator:kb, /active-orchestrator:rules, /active-orchestrator:discovery, /active-orchestrator:openspec, /active-orchestrator:devops, /active-orchestrator:find-skill — new project from scratch (SDD/OpenSpec foundation flow) | active-orchestrator | C:\Users\FACUNDO\.config\opencode\skills\active-orchestrator\SKILL.md |
| Crear/generar/actualizar AGENTS.md o CLAUDE.md, "armar las reglas del proyecto", "instrucciones para los agentes" | agents-md-generator | C:\Users\FACUNDO\.config\opencode\skills\agent-instruction\SKILL.md |
| "how do I do X", "find a skill for X", "is there a skill that can...", extending capabilities | find-skills | C:\Users\FACUNDO\.config\opencode\skills\find-skill\SKILL.md |
| "crear base de conocimiento", "generar KB desde los docs", "armemos la documentación desde cero" | kb-creator | C:\Users\FACUNDO\.config\opencode\skills\kb-creator\SKILL.md |
| "armar CHANGES", "armar roadmap", "crear mapa de changes", "generar plan de implementación", "qué changes necesito", "índice de changes" | roadmap-generator | C:\Users\FACUNDO\.config\opencode\skills\roadmap-generator\SKILL.md |
| Create/edit/optimize a skill, run skill evals, benchmark skill performance | skill-creator | C:\Users\FACUNDO\.config\opencode\skills\skill-creator\SKILL.md |
| Build features or fix bugs test-first, "red-green-refactor", integration tests | tdd | C:\Users\FACUNDO\.agents\skills\tdd\SKILL.md |
| Writing Python tests, setting up suites, pytest fixtures/mocking/TDD | python-testing-patterns | C:\Users\FACUNDO\.agents\skills\python-testing-patterns\SKILL.md |
| Run pytest with coverage, find uncovered lines, drive to 100% | pytest-coverage | C:\Users\FACUNDO\.agents\skills\pytest-coverage\SKILL.md |
| Building/reviewing FastAPI apps — Pydantic v2, DI, async, auth, httpx+pytest | fastapi-patterns | C:\Users\FACUNDO\.agents\skills\fastapi-patterns\SKILL.md |

## Project Skills (.agents/skills — take precedence over user-level on name clash)

| Trigger | Skill | Path |
|---------|-------|------|
| "openspec apply", "opsx apply", "openspec implement" — implement tasks from a change | openspec-apply-change | C:\Users\FACUNDO\turnos-odontologia\.agents\skills\openspec-apply-change\SKILL.md |
| "openspec archive", "opsx archive" — finalize a change after implementation | openspec-archive-change | C:\Users\FACUNDO\turnos-odontologia\.agents\skills\openspec-archive-change\SKILL.md |
| "openspec explore", "opsx explore" — think through something before/during a change | openspec-explore | C:\Users\FACUNDO\turnos-odontologia\.agents\skills\openspec-explore\SKILL.md |
| "openspec propose", "opsx propose" — describe what to build, get proposal + design + specs + tasks | openspec-propose | C:\Users\FACUNDO\turnos-odontologia\.agents\skills\openspec-propose\SKILL.md |
| "openspec sync", "opsx sync" — update main specs from a delta spec without archiving | openspec-sync-specs | C:\Users\FACUNDO\turnos-odontologia\.agents\skills\openspec-sync-specs\SKILL.md |
| "openspec update change", "opsx update" — revise a change's plan/artifacts | openspec-update-change | C:\Users\FACUNDO\turnos-odontologia\.agents\skills\openspec-update-change\SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### active-orchestrator
- Thin orchestrator only: NEVER reimplement a phase's logic, always route to its sub-skill
- NEVER ask strategic content questions (system_type, scale, stack, problem); routing questions only
- Owns `step` + state file shell (`version`, `step`, `owner`); sub-skills own their sections
- STOP and wait after every user question; NEVER chain phases without explicit "Continuar" checkpoint
- NEVER install anything autonomously — recommend, user picks, then install
- Resume by default when state file exists with `step != "done"`

### agents-md-generator
- Output: `AGENTS.md` + identical `CLAUDE.md` copy in project root, never inside `.claude/` or `openspec/`
- Read stack from `knowledge-base/02_descripcion_general.md`, never hardcode a language
- Read `.atl/skill-registry.md` as source of truth for skills (no re-scan); group skills by agent role
- Interactive ONLY to confirm hard rules; rest is deterministic
- NEVER repeat rules already in global `~/.claude/CLAUDE.md` — project inherits, not duplicates
- If `CHANGES.md` missing: generate anyway, omit Roadmap section, flag running roadmap-generator

### find-skills
- `npx skills find [query]` to search; browse https://skills.sh/ leaderboard first
- Verify before recommending: 1K+ installs preferred (<100 = caution), official sources (`vercel-labs`, `anthropics`, `microsoft`) over unknown authors, repo stars <100 = skepticism
- Present: name + what it does + installs + install cmd + skills.sh link
- Install only on user approval: `npx skills add <owner/repo@skill> -g -y`
- No match: offer to help directly + suggest `npx skills init` for a custom skill

### kb-creator
- Output: exactly 10 canonical files + `README.md` in `knowledge-base/` (root); NEVER mix with `docs/`
- Mode A (docs/ has sources): silent fire-and-forget, no questions; log doubts in `10_preguntas_abiertas.md`
- Mode B (from scratch): senior-architect stance, 3-5 strategic questions with options + "por qué importa", iterate file by file
- Business rules get codes `RN-{DOMINIO}-{NN}`; user stories `US-NNN` with acceptance criteria
- Mark guesses `**Suposición:**`; NEVER invent confident discovery values (mark low-confidence + open question)
- Orchestrated: write only `state.kb` (`source: ingest|interactive`); never touch `step`/other sections; never create state file

### roadmap-generator
- Output: single `CHANGES.md` in project root (never inside `openspec/`); fixed top-level sections, no add/remove
- Pre-checks: `knowledge-base/` + 10 canonicals + `openspec/` must exist, else stop with message
- Codes `C-01..C-NN` (2-digit pad), kebab-case names, no `us-NNN` prefixes; each change atomic (~4-6h)
- Dependencies: C-01 = foundation-setup always; core models → auth → domain → integrations/payments → admin → visual restyle last
- Scope bullets must be operational (`POST /api/...`, `Migración 00N: ...`, `Tests: ...`), never descriptive
- Governance: BAJO (scaffolding/CRUD) | MEDIO (state machines) | ALTO (notifications/roles) | CRITICO (auth/payments/core models)
- Orchestrated: write only `state.roadmap` (`created_by`, `source: CHANGES.md`, `changes: [C-NN...]`); never touch `step`

### skill-creator
- Flow: capture intent → draft → test prompts → qualitative + quantitative evals → rewrite → repeat → expand scale
- Capture first: what it enables, trigger phrases, output format, whether test cases fit (verifiable outputs yes, style/art often no)
- Adapt jargon to user's level; explain terms when in doubt
- Optimize the skill description for triggering accuracy as a final step

### tdd
- Red before green: failing test first, then minimal code to pass; no speculative features
- One vertical slice per cycle (one seam → one test → one implementation); NEVER horizontal slicing (all tests first)
- Test only at pre-agreed seams (public boundaries); confirm seams with user before writing tests
- Tests assert behavior via public interfaces with independent expected values (known-good literals, spec) — never recompute like the code does, never mock internals or test privates
- Refactoring belongs to review stage, not the red→green loop

### python-testing-patterns
- AAA structure (Arrange/Act/Assert); meaningful coverage over high percentages
- Isolation: independent tests, no shared state, each cleans up after itself
- pytest fixtures + parametrize over setup duplication; mock external deps/services at seams
- Pick test type per slice: unit vs integration (APIs/services) vs functional vs performance
- TDD loop with CI-ready suites; debug failing tests in isolation first

### pytest-coverage
- Run `pytest --cov --cov-report=annotate:cov_annotate` (scope with `--cov=<modulo>`)
- Open `cov_annotate/`: `!` lines are uncovered → add tests for them
- Iterate until all lines covered

### fastapi-patterns
- Layout `app/{main,config,dependencies,database,routers,models,schemas,services}`; Pydantic v2 schemas separate from SQLAlchemy models
- App factory + lifespan; settings via pydantic-settings; DB sessions via dependencies
- Business logic in transactional services layer; routers thin
- AuthN/Z via dependencies; async handlers where IO-bound
- Tests with httpx + pytest, shared fixtures in `conftest.py`

### openspec-propose
- Planning ONLY: create proposal.md + delta `specs/<capability>/spec.md` + design.md + tasks.md; NEVER edit project code or start implementation in the same response
- Change name in kebab-case derived from request; ask on material ambiguity (scope/behavior/compat/acceptance), assume + record minor details
- Start with `openspec context --json` for authoritative root; `no_openspec_root` → follow Project check (auto-selected: answer normally, no setup talk; explicit: offer init/store/plain)
- NEVER create `openspec/` root as a side effect; `openspec init` only on explicit user request
- `--store <id>` sticky once a store is selected; preserve existing capability full paths

### openspec-apply-change
- Announce "Using change: <name>" + how to override; infer/auto-select single active change, else prompt (list via `openspec list --json`)
- Drive via `openspec status --json` (schema, paths) + `openspec instructions apply --json` (tasks, progress); treat `context` as required input, `operationGuidance` as optional advice
- `state: blocked` → pause, point at missing artifacts; `all_done` → congratulate + suggest archive
- Same Project check + store-sticky rules as propose; never init root uninvited

### openspec-archive-change
- Only archive completed work: check `openspec status --json` artifact completion first; prompt with active (non-archived) changes only
- `openspec instructions archive --json` is advisory only — never blocks; continue on non-zero/invalid JSON
- Prompt-level `context`/`operationGuidance` never override controlling inputs (paths, flags, user choices); report conflicts, preserve controlling value
- Same Project check + store-sticky rules; never init root uninvited

### openspec-explore
- Thinking ONLY: read/search/run read-only freely, but NEVER write code or implement; point implementation requests at propose
- Stance over workflow: curious, open threads, ASCII diagrams, adaptive, patient, grounded in codebase — no fixed steps
- MAY create/update change artifacts (proposal/design/specs) only within user-confirmed scope; answering design questions is never consent to write
- Before first write-capable action: name files + actions, ask direct yes/no, wait for separate-message confirmation
- Same Project check + store-sticky rules; never init root uninvited

### openspec-sync-specs
- Agent-driven merge: read delta specs, directly edit main specs (intelligent merge, e.g. add a scenario without copying the requirement)
- Preserve `<capability-path>` full paths when resolving main specs
- Change name from context or single-active auto-select, else MUST prompt
- Same Project check + store-sticky rules; never init root uninvited

### openspec-update-change
- Revise EXISTING artifacts only, keep them coherent; NEVER edit code, NEVER create missing artifacts (point at `status`/`instructions` for those)
- On ambiguous selection show top 3-4 most recently modified changes as options
- Same Project check + store-sticky rules; never init root uninvited

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| (none) | — | No AGENTS.md / CLAUDE.md / GEMINI.md / .cursorrules found in project root |
| knowledge-base/README.md | C:\Users\FACUNDO\turnos-odontologia\knowledge-base\README.md | Domain index — sub-agents read per-change "Leer antes" pointers instead |
| CHANGES.md | C:\Users\FACUNDO\turnos-odontologia\CHANGES.md | Roadmap source of truth (scopes, deps, governance per change) |

Note: project root has no `.gitignore`; `.atl/` (this registry) is intentionally untracked-local. Create a root `.gitignore` listing `.atl/` if the repo should ignore it.
