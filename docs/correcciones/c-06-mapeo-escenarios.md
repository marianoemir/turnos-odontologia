# Anexo C-06: mapeo escenario -> test -> regla de la KB

> Fecha: 2026-11-02 · Rama: `fix/c-06-correcciones`.
> Anexo del change archivado `2026-11-02-c-06-lista-de-espera`, que **no se reescribe**. Cierra los hallazgos 8 (`RN-*` contra la KB) y 9 (tasks sin mapeo escenario -> verificación) de `c-06-correcciones.md` §4.
> **Método y límite:** el mapeo se hizo por **nombre de test**. No se verificó test por test que cada aserción cubra el THEN completo del escenario.

## 1. Escenarios de la spec -> tests

La spec archivada tiene **10 escenarios** (el "11" de notas anteriores era un error de conteo).

| # | Escenario | Test de servicio | Test de API | Regla en la KB |
|---|---|---|---|---|
| 1 | Alta válida | `test_alta_crea_pendiente` | `test_alta_da_201_pendiente` | Ninguna (US-004 es "posterior"): decisión de C-06 |
| 2 | Alta sin profesional | `test_alta_sin_profesional` | `test_alta_sin_profesional` | Ninguna: decisión de C-06 |
| 3 | Paciente inexistente | `test_alta_paciente_inexistente_404` | `test_alta_paciente_inexistente_404` | Ninguna |
| 4 | Orden FIFO | `test_listar_fifo_por_creado_en` | `test_listar_fifo` | Q5 abierta (PO): FIFO es provisional |
| 5 | Filtro por profesional | `test_listar_filtra_por_profesional` | `test_listar_filtro_profesional` | Ninguna; ver B1 |
| 6 | Hueco libre | `test_ofrecer_crea_turno_valido` | `test_ofrecer_crea_turno_valido` | RN-AG-02/03/04 vía `ServicioTurnos.crear()` |
| 7 | Hueco ocupado | `test_ofrecer_conflicto_revierte_pendiente` | `test_ofrecer_conflicto_409_revierte` | RN-AG-02/03/04 |
| 8 | Acepta | `test_aceptar_marca_asignado` | `test_responder_aceptar` | Ninguna |
| 9 | Rechaza y avanza | `test_rechazo_cancela_y_avanza` | `test_responder_rechazar_avanza` | RN-TU-01 y RN-ES-01 (cancelar libera y es transición válida) |
| 10 | Baja preserva registro | (sin test de servicio) | `test_baja_preserva_registro` | RN-ES-01 aplica a turnos, no a entradas de lista |

## 2. Tests que no corresponden a ningún escenario de la spec

| Comportamiento | Tests | Origen |
|---|---|---|
| Ofrecer una entrada inexistente (404) | `test_ofrecer_entrada_inexistente`, `test_ofrecer_inexistente_404` | Implementación de C-06 |
| Ofrecer una entrada en estado inválido | `test_ofrecer_estado_invalido` | Implementación de C-06 |
| Ofrecer una entrada ya ofrecida (409) | `test_ofrecer_ya_ofrecido_no_duplica_turno` | B4: decisión de este equipo |
| Responder sin oferta (409) | `test_rechazo_sin_oferta_409`, `test_responder_sin_oferta_409` | Implementación de C-06 |
| Responder a una entrada inexistente | `test_responder_inexistente` | Implementación de C-06 |
| Rechazo con falla al cancelar el turno (no pasa a baja; API 409) | `test_rechazo_no_da_baja_si_falla_la_cancelacion`, `test_responder_rechazar_409_si_falla_la_cancelacion` | B3: decisión de este equipo |

Estos comportamientos existen y están testeados, pero no forman parte del contrato de la spec archivada.

## 3. Reglas `RN-*` citadas (hallazgo 8)

| Dónde se cita | Cita | Resultado contra `knowledge-base/05_reglas_de_negocio.md` |
|---|---|---|
| `SKILL.md` de la skill | RN-AG-02/03/04 | Existen: solape de profesional, de sillón y borde `[inicio, fin)` |
| `proposal.md` | RN-TU-01 | Existe, pero la cita es tangencial: la regla dice que cancelar libera profesional y sillón; no dice que el hueco liberado no se rellene |
| `.active-orchestrator-state.json` | RN-01..RN-08 | Son los alias antiguos que la propia KB declara entre paréntesis (RN-05 = RN-AG-05, RN-06 = RN-TU-01, RN-08 = RN-ES-01). **RN-07 no se verificó** (nota 2026-11-02: verificada contra la KB, es `RN-TU-02 (RN-07)` en `knowledge-base/05_reglas_de_negocio.md`) |
| `spec.md` | (ninguna) | No cita reglas |

**Conclusión:** los IDs citados existen. La KB **no contiene reglas de negocio de la lista de espera**: solo US-004 y el Flujo 4 (marcados "change posterior") y la pregunta abierta Q5.

## 4. Decisiones de dominio sin regla en la KB

- Orden FIFO por `creado_en`: provisional hasta resolver Q5.
- Una entrada general (sin profesional) aparece al filtrar por cualquier profesional (B1).
- Solo se ofrece una entrada `pendiente`; ofrecer una ya ofrecida da 409 (B4).
- Si falla la cancelación al rechazar, la entrada no pasa a `baja` (B3).

Para incorporarlas al contrato corresponde un change nuevo, no editar el archivado.