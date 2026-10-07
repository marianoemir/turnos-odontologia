# Modelo de Datos

Fuente: `docs/discovery/discovery.md` §7 (RN-01..RN-08) + informe D3 (MVP). Alcance de datos del primer change: agenda/turnos; HC/caja/OS = posteriores.

## Dominios

- Agenda/Turnos (primer change): profesionales, sillones/boxes, prestaciones, horarios, bloqueos, turnos.
- Personas: pacientes, odontólogos, recepcionistas (usuarios mínimos).
- Posterior (solo referencia): lista de espera, recordatorios, HC/odontograma, caja/pagos/OS/ARCA, multi-sucursal.

## ERD (textual)

```
Paciente 1—N Turno N—1 Profesional 1—N HorarioAtencion
Prestatción 1—N Turno N—1 SillonBox
Turno N—1 Bloqueo (conflicto, no FK directa — validación por rango)
Turno 1—0/1 ListaEsperaOrigen (posterior)
Profesional N—N SillonBox (uso, no asignación fija — el turno fija la pareja en un intervalo)
```

## Entidades

### Paciente
- Atributos: id (uuid), nombre (text), dni (text, único), contacto (text: teléfono/email), ficticio (bool, siempre true en TP)
- Relaciones: 1—N Turno
- Constraints: dni único; solo datos ficticios
- Índices: dni

### Profesional (Odontólogo)
- Atributos: id, nombre, matrícula (text, ficticia), especialidad (text)
- Relaciones: 1—N HorarioAtencion, 1—N Turno, 1—N Bloqueo
- Constraints: matrícula única (ficticia)
- Índices: id

### Recepcionista (Usuario interno mínimo)
- Atributos: id, nombre, rol='recepcion' (enum: recepcion, odontologo)
- Relaciones: crea Turno (auditoría: creado_por)
- Constraints: rol en enum

### SillonBox (recurso)
- Atributos: id, nombre (ej. "Sillón 1 / Box 2"), activo (bool)
- Relaciones: 1—N Turno
- Constraints: obligatorio en todo turno (RN-03); activo=true para asignar
- Índices: activo

### Prestacion
- Atributos: id, nombre, duracion_min (int > 0, fija en v1)
- Relaciones: 1—N Turno
- Constraints: duracion_min fija en v1 (RN-01)

### HorarioAtencion
- Atributos: id, profesional_id, dia_semana (0-6), desde (time), hasta (time)
- Relaciones: N—1 Profesional
- Constraints: desde < hasta; sin solape entre filas del mismo profesional/día (validación de config)

### Bloqueo
- Atributos: id, profesional_id (nullable: si null = sillón o global), sillon_id (nullable), desde (timestamptz), hasta (timestamptz), motivo
- Relaciones: N—1 Profesional (opcional), N—1 SillonBox (opcional)
- Constraints: desde < hasta; un turno no puede solaparse con un bloqueo aplicable (RN-05)

### Turno (núcleo del primer change)
- Atributos: id, paciente_id, profesional_id, sillon_id (NOT NULL), prestacion_id, inicio (timestamptz), fin (calculado = inicio + duracion_min), estado (enum: pendiente, confirmado, cancelado, atendido, ausente), creado_por
- Relaciones: N—1 Paciente/Profesional/SillonBox/Prestacion
- Constraints:
  - fin = inicio + duración prestación (RN-01)
  - sillon_id NOT NULL (RN-03)
  - sin solape [inicio, fin) con otro turno activo mismo profesional (RN-02 + RN-04 borde)
  - sin solape [inicio, fin) con otro turno activo mismo sillón (RN-03 + RN-04)
  - dentro de HorarioAtencion y no sobre Bloqueo (RN-05)
  - cancelado/ausente no cuentan para solape (RN-06)
  - transición estados RN-08 (ver `05_reglas_de_negocio.md`)
- Índices: (profesional_id, inicio, fin) donde estado en ('pendiente','confirmado'); (sillon_id, inicio, fin) idem; (paciente_id, inicio)

## Seed data inicial

- 2 profesionales ficticios, 2 sillones/boxes, 3 prestaciones (ej. limpieza 30 min, consulta 20 min, conducto 60 min).
- Horarios: Lun–Vie 9–18 por profesional; 1 bloqueo de prueba.
- 3 pacientes ficticios con DNI ficticios.
- 2 turnos pendientes de ejemplo no solapados + 1 cancelado que demuestra RN-06.
