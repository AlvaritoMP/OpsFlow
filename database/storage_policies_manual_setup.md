# Configuración Manual de Políticas RLS para Storage

## ⚠️ IMPORTANTE: Las políticas de Storage NO se pueden crear con SQL directo

En Supabase, las políticas de Storage se deben crear a través de la interfaz web del Dashboard, no con SQL directo.

## Pasos para crear las políticas manualmente:

### 1. Ve a Supabase Dashboard → Storage → Policies

1. Abre tu proyecto en Supabase Dashboard
2. En el menú lateral, haz clic en **"Storage"**
3. Haz clic en **"Policies"** (o busca el bucket `night-supervision-photos` y haz clic en él)
4. Selecciona el bucket `night-supervision-photos`

### 2. Crea las políticas una por una:

#### Política 1: INSERT (Subir archivos)
- Haz clic en **"New Policy"** o **"Create Policy"**
- Nombre: `Allow authenticated users to upload photos`
- Operación: **INSERT**
- Target roles: **authenticated**
- Policy definition (USING expression): Deja vacío
- Policy definition (WITH CHECK expression): 
  ```sql
  bucket_id = 'night-supervision-photos'
  ```
- Haz clic en **"Save"** o **"Create"**

#### Política 2: SELECT (Leer archivos)
- Haz clic en **"New Policy"** o **"Create Policy"**
- Nombre: `Allow public to read photos`
- Operación: **SELECT**
- Target roles: **public**
- Policy definition (USING expression):
  ```sql
  bucket_id = 'night-supervision-photos'
  ```
- Policy definition (WITH CHECK expression): Deja vacío
- Haz clic en **"Save"** o **"Create"**

#### Política 3: UPDATE (Actualizar archivos)
- Haz clic en **"New Policy"** o **"Create Policy"**
- Nombre: `Allow authenticated users to update photos`
- Operación: **UPDATE**
- Target roles: **authenticated**
- Policy definition (USING expression):
  ```sql
  bucket_id = 'night-supervision-photos'
  ```
- Policy definition (WITH CHECK expression):
  ```sql
  bucket_id = 'night-supervision-photos'
  ```
- Haz clic en **"Save"** o **"Create"**

#### Política 4: DELETE (Eliminar archivos)
- Haz clic en **"New Policy"** o **"Create Policy"**
- Nombre: `Allow authenticated users to delete photos`
- Operación: **DELETE**
- Target roles: **authenticated**
- Policy definition (USING expression):
  ```sql
  bucket_id = 'night-supervision-photos'
  ```
- Policy definition (WITH CHECK expression): Deja vacío
- Haz clic en **"Save"** o **"Create"**

### 3. Verifica las políticas

Después de crear las 4 políticas, deberías ver:
- ✅ Allow authenticated users to upload photos (INSERT)
- ✅ Allow public to read photos (SELECT)
- ✅ Allow authenticated users to update photos (UPDATE)
- ✅ Allow authenticated users to delete photos (DELETE)

### 4. Prueba la subida de archivos

Intenta subir una foto desde la aplicación. Debería funcionar ahora.

## Notas importantes:

- Si no ves la opción de crear políticas, asegúrate de que RLS esté habilitado en el bucket
- Algunas versiones de Supabase tienen la interfaz en Storage → [nombre del bucket] → Policies
- Si sigues teniendo problemas, verifica que el bucket sea público

