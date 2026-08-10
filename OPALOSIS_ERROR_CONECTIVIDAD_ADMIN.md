# Reporte de error de conectividad — OpsFlow → OpaloSis (Onyx)

**Para:** Administrador / infraestructura de OpaloSis
**De:** Equipo OpsFlow
**Fecha/hora de las pruebas:** 2026-08-07, ~17:11–17:15 (UTC-5)
**Severidad:** Bloqueante para el go-live de la integración

---

## 1. Resumen

La integración OpsFlow → OpaloSis quedó **desplegada y configurada correctamente** del lado de OpsFlow (Supabase Edge Function en modo real). Sin embargo, **las llamadas salientes desde el servidor de OpsFlow (Supabase Edge Functions) hacia `onyx.opaloperu.com` están siendo rechazadas a nivel de red** ("Connection reset by peer"), de forma **consistente (3/3 intentos)**.

La **misma petición, hecha directamente desde la red de OpsFlow (PC de trabajo), responde HTTP 200 correctamente**. Esto indica que el problema **no es la API ni la API Key**, sino un **bloqueo de red / firewall / allowlist de IP del lado de Onyx** que rechaza el origen de Supabase.

---

## 2. Evidencia técnica

### 2.1. Petición fallida (Servidor OpsFlow / Supabase Edge Function → Onyx)

- **Origen:** Supabase Edge Function `hr-opalosis-integration`
  `https://rlnfehtgspnkyeevduli.supabase.co/functions/v1/hr-opalosis-integration`
- **Destino:** `GET https://onyx.opaloperu.com/apiempleadoregistro/api/opsflow/tipo-documento`
- **Header:** `X-Api-Key: <key de integración>`
- **Método:** GET (solo lectura, catálogo)

**Respuesta (repetida 3 veces, idéntica):**

```
HTTP 500
{
  "error": "error sending request for url (https://onyx.opaloperu.com/apiempleadoregistro/api/opsflow/tipo-documento): client error (Connect): Connection reset by peer (os error 104)"
}
```

Detalle clave: el error ocurre en la fase **Connect** (establecimiento de conexión TCP/TLS), **antes** de enviar el cuerpo de la petición. `os error 104 = ECONNRESET` (la conexión fue reseteada por el extremo remoto).

### 2.2. Misma petición desde la red de OpsFlow (PC) — FUNCIONA

- **Destino:** `GET https://onyx.opaloperu.com/apiempleadoregistro/api/opsflow/tipo-documento`
- **Resultado:** `HTTP 200 OK`
- **Cuerpo (correcto):**

```json
[
  { "TipoDocumentoId": 1, "TipoDocumento": "Libreta electoral o DNI" },
  { "TipoDocumentoId": 2, "TipoDocumento": "Pasaporte" },
  { "TipoDocumentoId": 3, "TipoDocumento": "Partida de nacimiento" },
  { "TipoDocumentoId": 4, "TipoDocumento": "Carné de extranjeria" },
  { "TipoDocumentoId": 5, "TipoDocumento": "Permiso temporal de permanencia" }
]
```

### 2.3. Contraste (ampliado)

| Origen | Tipo de red | Destino | Resultado |
|--------|-------------|---------|-----------|
| PC en red de OpsFlow | ISP oficina (residencial/comercial) | `onyx.../tipo-documento` | ✅ HTTP 200 |
| Otras PCs **fuera** de la red de OpsFlow | ISP residenciales/comerciales varios | `onyx.../tipo-documento` | ✅ HTTP 200 |
| Supabase Edge Function | IP de **datacenter/nube** | `onyx.../tipo-documento` | ❌ Connection reset (os error 104), 3/3 |

**Conclusión:** el acceso **no depende de una red específica** (funciona desde múltiples PCs y redes externas). El único origen que Onyx **rechaza (resetea)** es el de **infraestructura de nube/datacenter** (Supabase). Esto es característico de un **bloqueo que discrimina por tipo de origen**:

- **(a) Bloqueo por ASN de hosting/nube:** el WAF/firewall corta IPs de proveedores de nube (anti-bot/anti-scraping) y permite ISPs residenciales/comerciales.
- **(b) Bloqueo por huella TLS (JA3/JA4):** el WAF resetea clientes cuyo *fingerprint* TLS no está permitido (el `fetch` del runtime del servidor difiere del de un navegador/PowerShell).
- **(c) Geobloqueo por región de salida** de la nube.

En los tres casos el síntoma es el mismo: reset en fase **Connect** solo para el origen de nube.

---

## 3. Descarte de otras causas

- **No es la API Key:** con la misma key, desde la red de OpsFlow la respuesta es 200.
- **No es la URL ni el endpoint:** idéntica URL funciona desde la red de OpsFlow.
- **No es el payload/código de OpsFlow:** el error es en un **GET de catálogo** (sin cuerpo) y ocurre en la fase de conexión, no de aplicación.
- **No es intermitente:** 3 de 3 intentos fallaron con el mismo error exacto.
- **No es DNS:** la URL se resuelve; el fallo es reset de conexión, no "host not found".
- **No es una red específica de OpsFlow:** la misma petición funciona (HTTP 200) desde **varias PCs y redes externas distintas**; solo falla desde el origen de **nube/datacenter** (Supabase).

---

## 4. Qué necesitamos de OpaloSis (infraestructura)

El tramo **Supabase → Onyx** debe quedar permitido. Opciones (cualquiera destraba):

1. **Permitir el origen de Supabase en el firewall/WAF de Onyx.**
   - Nota: las Edge Functions de Supabase corren en infraestructura distribuida (Deno Deploy) y **no exponen un rango de IP fijo/estable** fácil de allowlistear. Confirmar si el bloqueo es por IP y, si es posible, permitir por otro criterio (p. ej. la `X-Api-Key`, un header adicional secreto, o el `Host`/dominio de origen).

2. **Confirmar explícitamente si Onyx tiene allowlist de IPs** para `/api/opsflow`.
   - Si es así, indicar el mecanismo para autorizar un origen de nube, o si se requiere **IP fija**.

3. **Si se requiere IP fija:** OpsFlow puede enrutar la salida a través de un **proxy con IP estática** (o del servidor propio del cliente ya autorizado). Para dimensionarlo necesitamos saber **qué IP(s) están hoy permitidas** y cómo se autoriza una nueva.

### Preguntas concretas

| # | Pregunta |
|---|----------|
| 1 | ¿Onyx aplica filtrado por IP / geobloqueo / WAF sobre `apiempleadoregistro/api/opsflow`? |
| 2 | ¿Qué IP(s) de origen están actualmente autorizadas (por eso funciona desde nuestra red)? |
| 3 | ¿Cómo se autoriza un nuevo origen? ¿Aceptan un origen de nube o exigen IP estática? |
| 4 | ¿Hay un WAF/CDN (Cloudflare, F5, etc.) delante de Onyx que pueda estar reseteando clientes de datacenter? |
| 5 | ¿Restricción por User-Agent, TLS mínimo o cabeceras específicas además de `X-Api-Key`? |

---

## 5. Estado del lado OpsFlow (para referencia)

- ✅ Migraciones SQL aplicadas.
- ✅ Edge Function `hr-opalosis-integration` desplegada.
- ✅ Secrets configurados (`OPALOSIS_API_BASE_URL`, `OPALOSIS_API_KEY`, `OPALOSIS_USE_MOCK=false`) → **modo real activo** (por eso intenta la conexión real y aparece el reset).
- ⏳ Bloqueado únicamente por la conectividad Supabase → Onyx (sección 2).

**Endpoint de OpsFlow (para pruebas conjuntas):**
`https://rlnfehtgspnkyeevduli.supabase.co/functions/v1/hr-opalosis-integration`

**Endpoint de OpaloSis en prueba:**
`https://onyx.opaloperu.com/apiempleadoregistro/api/opsflow/`
