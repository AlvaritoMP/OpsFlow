# Explicación sobre RLS (Row Level Security) y "Unrestricted"

## ¿Qué significa "Unrestricted" en Supabase?

- **"Unrestricted"** = RLS (Row Level Security) **DESHABILITADO**
- **Sin etiqueta "Unrestricted"** = RLS **ACTIVO** (puede bloquear consultas)

## ¿Afecta el Desempeño?

**NO, al contrario:**
- ✅ **RLS Deshabilitado (Unrestricted)**: Consultas más rápidas, sin verificaciones adicionales
- ⚠️ **RLS Activado**: Consultas más lentas (Supabase verifica políticas en cada consulta)

Para apps internas con pocos usuarios, **deshabilitar RLS es la mejor opción** porque:
1. Mejor rendimiento
2. Menos complejidad
3. Más control desde la aplicación

## Seguridad

Para apps internas:
- ✅ **Seguro**: Solo usuarios autenticados pueden acceder (controlado desde la app)
- ✅ **Simple**: No necesitas configurar políticas complejas
- ✅ **Eficiente**: Sin overhead de verificación de políticas

Para apps públicas:
- ⚠️ **Considera RLS**: Para protección adicional a nivel de base de datos

## Verificar Estado de RLS

Ejecuta `database/verify_rls_disabled.sql` para ver qué tablas tienen RLS activo.

## Deshabilitar RLS en Todas las Tablas

Si quieres asegurarte de que todas las tablas tengan RLS deshabilitado:

1. Ejecuta `database/disable_all_rls.sql` - Deshabilitará RLS en TODAS las tablas automáticamente
2. O ejecuta `database/disable_rls.sql` - Deshabilita RLS en tablas específicas

## Recomendación

Para tu app interna: **Mantén RLS deshabilitado en todas las tablas**. Es más simple, más rápido y suficiente para tus necesidades.

