-- Agregar columna password_hash a la tabla users
-- Este script migra la tabla users para soportar autenticación simple sin Supabase Auth

-- Agregar columna password_hash si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'password_hash'
    ) THEN
        ALTER TABLE public.users 
        ADD COLUMN password_hash TEXT;
        
        -- Agregar comentario a la columna
        COMMENT ON COLUMN public.users.password_hash IS 'Hash SHA-256 de la contraseña del usuario';
    END IF;
END $$;

-- Crear índice para búsquedas por email (si no existe)
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Nota: Las contraseñas existentes deberán ser actualizadas manualmente
-- o a través de la aplicación cuando los usuarios cambien su contraseña

