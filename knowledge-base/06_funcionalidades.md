# Funcionalidades

Fuente: casos de uso textuales `docs/discovery/discovery.md` §3 + reglas §7. Formato US-NNN por épica.

## Épica 1: Agenda sin solapamientos (primer change)

### US-001 — Crear turno sin solapamiento
**Como** recepcionista
**Quiero** crear un turno que no se solape por profesional ni por sillón/box
**Para** evitar dobles reservas

**Criterios de aceptación**:
- [ ] CA-1: dados profesional+sillón+inicio+prestación válidos dentro de horario y sin bloqueo ni solape, el turno se crea en pendiente.
- [ ] CA-2: si hay solape de profesional ([inicio,fin) intersecta otro activo), rechaza con 409 y no crea nada.
- [ ] CA-3: si hay solape de sillón/box, rechaza con 409 y no crea nada.
- [ ] CA-4: borde: inicio == fin de otro turno se acepta (RN-AG-04).
- [ ] CA-5: sillón obligatorio; sin sillón rechaza.
- [ ] CA-6: fuera de horario o sobre bloqueo rechaza (RN-AG-05).

**Reglas relacionadas**: RN-AG-01, RN-AG-02, RN-AG-03, RN-AG-04, RN-AG-05

## Épica 2: Cancelación y reprogramación

### US-002 — Cancelar / reprogramar para liberar y reutilizar horario
**Como** recepcionista o paciente (vía recepción en change 1)
**Quiero** cancelar o reprogramar un turno
**Para** liberar el horario y reutilizarlo

**Criterios de aceptación**:
- [ ] CA-1: cancelar pendiente/confirmado → cancelado; libera profesional+sillón (RN-TU-01).
- [ ] CA-2: reprogramar valida nuevo horario igual que crear; si falla conserva original (RN-TU-02).
- [ ] CA-3: estados inválidos (atendido/ausente/cancelado) no se pueden cancelar ni reprogramar.

**Reglas relacionadas**: RN-TU-01, RN-TU-02, RN-ES-01

## Épica 3: Agenda del día

### US-003 — Ver agenda del día
**Como** odontólogo
**Quiero** ver mi agenda del día
**Para** saber quién viene y a qué hora

**Criterios de aceptación**:
- [ ] CA-1: lista por profesional+fecha ordenada por inicio con paciente, prestación, sillón, estado.
- [ ] CA-2: solo turnos activos + atendidos/ausentes del día (cancelados visibles como liberados o filtrados, a definir en change).

**Reglas relacionadas**: RN-ES-01, RN-ES-02

## Épica 4: Lista de espera (change posterior, no implementar)

### US-004 — Ofrecer cancelado a lista de espera
**Como** recepcionista
**Quiero** ofrecer un turno cancelado a un paciente de la lista de espera
**Para** no perder el hueco

**Criterios de aceptación** (posterior):
- [ ] Criterio de orden de lista: pregunta abierta.
- [ ] Al aceptar, crea turno validando RN-AG-*.

**Reglas relacionadas**: RN-AG-02, RN-AG-03, RN-TU-01

## Épica 5: Recordatorios + resto MVP (changes posteriores, no implementar)

- US-005 Recordatorios con confirmación en 1 toque (WhatsApp posterior).
- US-006 Reserva online 24/7 por link.
- US-007 HC mínima + odontograma, caja + MP, OS + ARCA, roles + multi-sucursal básico, exportación 1 clic (D3).
