# turnos-odontologia — Base de Conocimiento

Base generada en Mode A (ingest) desde `docs/discovery/discovery.md` + `docs/discovery/informe-discovery.md` + `state.discovery` (2026-10-06). Sin preguntas — dudas en `10_preguntas_abiertas.md`.

## Índice de Archivos

| Archivo | Contenido |
|---------|-----------|
| [01_vision_y_objetivos.md](01_vision_y_objetivos.md) | Propósito, objetivos por actor, alcance v1 + recorte primer change, métricas |
| [02_descripcion_general.md](02_descripcion_general.md) | Stack (profesor: Python+FastAPI+PostgreSQL), arquitectura, integraciones (ninguna en change 1) |
| [03_actores_y_roles.md](03_actores_y_roles.md) | Paciente, Odontólogo, Recepción; RBAC; rutas públicas (ninguna en change 1) |
| [04_modelo_de_datos.md](04_modelo_de_datos.md) | ERD, 8 entidades, constraints de solape, seed ficticio |
| [05_reglas_de_negocio.md](05_reglas_de_negocio.md) | RN-AG-01..05, RN-TU-01..02, RN-ES-01..02 (mapeo RN-01..RN-08) |
| [06_funcionalidades.md](06_funcionalidades.md) | US-001..US-004 (+US-005..007 posteriores) por épica |
| [07_flujos_principales.md](07_flujos_principales.md) | Crear, cancelar/reprogramar, agenda día, lista espera (posterior) |
| [08_arquitectura_propuesta.md](08_arquitectura_propuesta.md) | Patrones, directorios, seguridad, env vars |
| [09_decisiones_y_supuestos.md](09_decisiones_y_supuestos.md) | DD-01..05, SU-01..03 |
| [10_preguntas_abiertas.md](10_preguntas_abiertas.md) | IN-01..02, Q1..Q7 (Q6 resuelta por el profesor) |

## Quick Start para Desarrolladores

1. Entender el dominio → [01](01_vision_y_objetivos.md), [03](03_actores_y_roles.md)
2. Entender los datos → [04](04_modelo_de_datos.md)
3. Entender las reglas → [05](05_reglas_de_negocio.md)
4. Entender la arquitectura → [02](02_descripcion_general.md), [08](08_arquitectura_propuesta.md)
5. Implementar → [07](07_flujos_principales.md), [06](06_funcionalidades.md)
6. Antes de codificar → [10](10_preguntas_abiertas.md) (confirmar Q1 reserva solo-recepción)

## Resumen Ejecutivo

Agenda odontológica que impide dobles reservas por profesional y sillón/box ([inicio,fin), RN-01..RN-08); primer change sin integraciones ni reserva online, solo carga por recepción con datos ficticios. MVP completo (recordatorios, lista de espera, HC, MP, ARCA, OS) queda como changes posteriores.
