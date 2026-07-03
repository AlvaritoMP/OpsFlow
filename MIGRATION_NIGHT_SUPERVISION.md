# Migración de Base de Datos: Supervisión Nocturna

## Cómo ejecutar la migración

### Opción 1: Desde el SQL Editor de Supabase (Recomendado)

1. **Accede a tu proyecto de Supabase:**
   - Ve a https://supabase.com
   - Inicia sesión y selecciona tu proyecto

2. **Abre el SQL Editor:**
   - En el menú lateral, haz clic en "SQL Editor"
   - Haz clic en "New query"

3. **Copia y pega el contenido del archivo de migración:**
   - Abre el archivo `database/night_supervision_schema.sql`
   - Copia todo el contenido
   - Pégalo en el SQL Editor de Supabase

4. **Ejecuta la migración:**
   - Haz clic en el botón "Run" (o presiona Ctrl+Enter)
   - Espera a que se complete la ejecución
   - Verifica que no haya errores en la consola

5. **Verifica las tablas creadas:**
   - Ve a "Table Editor" en el menú lateral
   - Deberías ver las siguientes tablas nuevas:
     - `night_supervision_shifts`
     - `night_supervision_calls`
     - `night_supervision_camera_reviews`
     - `night_supervision_alerts`

### Opción 2: Usando Supabase CLI

Si tienes Supabase CLI instalado:

```bash
# Asegúrate de estar en el directorio del proyecto
cd C:\Users\alvar\OpsFlow

# Inicia Supabase localmente (si es necesario)
supabase start

# Aplica la migración
supabase db push

# O ejecuta el archivo SQL directamente
supabase db execute -f database/night_supervision_schema.sql
```

### Opción 3: Desde la línea de comandos con psql

Si tienes acceso directo a la base de datos:

```bash
psql -h [TU_HOST] -U postgres -d postgres -f database/night_supervision_schema.sql
```

## IMPORTANTE: Corrección de Foreign Key

**Si ya ejecutaste la migración inicial**, necesitas ejecutar también el script de corrección:

1. Abre el archivo `database/fix_night_supervision_foreign_key.sql`
2. Copia y pega su contenido en el SQL Editor de Supabase
3. Ejecuta el script

Este script corrige la foreign key de `supervisor_id` para que referencie `users(id)` en lugar de `management_staff(id)`, permitiendo que cualquier usuario autenticado pueda crear turnos de supervisión.

## Verificación

Después de ejecutar la migración, verifica que:

1. ✅ Las 4 tablas fueron creadas correctamente
2. ✅ Los índices fueron creados
3. ✅ Los triggers fueron creados
4. ✅ Las restricciones (constraints) están en su lugar

Puedes verificar ejecutando esta consulta en el SQL Editor:

```sql
-- Verificar tablas creadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'night_supervision%'
ORDER BY table_name;

-- Verificar índices
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename LIKE 'night_supervision%'
ORDER BY tablename, indexname;

-- Verificar triggers
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE event_object_schema = 'public' 
AND event_object_table LIKE 'night_supervision%'
ORDER BY event_object_table, trigger_name;
```

## Configuración de RLS (Row Level Security)

**IMPORTANTE:** Después de crear las tablas, necesitarás configurar las políticas RLS según tus necesidades de seguridad. Por ahora, las tablas se crean sin RLS habilitado por defecto.

Si necesitas habilitar RLS, ejecuta:

```sql
-- Habilitar RLS en todas las tablas
ALTER TABLE night_supervision_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE night_supervision_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE night_supervision_camera_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE night_supervision_alerts ENABLE ROW LEVEL SECURITY;

-- Ejemplo de política (ajusta según tus necesidades):
-- Permitir a todos los usuarios autenticados ver sus propios turnos
CREATE POLICY "Users can view their own shifts"
ON night_supervision_shifts
FOR SELECT
USING (auth.uid() = created_by OR auth.uid() = supervisor_id);

-- Permitir a administradores ver todo
CREATE POLICY "Admins can view all shifts"
ON night_supervision_shifts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'ADMIN'
  )
);
```

## Solución de problemas

### Error: "relation already exists"
- Las tablas ya existen. Puedes eliminarlas primero con `DROP TABLE` o usar `CREATE TABLE IF NOT EXISTS` (ya incluido en el script).

### Error: "permission denied"
- Asegúrate de tener permisos de administrador en Supabase o usa una cuenta con los permisos necesarios.

### Error: "function does not exist"
- El script crea las funciones necesarias. Si el error persiste, ejecuta el script completo de nuevo.

## Notas importantes

- ⚠️ **Backup:** Siempre haz un backup de tu base de datos antes de ejecutar migraciones en producción
- ⚠️ **Testing:** Prueba primero en un entorno de desarrollo
- ⚠️ **RLS:** Configura las políticas RLS según tus necesidades de seguridad antes de usar en producción

