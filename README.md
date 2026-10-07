# turnos-odontologia

Trabajo de Integración: del Discovery al primer Change, con Spec-Driven Development y Active Stack.

Sistema de gestión de turnos para consultorios odontológicos (Argentina). Núcleo: agenda por profesional y por sillón/box sin solapamientos.

## Requisitos

- Node.js LTS (probado con v24.19.0) + npm 11
- Sin servicios externos: tests en memoria, datos ficticios

## Instalar y probar

```bash
npm install
npm test        # Jest + ts-jest, suite en verde
npx tsc --noEmit  # chequeo de tipos estricto
```

## Variables de entorno

Copiar `.env.example` a `.env` si hace falta (valores ficticios; nunca commitear secretos):

```bash
copy .env.example .env   # Windows
```

## Estructura

- `src/turnos/` — dominio de turnos (C-03)
- `src/agenda/` — horarios, bloqueos, recursos (C-02)
- `src/seed/` — datos ficticios
- `tests/` — suite Jest
- `knowledge-base/` — fuente de verdad del dominio
- `CHANGES.md` — roadmap de changes (recorte TP: C-01 → C-02 → C-03)

## Datos

Solo datos ficticios en seeds y tests. Nunca datos reales de pacientes.
