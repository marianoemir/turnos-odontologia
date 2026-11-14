# frontend-foundation Specification

## Purpose
Establece la base ejecutable y verificable del frontend: shell y ruteo de la aplicación, contratos de
datos espejo de la API, un cliente HTTP que traduce los errores del backend a errores de dominio,
identidad por cabeceras, distribución estática en contenedor y los gates que impiden que esa base se
degrade.

## Requirements

### Requirement: Shell interno con navegación y sistema visual aprobado

El sistema SHALL presentar toda ruta interna dentro de un shell con navegación lateral y topbar,
aplicando los valores visuales del sistema de diseño aprobado del proyecto en lugar de los del
scaffold, y SHALL colapsar la navegación a una franja compacta en viewports de hasta 46rem.

#### Scenario: Shell en escritorio con sistema visual aplicado

- **Dado** (GIVEN) la aplicación cargada en un viewport de 1440×900
- **Cuando** (WHEN) se abre la ruta `/agenda`
- **Entonces** (THEN) se muestra el shell con la navegación lateral del sistema de diseño (grupos Operación: Agenda, Pacientes, Sillones, Caja), la topbar con el título de la pantalla y el nombre de marca del sistema visual, y el fondo de página corresponde al token de superficie del sistema aprobado y no al color por defecto del scaffold

#### Scenario: Fallo de render contenido por el límite de error

- **Dado** (GIVEN) el shell renderizado con una ruta interna cuyo componente lanza un error de render
- **Cuando** (WHEN) React propaga el error
- **Entonces** (THEN) el límite de error muestra un mensaje de fallback dentro del shell, la navegación lateral sigue visible y operable, y la aplicación no queda en pantalla en blanco

#### Scenario: Navegación compacta en viewport angosto

- **Dado** (GIVEN) la aplicación cargada en un viewport de 390×844
- **Cuando** (WHEN) se abre una ruta interna
- **Entonces** (THEN) la navegación se presenta como franja compacta, el contenido principal sigue accesible y no aparece scroll horizontal en la página

### Requirement: Rutas declaradas para todas las capabilities

El sistema SHALL declarar las rutas `/`, `/turnos/nuevo`, `/agenda`, `/catalogo/*`, `/lista-espera`,
`/hc/:pacienteId`, `/caja`, `/admin`, `/reservar/:profesional`, `/confirmar/:token` y
`/cancelar/:token`, y SHALL resolver cada una a una pantalla registrada.

#### Scenario: Cada ruta declarada resuelve a su pantalla

- **Dado** (GIVEN) la aplicación cargada
- **Cuando** (WHEN) se navega a cada una de las rutas declaradas
- **Entonces** (THEN) cada una resuelve a su pantalla registrada, y las rutas con parámetro exponen el valor del segmento (`pacienteId`, `profesional`, `token`) a la pantalla

#### Scenario: Ruta no declarada o parámetro ausente

- **Dado** (GIVEN) la aplicación cargada
- **Cuando** (WHEN) se navega a un path que no está en la tabla de rutas, o a una ruta con parámetro cuyo segmento falta
- **Entonces** (THEN) se muestra la pantalla de no encontrado dentro del shell, la navegación sigue operable y no se produce una pantalla en blanco ni un error no capturado

#### Scenario: Rutas públicas del paciente sin navegación interna

- **Dado** (GIVEN) un visitante que no opera la agenda interna
- **Cuando** (WHEN) abre `/reservar/:profesional`, `/confirmar/:token` o `/cancelar/:token`
- **Entonces** (THEN) la pantalla se presenta sin la navegación interna del shell, de modo que las capabilities administrativas no se ofrecen desde una ruta pública

### Requirement: Contratos de datos espejo de la API

El sistema SHALL tipar `Paciente`, `Profesional`, `SillonBox`, `Prestacion`, `HorarioAtencion`,
`Bloqueo` y `Turno` con exactamente los campos, nulabilidad y opcionalidad que exponen los schemas de
la API, y SHALL tipar `EstadoTurno` como la unión de los estados admitidos por el dominio.

#### Scenario: Tipos con los campos y la nulabilidad del schema

- **Dado** (GIVEN) los schemas de lectura de catálogo y de turno del backend
- **Cuando** (WHEN) se compara cada tipo del frontend contra su schema
- **Entonces** (THEN) coinciden campo por campo, incluidas las propiedades nulas y las opcionales, sin campos inventados ni omitidos

#### Scenario: Discrepancia de contrato detectada en compilación

- **Dado** (GIVEN) un tipo del frontend al que le falta un campo obligatorio del schema, o que lo declara con otro tipo
- **Cuando** (WHEN) el código que consume ese campo se compila
- **Entonces** (THEN) la compilación de tipos falla, y no existe una vía de escape con firma de índice ni con tipo comodín que la silencie

#### Scenario: Estado de turno fuera de la unión

- **Dado** (GIVEN) `EstadoTurno` como unión de los cinco estados admitidos y un mapeo estado→etiqueta exhaustivo
- **Cuando** (WHEN) se agrega un estado a la unión sin extender el mapeo
- **Entonces** (THEN) la compilación falla por rama no cubierta

### Requirement: Cliente HTTP con errores de dominio normalizados

El sistema SHALL exponer un cliente HTTP tipado que, ante una respuesta de error del backend,
devuelva un único error de dominio con la causa y el detalle legibles, sin usar tipo comodín, y que
SHALL aplicar timeout y cancelación por aborto a toda request.

#### Scenario: Conflicto de agenda traducido a error de dominio

- **Dado** (GIVEN) una request interna que el backend rechaza con 409 y un cuerpo de conflicto con causa y detalle
- **Cuando** (WHEN) el cliente procesa la respuesta
- **Entonces** (THEN) devuelve un error de dominio con la causa del conflicto (`profesional`, `sillon`, `horario` o `bloqueo`) y el detalle del backend, y no un valor de éxito

#### Scenario: Las cuatro formas de error del backend convergen en el mismo tipo

- **Dado** (GIVEN) respuestas de error del backend en sus cuatro formas: conflicto con objeto de causa y detalle, error de recurso o de dominio con detalle textual, error de validación con lista de campos, y error de rol o sucursal con objeto de causa y detalle
- **Cuando** (WHEN) el cliente procesa cada una
- **Entonces** (THEN) las cuatro producen el mismo tipo de error de dominio, conservando el código de estado, la causa cuando existe y, para el error de validación, la lista de campos con su ubicación y mensaje, sin `any` en ninguna rama

#### Scenario: Respuesta que no es JSON, timeout o aborto

- **Dado** (GIVEN) una respuesta con cuerpo vacío o que no es JSON, o una request que supera el timeout o se aborta
- **Cuando** (WHEN) el cliente la procesa
- **Entonces** (THEN) devuelve un error de dominio de red o de timeout con un mensaje legible y nunca propaga una excepción sin capturar

### Requirement: Identidad por cabeceras en las requests internas
El sistema SHALL eliminar, aun cuando el llamador las suministre por request y sin distinguir mayúsculas/minúsculas, `X-Actor-Rol`, `X-Actor-Usuario`, `X-Sucursal-Id` y todo `Authorization` antes de armar las cabeceras. En una request interna que requiera identidad con sesión válida SHALL agregar exclusivamente `Authorization: Bearer <token>` derivado de esa sesión; en una request pública SHALL no agregar identidad. Asimismo SHALL retirar el valor por defecto `recepcion` de su comportamiento.

#### Scenario: Login de API no colisiona con la ruta SPA

- **Dado** (GIVEN) que `/login` está reservado a la ruta de login de la SPA
- **Cuando** (WHEN) el formulario solicita autenticación
- **Entonces** (THEN) envía `POST /api/login`, y el proxy/rewrite same-origin lo reenvía internamente como `POST /login` a FastAPI sin exponer ni convertir `/login` en una ruta de API

#### Scenario: La configuración no permite salir de `/api`

- **Dado** (GIVEN) cualquier valor de build para `VITE_API_BASE_URL`
- **Cuando** (WHEN) el cliente calcula la base para una request de API
- **Entonces** (THEN) usa exclusivamente `/api` o una variante relativa normalizada que permanezca bajo `/api`
- **Y** (AND) un valor vacío, absoluto, protocol-relative, de otro origen o relativo fuera de `/api` se normaliza a `/api`, sin que el navegador pueda enviar tráfico API fuera del origen actual

#### Scenario: Rol por defecto en ausencia de selección

- **Dado** (GIVEN) que no existe una sesión válida en el cliente
- **Cuando** (WHEN) se intenta acceder a una ruta interna protegida
- **Entonces** (THEN) el cliente no asume `recepcion` ni inventa otro rol, no envía las cabeceras transitorias y redirige a la persona al login antes de realizar la request protegida

#### Scenario: Rol no admitido no se envía

- **Dado** (GIVEN) una sesión cuyo token no puede usarse o una respuesta del backend por permiso insuficiente
- **Cuando** (WHEN) el cliente arma o procesa una request protegida
- **Entonces** (THEN) no envía `X-Actor-Rol` ni ningún rol elegido por la interfaz y, si el backend responde 403, conserva la sesión y devuelve un error de dominio de permiso denegado en lugar de tratarlo como éxito

#### Scenario: Sucursal opcional y rutas públicas

- **Dado** (GIVEN) una sesión con token emitido por `POST /login`, o una request dirigida a una ruta pública del paciente
- **Cuando** (WHEN) el cliente envía la request
- **Entonces** (THEN) una request protegida incluye exclusivamente `Authorization: Bearer <token>` sin `X-Sucursal-Id`, y en `/reservar/:profesional`, `/confirmar/:token` y `/cancelar/:token` no envía token ni cabeceras retiradas y no redirige al login por falta de sesión

#### Scenario: Cabeceras de identidad inyectadas por un llamador no atraviesan el cliente

- **Dado** (GIVEN) una request protegida o pública con `headers` por llamada que incluyen cualquier combinación de mayúsculas/minúsculas de `X-Actor-Rol`, `X-Actor-Usuario`, `X-Sucursal-Id` o `Authorization`
- **Cuando** (WHEN) el cliente construye la request
- **Entonces** (THEN) elimina esas cabeceras inyectadas antes de enviar
- **Y** (AND) sólo agrega `Authorization: Bearer <token>` derivado de la sesión para una request protegida con sesión válida; una request pública no envía ninguna cabecera de identidad

#### Scenario: Prueba de integración del proxy no colisiona con un backend local

- **Dado** (GIVEN) que un Uvicorn u otro proceso legítimo puede estar escuchando en el puerto `8000`
- **Cuando** (WHEN) se ejecuta la prueba de integración del proxy de Vite
- **Entonces** (THEN) levanta su backend falso en un puerto efímero disponible, configura el target del proxy para esa instancia y verifica los rewrites sin ocupar ni depender del puerto `8000`
- **Y** (AND) si falla el setup, su cleanup condicional no intenta cerrar instancias no creadas ni reemplaza el error inicial

### Requirement: Distribución estática del frontend en contenedor

El sistema SHALL construir el frontend como artefacto estático servido por un servidor web en un
contenedor propio, integrado en la composición local, y SHALL resolver las rutas internas y las
llamadas a la API sin depender de configuración de origen cruzado en el backend.

#### Scenario: Composición local sirve la aplicación

- **Dado** (GIVEN) la composición local levantada
- **Cuando** (WHEN) se pide la raíz del servicio web
- **Entonces** (THEN) responde 200 con la aplicación, el título del documento es el nombre de marca del sistema visual y los valores del sistema de diseño se aplican sobre el bundle construido

#### Scenario: Recarga directa y ruteo de la API

- **Dado** (GIVEN) la aplicación servida por el contenedor
- **Cuando** (WHEN) se recarga directamente una ruta interna como `/turnos/nuevo`, o se pide una ruta de la API bajo el prefijo del cliente
- **Entonces** (THEN) la recarga de la ruta interna responde 200 con la aplicación y no un error del servidor web, y la ruta de la API se reenvía al backend en lugar de caer en el fallback de la aplicación

#### Scenario: URL base de la API fijada en el build

- **Dado** (GIVEN) un bundle construido sin indicar explícitamente la URL base de la API
- **Cuando** (WHEN) el cliente arma una request interna
- **Entonces** (THEN) usa el prefijo por defecto y la request se resuelve por el mismo origen, tanto en desarrollo como en el contenedor, sin requerir configuración de origen cruzado en el backend

### Requirement: Gates automáticos de calidad del frontend

El sistema SHALL mantener en verde el lint, la comprobación de tipos, el build de producción y la
suite de tests del frontend, y SHALL ejecutar los cuatro en integración continua con una versión de
Node que satisfaga el mínimo exigido por el bundler.

#### Scenario: Los cuatro gates corren en integración continua

- **Dado** (GIVEN) un cambio propuesto sobre el frontend
- **Cuando** (WHEN) se ejecuta la integración continua
- **Entonces** (THEN) el job del frontend instala dependencias desde el lockfile y ejecuta lint, comprobación de tipos, build y tests, y el job falla si cualquiera de los cuatro falla

#### Scenario: Tipo comodín bloqueado por el gate

- **Dado** (GIVEN) un archivo del frontend que declara un tipo comodín explícito
- **Cuando** (WHEN) se ejecutan el lint o la comprobación de tipos
- **Entonces** (THEN) el gate falla, de modo que la regla queda forzada y no solo documentada

#### Scenario: Versión de Node y lockfile consistentes

- **Dado** (GIVEN) el job de integración continua y el lockfile del frontend
- **Cuando** (WHEN) se instala con la versión de Node declarada
- **Entonces** (THEN) esa versión satisface el mínimo exigido por el bundler y la instalación falla si el lockfile no coincide con el manifiesto de dependencias
