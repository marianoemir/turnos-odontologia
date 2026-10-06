# Informe de Discovery — Sistema de gestión de turnos y agenda de pacientes para consultorios odontológicos (Argentina)

**Materia:** Metodología I — Tecnicatura Universitaria en Programación (UTN)
**Trabajo:** Trabajo de Integración: del Discovery al primer Change, con Spec-Driven Development y Active Stack
**Integrantes:** Mariano Chirino, Andres Fabre, Facundo Quiroga.
**Fecha:** 6 de octubre de 2026

---

## Resumen ejecutivo

**Qué se investigó.** Se relevaron 18 sistemas de gestión odontológica con agenda y turnos (Argentina, Latinoamérica e internacionales de referencia) a partir de fuentes públicas, con fecha de consulta del 2026-10-06. Se distinguió siempre entre funcionalidad comprobada y afirmación comercial del proveedor; lo no demostrado figura como "No evidenciado". Se comprobaron manualmente cinco fuentes por parte del equipo y se corrigieron las afirmaciones sin respaldo.

**Principales hallazgos.**
- El mercado argentino comparte un estándar: agenda multi-profesional, reserva online, recordatorios, historia clínica con odontograma y caja básica.
- Los vacíos más frecuentes son precios no publicados (12 de 18), WhatsApp como costo adicional, lista de espera y recuperación de ausentes poco documentadas, y prevención de solapamientos por sillón/box casi sin documentar.
- Lidera la matriz ponderada DentalCore (4,25), seguido de DentalSoft (3,35) y DentalTec (3,15, con advertencia de sesgo de fuente).

**MVP recomendado.** Agenda multi-profesional y multi-sillón/box con prevención de solapamientos, reserva y confirmación por link, recordatorios, historia clínica mínima con odontograma, caja con Mercado Pago, obras sociales y factura ARCA; como diferenciadores, seña vinculada a la reserva, lista de espera automática y reactivación de ausentes. El primer change a implementar en este trabajo es la creación de turnos sin solapamientos por profesional y por sillón/box.

---

**Rol**: analista sénior de mercado y producto SaaS, salud digital / odontología, foco Argentina y Latinoamérica.
**Fecha de consulta de todas las fuentes**: 6 de octubre de 2026 (salvo que se indique otra fecha explícita).
**Criterio metodológico**: solo se consigna como funcionalidad comprobada lo demostrado en sitio oficial, documentación pública, página de precios, centro de ayuda o video oficial. Todo lo demás figura como **"No evidenciado"**. Las cifras de clientes son **afirmaciones comerciales del proveedor, no auditadas**, salvo que se indique fuente independiente.

### Nota metodológica — ajustes manuales (rev. 2026-10-06, puntos 1–4)

El 2026-10-06 se re-consultaron los sitios oficiales de los puntos 1–4 con asistencia del agente de IA y se corrigió el informe. Esta re-consulta **no** forma parte de la verificación manual del equipo: las fuentes comprobadas personalmente están en la sección "Verificación de fuentes". Ajustes aplicados:

1. **DentalTec (punto 1) — sesgo de fuente**: la página principal citada (`/mejor-software-odontologico-argentina`) es una comparativa publicada por el propio proveedor donde se rankea #1 a sí mismo. Es **conflicto de interés**: sus afirmaciones ("único que valida en tiempo real", "−64% débitos", "98% entrega WhatsApp", "5/5", "soporte 24/7", "JWT+bcrypt") se rebajan de "diferencial comprobado" a **afirmación del proveedor, no verificada independientemente**. Su puntaje Admin baja 5→4 y el ponderado 3,40→3,15.
2. **DentalCore (punto 2) — precio sí publicado**: la home actual publica plan único **USD 50/mes (2 usuarios + 50 GB) + USD 10 por usuario extra; videoconsulta USD 0,50**. Se corrige el "monto no publicado". Además: **no hay plan gratis ni prueba** (solo reembolso 14 días); seguridad/trazabilidad sí documentadas (auditoría de accesos con IP/dispositivo no editable, TLS, backups AES-256-GCM con prueba mensual de restauración, scrypt, 2FA para recetar, base aislada por clínica, exportación PDF+HL7 FHIR con 90 días post-baja extensibles a 2 años; ISO 27001 solo a nivel controles, sin certificación); receta electrónica ReNaPDiS **en trámite, no otorgada**. Seg/Exp sube 2→4 y Precio 3→4; ponderado 4,05→4,25.
3. **DentalSoft (punto 3) — precios retirados tras verificación manual**: la rev. original consignó planes y precios (Gratis 6 meses, Gestión $30.000, Pro $60.000) y costo de WhatsApp automático (USD 0,026 por mensaje) sin respaldo válido; la verificación manual del sitio oficial el 2026-10-06 confirmó que NO publica precios ni planes, solo funcionalidades y beneficios. Se reemplazó por 'Precio no publicado en el sitio oficial' y los recordatorios por plan quedaron como No evidenciado. Precio baja 4→2; ponderado 3,45→3,35 (conserva el 2.º lugar).
4. **Bilog (punto 4) — odontograma y OS sí evidenciados + fila faltante en matriz**: su home muestra odontograma FDI por cuadrantes y declara "Ficha, odontograma, tratamientos y evolución digital", más prestaciones/OS/liquidaciones/KPIs y módulo de auditoría para OS/gerenciadoras, app iOS/Android con enlaces, alta por QR y sin permanencia. Se corrigen los "No evidenciado" correspondientes (Mercado Pago/ARCA siguen sin evidencia). Además la matriz B **había omitido la fila de Bilog**: se agrega con ponderado 2,30. Métricas (+20 años, +1.500 clínicas, +10M pacientes, +150k turnos/mes) siguen siendo afirmación comercial.

---

## A. Tabla comparativa (ordenada por relevancia para Argentina)

### A1. Identidad, segmento, modalidad y modelo comercial

| # | Producto / Empresa / País / URL oficial | Segmento objetivo | Modalidad | Modelo comercial (publicado) | Fecha consulta |
|---|---|---|---|---|---|
| 1 | **DentalTec** — Tándem Digital — Argentina — https://web.dentaltec.com.ar/mejor-software-odontologico-argentina | Odontólogo independiente, consultorio, clínica, círculos/federaciones/CORA, cadenas | SaaS 100% web, sin instalación | Precio por odontólogo, monto no publicado. Packs WhatsApp desde USD 9 (afirmación del proveedor). Sin plan gratuito evidenciado. **Advertencia de sesgo**: su comparativa "top 5" está publicada por el propio proveedor rankeándose #1 | 2026-10-06 |
| 2 | **DentalCore** — DentalCore — Argentina (opera en 8 países Latam) — https://dentalcore.app/ | Independiente, consultorio, clínica multi-profesional | SaaS nube | **Publicado**: plan único USD 50/mes (2 usuarios + 50 GB incluidos) + USD 10 por usuario extra (hasta 100 usuarios con cuenta propia; los pacientes no cuentan como usuarios; verificado por el equipo); videoconsulta USD 0,50. En Argentina en pesos vía Mercado Pago/transferencia; pago 1/3/6/12 meses, sin débito automático. **Garantía de reembolso de 14 días** (verificado por el equipo). Plan gratuito o prueba: No evidenciado. Promo fundadora −30% 6 meses contratando hasta el 31/12 | 2026-10-06 |
| 3 | **DentalSoft** — DentalSoft — Argentina (La Plata/Rosario) — https://dentalsoft.com.ar/ | Consultorio, clínica (declara 300+ clínicas y 4.9/5 — afirmación comercial) | SaaS nube + web pública del consultorio + chatbot | Precio no publicado en el sitio oficial (verificado manualmente el 2026-10-06). Recordatorios automáticos por plan y costo por mensaje: No evidenciado. Demo del panel sin tarjeta | 2026-10-06 |
| 4 | **Bilog** — Bilog — Argentina — https://bilog.com.ar/ | Consultorio, clínica, OS/gerenciadoras (declara +20 años, 1.500+ clínicas, 5.000+ usuarios, 10M+ pacientes, 150k turnos/mes — afirmación comercial) | SaaS nube + app mobile (iOS/Android con enlaces publicados) | Mensual con factura, tarjeta/débito/transferencia/depósito, sin permanencia. Monto no publicado. Configuración inicial sin costo (afirmación del proveedor) | 2026-10-06 |
| 5 | **FLAP** — FLAP — Argentina — https://flap.com.ar/odontologos | Independiente y clínica (agenda individual o multi-profesional, sucursales según plan) | SaaS nube + página de reservas mobile-friendly | Precio no publicado. Capacitación inicial sin costo (afirmación del proveedor) | 2026-10-06 |
| 6 | **Livio** — Livio — Argentina — https://www.liviodental.com/ | Clínica en crecimiento (declara foco en facturación ARS 5M–20M/mes — afirmación comercial) | SaaS nube + chatbot omnicanal + inbox WhatsApp | Precio no publicado. Sin plan gratuito evidenciado | 2026-10-06 |
| 7 | **OdontoClinIA (ClinIA)** — ClinIA — Argentina — https://www.clinia.com.ar/odontologia | Consultorio privado 1–N profesionales, clínica PyME, servicios municipales/hospitalarios, cadenas multi-sucursal | SaaS web | Precio no publicado. Recetario inscripto ReNaPDiS N.º 248 (alcance: recetario, no aprobación integral) | 2026-10-06 |
| 8 | **DentalCor** — DentalCor — Argentina (Córdoba) — https://dentalcorsoftware.com.ar/ | Consultorio y clínica (declara 500+ consultorios — afirmación comercial) | SaaS nube | Precio no publicado | 2026-10-06 |
| 9 | **DenPro** — DenPro — Argentina/España (sitios .ar y .es) — https://www.denpro.ar/ | Independiente (Basic) y clínica con staff (Team) | SaaS nube | AR: Basic $19.900/mes (1 usuario), Team $29.900/mes (usuarios ilimitados), −15% anual, 30 días gratis sin tarjeta. ES: 19 €/29 €. Montos en ARS sin aclaración de IVA | 2026-10-06 |
| 10 | **OdontoSoft Millennium** — GB Systems (Argentina/EE.UU.) — https://gbsystems.com/os/index.htm | Consultorio y clínica Latam (declara 3000+ licencias desde 1995 — afirmación comercial) | Instalación local Windows (XP SP2–10 según su web; tecnología legada) | Licencia tradicional, precio no publicado. Sin prueba evidenciada | 2026-10-06 |
| 11 | **Dentalink** — Dentalink — Chile, 20+ países Latam — https://www.softwaredentalink.com/ | Independiente, consultorio, clínica, multicentro | SaaS nube (Chrome recomendado, AWS) | Recurrente mensual/semestral/anual, monto no publicado. Sin contrato mínimo (afirmación del proveedor). Usuarios simultáneos ilimitados con permisos por rol | 2026-10-06 |
| 12 | **DentiDesk** — DentiDesk — Chile/Latam — https://www.dentidesk.cl/dentidesk/feature | Clínica dental moderna, multicentro | SaaS nube | Precio no publicado | 2026-10-06 |
| 13 | **AgendaPro** — AgendaPro — Chile, opera AR/MX/CL/otros — https://agendapro.com/ar y https://agendapro.com/ar/planes | Independiente, negocio de servicios, clínica pequeña (no dental-específico: belleza/bienestar/salud) | SaaS nube + app + marketplace | AR publicado: Individual $13.900/mes (1 profesional); Básico $33.900; Premium $44.900; Pro $314.900 (el monto sube con la dotación de profesionales; rango de profesionales: No evidenciado en la fuente oficial revisada). IVA: No evidenciado en la fuente oficial revisada. WhatsApp aparte: monto No evidenciado en la fuente oficial revisada. Videoconferencia y asistente Charly aparte. Prueba gratis sin duración publicada; sin plan gratuito permanente | 2026-10-06 (precios de planes verificados por el equipo en /ar/planes) |
| 14 | **Doctoralia PRO** — Docplanner/Doctoralia (Polonia/España, opera AR) — https://pro.doctoralia.com/ar/precio | Especialista independiente y consultorio (todas las especialidades, incluye odontología) | SaaS nube + directorio/marketplace + app paciente | AR publicado: Starter $25.000; Plus $35.000; VIP $55.000 ARS/mes **facturados anualmente** (verificado por el equipo; pago por adelantado: No evidenciado). Historia clínica recién desde Plus. IVA de los planes sin aclarar. Coste adicional (web profesional) +$4.000 + IVA/mes (verificado por el equipo) | 2026-10-06 |
| 15 | **Clinic Cloud** — Doctoralia España SL — España (opera internacional) — https://clinic-cloud.com/tarifas | Consulta/clínica generalista; odontología como especialidad (módulo) | SaaS nube | Publicado +IVA, sin permanencia: Mini 29 €; Pro 49 €; Max 79 €/mes; Enterprise a convenir. Agendas extra +10 €. Presupuestos desde Pro; **odontograma solo en Max**. Periodontograma: plan no especificado | 2026-10-06 |
| 16 | **Gesden One / G5** — Infomed Software (grupo Henry Schein desde 2012) — España — https://www.infomedsoftware.com/software/gesden/gesden-one/ | Clínica dental y grupos (Easy/Profesional/Grandes clínicas, multicentro) | One: SaaS web; G5: escritorio Windows | Precio no publicado (se pide a comercial). G5 = licencia; One = servicio; preaviso 1 mes; revisión anual por IPC (condiciones publicadas) | 2026-10-06 |
| 17 | **Nimbo** — Nimbo — México (opera Latam) — https://www.nimbo-x.com/soluciones/dentistas | Dentista independiente y clínica | SaaS nube, por módulos/licencias | 14 días gratis todo incluido; luego solo módulos contratados. Montos no publicados | 2026-10-06 |
| 18 | **tab32 (referencia EE.UU.)** — tab32 — EE.UU. — https://tab32.com/pricing/ | Consultorio nuevo/en crecimiento (Alpine) y grupos/DSO (Summit) | SaaS nube (Google Cloud, HIPAA/SOC 2) | Publicado: Alpine Start-Up $125 USD/mes año 1 (hasta 3 providers), luego $225; Established $225 (hasta 5, con migración); Summit custom. Claims $0,20 y adjuntos $0,50. 14 días gratis, sin contrato | 2026-10-06 |

Otros relevados como contexto (no rankeados en la tabla principal): **IKOMDental** (https://ikomdental.com/, Latam/EE.UU./España, dentigrama 3D, facturación fiscal por país, precio no publicado); **Odentiva** (https://odentiva.com/, Panamá/Latam, plan gratis hasta 100 pacientes, pagos "según región" sin monto); **DentinCloud** (https://www.dentincloud.com/, 340+ clínicas en 18 países — afirmación comercial —, gratis hasta 250 pacientes, desde USD 11/mes); **Odontomy** (https://www.odontomy.com/, agenda + odontograma + reserva online, precio no publicado); **Dendoo** (España, https://dendoo.es/, gratis 1 mes luego Pro 20 €/Clínica 50 €); **CareStack/Open Dental/Curve** (EE.UU., referencia de costos: CareStack desde $829/mes, Open Dental $199→$149/oficina + hosting propio).

### A2. Funcional (comprobado vs. afirmación comercial; "No evidenciado" = no demostrado públicamente)

| # | Producto | Agenda y anti-solapamiento | Turnos digitales 24/7 | Automatización (recordatorios/ausentes) | Clínico (odontograma/HC) | Admin, cobros, OS/facturación | Integraciones locales y WhatsApp | Seguridad/operación |
|---|---|---|---|---|---|---|---|---|
| 1 | DentalTec | Agenda + recordatorios WhatsApp (comprobado). Detalle de vistas/bloqueos/sobreturnos: No evidenciado | Reserva online (comprobado). Lista de espera: No evidenciado | Recordatorios WhatsApp; "-40% ausentismo", "-64% débitos", "98% entrega" y "5/5 con 2.000+ usuarios" (**afirmación comercial autopublicada en comparativa propia, sin auditoría independiente**) | Odontograma + HC (comprobado). Periodontograma: No evidenciado | Validación de prácticas contra OS en tiempo real, +15 OS, facturación ARCA, gestión Círculo→Federación→CORA (**afirmación del proveedor en sitio propio, no verificada con afiliado real; ver sesgo de fuente en nota metodológica**) | WhatsApp (paquetes desde USD 9). API/adaptadores SOAP para OS (afirmación del proveedor) | Soporte 24/7, JWT+bcrypt (afirmación del proveedor). Exportación/auditoría: No evidenciado |
| 2 | DentalCore | Agenda drag & drop, sala de espera, tareas automáticas, inventario por lote, varias clínicas por cuenta (comprobado). Prevención de solapamiento: el asistente de voz avisa si un movimiento de turno se pisa con otro (parcial). | Confirmación por link (confirma/cancela, libera horario) + firma de consentimientos + factura + videoconsulta por links vía WhatsApp (comprobado). Reserva online autorreservable por el paciente: No evidenciado. Portal paciente: anunciado como "próximamente", NO disponible | Recordatorios 48/24 h, post-operatorios, controles, cumpleaños, laboratorio listo (comprobado); automáticos apagados por defecto, plantillas aprobadas por Meta. Asistente de voz "Sani" y dictado de evolución con clave IA propia (costo del proveedor de IA a cargo de la clínica) | HC + odontograma + periodontograma 6 puntos comparativo + 15 módulos por especialidad + **17 motores CDSS con fuente citada** + patología oral (62 entidades; cifra no verificada por el equipo) + recetas con chequeo de farmacia + 22 consentimientos (comprobado en sitio; calidad clínica no evaluada aquí) + voz/IA con clave propia | **Comprobado**: Mercado Pago (QR/link, AR/MX/CL/CO/PE/UY), factura ARCA B/C con CAE+QR por WhatsApp/email, caja diaria con arqueo, deudores, OS con nomenclador/cobertura/copago/liquidación (OSDE/Swiss/PAMI precargadas). Presentación electrónica ante OS: No evidenciado (solo justificativo imprimible) | WhatsApp API oficial Meta con número propio, bandeja compartida (comprobado). **HL7 FHIR** para portabilidad e interconsultas (comprobado). Mercado Pago 6 países. Receta electrónica ReNaPDiS: **en trámite, no otorgada** | Base aislada por clínica, TLS, backups AES-256-GCM (8 copias, prueba mensual de restauración), scrypt, 2FA obligatoria para recetar, sesión de 2 h, auditoría de accesos/fichas con IP y dispositivo no editable, exportación PDF+FHIR con 90 días post-baja (extensible a 2 años) (comprobado). ISO 27001: solo controles, sin certificación. Migración CSV/FHIR asistida sin costo. Soporte en español desde la app
| 3 | DentalSoft | Vista semanal/diaria/mensual, drag & drop, urgencias/sobreturnos con detección de solapamiento, bloqueos, multi-sucursal (comprobado). Google Calendar por profesional (comprobado) | Reserva web 4 pasos 24/7 con slots reales, reconocimiento por DNI, filtro por especialidad/OS (comprobado). Chatbot FAQ + derivación a reserva (comprobado) | WhatsApp + email como canales (comprobado). Recordatorios automáticos por plan y costo por mensaje: No evidenciado (el sitio oficial no publica planes). La agenda se actualiza con la respuesta. "−82% ausencias, +35% ocupación, 8 hs/semana" (**afirmación comercial no verificada por el equipo**). Cobro de deudas, recuperación de inactivos y pedido de reseñas Google automáticos mencionadas en el sitio; plan y alcance: No evidenciado. | HC + **odontograma interactivo de 18 estados, FDI, notas por pieza e historial con profesional+fecha** (comprobado con captura) + módulo de ortodoncia con fotos + presupuestos con cobertura OS aplicada + consentimientos con firma + recetas (comprobado). Periodontograma/imágenes: incluidos en planes pagos (5−10 GB) | Caja y cierre diario, efectivo/tarjeta/transf./Mercado Pago/OS, cobertura automática, egresos/anulaciones trazables, comisiones y **liquidaciones OS agrupadas con PDF** (comprobado). Factura ARCA: No evidenciado | Mercado Pago, Google Calendar, PDF/Excel (comprobado). WhatsApp con costo por mensaje en automático (ver Automatización). API pública: No evidenciada | KPIs realtime, multi-sucursal, usuarios/roles ilimitados (comprobado), migración incluida, soporte WhatsApp/email en español, demo sin tarjeta (comprobado). Auditoría formal/exportación total: No evidenciado
| 4 | Bilog | Agenda diaria/hoy, multi-profesional/consultorio, estados y confirmaciones automáticas (comprobado). Reglas de solapamiento: No evidenciado | Agenda online (reserva/cancela/consulta), captación desde redes/WhatsApp, alta por QR en recepción (comprobado). Lista de espera: No evidenciado | Recordatorios y confirmaciones automáticas + **iAngela**: carga de turnos por voz/texto y respuestas automáticas (gestión) + apoyo en radiografías/lectura clínica con descargo de criterio profesional (comprobado como funcionalidad, eficacia No evidenciada) | **Odontograma FDI por cuadrantes (comprobado con captura en home)** + ficha, tratamientos, evolución, adjuntos y documentación centralizada + presupuestos (comprobado). Periodontograma: No evidenciado | Prestaciones, **obras sociales, liquidaciones, reportes y KPIs** + módulo de **auditoría para OS/gerenciadoras** (control prestacional, validación, trazabilidad) + presupuestos/pagos (comprobado como declaración de producto). Mercado Pago/factura ARCA: No evidenciado | App mobile (iOS/Android con enlaces), turnos online, recetas e iAngela (comprobado). WhatsApp/Mercado Pago/ARCA/API: No evidenciado | Soporte y migración asistida, testimonios con soporte nominado (comprobado). Sin permanencia, baja sin costo (comprobado). Roles/exportación/auditoría de datos: No evidenciado
| 5 | FLAP | Agenda multi-profesional por especialidad/box/duración/disponibilidad, bloqueos, estados, autoasignación por carga (comprobado). Prevención de cruces declarada | Página de reservas con prestación+profesional+fecha (comprobado). Redes/chatbot: No evidenciado | Avisos: email incluido, WhatsApp por paquetes adicionales; señas vinculadas a reserva (comprobado) | HC + **odontograma FDI por pieza/superficie/eventos** + evoluciones + ortodoncia (comprobado) | Señas y cobros con **Mercado Pago**, estados visibles por cita; analíticas semanales (comprobado). Factura ARCA/OS: No evidenciado | Mercado Pago (comprobado). WhatsApp Business: parcial (paquetes). API/Google Calendar/AFIP: No evidenciado | Sucursales/permisos según plan (comprobado). Demo con datos ficticios (comprobado). Seguridad/exportación: No evidenciado |
| 6 | Livio | Agenda por profesional/sucursal, estados (pendiente/confirmado/no-show/cancelado) (comprobado) | Chatbot que agenda solo + inbox único WhatsApp+web (comprobado). Enlace web/redes: No evidenciado | Recordatorios WhatsApp/SMS/email 24 h antes + pipeline de leads + dashboard no-shows/conversión (comprobado). Recuperación de ausentes: parcial (afirmación comercial) | HCE + odontograma interactivo + adjuntos + firma digital (comprobado). Alineación Ley 27.706 declarada (alcance legal No evidenciado, requiere dictamen) | Facturación estimada, producción por profesional (comprobado). Mercado Pago/OS/ARCA: No evidenciado en lo revisado | Chatbot WhatsApp (comprobado). API/Calendar/AFIP/MP: No evidenciado | Dashboard realtime, trazabilidad "lista para auditoría" (afirmación comercial). Roles/exportación: No evidenciado |
| 7 | ClinIA | Turnos por profesional/especialidad/sillón (comprobado) | Agenda online 24/7 (comprobado). Cancelación/reprogramación/lista de espera: No evidenciado | Confirmación WhatsApp/email + **reagendamiento automático ante cancelación** + asistente IA WhatsApp que agenda sin humanos (comprobado como declaración de producto) | Anamnesis, odontograma, planes/presupuestos, radiografías, recetario ReNaPDiS 248 con HL7 FHIR (comprobado). Periodontograma: No evidenciado | Facturación a OS y SUMAR, facturación electrónica (comprobado como declaración). Mercado Pago: No evidenciado | RENAPER/PUCO interoperabilidad declarada (alcance No evidenciado). WhatsApp (comprobado). Google Calendar/API: No evidenciado | Multi-sede, dashboard único (comprobado). Cumplimiento Ley 26.529/25.326 declarado (requiere verificación). Exportación/auditoría: No evidenciado |
| 8 | DentalCor | Calendario diario/semanal/mensual multi-profesional con color, crear/editar/cancelar en 1 clic (comprobado). Bloqueos/solapamiento: No evidenciado | Reserva online (comprobado). Chatbot/redes/lista de espera: No evidenciado | Notificación al agendar/cancelar + recordatorios WhatsApp/email (comprobado). Automatización anti-ausencia: parcial | Historial clínico + archivos (comprobado). Odontograma: mencionado en marketing, **no demostrado en lo revisado → No evidenciado hasta demo** | Presupuestos PDF, finanzas realtime, pagos/deudas/reportes (comprobado). Mercado Pago/OS/ARCA: No evidenciado | WhatsApp/email (comprobado). MP/Calendar/API/AFIP: No evidenciado | Soporte en español (comprobado). Roles/exportación: No evidenciado |
| 9 | DenPro | Calendario intuitivo diario (comprobado). Multi-sillón/bloqueos/solapamiento: No evidenciado | Reserva online (declarada). Confirmación/cancelación/lista de espera: No evidenciado | Recordatorios: No evidenciado en .ar (sitio escueto) | Odontograma FDI + notas + recetas (comprobado). Periodontograma/imágenes: No evidenciado | Facturación (mencionada). Caja/OS/MP/ARCA: No evidenciado | Comunicación (mencionada sin canal). WhatsApp/API: No evidenciado | GDPR/AES-256/ISO 27001 (declarado en .es). Roles/informes básicos (comprobado) |
| 10 | OdontoSoft | Agenda clásica escritorio (comprobado). Multi-sillón/prevención de solapes: No evidenciado | No evidenciado (producto pre-web; sin reserva online demostrada) | No evidenciado | Odontograma + gestión médica/contable/comercial (comprobado). Compatibilidad multi-país de nomenclatura (comprobado) | Contabilidad/caja (comprobado). Mercado Pago/OS/ARCA: No evidenciado | No evidenciado (sin WhatsApp/API/Calendar) | Instalación local, sin respaldo nube demostrado. Riesgo de obsolescencia tecnológica |
| 11 | Dentalink | Agenda, control de agenda (módulo Titanium), citas recurrentes, reagendamiento simple (comprobado). Anti-solape: No evidenciado | Agendamiento online desde todos los canales + botón web (comprobado). Chatbot/WhatsApp nativo: No evidenciado (confirmaciones personalizables por sucursal, canal email; SMS/WhatsApp vía integraciones según país) | Confirmaciones automáticas + tareas automáticas + telemedicina + campañas email/encuestas (comprobado). Recuperación de ausentes: parcial | HC + odontograma + **periodontograma** + ortodoncia + estética facial + videos 3D + documentos (comprobado). Imágenes: carga de imágenes/documentos (comprobado) | Caja multi-caja, gastos, inventario, laboratorios, comisiones/multicentro, 50+ reportes Excel, pagos online y "maquinitas", cuotas/financiamiento (comprobado). Facturación fiscal AR: No evidenciado; convenios/descuentos por alianzas (comprobado) | **API en plan Titanium** (comprobado). Mercado Pago/ARCA/Google Calendar: No evidenciado como nativo | Usuarios ilimitados con permisos, migración asistida, AWS, multi-sucursal (comprobado). Exportación: recuperación de datos al dar de baja (comprobado); auditoría formal: No evidenciada |
| 12 | DentiDesk | Agenda avanzada personalizable, feriados/bloqueos, botón de agendamiento web (comprobado) | Botón/link de agendamiento online (comprobado). Confirmación/anulación por email con link, recordatorio de controles, cumpleaños (comprobado) | Correos de confirmación/recordatorio/cumpleaños (comprobado). WhatsApp/SMS: No evidenciado como nativo | Anamnesis + fichas (odonto, endodoncia, periodoncia, cirugía, ortodoncia) + odontograma + presupuestos por pieza + recetas/derivaciones/radiología (comprobado) | Convenios con descuentos, prestaciones/insumos, producción/recaudación/morosos (comprobado). Mercado Pago/ARCA: No evidenciado | Email (comprobado). WhatsApp/API/Calendar: No evidenciado | Usuarios/permisos/horarios/tarifas por clínica, reportes (comprobado). Seguridad/exportación: No evidenciado |
| 13 | AgendaPro | Multi-agenda, recursos, comisiones, inventario (comprobado). Odontología-específico (sillón/prestación variable): No evidenciado | Reserva online + marketplace + recordatorios (comprobado). Ficha personalizable solo Premium/Pro | Marketing por correo (500 a 5000/mes según plan: 500 en Individual, 5000 en Pro), encuestas, giftcards (comprobado). WhatsApp: **complemento aparte**, no incluido | Ficha clínica personalizable (Premium/Pro) (comprobado). Odontograma/periodontograma: **No evidenciado** | Cobros integrados; facturación electrónica "próximamente" (declarado, no disponible). Mercado Pago nativo: No evidenciado. Señas dentro de la plataforma (afirmación de terceros) | WhatsApp aparte (comprobado como costo adicional; monto: No evidenciado en la fuente oficial revisada). API solo Pro. Google Analytics/Meta Pixel (Pro). ARCA/OS: No evidenciado | Roles, multi-sede, +20.000 negocios (afirmación comercial). Auditoría/exportación sanitaria: No evidenciado |
| 14 | Doctoralia | Agenda robusta multi-vista, gestión de cancelaciones masivas (VIP), sincronización (comprobado) | Reserva 24/7 desde perfil/directorio + app paciente con chat, opiniones, videoconsulta (comprobado). Lista de espera solo en VIP (comprobado) | Recordatorios SMS/email/push + reprogramación por link (comprobado). WhatsApp nativo: No evidenciado como canal principal | Historia clínica recién Plus (comprobado). Odontograma: **No evidenciado** | Cobros/facturación clínica: No evidenciado (es capa de captación + agenda, no ERP odontológico) | Directorio con 110k+ perfiles AR y filtro por OS (comprobado). API/MP/ARCA: No evidenciado | Reseñas verificadas, 80M pacientes/7M reservas mensuales globales (afirmación del grupo). Roles clínicos: parcial |
| 15 | Clinic Cloud | Multi-agenda, citas recurrentes, recordatorios SMS/email (comprobado). Agenda por sillón (declarada en página dental) | Portal paciente + reserva 24/7 vía Doctoralia (comprobado) | Recordatorios + automatizaciones (consentimientos, cuestionarios pre-tratamiento) (comprobado). WhatsApp/SMS/email según configuración | Odontograma + periodontograma + presupuestos desde odontograma + firma digital + recetas REMPe (comprobado; odontograma **solo plan Max**) | Presupuestos/facturación (TicketBAI/VeriFactu para España; **sin localización ARCA/OS argentinas evidenciada**). Stock/liquidaciones (Pro+) | Integración Doctoralia (comprobado). WhatsApp (automatizaciones). API/MP/ARCA: No evidenciado | RGPD/UE, backups, roles, descarga por rangos (comprobado). Exportación total/formato: No evidenciado |
| 16 | Gesden | Agenda multigabinete/multicentro + call center de agendas + permisos por centro (comprobado). Referencia en profundidad dental | Cita online: No evidenciado como estándar (depende de módulos) | SMS/email automatizados + recalls/fidelización (comprobado). WhatsApp nativo: No evidenciado | Odontograma + periodontograma comparativo + ortodoncia + PACS/imagen (Gesimag/Image One) + laboratorio (comprobado). Entre lo más profundo clínicamente | Cobros/facturas/anticipos, contabilidad integrada, listados oficiales ES (comprobado). Localización AR (ARCA/OS/MP): **No evidenciada** | Integración imagen (Kodak, Sirona, etc., con costo) (comprobado). API/WhatsApp/MP: No evidenciado | Multicentro, 400+ migraciones/año (afirmación comercial). Soporte 50+ técnicos Lun–Vie (afirmación comercial). Seguridad/exportación: No evidenciado |
| 17 | Nimbo | Agenda colaborativa multi-médico, horarios personalizados, Google Calendar (comprobado) | Sitio de solicitud de citas (comprobado). Chatbot/WhatsApp: recordatorios WhatsApp/SMS/email (comprobado) | Recordatorios automáticos (comprobado). Campañas/recuperación: No evidenciado | **Odontograma adulto/infantil** + expediente con CIE-10 + vademécum por país + inventarios (comprobado) | Cargos a pacientes, administración (comprobado). Facturación MX (CFDI, verificar). ARCA/OS/MP: No evidenciado | Google Calendar (comprobado). API: No evidenciada | Nube multi-dispositivo (comprobado). Roles/seguridad formal: No evidenciado |
| 18 | tab32 | Scheduling multi-sede, charting, check-in kiosco, formularios (comprobado). Anti-solape: No evidenciado en lo revisado | Online scheduling + portal + pay-by-text/email (comprobado) | Reminders, verificación de seguros con IA, ERA/EOB, voice charting (comprobado; IA pay-per-use) | Charting + imaging + ePrescribe + IA diagnóstica (comprobado). Odontograma FDI: implícito en charting, validar en demo | Pagos con card-on-file, planes de pago, membership, claims $0,20 (comprobado). Localización AR: **ninguna** (seguros EE.UU., no OS/ARCA/MP) | Open data warehouse BigQuery, SSO (Summit) (comprobado). WhatsApp: No evidenciado | HIPAA/SOC 2 II, auditoría, GCP cifrado (comprobado). Referencia de UX y plataforma, no de despliegue AR directo |

---

## B. Matriz de puntuación 0–5 (pesos: Turnos+Automatización 25% | Clínico 20% | Integraciones locales+WhatsApp 15% | Admin/Cobros/Facturación 15% | Experiencia paciente 10% | Seguridad/Export/Trazabilidad 10% | Precio/Adopción 5%)

> **Orden de las filas:** por relevancia para Argentina (igual que la tabla A), no por ponderado.

> Escala: 0 = ausente/no evidenciado; 1 = mención sin evidencia; 2 = parcial; 3 = funcional comprobado; 4 = sólido + diferencial; 5 = mejor de su clase en esta muestra. El ponderado es orientativo, no un ranking de compra: castiga la falta de evidencia pública (un producto puede ser mejor de lo que publica).

| # | Producto | T+A (25%) | Clínico (20%) | Integ. (15%) | Admin (15%) | Exp.Pac. (10%) | Seg/Exp (10%) | Precio (5%) | **Ponderado /5** |
|---|---|---|---|---|---|---|---|---|---|
| 2 | DentalCore | 4 | 5 | 4 | 5 | 3 | 4 | 4 | **4,25** |
| 1 | DentalTec | 3 | 3 | 4 | 4 | 3 | 2 | 2 | **3,15** |
| 3 | DentalSoft | 4 | 3 | 3 | 4 | 4 | 2 | 2 | **3,35** |
| 4 | Bilog | 3 | 3 | 1 | 3 | 2 | 1 | 1 | **2,30** |
| 10 | OdontoSoft Millennium | 1 | 3 | 0 | 2 | 0 | 0 | 1 | **1,20** |
| 11 | Dentalink | 3 | 4 | 2 | 3 | 3 | 3 | 2 | **3,00** |
| 5 | FLAP | 3 | 4 | 3 | 3 | 3 | 1 | 2 | **2,95** |
| 14 | Doctoralia PRO | 4 | 1 | 2 | 1 | 5 | 3 | 3 | **2,60** |
| 6 | Livio | 3 | 3 | 2 | 2 | 3 | 2 | 1 | **2,50** |
| 15 | Clinic Cloud | 3 | 4 | 1 | 2 | 4 | 3 | 2 | **2,80** |
| 7 | ClinIA | 3 | 3 | 2 | 3 | 2 | 3 | 1 | **2,65** |
| 13 | AgendaPro | 4 | 1 | 2 | 2 | 4 | 2 | 4 | **2,60** |
| 12 | DentiDesk | 2 | 4 | 1 | 2 | 2 | 1 | 1 | **2,10** |
| 8 | DentalCor | 3 | 2 | 2 | 2 | 3 | 1 | 1 | **2,20** |
| 18 | tab32 (ref.) | 4 | 4 | 0 | 2 | 4 | 5 | 1 | **3,05** (no desplegable en AR sin localizar) |
| 16 | Gesden (ref.) | 2 | 5 | 0 | 2 | 1 | 2 | 1 | **2,15** (no localizado AR) |
| 17 | Nimbo (ref.) | 3 | 3 | 1 | 2 | 3 | 1 | 2 | **2,30** |
| 9 | DenPro | 2 | 2 | 1 | 1 | 2 | 2 | 4 | **1,80** |

**Notas de la matriz**: (i) fila #10 OdontoSoft Millennium: T+A=1 (agenda clásica de escritorio evidenciada, pero sin turnos digitales ni automatización); Clínico=3 (odontograma comprobado en A2); Integ.=0, Exp.Pac.=0 y Seg/Exp=0 (sin evidencia en A2); Admin=2 (contabilidad/caja comprobada, sin Mercado Pago/OS/ARCA); Precio=1 (monto no publicado, sin prueba); ponderado 1,20. (ii) Clinic Cloud: ponderado calculado 2,80; la falta de localización argentina (sin ARCA, obras sociales ni Mercado Pago) se consigna como limitación cualitativa y no modifica el puntaje.

Lectura crítica (rev. 2026-10-06): lidera DentalCore (4,25) por localización AR completa y documentada más seguridad/exportación verificables; segundo DentalSoft (3,35), sin precio publicado pero con odontograma de 18 estados con historial y liquidación OS confirmados; tercero DentalTec (3,15), penalizado por sesgo de fuente —sus diferenciales de validación OS y débitos son autopublicados sin verificación independiente—. tab32/Gesden puntúan alto en plataforma/clínica pero son incomparables para operar en AR sin un proyecto de localización. El puntaje máximo de Precio (4) lo comparten DenPro, DentalCore y AgendaPro por publicar sus planes; DenPro pierde en profundidad funcional evidenciada. Se agregó la fila faltante de Bilog (2,30) y la de OdontoSoft Millennium (1,20).

---

## C. Análisis competitivo

### C1. Lo que ya es estándar de mercado (si el MVP no lo tiene, nace en desventaja)

1. Agenda diaria/semanal/mensual multi-profesional con colores y estados (pendiente/confirmado/cancelado/no-show).
2. Reserva online 24/7 con link compartible + confirmación/cancelación por link.
3. Recordatorios automáticos (al menos email/SMS; WhatsApp esperado aunque muchos lo cobran aparte).
4. Historia clínica + odontograma digital FDI; presupuestos/planes de tratamiento atados al odontograma.
5. Caja diaria, medios de pago básicos, reportes de producción/recaudación.
6. Roles y permisos mínimos + multi-sucursal básico en planes altos.
7. Nube sin instalación, responsive, prueba gratis o demo guiada.

### C2. Diferenciadores reales (pocos los tienen comprobados)

- **Validación de prácticas contra OS en tiempo real** (DentalTec, único que lo declara con instituciones; **advertencia: comparativa autopublicada por el propio proveedor, verificar en demo con casos de débito y afiliado real**).
- **Factura ARCA con CAE+QR emitida desde el cobro y enviada por WhatsApp + Mercado Pago nativo + liquidación OS con nomenclador** (DentalCore, el circuito más completo evidenciado; DentalSoft lo sigue en liquidación OS sin ARCA evidenciado).
- **CDSS con motores clínicos citados** (DentalCore, 17 motores; nadie más lo ofrece en la muestra).
- **Autoasignación por carga + reasignación/reagendamiento automático** (FLAP, ClinIA; el resto reagenda a mano).
- **Marketplace/directorio que llena agenda** (Doctoralia, AgendaPro; los dentales puros dependen del tráfico propio de la clínica).
- **Plataforma abierta con API + data warehouse** (Dentalink Titanium, tab32 Summit; el resto es cerrado).
- **PACS/imagen dental y laboratorio integrados** (Gesden, Dentalink parcial, Nimbo parcial).

### C3. Vacíos frecuentes del mercado argentino

1. **Precios ocultos**: 12 de 18 no publican monto. Solo publican DentalCore, DenPro, AgendaPro, Doctoralia PRO, Clinic Cloud y tab32; el costo real (WhatsApp aparte, dotación, facturación electrónica) suele aparecer recién en la demo.
2. **WhatsApp como costo adicional**: se vende como "automatización" pero en FLAP (paquetes), AgendaPro (monto No evidenciado), DentalTec (USD 9+) es un costo variable; pocos lo incluyen.
3. **Lista de espera y recuperación de ausentes**: casi nadie la muestra funcionando (solo Doctoralia VIP la lista explícita; DentalSoft/Livio la mencionan sin detalle).
4. **Sobreturnos, bloqueos y prevención de solapamiento por sillón/box**: declarado por pocos (DentalSoft, FLAP, Gesden); la mayoría no lo documenta.
5. **Exportación y salida**: solo Dentalink (recuperación al baja) y Clinic Cloud (descarga por rangos) lo documentan; formatos, plazos e imágenes quedan grises. Riesgo de lock-in.
6. **Cumplimiento sanitario argentino**: casi todos declaran leyes (26.529, 25.326, 27.706) sin dictamen ni matriz de cumplimiento; solo ClinIA da un identificador verificable (ReNaPDiS 248, alcance recetario).
7. **Obras sociales de verdad**: convenios, nomencladores, débitos y presentaciones son el dolor argentino; solo DentalTec/DentalCore/DentalSoft/ClinIA lo abordan de frente. Los internacionales (Clinic Cloud, Gesden, tab32, Nimbo) no localizan.
8. **Señas y no-show economics**: solo FLAP ata seña→reserva→caja; el resto cobra la consulta pero no protege el hueco.

### C4. Oportunidades de innovación para un nuevo sistema

1. **Transparencia radical**: precio publicado con calculadora por dotación + WhatsApp incluido en cupo; comparador de TCO a 3 años (licencia + WhatsApp + MP + migración). DentalCore (plan único USD 50+10/usuario) ya publica precio, pero no ofrece calculadora ni TCO; DentalSoft no publica precio en su sitio oficial (verificado manualmente).
2. **Anti-ausentismo de circuito cerrado**: seña por Mercado Pago + recordatorio con confirmación en 1 toque + lista de espera automática que rellena el hueco + reactivación de ausentes. Piezas sueltas existen; circuito cerrado, no.
3. **Obras sociales con menor fricción administrativa**: nomenclador precargado + validación previa + liquidación con PDF + gestión de débitos/apelaciones. Si se iguala a DentalTec y se suma UX simple, constituiría la principal ventaja competitiva en el mercado argentino.
4. **Recepción autónoma**: chatbot WhatsApp que agenda/reprograma/cobra seña sin humanos (Livio/ClinIA lo prometen; hacerlo medible con tasa de auto-resolución publicada sería diferencial).
5. **Clínico que ayuda a decidir**: CDSS liviano (alertas, contraindicaciones, controles) + odontograma que genera plan/presupuesto/citas. Solo DentalCore lo intenta.
6. **Portabilidad garantizada**: exportación total en 1 clic (pacientes, HC, imágenes, agenda, caja) + contrato de salida de 30 días publicado. En un mercado con miedo al lock-in, es argumento de venta.
7. **Multi-sillón/box real**: agenda por recurso con duraciones variables, bloqueos y detección de choques desde el día 1 (los horizontales como AgendaPro no lo tienen; los dentales lo documentan poco).

---

## D. Recomendación final

### D1. Cinco competidores prioritarios para demo (con qué validar en cada uno)

1. **DentalCore** (https://dentalcore.app/) — validar: circuito cobro→MP→ARCA→WhatsApp en vivo; liquidación OS con nomenclador; CDSS con fuentes; qué pasa si ARCA cae; exportación HL7 FHIR real y plazo post-baja; estado del trámite ReNaPDiS; confirmar que no hay prueba gratuita (solo reembolso 14 días) y precio USD 50+10/usuario.
2. **DentalTec** (https://web.dentaltec.com.ar/mejor-software-odontologico-argentina) — validar: validación OS en tiempo real con afiliado real y tope/frecuencia; tasa de débitos con datos auditables (la comparativa es autopublicada); flujo Círculo→Federación→CORA; precio por odontólogo + WhatsApp; salida de datos.
3. **DentalSoft** (https://dentalsoft.com.ar/) — validar: detección de solapamientos/sobreturnos; Google Calendar; liquidación OS vs. DentalCore; chatbot y tasa de auto-reserva; planes, precio y costo real de WhatsApp automático (no publicados en el sitio oficial); "↓82% ausencias" (afirmación comercial no verificada por el equipo); contrato y SLA en español.
4. **Dentalink** (https://www.softwaredentalink.com/) — validar: API Titanium, multicentro, 50+ reportes, migración real desde planilla/otro sistema, costo total sin localización AR (qué queda manual en OS/ARCA/MP).
5. **AgendaPro** (https://agendapro.com/ar/planes) — validar: TCO real (plan + dotación + WhatsApp (monto No evidenciado) + complementos), ficha personalizable vs. odontograma real, marketplace (¿trae pacientes o solo agenda?), facturación electrónica "próximamente" (fecha comprometida).

### D2. Tres productos de referencia para UX (no para copiar funcionalidad, sino experiencia)

1. **Doctoralia** (paciente: https://www.doctoraliar.com/ / pro: https://pro.doctoralia.com/ar/agenda-doctoralia-para-especialistas) — búsqueda→reserva→recordatorio→reseña sin fricción; app paciente y gestión de cancelaciones masivas.
2. **tab32** (https://tab32.com/platform/) — plataforma nube coherente, check-in, pagos por texto, analítica y data warehouse abierto; vara de "todo en un login".
3. **FLAP Odontólogos** (https://flap.com.ar/odontologos) — narrativa reserva→atención→cobro en un flujo, autoasignación por carga y demo con datos ficticios para probar sin riesgo.

### D3. MVP sugerido

**Imprescindibles (v1, sin esto no se sale)**:
- Agenda multi-profesional + multi-sillón/box con duraciones variables, bloqueos, sobreturnos y prevención de solapamientos.
- Reserva online 24/7 por link (profesional/prestación/fecha/hora) + confirmación/cancelación en 1 toque que libera el hueco.
- Recordatorios automáticos con cupo incluido + estados (pendiente/confirmado/no-show/cancelado).
- HC mínima + odontograma FDI + planes/presupuestos atados a piezas.
- Caja diaria + Mercado Pago (QR/link) + deudores + reportes básicos.
- OS argentinas: nomenclador, cobertura/copago y liquidación con PDF (aunque la validación en tiempo real venga después).
- Factura ARCA B/C con CAE+QR desde el cobro.
- Roles/permisos + multi-sucursal básico + exportación total en 1 clic.
- Soporte y migración asistida en español (el "soporte real" es el feature argentino).

**Diferenciadores v1 (pocos los tienen juntos)**:
- Seña vinculada a la reserva + lista de espera automática que rellena cancelaciones.
- Reagendamiento automático + reactivación de ausentes medible.
- Chatbot WhatsApp que agenda y cobra seña (con tasa de auto-resolución publicada).
- Precio público con calculadora y WhatsApp incluido en cupo.

**Para etapas posteriores (no v1)**:
- CDSS/IA diagnóstica, voz clínica, implantes 3D, ortodoncia/estética dedicada.
- PACS/imagen avanzado, laboratorio, inventario multi-almacén.
- Campañas/marketing, encuestas NPS, membership/financiamiento en cuotas.
- API pública/marketplace, multi-país fiscal, telemedicina.

---

## Verificación de fuentes

El 2026-10-06 el equipo abrió manualmente cinco fuentes (sitio oficial, página de precios y centro de ayuda) y comparó lo que afirmaba el informe con lo que efectivamente publica cada una. Verificó: Mariano Chirino. El resto de las fuentes no fue comprobado por el equipo. Resultado: una afirmación sin respaldo (DentalSoft), un error de funcionalidad (Doctoralia PRO), una imprecisión menor (AgendaPro, planes), una coincidencia sin correcciones (DentalCore, con una cifra sin comprobar) y una fuente que no respalda lo afirmado (centro de ayuda de AgendaPro). 

| Fuente (URL) | Fecha de consulta | Qué afirmaba el informe | Qué se encontró en la URL | Resultado y corrección |
|---|---|---|---|---|
| **DentalSoft** — https://dentalsoft.com.ar/ | 2026-10-06 | Planes Gratis 6 meses, Gestión $30.000/mes y Pro $60.000/mes; recordatorios automáticos solo en Pro; Meta cobra USD 0,026 por mensaje. | El sitio no publica precios ni planes: solo muestra funcionalidades y beneficios. | **No coincide (afirmación sin respaldo).** Se corrigió a "Precio no publicado en el sitio oficial" en A1, A2, B (Precio 4→2; ponderado 3,45→3,35), C3 (11→12 de 18 sin precio), D1 y la nota metodológica. El "↓82% ausencias" pasó a "afirmación comercial no verificada por el equipo". |
| **Doctoralia PRO** — https://pro.doctoralia.com/ar/precio | 2026-10-06 | Starter $25.000, Plus $35.000 y VIP $55.000 por mes; lista de espera incluida en Plus y VIP. | Los precios y el contenido de cada plan coinciden. La lista de espera aparece solo en VIP (Plus incluye registros médicos electrónicos, recordatorios por SMS y consulta en línea). | **Coincide en precios; error en funcionalidad.** Corregido en A2 y C3 (punto 3): lista de espera solo en VIP. Comprobado además por el equipo: los planes figuran como "Por mes / Facturado anualmente" y el coste adicional como "$4.000 + IVA / mes". El pago anual por adelantado y el IVA de los planes: No evidenciado. |
| **AgendaPro** — https://agendapro.com/ar/planes | 2026-10-06 | Individual $13.900, Básico $33.900, Premium $44.900 y Pro $314.900; correos de marketing de 500 a 2000 por mes; fichas personalizables desde Premium; API solo en Pro. | Los precios y las funciones por plan coinciden. El plan Pro llega a 5000 correos de marketing por mes. | **Coincide con una imprecisión menor**, corregida en A2 (500 a 5000 correos). No se verificó en el texto relevado: IVA incluido, WhatsApp desde $7.900/mes, selector de 2 a 20 profesionales y facturación electrónica "próximamente": No evidenciado. |
| **DentalCore** — https://dentalcore.app/ | 2026-10-06 | Plan único USD 50/mes (2 usuarios y 50 GB), USD 10 por usuario extra, videoconsulta USD 0,50, precio fundador −30% durante 6 meses hasta el 31/12, y funciones de facturación ARCA, obras sociales, Mercado Pago, CDSS, exportación HL7 FHIR, base aislada por clínica y roles. | Todo lo anterior coincide. El sitio detalla además que la videoconsulta se factura a mes vencido y que hay paquetes de espacio extra (+250 GB USD 19 hasta +25 TB USD 1.975 por mes), dato que el informe no incluía. | **Coincide, sin correcciones.** Comprobado además por el equipo el 2026-10-06 (texto y captura de pantalla de la propia página): garantía de reembolso de 14 días (devolución total si se decide dentro de los 14 días de la primera compra), tope de "hasta 100 usuarios" por clínica (los pacientes no se cobran ni cuentan como usuarios), "17 motores clínicos" y "22 Consentimientos Informados". Plan gratuito o prueba: No evidenciado. La cifra de 62 entidades de patología oral no se comprobó. |
| **AgendaPro (centro de ayuda)** — https://ayuda.agendapro.com/es/articles/5428013-como-configuro-mi-plan-agendapro | 2026-10-06 | WhatsApp aparte desde $7.900/mes (50 mensajes), IVA incluido y selector de 2 a 20 profesionales. | Es una guía que describe qué incluye y cómo se configura el plan; no publica montos, IVA ni costo de WhatsApp. | **No respalda las afirmaciones.** Quedan como "No evidenciado" en fuente oficial (los montos de los planes sí se verificaron en /ar/planes). |

**Lectura de la verificación.** La fuente que falló fue la que el informe presentaba con más detalle (los planes de DentalSoft), lo que muestra que un dato puede ser plausible y estar completamente ausente de la fuente citada. Por eso, ante datos no encontrados, el informe los consigna como "No evidenciado" y no los completa con fuentes secundarias.

---

## Referencias (URLs y fecha de consulta)

- https://flap.com.ar/odontologos — 2026-10-06
- https://www.clinia.com.ar/odontologia — 2026-10-06
- https://www.liviodental.com/ — 2026-10-06
- https://bilog.com.ar/ — 2026-10-06
- https://dentalcorsoftware.com.ar/ — 2026-10-06
- https://dentalcore.app/ — 2026-10-06 (re-verificado: plan único USD 50/mes + USD 10/usuario, 50 GB, videoconsulta USD 0,50; garantía de reembolso 14 días; plan gratis o prueba: No evidenciado; ReNaPDiS en trámite; exportación PDF+HL7 FHIR)
- https://dentalcore.app/funcionalidades/finanzas — 2026-10-06
- https://dentalsoft.com.ar/ — 2026-10-06
- https://www.denpro.ar/ y https://www.denpro.es/ — 2026-10-06
- https://web.dentaltec.com.ar/mejor-software-odontologico-argentina y /preguntas-frecuentes — 2026-10-06
- https://www.odontomy.com/ — 2026-10-06
- https://www.softwaredentalink.com/, /funcionalidades, /planes — 2026-10-06
- https://www.dentidesk.cl/dentidesk/feature — 2026-10-06
- https://www.nimbo-x.com/soluciones/dentistas — 2026-10-06
- https://ikomdental.com/ — 2026-10-06
- https://odentiva.com/ y /precios/ — 2026-10-06
- https://solutechpanama.com/productos/odentiva — 2026-10-06
- https://agendapro.com/ar y /ar/planes; https://ayuda.agendapro.com/es/articles/5428013-como-configuro-mi-plan-agendapro — 2026-10-06
- https://pro.doctoralia.com/ar/precio y /ar/agenda-doctoralia-para-especialistas — 2026-10-06
- https://www.medicai.com.ar/blog/cuanto-cuesta-software-medico-argentina (precios 13 sistemas, verificado 18/08/2026) — 2026-10-06 *[fuente secundaria, posible conflicto de interés; no usar como respaldo único]*
- https://clinic-cloud.com/tarifas y /software-clinica-dental-programa-odontologico — 2026-10-06
- https://obeliomed.com/gesden-vs-clinic-cloud/ (20/09/2026) — 2026-10-06 *[fuente secundaria, posible conflicto de interés; no usar como respaldo único]*
- https://www.infomedsoftware.com/software/gesden/gesden-one/ y /gesden-g5/ — 2026-10-06
- https://tab32.com/pricing/ y /platform/ (23/04 y 19/05/2026) — 2026-10-06
- https://operatory.app/best-cloud-based-dental-practice-management-software-2026/ (09/06/2026, precios leídos 18/09/2026) — 2026-10-06 *[fuente secundaria, posible conflicto de interés; no usar como respaldo único]*
- https://www.opendental.com/site/fees.html y /site/opendentalcloud.html — 2026-10-06
- https://practicesignal.com/dental/compare/open-dental-vs-curve (20/03/2026) — 2026-10-06 *[fuente secundaria, posible conflicto de interés; no usar como respaldo único]*
- https://gbsystems.com/os/index.htm y https://odontosoft.com/history.htm — 2026-10-06
- https://www.dentincloud.com/pt, /precos, /about — 2026-10-06
- https://dendoo.es/ — 2026-10-06
- https://proclinica.es/especialidades/odontologos — 2026-10-06
- https://mednia.com.ar/ y /facturacion-obras-sociales — 2026-10-06 (referencia médica AR: OS/ARCA/MP)
- https://www.netclinic.mx/ — 2026-10-06 (referencia MX)
