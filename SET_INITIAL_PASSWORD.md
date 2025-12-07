# Establecer Contraseña Inicial del Administrador

Si eres el administrador y no puedes iniciar sesión porque tu usuario no tiene contraseña configurada, sigue estos pasos:

## Método 1: Usando pgcrypto (Más Fácil)

1. Ve a **Supabase Dashboard > SQL Editor**
2. Abre el archivo `database/set_admin_password.sql`
3. En la línea 20, reemplaza `'TU_CONTRASEÑA_AQUI'` con tu contraseña real
   ```sql
   UPDATE users 
   SET password_hash = encode(digest('TU_CONTRASEÑA_AQUI', 'sha256'), 'hex')
   WHERE role = 'ADMIN' 
     AND (password_hash IS NULL OR password_hash = '');
   ```
4. Ejecuta el script completo
5. Verifica que se actualizó correctamente (el script incluye una consulta SELECT al final)
6. Intenta iniciar sesión nuevamente

## Método 2: Usando Hash Manual

Si el método 1 no funciona (pgcrypto no disponible):

1. Abre el archivo `utils/setInitialPassword.html` en tu navegador
2. Ingresa tu contraseña en el campo
3. Haz clic en "Generar Hash"
4. Copia el hash generado
5. Ve a Supabase SQL Editor
6. Ejecuta:
   ```sql
   UPDATE users 
   SET password_hash = 'PEGA_EL_HASH_AQUI'
   WHERE role = 'ADMIN' 
     AND (password_hash IS NULL OR password_hash = '');
   ```
7. Reemplaza `'PEGA_EL_HASH_AQUI'` con el hash que copiaste
8. Ejecuta el script
9. Intenta iniciar sesión nuevamente

## Verificar que Funcionó

Después de ejecutar el script, puedes verificar que se actualizó correctamente:

```sql
SELECT id, name, email, role, 
       CASE 
         WHEN password_hash IS NOT NULL AND password_hash != '' THEN 'Contraseña configurada'
         ELSE 'Sin contraseña'
       END as password_status
FROM users 
WHERE role = 'ADMIN';
```

Deberías ver "Contraseña configurada" en la columna `password_status`.

## Notas de Seguridad

- **NUNCA** compartas tu contraseña
- El hash SHA-256 es unidireccional (no se puede revertir a la contraseña original)
- Una vez establecida la contraseña, podrás cambiarla desde la aplicación

