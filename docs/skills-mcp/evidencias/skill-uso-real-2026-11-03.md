# Evidencia de uso de la skill `lista-espera-odontologia` (2026-11-03)

> Lo no verificado figura como **[PENDIENTE]**. Una sola ejecución, sin repetir.

## Contexto
- Sesión **nueva** de OpenCode, abierta por CLI en la raíz del repo, sobre `main` (`e0216e8`), árbol limpio.
- Modelo usado: **[PENDIENTE]** (no se registró).

## Pedido
> Usando la skill lista-espera-odontologia, revisá los escenarios de `openspec/changes/archive/2026-11-02-c-06-lista-de-espera/specs/lista-espera/spec.md` y listá reglas ambiguas o casos de borde que falten. No modifiques ningún archivo.

## Traza observada en pantalla
1. `→ Skill "lista-espera-odontologia"` (la herramienta `skill` se invocó **antes** de leer la spec).
2. `→ Read openspec\changes\archive\2026-11-02-c-06-lista-de-espera\specs\lista-espera\spec.md`.
3. Respuesta con ambigüedades y casos de borde organizados por requisito.

No modificó archivos: `git status --short` posterior solo mostró el archivo de captura de intención, guardado por una persona del equipo.

## Qué aportó al change
Listó, por requisito de la spec, huecos que ya conocíamos y otros nuevos: duplicados en la lista, caducidad de ofertas sin respuesta, responder a una entrada sin oferta, reactivación de entradas en `baja`, empates en `creado_en` y validación de parámetros.

## Revisión crítica
| Hallazgo | Qué se vio | Cómo se detectó / fuente |
|---|---|---|
| Hallazgos B1 a B5 **no independientes** | El agente los cita "de la skill". `SKILL.md` (líneas 400 a 405) ya los lista: B1, B3 y B4 corregidos; B2 y B5 abiertos. Los leyó, no los descubrió | Lectura de `SKILL.md` |
| Sugerencia **inadecuada** | Propone aclarar qué pasa con pacientes "dados de baja o bloqueados". El modelo `Paciente` solo tiene `id`, `nombre`, `dni`, `contacto` y `ficticio`: ese estado no existe | `backend/app/agenda/models.py`, líneas 28 a 39 |
| Hallazgo plausible, **sin verificar** | Empates en `creado_en`: la columna usa `server_default now()`, que en PostgreSQL devuelve el inicio de la transacción. En la API real cada request tiene su transacción, por lo que sería raro | `backend/app/lista_espera/models.py`; inferencia, no se ejecutó |
| Hueco de la spec, no del código | `?profesional=` con UUID malformado: FastAPI responde 422 solo | Comportamiento del framework |

## Límites
- Los hallazgos nuevos son decisiones de negocio abiertas, no errores de código.
- No se comparó contra una corrida **sin** la skill, así que no se puede atribuir a la skill lo que el agente habría encontrado igual.
- Solo se probó la revisión de una spec; no se probó que la skill guíe una implementación nueva.
