# Descripción General

Fuente: `docs/discovery/discovery.md` §8-9 + informe §A-D. Stack no impuesto — ver supuesto en `09_decisiones_y_supuestos.md`.

## Stack tecnológico

> Decidido en Q6 (2026-10-07, change C-01): Node.js + TypeScript + Express + Jest.

| Capa | Tecnologías | Versión mínima |
|------|-------------|----------------|
| Lógica de dominio | Node.js LTS + TypeScript estricto + Express 4 | Node 24, TS 5.6+, Express 4.21+ |
| Persistencia (primer changes) | En memoria / SQLite para tests con datos ficticios; Postgres u otro solo si el change lo justifica | — |
| API/presentación | Sin UI gráfica obligatoria. CLI o API REST mínima (Express) si el change la necesita | — |
| Tests | Jest + ts-jest, módulos CommonJS (skill `tdd`) | Jest 29+ |
| Infra | Sin hosting obligatorio. Sin secretos en repo. README reproducible. CI: 1 job tests | — |

## Arquitectura general

Monolito modular mínimo centrado en el dominio Agenda/Turnos, sin frontend obligatorio:

```
Recepción (actor/test) → ServicioTurnos.valida(RN-01..RN-08) → Agenda (profesional + sillón/box + bloqueos)
                                                      ↘ Turno [pendiente|confirmado|cancelado|...]
```

Justificación: el primer change es crear un turno sin solapamientos, probado y archivado. No requiere UI, ni integraciones, ni multi-sucursal. El MVP completo (D3) evolucionaría a SaaS nube multi-profesional/multi-sucursal, pero eso es posterior.

## Integraciones externas

| Servicio | Propósito | Tipo | Alcance |
|----------|-----------|------|---------|
| Ninguna | — | — | Primer change: ninguna |
| WhatsApp API (Meta) | Recordatorios + confirmación 1 toque + chatbot que agenda | API oficial / webhook | Change posterior (v1). Hoy: costo aparte en la mayoría del mercado; montos por mensaje: no evidenciado unificado |
| Mercado Pago | Seña vinculada a reserva, cobro QR/link (AR/MX/CL/CO/PE/UY según DentalCore) | SDK/API | Change posterior |
| ARCA | Factura B/C con CAE+QR desde el cobro | Webservice | Change posterior |
| Obras sociales (OSDE/Swiss/PAMI, nomenclador) | Cobertura/copago, liquidación PDF, validación en tiempo real (afirmación DentalTec no verificada) | Varias | Change posterior |
| Google Calendar | Sincronización por profesional (probado en DentalSoft) | API | Posterior / opcional |
| HL7 FHIR | Portabilidad/exportación e interconsultas | Estándar | Posterior |

## API REST (si aplica — propuesta para el change, no implementada aún)

Agrupada por recurso Turnos/Agenda (nombres orientativos):

- `POST /turnos` — crear (valida RN-01..RN-08). 409 si solapa profesional o sillón.
- `POST /turnos/{id}/cancelar` — libera profesional + sillón (RN-06).
- `POST /turnos/{id}/reprogramar` — valida nuevo horario igual que crear; si falla conserva original (RN-07).
- `GET /agenda?profesional={id}&fecha={yyyy-mm-dd}` — agenda del día del odontólogo.
- Futuro (no primer change): `POST /lista-espera`, `POST /recordatorios`, `POST /pagos/sena`, `GET /export`.
