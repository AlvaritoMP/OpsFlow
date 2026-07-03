# Sistema de Recuperación de Contraseña - Super Administrador

## 🔐 Información de Seguridad

Este documento contiene información crítica para la recuperación de la cuenta del Super Administrador.

**Email del Super Administrador:** `aminano@opaloperu.com`

**Código de Verificación:** `OPSFLOW-SUPERADMIN-2024-RESET`

⚠️ **IMPORTANTE:** Guarda este documento en un lugar seguro y no lo compartas con nadie.

---

## 📋 Métodos de Recuperación

### Método 1: Sistema Web (Recomendado)

1. Ve a la página de login de OpsFlow
2. Haz clic en el enlace **"Recuperación de Super Admin"** en la parte inferior del formulario
3. Sigue estos pasos:
   - **Paso 1:** Ingresa tu email: `aminano@opaloperu.com`
   - **Paso 2:** Ingresa el código de verificación: `OPSFLOW-SUPERADMIN-2024-RESET`
   - **Paso 3:** Ingresa tu nueva contraseña (mínimo 8 caracteres)
4. Una vez completado, podrás iniciar sesión con tu nueva contraseña

### Método 2: Script SQL (Solo en emergencia)

Si el sistema web no está disponible:

1. Ve a **Supabase Dashboard → SQL Editor**
2. Abre el archivo `database/migrations/superadmin_emergency_reset.sql`
3. Genera el hash de tu nueva contraseña usando este código en la consola del navegador:

```javascript
(async () => {
  const password = 'TuNuevaContraseña123!';
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  console.log('Hash:', hashHex);
  console.log('Copia este hash y úsalo en el script SQL');
})();
```

4. Reemplaza `'AQUI_VA_EL_HASH_GENERADO'` en el script SQL con el hash generado
5. Ejecuta el script SQL

### Método 3: Script JavaScript desde Consola

1. Abre la aplicación OpsFlow en el navegador
2. Abre la consola (F12)
3. Carga el script `utils/fixUserPassword.js`
4. Ejecuta:
   ```javascript
   fixUserPassword('aminano@opaloperu.com', 'contraseña-actual', 'NuevaContraseña123!')
   ```

---

## 🔒 Seguridad

- El sistema de recuperación web **solo funciona** para el email `aminano@opaloperu.com`
- El sistema verifica que el usuario tenga el rol `SUPER_ADMIN`
- Se requiere un código de verificación adicional
- Todos los intentos de recuperación se registran en la auditoría (si es posible)

## ⚠️ Restricciones

- **Solo el Super Administrador** puede usar este sistema
- Otros usuarios **NO** pueden acceder a este sistema de recuperación
- El código de verificación es único y no se puede cambiar sin modificar el código

## 📝 Notas

- Si también tienes una cuenta en Supabase Auth, puede que necesites resetear la contraseña allí también
- Después de resetear, asegúrate de actualizar cualquier otra aplicación que use las mismas credenciales
- Guarda tu nueva contraseña en un gestor de contraseñas seguro

---

**Última actualización:** 2024
**Código de verificación válido hasta:** Indefinido (cambiar en código si es necesario)
