# Despliegue de receive-worker-handoff (OpsFlow)

Script para desplegar la Edge Function de ingesta ATS y configurar secrets.

## Requisitos

1. [Supabase Access Token](https://supabase.com/dashboard/account/tokens) (Personal Access Token)
2. Service Role Key del proyecto OpsFlow (Dashboard → Settings → API)

## Uso rápido

```powershell
cd c:\Users\alvar\OpsFlow

# Opción A: token en variable de entorno (recomendado)
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."   # solo para verificar; el script pedirá setear secrets
.\scripts\deploy-receive-worker-handoff.ps1

# Opción B: el script pedirá el token de forma segura
.\scripts\deploy-receive-worker-handoff.ps1
```

El script:

1. Inicia sesión en Supabase CLI
2. Vincula el proyecto `rlnfehtgspnkyeevduli`
3. Genera `OPSFLOW_HANDOFF_INGEST_SECRET` (o reutiliza el que indiques)
4. Configura secrets en Supabase
5. Despliega `receive-worker-handoff`
6. Ejecuta un POST de prueba opcional

## Secrets configurados

| Secret | Descripción |
|--------|-------------|
| `OPSFLOW_HANDOFF_INGEST_SECRET` | Compartir con Opalo ATS |
| `SUPABASE_URL` | URL del proyecto OpsFlow |
| `SUPABASE_SERVICE_ROLE_KEY` | Escritura con bypass RLS |

## Endpoint resultante

```
POST https://rlnfehtgspnkyeevduli.supabase.co/functions/v1/receive-worker-handoff
Authorization: Bearer <OPSFLOW_HANDOFF_INGEST_SECRET>
```

Ver también `INBOUND_WORKER_HANDOFF.md`.
