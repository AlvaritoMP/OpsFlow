# Sistema de Constancias de Entrega

## Descripción

El sistema permite generar constancias en PDF para la entrega de:
- **EPPs y Activos** asignados a trabajadores
- **Maquinarias y Equipos** asignados a la unidad con trabajador responsable

Cada constancia incluye:
- Código correlativo único (formato: `CONST-YYYY-000001`)
- Declaración jurada del trabajador
- Compromisos de cuidado y devolución
- Información del trabajador (nombre y DNI)
- Items entregados con detalles

## Instalación

1. Instalar jsPDF:
```bash
npm install jspdf
```

2. Ejecutar el script SQL para crear la tabla de constancias:
```sql
-- Ejecutar en Supabase SQL Editor
-- Ver archivo: database/delivery_constancies_schema.sql
```

## Uso

### Constancias de EPPs/Activos

1. Ir a la sección **Personal** de una unidad
2. Seleccionar uno o más trabajadores
3. Hacer clic en **"+ Entrega EPP"**
4. Completar el formulario:
   - Nombre del activo
   - Tipo (EPP, Uniforme, Tecnología, Herramienta, Otro)
   - Fecha de entrega
   - N° Serie (opcional)
5. **Marcar el checkbox** "Generar constancia de entrega en PDF"
6. Hacer clic en **"Registrar Entrega"**

**Nota:** El trabajador debe tener DNI registrado para generar la constancia.

### Constancias de Maquinarias/Equipos

1. Ir a la sección **Logística** de una unidad
2. Hacer clic en **"+ Maquinaria"**
3. Completar el formulario:
   - Nombre del equipo
   - Cantidad
   - Zonas asignadas
   - SKU (opcional)
4. **Seleccionar un trabajador responsable** del dropdown
5. **Marcar el checkbox** "Generar constancia de entrega de maquinaria en PDF"
6. Hacer clic en **"Registrar"**

**Nota:** El trabajador responsable debe tener DNI registrado.

## Contenido de las Constancias

### Para EPPs/Activos

La constancia incluye:
- Información general (código, fecha, unidad, trabajador, DNI)
- Lista de items entregados
- **Declaración jurada** donde el trabajador:
  - Declara recibir los items en buen estado
  - Se compromete a devolverlos en el mejor estado posible
  - Acepta descuento por planilla si no devuelve o devuelve en mal estado
  - Se compromete a reportar desperfectos inmediatamente
- Espacios para firmas (trabajador y responsable)

### Para Maquinarias/Equipos

La constancia incluye:
- Información general (código, fecha, unidad, trabajador responsable, DNI)
- Detalles del equipo/maquinaria
- **Declaración jurada** donde el trabajador:
  - Declara recibir la maquinaria en buen estado
  - Se compromete a hacer uso adecuado
  - Se compromete a cuidar y mantener en buen estado
  - Se compromete a avisar inmediatamente de desperfectos
  - Acepta asumir costos por daños por uso/manipulación incorrecta vía descuento por planilla
- Espacios para firmas (trabajador y responsable)

## Códigos Correlativos

- Formato: `CONST-YYYY-000001`
- Se generan automáticamente de forma secuencial
- No se repiten (único por año)
- Se almacenan en la base de datos para trazabilidad

## Almacenamiento

Todas las constancias generadas se guardan en la tabla `delivery_constancies` con:
- Código único
- Información del trabajador
- Items entregados
- Fecha de generación
- Usuario que generó la constancia

## Archivos Generados

Los PDFs se descargan automáticamente con el nombre:
- EPPs/Activos: `constancia-{CODIGO}-{NOMBRE_TRABAJADOR}.pdf`
- Maquinarias: `constancia-maquinaria-{CODIGO}-{NOMBRE_TRABAJADOR}.pdf`

## Requisitos

- Trabajador debe tener **DNI registrado** en el sistema
- jsPDF instalado (`npm install jspdf`)
- Tabla `delivery_constancies` creada en Supabase

## Notas Técnicas

- Las constancias se generan en formato A4
- Incluyen encabezado con logo/colores corporativos
- Formato similar a guías de despacho
- Los PDFs se generan en el cliente (navegador)
- No se requiere servidor para la generación de PDFs

