# Tasks — agenda-del-dia (C-05)

> TDD estricto: por cada comportamiento, RED (test que falla por el motivo correcto) → GREEN mínimo → suite completa con `CI=true` → seed → marcar la task → diff. Si un test pasa de entrada, se hace comprobación de mutación. Solo datos ficticios (`DNI-FICT-*`, `MAT-FICT-*`). Sin commits sin pedido. Governance BAJO. La base se consulta únicamente por el MCP `postgres`.
>
> **Sin migración Alembic:** C-05 no agrega columnas, índices ni tablas (`design.md` D4). Si una task parece necesitar una revisión nueva, se salió del alcance.
>
> **Recuento (verificado contra los archivos):** 12 escenarios en `specs/agenda/spec.md` (4 requirements) · 17 tasks · 12 tests nuevos en `backend/tests/test_agenda_api.py` · matriz de trazabilidad con 12 filas · suite esperada al cerrar: 115 + 12 = **127 passed**, 0 skipped.
>
> **Reglas para los tests de esta change:**
> - Las aserciones se hacen sobre `r.json()` (la respuesta de la API), nunca sobre el dato que el propio test insertó. Los `id` vuelven como `str`: comparar con `str(id)`.
> - Los turnos a las 00:00 y 23:30 caen fuera del horario de atención del seed (Lun–Vie 9–18): se insertan directo en la base con el helper `_insertar_turno(...)` de `test_turno_servicio.py` (o equivalente), no con `ServicioTurnos.crear`, que los rechazaría.
> - Los IDs de profesional, paciente, prestación y sillón se obtienen con el patrón `_ids` / fixture `ids` de los tests de C-04, no con UUIDs fijos copiados del seed.
> - Los turnos activos de un mismo profesional o sillón no pueden solaparse (constraint de exclusión): usar horarios o sillones distintos.

## 1. Base

- [ ] 1.1 Leer `CHANGES.md` (scope de C-05), `knowledge-base/06_funcionalidades.md` US-003 (`CA-1`, `CA-2`), `07_flujos_principales.md` Flujo 3, `05_reglas_de_negocio.md` (`RN-ES-01`, `RN-ES-02`), `03_actores_y_roles.md` (RBAC) y `backend/app/turnos/service.py` (`ZONA`) — **Verificación:** las reglas e IDs citados en `spec.md`, `design.md` y `proposal.md` existen en esos archivos (comprobado con `Select-String`); lo no decidido figura como pregunta abierta
- [ ] 1.2 Con el MCP `postgres` (`postgres_list_objects`, `postgres_get_object_details`), confirmar que existen `turnos`, `pacientes`, `profesionales`, `prestaciones` y `sillones`, y los índices de `turnos` — **Verificación:** salida del MCP pegada en la conversación; sin `psql` ni `docker compose exec`
- [x] 1.3 Baseline antes de tocar código — **Verificación:** `python -m pytest -q -rs backend/tests` (venv activo, `CI=true`, `DATABASE_URL` real) termina en `115 passed`, 0 skipped

## 2. Lectura básica (`design.md` D1, D3)

- [x] 2.1 RED→GREEN `test_orden_por_inicio`: dos turnos del mismo profesional el 2026-01-12 (por ejemplo 10:00 y 14:00), insertados primero el de las 14:00 y después el de las 10:00; luego `GET /agenda?profesional=P&fecha=2026-01-12`. En GREEN se agregan a `backend/app/agenda/` (ya existe de C-02) `schemas.py` con `AgendaItemOut`, `service.py` con `ServicioAgenda.agenda_del_dia` y `router.py`, y se monta el router en `main.py` — **Verificación:** RED por `404` de ruta inexistente, no por error de import del test; GREEN con `assert r.status_code == 200` y `assert [i["id"] for i in r.json()] == [str(id_10h), str(id_14h)]`; mutación: quitar el `ORDER BY` debe hacer fallar el test
- [x] 2.2 RED→GREEN `test_campos_completos`: un turno con paciente, prestación y sillón conocidos — **Verificación:** `item = r.json()[0]`; `set(item) == {"id","inicio","fin","estado","paciente_nombre","prestacion_nombre","sillon_nombre"}` y los tres nombres coinciden con los de la base (no solo que las claves existan)
- [x] 2.3 RED→GREEN `test_dia_vacio`: profesional existente, fecha sin turnos — **Verificación:** `assert r.status_code == 200` y `assert r.json() == []`

## 3. Filtros (`design.md` D1, D2)

- [ ] 3.1 RED→GREEN `test_turno_de_otro_profesional_no_aparece`: un turno de P1 y uno de P2 el mismo día; se consulta P1 — **Verificación:** `assert [i["id"] for i in r.json()] == [str(id_p1)]`; mutación: quitar el filtro por `profesional_id` debe hacer fallar el test
- [ ] 3.2 RED→GREEN `test_borde_00_00_incluido` (`2026-01-12 00:00-03:00` con `fecha=2026-01-12`) y `test_borde_00_00_siguiente_excluido` (`2026-01-13 00:00-03:00` con `fecha=2026-01-12`), insertados directo en la base — **Verificación:** el primero `assert str(id_t) in ids_respuesta`; el segundo `assert str(id_t) not in ids_respuesta`; mutación: cambiar `>=` por `>` rompe el primero y `<` por `<=` rompe el segundo
- [ ] 3.3 RED→GREEN `test_borde_23_30_ba`: turno `2026-01-12 23:30-03:00` (`2026-01-13 02:30 UTC`), insertado directo — **Verificación:** con `fecha=2026-01-12` el `id` aparece y con `fecha=2026-01-13` no aparece; mutación: armar el rango en UTC o con fechas sin zona debe hacer fallar el test
- [x] 3.4 RED→GREEN `test_cancelado_no_aparece` (`CA-2`): un turno `cancelado` y uno `pendiente` del mismo profesional y día — **Verificación:** `assert ids_respuesta == [str(id_pendiente)]`; mutación: quitar la exclusión de `cancelado` debe hacer fallar el test
- [ ] 3.5 RED→GREEN `test_atendido_y_ausente_aparecen` (`CA-2`): un turno `atendido` y uno `ausente` del profesional en el día — **Verificación:** ambos `id` aparecen con su `estado`; mutación: reemplazar el filtro por `estado IN ('pendiente','confirmado')` debe hacer fallar el test

## 4. Errores (`design.md` D1)

- [ ] 4.1 RED→GREEN `test_404_profesional_inexistente`: `profesional` con `uuid4()` aleatorio — **Verificación:** `assert r.status_code == 404`; el `404` se emite con el mismo patrón (`detail` string) del router de `turnos`, y solo cuando el profesional no existe (un profesional existente sin turnos sigue dando `200 []`, task 2.3)
- [ ] 4.2 RED→GREEN `test_422_fecha_malformada`: `fecha=no-es-fecha` con profesional existente — **Verificación:** `assert r.status_code == 422`
- [ ] 4.3 RED→GREEN `test_422_parametros_ausentes`: un solo test con dos consultas, una sin `fecha` y otra sin `profesional` — **Verificación:** ambas con `assert r.status_code == 422`

## 5. Cierre y regresión

- [ ] 5.1 Suite completa, `ruff` y seed — **Verificación:** `python -m pytest -q -rs backend/tests` termina en `127 passed`, 0 skipped; `python -m ruff check backend` sin errores; re-sembrar con `$env:SEED_FICTICIO="true"; python -m backend.app.seed.catalogo` (los tests truncan las tablas)
- [ ] 5.2 Sin migración ni cambios en modelos o en `turnos` — **Verificación:** `git diff --stat 59841b3 -- backend/alembic/ backend/app/turnos/models.py backend/app/agenda/models.py backend/app/seed/` vacío; `git diff --stat d0124f9 -- backend/app/turnos/` vacío
- [ ] 5.3 `main.py` solo monta el router — **Verificación:** `git diff backend/app/main.py` muestra únicamente el `import` y el `include_router` de agenda; `GET /health` sigue respondiendo `200`

## 6. Matriz de trazabilidad escenario → verificación

| Escenario (`specs/agenda/spec.md`) | Tipo | Task | Test (`test_agenda_api.py`) | Assertion clave |
|---|---|---|---|---|
| Orden por inicio | esperado | 2.1 | `test_orden_por_inicio` | ids en orden 10h, 14h |
| Campos completos | esperado | 2.2 | `test_campos_completos` | 7 claves y 3 nombres correctos |
| Día vacío | esperado | 2.3 | `test_dia_vacio` | `200` y `[]` |
| Borde 00:00 del día incluido | borde | 3.2 | `test_borde_00_00_incluido` | id presente |
| 00:00 del día siguiente excluido | borde | 3.2 | `test_borde_00_00_siguiente_excluido` | id ausente |
| Turno a las 23:30 de Buenos Aires | borde | 3.3 | `test_borde_23_30_ba` | presente el 12, ausente el 13 |
| Cancelado no aparece | esperado (CA-2, pendiente PO) | 3.4 | `test_cancelado_no_aparece` | solo el pendiente |
| Atendido y ausente aparecen | esperado (CA-2) | 3.5 | `test_atendido_y_ausente_aparecen` | ambos presentes |
| Turno de otro profesional no aparece | esperado | 3.1 | `test_turno_de_otro_profesional_no_aparece` | solo el de P1 |
| Profesional inexistente | error de negocio | 4.1 | `test_404_profesional_inexistente` | `404` |
| Fecha malformada | error de negocio | 4.2 | `test_422_fecha_malformada` | `422` |
| Parámetros ausentes | error de negocio | 4.3 | `test_422_parametros_ausentes` | `422` x2 |

> Nota: si el PO confirma mostrar los cancelados (opción B de `CA-2`), cambian `test_cancelado_no_aparece` (pasaría a `test_cancelado_aparece`) y la condición del `WHERE` en `ServicioAgenda.agenda_del_dia`; el resto de los tests no se toca.
