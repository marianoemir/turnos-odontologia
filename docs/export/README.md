# Exportación de datos (`GET /export`)

Endpoint solo-admin que descarga el paquete completo de datos del
consultorio en un único archivo. Contrato de salida verificado por
`backend/tests/test_export_api.py`.

## Formato

- JSON UTF-8 sin BOM, `indent=2`, extensión `.json`, `Content-Disposition: attachment; filename="export-turnos-YYYYMMDD-HHMMSS.json"`.

## Versión del contrato

- `contrato_version = "1.0"`.

## Período

- `hasta` = día local actual, `desde` = `hasta − 29` (30 días inclusive), acotable con `?desde=`/`?hasta=`, máximo 30 días.

## Claves del envelope

- `pacientes`, `historia_clinica{historias,entradas,odontogramas,planes,items}`, `agenda{turnos,profesionales,sillones,prestaciones}`, `caja{cajas,cobros,liquidaciones_os}`.

## Filtrado

- `agenda.turnos` por `inicio`, `caja.cajas` por `fecha`, `cobros` y `liquidaciones_os` por `creado_en`; pacientes y HC completos.

## Serialización

- UUID y fechas ISO-8601 con offset; montos en centavos enteros.

## Tamaño esperado

- Menor a 10 MB, sin comprimir.

## Exclusiones

- `SECRET_KEY`, `MP_ACCESS_TOKEN`, certificados ARCA y todo token/credencial o variable de entorno quedan fuera del archivo.

## Autorización

- Solo `admin`; 422 para rango mayor a 30 días o invertido.

## Aviso de seguridad

- **el rol viaja en el header `X-Actor-Rol`, que cualquier cliente puede falsificar; hasta que exista login real, `GET /export` no es un control de seguridad y solo debe usarse con datos ficticios.**
