# Explore — C-01 foundation-setup (PRE-propose)

Fecha: 2026-10-08. Modo explore: solo lectura + esta nota autorizada. Sin proposal/design/specs/tasks (eso es del `/opsx:propose`).

## 1. Problema que C-01 resuelve

Sin C-01 no hay base donde implementar el núcleo del TP (C-02 → C-03: crear turno sin solapamientos).
Hoy el repo es **solo documentación + contratos**: KB, roadmap, spec `turnos` (7 requirements), README y CI que referencian
código inexistente. C-01 crea el scaffolding mínimo + base testeable con datos ficticios para que C-02/C-03 tengan dónde vivir.

```
+--------------------------------------------------+
|  HOY: docs + contratos, cero codigo              |
+--------------------------------------------------+
         |
         v
+--------------------------------------------------+
|  C-01: backend/ + 1 test dummy verde + CI verde   |
+--------------------------------------------------+
         |
         v
+--------------------------------------------------+
|  C-02: catalogo + seed ficticio    C-03: turnos   |
+--------------------------------------------------+
```

Norte (no implementar en C-01): US-001..US-003 como referencia; `openspec/specs/turnos/spec.md` ya fija
duración fija, solape profesional/sillón, borde `[inicio,fin)`, horario/bloqueos, estado inicial pendiente, 409 vs 422.

## 2. Estado del código (verificado, no asumido)

| Esperado por C-01                    | Estado real                                        |
|--------------------------------------|----------------------------------------------------|
| `backend/app/{turnos,agenda,seed}/`  | NO EXISTE (`backend/`, `src/`, `tests/` ausentes)  |
| `backend/tests/` + 1 test dummy      | NO EXISTE                                          |
| `backend/requirements.txt`           | NO EXISTE (lo exigen CI + README)                  |
| `docker-compose.yml` (api+postgres)  | NO EXISTE (lo prometen AGENTS, README, KB 02/08)   |
| `.env.example`                       | EXISTE, con extras a decidir (ver §3)              |
| `.github/workflows/tests.yml`        | EXISTE pero ROJO por diseño: instala `backend/requirements.txt` inexistente y corre `pytest backend/tests` inexistente |
| `README.md`                          | EXISTE, describe estructura/CIs que no existen aún |
| `openspec list --json`               | 0 changes, root ok; `list --specs` → `turnos` (7 requirements) |
| Python local                         | 3.13.7 (cumple 3.12+); sin venv ni dependencias instaladas |

`.env.example` actual: `TZ`, `DATABASE_URL`, `SECRET_KEY`, `REDIS_URL`, `SEED_FICTICIO` (todos ficticios, sin secretos reales — bien).
`tests.yml` fija Python 3.12 + `pip install -r backend/requirements.txt` + `pytest backend/tests`.

## 3. Preguntas abiertas / decisiones que el propose debe cerrar

1. **Estructura de dirs**: CHANGES + KB 02/08 + README + CI dicen `backend/app/...` + `backend/tests/`;
   la línea de scope de C-01 en el task dice `src/turnos/`, `src/agenda/`, `src/seed/`, `tests/`.
   Recomendación: `backend/...` (es lo que CI y README ya esperan).
2. **Versiones exactas**: fijar `fastapi>=0.115`, `sqlalchemy>=2.0`, `alembic`, `pytest>=8`, `httpx`, `uvicorn`,
   `python 3.12`, `postgres 16+` (pin en compose + workflow).
3. **`REDIS_URL` en `.env.example`**: KB dice Redis solo con async (posterior); CHANGES C-01 lista
   `TZ, DATABASE_URL, SECRET_KEY, SEED_FICTICIO` (sin Redis). Recomendación: quitar `REDIS_URL` en C-01.
4. **Seed mínimo en C-01**: KB 04 §Seed pide 2+2+3+horarios+bloqueo+3 pacientes+turnos ejemplo, pero eso es scope C-02.
   C-01: solo esqueleto `seed/` + flag `SEED_FICTICIO` (sin datos todavía) o seed vacío documentado.
5. **Qué verifica la CI**: hoy 1 job tests. C-01 la deja en verde con el dummy; decidir si el propose agrega
   linter (el task lo pide: "test runner + linter") — ruff recomendado, job separado o mismo job.
6. **Q1 (Alta, previa al propose según AGENTS)**: confirmar "solo recepción escribe, sin reserva online en C-01..C-03".
   No bloquea el scaffolding, pero el propose debe dejarla registrada como supuesto.
7. **`docker-compose.yml`**: ¿entra en C-01 (lo dice CHANGES) con servicios `api + postgres` mínimos?
   Recomendación: sí, mínimo con `postgres:16` + `service_healthy`, sin Redis.

## 4. Contradicciones detectadas (KB vs repo)

- AGENTS.md scope C-01 dice `src/...` pero KB 08 §Estructura + CHANGES + README + CI dicen `backend/...`. Prevalece `backend/...`.
- `.env.example` incluye `REDIS_URL` (posterior según KB 02/08). Ver decisión 3.
- README describe cómo levantar con Compose y correr tests que aún no existen — se vuelve cierto con C-01.
- `openspec/specs/turnos/spec.md` ya existe (7 requirements de C-03): C-01 no debe contradecirlo
  (p.ej. códigos 409/422, sillón obligatorio); el dummy no lo toca.
- `.active-orchestrator-state.json`: 4 skills de testing (`tdd`, `python-testing-patterns`, `pytest-coverage`,
  `fastapi-patterns`) figuran como `dropped_stale`/no instaladas aunque AGENTS.md las exige para el núcleo agenda.

## 5. Bloqueadores

- **Ninguno duro** para proponer C-01 (sin dependencias, governance BAJO, root openspec ok, `step=done`).
- **Flag abierto**: falta `docker-compose.yml` prometido por AGENTS.md (el registry `.atl` ya lo marcó).
- **Blando**: skills de testing no instaladas — el propose/apply deberá trabajar con `tdd` ausente
  (red-green manual) o instalarlas antes de C-03.
- Nota Windows: el shim `openspec.ps1` está bloqueado por ExecutionPolicy; usar `cmd /c "openspec ..."` como workaround.

## 6. Recomendado para el propose de C-01

Scope: `backend/app/{turnos,agenda,seed}/` + `main.py` app FastAPI mínima (p.ej. `GET /health`),
`backend/tests/test_dummy.py` en verde, `backend/requirements.txt` pineado, `docker-compose.yml` (api+postgres16
con healthcheck), `.env.example` sin `REDIS_URL`, `README.md` ya existente (ajustar lo que mienta),
CI verde (tests + ruff si se decide). Criterio de cierre: `pytest backend/tests` verde local + CI verde,
`docker compose config` válido, skill `tdd` (o red-green manual si sigue ausente).
