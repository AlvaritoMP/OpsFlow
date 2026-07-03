# Integración OpsFlow → Opalosis (RRHH) — Bandeja de llegada

Canal de envío de ingresos de personal desde OpsFlow hacia la bandeja de llegada de Opalosis.

## Flujo operativo

```
Opalo ATS  →  Recepción ATS (OpsFlow)  →  Asignar a unidad
                                              ↓
                                    Cola hr_outbound_ingreso_queue
                                              ↓
                              Reporte diario (UI Envío Opalosis)
                                              ↓
              POST /api/opsflow/registro-ingreso (por trabajador)
                                              ↓
                         Bandeja de llegada Opalosis (RRHH)
```

1. **ATS** envía candidatos a OpsFlow (ya implementado).
2. El operador **asigna el candidato a una unidad** → se encola automáticamente.
3. En **Envío Opalosis**, el operador revisa la cola del día y envía el lote.
4. Por cada trabajador, OpsFlow llama al API de Opalosis y el ingreso aparece en su bandeja.

## API Opalosis (entorno de pruebas)

### Endpoint

```
POST https://onyx.opaloperu.com/apiempleadoregistro/api/opsflow/registro-ingreso
```

### Headers

| Header | Valor |
|--------|--------|
| `Content-Type` | `application/json` |
| `X-Api-Key` | Clave entregada por Opalosis (pruebas: ver equipo RRHH) |

### Body mínimo (modo prueba)

```json
{
  "TipoDocumentoId": 1,
  "Documento": "12345678",
  "ApellidoPaterno": "Perez",
  "ApellidoMaterno": "Gomez",
  "Nombres": "Juan Carlos",
  "Sexo": "M",
  "FechaIngreso": "2026-07-01"
}
```

- `FechaIngreso` en formato **ISO `YYYY-MM-DD`**.
- `TipoDocumentoId`: `1` = DNI (entorno de pruebas).
- Campos adicionales pueden omitirse o enviarse como `null`; el mismo endpoint acepta el registro completo a medida que avance la integración.

### Respuesta esperada

```json
{
  "Resultado": true,
  "Mensaje": "Se registro ingreso.",
  "MensajeError": "sin errores",
  "IngresoId": 43,
  "IngresoCod": "ING-020726-08",
  "FechaRegistro": "2026-07-02T16:58:43.54"
}
```

### Prueba directa (sin Supabase)

```powershell
.\scripts\test-opalosis-registro-ingreso.ps1
```

## Arquitectura técnica

```
OpsFlow UI  →  Edge Function hr-opalosis-integration  →  POST registro-ingreso (×N)
              ↓
    hr_outbound_ingreso_queue / _packages / _package_items
```

OpsFlow agrupa el envío del día en un **paquete local** (historial y trazabilidad), pero la comunicación con Opalosis es **un POST por trabajador**.

## 1. Migración SQL

Ejecutar en Supabase OpsFlow:

```
database/migrations/MIGRATION_HR_OPALOSIS_INTEGRATION.sql
```

## 2. Edge Function

### Acciones

| action | Descripción |
|--------|-------------|
| `send-package` | Envía cada trabajador de la cola a `registro-ingreso` |
| `test-registro-ingreso` | Prueba de conectividad con payload mínimo |
| `fetch-unidades` | Sincroniza catálogo RRHH (cuando esté disponible) |
| `check-package-status` | Devuelve estado local guardado al enviar |

### Secrets (Supabase)

| Variable | Descripción | Ejemplo pruebas |
|----------|-------------|-----------------|
| `OPALOSIS_API_BASE_URL` | URL base | `https://onyx.opaloperu.com/apiempleadoregistro` |
| `OPALOSIS_API_KEY` | Header `X-Api-Key` | *(entregada por Opalosis)* |
| `OPALOSIS_USE_MOCK` | `true` fuerza simulación; `false` fuerza API real | `false` |

Sin URL/Key → **modo simulación** automático.

### Despliegue

```powershell
$env:OPALOSIS_API_BASE_URL = "https://onyx.opaloperu.com/apiempleadoregistro"
$env:OPALOSIS_API_KEY = "tu-api-key"
$env:OPALOSIS_USE_MOCK = "false"
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
.\scripts\deploy-hr-opalosis-integration.ps1
```

## 3. UI OpsFlow

Menú: **Envío Opalosis** (permiso `HR_OPALOSIS`).

- **Cola pendiente**: trabajadores asignados desde ATS (filtro por fecha).
- Selección / exclusión antes del envío.
- **Paquetes enviados**: historial con `IngresoCod` / `IngresoId` por trabajador.

## 4. Hook automático

Al registrar colaborador desde **Recepción ATS** (`RegisterHandoffWorkerModal`):

```
crear resource → registerItemAsResource → enqueueFromAssignment()
```

## 5. Mapeo de campos

| OpsFlow (`hr_fields`) | Opalosis API |
|-----------------------|--------------|
| `tipo_documento` DNI | `TipoDocumentoId` = 1 |
| `documento` | `Documento` |
| `apellido_paterno` | `ApellidoPaterno` |
| `apellido_materno` | `ApellidoMaterno` |
| `nombres` | `Nombres` |
| `sexo` | `Sexo` |
| `fecha_ingreso` | `FechaIngreso` |
| `fecha_nacimiento` | `FechaNacimiento` |
| `cargo` | `Cargo` |
| `correo_personal` | `CorreoPersonal` |
| `telefono` | `Telefono` |
| `direccion` | `Direccion` |
| `empresa_codigo` | `EmpresaCodigo` |
| `unidad_id` | `UnidadId` |
| `ref_operaciones` | `RefOperaciones` |

Los datos provienen del snapshot OpsFlow + ATS al asignar el trabajador a una unidad.

## 6. Fechas

- UI OpsFlow: **dd-MM-yyyy**
- API Opalosis: **yyyy-MM-dd**

## 7. Pendiente

- Cese de personal
- APIs inbound Opalosis → OpsFlow (reconciliación)
- UI admin de `hr_unit_mappings`
- Catálogo `GET /api/unidades` en entorno de pruebas

## 8. Código

| Archivo | Propósito |
|---------|-----------|
| `services/hrOutboundIngresoService.ts` | Cola, paquetes, envío |
| `utils/hrOpalosisMapper.ts` | Snapshot + mapeo hrFields + payload API |
| `components/HrOpalosisIngreso.tsx` | Reporte diario |
| `components/RegisterHandoffWorkerModal.tsx` | Hook de encolado |
| `supabase/functions/hr-opalosis-integration/index.ts` | Proxy outbound |
| `scripts/test-opalosis-registro-ingreso.ps1` | Prueba directa del API |
