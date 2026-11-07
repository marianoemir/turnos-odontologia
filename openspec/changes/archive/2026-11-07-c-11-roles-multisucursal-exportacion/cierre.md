# Cierre de C-11 roles-multisucursal-exportacion (2026-11-07)

## Estado final
- 49 de 49 tareas marcadas en tasks.md.
- Suite: 639 passed (linea base original: 435). ruff check backend scripts: limpio.
- Alembic head: 007_roles_sucursales.

## Desviaciones registradas
- Tarea 2.5 (verificar esquema y seed por el MCP postgres): el MCP no estaba disponible en el entorno del agente. Se cerro con evidencia equivalente: script de solo lectura (transaccion READ ONLY) corrido por el usuario sobre la base turnos_test el 2026-11-07. Resultado: tablas roles, sucursales y usuarios_sucursal con sus columnas; sucursal_id nullable en profesionales y sillones; 4 claves foraneas con ON DELETE RESTRICT; indices ix_profesionales_sucursal e ix_sillones_sucursal; 4 roles seed con UUID fijos ...0001 a ...0004 (admin, recepcion, odontologo, paciente). La nota de la tarea 12.3 ("la 2.5 queda SIN marcar") quedo desactualizada: la 2.5 se marco despues con esta evidencia.
- Tarea 12.1 esperaba "~540 passed"; el total real es 639.
- openspec validate --strict emite un aviso: el requisito "Importacion asistida desde planilla CSV" de importacion-planilla supera los 500 caracteres (aviso de estilo, no error).

## Deudas conocidas
- El rollback de la migracion 007 borra las tablas nuevas sin preservar datos de roles ni sucursales (aceptado en D4).
- El 422 de periodo del export devuelve detail como string, distinto del formato de RBAC (detail.causa).
- El except SQLAlchemyError por fila en la importacion no distingue errores de datos de errores de conexion: un fallo real de base se reporta como rechazo.
- DIAS_MAXIMOS = 30 y timedelta(days=29) en export/service.py expresan la misma regla por separado.
- El mensaje del CLI sin base solo se probo con una fabrica simulada, no con DATABASE_URL ausente de verdad.
- La mutacion (f) del grupo 9 se hizo con un filtro por dni, porque Paciente no tiene columna temporal.
- Los tests que mandan X-Sucursal-Id no ejercitan la ruta real de get_sucursal_session (sesion propia).
- Mutaciones del agente no repetidas por el usuario: evidencia solo por informe del agente.

## Pendiente fuera del change
- Rev. 5 de documentacion en rama aparte desde main: reaplicar el cambio de CHANGES.md guardado en c11-changes.patch y corregir el scope de C-22, que contradice D6b (permisos editables, preview de importacion, selector de sucursal global, selector de usuarios).
- Avisar a Andres (C-13/C-14): el cliente HTTP debe enviar X-Actor-Rol y, opcionalmente, X-Sucursal-Id.