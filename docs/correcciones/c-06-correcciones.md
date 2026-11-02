# Correcciones posteriores a C-06 (lista de espera)

> Fecha: 2026-11-02 · Rama: `fix/c-06-correcciones` (salida de `main` en `7e35a2d`).
> El change `2026-11-02-c-06-lista-de-espera` está archivado y **no se reescribió**: este documento y la nota de rectificación de su `design.md` registran qué se corrigió, por qué y qué quedó abierto.

## 1. Consistencia del repositorio

| Qué | Problema | Corrección |
|---|---|---|
| `AGENTS.md` / `CLAUDE.md` | No eran idénticos (difería la línea de estado) | `CLAUDE.md` pasó a ser copia de `AGENTS.md`; hash idéntico verificado |
| Tabla de skills de `AGENTS.md` | No mencionaba `lista-espera-odontologia` | Se agregó la fila y una nota con cuándo usarla, qué necesita y cómo revisar el resultado |
| `.atl/skill-registry.md` | Regenerado entero: ruta absoluta de un usuario, 3 skills de nivel usuario no reproducibles desde el repo | Se restauró la versión previa y se agregó **solo** la fila y las compact rules de `lista-espera-odontologia`, con ruta relativa (16 skills). El registro **no se regeneró**: lo dice una nota en el propio archivo |
| `.gitignore` | Ignoraba `.atl/` aunque `AGENTS.md` dice que el registro está versionado | Se quitó `.atl/` del `.gitignore` |
| `.active-orchestrator-state.json` | Perdió el BOM y se reformateó entero | Se restauró la versión previa (con BOM) y se aplicó solo lo necesario: `skills_count` 15→16, la skill en `project_skills` y `skills.installed`, y una nota |
| `test_turno_servicio.py` | Cambio ajeno a C-06 | Se revirtió: con la línea original `ruff check` pasa (`All checks passed!`) |
| `design.md` archivado | Decía "Q5 resuelto a FIFO por defecto" | Se **agregó** al final una nota de rectificación: Q5 sigue abierta (`knowledge-base/10_preguntas_abiertas.md`) y FIFO es decisión provisional |

## 2. Correcciones de código (TDD: RED a la vista → GREEN)

| Bug | Comportamiento anterior | Comportamiento ahora | Test |
|---|---|---|---|
| **B1** | `listar(profesional_id=X)` excluía las entradas generales (`profesional_id` nulo) | Devuelve las de ese profesional **y las generales** | `test_listar_filtra_por_profesional` (ajustado: antes afirmaba el comportamiento erróneo) |
| **B4** | Ofrecer una entrada ya `ofrecido` creaba un segundo turno y dejaba huérfano el primero | Solo se puede ofrecer una entrada `pendiente`; si no, 409 | `test_ofrecer_ya_ofrecido_no_duplica_turno` |
| **B3** | Si fallaba la cancelación del turno al rechazar, la entrada igual pasaba a `baja` con el turno vivo | Se propaga el error, la entrada sigue `ofrecido`; la API responde **409** | `test_rechazo_no_da_baja_si_falla_la_cancelacion` y `test_responder_rechazar_409_si_falla_la_cancelacion` |

### Decisiones de dominio (justificación)

- **B1, "si aplica":** la spec dice "devuelve solo las entradas de ese profesional (y las generales si aplica)". Se interpretó "si aplica" como **siempre**, porque una entrada general (sin profesional) puede ser atendida por cualquiera.
- **B4, 409:** la spec archivada no tiene un escenario para "ofrecer una entrada ya ofrecida". El 409 es una **decisión de este equipo**, coherente con la regla dura de no responder 200/500 ante un conflicto de negocio, y **no** una regla de la base de conocimiento.
- **B3, router:** arreglar solo el servicio habría dejado a la API respondiendo **500** ante la falla de cancelación (el router de `responder` no atrapaba `ConflictoTurno`). Por eso se corrigieron servicio y router en el mismo commit, con un test de API que lo demuestra. No se agregó `except TurnoNoEncontrado`: la FK `RESTRICT` impide que el turno ofrecido no exista y no hay test que lo cubra.

## 3. Verificación

- Suite completa: **155 passed, 0 skipped** (línea base antes de las correcciones: 152).
- `ruff check backend`: `All checks passed!`.
- Migración: base en `003_lista_espera (head)`.
- Seed ficticio: `'profesionales': 2, 'sillones': 2, 'prestaciones': 3, 'horarios': 10, 'bloqueos': 1, 'pacientes': 3`.

## 4. Limitaciones y pendientes (no corregidos a propósito)

- **B2:** `responder(acepta=False)` calcula el siguiente de la lista, pero el endpoint lo descarta. La spec dice "el siguiente queda disponible" y no define qué significa. Decisión pendiente (propuesta mínima: devolverlo en la respuesta, sin crear turnos automáticos; ofrecerlo sería otro change).
- **B5:** `ofrecer` no valida que el profesional ofrecido coincida con el de la entrada ni que realice la prestación. Falta revisar qué ya valida `ServicioTurnos.crear()` antes de decidir.
- **Q5 (criterio de orden):** sigue abierta con el PO como responsable; FIFO por `creado_en` es provisional.
- **Reglas `RN-*` sin verificar contra la KB:** la skill cita `RN-AG-02/03/04` y el proposal `RN-TU-01`; la spec no cita ninguna.
- **Tasks sin mapeo escenario → test:** `tasks.md` dice "verificar en verde" sin indicar qué test cubre cada escenario. La spec tiene 11 escenarios.
- **README:** no tiene ejemplos de lista de espera.
- Los cambios de B3 y B4 no figuran en la spec archivada. Si el equipo los quiere como parte del contrato, corresponde un change nuevo que los incorpore, no editar el archivado.
