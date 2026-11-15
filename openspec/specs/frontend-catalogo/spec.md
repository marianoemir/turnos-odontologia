# frontend-catalogo Specification

## Purpose

Pantallas internas de administración del catálogo (pacientes, profesionales, sillones, prestaciones, horarios y bloqueos) que consumen los endpoints de C-12 con los componentes, formularios y sesión ya entregados por C-13/C-14.

## Requirements

### Requirement: Secciones de catálogo bajo el shell con la matriz de navegación vigente

El frontend SHALL exponer `/catalogo/pacientes`, `/catalogo/profesionales`, `/catalogo/sillones`, `/catalogo/prestaciones`, `/catalogo/horarios` y `/catalogo/bloqueos` como rutas internas dentro del shell, y SHALL aplicar la matriz de `frontend-sesion` sin inventar un guard propio.

#### Scenario: Recepción navega una sección de catálogo

- **WHEN** una sesión `recepcion` abre `/catalogo/pacientes`
- **THEN** la pantalla se presenta dentro del shell con su título y contenido

#### Scenario: Rol sin acceso es redirigido con aviso

- **WHEN** una sesión `odontologo` o `admin` abre una ruta de `/catalogo/*`
- **THEN** el frontend redirige a `/agenda` con el aviso de permiso insuficiente y no realiza requests de catálogo

#### Scenario: Ruta de catálogo no declarada

- **WHEN** se navega a `/catalogo/inexistente`
- **THEN** se muestra la pantalla de no encontrado dentro del shell sin pantalla en blanco

### Requirement: Gestión de pacientes con búsqueda y error de DNI duplicado en campo

El frontend SHALL listar pacientes con búsqueda por nombre o dni (`?q=`), paginación y orden del backend, y SHALL ofrecer alta y edición con `nombre`, `dni` y `contacto`; un 409 `duplicate_dni` SHALL mostrarse como error del campo `dni` y un 422 SHALL proyectarse a sus campos.

#### Scenario: Alta de paciente exitosa

- **WHEN** recepción envía un alta con nombre, dni y contacto ficticios válidos
- **THEN** la API responde 201, la tabla se actualiza y se anuncia la confirmación

#### Scenario: DNI duplicado muestra error en el campo

- **WHEN** el backend responde 409 con causa `duplicate_dni` al alta o la edición
- **THEN** el formulario conserva los datos y muestra el detalle en el campo `dni` con `aria-invalid`

#### Scenario: Búsqueda filtra por nombre o dni

- **WHEN** se escribe un término en el buscador
- **THEN** la tabla pide `GET /pacientes` con ese `q` y muestra los resultados con su paginación

### Requirement: Gestión de profesionales con toggle de activo confirmado

El frontend SHALL listar, crear y editar profesionales (`nombre`, `matricula`) y SHALL cambiar `activo` solo tras confirmación explícita; una matrícula duplicada SHALL mostrarse como error del campo `matricula`.

#### Scenario: Alta y edición de profesional

- **WHEN** se envía un alta o edición con nombre y matrícula válidos
- **THEN** el sistema persiste el cambio, invalida la consulta y muestra la confirmación

#### Scenario: Desactivar profesional pide confirmación

- **WHEN** se acciona el toggle de `activo` sobre un profesional
- **THEN** se abre un modal de confirmación y solo al confirmar se envía el `PATCH`; al cancelar no hay request

#### Scenario: Matrícula duplicada en campo

- **WHEN** el backend responde 409 con causa `duplicate_matricula`
- **THEN** el error se muestra en el campo `matricula` sin cerrar el formulario

### Requirement: Gestión de sillones con aviso de conservación de turnos

El frontend SHALL listar y crear sillones y SHALL cambiar `activo` solo tras confirmación; la pantalla SHALL avisar que desactivar no borra turnos existentes y un nombre duplicado SHALL mostrarse en el campo `nombre`.

#### Scenario: Desactivar sillón pide confirmación y avisa que conserva turnos

- **WHEN** se acciona el toggle de `activo` sobre un sillón
- **THEN** el modal de confirmación advierte que los turnos existentes se conservan y solo al confirmar se envía el `PATCH`

#### Scenario: Nombre de sillón duplicado en campo

- **WHEN** el backend responde 409 con causa `duplicate_nombre_sillon`
- **THEN** el error se muestra en el campo `nombre` con `aria-invalid`

### Requirement: Gestión de prestaciones con duración validada en cliente

El frontend SHALL impedir el envío con `duracion_min` no entero positivo antes de llamar a la API y SHALL proyectar el 422 del servidor al campo; un 409 con causa `duplicate_nombre_prestacion` SHALL mostrarse en el campo `nombre`.

#### Scenario: Duración inválida bloquea el submit

- **WHEN** se intenta enviar una prestación con `duracion_min` cero, negativo o no numérico
- **THEN** no se realiza ninguna request y el campo muestra el error accesible

#### Scenario: Alta de prestación válida

- **WHEN** se envía nombre y `duracion_min` entero mayor que cero
- **THEN** la prestación se persiste, la tabla se actualiza y se anuncia la confirmación

### Requirement: Editor de horarios con validación de rango y solape

El frontend SHALL editar franjas por profesional y día con validación cliente `desde < hasta`, y SHALL mostrar el 409 `solape_horario` del backend como error del formulario sin cerrar el editor.

#### Scenario: Rango invertido bloquea el envío en cliente

- **WHEN** se intenta guardar un horario con `desde` mayor o igual que `hasta`
- **THEN** no se realiza ninguna request y el campo `hasta` muestra el error

#### Scenario: Solape del backend se muestra sin perder datos

- **WHEN** el backend responde 409 con causa `solape_horario`
- **THEN** el editor conserva los valores y muestra el detalle junto a los campos de rango

### Requirement: Gestión de bloqueos con alta combinable y eliminación confirmada

El frontend SHALL crear bloqueos con profesional y/o sillón (incluye global con ambos nulos), rango `desde < hasta` con zona horaria y `motivo`, SHALL listarlos ordenados por `(desde, id)` y SHALL eliminarlos solo tras confirmación.

#### Scenario: Alta de bloqueo global

- **WHEN** se envía un bloqueo sin profesional ni sillón, con rango válido con timezone y motivo
- **THEN** se persiste, el listado se actualiza y se anuncia la confirmación

#### Scenario: Rango inválido bloquea el envío en cliente

- **WHEN** se intenta guardar un bloqueo con `desde` posterior o igual a `hasta`, o con datetimes sin zona horaria
- **THEN** no se realiza ninguna request y los campos de rango muestran el error

#### Scenario: Eliminar bloqueo pide confirmación

- **WHEN** se acciona eliminar sobre un bloqueo
- **THEN** se abre un modal de confirmación y solo al confirmar se envía el `DELETE`; el registro desaparece del listado

### Requirement: Invalidación de consultas tras cada mutación sin optimistic update

El frontend SHALL invalidar las consultas del recurso afectado después de cada mutación exitosa y SHALL NOT aplicar optimistic update sobre datos del catálogo.

#### Scenario: Mutación refresca su listado

- **WHEN** una mutación de pacientes, profesionales, sillones, prestaciones, horarios o bloqueos responde con éxito
- **THEN** la consulta de ese recurso se invalida y la pantalla vuelve a pedir datos actuales al backend

#### Scenario: Sin actualización optimista ante validación del servidor

- **WHEN** una mutación todavía no respondió o fue rechazada con 409 o 422
- **THEN** la tabla conserva los datos previos sin mostrar valores no confirmados
