# Verificación manual 6.2 (C-22)

Fecha: 2026-11-14. Entorno: backend local, PostgreSQL 16 descartable en Docker (puerto 5433, base `turnos_test`), `SECRET_KEY` ficticia de 64 caracteres, front con `npm run dev`. Usuarios ficticios `USUARIO-FICT-001` (admin, del seed de C-24) y `RECEP-FICT-001` (recepcion, insertado a mano en la base descartable). Este documento no contiene credenciales.

**Estado:** 6.2 marcada con verificación parcial. Lo no verificado está listado abajo.

## Verificado

- El usuario del seed de C-24 tiene rol `admin` y está activo (consulta a la base).
- Por API, `admin` recibe 200 en `GET /roles`, `GET /sucursales` y `GET /export`. `recepcion` recibe 403 (`permiso_denegado`) en los tres. Sin token, `GET /roles` da 401 (`token_ausente`).
- Pregunta abierta resuelta: `admin` puede leer `GET /agenda` (200). También pueden `recepcion` y una llamada sin token, porque el endpoint no tiene guard de autenticación ni de rol.
- Como `admin` sin sucursal asociada, el login entra en `/agenda`, aparece el grupo «Administración» y `/admin` muestra «Sin sucursal asociada (sin filtro)». «Cambiar de sucursal» obliga a iniciar sesión de nuevo.
- `/admin/roles`: lista los 4 roles canónicos con sus permisos; editar solo `descripcion` funciona y quedó guardado en la base.
- `/admin/sucursales`: alta, edición y desactivación funcionan; el nombre es obligatorio y la dirección opcional; el selector de asignaciones no ofrece sucursales inactivas.
- Asignaciones: el alta funciona, el duplicado muestra el conflicto sin crear una segunda fila y se acepta un `usuario` inexistente (texto libre, según la spec).
- `/admin/datos` muestra el contrato de salida, los campos Desde y Hasta, el botón de descarga y la importación documentada sin controles de subida.
- `recepcion` no accede a `/admin` y queda en `/agenda`.

## No verificado

- La descarga real de la exportación: el archivo, su nombre y las claves del JSON.
- Los rangos de más de 30 días e invertido en `/admin/datos`.
- Para `recepcion`: el aviso «Permiso insuficiente.», la ausencia del grupo «Administración» y la redirección de `/admin/roles` y `/admin/datos`.
- El selector de sucursal mostrando un nombre real para un `admin` con sucursal asignada.
- Que el modal de edición de roles no ofrezca nombre ni estado.

## Hallazgos

1. `GET /agenda` no tiene guard en el backend. Fuera del alcance de C-22; para el PO.
2. Desde `/admin` no hay enlaces a Roles, Sucursales ni Datos; se llega por URL. Las asignaciones están dentro de `/admin/sucursales`, sin ruta propia.
3. No hay acción «Reactivar» sucursal. Es una decisión registrada en la task 4.1; el backend sí lo permite.
4. En «Nueva sucursal», tras un 409 de nombre duplicado, el mensaje queda junto a «Ingresá un nombre.» al vaciar el campo. Defecto menor de interfaz, causa sin confirmar.
5. Se pueden crear asignaciones para usuarios que no existen, coherente con la spec.
6. Los botones «Cambiar de sucursal» y «Nueva sucursal» quedan pegados.