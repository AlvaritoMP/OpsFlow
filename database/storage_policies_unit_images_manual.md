# Configuración Manual de Políticas RLS para unit-images

## Problema
El script SQL no puede ejecutarse directamente porque requiere permisos de superusuario. Las políticas de Storage deben configurarse manualmente desde el Dashboard de Supabase.

## Pasos para Configurar

### 1. Crear el Bucket
1. Ve a **Supabase Dashboard** → **Storage**
2. Haz clic en **"New bucket"**
3. Configura:
   - **Name:** `unit-images`
   - **Public bucket:** ✅ (marcado - importante para que las imágenes sean accesibles)
4. Haz clic en **"Create bucket"**

### 2. Configurar Políticas RLS desde el Dashboard

#### Opción A: Usando el Editor de Políticas (Recomendado)

1. Ve a **Storage** → **Policies** (o haz clic en el bucket `unit-images` → **Policies**)
2. Haz clic en **"New Policy"** o **"Add Policy"**

#### Política 1: INSERT (Subir imágenes)
- **Policy name:** `Allow authenticated users to upload unit images`
- **Allowed operation:** `INSERT`
- **Target roles:** `authenticated`
- **USING expression:** (dejar vacío o `true`)
- **WITH CHECK expression:**
  ```sql
  bucket_id = 'unit-images'
  ```

#### Política 2: SELECT (Leer imágenes) - ⚠️ IMPORTANTE
- **Policy name:** `Allow public to read unit images`
- **Allowed operation:** `SELECT`
- **Target roles:** `public`
- **USING expression:**
  ```sql
  bucket_id = 'unit-images'
  ```
- **WITH CHECK expression:** (dejar vacío)
- **⚠️ CRÍTICO:** Asegúrate de que esta política NO tenga restricciones por `owner_id` o `auth.uid()`. Debe permitir acceso a TODOS los archivos del bucket, no solo a los del usuario actual.

#### Política 3: UPDATE (Actualizar imágenes)
- **Policy name:** `Allow authenticated users to update unit images`
- **Allowed operation:** `UPDATE`
- **Target roles:** `authenticated`
- **USING expression:**
  ```sql
  bucket_id = 'unit-images'
  ```
- **WITH CHECK expression:**
  ```sql
  bucket_id = 'unit-images'
  ```

#### Política 4: DELETE (Eliminar imágenes)
- **Policy name:** `Allow authenticated users to delete unit images`
- **Allowed operation:** `DELETE`
- **Target roles:** `authenticated`
- **USING expression:**
  ```sql
  bucket_id = 'unit-images'
  ```

### Opción B: Usando SQL Editor con Permisos de Superusuario

Si tienes acceso de superusuario a la base de datos, puedes ejecutar el script `storage_policies_unit_images.sql` directamente desde el SQL Editor, pero necesitarás conectarte como superusuario.

### 3. Verificar la Configuración

Después de crear las políticas, verifica que:
1. El bucket `unit-images` existe y es público
2. Las 4 políticas están creadas y activas
3. Puedes ver las políticas en **Storage** → **Policies**

### 4. Probar la Subida

Intenta subir una imagen desde la aplicación. Si hay errores, verifica:
- Que el bucket existe y es público
- Que las políticas están activas
- Que el usuario está autenticado (para INSERT, UPDATE, DELETE)
- Los mensajes de error en la consola del navegador

## Notas Importantes

- **Bucket público:** Es necesario marcar el bucket como público para que las imágenes sean accesibles sin autenticación (para mostrar las imágenes en la UI)
- **Autenticación:** Los usuarios deben estar autenticados para subir, actualizar o eliminar imágenes
- **RLS habilitado:** Asegúrate de que RLS esté habilitado en `storage.objects` (generalmente está habilitado por defecto)

## Solución de Problemas

### Error: "permission denied"
- Verifica que el bucket sea público
- Verifica que las políticas estén activas
- Verifica que el usuario esté autenticado

### Error: "bucket not found"
- Verifica que el bucket `unit-images` existe
- Verifica que el nombre del bucket sea exactamente `unit-images` (case-sensitive)

### Las imágenes no se muestran / Solo el usuario que subió puede verlas
**Este es el problema más común.** Si solo el usuario que subió la imagen puede verla, significa que la política SELECT tiene restricciones por `owner_id`.

**Solución:**
1. Ve a **Storage** → **Policies** → Busca la política `Allow public to read unit images`
2. Edita la política y verifica que la expresión **USING** sea:
   ```sql
   bucket_id = 'unit-images'
   ```
3. **NO debe tener** restricciones como:
   - `owner_id = auth.uid()` ❌
   - `auth.uid() = owner_id` ❌
   - Cualquier referencia a `owner` o `auth.uid()` en la política SELECT ❌
4. La política debe permitir acceso a **TODOS** los archivos del bucket, no solo a los del usuario actual
5. Guarda los cambios y prueba de nuevo

### Verificar políticas actuales
Puedes ejecutar esta consulta en el SQL Editor para ver las políticas actuales:
```sql
SELECT 
  policyname,
  cmd as operation,
  roles,
  qual as using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%unit images%';
```

Si ves referencias a `owner_id` o `auth.uid()` en la política SELECT, esa es la causa del problema.

