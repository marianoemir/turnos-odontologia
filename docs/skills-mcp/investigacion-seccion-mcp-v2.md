# Ficha de investigación — Sección MCP (versión 2)

> Reemplaza a la versión anterior (que comparaba contra Context7). Ahora la comparación es entre **dos MCP de base de datos**. Lo marcado **[PENDIENTE]** no se pudo verificar. Esta sección es la parte del MCP; los compañeros completan la skill.

## 1. Necesidad detectada

Al preparar C-04 `cancelar-reprogramar`, las reglas dependen de cómo está definida la tabla `turnos`, y la documentación del proyecto era contradictoria sobre eso (índices parciales según `CHANGES.md`, restricciones `EXCLUDE` según el README). Un MCP de PostgreSQL permite consultar el esquema real en lugar de suponerlo.

## 2. Change donde se aplica

**C-04 `cancelar-reprogramar`** (depende solo de C-03, archivado). La skill propia se aplica en C-06; el profesor indicó que el MCP puede ir en otro change **[PENDIENTE: guardar confirmación por escrito]**.

## 3. Comparación de dos MCP existentes

| Criterio | Postgres MCP Pro (crystaldba) | DBHub (bytebase) |
|---|---|---|
| Propósito | Acceso a PostgreSQL con herramientas de administración: esquema, SQL, planes de consulta, salud | Puerta mínima a varias bases (PostgreSQL, MySQL, MariaDB, SQL Server, SQLite) |
| Herramientas | Se usaron `postgres_list_objects`, `postgres_get_object_details` y `postgres_execute_sql` (verificado en OpenCode). Sus autores listan más (planes de consulta, salud, índices) **[PENDIENTE: contrastar con el README]** | 2 por defecto: `execute_sql` y `search_objects` (según su README) |
| Modo seguro | `--access-mode=restricted` (solo lectura). **Verificado:** rechazó un `INSERT` | Modo de solo lectura y límite de filas (según su README) **[sin probar]** |
| Instalación | Imagen Docker `crystaldba/postgres-mcp` (o Python) | `npx` o Docker |
| Requisitos | Docker | Node (la versión requerida debe verificarse con `node --version`) |
| Credenciales | `DATABASE_URI` con usuario y contraseña, por variable de entorno | DSN con usuario y contraseña |
| Compatibilidad con OpenCode | Verificada: `opencode mcp list` lo muestra conectado | Debería funcionar como MCP local de tipo stdio **[sin probar]** |
| Costo y licencia | Código abierto, licencia MIT (según su repositorio) | **[PENDIENTE: verificar licencia]** |
| Riesgos | Sin una regla adicional, el agente puede modificar datos por la terminal (ver hallazgo en las evidencias) | Con transporte HTTP escucha en todas las interfaces y no autentica clientes (usar `stdio` o `127.0.0.1`) |

La comparación es documental: solo se instaló y usó el MCP elegido, como pide el TP.

## 4. Elección justificada

**Postgres MCP Pro**, por tres razones:
- Está pensado para PostgreSQL, la base del proyecto.
- Se probó de punta a punta: conexión, dos herramientas reales sobre la tabla `turnos` y rechazo de escrituras en modo `restricted`.
- Su aporte al change es concreto: mostró que `turnos` tiene restricciones de exclusión GiST, dos `CHECK` y varios índices, lo que condiciona cómo se escribe la reprogramación (conflicto → `409` y turno original intacto, RN-TU-02).

Costo asumido: requiere Docker y manejar una `DATABASE_URI` con contraseña. DBHub sería la opción más liviana si no se quisiera usar Docker.

## 5. Instalación y configuración (probada en OpenCode 1.19.0)

1. Levantar Postgres con el puerto configurable: `POSTGRES_PORT=5433` en `.env` y `docker compose up -d postgres`.
2. `docker pull crystaldba/postgres-mcp`.
3. Definir en la consola: `$env:DATABASE_URI="postgresql://odontologia:<clave>@host.docker.internal:5433/turnos"`.
4. Agregar el bloque `mcp` a `opencode.json` (ver evidencias, sección 3). La contraseña no va escrita en el archivo.
5. Comprobar con `opencode mcp list` y ejecutar una herramienta real (ver evidencias EV-02 y EV-03).

## 6. Límites de acceso

- Solo base **local** con **datos ficticios**.
- Modo `restricted`. Toda consulta pasa por el MCP; está prohibido modificar datos por otra vía (regla en `AGENTS.md` y `CLAUDE.md`).
- Una instrucción no es un control técnico: un permiso de OpenCode sería el control real **[PENDIENTE: verificar sintaxis]**.
- La contraseña no se guarda en el repositorio, la entrega ni el video.

## 7. Archivos de la fundación que se actualizan

- `opencode.json`: bloque `mcp`.
- `AGENTS.md` y `CLAUDE.md` (idénticos): propósito, herramientas, cuándo usarlo y límites del MCP.
- `README.md`: requisitos, variables (`DATABASE_URI`, `POSTGRES_PORT`), comprobación y problemas resueltos.
- `docker-compose.yml`: puerto configurable.
- **No** se registra en `.atl/skill-registry.md`: es una integración, no una skill.

## 8. Fuentes (consultadas el 29-30/10/2026; reabrir antes de entregar)

| Fuente | URL |
|---|---|
| Postgres MCP Pro | https://github.com/crystaldba/postgres-mcp |
| DBHub | https://github.com/bytebase/dbhub |
| OpenCode, MCP servers | https://docs.opencode.ai/docs/mcp-servers |
| Evidencias de uso propias | `docs/skills-mcp/evidencias/mcp-evidencias.md` |
