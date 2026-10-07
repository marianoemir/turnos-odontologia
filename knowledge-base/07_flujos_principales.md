# Flujos Principales

Fuente: casos de uso + RN-01..RN-08.

## Flujo 1: Crear turno sin solapamiento (primer change)
**Disparador**: recepción carga un turno. **Actor**: Secretaría/Recepción.

**Pasos**:
1. Recepción ingresa paciente + profesional + sillón/box + prestación + inicio.
2. Sistema calcula fin = inicio + duración prestación (RN-AG-01).
3. Sistema verifica sillón presente, horario del profesional, bloqueos (RN-AG-03, RN-AG-05).
4. Sistema busca solapes [inicio,fin) en turnos activos mismo profesional y mismo sillón (RN-AG-02/03/04, RN-ES-02).
5. Si pasa: crea en pendiente. Si falla: 409 con causa (profesional|sillon|horario|bloqueo).

**Diagrama de secuencia** (ASCII):
```
Recepcion → ServicioTurnos: crear(paciente, prof, sillon, prest, inicio)
ServicioTurnos → Agenda: fin=inicio+duracion; chequea horario/bloqueo
ServicioTurnos → Agenda: busca solape profesional + solape sillon [inicio,fin)
Agenda ← responde ok/conflicto
Recepcion ← 201 creado | 409 conflicto
```

**Casos de error**:
- Falta sillón → 422 (RN-AG-03).
- Fuera de horario / sobre bloqueo → 409 (RN-AG-05).
- Solape profesional o sillón → 409, no crea nada.
- Prestación inexistente / duración inválida → 422.

## Flujo 2: Cancelar / reprogramar
**Disparador**: paciente avisa o recepción detecta hueco. **Actor**: Recepción.

**Pasos**:
1. Recepción pide cancelar (pendiente/confirmado → cancelado) o reprogramar (nuevo inicio).
2. Reprogramar: valida nuevo horario igual que Flujo 1; si falla conserva original (RN-TU-02).
3. Cancelado/ausente libera recursos (RN-TU-01).

**Casos de error**:
- Estado final (atendido/ausente/cancelado) → 409 transición inválida (RN-ES-01).
- Nuevo horario con conflicto → 409, original intacto.

## Flujo 3: Ver agenda del día
**Disparador**: odontólogo inicia el día. **Actor**: Odontólogo.

**Pasos**:
1. Odontólogo pide agenda por profesional + fecha.
2. Sistema devuelve turnos ordenados por inicio con paciente/prestación/sillón/estado.

**Casos de error**: profesional/fecha inválidos → 422/404.

## Flujo 4: Ofrecer hueco a lista de espera (posterior, no implementar)
**Disparador**: cancelación. **Actor**: Recepción + Sistema.
1. Sistema detecta hueco liberado (RN-TU-01).
2. Según criterio de orden (pregunta abierta), propone a siguiente en lista.
3. Si acepta: Flujo 1; si rechaza: siguiente.
