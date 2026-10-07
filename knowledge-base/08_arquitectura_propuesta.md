# Arquitectura Propuesta

Fuente: restricciones `docs/discovery/discovery.md` §9 (sin stack/hosting/UI obligatoria) + RN-01..RN-08.

## Patrones aplicados

| Patrón | Dónde se usa | Por qué |
|--------|--------------|---------|
| Servicio de dominio (Turnos) | Validación RN-AG/RN-TU/RN-ES en un solo punto | Evita solapes por caminos alternos; testeable sin UI |
| Intervalo semiabierto [inicio,fin) | Chequeo de solapes | Implementa borde RN-AG-04 sin casos especiales |
| Máquina de estados explícita | pendiente→confirmado→atendido/ausente; →cancelado | Aplica RN-ES-01; cancelado/ausente excluidos de solape |
| Soft-cancel (sin hard delete) | Cancelar = cambio de estado | Preserva auditoría y permite relleno de huecos |
| Seed ficticio + tests | Primer change | Cumple "solo datos ficticios, un change probado" |

## Estructura de directorios

Propuesta stack-agnóstica mínima (adaptar al stack que defina el change):

```
turnos-odontologia/
├── docs/discovery/          # fuentes (no tocar)
├── knowledge-base/          # esta KB
├── src/
│   ├── turnos/              # dominio: crear/cancelar/reprogramar, solapes, estados
│   │   ├── servicio_turnos.* 
│   │   ├── intervalos.*     # [inicio,fin), solape
│   │   └── estados.*        # máquina RN-ES-01
│   ├── agenda/              # horarios, bloqueos, sillones, prestaciones
│   └── seed/                # datos ficticios
├── tests/
│   ├── solapamientos.*      # RN-AG-02/03 + borde RN-AG-04
│   ├── horarios_bloqueos.*  # RN-AG-05
│   ├── cancel_reprogram.*   # RN-TU-01/02
│   └── estados.*            # RN-ES-01
└── README.md                # reproducible, sin secretos
```

MVP posterior evolucionaría a `backend/app/{domain,application,infrastructure}` + `frontend/{features,shared,pages}` si se elige web app.

## Seguridad

- Autenticación: no requerida en primer change (uso local/test). Posterior: sesiones con expiración + 2FA para acciones sensibles (referencia DentalCore).
- Autorización: RBAC mínimo según `03_actores_y_roles.md` (recepción escribe, odontólogo lee propia).
- Validación de input: sillón obligatorio, duración > 0, inicio/fin tz-aware, IDs existentes; 409 conflicto vs 422 inválido.
- Secrets management: sin secretos en repo (restricción TP). Tokens MP/WhatsApp/ARCA solo vía env en changes posteriores, nunca commiteados.
- Auditoría mínima: creado_por + transición de estados con timestamp (base para trazabilidad posterior).

## Variables de entorno

| Variable | Descripción | Ejemplo | Sensible |
|----------|-------------|---------|----------|
| `TZ` | Zona horaria de agenda (América/Argentina/...) | `America/Argentina/Buenos_Aires` | N |
| `DATABASE_URL` | Solo si el change usa DB real; por defecto memoria/SQLite test | `sqlite:///./test.db` | Y (si tiene credenciales) |
| `SEED_FICTICIO` | Activa seed de datos ficticios | `true` | N |
| `WHATSAPP_TOKEN` | Posterior — no usar en change 1 | — | Y |
| `MP_ACCESS_TOKEN` | Posterior — no usar en change 1 | — | Y |
| `ARCA_CERT` | Posterior — no usar en change 1 | — | Y |
