# Evidencia de Engram (etapa 7)

- 01 y 02: consola (`engram search` y `engram context`) mostrando lo guardado, incluidas observaciones de sesiones anteriores del proyecto.
- 03: el agente guarda en memoria una decisión del grupo (observación #10).
- 05: en un chat nuevo, dos días después, el agente recupera esa decisión desde la memoria, sin leer archivos del repo.

Qué aporta: sin memoria, cada sesión nueva arranca de cero y hay que volver a explicarle el stack, el alcance de cada change y las reglas del grupo. Con Engram el agente recupera ese contexto por su cuenta, y se evitan decisiones repetidas o contradictorias.