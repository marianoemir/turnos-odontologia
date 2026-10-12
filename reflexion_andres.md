# Reflexión — Andrés

## Lo que hicimos en esta sesión

Arrancamos con el proyecto sin fundación (solo `README.md` y `.git`) y terminamos con el **primer change del camino crítico archivado**: `C-01 foundation-setup` con código, tests en verde y spec sincronizada. En el medio pasamos por todo el flujo OPSX: `openspec init` → cierre de fundación → corrección del roadmap → explore → propose → apply → verify → archive.

## Lo que más me llevo

**1. El estado real lo manda el disco, no el checkbox.**
`CHANGES.md` marcaba C-01 y C-03 como archivados, pero no había `archive/`, ni `src/`, ni un solo commit de código. Esos `[x]` eran aspiracionales y además imposibles (C-03 depende de C-02, que seguía pendiente). Corregirlos a pendiente antes de codear fue la decisión más importante del día: empezar a construir sobre un plan mentiroso nos habría costado mucho más después.

**2. Traer archivos con git no es lo mismo que completar una fase.**
Hice merge de `main` a mi rama y creí estar al día, pero mi `main` local estaba desactualizado: el archivo nuevo (`.atl/skill-registry.md`) nació después, en un commit que mi merge no podía traer. Y aunque lo hubiera traído, el state del orquestador solo lo escriben sus fases — los archivos huérfanos no cierran nada. Dos lecciones en una: `fetch` antes de asumir que estoy al día, y verificar el estado en vez de suponerlo.

**3. En Apply no se improvisa.**
La regla que me impuse —si no está en el spec, no se inventa en Apply, se vuelve a Propose— funcionó. El ejecutor encontró 5 gaps y los reportó en vez de resolverlos por su cuenta (sin Docker local, una task ya stale, el flag que el CLI no acepta, el 404 que habíamos descartado). Ninguno era grave justamente porque salió a la luz en vez de esconderse en código improvisado.

**4. No aprobar a la primera.**
Revisar el propose contra mis propias pautas antes del apply detectó desvíos reales (escenarios sin GIVEN explícito, sin caso de error). Aprobé con observación esta vez por ser scaffolding, pero el hábito de leer el spec completo antes de dar luz verde queda.

**5. Verify antes de archive, con evidencia.**
Correr la suite a mano y trazar cada escenario a su test (matriz en `docs/verify/`) me dio una confianza que el "todo verde" de palabra no da. No se archiva nada en rojo.

## Lo que haría distinto la próxima vez

- Coordinar con Facundo y Mariano **ramas cortas**: PR → merge a `main` → borrar la rama. Las 4 ramas eternas nos generaron el enredo del merge.
- Definir desde el día uno qué significa cada `[x]` en `CHANGES.md` (código + tests + archive, no intención).
- Instalar las 4 skills de testing que `AGENTS.md` promete y crear el `docker-compose.yml` antes de C-03, que es CRÍTICO y no admite red-green manual improvisado.

## Cierre

De cero a fundación cerrada (`step=done`) y C-01 archivado de verdad — esta vez con el `[x]` respaldado por código, 3 tests verdes y una spec en `openspec/specs/foundation/`. Próximo: `C-02 catalogo-recursos`.
