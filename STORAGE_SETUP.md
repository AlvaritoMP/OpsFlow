# Configuración de Supabase Storage para Supervisión Nocturna

## ⚠️ IMPORTANTE: Este paso es obligatorio antes de usar la funcionalidad de fotos

## Pasos para configurar el bucket de almacenamiento

1. **Accede a tu proyecto de Supabase:**
   - Ve a https://supabase.com
   - Inicia sesión y selecciona tu proyecto

2. **Crea el bucket de Storage:**
   - En el menú lateral, haz clic en **"Storage"**
   - Haz clic en **"New bucket"** o **"Create bucket"**
   - **Nombre del bucket:** `night-supervision-photos` (debe ser exactamente este nombre)
   - **Marca "Public bucket"** ✅ (para que las imágenes sean accesibles públicamente)
   - **File size limit:** 10 MB (opcional, pero recomendado)
   - **Allowed MIME types:** `image/jpeg, image/png, image/jpg, image/gif, image/webp` (opcional)
   - Haz clic en **"Create bucket"**

3. **Configura las políticas RLS (Row Level Security):**
   
   ⚠️ **IMPORTANTE:** No puedes deshabilitar RLS con SQL (requiere permisos de administrador).
   Debes crear las políticas a través de la interfaz web de Supabase.
   
   **SOLUCIÓN MÁS RÁPIDA:**
   
   Consulta el archivo `SOLUCION_STORAGE_SIMPLE.md` para instrucciones paso a paso con 3 opciones:
   
   - **Opción 1:** Usar un bucket existente de Opalopy (si ya tienes uno configurado)
   - **Opción 2:** Crear 2 políticas simples a través de la interfaz web (5 minutos)
   - **Opción 3:** Política ultra permisiva (si las anteriores no funcionan)
   
   **OPCIÓN B: Crear políticas manualmente (Detallado)**
   
   ⚠️ **IMPORTANTE:** Las políticas de Storage NO se pueden crear con SQL directo en Supabase.
   Debes crearlas manualmente a través de la interfaz web.
   
   Consulta el archivo `database/storage_policies_manual_setup.md` para instrucciones detalladas paso a paso.
   
   Resumen rápido:
   1. Ve a Supabase Dashboard → **Storage** → **Policies**
   2. Selecciona el bucket `night-supervision-photos`
   3. Crea 4 políticas:
      - **INSERT**: `Allow authenticated users to upload photos` (authenticated, WITH CHECK: `bucket_id = 'night-supervision-photos'`)
      - **SELECT**: `Allow public to read photos` (public, USING: `bucket_id = 'night-supervision-photos'`)
      - **UPDATE**: `Allow authenticated users to update photos` (authenticated, USING y WITH CHECK: `bucket_id = 'night-supervision-photos'`)
      - **DELETE**: `Allow authenticated users to delete photos` (authenticated, USING: `bucket_id = 'night-supervision-photos'`)
   
   **Opción B: Crear políticas manualmente**
   - Ve a "Storage" → "Policies"
   - Selecciona el bucket `night-supervision-photos`
   - Crea las siguientes políticas:

   **Política 1: Permitir subir archivos (INSERT)**
   ```sql
   CREATE POLICY "Allow authenticated users to upload photos"
   ON storage.objects
   FOR INSERT
   TO authenticated
   WITH CHECK (bucket_id = 'night-supervision-photos');
   ```

   **Política 2: Permitir leer archivos (SELECT)**
   ```sql
   CREATE POLICY "Allow public to read photos"
   ON storage.objects
   FOR SELECT
   TO public
   USING (bucket_id = 'night-supervision-photos');
   ```

   **Política 3: Permitir actualizar archivos (UPDATE)**
   ```sql
   CREATE POLICY "Allow authenticated users to update photos"
   ON storage.objects
   FOR UPDATE
   TO authenticated
   USING (bucket_id = 'night-supervision-photos');
   ```

   **Política 4: Permitir eliminar archivos (DELETE)**
   ```sql
   CREATE POLICY "Allow authenticated users to delete photos"
   ON storage.objects
   FOR DELETE
   TO authenticated
   USING (bucket_id = 'night-supervision-photos');
   ```

4. **Verifica la configuración:**
   - Intenta subir una foto desde la aplicación
   - Verifica que la foto se guarde correctamente en el bucket
   - Verifica que la foto sea accesible públicamente

## Estructura de carpetas

El servicio de storage organiza los archivos en las siguientes carpetas:

- `calls/[fecha]/` - Fotos de llamadas a trabajadores
- `camera-reviews/[fecha]/` - Screenshots de revisiones de cámaras

Ejemplo:
- `calls/2024-01-15/call-123-456-1234567890-abc123.jpg`
- `camera-reviews/2024-01-15/review-123-1-1234567890-xyz789.png`

## Notas importantes

- ⚠️ **Tamaño máximo:** Los archivos están limitados a 10MB
- ⚠️ **Formatos permitidos:** Solo imágenes (image/*)
- ⚠️ **Nombres únicos:** El servicio genera nombres únicos automáticamente para evitar conflictos
- ⚠️ **Público vs Privado:** Si necesitas que las fotos sean privadas, ajusta las políticas RLS y usa URLs firmadas

