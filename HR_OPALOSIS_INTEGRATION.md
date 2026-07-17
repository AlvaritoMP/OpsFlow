# Integración OpsFlow → Opalosis (RRHH)

Canal de envío de solicitudes de ingreso desde OpsFlow hacia OpaloSis / PortalEmpleado.

## Flujo operativo

```
Opalo ATS → Recepción ATS → Asignar a unidad
                                  ↓
                        Cola Envío Opalosis
                                  ↓
              Completar formulario (catálogos + SharePoint)
                                  ↓
              POST /registro-ingreso (por trabajador)
                                  ↓
              Bandeja OpaloSis (Estado / Etapa)
                                  ↓
         GET /solicitudes-ingreso (consulta de avance)
```

## URL base

```
https://onyx.opaloperu.com/apiempleadoregistro/api/opsflow/
```

Autenticación: header `X-Api-Key`.

## Secrets Supabase (Edge Function)

| Variable | Valor de pruebas |
|----------|------------------|
| `OPALOSIS_API_BASE_URL` | `https://onyx.opaloperu.com/apiempleadoregistro/api/opsflow` |
| `OPALOSIS_API_KEY` | *(entregada por Opalo)* |
| `OPALOSIS_USE_MOCK` | `false` |

## Migraciones SQL

1. `database/migrations/MIGRATION_HR_OPALOSIS_INTEGRATION.sql`
2. `database/migrations/MIGRATION_HR_OPALOSIS_SOLICITUD_TRACKING.sql` ← IngresoCod / Estado / Etapa

## Edge Function `hr-opalosis-integration`

| action | Descripción |
|--------|-------------|
| `send-package` | POST registro-ingreso por cada trabajador de la cola |
| `fetch-catalog` | Proxy a GET catálogos (cargo, lugar, ubigeo, etc.) |
| `check-package-status` | GET solicitudes-ingreso y actualiza Estado/Etapa |
| `test-registro-ingreso` | Prueba de conectividad |

### Despliegue

```powershell
$env:OPALOSIS_API_BASE_URL = "https://onyx.opaloperu.com/apiempleadoregistro/api/opsflow"
$env:OPALOSIS_API_KEY = "tu-api-key"
$env:OPALOSIS_USE_MOCK = "false"
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
.\scripts\deploy-hr-opalosis-integration.ps1
```

## Inventario de campos (retiquetado dinámico en Opalosis)

No hay mapeo estándar 1:1 entre ATS, OpsFlow y Opalosis. En el camino pueden nacer
campos arbitrarios (ej. `mascotas` en un proceso del ATS). OpsFlow envía **todos** esos
datos con la etiqueta/clave del origen; el usuario de Opalosis, al procesar al trabajador,
decide por cada ítem:

1. ¿Lo usa o lo descarta?
2. Si lo usa, ¿con qué etiqueta de su BD? (ej. `mascotas` → `animales`)

El caso DNI es solo un ejemplo: en OpsFlow/ATS se llama `DNI` aunque el valor pueda ser
pasaporte o CE; en Opalosis pueden ser campos tipados distintos. El mismo patrón aplica
a **cualquier** dato dinámico.

Cada `POST /registro-ingreso` incluye en `PayloadJson.fieldInventory` ítems con
`classificationRequired: true`, más `raw.ats.fields` completo para no perder claves nuevas.

## Campos recomendados (RegistroIngresoDTO)

Obligatorios de negocio para evitar observaciones RRHH:

- TipoDocumentoId, Documento, ApellidoPaterno, ApellidoMaterno, Nombres
- FechaIngreso, EmpleadoCargoId, LugarTrabajoId
- Sueldo (> 0), Movilidad (puede ser 0)
- UrlDocumentoAdjunto (carpeta SharePoint por DNI)

Biblioteca SharePoint:

```
https://opaloperu1.sharepoint.com/:f:/s/INDICADORESRRHH/IgB1TkyjRpcpSLPf-jZj9HUIAZY7gf2sdub0qIvk6ZqyVkU?e=253bjH
```

## Estados Opalosis

| Estado | Significado |
|--------|-------------|
| Recibido | Solicitud en gestión interna |
| Observado | RRHH procesando etapas |
| Procesado | Completada |
| Rechazado | Rechazada |

Etapas: Nuevo → Empleado Registrado → Contrato Generado → En Aprobación → Contrato Aprobado

## Reglas de integración

- HTTP 200 + `Resultado: false` = rechazo de negocio → mostrar Mensaje, no reintentar.
- HTTP ≠ 200 = fallo técnico → reintentar.
- PaisId por defecto: **173** (Perú).
- Un documento con solicitud en Recibido/Observado no admite nuevo registro.

## UI OpsFlow

Menú **Envío Opalosis** (`HR_OPALOSIS`):

1. Cola pendiente → **Completar / editar** (catálogos + adjunto)
2. Enviar lote
3. Historial → **Actualizar Estado / Etapa**

## Código

| Archivo | Rol |
|---------|-----|
| `utils/hrOpalosisMapper.ts` | Snapshot + RegistroIngresoDTO |
| `services/hrOutboundIngresoService.ts` | Cola, catálogos, envío |
| `components/HrOpalosisIngreso.tsx` | Bandeja / historial |
| `components/HrOpalosisEditQueueItemModal.tsx` | Formulario completo |
| `supabase/functions/hr-opalosis-integration/index.ts` | Proxy API |
| `scripts/test-opalosis-registro-ingreso.ps1` | Prueba directa |
