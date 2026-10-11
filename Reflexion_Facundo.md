2. ¿En qué etapa usaron Ajustar, qué estaba mal y qué habría pasado si hubieran apretado Continuar?

Usamos el mecanismo de ajuste/corrección en la Etapa de Fundación. El agente había asumido un stack basado en Node.js, Express, TypeScript y Jest.  El error fue no haberle dado al agente la restricción del stack impuesto por la cátedra (Python, FastAPI, SQLAlchemy, PostgreSQL, etc). De haber apretado continuar el agente habría continuado implementando los cambios de código y tests bajo el ecosistema de JavaScript/Node.js. Esto nos habría llevado a entregar el proyecto con un stack equivocado para la correción del trabajo, obligándonos a hacer todo desde cero.

3. ¿Qué diferencia notaron entre implementar con una especificación aprobada y pedir código con un prompt suelto?

La diferencia principal es el control y la cobertura determinista de pruebas. Al usar una especificación aprobada el agente se limitó estrictamente a los requerimientos, como la regla de no solapamiento por profesional/sillón, comportamiento en límites de horario, etc. Esto permitió que la generación de tests pasara sin alucinaciones ni irregularidades. Con un prompt suelto, el agente asume reglas de negocio no pedidas, ignora casos de borde o generar código difícil de validar de forma automatizada.

4. ¿Qué parte de la fundación (knowledge-base, roadmap, reglas) le aportó más valor al ciclo OPSX y cuál menos?

Las reglas del agente "AGENTS.md" y "CLAUDE.md" y el Roadmap "CHANGES.md" nos aportaron mas valor. Las reglas funcionaron como un limite que evitó que el agente rompiera la estructura, inventara dependencias o usara datos reales. El roadmap permitió acotar el primer cambio a lo esencial sin arrastrar la complejidad del Frontend o Redis antes de tiempo. Por otro lado las partes de menos valor fueron las partes extensas de la base de conocimiento que eran mayormente descriptivas. 

5. En grupo: qué hizo cada integrante y en qué etapa.

Configuré la Base de Conocimiento, el Roadmap de cambios, las Reglas del Agente, el registro de skills y formé parte de la reestructuración de la fundación para adaptarla al stack correcto.