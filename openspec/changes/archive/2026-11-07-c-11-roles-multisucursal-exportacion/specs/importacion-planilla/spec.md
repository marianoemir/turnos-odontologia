# Spec Delta: importacion-planilla

## Purpose

Permite cargar pacientes y profesionales desde una planilla CSV en español, de forma idempotente y con reporte explícito de filas aceptadas, actualizadas y rechazadas.

## ADDED Requirements

### Requirement: Importación asistida desde planilla CSV

El sistema SHALL proveer `scripts/import_planilla.py`, ejecutable con `python -m scripts.import_planilla --archivo <ruta>`, que lea un CSV UTF-8 con cabecera `tipo,nombre,dni,matricula,contacto` (las cuatro primeras columnas son obligatorias en la cabecera y `contacto` es opcional) y cree o actualice registros. `tipo` admite `paciente` o `profesional`; columnas desconocidas (p. ej. `especialidad`) SHALL rechazarse. SHALL admitir `--archivo` y `--dry-run`, y la guía en español SHALL documentar formato, columnas y códigos de salida.

#### Scenario: Alta de pacientes y profesionales desde una planilla válida

- **GIVEN** un CSV con una fila `paciente` con `nombre` y `dni` y una fila `profesional` con `nombre` y `matricula`
- **WHEN** se ejecuta `python -m scripts.import_planilla --archivo planilla.csv`
- **THEN** el script informa `creados = 2`, ambos registros existen en la base con `activo = true` y el paciente importado queda con `ficticio = true`

#### Scenario: Fila con tipo desconocido es rechazada sin abortar el resto

- **GIVEN** un CSV con una fila `tipo = "sillon"` entre filas válidas
- **WHEN** se ejecuta el script
- **THEN** la fila inválida se reporta como rechazada con su número de línea y motivo, las demás se procesan y el código de salida es 1

#### Scenario: Cabecera inválida aborta la importación

- **GIVEN** un CSV sin las columnas obligatorias `tipo`, `nombre`, `dni` y `matricula`
- **WHEN** se ejecuta el script
- **THEN** el script no escribe ningún registro, informa las columnas faltantes y devuelve código de salida 2

#### Scenario: Cabecera sin la columna opcional contacto es válida

- **GIVEN** un CSV con cabecera `tipo,nombre,dni,matricula` (sin `contacto`) y filas válidas
- **WHEN** se ejecuta el script
- **THEN** el script procesa las filas con normalidad, el `contacto` queda sin valor y el código de salida es 0

### Requirement: Idempotencia por clave natural

La importación SHALL ser idempotente: `paciente` se identifica por `dni` y `profesional` por `matricula`. Si la clave natural ya existe, el script SHALL actualizar los campos no clave y contar la fila como `actualizados`, sin crear duplicados. Una clave natural repetida dentro del mismo archivo SHALL rechazar la segunda aparición.

#### Scenario: Re-ejecutar la misma planilla no duplica registros

- **GIVEN** una planilla ya importada con 3 pacientes y 1 profesional
- **WHEN** se ejecuta el script por segunda vez con el mismo archivo
- **THEN** el reporte informa `creados = 0`, `actualizados = 4` y la base sigue teniendo exactamente 3 pacientes y 1 profesional

#### Scenario: La re-ejecución aplica cambios de campos no clave

- **GIVEN** un paciente existente con `dni = "DNI-FICT-001"` y un CSV que trae el mismo DNI con otro `nombre`
- **WHEN** se ejecuta el script
- **THEN** el paciente se actualiza, se cuenta como `actualizado` y no se crea una segunda fila

#### Scenario: Clave repetida dentro del archivo se rechaza

- **GIVEN** un CSV con dos filas `paciente` con el mismo `dni`
- **WHEN** se ejecuta el script
- **THEN** la primera fila se procesa, la segunda se rechaza con motivo de clave duplicada en el archivo y el código de salida es 1

### Requirement: Reporte de errores parciales y modo simulación

El script SHALL informar un resumen con `creados`, `actualizados` y `rechazados` por tipo, y SHALL listar cada rechazo con número de línea y motivo. Un rechazo no SHALL revertir las filas ya procesadas. El servicio SHALL recibir la sesión inyectada y no SHALL confirmar la transacción externa: el aislamiento es por savepoint y el commit queda en quien invoca. Con `--dry-run` SHALL calcular el mismo resumen sin escribir en la base.

#### Scenario: Error parcial conserva las filas válidas

- **GIVEN** un CSV con dos filas válidas y una fila de paciente sin `dni`
- **WHEN** se ejecuta el script
- **THEN** las dos filas válidas quedan persistidas, la inválida se reporta con línea y motivo, y el código de salida es 1

#### Scenario: Dry-run no escribe en la base

- **GIVEN** una base sin los registros de la planilla
- **WHEN** se ejecuta `python -m scripts.import_planilla --archivo planilla.csv --dry-run`
- **THEN** el resumen informa las filas que se crearían y la base queda sin cambios
