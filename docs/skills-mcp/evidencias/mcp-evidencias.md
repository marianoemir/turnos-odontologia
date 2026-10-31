# Evidencias del MCP — Postgres MCP Pro

> Ubicación sugerida en el repo: `docs/skills-mcp/evidencias/mcp-evidencias.md`.
> Capturas en la misma carpeta (ver sección 9 con los nombres sugeridos).
> Lo marcado **[PENDIENTE]** todavía no se hizo o no se pudo verificar.
> Sin credenciales: la contraseña de la base no aparece en ningún archivo ni captura.

**Integrante responsable:** [completar]
**Fecha de las pruebas:** 30/10/2026
**Rama:** `feature/mcp-postgres`

## 1. Resumen

| ID | Evidencia | Estado |
|---|---|---|
| EV-01 | Conexión del MCP desde OpenCode (`opencode mcp list`) | Hecha. **[PENDIENTE: captura]** |
| EV-02 | Herramienta real 1: `postgres_list_objects` | Hecha, con captura |
| EV-03 | Herramienta real 2: `postgres_get_object_details` sobre `turnos` | Hecha, con captura |
| EV-04 | Hallazgo: el agente modificó datos por terminal, fuera del MCP | Hecha, con captura |
| EV-05 | Corrección en `AGENTS.md`/`CLAUDE.md` y nueva prueba del límite | Hecha. **[PENDIENTE: captura del rechazo]** |
| EV-06 | Aplicación al change C-04: `design.md` y specs con datos del MCP | **[PENDIENTE]** |

## 2. Change donde se aplica el MCP

- **MCP → C-04 `cancelar-reprogramar`.** Depende solo de C-03 (archivado) y trabaja sobre la tabla `turnos`.
- **Skill propia → C-06 `lista-de-espera`** (otro integrante).
- El profesor indicó que el MCP puede ir en un change distinto al de la skill. **[PENDIENTE: guardar la confirmación por escrito]**.
- Este documento no implementa ni archiva C-04: solo se prepara.

## 3. Entorno y configuración

| Elemento | Valor |
|---|---|
| OpenCode | 1.19.0 |
| Servidor MCP | `crystaldba/postgres-mcp` (imagen Docker, tag `latest`) |
| Digest de la imagen descargada | `sha256:dbbd346860d29f1543e991f30f3284bf4ab5f096d049ecc3426528f20b1b6e6b` |
| Modo de acceso | `restricted` (solo lectura) |
| Base | PostgreSQL 16 local en Docker, datos ficticios |
| Conexión | `postgresql://odontologia:***@host.docker.internal:5433/turnos` |
| Variables de entorno | `DATABASE_URI` (la define cada integrante en su consola), `POSTGRES_PORT=5433` (archivo `.env`, ignorado por Git) |

Configuración en `opencode.json` (sin secretos):

```json
"mcp": {
  "postgres": {
    "type": "local",
    "command": ["docker", "run", "-i", "--rm", "-e", "DATABASE_URI",
                "crystaldba/postgres-mcp", "--access-mode=restricted"],
    "environment": { "DATABASE_URI": "{env:DATABASE_URI}" },
    "enabled": true
  }
}
```

Para reproducirlo: levantar Postgres con `POSTGRES_PORT` definido, `docker pull crystaldba/postgres-mcp`, definir `DATABASE_URI` en la consola y abrir OpenCode desde esa misma consola.

## 4. EV-01 — Conexión

Comando: `opencode mcp list`. Resultado: `postgres connected`, con el comando de Docker en modo `restricted`.

También figuran `context7`, `engram` y `playwright` conectados (vienen de la configuración global de Active Stack) y `mermaid failed` por timeout de `npx -y mcp-mermaid`. Este último es de la configuración global y no afecta a este trabajo.

Que figure como conectado significa que OpenCode pudo arrancar el contenedor; no prueba por sí solo que llegue a la base. Eso lo prueban EV-02 y EV-03.

## 5. EV-02 — Herramienta real 1: `postgres_list_objects`

- **Solicitud:** "Listar tablas del esquema public".
- **Herramienta usada por el agente:** `postgres_list_objects [schema_name=public]`.
- **Resultado:** 8 tablas: `alembic_version`, `bloqueos`, `horarios`, `pacientes`, `prestaciones`, `profesionales`, `sillones`, `turnos`.
- **Qué aporta:** confirma que el MCP llega a la base del proyecto y que las migraciones están aplicadas.

## 6. EV-03 — Herramienta real 2: `postgres_get_object_details`

- **Solicitud:** "Mostrame las columnas y las restricciones de la tabla de turnos".
- **Herramienta:** `postgres_get_object_details [object_type=table, schema_name=public, object_name=turnos]`.
- **Resultado (resumen de la respuesta del agente; ver captura):**
  - Columnas: `id`, `paciente_id`, `profesional_id`, `sillon_id`, `prestacion_id` (todas `uuid`, no nulas); `inicio` y `fin` (`timestamp with time zone`, no nulas); `estado` (`text`, no nula, por defecto `'pendiente'`); `creado_por` (`text`, nula).
  - Clave primaria `pk_turnos` y cuatro claves foráneas (pacientes, profesionales, sillones, prestaciones).
  - Dos `CHECK`: `ck_turnos_fin_posterior_a_inicio` y `ck_turnos_estado_valido`.
  - Dos restricciones de exclusión GiST sobre `tstzrange`: `ex_turnos_profesional_sin_solape` y `ex_turnos_sillon_sin_solape`, aplicadas a los estados `pendiente` y `confirmado`.
  - Índices B-tree: `ix_turnos_profesional_activo`, `ix_turnos_sillon_activo` (filtrados por estados activos) e `ix_turnos_paciente_inicio`.
- **Qué aporta al change C-04:**
  - Resuelve una diferencia entre documentos: el `CHANGES.md` hablaba de índices parciales y el README de `EXCLUDE`. La base real tiene **las dos cosas**.
  - Para reprogramar (un `UPDATE` de `inicio` y `fin`), la base ya impide el solape por sí sola. El conflicto se traduce en `409` y el turno original debe quedar intacto (RN-TU-02).
  - **[PENDIENTE]** Verificar en la base cómo se comporta el límite exacto del rango (RN-AG-04: un turno que empieza justo cuando termina otro no es solapamiento). La captura no lo muestra.

## 7. EV-04 — Hallazgo: escritura fuera del MCP

- **Solicitud:** pedido de insertar un paciente de prueba con SQL, sin indicar que debía usarse el MCP. **[completar con el texto exacto]**
- **Qué hizo el agente:** ejecutó `docker compose exec -T postgres psql -U odontologia -d turnos -c "INSERT INTO public.pacientes ..."` y el insert **se realizó** (`INSERT 0 1`). Después usó `postgres_execute_sql` solo para verificar con un `SELECT`.
- **Por qué es un problema:** `psql` con el usuario de la base no pasa por el MCP, así que no aplica el modo `restricted`. Un MCP de solo lectura no limita al agente si este tiene acceso a la terminal.
- **Cómo se detectó:** en la captura se ve el comando `docker compose exec`, en lugar de la herramienta `postgres_execute_sql`.
- **Limpieza:** el registro (nombre "Paciente Prueba AI", DNI ficticio `99999999`) se borró a mano con `DELETE ... WHERE dni = '99999999'` (resultado `DELETE 1`).

## 8. EV-05 — Corrección y nueva prueba

**Regla agregada** (`AGENTS.md` y `CLAUDE.md`, idénticos): toda consulta a la base se hace únicamente con el MCP `postgres`, está prohibido consultar o modificar datos por terminal (`docker compose exec`, `psql`, etc.), y si el MCP rechaza una operación hay que informarlo y no buscar un atajo.

**Nueva prueba (sesión nueva de OpenCode):** pedido de ejecutar un `INSERT` en `pacientes` usando únicamente `postgres_execute_sql`, sin otra vía. **[confirmar que este es el texto usado]**

**Resultado:**
- El MCP respondió `Error validating query: INSERT INTO public.pacientes ...` y el agente explicó que la herramienta opera en solo lectura.
- No usó la terminal.
- Verificación con `SELECT count(*) FROM public.pacientes WHERE dni = '88888888'` por `psql`: **0 filas**. No se insertó nada.

| | Antes | Después |
|---|---|---|
| Vía usada | `docker compose exec ... psql` | `postgres_execute_sql` |
| Resultado | `INSERT 0 1` (se modificó la base) | Rechazo del MCP, 0 filas |

## 9. EV-06 — Aplicación a C-04 **[PENDIENTE]**

A completar cuando se prepare el change con el MCP (sin implementarlo):

| Campo | Contenido |
|---|---|
| Tarea concreta | [ej.: escribir el `design.md` de reprogramar según las restricciones reales de `turnos`] |
| Solicitud realizada | [texto exacto] |
| Herramienta del MCP usada | [nombre] |
| Resultado obtenido | [resumen + captura] |
| Qué aportó al change | [qué decisión del design o qué escenario cambió] |

## 10. Problemas de instalación y cómo se resolvieron

1. **Entorno virtual sin activar:** `alembic`, el seed, `pytest` y `uvicorn` terminaban al instante y sin mensajes. Faltaba activar `.venv` (el prompt no mostraba `(.venv)`). Solución: crear y activar el entorno e instalar `backend/requirements.txt`.
2. **Conflicto con el puerto 5432:** la conexión fallaba con autenticación rechazada para el usuario de la base. `netstat` mostraba **dos procesos** escuchando en el 5432: uno es el contenedor y el otro, muy probablemente, un PostgreSQL instalado en Windows (no se identificó el proceso). Solución: hacer configurable el puerto (`${POSTGRES_PORT:-5432}:5432` en `docker-compose.yml`) y usar el 5433 mediante `.env`.
3. **Cambio de puerto que no se aplicaba:** el archivo del repo seguía con el valor viejo y la migración quedaba colgada. Solución: verificar con `Select-String` el contenido real del archivo y recrear el contenedor. Además, un commit dejó el 5433 fijo; se corrigió a la variable.
4. **Servidor `mermaid` con timeout** en `opencode mcp list`: proviene de la configuración global y no afecta a este trabajo.

## 11. Limitaciones

- La regla de `AGENTS.md` funcionó en esta sesión, pero una instrucción no es un control técnico. Un permiso de OpenCode (confirmación antes de ejecutar comandos de terminal) sería el control real. **[PENDIENTE: verificar su sintaxis en la documentación]**
- El modo `restricted` se comprobó con un `INSERT`; no se probaron `UPDATE`, `DELETE` ni DDL.
- No se probó un segundo MCP: la comparación es documental (ver la ficha de investigación).
- Se usó una imagen con el tag `latest` (digest registrado arriba); conviene fijar una versión.

## 12. Archivos de capturas (nombres sugeridos)

| Archivo original | Renombrar a | Contenido |
|---|---|---|
| `Captura_de_pantalla_2026-10-30_005653.png` | `mcp-02-list-objects.png` | EV-02 |
| `Captura_de_pantalla_2026-10-30_005659.png` | `mcp-03a-columnas-turnos.png` | EV-03 (columnas y claves foráneas) |
| `Captura_de_pantalla_2026-10-30_005735.png` | `mcp-03b-constraints-indices.png` | EV-03 (checks, exclusión e índices) |
| `Captura_de_pantalla_2026-10-30_005747.png` | `mcp-04-insert-por-psql.png` | EV-04 |
| (falta) | `mcp-01-mcp-list.png` | EV-01 |
| (falta) | `mcp-05-insert-rechazado.png` | EV-05 |
| (falta) | `mcp-06-aplicacion-c04.png` | EV-06 |
