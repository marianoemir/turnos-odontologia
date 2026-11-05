# Preguntas Abiertas

Fuente: `docs/discovery/discovery.md` §11 textuales + inconsistencias detectadas en ingest.

## Inconsistencias detectadas

### IN-01 — Alcance reserva paciente: caso de uso 2 vs. recorte change 1
**Documento A dice** (casos de uso): "Como recepcionista o paciente, quiero cancelar o reprogramar".
**Documento B dice** (recorte): "reserva online del paciente NO entra en el primer change; solo carga por recepción".
**Impacto**: define si Paciente escribe vía API en change 1 o solo vía recepción.
**Resolución propuesta**: change 1 = solo recepción escribe; paciente vía recepción. Confirmar Q1.

### IN-02 — MVP D3 vs. "un solo change"
**Documento A dice** (D3): MVP v1 incluye HC, caja, MP, ARCA, OS, multi-sucursal.
**Documento B dice** (restricciones): un solo change especificado, probado y archivado.
**Impacto**: riesgo de intentar MVP completo en un TP.
**Resolución propuesta**: este KB documenta MVP completo como norte, pero el change implementa solo US-001..US-003.

## Preguntas abiertas (priorizadas)

| Prioridad | Pregunta | Bloquea | Decisor |
|-----------|----------|---------|---------|
| Alta | Q1. Reserva online del paciente NO entra en primer change; solo carga por recepción. Confirmar | Change 1 (RBAC + API) | PO / cátedra |
| Alta | Q6. ~~Stack tecnológico del change~~ → RESUELTA por indicación del profesor (2026-10-07): Python + FastAPI + JWT + SQLAlchemy + PostgreSQL (+ Redis con async) + Docker Compose; frontend React + TS + Vite (posterior). Reemplaza la resolución anterior (Node/Express/Jest, registrada por error). Ver `02_descripcion_general.md` | — | Profesor |
| Media | Q2. ¿Anticipación mínima para cancelar/reprogramar? (sin dato en informe) | US-002 | PO |
| Media | Q3. ¿Un mismo paciente puede tener dos turnos superpuestos con profesionales distintos? | RN-AG (alcance por paciente) | PO |
| Media | Q5. ¿Criterio de orden de la lista de espera? (FIFO, prioridad, seña) | US-004 posterior | PO |
| Baja | Q4. ¿Límite de sobreturnos por profesional y día? (change posterior) | Sobreturnos posterior | PO |
| Baja | Q7. "No evidenciado" del informe: solapamientos en competidores, costo WhatsApp DentalSoft, validación OS DentalTec real-time, alcance leyes 26.529/25.326/27.706, exportación | Demos D1 posteriores | Equipo (sin contactar proveedores en TP) |

## Discovery low-confidence (Mode A — no inventar)

- [DISCOVERY] `system_type` could not be inferred with confidence from the source docs. Sin UI obligatoria + lógica testeable apuntan a `api`, pero no hay decisión explícita. Please confirm: ¿el change 1 se entrega como API, CLI o librería testeada?
- [DISCOVERY] `stack` — RESUELTO por el profesor (2026-10-07): Python + FastAPI + SQLAlchemy + PostgreSQL + Docker Compose (ver `02_descripcion_general.md`). `system_type` sigue abierto solo en cuanto a entrega del primer change (API backend, sin UI).

## Suposiciones y preguntas abiertas de Caja, Cobros, ARCA y Obras Sociales (C-10)

Las siguientes decisiones fueron tomadas como defaults asumidos para el change C-10 ante la ausencia de definiciones funcionales en el dominio. Estado: **sin respuesta de negocio al 05/11/2026**.

| ID (C-10) | Pregunta / Suposición | Default asumido en C-10 | Decisor / Afecta | Estado |
|---|---|---|---|---|
| `Q-C10-10` | (1) ¿El arqueo de caja contempla todos los medios de pago o únicamente efectivo? | El arqueo cuenta solo efectivo en el cajón (`monto_esperado = apertura + sum(cobros efectivo no anulados)`). Los cobros con otros medios (tarjeta, transferencia, MP, OS) se informan como `totales_por_medio_centavos` (D2). | Producto / recepción | sin respuesta de negocio al 05/11/2026 |
| `Q-C10-14` | (2) En cobro con obra social, ¿cómo se registra y cobra el copago del paciente? | El copago no se modela como cobro ni entra al arqueo; queda solo como dato informativo en la liquidación (`copago = total - cobertura`). `totales_por_medio_centavos["obra_social"]` acumula el total de la prestación (D2, D28). | Producto / administración | sin respuesta de negocio al 05/11/2026 |
| `Q-C10-01` | (3) ¿La caja es por profesional, por sucursal o global diaria? | Una caja por día para toda la clínica (`fecha` UNIQUE global). Multi-caja o sucursal diferido a C-11 (D1, Q-C10-05). | Producto / administración | sin respuesta de negocio al 05/11/2026 |
| — | (4) ¿Cómo se determinan los precios de las prestaciones al cobrar? | No hay tarifario ni lista de precios en backend; los montos los fija y envía recepción al registrar el cobro (`CobroCreate.monto_centavos`). | Producto / administración | sin respuesta de negocio al 05/11/2026 |
| `Q-C10-09` | (5) ¿Qué tipo de factura legal emite ARCA y quién valida la condición fiscal del paciente? | Factura B o C a elección del cliente/recepción en cada cobro (`FacturaArcaCreate.tipo`). El sistema no valida condición fiscal ante AFIP/ARCA. | Producto / contador | sin respuesta de negocio al 05/11/2026 |
| `Q-C10-02` | (6) ¿Quién tiene autorización para abrir/cerrar caja y registrar cobros? | Sin control de acceso ni roles en C-10 (cualquier cliente puede operar los endpoints de caja); la autenticación y permisos se delegan a C-11. | C-11 (roles) / seguridad | sin respuesta de negocio al 05/11/2026 |
| — | (7) ¿Se puede emitir factura ARCA sobre un cobro cuando la caja diaria ya fue cerrada? | Sí, se permite facturar un cobro existente con la caja cerrada porque la facturación no altera montos, estados ni el arqueo cerrado de la caja. | Producto / administración | sin respuesta de negocio al 05/11/2026 |
| `Q-C10-12` | (8) ¿Se puede anular un cobro si la caja en la que se cobró ya está cerrada? | No, la anulación sobre caja cerrada se rechaza con 409 `caja_cerrada` (D23); no se permite reapertura de caja ni recálculo de arqueo ya consolidado. | Producto / administración | sin respuesta de negocio al 05/11/2026 |
