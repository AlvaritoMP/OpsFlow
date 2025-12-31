# Configuración de Google Maps

## Descripción

Se ha migrado la visualización de mapas de OpenStreetMap a Google Maps para garantizar consistencia entre las coordenadas obtenidas mediante la API de Google Geocoding y su visualización en el mapa.

## ¿Por qué Google Maps?

1. **Consistencia**: Las coordenadas obtenidas con Google Geocoding API están optimizadas para Google Maps
2. **Precisión**: Mejor precisión en geocodificación de direcciones
3. **Características**: Street View, tráfico, rutas, y más funcionalidades
4. **Sincronización**: Elimina problemas de desalineación entre sistemas

## Componentes Implementados

### 1. Servicio de Geocodificación (`services/geocodingService.ts`)
- Convierte direcciones en coordenadas (latitud, longitud)
- Usa Google Geocoding API
- Soporta geocodificación múltiple con rate limiting

### 2. Componente de Mapa (`components/UnitsMap.tsx`)
- Muestra las unidades en un mapa interactivo de Google Maps
- Marcadores clicables con información de cada unidad
- Geocodificación automática de direcciones
- Cache de geocodificaciones para mejorar rendimiento

### 3. Integración en Dashboard
- El mapa se muestra en el Dashboard principal
- Click en marcadores para ver detalles de unidades
- Integración con el sistema de selección de unidades existente

## Configuración Requerida

### 1. Obtener API Key de Google Maps

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Ve a **APIs & Services > Library**
4. Habilita las siguientes APIs:
   - **Maps JavaScript API** (para mostrar el mapa)
   - **Geocoding API** (para convertir direcciones a coordenadas)
5. Ve a **APIs & Services > Credentials**
6. Click en **Create Credentials > API Key**
7. Copia la API Key generada

### 2. Configurar Restricciones de API Key (Recomendado)

Para mayor seguridad, configura restricciones en tu API Key:

1. En **APIs & Services > Credentials**, click en tu API Key
2. En **API restrictions**, selecciona:
   - Maps JavaScript API
   - Geocoding API
3. En **Application restrictions**, puedes restringir por:
   - **HTTP referrers** (para producción): Agrega tu dominio
   - **IP addresses** (para desarrollo): Agrega tu IP

### 3. Configurar Variable de Entorno

Agrega la siguiente variable de entorno:

```env
VITE_GOOGLE_MAPS_API_KEY=tu_api_key_aqui
```

#### En EasyPanel:
1. Ve a tu proyecto en EasyPanel
2. Navega a **Environment Variables**
3. Agrega:
   - **Key**: `VITE_GOOGLE_MAPS_API_KEY`
   - **Value**: Tu API key de Google Maps

#### En desarrollo local:
Crea o actualiza el archivo `.env` en la raíz del proyecto:

```env
VITE_GOOGLE_MAPS_API_KEY=tu_api_key_aqui
```

## Dependencias Instaladas

- `@vis.gl/react-google-maps`: Librería oficial de Google para React

## Uso

El mapa se muestra automáticamente en el Dashboard cuando:
- Hay unidades registradas
- La API Key está configurada correctamente
- Las unidades tienen direcciones válidas

### Funcionalidades del Mapa

- **Geocodificación automática**: Las direcciones se convierten a coordenadas automáticamente
- **Marcadores interactivos**: Click en un marcador para ver información de la unidad
- **Zoom automático**: El mapa se centra automáticamente en las unidades
- **InfoWindow**: Muestra nombre, cliente, dirección y estado de la unidad

## Costos y Límites

### Plan Gratuito de Google Maps

- **200 USD/mes en créditos gratuitos**
- **Geocoding API**: 40,000 solicitudes/mes
- **Maps JavaScript API**: Sin límite de carga de mapas

### Consideraciones

- Las geocodificaciones se cachean para evitar solicitudes repetidas
- Solo se geocodifican direcciones nuevas o no cacheadas
- Se procesan en lotes para evitar rate limiting

## Troubleshooting

### El mapa no se muestra

1. Verifica que `VITE_GOOGLE_MAPS_API_KEY` esté configurada
2. Verifica que las APIs estén habilitadas en Google Cloud Console
3. Revisa la consola del navegador para errores
4. Verifica que no hay restricciones de dominio que bloqueen tu sitio

### Error: "REQUEST_DENIED"

- Verifica que las APIs estén habilitadas
- Verifica las restricciones de API Key
- Asegúrate de que tu dominio esté en la lista de referrers permitidos

### Error: "OVER_QUERY_LIMIT"

- Has excedido el límite de solicitudes
- Considera implementar un cache más robusto
- Verifica el uso en Google Cloud Console

### Coordenadas incorrectas

- Las coordenadas ahora son consistentes con Google Maps
- Si encuentras discrepancias, verifica la dirección en Google Maps directamente
- Considera agregar más detalles a las direcciones (ciudad, país)

## Migración desde OpenStreetMap

Si tenías implementación con OpenStreetMap:

1. **Coordenadas**: Las coordenadas ahora son compatibles con Google Maps
2. **Visualización**: El mapa usa Google Maps en lugar de OpenStreetMap
3. **Geocodificación**: Ahora usa Google Geocoding API en lugar de servicios de OSM

## Próximos Pasos (Opcional)

- Agregar campos `latitude` y `longitude` a la tabla `units` para cachear coordenadas en la base de datos
- Implementar geocodificación al crear/editar unidades
- Agregar rutas entre unidades
- Implementar filtros por ubicación
- Agregar clusters de marcadores para mejor visualización con muchas unidades
