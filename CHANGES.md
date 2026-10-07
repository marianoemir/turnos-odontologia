# CHANGES — Secuencia de Implementación

> Índice canónico de todos los changes del proyecto **turnos-odontologia**.
> Cada change es atómico: un agente puede implementarlo en una sesión (~4-6 horas).
> **Leer este archivo antes de ejecutar cualquier `/opsx:propose`.**

> Nota TP: el recorte evaluable es C-01 → C-02 → C-03 (foundation + recursos + crear turno sin solapamientos, probado con datos ficticios, sin UI obligatoria, sin integraciones). El resto es el norte MVP (D3) en changes posteriores. Sin auth con login en ningún change: uso interno/test con RBAC mínimo; login real llegaría con C-11.

---

## Cómo usar este documento

1. Identificar el change a implementar (verificar que sus dependencias están en `openspec/changes/archive/`).
2. Leer los docs de la knowledge-base indicados en "Leer antes".
3. Ejecutar `/opsx:propose <nombre-del-change>`.
4. Al terminar el change, archivarlo con `/opsx:archive <nombre-del-change>`.
5. Marcar el checkbox `[x]` en este archivo.

---

## Árbol de dependencias

```
C-01 foundation-setup
  └── C-02 catalogo-recursos
        ├── C-03 crear-turno-sin-solapamientos
        │     ├── C-04 cancelar-reprogramar
        │     │     ├── C-06 lista-de-espera
        │     │     ├── C-07 recordatorios-confirmacion
        │     │     └── C-08 reserva-online
        │     │
        │     ├── C-05 agenda-del-dia
        │     │
        │     └── C-10 caja-pagos-os-arca
        │           └── C-11 roles-multisucursal-exportacion ──┐
        │                                                      │
        └── C-09 hc-odontograma ──────────────────────────────┘
```

### Paralelismo por fase

> Cada "gate" es un punto de sincronización. Los changes dentro de un grupo pueden ejecutarse en paralelo.

```
GATE 0: ninguna
  → C-01 foundation-setup (solo)

GATE 1: C-01 ✓
  → C-02 catalogo-recursos (solo)

GATE 2: C-02 ✓                        ← PRIMER FORK (2 paralelos)
  → C-03 crear-turno-sin-solapamientos [Agente A]
  → C-09 hc-odontograma                [Agente B]

GATE 3: C-03 ✓                        ← FORK (3 paralelos)
  → C-04 cancelar-reprogramar          [Agente A]
  → C-05 agenda-del-dia                [Agente B]
  → C-10 caja-pagos-os-arca            [Agente C]

GATE 4: C-04 ✓                        ← FORK (3 paralelos)
  → C-06 lista-de-espera               [Agente A]
  → C-07 recordatorios-confirmacion    [Agente B]
  → C-08 reserva-online                [Agente C]

GATE 5: C-09 + C-10 ✓
  → C-11 roles-multisucursal-exportacion [Agente A]
```

### Camino crítico (5 changes — mínimo irreducible)

```
C-01 → C-02 → C-03 → C-10 → C-11
```

Recorte TP (sin producción): `C-01 → C-02 → C-03`.

### Plan óptimo con 3 agentes

```
Paso │ Agente A (Backend Core)          │ Agente B (Backend Aux)       │ Agente C (Integraciones/Lecturas)
─────┼──────────────────────────────────┼──────────────────────────────┼─────────────────────────────────
  1  │ C-01 foundation-setup            │ —                            │ —
  2  │ C-02 catalogo-recursos           │ —                            │ —
  3  │ C-03 crear-turno                 │ C-09 hc-odontograma          │ —
  4  │ C-04 cancelar-reprogramar        │ C-05 agenda-del-dia          │ C-10 caja-pagos-os-arca
  5  │ C-06 lista-de-espera             │ C-07 recordatorios           │ C-08 reserva-online
  6  │ C-11 roles-exportacion           │ —                            │ —
```

---

## FASE 0 — Cimientos

### [C-01] `foundation-setup`
- **Estado**: `[x]` archivado (2026-10-07)
- **Scope**: Scaffolding mínimo + base testeable con datos ficticios (US-001..US-003 como norte, no implementadas acá)
  - Estructura `src/turnos/`, `src/agenda/`, `src/seed/`, `tests/` según `08_arquitectura_propuesta.md` §Estructura
  - Test runner + linter configurados, 1 test dummy en verde
  - `.env.example` con `TZ`, `DATABASE_URL`, `SEED_FICTICIO` (sin secretos, valores ficticios)
  - `README.md` reproducible (cómo instalar, cómo correr tests, datos ficticios)
  - CI mínima (1 job: tests) si el repo usa GitHub Actions
  - Tests: dummy verde, carga de `.env.example` sin secretos
- **Dependencias**: ninguna
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/01_vision_y_objetivos.md` §Recorte — primer change
  - `knowledge-base/02_descripcion_general.md` §Stack tecnológico
  - `knowledge-base/08_arquitectura_propuesta.md` §Estructura de directorios
  - `knowledge-base/08_arquitectura_propuesta.md` §Variables de entorno

---

### [C-02] `catalogo-recursos`
- **Estado**: `[ ]` pendiente
- **Scope**: Entidades referenciadas por Turno + seed ficticio (sin Turno todavía)
  - Modelos: `Paciente` (dni único), `Profesional`, `SillonBox` (activo), `Prestacion` (duracion_min > 0 fija), `HorarioAtencion` (desde < hasta, sin solape mismo profesional/día), `Bloqueo` (profesional/sillón nullable, desde < hasta)
  - Migración 001: tablas del catálogo + índices (`dni`, `activo`)
  - Seed ficticio: 2 profesionales, 2 sillones, 3 prestaciones (20/30/60 min), horarios Lun–Vie 9–18, 1 bloqueo, 3 pacientes ficticios
  - Tests: constraints (dni único, duración > 0, sillón activo, horario desde < hasta), seed carga 2+2+3
- **Dependencias**: C-01
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §Paciente
  - `knowledge-base/04_modelo_de_datos.md` §Prestacion
  - `knowledge-base/04_modelo_de_datos.md` §Seed data inicial
  - `knowledge-base/09_decisiones_y_supuestos.md` §DD-05

---

## FASE 1 — Núcleo agenda (TP)

> C-04 y C-05 son paralelos tras C-03. El evaluable mínimo cierra en C-03.

### [C-03] `crear-turno-sin-solapamientos`
- **Estado**: `[x]` archivado (2026-10-07)
- **Scope**: US-001 completa — núcleo del TP (RN-AG-01..05, RN-ES-02)
  - Modelo `Turno`: `paciente_id`, `profesional_id`, `sillon_id NOT NULL`, `prestacion_id`, `inicio`, `fin = inicio + duracion`, `estado` (pendiente|confirmado|cancelado|atendido|ausente), `creado_por`
  - `POST /turnos` (o `ServicioTurnos.crear(...)` si no hay HTTP): calcula fin, exige sillón, verifica horario + bloqueo, busca solapes `[inicio,fin)` en turnos activos mismo profesional y mismo sillón; 201 pendiente | 409 `profesional|sillon|horario|bloqueo` | 422 sin sillón/prestación inválida
  - Migración 002: tabla turno + índices parciales (`profesional_id,inicio,fin` y `sillon_id,inicio,fin` donde estado en pendiente/confirmado; `paciente_id,inicio`)
  - Tests: crear ok, solape profesional 409, solape sillón 409, borde inicio==fin acepta (RN-AG-04), sin sillón 422, fuera de horario 409, sobre bloqueo 409, nada creado en 409
- **Dependencias**: C-02
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §US-001
  - `knowledge-base/07_flujos_principales.md` §Flujo 1
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Agenda
  - `knowledge-base/04_modelo_de_datos.md` §Turno

---

### [C-04] `cancelar-reprogramar`
- **Estado**: `[ ]` pendiente
- **Scope**: US-002 — libera y reutiliza horario (RN-TU-01/02, RN-ES-01)
  - `POST /turnos/{id}/cancelar`: pendiente/confirmado → cancelado; 409 si atendido/ausente/cancelado
  - `POST /turnos/{id}/reprogramar`: valida nuevo inicio igual que crear; si falla conserva original intacto (RN-TU-02)
  - Cancelado/ausente excluidos de solape (verificar con test: hueco reutilizable tras cancelar)
  - Tests: cancelar libera (crear mismo slot ok), reprogramar ok, reprogramar con conflicto 409 + original intacto, transición inválida 409
- **Dependencias**: C-03
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §US-002
  - `knowledge-base/07_flujos_principales.md` §Flujo 2
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Turno — ciclo de vida
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Estados

---

### [C-05] `agenda-del-dia`
- **Estado**: `[ ]` pendiente
- **Scope**: US-003 — lectura de agenda del odontólogo (solo lectura)
  - `GET /agenda?profesional={id}&fecha={yyyy-mm-dd}`: turnos ordenados por inicio con paciente, prestación, sillón, estado
  - 404 profesional inexistente, 422 fecha inválida
  - Tests: orden por inicio, campos completos, día vacío → lista vacía, 404/422
- **Dependencias**: C-03
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §US-003
  - `knowledge-base/07_flujos_principales.md` §Flujo 3
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/04_modelo_de_datos.md` §Turno

---

## FASE 2 — Paciente y recordatorios (posterior al TP)

> C-06, C-07 y C-08 son paralelos tras C-04. Ninguno entra en el recorte TP.

### [C-06] `lista-de-espera`
- **Estado**: `[ ]` pendiente
- **Scope**: US-004 — rellena cancelaciones (criterio de orden pendiente de Q5, proponer FIFO por defecto)
  - Modelo `ListaEspera`: `paciente_id`, `profesional_id` (nullable), `prestacion_id`, `creado_en`, `estado` (pendiente|ofrecido|asignado|baja)
  - `POST /lista-espera`, `GET /lista-espera?profesional=`, `POST /lista-espera/{id}/ofrecer` (crea turno vía C-03; si acepta → asignado, si rechaza → siguiente)
  - Tests: alta en lista, ofrecer hueco crea turno válido, rechazo pasa al siguiente, orden FIFO
- **Dependencias**: C-04
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §US-004
  - `knowledge-base/07_flujos_principales.md` §Flujo 4
  - `knowledge-base/10_preguntas_abiertas.md` §Q5
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Turno — ciclo de vida

---

### [C-07] `recordatorios-confirmacion`
- **Estado**: `[ ]` pendiente
- **Scope**: US-005 — recordatorios con confirmación en 1 toque (WhatsApp entra acá, primera integración externa)
  - Modelo `Recordatorio`: `turno_id`, `canal` (whatsapp|email), `estado` (pendiente|enviado|confirmado|cancelado), `token_1toque`
  - Job 48/24h: envía recordatorio; link `POST /confirmar/{token}` → confirmado, `POST /cancelar/{token}` → cancelado (libera vía C-04)
  - `WHATSAPP_TOKEN` solo vía env, cupo incluido; sin token → fallback email/log (tests sin red)
  - Tests: envío programa, confirmación 1 toque, cancelación libera hueco, sin token no rompe
- **Dependencias**: C-04
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/01_vision_y_objetivos.md` §Alcance v1
  - `knowledge-base/02_descripcion_general.md` §Integraciones externas
  - `knowledge-base/07_flujos_principales.md` §Flujo 2
  - `knowledge-base/08_arquitectura_propuesta.md` §Variables de entorno

---

### [C-08] `reserva-online`
- **Estado**: `[ ]` pendiente
- **Scope**: US-006 — reserva 24/7 por link + confirmación/cancelación en 1 toque (primeras rutas públicas)
  - `GET /reservar/{profesional}?prestacion=&fecha=` (slots reales: horario − bloqueos − turnos activos)
  - `POST /reservar`: crea pendiente vía validación C-03 (rate limit por IP); links de confirmación/cancelación que reutilizan C-07
  - Tests: slots excluyen ocupados/bloqueos, crear ok, solape 409, rate limit, links públicos sin login
- **Dependencias**: C-04
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/03_actores_y_roles.md` §Rutas públicas
  - `knowledge-base/06_funcionalidades.md` §Épica 5
  - `knowledge-base/07_flujos_principales.md` §Flujo 1
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Agenda

---

## FASE 3 — Clínico, cobros y cierre (posterior al TP)

> C-09 es paralelo a todo FASE 1 (solo necesita C-02). C-10 corre paralelo a C-04/C-05. C-11 cierra.

### [C-09] `hc-odontograma`
- **Estado**: `[ ]` pendiente
- **Scope**: HC mínima + odontograma FDI + planes/presupuestos atados a piezas (sin PACS/CDSS: etapas posteriores)
  - Modelos: `HistoriaClinica` (paciente_id único), `Odontograma` (pieza FDI, estado de 18 estados DentalSoft como referencia, profesional+fecha), `PlanTratamiento` (pieza, prestación, estado, presupuesto)
  - Endpoints CRUD HC + odontograma por paciente + plan con cobertura OS aplicada (lectura, sin liquidar)
  - Migración 003: tablas clínicas
  - Tests: CRUD, historial por pieza con profesional+fecha, presupuesto suma piezas
- **Dependencias**: C-02
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/01_vision_y_objetivos.md` §Alcance v1
  - `knowledge-base/04_modelo_de_datos.md` §Dominios
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/10_preguntas_abiertas.md` §Q7

---

### [C-10] `caja-pagos-os-arca`
- **Estado**: `[ ]` pendiente
- **Scope**: Caja diaria + Mercado Pago + OS + factura ARCA (pagos: governance máxima)
  - Modelos: `Caja` (apertura/cierre diario, arqueo), `Cobro` (turno_id, medio, monto centavos, estado), `LiquidacionOS` (nomenclador, cobertura/copago, PDF)
  - `POST /caja/abrir|cerrar`, `POST /cobros` (efectivo/tarjeta/transf/MP/OS), `POST /cobros/{id}/factura-arca` (B/C CAE+QR), `GET /liquidaciones-os`
  - `MP_ACCESS_TOKEN`, `ARCA_CERT` solo env; sin credenciales → modo simulado marcado explícito (tests sin red)
  - Migración 004: tablas caja/cobros/liquidaciones
  - Tests: apertura/cierre/arqueo, cobro por medio, seña vinculada a reserva, factura simulada, liquidación PDF, anulación trazable
- **Dependencias**: C-03
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/01_vision_y_objetivos.md` §Alcance v1
  - `knowledge-base/02_descripcion_general.md` §Integraciones externas
  - `knowledge-base/07_flujos_principales.md` §Flujo 1
  - `knowledge-base/05_reglas_de_negocio.md` §Dominio: Excepciones globales

---

### [C-11] `roles-multisucursal-exportacion`
- **Estado**: `[ ]` pendiente
- **Scope**: Cierre producción — roles, multi-sucursal básico, exportación total, migración asistida
  - Modelos: `Rol`, `Sucursal`, `UsuarioSucursal`; `PermissionContext`: `require_role()`, `require_admin()` (primer login real acá si se exige)
  - `GET /export` — pacientes + HC + agenda + caja en 1 clic (contrato de salida 30 días documentado en README)
  - Migración asistida desde planilla (script `import_planilla.*` + guía en español)
  - Migración 005: roles/sucursales
  - Tests: aislamiento por sucursal, permisos por rol, exportación incluye los 4 dominios, import planilla idempotente
- **Dependencias**: C-09, C-10
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/03_actores_y_roles.md` (completo)
  - `knowledge-base/01_vision_y_objetivos.md` §Alcance v1
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad
  - `knowledge-base/04_modelo_de_datos.md` §Dominios
