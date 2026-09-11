-- ==========================================================
-- MIGRACIÓN COMPLETA: NUEVO ESQUEMA CON SUPABASE AUTH
-- Proyecto: EasyReq / reyes-soft
-- Rama: nueva_db
-- ==========================================================

-- 0. Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================================
-- 1. CATÁLOGOS BASE
-- ==========================================================
CREATE TABLE IF NOT EXISTS tipos_sistema (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS profesiones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_rol VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS estados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_estado VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS modalidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_modalidad VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tipos_requerimientos (
    tipo_req UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS modelo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(150) NOT NULL UNIQUE,
    descripcion TEXT
);

-- ==========================================================
-- 2. INTEGRACIÓN CON SUPABASE AUTH (PERFIL DE USUARIO)
-- ==========================================================
-- Enlaza directamente con auth.users(id) de Supabase
CREATE TABLE IF NOT EXISTS perfil_usuario (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    correo VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger para crear automáticamente el perfil cuando se registra un usuario en Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfil_usuario (id, nombre, correo)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.email
  )
  ON CONFLICT (id) DO UPDATE 
  SET correo = EXCLUDED.correo;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================================
-- 3. ENTIDADES PRINCIPALES
-- ==========================================================
CREATE TABLE IF NOT EXISTS equipo (
    equipo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proyecto (
    proyecto_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    id_tipo_sistema UUID REFERENCES tipos_sistema(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patron (
    patron_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    promt TEXT NOT NULL,
    id_modelo UUID REFERENCES modelo(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (nombre, id_modelo)
);

CREATE TABLE IF NOT EXISTS requerimiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enunciado TEXT NOT NULL,
    id_tipo_requerimiento UUID REFERENCES tipos_requerimientos(tipo_req) ON DELETE SET NULL,
    id_proyecto UUID NOT NULL REFERENCES proyecto(proyecto_id) ON DELETE CASCADE,
    id_autor UUID REFERENCES perfil_usuario(id) ON DELETE SET NULL,
    id_aprobador UUID REFERENCES perfil_usuario(id) ON DELETE SET NULL,
    id_modalidad UUID REFERENCES modalidades(id) ON DELETE SET NULL,
    id_estado UUID REFERENCES estados(id) ON DELETE SET NULL,
    id_modelo UUID REFERENCES modelo(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================================
-- 4. TABLAS INTERMEDIAS (RELACIONES MUCHOS A MUCHOS)
-- ==========================================================
CREATE TABLE IF NOT EXISTS usuario_profesion (
    id_usuario UUID REFERENCES perfil_usuario(id) ON DELETE CASCADE,
    id_profesion UUID REFERENCES profesiones(id) ON DELETE CASCADE,
    PRIMARY KEY (id_usuario, id_profesion)
);

CREATE TABLE IF NOT EXISTS proyecto_equipos (
    id_proyecto UUID REFERENCES proyecto(proyecto_id) ON DELETE CASCADE,
    id_equipo UUID REFERENCES equipo(equipo_id) ON DELETE CASCADE,
    PRIMARY KEY (id_proyecto, id_equipo)
);

CREATE TABLE IF NOT EXISTS miembros_equipo (
    id_equipo UUID REFERENCES equipo(equipo_id) ON DELETE CASCADE,
    id_usuario UUID REFERENCES perfil_usuario(id) ON DELETE CASCADE,
    id_rol UUID REFERENCES roles(id) ON DELETE SET NULL,
    PRIMARY KEY (id_equipo, id_usuario)
);

-- ==========================================================
-- 5. TABLAS DE HISTORIAL Y LOGS (AUDITORÍA)
-- ==========================================================
CREATE TABLE IF NOT EXISTS historial_lideres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_equipo UUID NOT NULL REFERENCES equipo(equipo_id) ON DELETE CASCADE,
    id_usuario UUID NOT NULL REFERENCES perfil_usuario(id) ON DELETE CASCADE,
    es_actual BOOLEAN DEFAULT FALSE,
    fecha_inicio DATE DEFAULT CURRENT_DATE,
    fecha_fin DATE
);

CREATE TABLE IF NOT EXISTS logs_requerimientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_requerimiento UUID REFERENCES requerimiento(id) ON DELETE CASCADE,
    accion VARCHAR(100) NOT NULL,
    id_autor UUID REFERENCES perfil_usuario(id) ON DELETE SET NULL,
    id_lider_en_momento UUID REFERENCES perfil_usuario(id) ON DELETE SET NULL,
    fecha_hora TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    detalles JSONB
);

CREATE TABLE IF NOT EXISTS logs_integrantes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_equipo UUID REFERENCES equipo(equipo_id) ON DELETE CASCADE,
    id_usuario_afectado UUID REFERENCES perfil_usuario(id) ON DELETE SET NULL,
    accion VARCHAR(100) NOT NULL,
    id_autor UUID REFERENCES perfil_usuario(id) ON DELETE SET NULL,
    id_lider_en_momento UUID REFERENCES perfil_usuario(id) ON DELETE SET NULL,
    fecha_hora TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    detalles JSONB
);

-- ==========================================================
-- 6. PERMISOS Y ROW LEVEL SECURITY (RLS) PARA DESARROLLO
-- ==========================================================
-- Habilitamos RLS en las tablas principales con políticas abiertas durante desarrollo
ALTER TABLE tipos_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE profesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE modalidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipos_requerimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE modelo ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfil_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyecto ENABLE ROW LEVEL SECURITY;
ALTER TABLE patron ENABLE ROW LEVEL SECURITY;
ALTER TABLE requerimiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario_profesion ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyecto_equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE miembros_equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_lideres ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs_requerimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs_integrantes ENABLE ROW LEVEL SECURITY;

-- Políticas de desarrollo: permiten lectura/escritura tanto a usuarios autenticados como al cliente anon mientras se prueba
DO $$ 
DECLARE 
    tbl text;
BEGIN
    FOR tbl IN 
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN (
            'tipos_sistema', 'profesiones', 'roles', 'estados', 'modalidades', 
            'tipos_requerimientos', 'modelo', 'perfil_usuario', 'equipo', 
            'proyecto', 'patron', 'requerimiento', 'usuario_profesion', 
            'proyecto_equipos', 'miembros_equipo', 'historial_lideres', 
            'logs_requerimientos', 'logs_integrantes'
        )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS dev_policy_all ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY dev_policy_all ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;

-- ==========================================================
-- 7. SEED DATA (CATÁLOGOS Y DATOS INICIALES)
-- ==========================================================
INSERT INTO tipos_sistema (nombre) VALUES 
('Sistema Web'),
('Aplicación Móvil'),
('Sistema Embebido / IoT'),
('Software de Escritorio'),
('Microservicios / API')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO profesiones (nombre) VALUES 
('Ingeniero de Software'),
('Analista de Requerimientos'),
('Diseñador UX/UI'),
('Especialista QA / Testing'),
('Scrum Master / Agile Coach'),
('DevOps Engineer')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO roles (nombre_rol) VALUES 
('Líder de Equipo'),
('Analista de Requisitos'),
('Desarrollador'),
('Tester QA'),
('Product Owner')
ON CONFLICT (nombre_rol) DO NOTHING;

INSERT INTO estados (nombre_estado) VALUES 
('Borrador'),
('En Revisión'),
('Aprobado'),
('Rechazado'),
('Implementado')
ON CONFLICT (nombre_estado) DO NOTHING;

INSERT INTO modalidades (nombre_modalidad) VALUES 
('Presencial'),
('Remoto'),
('Híbrido'),
('Obligatorio'),
('Opcional')
ON CONFLICT (nombre_modalidad) DO NOTHING;

INSERT INTO tipos_requerimientos (nombre) VALUES 
('Funcional'),
('Usabilidad'),
('Confiabilidad'),
('Rendimiento'),
('Soporte / Mantenibilidad')
ON CONFLICT (nombre) DO NOTHING;

-- Modelos de Redacción de Requerimientos
INSERT INTO modelo (nombre, descripcion) VALUES 
('EARS (Easy Approach to Requirements Syntax)', 'Sintaxis estructurada basada en palabras clave para reducir la ambigüedad en especificaciones de requisitos.'),
('Sistemas Embebidos y Programables', 'Orientado a hardware, determinismo temporal, interfaces físicas, tolerancia a fallos y restricciones de recursos.'),
('Modelo Dr. Reyes', 'Enfoque de lenguaje natural estructurado: Actor + Acción + Objeto de Acción + Datos de entrada + Resultado esperado.')
ON CONFLICT (nombre) DO NOTHING;

-- Patrones asociados a cada Modelo
-- 1. Patrones para Modelo EARS
INSERT INTO patron (nombre, promt, id_modelo)
SELECT 
    p.nombre, p.promt, m.id
FROM modelo m
CROSS JOIN (VALUES
    ('Ubiquitous', 'The <system name> shall <system response>.'),
    ('Event-Driven', 'When <trigger>, the <system name> shall <system response>.'),
    ('State-Driven', 'While <state>, the <system name> shall <system response>.'),
    ('Unwanted Behavior', 'If <undesired condition>, then the <system name> shall <system response>.'),
    ('Optional Feature', 'Where <feature is included>, the <system name> shall <system response>.'),
    ('Complex: State + Event', 'While <state>, when <trigger>, the <system name> shall <system response>.'),
    ('Complex: Optional + State + Event', 'Where <feature>, while <state>, when <trigger>, the <system name> shall <system response>.')
) AS p(nombre, promt)
WHERE m.nombre = 'EARS (Easy Approach to Requirements Syntax)'
ON CONFLICT (nombre, id_modelo) DO NOTHING;

-- 2. Patrones para Modelo Sistemas Embebidos y Programables
INSERT INTO patron (nombre, promt, id_modelo)
SELECT 
    p.nombre, p.promt, m.id
FROM modelo m
CROSS JOIN (VALUES
    ('Event-Response', 'When <event>, the <system/component> shall <response>.'),
    ('State-Based', 'While <state/mode>, the <system> shall <behavior>.'),
    ('State + Event', 'While <state>, when <event>, the <system> shall <response>.'),
    ('Timing Constraint', 'When <event>, the <system> shall <response> within <time constraint>.'),
    ('Periodic Behavior', 'Every <time interval>, the <system> shall <behavior>.'),
    ('Fault Handling', 'If <fault condition>, the <system> shall <safe response>.'),
    ('Interface', 'The <system/component> shall <interface behavior>.'),
    ('Resource Constraint', 'The <system/component> shall not exceed <resource limit>.'),
    ('Startup / Initialization', 'Upon <startup condition>, the <system> shall <initialization behavior>.'),
    ('Safety Integrity', 'The <system> shall transition to <safe state> when <hazard condition>.')
) AS p(nombre, promt)
WHERE m.nombre = 'Sistemas Embebidos y Programables'
ON CONFLICT (nombre, id_modelo) DO NOTHING;

-- 3. Patrones para Modelo Dr. Reyes
INSERT INTO patron (nombre, promt, id_modelo)
SELECT 
    'Lenguaje Natural Estructurado',
    '[Actor] + [Acción] + [Objeto de Acción] + [Datos de entrada] + [Resultado esperado].',
    m.id
FROM modelo m
WHERE m.nombre = 'Modelo Dr. Reyes'
ON CONFLICT (nombre, id_modelo) DO NOTHING;

