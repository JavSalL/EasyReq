
-- Migración para la tabla de patrones
CREATE TABLE IF NOT EXISTS patrones (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    prompt TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar los 3 patrones extraídos de los documentos
INSERT INTO patrones (name, description, prompt) VALUES
(
    'Patrón Dr. Reyes', 
    'Enfoque de Lenguaje Natural Estructurado: Actor + Acción + Objeto de Acción + Datos de entrada + Resultado esperado.', 
    'Debes redactar el requerimiento siguiendo estrictamente el patrón del Dr. Reyes: [Actor] + [Acción] + [Objeto de Acción] + [Datos de entrada] + [Resultado esperado]. \n\nDefiniciones:\n- Actor: El usuario que ejecuta la funcionalidad.\n- Acción: La funcionalidad ejecutada (objetivo del usuario).\n- Objeto de acción: La entidad o componente involucrado.\n- Datos de entrada: Información necesaria para iniciar la funcionalidad.\n- Resultado esperado: Información resultante o efecto esperado.'
),
(
    'Patrón EARS (Easy Approach to Requirements Syntax)', 
    'Sintaxis estructurada basada en palabras clave (When, While, If, Where) para reducir ambigüedad.', 
    'Utiliza la sintaxis EARS. Los patrones permitidos son:\n1. Ubicuo: "The <system> shall <response>".\n2. Event-driven: "When <trigger>, the <system> shall <response>".\n3. State-driven: "While <state>, the <system> shall <response>".\n4. Unwanted Behavior: "If <trigger>, then the <system> shall <response>".\n5. Optional Feature: "Where <feature>, the <system> shall <response>".\n\nUsa siempre "shall" para denotar obligatoriedad.'
),
(
    'Patrón de Sistemas Embebidos', 
    'Orientado a hardware, determinismo, restricciones temporales, manejo de fallas e interfaces físicas.', 
    'Enfócate en la naturaleza de sistemas embebidos utilizando estos patrones:\n- Event-Response: "When <event>, the <system> shall <response> within <time constraint>".\n- State-Based: "While <mode>, the <system> shall <behavior>".\n- Fault Handling: "If <fault condition>, the <system> shall <safe response>".\n- Periodic Behavior: "Every <time interval>, the <system> shall <behavior>".\n- Resource Constraints: "The <system> shall not exceed <limit> (RAM, Power, etc)".'
);
