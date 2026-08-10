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

### 2.3. Contraste (ampliado — pruebas OpaloSis + OpsFlow)

| Origen | Tipo de red / runtime | Destino | Resultado |
|--------|----------------------|---------|-----------|
| PC oficina | ISP oficina | `onyx.../tipo-documento` | ✅ HTTP 200 |
| PC red doméstica | ISP residencial | `onyx.../tipo-documento` | ✅ HTTP 200 |
| Laptop datos móviles | Red celular | `onyx.../tipo-documento` | ✅ HTTP 200 |
| **Azure Cloud Shell** | Infraestructura cloud externa (Microsoft) | `onyx.../tipo-documento` | ✅ HTTP 200 |
| **Linux remoto (`curl -v`)** | Servidor Linux externo | `onyx.../tipo-documento` | ✅ HTTP 200 (TLS 1.2 / IIS 8.0) |
| **Supabase Edge Function** | Deno Deploy (runtime de la función) | `onyx.../tipo-documento` | ❌ Connection reset (os error 104), 3/3 |

**Conclusión revisada:** el problema **no es “cualquier nube”**. Azure Cloud Shell y Linux remoto obtienen HTTP 200. El único entorno donde se reproduce el fallo es el **runtime de Supabase Edge Functions**.

Causas más plausibles con esta evidencia:

- **(a) Incompatibilidad TLS del cliente Deno/Supabase con IIS 8.0** (negocia TLS 1.2 + cipher `ECDHE-RSA-AES256-SHA384`, sin HTTP/2). Curl/PowerShell/Azure negocian bien; Deno puede resetearse en el handshake.
- **(b) Bloqueo/filtrado específico hacia rangos o ASN usados por Supabase / Deno Deploy** (menos probable solo, dado que Azure Cloud Shell sí funciona).
- **(c) Política de egress propia de Supabase Edge** hacia ese host.

### 2.4. Handshake exitoso desde Linux remoto (`curl -v`) — referencia de comparación

Misma URL y API Key, desde un equipo remoto Linux (HTTP 200). Detalle TLS/servidor:

```
* Trying 38.253.153.202:443...
* Connected to onyx.opaloperu.com (38.253.153.202) port 443
* TLSv1.3 (OUT), TLS handshake, Client hello (1):
* ... negociado hacia abajo ...
* SSL connection using TLSv1.2 / ECDHE-RSA-AES256-SHA384
* ALPN: server did not agree on a protocol. Uses default.   ← sin HTTP/2
* Server certificate: CN=*.opaloperu.com (DigiCert RapidSSL)
* Server: Microsoft-IIS/8.0
* X-AspNet-Version: 4.0.30319
HTTP/1.1 200 OK
```

**Implicación:** Onyx/IIS **acepta** clientes compatibles con **TLS 1.2** y cifrado antiguo (`ECDHE-RSA-AES256-SHA384`). El fallo de Supabase Edge ocurre en fase **Connect** (antes de HTTP), coherente con un **corte en el handshake TLS** del cliente Deno/Supabase frente a ese stack (IIS 8.0 + TLS 1.2 + sin ALPN h2), no con un rechazo HTTP 401/403 de la API Key.

---

## 3. Descarte de otras causas

- **No es la API Key:** con la misma key, desde la red de OpsFlow la respuesta es 200.
- **No es la URL ni el endpoint:** idéntica URL funciona desde la red de OpsFlow.
- **No es el payload/código de OpsFlow:** el error es en un **GET de catálogo** (sin cuerpo) y ocurre en la fase de conexión, no de aplicación.
- **No es intermitente:** 3 de 3 intentos fallaron con el mismo error exacto (reconfirmado 2026-08-10).
- **No es DNS:** la URL se resuelve; el fallo es reset de conexión, no "host not found".
- **No es “cualquier cloud”:** Azure Cloud Shell obtiene HTTP 200; solo falla el runtime de **Supabase Edge Functions**.
- **No es una red específica de OpsFlow:** funciona desde oficina, casa, datos móviles y Azure Cloud Shell.

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
| 2 | ¿Hay logs del lado Onyx del reset de conexión hacia origen Supabase/Deno Deploy (fecha 2026-08-07 y 2026-08-10)? |
| 3 | ¿Cómo se autoriza un nuevo origen? ¿Aceptan un origen de nube o exigen IP estática? |
| 4 | ¿Hay un WAF/CDN (Cloudflare, F5, Imperva, etc.) delante de Onyx? ¿Puede estar reseteando por **huella TLS (JA3)** del cliente Deno? |
| 5 | ¿Restricción por User-Agent, TLS mínimo o cabeceras específicas además de `X-Api-Key`? |
| 6 | Dado que **Azure Cloud Shell sí funciona**, ¿pueden comparar en logs qué diferencia hay vs una conexión desde Supabase Edge (ASN, TLS fingerprint, región)? |

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
