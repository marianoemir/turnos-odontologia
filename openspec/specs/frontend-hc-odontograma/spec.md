# frontend-hc-odontograma Specification

## Purpose

Permite a la recepción consultar y actualizar la historia clínica de un paciente desde el frontend, incluyendo cabecera, odontograma FDI, historial por pieza, entradas clínicas y presupuesto de planes de tratamiento, usando solo los contratos vigentes del backend de C-09.

## Requirements

### Requirement: Ruta de historia clínica con identificación de paciente válida

La UI SHALL exponer `/hc/:pacienteId` y SHALL validar que `:pacienteId` sea un UUID antes de consultar recursos clínicos. Con id inválido, SHALL mantener el encabezado `Historia clínica`, mostrar un aviso y no emitir requests clínicos. Con id válido, SHALL mostrar el `paciente_id` como identificador de contexto visible en la pantalla (sin requerir nombre ni DNI).

#### Scenario: Ruta directa con paciente identificado

- **GIVEN** una sesión autenticada con rol `recepcion`
- **WHEN** el usuario navega a `/hc/550e8400-e29b-41d4-a716-446655440000`
- **THEN** la pantalla muestra el encabezado `Historia clínica`, muestra el identificador `550e8400-e29b-41d4-a716-446655440000` y emite requests GET a `/pacientes/550e8400-e29b-41d4-a716-446655440000/historia-clinica`, `/pacientes/550e8400-e29b-41d4-a716-446655440000/odontograma` y `/pacientes/550e8400-e29b-41d4-a716-446655440000/planes-tratamiento`

#### Scenario: Identificador inválido no dispara consultas

- **GIVEN** una sesión autenticada con rol `recepcion`
- **WHEN** el usuario navega a `/hc/pac-1`
- **THEN** la pantalla muestra el encabezado `Historia clínica`, muestra un aviso de identificador de paciente inválido y no emite requests a endpoints de HC, odontograma, planes ni entradas

#### Scenario: Paciente inexistente informado por backend

- **GIVEN** una sesión autenticada con rol `recepcion` y un UUID válido cuyo paciente no existe
- **WHEN** `GET /pacientes/{paciente_id}/historia-clinica` responde HTTP 404 con detalle `paciente no existe: {paciente_id}`
- **THEN** la UI muestra el mensaje de paciente inexistente, no ofrece crear historia clínica y no reintenta automáticamente la consulta fallida

### Requirement: Acceso por ruta según guardia de navegación existente

La UI SHALL delegar el acceso a `/hc/:pacienteId` exclusivamente al guard y `canNavigate` existentes en `auth/navigation.ts`, sin matriz propia ni cambios en ese archivo. Si el guard rechaza la ruta, SHALL redirigir a Agenda y comunicar permiso insuficiente.

#### Scenario: Recepción accede a la ruta de historia clínica

- **GIVEN** una sesión autenticada con rol `recepcion`
- **WHEN** el usuario navega a `/hc/550e8400-e29b-41d4-a716-446655440000`
- **THEN** la ruta resuelve a la pantalla de historia clínica

#### Scenario: Rol sin permiso es redirigido a Agenda

- **GIVEN** una sesión autenticada con rol `odontologo`
- **WHEN** el usuario navega a `/hc/550e8400-e29b-41d4-a716-446655440000`
- **THEN** la UI redirige a `/agenda`, muestra el aviso `Permiso insuficiente.` y no emite requests clínicos

#### Scenario: Respuesta 403 del backend se trata como restricción informada

- **GIVEN** una sesión autenticada en la pantalla de historia clínica con la cabecera ya cargada
- **WHEN** un endpoint clínico responde HTTP 403
- **THEN** la UI muestra un aviso de acceso denegado, mantiene visible la cabecera ya cargada y no reintenta automáticamente la operación denegada

### Requirement: Cabecera de historia clínica consultable y editable

La UI SHALL consultar la HC por paciente y SHALL permitir crearla o actualizar parcialmente solo los campos soportados (`antecedentes`, `alergias`, `observaciones`). SHALL distinguir 404 por HC inexistente de 404 por paciente inexistente según el detalle del backend y SHALL ofrecer la creación únicamente cuando el detalle corresponde a HC inexistente. Ante error de mutación, SHALL preservar el estado previo.

#### Scenario: Paciente con historia clínica existente muestra cabecera

- **GIVEN** un paciente con historia clínica existente devuelta por `GET /pacientes/{paciente_id}/historia-clinica`
- **WHEN** la pantalla carga correctamente
- **THEN** la UI muestra `antecedentes`, `alergias` y `observaciones` en modo lectura con opción de edición

#### Scenario: Paciente existente sin historia clínica permite creación

- **GIVEN** un paciente existente sin historia clínica y `GET /pacientes/{paciente_id}/historia-clinica` responde HTTP 404 con detalle `historia clinica no existe para paciente: {paciente_id}`
- **WHEN** el usuario completa la cabecera y confirma `POST /historias-clinicas`
- **THEN** la UI crea la historia clínica y actualiza la vista con los datos devueltos por el backend

#### Scenario: Respuesta 404 sin detalle reconocible no ofrece crear historia

- **GIVEN** un UUID válido de paciente
- **WHEN** `GET /pacientes/{paciente_id}/historia-clinica` responde HTTP 404 con un detalle que no coincide con ninguno de los mensajes conocidos del backend
- **THEN** la UI muestra el mensaje de recurso inexistente y no ofrece crear historia clínica

#### Scenario: Conflicto de historia duplicada al crear cabecera

- **GIVEN** un usuario que intenta crear la historia clínica de un paciente
- **WHEN** `POST /historias-clinicas` responde HTTP 409 con `detail.causa` igual a `historia_clinica_duplicada`
- **THEN** la UI informa el conflicto, conserva el estado anterior confirmado y no reintenta automáticamente la creación

#### Scenario: Error de validación al actualizar cabecera preserva valores anteriores

- **GIVEN** una historia clínica cargada con valores previos visibles
- **WHEN** el usuario guarda cambios de cabecera y `PATCH /historias-clinicas/{id}` responde HTTP 422
- **THEN** la UI mantiene visibles los valores anteriores, muestra el error devuelto y no aplica actualización optimista

### Requirement: Odontograma FDI de 32 piezas con estado literal

La UI SHALL representar las 32 piezas FDI permanentes (11 a 48) en un `role="grid"` de dos filas: arcada superior `18..11` y `21..28`, arcada inferior `48..41` y `31..38`. Cada pieza SHALL exponer `aria-label` `Pieza <número>, <cuadrante>, estado <estado literal>` (o `sin estado registrado` si no hay observación) y mostrar el estado literal como indicador no cromático. Cuadrantes: 11-18 superior derecha, 21-28 superior izquierda, 31-38 inferior izquierda, 41-48 inferior derecha.

#### Scenario: Estado de texto largo permanece comprensible sin depender del color

- **GIVEN** una pieza cuyo estado literal recibido es un texto largo no catalogado
- **WHEN** la pieza se renderiza en el odontograma
- **THEN** la UI muestra el texto literal truncado visualmente con un estilo neutro, mantiene el texto completo en el `aria-label` y en el panel de pieza, y no depende solo del color para comunicar el estado

#### Scenario: Odontograma sin observaciones muestra estado vacío por pieza

- **GIVEN** `GET /pacientes/{paciente_id}/odontograma` responde 200 con una lista vacía
- **WHEN** la pantalla de historia clínica termina de cargar
- **THEN** la UI muestra las 32 piezas y cada pieza presenta el texto `sin estado registrado` (texto de la UI, no un estado clínico) con `aria-label` `Pieza <número>, <cuadrante>, sin estado registrado`

### Requirement: Navegación del odontograma por teclado con roving tabindex

La UI SHALL usar roving tabindex: solo la pieza activa (inicialmente la 18) tiene `tabIndex=0`, de modo que Tab entra y el siguiente Tab sale sin recorrer las 32 piezas. Izquierda y derecha SHALL mover el foco por la fila y cruzar la línea media (11 con 21, 41 con 31); arriba y abajo SHALL cambiar de arcada conservando la columna; Home y End SHALL ir a la primera y a la última pieza de la fila; en los bordes NO SHALL haber envoltura.

#### Scenario: Flechas llevan el foco a una pieza con aria-label correcto

- **GIVEN** un odontograma cargado con la pieza 16 en estado `caries` y el foco en la pieza 18
- **WHEN** el usuario presiona la flecha derecha dos veces
- **THEN** el foco queda en la pieza 16 y la pieza expone `aria-label` `Pieza 16, superior derecha, estado caries`

#### Scenario: Navegación por teclado alcanza una pieza de otro cuadrante

- **GIVEN** un odontograma cargado con la pieza 38 en estado `sano` y el foco en la pieza 18
- **WHEN** el usuario presiona la flecha abajo y luego End
- **THEN** el foco queda en la pieza 38 y la pieza expone `aria-label` `Pieza 38, inferior izquierda, estado sano`

#### Scenario: Flecha derecha cruza la línea media

- **GIVEN** un odontograma cargado con el foco en la pieza 11
- **WHEN** el usuario presiona la flecha derecha
- **THEN** el foco pasa a la pieza 21

#### Scenario: Flecha abajo conserva la columna

- **GIVEN** un odontograma cargado con el foco en la pieza 11
- **WHEN** el usuario presiona la flecha abajo
- **THEN** el foco pasa a la pieza 41

#### Scenario: Home va a la primera pieza de la fila

- **GIVEN** un odontograma cargado con el foco en la pieza 16
- **WHEN** el usuario presiona Home
- **THEN** el foco pasa a la pieza 18

#### Scenario: End va a la última pieza de la fila

- **GIVEN** un odontograma cargado con el foco en la pieza 16
- **WHEN** el usuario presiona End
- **THEN** el foco pasa a la pieza 28

#### Scenario: Sin envoltura en el borde de la fila

- **GIVEN** un odontograma cargado con el foco en la pieza 18
- **WHEN** el usuario presiona la flecha izquierda
- **THEN** el foco permanece en la pieza 18

#### Scenario: Tab entra al odontograma en la pieza activa

- **GIVEN** un odontograma cargado y el foco en el control inmediatamente anterior al odontograma
- **WHEN** el usuario presiona Tab una vez
- **THEN** el foco pasa a la pieza activa 18 y las otras 31 piezas tienen `tabIndex` igual a -1

#### Scenario: Tab sale del odontograma sin recorrer las piezas

- **GIVEN** un odontograma cargado con el foco en la pieza activa
- **WHEN** el usuario presiona Tab una vez
- **THEN** el foco pasa al siguiente elemento enfocable fuera del odontograma

### Requirement: Selección de pieza y apertura de su panel

Las flechas, Home y End SHALL solo mover el foco. Enter, Espacio y el clic SHALL seleccionar la pieza y abrir su panel, marcando la pieza seleccionada con `aria-selected` igual a `true`.

#### Scenario: Enter sobre una pieza abre su panel

- **GIVEN** un odontograma cargado con el foco en la pieza 16
- **WHEN** el usuario presiona Enter
- **THEN** la pieza 16 queda seleccionada con `aria-selected` igual a `true` y se abre el panel de la pieza 16

#### Scenario: Espacio sobre una pieza abre su panel

- **GIVEN** un odontograma cargado con el foco en la pieza 16
- **WHEN** el usuario presiona la barra espaciadora
- **THEN** la pieza 16 queda seleccionada con `aria-selected` igual a `true` y se abre el panel de la pieza 16

#### Scenario: Mover el foco con flechas no cambia la pieza seleccionada

- **GIVEN** un odontograma cargado con la pieza 16 seleccionada y su panel abierto
- **WHEN** el usuario presiona la flecha derecha
- **THEN** el foco pasa a la pieza 15 y el panel sigue mostrando la pieza 16

### Requirement: Panel de pieza con historial y estado actual

La UI SHALL mostrar el historial de la pieza seleccionada desde la consulta única de odontograma, en el orden ascendente del backend, y SHALL derivar el estado actual como el último registro recibido sin reordenar. SHALL mostrar en solo lectura los ítems de plan de la pieza con su prestación resuelta por catálogo.

#### Scenario: Historial de pieza muestra registros en orden del backend

- **GIVEN** la consulta única de odontograma del paciente devuelve observaciones de la pieza seleccionada ordenadas por fecha ascendente con distintos profesionales
- **WHEN** el usuario abre el panel de la pieza
- **THEN** la UI lista las observaciones en ese mismo orden y muestra la fecha y el profesional de cada observación

#### Scenario: Panel muestra los ítems de plan de la pieza con su prestación

- **GIVEN** un plan del paciente con un ítem de la pieza 16 cuyo `prestacion_id` corresponde a una prestación del catálogo
- **WHEN** el usuario abre el panel de la pieza 16
- **THEN** el panel muestra en solo lectura ese ítem con el nombre de la prestación y no ofrece enviar una prestación al registrar el estado

### Requirement: Alta de estado de pieza con confirmación y sin mutación optimista

La UI SHALL pedir confirmación en `Modal` antes de registrar un nuevo estado y, si el usuario cancela, NO SHALL emitir ningún request. SHALL enviar solo `pieza`, `estado`, `profesional_id` y `fecha` (`OdontogramaCreate`), sin `prestacion_id`, y ante un error SHALL conservar visible el estado anterior.

#### Scenario: Cambio de estado envía la fecha de confirmación y se refleja tras respuesta exitosa

- **GIVEN** una pieza seleccionada y un formulario de alta con `estado` y `profesional_id` válidos confirmado por el usuario en el modal
- **WHEN** la UI envía `POST /pacientes/{paciente_id}/odontograma` con `pieza`, `estado`, `profesional_id` y `fecha` como instante de confirmación con timezone y el backend responde HTTP 201
- **THEN** la UI actualiza el historial y el estado actual visible de la pieza usando los datos confirmados por el backend sin reordenar

#### Scenario: Cancelar la confirmación no registra el estado

- **GIVEN** una pieza seleccionada con un formulario de alta válido y el modal de confirmación abierto
- **WHEN** el usuario cancela el modal
- **THEN** la UI no emite ningún request, mantiene el estado actual visible de la pieza y devuelve el foco al botón que abrió el modal

#### Scenario: Validación fallida al cambiar estado deja visible el estado anterior

- **GIVEN** una pieza con estado actual visible derivado del historial cargado
- **WHEN** el usuario confirma un nuevo estado y la petición responde HTTP 422
- **THEN** la UI mantiene intacto el estado anterior visible, no realiza actualización optimista, no reintenta automáticamente y vuelve a habilitar las acciones al finalizar la petición

#### Scenario: Paciente inexistente al cambiar estado deja visible el estado anterior

- **GIVEN** una pieza con estado actual visible derivado del historial cargado
- **WHEN** el usuario confirma un nuevo estado y la petición responde HTTP 404 con detalle `paciente no existe: {paciente_id}`
- **THEN** la UI mantiene intacto el estado anterior visible, muestra el error y no reintenta automáticamente la operación

#### Scenario: Profesional inexistente al cambiar estado deja visible el estado anterior

- **GIVEN** una pieza con estado actual visible derivado del historial cargado
- **WHEN** el usuario confirma un nuevo estado con un `profesional_id` que el backend no reconoce y la petición responde HTTP 404
- **THEN** la UI mantiene intacto el estado anterior visible, muestra el error y no reintenta automáticamente la operación

### Requirement: Entradas clínicas listadas y creadas según contrato vigente

La UI SHALL listar entradas con `GET /historias-clinicas/{id}/entradas` en el orden recibido y SHALL permitir el alta con `POST /historias-clinicas/{id}/entradas` enviando `profesional_id`, `fecha` y `texto`. SHALL mostrar profesional, fecha y texto y preservar el listado ante errores.

#### Scenario: Listado de entradas muestra datos trazables

- **GIVEN** una historia clínica existente con entradas devueltas por el backend
- **WHEN** la pantalla carga el bloque de entradas clínicas
- **THEN** la UI muestra cada entrada con su profesional, fecha y texto en el orden recibido

#### Scenario: Alta de entrada agrega el registro confirmado con fecha de confirmación

- **GIVEN** una historia clínica existente y datos válidos de profesional y texto
- **WHEN** el usuario confirma el alta y `POST /historias-clinicas/{id}/entradas` responde HTTP 201 con `fecha` enviada como instante de confirmación con timezone
- **THEN** la UI incorpora la entrada devuelta por el backend al listado sin mutar optimistamente otras secciones

#### Scenario: Error de validación al crear entrada no altera el listado previo

- **GIVEN** un listado de entradas ya visible
- **WHEN** el alta responde HTTP 422
- **THEN** la UI muestra el error y conserva intacto el listado previamente cargado

#### Scenario: Historia inexistente al crear entrada no altera el listado previo

- **GIVEN** un listado de entradas ya visible
- **WHEN** el alta responde HTTP 404 porque la historia clínica no existe
- **THEN** la UI muestra el error y conserva intacto el listado previamente cargado

#### Scenario: Profesional inexistente al crear entrada no altera el listado previo

- **GIVEN** un listado de entradas ya visible
- **WHEN** el alta responde HTTP 404 porque el profesional no existe
- **THEN** la UI muestra el error y conserva intacto el listado previamente cargado

### Requirement: Planes de tratamiento y presupuesto en solo lectura

La UI SHALL consultar los planes del paciente y presentar ítems, `total_centavos` y `cobertura_centavos` formateados tal como los entrega el backend, sin recalcular. La cobertura SHALL mostrarse como monto informado de solo lectura.

#### Scenario: Presupuesto muestra total informado por backend

- **GIVEN** un plan devuelto con `total_centavos` igual a 4000000 y `cobertura_centavos` igual a 750000
- **WHEN** el usuario visualiza el plan de tratamiento
- **THEN** la UI muestra los montos formateados correspondientes a esos valores sin recalcular la suma ni la cobertura

#### Scenario: Plan con ítems muestra pieza, prestación y monto por ítem

- **GIVEN** un plan devuelto con un ítem de la pieza 16, `estado` `pendiente` y `monto_centavos` igual a 1500000
- **WHEN** el usuario visualiza el plan de tratamiento
- **THEN** la UI muestra el ítem con la pieza, el nombre de la prestación, el estado literal y el monto formateado, sin ofrecer crear ni editar ítems

#### Scenario: Plan sin ítems muestra total cero

- **GIVEN** un plan devuelto sin ítems con `total_centavos` igual a 0
- **WHEN** el usuario visualiza el plan de tratamiento
- **THEN** la UI muestra el plan con total igual a cero formateado y sin filas de ítems

#### Scenario: Paciente sin planes muestra estado vacío

- **GIVEN** `GET /pacientes/{paciente_id}/planes-tratamiento` responde 200 con una lista vacía
- **WHEN** la pantalla carga la sección de planes
- **THEN** la UI muestra un estado vacío de planes sin tratarlo como error

#### Scenario: Paciente inexistente al consultar planes no oculta datos clínicos ya disponibles

- **GIVEN** la cabecera de historia clínica ya fue cargada correctamente
- **WHEN** la consulta de planes responde HTTP 404
- **THEN** la UI muestra el error de la sección de planes y conserva visible la cabecera

#### Scenario: Acceso denegado al consultar planes no oculta datos clínicos ya disponibles

- **GIVEN** la cabecera de historia clínica ya fue cargada correctamente
- **WHEN** la consulta de planes responde HTTP 403
- **THEN** la UI muestra el error de la sección de planes y conserva visible la cabecera

### Requirement: Estados de interfaz y protección de mutaciones clínicas

La UI SHALL usar componentes de C-14 para carga, vacío y errores, SHALL deshabilitar acciones de mutación en vuelo y SHALL evitar reintentos automáticos de mutaciones conflictivas o fallidas. Ante mutación fallida, SHALL conservar el estado anterior confirmado.

#### Scenario: Carga inicial usa estados diferenciados

- **GIVEN** una navegación válida a `/hc/:pacienteId`
- **WHEN** las consultas clínicas están pendientes
- **THEN** cada sección muestra un indicador de carga de C-14 hasta que su propia consulta responde

#### Scenario: Falla de carga de una sección muestra error propio

- **GIVEN** una navegación válida a `/hc/:pacienteId` con la cabecera cargada
- **WHEN** la consulta de odontograma responde HTTP 500
- **THEN** la sección de odontograma muestra un mensaje de error, no reintenta automáticamente y la cabecera sigue visible

#### Scenario: Alta de entrada en vuelo bloquea acciones duplicadas

- **GIVEN** un formulario válido de alta de entrada clínica
- **WHEN** la petición de guardado está en curso
- **THEN** el control de envío permanece deshabilitado hasta que la petición termina

#### Scenario: Alta de estado de pieza en vuelo bloquea acciones duplicadas

- **GIVEN** un formulario válido de alta de estado de pieza confirmado en el modal
- **WHEN** la petición de guardado está en curso
- **THEN** los controles de confirmación permanecen deshabilitados hasta que la petición termina

#### Scenario: Conflicto de negocio informado no dispara reintento automático

- **GIVEN** una mutación clínica en curso que recibe una respuesta de conflicto de negocio
- **WHEN** el backend responde HTTP 409
- **THEN** la UI informa el conflicto, conserva el estado anterior confirmado y no reintenta automáticamente la operación
