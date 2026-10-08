# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

Regenerated 2026-10-08 by `skill-registry` (formal rescan on this machine). Stale `C:\Users\FACUNDO\...` paths from the merged copy removed; all paths canonicalized to `C:\Users\andre\...`. Skills referenced by `AGENTS.md` but NOT installed (`tdd`, `python-testing-patterns`, `pytest-coverage`, `fastapi-patterns`) are intentionally absent — closest installed equivalent is `test-driven-development`.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| /active-orchestrator:init, /active-orchestrator:kb, /active-orchestrator:rules, /active-orchestrator:discovery, /active-orchestrator:openspec, /active-orchestrator:devops, /active-orchestrator:find-skill — new project from scratch (SDD/OpenSpec foundation flow) | active-orchestrator | C:\Users\andre\.config\opencode\skills\active-orchestrator\SKILL.md |
| Crear/generar/actualizar AGENTS.md o CLAUDE.md, "armar las reglas del proyecto", "instrucciones para los agentes" | agents-md-generator | C:\Users\andre\.config\opencode\skills\agent-instruction\SKILL.md |
| "tengo una idea", investigar mercado/competidores antes de la KB, fase Discovery del flujo fundación | discovery-research | C:\Users\andre\.config\opencode\skills\discovery-research\SKILL.md |
| "how do I do X", "find a skill for X", "is there a skill that can...", extending capabilities | find-skills | C:\Users\andre\.config\opencode\skills\find-skill\SKILL.md |
| "crear base de conocimiento", "generar KB desde los docs", "armemos la documentación desde cero" | kb-creator | C:\Users\andre\.config\opencode\skills\kb-creator\SKILL.md |
| "armar CHANGES", "armar roadmap", "crear mapa de changes", "generar plan de implementación", "qué changes necesito", "índice de changes" | roadmap-generator | C:\Users\andre\.config\opencode\skills\roadmap-generator\SKILL.md |
| Create/edit/optimize a skill, run skill evals, benchmark skill performance | skill-creator | C:\Users\andre\.config\opencode\skills\skill-creator\SKILL.md |
| Investigar/scrapear un competidor a partir de una URL | web-scraper | C:\Users\andre\.config\opencode\skills\web-scraper\SKILL.md |
| REST/GraphQL contract tests — schemas, auth, status/errors, pagination, idempotency, rate limits | api-testing | C:\Users\andre\.agents\skills\api-testing\SKILL.md |
| Scaffold Spring Boot Java project (Java 21 + Docker + Compose template) | create-spring-boot-java-project | C:\Users\andre\.agents\skills\create-spring-boot-java-project\SKILL.md |
| Docker containerization best practices — images, security, orchestration | docker | C:\Users\andre\.agents\skills\docker\SKILL.md |
| "docker ai", model runner, local LLM, GPU docker, sandbox, AI model serving | docker-ai-ml | C:\Users\andre\.agents\skills\docker-ai-ml\SKILL.md |
| Docker concepts, architecture, installation, first container, CLI basics | docker-basics | C:\Users\andre\.agents\skills\docker-basics\SKILL.md |
| "docker build", tag/push/images, --build-arg, image prune, BuildKit basics | docker-build | C:\Users\andre\.agents\skills\docker-build\SKILL.md |
| buildx, multi-platform (linux/arm64), BuildKit secrets/cache, Build Cloud | docker-buildx | C:\Users\andre\.agents\skills\docker-buildx\SKILL.md |
| Docker CI/CD — GitHub Actions, Jenkins, automated builds, Build Cloud | docker-cicd | C:\Users\andre\.agents\skills\docker-cicd\SKILL.md |
| "docker compose", compose.yml, multi-container apps, service orchestration | docker-compose | C:\Users\andre\.agents\skills\docker-compose\SKILL.md |
| Dockerfile authoring, multi-stage builds, layer caching, language templates | docker-dockerfile | C:\Users\andre\.agents\skills\docker-dockerfile\SKILL.md |
| "docker hub", registries, push/pull, private registry, Harbor, image signing | docker-hub | C:\Users\andre\.agents\skills\docker-hub\SKILL.md |
| "docker network", bridge/host/overlay, port mapping, container communication | docker-networking | C:\Users\andre\.agents\skills\docker-networking\SKILL.md |
| Production Docker — Swarm, stack deploy, K8s migration, zero-downtime, monitoring | docker-production | C:\Users\andre\.agents\skills\docker-production\SKILL.md |
| "docker run", container lifecycle, resource limits, healthchecks, logs, exec | docker-run | C:\Users\andre\.agents\skills\docker-run\SKILL.md |
| "docker scout", vulnerability scanning, CVE, SBOM, policy evaluation | docker-scout | C:\Users\andre\.agents\skills\docker-scout\SKILL.md |
| Docker security hardening — non-root, seccomp, secrets, Bench, CIS | docker-security | C:\Users\andre\.agents\skills\docker-security\SKILL.md |
| "docker volume", persistence, bind mount, tmpfs, DB data, backup/restore | docker-storage | C:\Users\andre\.agents\skills\docker-storage\SKILL.md |
| testcontainers — integration tests with real Docker services (Java/Python) | docker-testcontainers | C:\Users\andre\.agents\skills\docker-testcontainers\SKILL.md |
| "docker debug", OOM, disk full, network issues, daemon problems, crashes | docker-troubleshooting | C:\Users\andre\.agents\skills\docker-troubleshooting\SKILL.md |
| Spring Boot 3.x, WebFlux, JPA, Spring Security OAuth2/JWT, microservices | java-architect | C:\Users\andre\.agents\skills\java-architect\SKILL.md |
| Spring Boot REST APIs, Security, Data, Actuator, Spring Cloud | java-spring-boot | C:\Users\andre\.agents\skills\java-spring-boot\SKILL.md |
| Spring Boot best practices (project setup, DI, web, data, testing, security) | java-springboot | C:\Users\andre\.agents\skills\java-springboot\SKILL.md |
| Playwright E2E/component/API/visual/a11y — flaky tests, POM, CI, mocks | playwright-best-practices | C:\Users\andre\.agents\skills\playwright-best-practices\SKILL.md |
| Redis client setup — pooling, pipelining, client-side caching, timeouts | redis-connections | C:\Users\andre\.agents\skills\redis-connections\SKILL.md |
| Redis data modeling — structures (Hash/JSON/Set/ZSet/Stream), key naming | redis-core | C:\Users\andre\.agents\skills\redis-core\SKILL.md |
| Spring Boot REST/testing/security/deployment expert guidance | spring-boot | C:\Users\andre\.agents\skills\spring-boot\SKILL.md |
| Postgres schema/migrations/RLS/indexes/perf — BEFORE any DB-touching change | supabase-postgres-best-practices | C:\Users\andre\.agents\skills\supabase-postgres-best-practices\SKILL.md |
| Any bug, test failure, or unexpected behavior — root cause before fixes | systematic-debugging | C:\Users\andre\.agents\skills\systematic-debugging\SKILL.md |
| Any feature or bugfix — test first (red-green-refactor) | test-driven-development | C:\Users\andre\.agents\skills\test-driven-development\SKILL.md |
| Claiming done/fixed/passing, committing, PRs — verify with evidence first | verification-before-completion | C:\Users\andre\.agents\skills\verification-before-completion\SKILL.md |
| Local web app testing with Python Playwright — screenshots, browser logs | webapp-testing | C:\Users\andre\.agents\skills\webapp-testing\SKILL.md |

## Project Skills (.opencode/skills — take precedence over user-level on name clash)

> Mirror copies exist at `.agents/skills/` (legacy dir, 1-line prompt-text diff per file). Canonical paths below are the `.opencode/skills/` variants (what this runtime loads). User-level `~/.agents/skills/openspec-*` copies lose to these on all 4 overlapping names.

| Trigger | Skill | Path |
|---------|-------|------|
| "openspec apply", "opsx apply", "openspec implement" — implement tasks from a change | openspec-apply-change | C:\Users\andre\Documents\GitHub\turnos-odontologia\.opencode\skills\openspec-apply-change\SKILL.md |
| "openspec archive", "opsx archive" — finalize a change after implementation | openspec-archive-change | C:\Users\andre\Documents\GitHub\turnos-odontologia\.opencode\skills\openspec-archive-change\SKILL.md |
| "openspec explore", "opsx explore" — think through something before/during a change | openspec-explore | C:\Users\andre\Documents\GitHub\turnos-odontologia\.opencode\skills\openspec-explore\SKILL.md |
| "openspec propose", "opsx propose" — describe what to build, get proposal + design + specs + tasks | openspec-propose | C:\Users\andre\Documents\GitHub\turnos-odontologia\.opencode\skills\openspec-propose\SKILL.md |
| "openspec sync", "opsx sync" — update main specs from a delta spec without archiving | openspec-sync-specs | C:\Users\andre\Documents\GitHub\turnos-odontologia\.opencode\skills\openspec-sync-specs\SKILL.md |
| "openspec update change", "opsx update" — revise a change's plan/artifacts | openspec-update-change | C:\Users\andre\Documents\GitHub\turnos-odontologia\.opencode\skills\openspec-update-change\SKILL.md |

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

### discovery-research
- Checklist primero: problema, usuarios, casos de uso, competidores, funcionalidades necesarias/opcionales, reglas de negocio, integraciones, restricciones, riesgos, preguntas abiertas
- NEVER fill a checklist item with an assumption when it can be asked or investigated (web-scraper for competitor URLs)
- Phases: Fuentes → Checklist Q&A → Gate final → write discovery notes + `state.discovery`
- Interactive Q&A with senior-architect stance; log doubts as open questions, never confident invented values
- Orchestrated: writes only `state.discovery`; NEVER starts the KB (kb-creator consumes this output)

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

### web-scraper
- Fixed 8-field output schema always, same order every time — the schema is non-negotiable
- NEVER invent data the page doesn't show; empty fields marked as not-evidenced
- One URL per note via WebFetch/WebSearch, no API keys, no extra cost
- NO mass crawling of full sites; NOT for JS-heavy or anti-bot sites (documented future extension)
- Invoked directly for a one-off URL, or by discovery-research during Discovery

### api-testing
- Standalone API contract tests: schema-validate (Zod/JSON Schema) EVERY response — status-only assertions hide contract drift
- Cover auth (401/403 on protected endpoints), error states (400/404/409/422/500), pagination/filtering/sorting edges, idempotency (PUT/DELETE), rate limits
- No hardcoded secrets/tokens in test files — env or secrets manager; no shared mutable state without cleanup
- Playwright request fixture (TS) or REST Assured (Java); starter templates live in the skill's `templates/`
- NOT for browser-driven UI flows, visual regression, or multi-page E2E journeys

### create-spring-boot-java-project
- Requires Java 21 + Docker + Docker Compose; scaffold via Spring Initializr (edit `artifactId`/`packageName`/`bootVersion` to customize)
- Add `springdoc-openapi-starter-webmvc-ui` + `archunit-junit5` deps; wire SpringDoc/Redis/JPA/MongoDB in `application.properties`
- Root `docker-compose.yaml` with `redis:6`, `postgresql:17`, `mongo:8`; add data dirs to `.gitignore`
- Verify with `mvn clean test`; optional run: `compose up -d` → `./mvnw spring-boot:run` → compose down

### docker
- One process per container; minimal secure images; official bases with pinned versions (never `latest` in prod)
- Multi-stage builds; order instructions least→most changing; COPY deps before source; `.dockerignore` always
- Never store secrets in images or baked layers — BuildKit `--secret` or runtime injection
- Run as non-root, read-only FS where possible, HEALTHCHECK, CPU/memory limits, user-defined bridge networks
- Compose: explicit networks, named volumes, `depends_on` with `service_healthy`, `.env` never committed

### docker-ai-ml
- Local LLMs: `docker model pull/run` (quantized Q4/Q8 to fit RAM); full GPU needs Linux + nvidia-container-toolkit (`--gpus`)
- Model Runner API at `:11434/v1`; Ollama is the bigger-catalog alternative — both can coexist; models are 2-70GB, check `df -h` first
- Sandboxes for isolated agent execution; `agent.yaml` for multi-agent orchestration
- Harden: `--read-only` weights, no internet for local inference, `--memory` caps, watch `nvidia-smi`
- Mac/Win Desktop GPU passthrough is limited — prefer `docker model` offload there

### docker-basics
- `docker run` creates a NEW container every time; `docker start` restarts existing; `docker ps -a` shows stopped
- Linux needs sudo or docker group (group membership = root-equivalent — prefer rootless)
- Data without volumes is ephemeral; check bloat with `docker system df` before any prune
- `-p host:container`; host-side conflict → change host port (`lsof -i :PORT`)
- Examples are educational only — official/verified images in production

### docker-build
- Build context ships everything — `.dockerignore` (`node_modules/.git/.env` minimum) or context bloat
- `--build-arg` is visible in image history — NEVER secrets there; use BuildKit `--secret`
- Tags are mutable: pin digest (`@sha256:...`) for production reproducibility
- `docker login` before push; `--pull` refreshes base (may change output); `prune -a` is destructive, confirm first
- Scan with `docker scout` before pushing to production

### docker-buildx
- Multi-platform (`--platform linux/amd64,arm64`) requires `--push` or oci/tar output; `--load` is single-platform only
- BuildKit: `--secret` mounts, cache mounts (persist pip/npm/Go caches across builds), SSH forwarding for private repos
- CI cache: pull previous image first (`docker pull ... || true`), then `--cache-from` (`type=gha` in Actions)
- QEMU ARM-on-AMD is 5-10x slower — native ARM runners or Build Cloud for multi-arch
- Never expose secrets in build logs; mask CI secrets

### docker-cicd
- Build+push in CI with SHA tags (`image:sha-${GITHUB_SHA::7}`); never hardcode registry creds — CI secrets/OIDC
- Layer cache: pull previous image `|| true` + `--cache-from`; prune between builds for disk space
- Multi-platform via build-push-action + setup-buildx; native ARM runners over QEMU emulation
- Scan with Scout before production push; rolling/blue-green deploy patterns; Build Cloud to accelerate

### docker-compose
- Modern syntax `docker compose` (plugin); `docker-compose` standalone binary is deprecated
- `depends_on` waits for START not READY — always `condition: service_healthy` + `healthcheck:` block
- Services reach each other by service name on the auto-created bridge; `internal: true` for backend-only nets
- `.env` auto-loaded but NEVER committed (`.gitignore` + `.env.example`); override files per environment; profiles for optional services
- Validate resolved paths/ports with `docker compose config`; single-host prod + systemd, multi-host → Swarm/K8s

### docker-dockerfile
- Deps-first ordering: COPY manifest (`package.json`/requirements) → RUN install → COPY src (code changes must not bust the dep cache)
- Prefer COPY over ADD (ADD only for tar extraction); chain RUN + cleanup in the same layer (`rm -rf /var/lib/apt/lists/*`)
- CMD = overridable default vs ENTRYPOINT = fixed; EXPOSE documents only (`-p` publishes)
- Always end `USER <non-root>` + `COPY --chown`; ENV secrets bake forever → BuildKit secret-mount or runtime `-e`
- Pin base digests; alpine/slim over ubuntu; multi-stage (build+scratch/alpine/slim) with per-language templates

### docker-hub
- Login is per-registry; credential helpers (e.g. `docker-credential-ecr-login`) over passwords; OIDC in CI, rotate tokens
- Pin version or digest for pulls; `:latest` is mutable — never in production
- Private: official Registry container or Harbor (scanning + RBAC + replication); mirrors for speed
- Sign images (`DOCKER_CONTENT_TRUST=1`); daemon `max-concurrent-uploads: 1` for slow links
- Never commit credentials; use `docker/login-action` in Actions

### docker-networking
- Custom bridge networks (automatic DNS by container name); default bridge has NO name resolution
- Publish with `-p host:container`; EXPOSE alone publishes nothing; avoid `--network host` in prod
- Overlay needs Swarm (`swarm init` first, `--attachable` for standalone); encrypt with `--opt encrypted=true`
- `--internal` for no-internet nets; diagnose with `network inspect` + container ping/nslookup
- Docker Desktop Mac: `--network host` joins the VM net, not the Mac — use `-p` instead

### docker-production
- 3 or 5 Swarm managers (+ raft backup of `/var/lib/docker/swarm/`); rotate join tokens; TLS-verify the daemon
- HEALTHCHECK in Dockerfile + `--update-failure-action rollback`; resource limits on every service (noisy neighbors)
- Production DBs MUST use volumes; secrets via Docker Secrets, never env files
- `kompose convert` is a starting point — add limits/healthchecks/ConfigMaps manually
- Monitor cAdvisor + Prometheus + Grafana; alert on node failures

### docker-run
- Always set `--memory`/`--cpus` in prod (default unlimited); check with `docker stats`; `stop -t` grace for SIGTERM
- Restart policies for resilience; log rotation (`--log-opt max-size/max-file`) — json-file never rotates by default
- Health states via inspect; exec for debug (exit code = command's); prefer logs over exec in prod
- Avoid `--privileged` — specific `--cap-add`; `--user` non-root; `--read-only` for stateless
- `run` ≠ `start`: rerunning creates duplicates; signals must reach PID 1

### docker-scout
- Flow: `quickview` → `cves` → `sbom` → `recommendations`; `docker scan` is deprecated, always scout
- Most CVEs come from the base image — pull/pin a newer base digest, rebuild deps
- Run in CI to block critical/high before production push; subscribe to security advisories
- Scout reports, doesn't fix — act on recommendations, rescan after rebuild

### docker-security
- Layered: minimal pinned base + non-root USER + read-only rootfs + no-new-privileges + dropped caps (never `--privileged`)
- Secrets: BuildKit `--secret` at build, Docker Secrets/Swarm at runtime — never `ENV API_KEY` in layers
- Constrain syscalls (seccomp/AppArmor/SELinux); NEVER mount `docker.sock` into containers (root-equivalent)
- Audit with Docker Bench (CIS); scout images; CI policy blocks critical/high
- Sign images (content trust) + SBOM for supply chain

### docker-storage
- Named volumes for state (`-v name:/data`); anonymous `-v /data` accumulates — prune unused; `--rm` worsens loss
- Bind mounts need absolute paths (`./rel` only in Compose); UID mismatch → permission denied (match `--user` or chown entrypoint)
- `:ro` for configs; tmpfs for ephemeral (never touches disk); overlay2 default driver
- DB patterns: Postgres/MySQL/Redis volume mounts; backup/restore via temp container; NFS/cloud for shared
- Backup DB volumes regularly; never casually bind-mount `docker.sock`

### docker-testcontainers
- Real services in tests: Java `@Testcontainers`/`@Container`, Python testcontainers-python + pytest
- Never hardcode ports — `getMappedPort()`; static `@Container` shares, instance fields isolate per-test
- Ryuk auto-cleans; if disabled add `@AfterAll` cleanup; CI needs DinD or socket access
- Pre-pull images in CI to cut startup; `withReuse(true)` for fast local loops
- Test scope only — never production code; also covers migration testing

### docker-troubleshooting
- Diagnose order: `logs --tail` → `inspect` (OOMKilled/exit code) → `stats`/`df` → network inspect → daemon/socket
- Exited 0 + dead service = crash after start (check `0.0.0.0` binding); OOMKilled leaves no logs — inspect flag + raise memory
- JSON logs never rotate — truncate LogPath or set max-size/max-file; prune only after `system df` preview (+ `until` filter)
- Bind-mount perms = UID mismatch; daemon issues = socket perms/dockerd state
- Never blind-exec in prod, never expose sock for debug, rotate debug logs (may hold secrets)

### java-architect
- Java 21 LTS (records, sealed classes, pattern matching); Spring Boot 3.x; never deprecated Spring APIs
- WebFlux non-blocking end-to-end (no blocking calls in reactive chains); JPA optimized queries + Flyway/Liquibase
- Security via Spring Security OAuth2/JWT; `@PreAuthorize`; externalized config, secrets never hardcoded/unencrypted
- Validate all input; explicit transaction boundaries; OpenAPI/Swagger docs; proper exception hierarchy

### java-spring-boot
- Starters + auto-config over boilerplate; profiles (dev/test/prod) + `@ConfigurationProperties` type-safe config
- Layered: `@RestController` (thin) → `@Service` (`@Transactional`, stateless) → Spring Data repos (query methods/`@Query`, paging)
- SecurityFilterChain + JWT/OAuth2, method security, CORS/CSRF; `@ControllerAdvice` global errors; Bean Validation on DTOs
- Actuator health/metrics (Micrometer/Prometheus); never expose entities — DTOs only

### java-springboot
- Maven/Gradle + starters; package by feature/domain, not by layer; constructor injection, `private final` fields
- `application.yml` + profiles; `@ConfigurationProperties`; secrets via env/Vault, never hardcoded
- Controllers: DTOs + `@Valid`, global `@ControllerAdvice` errors; services stateless `@Transactional`; repos `JpaRepository` + projections
- SLF4J parameterized logging; JUnit5 + Mockito units, slices (`@WebMvcTest`/`@DataJpaTest`), `@SpringBootTest` + Testcontainers integration; BCrypt passwords

### spring-boot
- Spring Boot 3.x + Java 17+ features; starters, auto-config, consistent packages (controllers/services/repositories/models/config)
- Constructor injection to interfaces; `@Value`/`@ConfigurationProperties` + profiles; env vars for secrets
- RESTful codes, global `@ControllerAdvice`, Bean Validation, Springdoc OpenAPI/Swagger UI
- JUnit5 + MockMvc + `@SpringBootTest`/`@DataJpaTest` + Testcontainers; HikariCP pooling, Spring Cache, `@Async`; Actuator + Prometheus/Grafana; BCrypt + CORS; multi-stage Docker + CI/CD

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

### playwright-best-practices
- Prefer role-based locators + auto-waiting assertions; avoid hard sleeps; mock APIs/dates where deterministic
- Page Object Model for maintainability; global setup/teardown with reusable auth state
- Tag tests (@smoke/@fast/@critical), filter with `--grep`; mark flaky with fixme/slow, don't silently skip
- Accessibility (axe-core), console-error monitoring, and test isolation are default, not optional
- CI: project dependencies, sharding, retries only for infra flakes; debug with trace viewer

### redis-connections
- Never one connection per request: pool (redis-py `ConnectionPool`/JedisPooled/go-redis) or multiplex (Lettuce/NRedisStack)
- Pipeline bulk calls; SCAN (never KEYS/SMEMBERS/HGETALL) for large keyspaces
- RESP3 client-side caching for hot read-heavy keys; explicit connect/read/write timeouts (fail fast, don't break healthy traffic)

### redis-core
- Pick structure by access: String counters, Hash objects, Set membership, ZSet leaderboards, Stream events, JSON docs, Vector Sets
- Keys: lowercase colon-separated (`tenant:42:user:7:cart`), short readable, no URLs/spaces/mixed case
- Hash vs JSON per entity; prefix multi-tenant keys for scan/ACL targeting
- Key names live in RAM and every command — tight but consistent per service

### supabase-postgres-best-practices
- Load BEFORE any DB-touching change — even one column or one query (schema, migration, RLS, index, SQL all need it)
- Rules prioritized critical→incremental across 8 categories: queries, connections, RLS, indexes, triggers/functions, queues (pg_cron/pgmq), pgvector, dumps
- Each rule: why + incorrect vs correct SQL + EXPLAIN/metrics; RLS policies ship with verifying tests
- Diagnose via EXPLAIN plans, pool exhaustion, locking, bloat; wrong-tenant rows = RLS bug, not app bug

### systematic-debugging
- Iron law: root cause BEFORE fixes; symptom fixes are failure; no "quick fix, investigate later"
- Four phases: root-cause investigation → pattern analysis → hypothesis + testing → implementation
- Trace data flow backward through the call stack; add validation at layers after (defense-in-depth); condition polling over arbitrary timeouts
- Red flags: proposing solutions before tracing, "one more fix attempt" after 2+ tries, each fix revealing a new problem elsewhere
- Under pressure systematic beats thrashing; partner signals ("stop guessing") mean restart investigation

### test-driven-development
- Iron law: watch the test FAIL before implementing; if you didn't watch it fail, it proves nothing
- Red (one behavior, real code, no mocks unless unavoidable) → verify RED (fails for expected reason, not typo) → Green minimal → verify GREEN (all pass, pristine output) → Refactor → repeat
- Assert real behavior, never mock behavior; keep test-only code out of production classes
- Red flags = start over: code before test, test passes immediately, "just this once", tests "later"
- Every new function/method has a test; edge cases + errors covered; checklist before done

### verification-before-completion
- Gate: evidence before claims — run verification commands and confirm output BEFORE any success/completion statement
- NEVER express satisfaction ("Done!", "Perfect!") or commit/push/PR/move on without verification
- No "should/probably/seems"; no trusting agent success reports; partial verification = no verification
- Applies to: task completion, commits/PRs, delegating to agents, any positive statement about work state
- Tired/"just this once" thinking is the main failure mode — verify anyway

### webapp-testing
- Test local web apps with native Python Playwright scripts (`sync_playwright`), never interactive browser sessions
- Reconnaissance-then-action: inspect first, then script; reuse `scripts/` helpers as black boxes (`--help` first)
- Always close the browser when done; descriptive selectors (`text=`/`role=`/CSS/IDs); explicit waits (`wait_for_selector`)
- Capture screenshots + browser logs as debugging evidence
- Server lifecycle via `scripts/with_server.py` (supports multiple servers)

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| AGENTS.md | C:\Users\andre\Documents\GitHub\turnos-odontologia\AGENTS.md | Index — first read for every agent; stack, KB pointers, skills-per-role, roadmap |
| CLAUDE.md | C:\Users\andre\Documents\GitHub\turnos-odontologia\CLAUDE.md | Identical copy of AGENTS.md |
| CHANGES.md | C:\Users\andre\Documents\GitHub\turnos-odontologia\CHANGES.md | Roadmap source of truth (scopes, deps, governance per change) |
| knowledge-base/README.md | C:\Users\andre\Documents\GitHub\turnos-odontologia\knowledge-base\README.md | Domain index — sub-agents read per-change "Leer antes" pointers instead |
| .gitignore | C:\Users\andre\Documents\GitHub\turnos-odontologia\.gitignore | Includes `.atl/` (this registry is untracked-local) |
| docker-compose.yml | (referenced by AGENTS.md, missing in repo) | AGENTS.md promises Postgres 16+ via Compose in root — file not present at registry time |

Notes:
- Project root has no `GEMINI.md` / `.cursorrules` / `copilot-instructions.md`.
- `docker-compose.yml` absent (verified 2026-10-08): flag for roadmap-generator / C-01 foundation-setup.
- `AGENTS.md` references `tdd`, `python-testing-patterns`, `pytest-coverage`, `fastapi-patterns` — none installed; closest installed equivalent is `test-driven-development`. Flag for agents-md-generator next pass.
- `.atl/` is intentionally untracked-local (per AGENTS.md §Skills Disponibles); listed in `.gitignore`.
