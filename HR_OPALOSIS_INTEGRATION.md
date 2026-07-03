# Integración OpsFlow → Opalosis (RRHH) — Ingresos por paquetes

Canal de envío de ingresos de personal desde OpsFlow hacia la bandeja diaria de Opalosis.

## Flujo operativo

```
Opalo ATS  →  Recepción ATS (OpsFlow)  →  Asignar a unidad
                                              ↓
                                    Cola hr_outbound_ingreso_queue
                                              ↓
                              Reporte diario (UI Envío Opalosis)
                                              ↓
                         POST paquete → Bandeja Opalosis (RRHH)
```

1. **ATS** envía candidatos a OpsFlow (ya implementado).
2. El operador **asigna el candidato a una unidad** → se encola automáticamente.
3. En **Envío Opalosis**, el operador revisa la cola del día y envía un **paquete batch**.
4. **Opalosis** recibe el paquete en su bandeja de recepción diaria.

## Arquitectura técnica

```
OpsFlow UI  →  Edge Function hr-opalosis-integration  →  POST /api/ingresos/paquetes
              ↓
    hr_outbound_ingreso_queue / _packages / _package_items
```

## 1. Migración SQL

Ejecutar en Supabase OpsFlow:

```
database/migrations/MIGRATION_HR_OPALOSIS_INTEGRATION.sql
```

Tablas:

| Tabla | Propósito |
|-------|-----------|
| `hr_outbound_ingreso_queue` | Cola automática post-asignación ATS |
| `hr_outbound_ingreso_packages` | Paquetes enviados a Opalosis |
| `hr_outbound_ingreso_package_items` | Trabajadores en cada paquete |
| `hr_units_cache` | Cache GET `/api/unidades` |
| `hr_unit_mappings` | Mapeo unidad OpsFlow ↔ Opalosis + empresa_codigo |

## 2. Edge Function

### Acciones

| action | Descripción |
|--------|-------------|
| `send-package` | Crea paquete y envía a Opalosis |
| `fetch-unidades` | Sincroniza catálogo RRHH |
| `check-package-status` | Consulta estado del paquete |

### Contrato outbound (paquete)

```json
{
  "sourceApp": "OpsFlow",
  "sourcePackageId": "550e8400-e29b-41d4-a716-446655440000",
  "payloadVersion": 1,
  "sentAt": "2026-06-10T18:00:00.000Z",
  "reportDate": "2026-06-10",
  "workerCount": 2,
  "senderNote": "Ingresos del día",
  "createdByName": "María Operaciones",
  "items": [
    {
      "refOperaciones": "OPS-10062026-01",
      "resourceId": "uuid-resource",
      "opsflowUnitId": "uuid-unit",
      "workerName": "Carlos García",
      "workerSnapshot": { "opsflow": {}, "ats": {} },
      "hrFields": {
        "tipo": "ingreso",
        "empresa_codigo": 103,
        "documento": "45578784",
        "...": "campos mapeados del contrato Opalosis"
      }
    }
  ]
}
```

- **`workerSnapshot`**: todo lo disponible (OpsFlow + ATS).
- **`hrFields`**: capa mapeada al contrato referencial Opalosis.

### Endpoint Opalosis (a acordar con RRHH)

```
POST /api/ingresos/paquetes
GET  /api/ingresos/paquetes/{sourcePackageId}
GET  /api/unidades
```

### Secrets

| Variable | Descripción |
|----------|-------------|
| `OPALOSIS_API_BASE_URL` | URL base Opalosis |
| `OPALOSIS_API_KEY` | Header `X-Api-Key` |
| `OPALOSIS_USE_MOCK` | `true` / `false` |

Sin URL/Key → **modo simulación** automático.

### Despliegue

```powershell
.\scripts\deploy-hr-opalosis-integration.ps1
```

## 3. UI OpsFlow

Menú: **Envío Opalosis** (permiso `HR_OPALOSIS`).

- **Cola pendiente**: trabajadores asignados hoy (filtro por fecha).
- Selección / exclusión antes del envío.
- **Paquetes enviados**: historial y consulta de estado.

## 4. Hook automático

Al registrar colaborador desde **Recepción ATS** (`RegisterHandoffWorkerModal`):

```
crear resource → registerItemAsResource → enqueueFromAssignment()
```

## 5. Fechas

- UI OpsFlow: **dd-MM-yyyy**
- API Opalosis (`hrFields`): **yyyy-MM-dd**

## 6. Pendiente

- Cese de personal
- APIs inbound Opalosis → OpsFlow (reconciliación)
- UI admin de `hr_unit_mappings`
- Acuerdo formal del endpoint de bandeja con equipo Opalosis

## 7. Código

| Archivo | Propósito |
|---------|-----------|
| `services/hrOutboundIngresoService.ts` | Cola, paquetes, envío |
| `utils/hrOpalosisMapper.ts` | Snapshot + mapeo hrFields |
| `components/HrOpalosisIngreso.tsx` | Reporte diario |
| `components/RegisterHandoffWorkerModal.tsx` | Hook de encolado |
| `supabase/functions/hr-opalosis-integration/index.ts` | Proxy outbound |
