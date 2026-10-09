# catalogo-recursos

## Purpose

Provee el catálogo de recursos que los turnos referencian (pacientes, profesionales, sillones, prestaciones, horarios y bloqueos) con integridad a nivel de base de datos y un seed ficticio reproducible, para que la creación de turnos valide solapes, horarios y bloqueos sin redefinir el dominio.

## Requirements

### Requirement: Paciente con DNI único y datos ficticios

El sistema SHALL persistir pacientes con nombre, dni único, contacto en texto libre y marca de dato ficticio; un dni duplicado SHALL ser rechazado por la base de datos.

#### Scenario: Alta de paciente válida (happy-path)

- **Dado** un catálogo vacío con la revisión 001 aplicada
- **Cuando** se persiste un paciente con dni ficticio no existente
- **Entonces** el paciente queda guardado y es recuperable por su dni

#### Scenario: DNI duplicado rechazado (business-error)

- **Dado** un paciente existente con dni `DNI-FICT-001`
- **Cuando** se intenta persistir otro paciente con el mismo dni
- **Entonces** la base de datos rechaza la inserción por violación de unicidad

### Requirement: Profesional con matrícula única

El sistema SHALL persistir profesionales con nombre y matrícula única ficticia; una matrícula duplicada SHALL ser rechazada por la base de datos.

#### Scenario: Alta de profesional válida (happy-path)

- **Dado** un catálogo vacío con la revisión 001 aplicada
- **Cuando** se persiste un profesional con matrícula ficticia no existente
- **Entonces** el profesional queda guardado y es recuperable por su matrícula

#### Scenario: Matrícula duplicada rechazada (business-error)

- **Dado** un profesional existente con matrícula `MAT-FICT-001`
- **Cuando** se intenta persistir otro profesional con la misma matrícula
- **Entonces** la base de datos rechaza la inserción por violación de unicidad

### Requirement: Prestación con duración fija mayor a cero

El sistema SHALL exigir `duracion_min` entero mayor a cero a nivel de base de datos (RN-AG-01); valores cero o negativos SHALL ser rechazados.

#### Scenario: Prestación válida (happy-path)

- **Dado** la revisión 001 aplicada
- **Cuando** se persiste una prestación con `duracion_min` 30
- **Entonces** la prestación queda guardada con su duración

#### Scenario: Duración no positiva rechazada (business-error)

- **Dado** la revisión 001 aplicada
- **Cuando** se intenta persistir una prestación con `duracion_min` 0 o negativo
- **Entonces** la base de datos rechaza la inserción por CHECK

### Requirement: Sillón con estado activo consultable

El sistema SHALL persistir sillones con nombre y flag `activo` (default true) e índice sobre `activo`; la desactivación SHALL ser un cambio de estado, nunca un borrado físico cuando el recurso tiene historia (RN-AG-03, soft).

#### Scenario: Sillón activo por defecto (happy-path)

- **Dado** la revisión 001 aplicada
- **Cuando** se persiste un sillón sin indicar `activo`
- **Entonces** queda guardado con `activo` en true

#### Scenario: Listado de sillones activos (happy-path)

- **Dado** sillones activos e inactivos persistidos
- **Cuando** se consultan los sillones activos
- **Entonces** solo se devuelven los que tienen `activo` en true

### Requirement: Horario de atención válido y sin solape de configuración

El sistema SHALL exigir `desde < hasta`, `dia_semana` en 0–6 (convención Python `weekday()`: 0=lunes) y rechazar filas solapadas del mismo profesional y día; la adyacencia exacta (`hasta == desde` de otra fila) SHALL ser permitida como borde no-solapado.

#### Scenario: Horario válido (happy-path)

- **Dado** un profesional existente sin horarios
- **Cuando** se persiste un horario Lun–Vie 9–18 válido
- **Entonces** el horario queda guardado

#### Scenario: Horario con desde >= hasta rechazado (business-error)

- **Dado** un profesional existente
- **Cuando** se intenta persistir un horario con `desde` igual o posterior a `hasta`
- **Entonces** la base de datos rechaza la inserción por CHECK

#### Scenario: Adyacencia permitida, solape rechazado (edge-case)

- **Dado** un horario existente de 9:00 a 13:00 para un profesional un lunes
- **Cuando** se persiste una fila adyacente de 13:00 a 18:00 del mismo profesional y día
- **Entonces** es aceptada; y cuando se intenta una fila solapada de 12:00 a 14:00 entonces es rechazada

### Requirement: Bloqueo con rango válido y aplicabilidad definida

El sistema SHALL exigir `desde < hasta` con zona horaria y aplicar la matriz: solo-profesional, solo-sillón, global (ambos null) y pareja concreta (ambos no-null); `motivo` es obligatorio. Un intervalo de turno SHALL considerarse bloqueado cuando intersecta en `[inicio,fin)` un bloqueo aplicable (RN-AG-05).

#### Scenario: Bloqueo global válido (happy-path)

- **Dado** la revisión 001 aplicada
- **Cuando** se persiste un bloqueo con ambos ids en null, rango válido y motivo
- **Entonces** el bloqueo queda guardado como aplicable a todo turno intersectado

#### Scenario: Bloqueo con rango invertido rechazado (business-error)

- **Dado** la revisión 001 aplicada
- **Cuando** se intenta persistir un bloqueo con `desde` posterior a `hasta`
- **Entonces** la base de datos rechaza la inserción por CHECK

#### Scenario: Aplicabilidad por matriz (edge-case)

- **Dado** un bloqueo solo-sillón sobre el sillón A y un turno candidato en el sillón B dentro del mismo rango
- **Cuando** se evalúa si el bloqueo aplica al turno
- **Entonces** no aplica; y cuando el turno candidato usa el sillón A en rango intersectado entonces sí aplica

### Requirement: Seed ficticio reproducible del catálogo

Con `SEED_FICTICIO=true` el sistema SHALL sembrar exactamente 2 profesionales, 2 sillones, 3 prestaciones (20/30/60 min), horarios Lun–Vie 9–18 por profesional, 1 bloqueo de prueba y 3 pacientes con DNI ficticios; el seed SHALL ser idempotente y SHALL NOT incluir turnos (pertenecen a C-03).

#### Scenario: Seed carga el catálogo (happy-path)

- **Dado** una base vacía con la revisión 001 aplicada
- **Cuando** se ejecuta el seed con `SEED_FICTICIO=true`
- **Entonces** existen 2 profesionales, 2 sillones, 3 prestaciones, horarios Lun–Vie por profesional, 1 bloqueo y 3 pacientes

#### Scenario: Seed idempotente (edge-case)

- **Dado** una base ya sembrada por el seed
- **Cuando** se ejecuta el seed por segunda vez
- **Entonces** los conteos no cambian y no hay duplicados por dni, matrícula o nombre de recurso
