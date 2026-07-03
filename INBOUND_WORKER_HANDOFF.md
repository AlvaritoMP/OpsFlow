# Recepción de trabajadores desde Opalo ATS

Canal de ingesta entre Opalo ATS (selección) y OpsFlow (operaciones). Opalo ATS envía paquetes manualmente; OpsFlow los recibe, revisa y procesa internamente.

## Arquitectura

```
Opalo ATS  →  (proxy ATS, pendiente)  →  Edge Function OpsFlow  →  BD OpsFlow
```

- **No** hay lectura cruzada entre Supabase del ATS y Supabase de OpsFlow.
- `source_package_id` y `source_candidate_id` son solo trazabilidad (sin FK externa).

## 1. Migración SQL (Supabase OpsFlow)

Ejecutar en el SQL Editor del proyecto **OpsFlow**:

1. `database/migrations/MIGRATION_ADD_INBOUND_WORKER_HANDOFF.sql`
2. (Recomendado) `database/migrations/opsflow_rls_permissive_for_app.sql` — aplica políticas RLS a las tablas nuevas.

Tablas creadas:

- `inbound_worker_handoff_packages`
- `inbound_worker_handoff_items`

## 2. Edge Function de ingesta

### URL del endpoint

```
POST https://<PROJECT_REF>.supabase.co/functions/v1/receive-worker-handoff
```

Ejemplo con el proyecto actual:

```
POST https://rlnfehtgspnkyeevduli.supabase.co/functions/v1/receive-worker-handoff
```

### Autenticación

| Header | Valor |
|--------|--------|
| `Authorization` | `Bearer <OPSFLOW_HANDOFF_INGEST_SECRET>` |
| `Content-Type` | `application/json` |

Respuesta **401** si el secret es inválido o falta.

### Variables de entorno (Secrets de la Edge Function)

| Variable | Descripción |
|----------|-------------|
| `OPSFLOW_HANDOFF_INGEST_SECRET` | Secret compartido con Opalo ATS (generar valor aleatorio largo) |
| `SUPABASE_URL` | URL del proyecto OpsFlow |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key de OpsFlow (solo servidor) |

### Despliegue

**Script automatizado (recomendado):**

```powershell
# Obtén token en https://supabase.com/dashboard/account/tokens
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."   # Settings > API > service_role
.\scripts\deploy-receive-worker-handoff.ps1
```

El script genera `OPSFLOW_HANDOFF_INGEST_SECRET`, configura secrets, despliega la función y opcionalmente ejecuta un POST de prueba.

**Manual con CLI:**

```powershell
# Desde la raíz del repo OpsFlow
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase secrets set OPSFLOW_HANDOFF_INGEST_SECRET=<tu-secret-seguro>
npx supabase functions deploy receive-worker-handoff
```

También puedes desplegar desde el Dashboard de Supabase copiando `supabase/functions/receive-worker-handoff/index.ts`.

### Contrato JSON (body)

```json
{
  "sourcePackageId": "550e8400-e29b-41d4-a716-446655440000",
  "sourceApp": "Opalo ATS",
  "payloadVersion": 1,
  "sentAt": "2026-05-25T14:30:00.000Z",
  "workerCount": 2,
  "senderNote": "Envío urgente para Lima Norte",
  "createdByName": "María Reclutadora",
  "items": [
    {
      "sourceCandidateId": "660e8400-e29b-41d4-a716-446655440001",
      "sourceProcessId": "770e8400-e29b-41d4-a716-446655440002",
      "workerName": "Juan Pérez",
      "workerSnapshot": {
        "identity": {
          "fullName": "Juan Pérez",
          "dni": "12345678",
          "email": "juan@example.com",
          "phone": "999888777"
        },
        "fields": {
          "address": "Av. Example 123",
          "province": "Lima",
          "processTitle": "Operario de almacén",
          "clientName": "Cliente Demo",
          "agreedSalary": "1500",
          "hireDate": "2026-06-01"
        },
        "meta": {
          "sourceCandidateId": "660e8400-e29b-41d4-a716-446655440001",
          "sourceProcessId": "770e8400-e29b-41d4-a716-446655440002",
          "sourceApp": "Opalo ATS",
          "snapshotVersion": 1,
          "includedFieldKeys": ["address", "province", "processTitle", "clientName", "agreedSalary", "hireDate"],
          "capturedAt": "2026-05-25T14:30:00.000Z"
        }
      }
    }
  ]
}
```

### Respuestas

| Código | Significado |
|--------|-------------|
| **201** | Paquete creado: `{ "id", "sourcePackageId", "status": "received" }` |
| **200** | Idempotente — ya existía: `{ "id", "sourcePackageId", "status", "duplicate": true }` |
| **400** | Validación fallida |
| **401** | Secret inválido |
| **500** | Error interno |

### Reglas

- Idempotencia por `sourcePackageId` (UNIQUE en BD).
- Mínimo 1 ítem; `workerCount` debe coincidir con `items.length`.
- Cada ítem requiere `workerName` o `workerSnapshot.identity.fullName` / `dni`.
- `workerSnapshot` se almacena **sin modificar**.

## 3. UI OpsFlow

Menú lateral: **Recepción ATS** (permiso `ATS_RECEPTION`).

Flujo:

1. Paquete llega con estado `received`
2. Operador: **Recibir / Abrir** → `processing`
3. Por trabajador: aceptar / rechazar ítem
4. Cerrar paquete: `completed` | `partially_completed` | `rejected`

## 4. Prueba manual con curl

```bash
curl -X POST "https://rlnfehtgspnkyeevduli.supabase.co/functions/v1/receive-worker-handoff" \
  -H "Authorization: Bearer TU_OPALO_HANDOFF_SECRET" \
  -H "Content-Type: application/json" \
  -d @scripts/sample-worker-handoff-payload.json
```

Ver `scripts/sample-worker-handoff-payload.json` en este repo.

## 5. Código relacionado

| Archivo | Propósito |
|---------|-----------|
| `database/migrations/MIGRATION_ADD_INBOUND_WORKER_HANDOFF.sql` | Tablas e índices |
| `supabase/functions/receive-worker-handoff/index.ts` | API de ingesta |
| `services/inboundWorkerHandoffService.ts` | CRUD interno OpsFlow |
| `components/InboundWorkerHandoff.tsx` | Bandeja + detalle |
| `types.ts` | Tipos TypeScript del contrato |
