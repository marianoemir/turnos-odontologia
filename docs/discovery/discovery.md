# Discovery — turnos-odontologia

**Fecha**: 2026-10-06
**Fuentes investigadas**: sin scraping de competidores (el usuario siguió sin fuentes directas). Insumo de mercado: `docs/discovery/informe-discovery.md` (relevamiento propio de 18 sistemas odontológicos, Argentina/Latam/internacional, con tablas comparativas, matriz ponderada y MVP sugerido).

## 1. Problema que resuelve

Ausentismo y huecos sin rellenar, más la falta de una agenda por profesional y por sillón/box que impida solapamientos. El consultorio ya recibe turnos por WhatsApp o teléfono, así que el dolor no es captar reservas sino los huecos vacíos y las dobles reservas. El change candidato de la etapa de implementación es justamente crear un turno sin solapamientos.

## 2. Usuarios / roles

Tres roles confirmados, sin admin multi-consultorio por ahora:

- **Paciente**: reserva, cancela o reprograma sus turnos (la reserva online por el paciente NO entra en el primer change).
- **Odontólogo**: ve su agenda del día.
- **Secretaría/Recepción**: rol separado que carga turnos, confirma, cancela, reprograma y reasigna huecos.

## 3. Casos de uso

Son estos 4, textuales (el cuarto ataca de frente el ausentismo):

1. Como recepcionista, quiero crear un turno que no se solape por profesional ni por sillón/box, para evitar dobles reservas.
2. Como recepcionista o paciente, quiero cancelar o reprogramar un turno, para liberar el horario y reutilizarlo.
3. Como odontólogo, quiero ver mi agenda del día, para saber quién viene y a qué hora.
4. Como recepcionista, quiero ofrecer un turno cancelado a un paciente de la lista de espera, para no perder el hueco.

## 4. Competidores / soluciones existentes

Mapa del informe confirmado, con el agregado de AgendaPro (top 5 de demos prioritarias, sección D1 del informe). Los más relevantes para Argentina: DentalCore (circuito ARCA + Mercado Pago + obras sociales), DentalSoft, DentalTec y Dentalink. Hallazgos del informe que condicionan el producto: casi todos cobran WhatsApp aparte y ninguno resuelve bien la lista de espera ni la recuperación de ausentes. La validación de prácticas contra obras sociales de DentalTec es una afirmación del proveedor, no verificada. La competencia real a desplazar es WhatsApp más agenda en papel o planilla.

## 5. Funcionalidades necesarias

Para la v1, en orden de prioridad:

- e) Agenda sin solapamientos por profesional y sillón/box (primer change).
- a) Recordatorios con confirmación en 1 toque (change posterior; WhatsApp entra después).
- b) Lista de espera que rellena cancelaciones (change posterior).

## 6. Funcionalidades opcionales

Solo lo que el informe (D3) deja para etapas posteriores: CDSS/IA diagnóstica, voz clínica, implantes 3D, PACS/imagen, laboratorio e inventario, campañas y NPS, financiamiento en cuotas, API pública, multi-país fiscal y telemedicina. Historia clínica, odontograma, caja, Mercado Pago, factura ARCA, obras sociales y multi-sucursal básico NO son opcionales: siguen en el MVP según D3, pero como changes posteriores, fuera del primer change.

## 7. Reglas de negocio

Textuales, con sus identificadores (los sobreturnos quedan fuera del primer change, como change posterior):

- RN-01: cada prestación tiene duración fija en minutos (v1); el turno ocupa desde su inicio hasta inicio + duración.
- RN-02: un profesional no puede tener dos turnos activos con intervalos superpuestos.
- RN-03: un sillón/box no puede tener dos turnos activos con intervalos superpuestos. El sillón es obligatorio en todo turno.
- RN-04 (borde): un turno que empieza justo cuando termina otro NO es solapamiento (intervalos [inicio, fin)).
- RN-05: un turno solo se crea dentro del horario de atención del profesional y no sobre un bloqueo.
- RN-06: un turno cancelado o ausente no cuenta para solapamientos y libera profesional y sillón/box.
- RN-07: reprogramar valida el nuevo horario con las mismas reglas; si falla, se conserva el turno original.
- RN-08: estados: pendiente -> confirmado -> atendido/ausente; pendiente o confirmado -> cancelado.

La anticipación mínima para cancelar NO es regla todavía: va a preguntas abiertas.

## 8. Integraciones

Ninguna para el primer change. WhatsApp es necesario para la v1 (recordatorios), pero entra en un change posterior.

## 9. Restricciones

No hay stack ni hosting obligatorio (se define según la knowledge-base). Plazo: el de entrega del TP. Además: un solo change especificado, probado y archivado; sin interfaz gráfica obligatoria; solo datos ficticios; no se contacta a proveedores; README reproducible; sin secretos en el repositorio.

> **Actualización 2026-10-07:** el profesor definió el stack (backend: Python, FastAPI, JWT, SQLAlchemy, PostgreSQL, Redis para lo asincrónico, Docker/Docker Compose; frontend: React, TypeScript, Vite). El hosting sigue sin ser obligatorio.

## 10. Riesgos

- Las reglas de solapamiento reales pueden ser más complejas (prestaciones de duración variable, sillones compartidos).
- Datos del Discovery todavía sin verificar del todo (DentalCore, AgendaPro, Doctoralia) y varios "No evidenciado" del informe.
- MVP grande para un solo change: el recorte al primer change (agenda sin solapamientos, sin reserva online del paciente) es lo que lo hace viable.

> **Actualización 2026-10-08:** DentalCore, AgendaPro y Doctoralia fueron verificados personalmente por el equipo (ver "Verificación de fuentes" del informe). Siguen como "No evidenciado" los datos que no figuran en las fuentes públicas. DentalTec, Bilog y la cifra de "62 entidades" de DentalCore no fueron comprobados por el equipo.

## 11. Preguntas abiertas

Textuales (la etapa 3 las lee desde acá):

1. La reserva online del paciente NO entra en el primer change; solo la carga por recepción. Confirmar.
2. ¿Cuánta anticipación mínima para cancelar/reprogramar? (no hay dato en el informe)
3. ¿Un mismo paciente puede tener dos turnos superpuestos con profesionales distintos?
4. ¿Límite de sobreturnos por profesional y día? (change posterior)
5. ¿Criterio de orden de la lista de espera?
6. Stack tecnológico del change. **Resuelta 2026-10-07 por indicación del profesor (ver sección 9).**
7. Los "No evidenciado" del informe: solapamientos en competidores, costo de WhatsApp en DentalSoft, validación OS de DentalTec en tiempo real, alcance de las leyes 26.529/25.326/27.706 y exportación de datos.
