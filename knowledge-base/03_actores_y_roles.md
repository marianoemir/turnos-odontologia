# Actores y Roles

Fuente: `docs/discovery/discovery.md` §2 + `state.discovery.usuarios`.

## Actores del sistema

| Actor | Descripción | Cómo interactúa |
|-------|-------------|-----------------|
| Secretaría/Recepción | Rol separado de carga y gestión. Carga turnos, confirma, cancela, reprograma, reasigna huecos | Carga por recepción en primer change (reserva online del paciente NO entra — a confirmar). Único creador de turnos en el recorte |
| Odontólogo | Profesional que atiende | Ve su agenda del día (solo lectura en primer change) |
| Paciente | Persona que recibe la prestación | En primer change: titular del turno cargado por recepción; cancela/reprograma vía recepción. Reserva online directa = change posterior |
| Sistema (futuro) | Recordatorios, lista de espera automática, chatbot WhatsApp | Changes posteriores; no actor en primer change |

Sin admin multi-consultorio por ahora (explícito en Discovery).

## RBAC — Matriz de permisos

| Rol → Recurso | Turno crear | Turno cancelar/reprogramar | Agenda día leer | Lista espera | Recordatorios | Config (horarios/bloqueos/sillones) | HC/Caja/OS/ARCA |
|---------------|-------------|----------------------------|-----------------|--------------|---------------|--------------------------------------|-----------------|
| Recepción | C (solo por recepción en change 1) | U (cancela/reprograma) | R (todas) | Posterior | Posterior | R (lee horarios/bloqueos para validar) | Posterior |
| Odontólogo | — | — (vía recepción) | R (propia) | Posterior | — | R (propio horario) | Posterior |
| Paciente | — (change 1); posterior: crear/cancelar propios | Vía recepción en change 1 | — (solo sus turnos, posterior) | Posterior | Confirma 1 toque (posterior) | — | — |

R = read, C = create, U = update/cancelar. Sin deletes físicos: cancelación es cambio de estado (RN-08).

## Rutas públicas

Primer change: ninguna (uso interno/test con datos ficticios, sin UI obligatoria).

Posterior (v1, no implementar ahora):
- Link de reserva 24/7 (profesional/prestación/fecha/hora).
- Link de confirmación/cancelación en 1 toque (libera hueco).
- Recibos/factura por WhatsApp/email.
