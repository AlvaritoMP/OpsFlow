# Análisis de Migración a Google Maps

## Situación Actual

El usuario menciona que actualmente se está usando OpenStreetMap y que hay un problema de posicionamiento: las coordenadas obtenidas con la API de Google Maps no coinciden con las posiciones mostradas en OpenStreetMap.

## Problema

- **OpenStreetMap** y **Google Maps** usan diferentes sistemas de coordenadas/proyecciones
- Las coordenadas obtenidas con Google Geocoding API están optimizadas para Google Maps
- Al mostrar estas coordenadas en OpenStreetMap, hay desalineación

## Solución Propuesta

Migrar completamente a **Google Maps** para tener consistencia entre:
1. **Geocodificación**: Google Geocoding API para convertir direcciones a coordenadas
2. **Visualización**: Google Maps para mostrar las ubicaciones

## Ventajas de Google Maps

1. **Consistencia**: Coordenadas y visualización del mismo proveedor
2. **Precisión**: Mejor precisión en geocodificación
3. **Características**: Street View, tráfico, rutas, etc.
4. **Integración**: Mejor integración con otros servicios de Google

## Cambios Necesarios

### 1. Dependencias
- Agregar `@react-google-maps/api` para React
- O usar la API de JavaScript de Google Maps directamente

### 2. Variables de Entorno
- `VITE_GOOGLE_MAPS_API_KEY`: API key de Google Maps

### 3. Componentes Nuevos
- Servicio de geocodificación con Google Maps API
- Componente de mapa para Dashboard

### 4. Base de Datos (Opcional)
- Considerar agregar campos `latitude` y `longitude` a la tabla `units` para cachear coordenadas

## Consideraciones

1. **Costos**: Google Maps tiene límites en el plan gratuito (200 USD/mes de créditos)
2. **API Key**: Necesitas configurar restricciones de dominio
3. **Límites de uso**: 40,000 solicitudes/mes en el plan gratuito para Geocoding
