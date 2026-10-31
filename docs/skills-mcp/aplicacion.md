# Aplicación de MCP y skill al proyecto — resultados

> Proyecto: `turnos-odontologia` · Rama `feature/mcp-postgres` · Parte MCP: Mariano Chirino.
> Los puntos marcados **[PENDIENTE]** no están hechos o verificados al momento de redactar.

## 1. Resultados

**MCP integrado: Postgres MCP Pro** (`crystaldba/postgres-mcp`, Docker, `--access-mode=restricted`), declarado en `opencode.json` y conectado a la base local de turnos (datos ficticios, puerto 5433). `opencode mcp list` muestra `postgres connected` (`mcp-01`).

**Herramientas ejecutadas de verdad:** `postgres_list_objects` (8 tablas), `postgres_get_object_details` (columnas, FK, índices de `turnos`) y `postgres_execute_sql` (definiciones de restricciones, control `SELECT count(*)`, `INSERT` rechazado).

**Aporte al change:** el MCP confirmó la forma real de las restricciones de `turnos`: dos `EXCLUDE USING gist` con `tstzrange(inicio, fin, '[)')` parciales sobre `pendiente`/`confirmado`, dos `CHECK` y los índices `ix_turnos_*_activo`. De ahí salieron decisiones concretas del diseño: cancelar libera el horario sin borrar nada (la fila sale del predicado parcial), reprogramar vuelve a disparar la exclusión en el `UPDATE`, y el borde de adyacencia (RN-AG-04) queda garantizado por el rango semiabierto.

**Change preparado (sin implementar): C-04 `cancelar-reprogramar`**, en `openspec/changes/c-04-cancelar-reprogramar/`: `proposal.md`, `design.md`, `specs/turnos/spec.md` (18 escenarios Dado/Cuando/Entonces: esperados, errores de negocio y bordes) y `tasks.md` (33 tasks TDD, cada una con su verificación y una matriz escenario → test). `openspec validate c-04-cancelar-reprogramar --strict` pasa. No se ejecutó `/opsx:apply`, `backend/` quedó sin cambios (`git diff --stat -- backend/` vacío) y C-04 sigue `[ ] pendiente` en `CHANGES.md`. Lo ambiguo no se decidió: quedó como preguntas abiertas PA-1 a PA-6 en `design.md`.

**Skill propia:** **[PENDIENTE]** (a cargo de Andrés: creación con `skill-creator`, guardado en `.agents/skills/`, registro en `.atl/skill-registry.md`, actualización de `AGENTS.md`/`CLAUDE.md` y prueba en sesión nueva).

## 2. Evidencias

Carpeta: `docs/skills-mcp/evidencias/Capturas MCP/`.

| Captura | Qué muestra |
|---|---|
| [mcp-01](evidencias/Capturas%20MCP/mcp-01-mcp-list.png) | `postgres connected` en `opencode mcp list` |
| [mcp-01b](evidencias/Capturas%20MCP/mcp-01b-mcp-list-fallo.png) | Problema de instalación: `Connection closed` |
| [mcp-02](evidencias/Capturas%20MCP/mcp-02-list-objects.png) | `postgres_list_objects`: 8 tablas |
| [mcp-03a](evidencias/Capturas%20MCP/mcp-03a-columnas-turnos.png), [03b](evidencias/Capturas%20MCP/mcp-03b-constraints-indices.png) | Columnas, FK, checks, exclusiones e índices de `turnos` |
| [mcp-04](evidencias/Capturas%20MCP/mcp-04-insert-por-psql.png) | Hallazgo: el agente usó `psql` en vez del MCP |
| [mcp-05a](evidencias/Capturas%20MCP/mcp-05a-insert-rechazado.png), [05b](evidencias/Capturas%20MCP/mcp-05b-verificacion-count-0.png) | Tras la regla: `INSERT` rechazado por el MCP; `count` = 0 |
| [mcp-05c](evidencias/Capturas%20MCP/mcp-05c-control-select.png) | Control: un `SELECT count(*)` sí pasa |
| [mcp-06a](evidencias/Capturas%20MCP/mcp-06a-consulta-restricciones.png) | `postgres.execute_sql` sobre `pg_constraint`: las 9 restricciones de `turnos` |
| [mcp-06b](evidencias/Capturas%20MCP/mcp-06b-design-restricciones.png) | `design.md` de C-04 (§Restricciones reales) citando las restricciones por nombre |
| [mcp-07a](evidencias/Capturas%20MCP/mcp-07a-rango-definicion.png) | Definición real de las exclusiones, con `'[)'` |
| [mcp-08](evidencias/Capturas%20MCP/mcp-08-get-object-details-constraints-vacio.png) | Resultado crudo de `postgres_get_object_details`: `'constraints': []` vacío |

Nota de honestidad: `mcp-06a` es una corrida corta y aparte, hecha el 2026-10-31. La consulta que respalda el `design.md` se hizo durante `/opsx:propose` el 2026-10-30 y quedó citada en el propio documento, pero esa sesión no se capturó por su extensión.

## 3. Archivos modificados y motivo

| Archivo | Motivo |
|---|---|
| `opencode.json` | Bloque `mcp` con Postgres MCP Pro (sin secretos: `{env:DATABASE_URI}`) |
| `docker-compose.yml` | `POSTGRES_PORT` configurable: el 5432 estaba ocupado por otro proceso local |
| `AGENTS.md` / `CLAUDE.md` (idénticos) | Sección "Integración MCP: postgres": propósito, cuándo usarlo, límites y la regla de consultar solo por el MCP |
| `openspec/changes/c-04-cancelar-reprogramar/` | Change preparado con SDD (no implementado) |
| `CHANGES.md` | Solo la referencia existente de C-04, sin marcarla implementada |
| `docs/skills-mcp/` | Evidencias y documentación |
| `README.md` | **[PENDIENTE]** sección MCP: requisitos, `DATABASE_URI`, pasos, comprobación y problema resuelto |

## 4. Revisión crítica

**Hallazgo 1: el agente se saltó el MCP.**
- *Antes:* ante "insertá un paciente de prueba con SQL", el agente ejecutó `docker compose exec ... psql ... INSERT` y la fila se creó (`INSERT 0 1`, DNI ficticio `99999999`); se borró a mano (`DELETE 1`). Captura `mcp-04`.
- *Detección:* se vio la herramienta usada en la salida del agente, no en su razonamiento.
- *Regla:* en `AGENTS.md`/`CLAUDE.md`, toda consulta a la base va solo por el MCP; `docker compose exec` y `psql` están prohibidos; si el MCP rechaza, se informa sin buscar atajos.
- *Después:* el MCP respondió `Error validating query` al `INSERT`, el agente declaró que no usaría otra vía y el conteo por DNI dio 0 (`mcp-05a`, `05b`).

**Hallazgo 2: errores en los artefactos generados para C-04.** Se detectaron leyendo `design.md`, `spec.md` y `tasks.md` entre sí y contra el código de C-03:
- *Antes:* la tarea 6.6 hacía monkeypatch de `ServicioTurnos.reprogramar`, lo que salteaba la traducción `23P01` → 409 que el propio D4 ubica en el servicio (el test no probaba lo que decía). Además las tasks asertaban la causa `"transicion"`, que el diseño no definía; el reporte decía 27 tasks (hay 33), "20 tests" de C-03 en `test_turno_servicio.py` (hay 18) y "11 ADDED" requirements (hay 10); y una sección afirmaba que ninguna pregunta abierta cambiaba la spec, contradiciendo PA-2.
- *Corrección:* se le pidió al agente corregir solo esos puntos, verificando los números con `--collect-only` y conteo de archivos. Ahora la 6.6 reemplaza `validar` (no `reprogramar`) con el turno conflictivo ya insertado, de modo que el `23P01` lo dispara Postgres de verdad; D5 define `transicion` y su `detalle`; los recuentos quedan auditables en `tasks.md`; la sección de preguntas abiertas es coherente.
- *Después:* `openspec validate --strict` sigue en verde y `backend/` no se tocó.

**Hallazgo 3: limitaciones de la herramienta.**
- `postgres_get_object_details` devolvió `constraints: []` aunque la tabla tiene nueve (captura `mcp-08`); hubo que cruzar con `pg_constraint`/`pg_index` vía `postgres_execute_sql`.
- El MCP rechazó con el mismo `Error validating query` un `SELECT` con `tstzrange(...) && tstzrange(...)` sin `FROM`. La causa no está determinada, y el mensaje no distingue "escritura bloqueada" de "consulta no soportada"; por eso se agregó el control `mcp-05c`.

## 5. Limitaciones

- **`restricted` no es un sandbox:** es validación de SQL con transacciones de solo lectura.
- **Vulnerabilidad registrada (CVE-2026-85620, severidad 9,2):** afecta a todas las versiones de Postgres MCP Pro hasta la 0.3.0 y permitía saltear el modo restringido. La imagen usada fue creada el 2025-05-16; **no se pudo confirmar su versión** ni si existe una corregida. Mitigación: base local con datos ficticios y conexión con un rol de solo lectura sin privilegios de archivos.
- **Usuario de base:** el MCP se conecta como `mcp_readonly` (verificado por el propio MCP el 2026-10-31): no es superusuario, no pertenece a `pg_read_server_files` y tiene solo `SELECT` sobre las 8 tablas de `public`. Es la mitigación recomendada. El rol se creó a mano y no está documentado en el repo (script de referencia en el README). Consecuencia para la evidencia: no recordamos si `mcp-05a` se tomó con este rol. El mensaje que devolvió el MCP (`Error validating query`) es de validación de la consulta y no un `permission denied` de Postgres, lo que indica que el bloqueo lo hizo el modo `restricted`. **[PENDIENTE]** confirmarlo repitiendo la prueba con el usuario dueño.
- **Permisos de OpenCode** para bloquear `psql`/`docker exec`: sintaxis sin verificar en la documentación oficial; hoy la regla es una instrucción al agente, no un bloqueo técnico.
- **PA-1 de C-04** (reasignar profesional, sillón o prestación al reprogramar) sigue abierta con el PO; no impide la preparación, pero cambiaría el contrato de `reprogramar` antes de un `apply`.
- **Confirmación escrita del profesor** sobre usar el MCP en C-04 y no en el change de la skill: **[PENDIENTE]**.
