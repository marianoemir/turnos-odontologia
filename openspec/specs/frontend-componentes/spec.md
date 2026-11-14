# frontend-componentes Specification

## Purpose
Define una base visual y de interacción reutilizable para que las pantallas futuras de la agenda sean accesibles, consistentes y adaptables a escritorio y móvil.

## Requirements

### Requirement: Componentes base reutilizables preservan el sistema visual
El frontend SHALL ofrecer controles reutilizables de botón, campo de texto, selector, tarjeta, estado de turno, estado vacío y esqueleto que consuman los tokens aprobados sin redefinir sus valores.

#### Scenario: Variantes de botón y campo inválido
- **WHEN** una pantalla usa un botón primario, secundario o destructivo y un campo con ayuda y error
- **THEN** cada control conserva su jerarquía visual, etiqueta asociada y estado accesible, y el campo inválido expone `aria-invalid` y el mensaje de error asociado

#### Scenario: Estado de turno distinguible
- **WHEN** se muestra un estado `pendiente`, `confirmado`, `atendido`, `ausente` o `cancelado`
- **THEN** el badge muestra la etiqueta textual, color y forma de indicador establecidos para ese estado, sin depender solamente del color

### Requirement: Tabla de datos comunica orden, carga y ausencia de resultados
El frontend SHALL ofrecer una tabla reutilizable sin orden inicial; sus columnas configuradas como ordenables SHALL exponer `aria-sort`, junto con un estado vacío y un estado de carga. En viewports de hasta 46rem SHALL transformar cada fila en una tarjeta/grilla legible sin scroll horizontal.

#### Scenario: Tabla sin registros
- **WHEN** una consulta termina correctamente sin registros
- **THEN** la tabla presenta un estado vacío con mensaje comprensible y no una tabla ambigua sin contenido

#### Scenario: Tabla durante carga y en viewport angosto
- **WHEN** una consulta todavía está pendiente en un viewport de 390×844
- **THEN** se presenta el esqueleto de carga y, al resolver filas, éstas se muestran en una grilla responsive sin scroll horizontal

#### Scenario: Orden sólo después de una acción explícita
- **WHEN** se renderiza una tabla con columnas configuradas como ordenables
- **THEN** no aplica ningún orden inicial, cada encabezado ordenable expone su `aria-sort` correspondiente y al activar uno actualiza el orden y ese atributo

### Requirement: Superficies superpuestas conservan foco y anuncios
El frontend SHALL ofrecer un modal que contenga el foco, cierre con Escape y devuelva el foco al disparador, y un toast con `role="status"` que se descarte automáticamente y permita a la persona usuaria pausar ese descarte.

#### Scenario: Cierre de modal por teclado
- **WHEN** una persona abre un modal, navega con Tab y presiona Escape
- **THEN** el foco no abandona el modal mientras está abierto, el modal se cierra y el foco vuelve al disparador

#### Scenario: Toast anunciado y pausado
- **WHEN** se publica un toast transitorio
- **THEN** el mensaje se anuncia con `role="status"`, se descarta después de su plazo y el descarte se pausa mientras recibe hover o foco, reanudándose al salir ambas interacciones

### Requirement: Formularios comparten validación de cliente y errores de API
El frontend SHALL impedir el envío de formularios inválidos para DNI, duración positiva y rangos `desde < hasta`, y SHALL asociar a sus campos los errores de validación HTTP 422 devueltos por la API.

#### Scenario: Validación local bloquea el envío
- **WHEN** se intenta enviar un formulario con duración no positiva o con `desde` mayor o igual que `hasta`
- **THEN** el envío no se realiza y cada campo afectado muestra un error accesible

#### Scenario: Validación del servidor llega al campo
- **WHEN** la API responde 422 con errores de campo a una mutación de formulario
- **THEN** el formulario muestra cada error en el campo correspondiente sin reemplazarlo por un error genérico

### Requirement: Estado de servidor se comparte e invalida tras cambios
El frontend SHALL mantener una única configuración de estado de servidor, claves de consulta por recurso e invalidación de las consultas afectadas después de una mutación exitosa.

#### Scenario: Mutación actualiza una vista dependiente
- **WHEN** una mutación exitosa cambia un recurso consultado por una pantalla
- **THEN** la consulta de ese recurso se invalida y la pantalla vuelve a obtener datos actuales
