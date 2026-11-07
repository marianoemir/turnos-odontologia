# Importación asistida desde planilla CSV

Carga pacientes y profesionales desde un archivo CSV con
`scripts/import_planilla.py`, de forma idempotente y con reporte de
rechazos. Verificado por `backend/tests/test_import_planilla.py`.

> ⚠️ **Solo se cargan datos ficticios o de prueba.** Nunca cargues datos
> reales de pacientes por esta vía. Los pacientes importados quedan con
> `ficticio=true` en la base.

## Formato CSV

- Columnas `tipo,nombre,dni,matricula,contacto` (sin `especialidad`).
- `tipo`, `nombre`, `dni` y `matricula` son obligatorias en la cabecera; `contacto` es opcional.
- Columnas obligatorias por tipo: `tipo=paciente` exige `nombre` y `dni` (`matricula` vacía); `tipo=profesional` exige `nombre` y `matricula` (`dni` y `contacto` vacíos).
- Caracteres especiales: los campos con coma se entrecomillan según RFC 4180 y se leen con `csv.DictReader`.
- Una cabecera con columnas desconocidas (por ejemplo `especialidad`, que no existe en el modelo) se rechaza como cabecera inválida.

## Ejemplo de ejecución

```powershell
python -m scripts.import_planilla --archivo docs/migracion/ejemplo_planilla.csv
```

- `--dry-run` simula la importación sin escribir: calcula el mismo resumen y no toca la base.
- `--reporte <ruta.csv>` escribe además un CSV de rechazos con `nro_linea,motivo`.

## Códigos de salida

- `0`: todo procesado.
- `1`: al menos un rechazo (cada rechazo indica su línea y motivo).
- `2`: cabecera inválida o error de archivo/base (nada escrito).

## Idempotencia

- Claves naturales: `paciente` por `dni`, `profesional` por `matricula`.
- Si la clave ya existe, se actualizan los campos no clave (`nombre`, `contacto` en paciente, `activo=true`) y la fila cuenta como actualizada; nunca se duplica.
- Una clave repetida **dentro del mismo archivo** rechaza su segunda aparición.
- Re-ejecutar la misma planilla es seguro: `creados=0` y `actualizados=N`.

## Qué hacer ante rechazos

- Cada rechazo se informa con su número de línea y motivo; las filas válidas ya procesadas **no** se revierten.
- Corregí las filas indicadas en la planilla y volvé a ejecutar: la idempotencia hace el resto sin duplicar lo ya cargado.
