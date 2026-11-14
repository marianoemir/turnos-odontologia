# frontend-admin Specification

## Purpose
TBD - created by archiving change c-22-frontend-admin-roles-export. Update Purpose after archive.

## Requirements

### Requirement: Roles en solo lectura con edición de la descripción

El frontend SHALL ofrecer `/admin/roles` a la persona con rol `admin`, con el listado de roles y sus permisos en solo lectura y la edición únicamente de `descripcion`. La pantalla SHALL NOT ofrecer controles para cambiar el `nombre`, desactivar un rol ni crear uno, y SHALL enviar en `PATCH /roles/{id}` sólo el campo `descripcion`.

#### Scenario: Listado de roles con sus permisos

- **GIVEN** una sesión de `admin` y un backend que responde `GET /roles` con los roles canónicos y sus permisos
- **WHEN** se abre `/admin/roles`
- **THEN** la pantalla lista cada rol con su nombre, descripción, estado y permisos, sin controles de edición de nombre ni de desactivación

#### Scenario: Editar la descripción envía sólo ese campo

- **GIVEN** la pantalla de roles cargada
- **WHEN** el administrador guarda una descripción nueva para un rol
- **THEN** el cliente envía `PATCH /roles/{id}` con un cuerpo que contiene únicamente `descripcion`, sin campos nulos ni adicionales, y el listado se refresca

#### Scenario: Rol canónico protegido

- **GIVEN** la pantalla de roles cargada y un backend que responde 409 con `detail.causa` igual a `rol_canonico_protegido`
- **WHEN** el administrador intenta guardar un cambio sobre ese rol
- **THEN** la pantalla muestra un mensaje de que el rol canónico está protegido, conserva la descripción anterior y no cierra la sesión

### Requirement: Sucursales y asignaciones usuario–sucursal

El frontend SHALL ofrecer `/admin/sucursales` a la persona con rol `admin`, con alta y edición de sucursales, baja lógica mediante `activo`, y alta y edición de asignaciones usuario–sucursal con `usuario` como texto libre. Los conflictos de dominio SHALL mostrarse junto al campo que los causa y la pantalla SHALL NOT ofrecer una gestión de usuarios propia.

#### Scenario: Alta de sucursal

- **GIVEN** la pantalla de sucursales cargada
- **WHEN** el administrador completa un nombre válido y guarda
- **THEN** el cliente envía `POST /sucursales`, la nueva sucursal aparece en el listado y se muestra una confirmación

#### Scenario: Nombre de sucursal duplicado

- **GIVEN** un backend que responde 409 con `detail.causa` igual a `duplicate_nombre_sucursal`
- **WHEN** el administrador guarda una sucursal con un nombre ya existente
- **THEN** el error se muestra asociado al campo `nombre` y el formulario conserva lo escrito

#### Scenario: Baja lógica con confirmación

- **GIVEN** una sucursal activa en el listado
- **WHEN** el administrador la desactiva
- **THEN** la pantalla pide confirmación antes de enviar `PATCH /sucursales/{id}` con `activo` en `false` y no borra la sucursal

#### Scenario: Alta de asignación usuario–sucursal

- **GIVEN** roles y sucursales cargados en la pantalla
- **WHEN** el administrador indica un usuario como texto libre, un rol y una sucursal y guarda
- **THEN** el cliente envía `POST /usuarios-sucursal` con `usuario`, `rol_id` y `sucursal_id` y la asignación aparece en el listado

#### Scenario: Asignación duplicada

- **GIVEN** un backend que responde 409 con `detail.causa` igual a `duplicate_usuario_sucursal`
- **WHEN** el administrador repite una combinación usuario–sucursal
- **THEN** el error se muestra asociado al campo `usuario` y no se agrega una fila al listado

### Requirement: Sucursal activa de solo lectura

El frontend SHALL mostrar a la persona con rol `admin` la sucursal activa tomada de la sesión, resolviendo su nombre contra `GET /sucursales`, y SHALL NOT permitir cambiarla sin iniciar sesión de nuevo ni enviar `X-Sucursal-Id`.

#### Scenario: Muestra la sucursal del token

- **GIVEN** una sesión de `admin` con `sucursalId` de una sucursal existente
- **WHEN** se abre `/admin`
- **THEN** la pantalla muestra el nombre de esa sucursal como sucursal activa, sin ningún control que la modifique

#### Scenario: Cambiar de sucursal requiere volver a entrar

- **GIVEN** la sucursal activa visible
- **WHEN** el administrador elige «Cambiar de sucursal»
- **THEN** el frontend cierra la sesión y navega a `/login`, y ninguna request lleva `X-Sucursal-Id`

#### Scenario: Sesión sin sucursal asociada

- **GIVEN** una sesión de `admin` con `sucursalId` nulo
- **WHEN** se abre `/admin`
- **THEN** la pantalla indica que no hay sucursal asociada y que no se aplica filtro por sucursal

### Requirement: Exportación de datos en un clic

El frontend SHALL ofrecer en `/admin/datos` la descarga de `GET /export` con el contrato de salida visible antes de descargar, período opcional acotado a 30 días y sin conservar el contenido del archivo en la aplicación tras la descarga.

#### Scenario: Contrato visible antes de descargar

- **GIVEN** una sesión de `admin`
- **WHEN** se abre `/admin/datos`
- **THEN** la pantalla declara el formato JSON UTF-8, el período por defecto y máximo de 30 días, los grupos de datos incluidos, las exclusiones de secretos y credenciales y el tamaño esperado, antes de cualquier descarga

#### Scenario: Descarga con el período por defecto

- **GIVEN** la pantalla de datos sin fechas completadas
- **WHEN** el administrador pulsa descargar
- **THEN** el cliente envía `GET /export` sin parámetros de fecha, entrega un archivo con nombre `export-turnos-YYYYMMDD-HHMMSS.json` y no conserva el contenido en la caché de consultas

#### Scenario: Período inválido bloquea la descarga

- **GIVEN** fechas `desde` mayor que `hasta`, o un rango de más de 30 días inclusive
- **WHEN** el administrador intenta descargar
- **THEN** el formulario anuncia el error en el campo y no se envía ninguna request

#### Scenario: Error 422 del servidor

- **GIVEN** un backend que responde 422 por período inválido
- **WHEN** el administrador descarga
- **THEN** la pantalla muestra el error del período, no entrega ningún archivo y conserva la sesión

### Requirement: Importación de planilla sólo documentada

El frontend SHALL presentar en `/admin/datos` el procedimiento de importación como documentación, indicando que se realiza por el CLI `scripts/import_planilla` y que no existe un endpoint, y SHALL NOT ofrecer controles de subida de archivos.

#### Scenario: Procedimiento sin controles de subida

- **GIVEN** una sesión de `admin`
- **WHEN** se abre `/admin/datos`
- **THEN** la pantalla indica que la importación se hace por CLI, nombra `scripts/import_planilla` y la guía `docs/migracion/README.md`, y no contiene ningún campo de carga de archivos

### Requirement: Acceso a administración desde el shell

El shell SHALL mostrar un grupo «Administración» con un enlace a `/admin` únicamente cuando la sesión tiene rol `admin`, sin modificar la navegación de los demás roles.

#### Scenario: El administrador ve el grupo Administración

- **GIVEN** una sesión de `admin` en una ruta interna permitida
- **WHEN** se renderiza el shell
- **THEN** la navegación lateral muestra además de «Operación» un grupo «Administración» cuyo enlace apunta a `/admin`

#### Scenario: Los demás roles no ven el grupo

- **GIVEN** una sesión de `recepcion` o de `odontologo`
- **WHEN** se renderiza el shell
- **THEN** no aparece el grupo «Administración» y la navegación conserva exactamente los cuatro enlaces de «Operación»

### Requirement: La autorización real es del backend

Las pantallas de administración SHALL tratar un 403 del backend como permiso insuficiente conservando la sesión, y el guard de navegación SHALL NOT considerarse un control de seguridad.

#### Scenario: Respuesta 403 en una pantalla de administración

- **GIVEN** una sesión con el guard satisfecho y un backend que responde 403 a una request administrativa
- **WHEN** la pantalla carga sus datos
- **THEN** el frontend conserva la sesión, muestra un mensaje de permiso insuficiente y no presenta datos administrativos
