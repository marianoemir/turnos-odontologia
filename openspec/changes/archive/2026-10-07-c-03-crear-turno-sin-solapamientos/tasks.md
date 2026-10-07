# Tasks

> Orden TDD (skill `tdd`): cada task implementa su test en rojo primero y el código mínimo después, en el mismo paso. Requiere C-02 archivado; si sigue pendiente, usar las interfaces mínimas de design (swap en 5.2).

## 1. Intervalos [inicio,fin)

- [x] 1.1 `solapan(a, b)` en `src/turnos/intervalos.ts` con tests `tests/turnos-intervalos.test.ts` (solape parcial, contenido, adyacente inicio==fin NO solapa); verificar con `npm test` en verde.
- [x] 1.2 Tipos `Turno`, `ConflictoTurno {causa: profesional|sillon|horario|bloqueo}`, `InputInvalido` en `src/turnos/tipos.ts`; verificar con `npx tsc --noEmit` limpio.

## 2. ServicioTurnos.crear (red-green por regla)

- [x] 2.1 Creación válida → pendiente con fin calculado (RN-AG-01), con repositorio en memoria inyectado; verificar con test `tests/turnos-crear.test.ts` en verde.
- [x] 2.2 Solape profesional → `ConflictoTurno{profesional}` y nada creado (RN-AG-02); verificar con test en verde.
- [x] 2.3 Sin sillón → `InputInvalido` (422); solape sillón → `ConflictoTurno{sillon}` (RN-AG-03); verificar con tests en verde.
- [x] 2.4 Fuera de horario → causa `horario`; sobre bloqueo → causa `bloqueo` (RN-AG-05); verificar con tests en verde.

## 3. Repositorio y validación reutilizable

- [x] 3.1 Repositorio en memoria (`src/turnos/repositorio-memoria.ts`) con búsqueda de activos por profesional y sillón; verificar con test de aislamiento entre instancias.
- [x] 3.2 Separar `validar(...)` pura de `crear(...)` para reuso de C-04; verificar con test que `validar` no persiste nada.

## 4. Router Express fino (mapeo 409/422)

- [x] 4.1 `POST /turnos` que delega al servicio y mapea `ConflictoTurno`→409 con causa, `InputInvalido`→422; verificar con test contra servidor efímero (sin dependencias nuevas).

## 5. Cierre

- [x] 5.1 Pasada integral `npx tsc --noEmit` + `npm test` en verde; documentar que `smoke.test.ts` sigue pasando.
- [ ] 5.2 Si C-02 seguía pendiente: reemplazar interfaces provisorias por las reales de C-02 sin cambiar el servicio; verificar con `npm test` en verde.

## Workflow follow-up

- Archivar con `/opsx-archive` tras revisión; el sync creará `openspec/specs/turnos/spec.md` (capacidad nueva).
- Marcar `[x]` C-03 en `CHANGES.md` al archivar.
