# Verify C-02 catalogo-recursos — verificación manual pre-archive

Fecha (UTC): 2026-10-09 · Entorno: Windows, pytest 9.1.1, PostgreSQL 17 privado local (puerto 5433, ver §4)
Change: `openspec/changes/catalogo-recursos/` · Spec: `specs/catalogo-recursos/spec.md` (16 escenarios, incluidos los 2 de Profesional con matrícula única)
Regla: solo lectura + este reporte. No se modificó código en esta fase. No se commiteó. No se archiva todavía.

## 1. Comandos corridos y salidas reales

### 1.1 `CI=true pytest -rs backend/tests` con PostgreSQL real → VERDE
```
$env:CI="true"
$env:DATABASE_URL="postgresql+psycopg://odontologia:odontologia@localhost:5433/turnos"
py -m pytest backend/tests -rs
======================== 40 passed, 1 warning in 1.63s ========================
```
0 skipped, 0 failed. Warning único: `StarletteDeprecationWarning` de `starlette.testclient` (preexistente, ver C-01 §5.1).

### 1.2 `pytest -rs backend/tests` SIN PostgreSQL → VERDE con skips motivados
```
(env sin CI ni DATABASE_URL)
================== 20 passed, 20 skipped, 1 warning in 0.62s ==================
```
Motivo de cada skip: `Postgres no alcanzable (sin DATABASE_URL o conexion rechazada); se requiere Postgres real.` Los 20 que corren son unitarios/foundation + los 5 del guard de DB (no requieren conexión).

### 1.3 `CI=true pytest -rs backend/tests` SIN PostgreSQL → ROJO (fail-fast, 0 skips)
```
$env:CI="true" (sin DATABASE_URL)
================== 20 passed, 1 warning, 20 errors in 0.82s ===================
EXIT:1
```
Cada error: `Failed: CI=true y Postgres inalcanzable...; la integracion no debe skipearse en CI.` Cero skips: el fail-fast funciona.

### 1.4 `ruff check backend/` → VERDE
```
All checks passed!
EXIT:0
```

### 1.5 Alembic + seed → VERDE
```
py -m alembic -c backend/alembic.ini check
No new upgrade operations detected.
$env:SEED_FICTICIO="true"; py -m backend.app.seed.catalogo
seed ok: {'profesionales': 2, 'sillones': 2, 'prestaciones': 3, 'horarios': 10, 'bloqueos': 1, 'pacientes': 3}
```
Ciclo completo `upgrade head` / `downgrade -1` / `upgrade head` verificado en verde en la sesión de verificación read-only (exits 0); seed idempotente (segunda corrida, conteos idénticos).

### 1.6 `openspec validate catalogo-recursos` → VERDE
```
Change 'catalogo-recursos' is valid
EXIT:0
```

## 2. Matriz de trazabilidad escenario → test → resultado

| # | Escenario del spec | Test(s) que lo cubren | Resultado |
|---|--------------------|-----------------------|-----------|
| 1 | Paciente alta válida | `test_alta_paciente_valida` — `test_paciente.py` | VERDE |
| 2 | DNI duplicado rechazado | `test_dni_duplicado_rechazado` — `test_paciente.py` | VERDE |
| 3 | Profesional alta válida | `test_alta_profesional_valida` — `test_recursos.py` | VERDE |
| 4 | Matrícula duplicada rechazada | `test_matricula_duplicada_rechazada` — `test_recursos.py` | VERDE |
| 5 | Prestación válida | `test_alta_prestacion_valida` — `test_prestacion.py` | VERDE |
| 6 | Duración no positiva rechazada | `test_duracion_no_positiva_rechazada[0/-15]` — `test_prestacion.py` | VERDE |
| 7 | Sillón activo por defecto | `test_sillon_activo_por_defecto` — `test_recursos.py` | VERDE |
| 8 | Listado sillones activos | `test_listado_solo_activos` — `test_recursos.py` | VERDE |
| 9 | Horario válido | `test_horario_valido` — `test_horario.py` | VERDE |
| 10 | Horario `desde>=hasta` rechazado | `test_horario_desde_mayor_o_igual_rechazado[×2]` — `test_horario.py` | VERDE |
| 11 | Adyacencia ok / solape no | `test_adyacencia_aceptada_y_solape_rechazado` — `test_horario.py` + `test_intervalos_solapados / test_intervalo_contenido_solapa / test_adyacencia_exacta_no_solapa / test_intervalos_separados_no_solapan` — `test_agenda_rules.py` | VERDE |
| 12 | Bloqueo global válido | `test_bloqueo_global_valido` — `test_bloqueo.py` | VERDE |
| 13 | Bloqueo rango invertido | `test_bloqueo_rango_invertido_rechazado` — `test_bloqueo.py` | VERDE |
| 14 | Aplicabilidad por matriz | `test_bloqueo_solo_profesional / solo_sillon / global_aplica_a_todo / pareja_concreta / borde_semiabierto` — `test_agenda_rules.py` | VERDE |
| 15 | Seed carga catálogo | `test_seed_carga_catalogo` — `test_seed.py` | VERDE |
| 16 | Seed idempotente | `test_seed_idempotente` — `test_seed.py` | VERDE |

Gaps: ninguno — los 16 escenarios tienen test automatizado en verde. Tests extra con fuente: `test_bloqueo_sin_motivo_rechazado` y `test_dia_semana_fuera_de_rango_rechazado` (texto del Requirement), `test_db_*` + `test_db_session_transaccional` (tasks 1.2/1.3), `test_db_guard.py` (5 tests del guard, ver §3), `test_dummy`/`test_health` (foundation C-01).

## 3. Tabla de ciclo TDD (incluye el guard de base de datos)

| Task | Test File | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|------------|-----|-------|-------------|----------|
| 1.1–1.2 | `test_db.py` | ✅ 3/3 | ✅ sin módulo | ✅ pasó | ✅ 3 casos | — |
| 1.3 | `test_db_session.py` | ✅ 6/6 | ✅ sin fixture | ✅ pasó | ✅ 3 modos (skip/pass/CI-fail) | ✅ teardown |
| 1.4 | config (grep) | ✅ | n/a | ✅ ambos archivos | suite re-verde | — |
| 2.1 | `test_paciente.py` | ✅ | ✅ | ✅ | ✅ happy + duplicado | — |
| 2.2 | `test_recursos.py` | ✅ | ✅ | ✅ | ✅ 4 casos | — |
| 2.3 | `test_prestacion.py` | ✅ | ✅ | ✅ | ✅ 0 + negativo | — |
| 2.4 | `test_agenda_rules.py` + `test_horario.py` | ✅ | ✅ ambos | ✅ | ✅ rango extra | ✅ `Mapped[time]` |
| 2.5 | `test_agenda_rules.py` + `test_bloqueo.py` | ✅ | ✅ ambos | ✅ | ✅ 4 combos + borde + motivo | — |
| 3.1/3.2 | Alembic CLI | ✅ | n/a | ✅ | ✅ round-trip + `check` | ✅ ruff fixes |
| 4.1/4.2 | `test_seed.py` | ✅ | ✅ | ✅ | ✅ carga + 2ª corrida | ✅ range(5) |
| Guard DB (H1) | `test_db_guard.py` (5 tests) | ✅ 35/35 | ✅ 5 fallando (`AttributeError`) | ✅ 5 pasando | ✅ `turnos`/`algo_test` ok, `otra`/`produccion`/`turnos_prod` rechazadas sin conectar | ✅ 3 findings ruff |
| 5.1/5.2/6.1 | CLI literal + e2e | ✅ | n/a | ✅ | ✅ seed CLI ×2 | ✅ TRUNCATE isolation |

## 4. Nota sincera: PostgreSQL 17 local vs postgres:16 en CI

Los tests locales corrieron contra un **PostgreSQL 17 privado** (cluster en `AppData\Local\Temp\opencode\pgdata`, puerto 5433) porque **Docker estaba apagado** en esta máquina y el puerto 5432 lo ocupa otro PostgreSQL del sistema con clave desconocida. El CI usa **`postgres:16`**. Revisión por inspección de `models.py` y `001_catalogo.py`: solo tipos y sintaxis antiguos y estándar (`UUID`, `SmallInteger`, `TIME`, `timestamptz`, `CHECK`, FK `CASCADE`, índices simples) — sin `MERGE`, columnas `GENERATED`, SQL/JSON ni nada exclusivo de PG17. Riesgo residual bajo; la corrida empírica en PG16 queda en manos del CI (§5).

## 5. Último run del CI de GitHub

**PENDIENTE — completar con lo observado en GitHub Actions** (no tengo acceso a los runs del CI desde este entorno):

> [ACÁ PEGÁS LO QUE VISTE, por ejemplo "tests: 40 passed, 0 skipped; lint: verde"]

Lo esperado según este verify: `tests` 40 passed / 0 skipped (fail-fast con `CI=true` impediría skips silenciosos) y `lint` en verde.

## 6. Veredicto por ítem

| Ítem de cierre | Estado | Detalle |
|----------------|--------|---------|
| `CI=true pytest` verde con PG real | VERDE | 40/40 passed, 0 skipped |
| Sin PG: skips motivados / CI=true falla | VERDE | 20+20 con motivo / 20 passed + 20 errores, exit 1, 0 skips |
| `ruff check backend/` verde | VERDE | `All checks passed!` |
| Alembic + seed | VERDE | `check` sin drifts; seed 2/2/3/10/1/3 idempotente |
| `openspec validate` sin errores | VERDE | `Change 'catalogo-recursos' is valid` |
| 16/16 escenarios con test | VERDE | §2, sin gaps |
| Run CI GitHub | PENDIENTE | Ver §5 |

## 7. Veredicto global: ARCHIVABLE (archive pendiente de OK explícito)

Todo lo ejecutable en esta máquina está en verde; no hay escenarios en rojo ni gaps de cobertura. No se archiva todavía por orden del usuario.

**Recomendación: cuando el CI (§5) esté en verde, ejecutar `/opsx:archive catalogo-recursos`.**

## 8. Issues / notas

1. H1 aplicado y verificado: `db_session` rehúsa (`pytest.fail`) si la DB no es `turnos` ni `*_test`, con y sin CI; el guard corre antes de conectar.
2. README corregido (H2/H3): seed para PowerShell y bash, override de `DATABASE_URL`, aviso de TRUNCATE; sin menciones al cluster privado.
3. Compatibilidad PG16 empírica pendiente del CI (ver §4).
4. `backend/app/turnos/` intacto; sin routers/JWT/Redis/frontend; datos ficticios; sin secretos.
