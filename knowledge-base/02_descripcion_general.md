# Descripción General

Fuente: `docs/discovery/discovery.md` §8-9 + informe §A-D. Stack impuesto por el profesor (2026-10-08) — reemplaza cualquier mención anterior a Node.js/TypeScript/Express/Jest. NO se cambia sin consultarlo.

## Stack tecnológico

| Capa | Tecnologías | Versión mínima |
|------|-------------|----------------|
| Backend | Python + FastAPI + SQLAlchemy (ORM) + Alembic (migraciones) | Python 3.12+, FastAPI 0.115+, SQLAlchemy 2.0+ |
| Auth | JWT (llega con el change de roles; antes, sin login) | — |
| Persistencia | PostgreSQL (desarrollo y tests vía Docker Compose) | Postgres 16+ |
| Async / jobs | Redis — solo cuando haya funcionalidad asincrónica (change posterior) | Redis 7+ |
| Frontend | React + TypeScript + Vite (change posterior; el primer change es solo backend) | — |
| Tests backend | pytest (skill `tdd`) | pytest 8+ |
| Infra local | Docker + Docker Compose (`docker-compose.yml` en raíz) | Docker 24+ |

## Arquitectura general

Monolito modular backend-first. El primer change (crear turno) es solo backend; el frontend React llega en un change posterior:

```
backend/ (FastAPI)              frontend/ (React+Vite, posterior)
├── app/
│   ├── turnos/        # ServicioTurnos.valida(RN-01..RN-08)
│   ├── agenda/        # profesional + sillón/box + bloqueos
│   └── seed/          # datos ficticios
├── tests/             # pytest
└── alembic/           # migraciones (desde C-02)

docker-compose.yml en raíz: api + postgres (+ redis solo cuando haya async)
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
