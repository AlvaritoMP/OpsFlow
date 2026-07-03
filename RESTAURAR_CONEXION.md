# 🔄 Restaurar Conexión de Git/GitHub en Cursor

## Problema
El Personal Access Token ya estaba configurado pero ahora no funciona. Esto puede ser por:
- Token expirado
- Credenciales corrompidas en Windows
- Token revocado
- Cursor perdió acceso a las credenciales guardadas

## Solución: Limpiar y Restaurar

### Paso 1: Limpiar Credenciales Antiguas

1. Abre el Explorador de Archivos
2. Ve a: `c:\Users\alvaro\.cursor\OpsFlow`
3. Haz **doble clic** en: `limpiar-y-restaurar-credenciales.bat`
4. Este script:
   - Eliminará credenciales guardadas en Windows Credential Manager
   - Limpiará la configuración de Git
   - Reconfigurará Git para usar Windows Credential Manager

### Paso 2: Verificar si tu Token Actual Funciona

1. Haz **doble clic** en: `verificar-token-existente.bat`
2. Si funciona → ¡Listo! Puedes hacer pull
3. Si no funciona → Continúa al Paso 3

### Paso 3: Verificar/Crear Token en GitHub

1. Ve a: **https://github.com/settings/tokens**
2. Revisa si tienes tokens activos:
   - Si hay tokens pero están cerca de expirar → Considera crear uno nuevo
   - Si no hay tokens o expiraron → Crea uno nuevo
3. Para crear uno nuevo:
   - Click en **"Generate new token"** → **"Generate new token (classic)"**
   - **Note:** `OpsFlow Development` 
   - **Expiration:** 90 días o 1 año
   - **Select scopes:** Marca **`repo`**
   - Click en **"Generate token"**
   - **COPIA EL TOKEN** inmediatamente

### Paso 4: Reingresar Credenciales

1. Ejecuta: `pull-con-token.bat` o `pull-ultima-version.bat`
2. Cuando Git pida credenciales:
   - **Usuario:** Tu nombre de usuario de GitHub
   - **Password:** Pega el token (NO tu contraseña)
3. Windows guardará las credenciales automáticamente

## ¿Por qué se Perdió la Conexión?

Posibles causas:
1. **Token expirado:** Los tokens tienen fecha de expiración
2. **Token revocado:** Si lo revocaste manualmente en GitHub
3. **Credenciales corrompidas:** Windows puede corromper credenciales guardadas
4. **Actualización de Cursor/Git:** Puede haber resetado la configuración
5. **Cambio de políticas de GitHub:** GitHub puede requerir tokens más recientes

## Verificar Tokens Existentes

Para ver todos tus tokens activos:
1. Ve a: https://github.com/settings/tokens
2. Verás una lista de tokens con fechas de expiración
3. Puedes:
   - Usar un token existente si aún es válido
   - Revocar tokens antiguos
   - Crear uno nuevo

## Prevención

Para evitar que esto pase de nuevo:
1. **Usa tokens con expiración larga** (1 año o sin expiración para desarrollo)
2. **Guarda el token en un gestor de contraseñas** (por si necesitas reingresarlo)
3. **Verifica tokens periódicamente** en GitHub Settings
