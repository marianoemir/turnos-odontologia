# Decisiones y Supuestos

Fuente: `docs/discovery/discovery.md` + informe verificado 2026-10-06.

## Decisiones documentadas

### DD-01 — Primer change = crear turno sin solapamientos
**Decisión**: implementar solo agenda sin solapamientos por profesional y sillón/box como único change especificado, probado y archivado.
**Contexto**: MVP D3 es grande para un TP; el recorte lo hace viable.
**Alternativas consideradas**: MVP completo v1; solo recordatorios; solo lista de espera.
**Justificación**: ataca dobles reservas, el dolor central junto a huecos vacíos.
**Trade-offs aceptados**: reserva online, WhatsApp, HC/caja/OS/ARCA quedan posteriores.

### DD-02 — Reserva online fuera del primer change
**Decisión**: solo carga por recepción en change 1 (a confirmar).
**Contexto**: Discovery §11 Q1.
**Alternativas**: incluir reserva paciente desde el día 1.
**Justificación**: reduce superficie del change a validación RN-01..RN-08.
**Trade-offs**: UX paciente completa queda posterior.

### DD-03 — Sin integraciones en primer change
**Decisión**: ninguna integración (WhatsApp posterior).
**Contexto**: Discovery §8.
**Justificación**: recordatorios/MP/ARCA/OS son v1 posterior, no parte del núcleo de solapes.

### DD-04 — Sillón/box obligatorio + intervalo [inicio,fin)
**Decisión**: todo turno exige sillón; borde inicio==fin no es solape.
**Contexto**: RN-03, RN-04.
**Justificación**: modela recurso físico real y evita falsos conflictos encadenados.

### DD-05 — Sin stack/hosting impuesto
**Decisión**: no fijar stack en Discovery; lo define el change/KB.
**Contexto**: restricción TP + sin UI obligatoria.
**Trade-offs**: flexibilidad vs. necesidad de fijarlo antes de codificar (ver pregunta abierta 6).

## Supuestos inferidos

### SU-01 — Competencia real = WhatsApp + papel/planilla
**Supuesto**: desplazar planilla informal, no solo a dentales puros.
**Origen**: Discovery §4 + informe C3.
**Riesgo si es falso**: sobre-ingeniería vs. SaaS dentales.
**Cómo validar**: entrevistas a 2-3 consultorios (fuera del TP: no contactar proveedores).

### SU-02 — Afirmaciones comerciales no verificadas no condicionan diseño
**Supuesto**: "−82% ausencias", "−64% débitos", "98% entrega", validación OS real-time se tratan como no evidenciadas.
**Origen**: informe nota metodológica + verificación 2026-10-06.
**Riesgo**: diseñar contra benchmark falso.
**Cómo validar**: demos D1 del informe (posterior al TP).

### SU-03 — api/backend sin UI alcanza para el change 1
**Supuesto**: lógica + tests demuestran el valor sin frontend.
**Origen**: restricción "sin UI obligatoria".
**Riesgo**: evaluador espera demo visual.
**Cómo validar**: README reproducible + salida CLI/tests legible (pregunta abierta 6).
