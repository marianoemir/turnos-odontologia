# Ficha de investigación: skill propia y MCP

> Proyecto `turnos-odontologia` · Metodología I (UTN). Lo no verificado figura como **[PENDIENTE]**.

## 1. Necesidad y changes elegidos

El proyecto tiene reglas de dominio que viven en la base (no solapamiento de profesional y sillón con `EXCLUDE USING gist`, estados válidos, rango `[)`). Si el agente las deduce solo leyendo código, puede inventarlas o contradecirlas. Necesitamos dos cosas:

- **MCP (C-04 `cancelar-reprogramar`):** que el agente consulte el esquema real de `turnos` para fundamentar el diseño. C-04 depende solo de C-03 (archivado). El profesor todavía no vio el MCP, así que la elección de C-04 para esta herramienta queda sujeta a su validación.
- **Skill propia (C-06 `lista-de-espera`):** un procedimiento repetible para preparar el change de lista de espera (US-004) sin improvisar reglas. Fue aprobada por el profesor.

Se prepara un change por herramienta, sin implementar (sin `/opsx:apply`).

## 2. Skill creadora y diseño de la skill propia

**Skill creadora:** `skill-creator`, del repositorio de skills de Anthropic (`github.com/anthropics/skills`): carpeta con `SKILL.md` (frontmatter `name` y `description`) y recursos opcionales, con carga progresiva. Ya está en `.agents/skills/skill-creator/` y registrada en `.atl/skill-registry.md`. OpenCode carga skills desde `.agents/skills/<nombre>/SKILL.md` y exige `name` y `description` en el frontmatter (documentación oficial). **[PENDIENTE]** abrir `github.com/anthropics/skills` y confirmar la fuente de `skill-creator`.

**Skill propia (Andrés): `lista-espera-odontologia`.**
- *Dominio:* modelo `ListaEspera` (estados `pendiente|ofrecido|asignado|baja`), alta, consulta y ofrecimiento de un hueco, orden FIFO por `creado_en`.
- *Disparadores:* "lista de espera", "waitlist", "C-06", "US-004".
- *Regla de oro:* el orden FIFO es un **supuesto justificado**, no una regla (pregunta abierta Q5).
- *Uso en este TP:* solo para **preparar** C-06 (checklist de tasks y esqueleto de escenarios).
- **[PENDIENTE]** crearla con `skill-creator`, guardarla en `.agents/skills/`, registrarla y probarla en sesión nueva.

## 3. Comparación de dos MCP (ambos probados en OpenCode, 2026-10-31)

| Criterio | **Postgres MCP Pro** | **DBHub** (v1.5.0) |
|---|---|---|
| Alcance | Solo PostgreSQL | PostgreSQL, MySQL, MariaDB, SQL Server, SQLite |
| Herramientas | SQL, detalle de objetos, explain, salud, índices | 2 (`execute_sql`, `search_objects`); `explain_sql` y `health_check` opcionales |
| Solo lectura | `--access-mode=restricted`: transacciones de solo lectura y SQL parseado | `readonly = true` en TOML: clasificador de palabras clave más `BEGIN READ ONLY` en la base |
| Configuración | Un flag | Archivo `dbhub.toml` y volumen Docker (`--readonly` fue eliminado) |
| Error ante una escritura | `Error validating query` (genérico) | `READONLY_VIOLATION`, con la lista de operaciones permitidas |
| Columnas de `turnos` | Sí | Sí |
| Índices con la herramienta de inspección | Definición completa (`CREATE INDEX ... USING gist (...) WHERE (...)`), con orden real de columnas | Nombres y columnas, **sin predicado parcial** y con orden de columnas no confiable |
| Restricciones con la herramienta de inspección | `constraints: []` (vacío, captura `mcp-08`) | No existe tipo `constraint` |
| Definiciones reales (`EXCLUDE`, `CHECK`, `WHERE`) | SQL a `pg_constraint`/`pg_index` | SQL a `pg_constraint`/`pg_indexes` |
| Licencia / instalación | MIT / Docker, `pipx`, `uv` | MIT / Docker, `npx` |

**Costo en tokens:** DBHub declara 1,4k tokens con sus 2 herramientas por defecto (dato de su README, **no medido por nosotros**; el panel de contexto de la app mide toda la sesión, no solo las herramientas).

**Elección: Postgres MCP Pro.** Ya estaba integrado, con el flujo completo probado y documentado (incluido el hallazgo de que el agente usó `psql`), y se activa con un solo flag. Además trae herramientas de explain y salud que pueden servir en changes posteriores. **Es una decisión cercana:** DBHub es mejor en el mensaje de error, en el costo en tokens declarado y en la validación de solo lectura de dos capas. En inspección de índices, Postgres MCP Pro es más completo: entrega la definición con el predicado parcial y el orden real de columnas, y DBHub no. Ninguno de los dos entrega las restricciones (`EXCLUDE ... WITH &&`, `CHECK`) con su herramienta de inspección: en ambos hubo que consultar `pg_constraint` con SQL.

**Seguridad (ambos con vulnerabilidades registradas):**
- *Postgres MCP Pro:* CVE-2026-85620 (publicada el 2026-09-04, severidad 9,2). Afecta a todas las versiones hasta la 0.3.0: una función puesta en la cláusula `FROM` evade la validación del modo `restricted` y permite leer archivos del servidor. En notas del 5 de setiembre no había versión corregida; **[PENDIENTE]** ver si hoy existe. **No pudimos confirmar** la versión de nuestra imagen (creada el 2025-05-16).
- *DBHub:* CVE-2026-61788 (el modo solo lectura no impedía escrituras; corregido en 0.22.6) y CVE-2026-61742 (HTTP sin autenticación; solo afecta al transporte HTTP). Probamos la v1.5.0 por `stdio`, así que no nos alcanzan. Existe además CVE-2026-79536, una inyección SQL en `sql-parser.ts` de la v1.2.0, **sin aviso del proveedor**: no confirmamos si la 1.5.0 la corrige.
- *Mitigación común:* base local con datos ficticios y usuario de base de solo lectura, sin privilegios de lectura de archivos del servidor como `pg_read_server_files` (DBHub lo recomienda). Ambos MCP se probaron con el rol `mcp_readonly` (solo `SELECT` en las 8 tablas, sin superusuario ni `pg_read_server_files`); el script de referencia para recrearlo está en el README.

## 4. Instalación y configuración (Postgres MCP Pro)

1. Docker Desktop abierto y `docker compose up -d postgres` (puerto 5433, ver README).
2. `docker pull crystaldba/postgres-mcp`.
3. Definir `DATABASE_URI` como variable de entorno de usuario (nunca en el repo) y reabrir la app.
4. Bloque `mcp` en `opencode.json`: `docker run -i --rm -e DATABASE_URI crystaldba/postgres-mcp --access-mode=restricted`.
5. Comprobar con `opencode mcp list`: debe decir `postgres connected`.

Es una **integración**, no una skill. Detalle y problemas resueltos en el README. DBHub se probó en una rama descartable (`tmp/prueba-dbhub`) y se eliminó: no forma parte del proyecto. Con Docker no requiere Node. Para la ruta `npx`, el README de DBHub indica Node ≥ 22.5.0 en su sección de desarrollo; no lo probamos.

## 5. Archivos de la fundación a actualizar

| Archivo | Cambio |
|---|---|
| `opencode.json` | Bloque `mcp` (sin secretos) |
| `docker-compose.yml` | `POSTGRES_PORT` configurable |
| `AGENTS.md` / `CLAUDE.md` (idénticos) | Sección del MCP (propósito, cuándo, límites, regla de no usar `psql`) y sección de la skill |
| `.atl/skill-registry.md` | Registro de la skill propia **[PENDIENTE]** |
| `.agents/skills/lista-espera-odontologia/` | Carpeta de la skill **[PENDIENTE]** |
| `README.md` | Sección MCP |
| `CHANGES.md` | Solo la referencia de C-04 y C-06, sin marcarlos implementados |
| `docs/skills-mcp/` | Ficha, aplicación y evidencias |

## 6. Fuentes (consultadas el 2026-10-31)

- Postgres MCP Pro: https://github.com/crystaldba/postgres-mcp (instalación, modos de acceso, herramientas, MIT).
- DBHub: https://github.com/bytebase/dbhub (herramientas, instalación, MIT); solo lectura: https://dbhub.ai/tools/execute-sql; TOML: https://dbhub.ai/config/toml
- Vulnerabilidades de DBHub: https://advisories.gitlab.com/npm/@bytebase/dbhub/CVE-2026-61788/ · https://advisories.gitlab.com/npm/@bytebase/dbhub/CVE-2026-61742/ · https://app.opencve.io/cve/CVE-2026-79536
- Vulnerabilidad de Postgres MCP Pro: https://osv.dev/vulnerability/CVE-2026-85620 (CVE-2026-85620, publicada el 2026-09-04).
- Skill creadora: https://github.com/anthropics/skills (**[PENDIENTE]** abrirlo directamente) y estándar https://agentskills.io
- OpenCode, MCP: https://opencode.ai/docs/mcp-servers (clave `mcp`, `type: local`, `command`, `environment`, `enabled`, sustitución `{env:NAME}`). Skills: https://opencode.ai/docs/skills (carpetas `.opencode/skills`, `.claude/skills` y `.agents/skills`; frontmatter `name` y `description`).

Nota: una página de npm sobre DBHub mostraba `--readonly`; era de una versión anterior y la versión probada (v1.5.0) ya no lo acepta. Se usó la documentación de `dbhub.ai`.
