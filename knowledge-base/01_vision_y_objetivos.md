# Visión y Objetivos

Fuente: `docs/discovery/discovery.md` §1-6 + `docs/discovery/informe-discovery.md` Resumen/D3 + `state.discovery.problema`.

## Propósito del sistema

Sistema de gestión de turnos y agenda para consultorios odontológicos en Argentina que elimina dobles reservas y huecos sin rellenar mediante una agenda por profesional y por sillón/box con prevención de solapamientos.

Contexto: el consultorio ya capta turnos por WhatsApp/teléfono. El dolor no es captar reservas sino el ausentismo, los huecos vacíos y las dobles reservas. La competencia real a desplazar es WhatsApp + agenda en papel/planilla.

## Objetivos por actor

| Actor | Objetivo principal | Objetivos secundarios |
|-------|--------------------|-----------------------|
| Secretaría/Recepción | Cargar turnos sin solapamientos y reutilizar huecos liberados | Confirmar, cancelar, reprogramar; ofrecer cancelados a lista de espera (change posterior) |
| Odontólogo | Ver su agenda del día con quién viene y a qué hora | Evitar choques por sillón/box compartido |
| Paciente | Reservar/cancelar/reprogramar con confirmación simple | Confirmación en 1 toque, recordatorios (changes posteriores; reserva online NO entra en primer change) |

## Alcance v1 (MVP según D3 del informe)

- Agenda multi-profesional + multi-sillón/box con duraciones variables, bloqueos, sobreturnos y prevención de solapamientos.
- Reserva online 24/7 por link + confirmación/cancelación en 1 toque que libera el hueco.
- Recordatorios automáticos + estados (pendiente/confirmado/no-show/cancelado).
- HC mínima + odontograma FDI + planes/presupuestos atados a piezas.
- Caja diaria + Mercado Pago (QR/link) + deudores + reportes básicos.
- OS argentinas: nomenclador, cobertura/copago, liquidación con PDF.
- Factura ARCA B/C con CAE+QR desde el cobro.
- Roles/permisos + multi-sucursal básico + exportación total en 1 clic.
- Soporte y migración asistida en español.

Diferenciadores v1: seña vinculada a reserva, lista de espera automática, reagendamiento automático, chatbot WhatsApp, precio público con calculadora.

### Recorte — primer change (lo único especificado, probado y archivado en este TP)

- Crear un turno sin solapamientos por profesional ni por sillón/box (caso de uso 1).
- Incluye: validación RN-01 a RN-08, cancelar/reprogramar como soporte para liberar horario (casos 2-3 en alcance mínimo), datos ficticios, sin UI obligatoria.
- Reserva online del paciente NO entra en primer change; solo carga por recepción (a confirmar, ver `10_preguntas_abiertas.md`).
- Sin integraciones en primer change (WhatsApp en change posterior).

## Fuera de alcance

- Primer change: reserva online por el paciente, recordatorios WhatsApp, lista de espera automática, sobreturnos (change posterior), HC/odontograma, caja/MP/ARCA/OS, multi-sucursal.
- v1: CDSS/IA diagnóstica, voz clínica, implantes 3D, PACS/imagen avanzado, laboratorio, inventario multi-almacén, campañas/marketing, NPS, membership/financiamiento en cuotas, API pública/marketplace, multi-país fiscal, telemedicina (etapas posteriores según D3).

## Métricas de éxito

- 0 dobles reservas por profesional y por sillón/box en el alcance del primer change (tests de solapamiento + borde RN-04).
- Huecos cancelados liberados y reutilizables (RN-06) — medido en changes posteriores por tasa de relleno de lista de espera.
- A nivel MVP (posterior): reducción de ausentismo vía recordatorio 1 toque + seña; afirmaciones tipo "−82% ausencias" de proveedores se tratan como no verificadas.
