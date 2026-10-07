# Reglas de Negocio

Fuente textual: `docs/discovery/discovery.md` §7. Códigos `RN-AG-*` (agenda), `RN-TU-*` (turno), `RN-ES-*` (estados). Entre paréntesis el ID original RN-01..RN-08.

## Dominio: Agenda — duración y recursos (RN-AG)

- **RN-AG-01** (RN-01): cada prestación tiene duración fija en minutos (v1); el turno ocupa [inicio, inicio + duración).
- **RN-AG-02** (RN-02): un profesional no puede tener dos turnos activos con intervalos superpuestos.
- **RN-AG-03** (RN-03): un sillón/box no puede tener dos turnos activos con intervalos superpuestos. El sillón es obligatorio en todo turno.
- **RN-AG-04** (RN-04 borde): un turno que empieza justo cuando termina otro NO es solapamiento — intervalos [inicio, fin).
- **RN-AG-05** (RN-05): un turno solo se crea dentro del horario de atención del profesional y no sobre un bloqueo aplicable.

## Dominio: Turno — ciclo de vida (RN-TU)

- **RN-TU-01** (RN-06): un turno cancelado o ausente no cuenta para solapamientos y libera profesional y sillón/box.
- **RN-TU-02** (RN-07): reprogramar valida el nuevo horario con las mismas reglas que crear; si falla, se conserva el turno original intacto.

## Dominio: Estados (RN-ES)

- **RN-ES-01** (RN-08): estados permitidos: pendiente → confirmado → atendido/ausente; pendiente o confirmado → cancelado. Sin otras transiciones.
- **RN-ES-02** (derivado RN-06+RN-08): solo pendiente y confirmado cuentan como "activos" para solapamiento.

## Dominio: Excepciones globales

- Anticipación mínima para cancelar/reprogramar: NO es regla todavía — va a preguntas abiertas.
- Sobreturnos, doble turno del mismo paciente con profesionales distintos, límite de sobreturnos/día: fuera del primer change — ver `10_preguntas_abiertas.md`.
- Datos ficticios obligatorios; sin secretos en repo; un solo change probado y archivado.
