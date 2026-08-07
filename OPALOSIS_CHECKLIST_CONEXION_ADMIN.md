# Checklist de conexión OpsFlow ↔ OpaloSis (RRHH)

**Destinatario:** Administrador / responsable técnico de OpaloSis  
**Remitente:** Equipo OpsFlow  
**Referencia:** Documento técnico *Integración API REST OpsFlow — OpaloSis / PortalEmpleado* (Guite Bazán, OpaloPeru)  
**Fecha:** 2026-08-07  
**Objetivo:** Dejar documentado qué ya está listo del lado OpsFlow, qué falta para una conexión real correcta, y qué necesitamos confirmar o habilitar del lado OpaloSis.

---

## 1. Resumen ejecutivo

OpsFlow ya implementó el canal outbound hacia la API de OpaloSis (`POST /registro-ingreso`, catálogos GET, `GET /solicitudes-ingreso`) mediante una Edge Function en Supabase, UI de cola (**Envío Opalosis**) y tracking de `IngresoCod` / Estado / Etapa.

> **Actualización 2026-08-07 (doc `Integracion_API_OpsFlow_OpaloSis01.docx`):** el documento 01 resolvió las ambigüedades de contrato que estaban pendientes de confirmar (EstadoCivil, SistemaPension, BancoPreferencia, polling). OpsFlow ya ajustó el código en consecuencia:
> - **`EstadoCivil`** ahora se envía como **texto** (nombre del catálogo), no como Id. ✅ implementado
> - **`CamposDetalle`** ahora se envía con los datos adicionales/dinámicos del ATS. ✅ implementado
>
> Con esto, del bloque de contrato ya no queda nada bloqueante; lo pendiente es **operativo** (API Key prod, conectividad, SharePoint) y la **prueba conjunta**.

Para pasar de **modo simulación / pruebas parciales** a **producción confiable**, falta:

1. ~~Confirmaciones de contrato (campos ambiguos y el nuevo `CamposDetalle`).~~ **Resuelto por doc 01 + implementado.**
2. Habilitación operativa del lado OpaloSis (API Key de producción, conectividad, SharePoint).
3. ~~Cierre de gaps de implementación OpsFlow derivados del documento del 2026-07-24.~~ **Hecho (EstadoCivil texto + CamposDetalle).**
4. Prueba conjunta end-to-end con un documento de prueba controlado.

---

## 2. Lo que OpsFlow ya tiene implementado

| Capacidad | Estado | Detalle |
|-----------|--------|---------|
| Proxy autenticado hacia OpaloSis | Listo en código | Edge Function `hr-opalosis-integration` con header `X-Api-Key` |
| `POST /registro-ingreso` por trabajador | Listo | Un POST por ítem de cola; interpreta `Resultado` true/false |
| Distinción error técnico vs rechazo negocio | Listo | HTTP ≠ 200 → fallo técnico; HTTP 200 + `Resultado: false` → mensaje al usuario, sin reintento automático |
| Catálogos GET del documento | Listos | `tipo-documento`, `estado-civil`, `paises`, ubigeo, `empleado-cargo`, `lugar-trabajo`, `opalos`, `regimen-laboral`, `modelo-contrato`, `fondo-pension`, `banco`, `supervisores`, `centro-costo` |
| UI de completar formulario + bloqueos de campos mínimos | Listo | Documento, nombres, fecha ingreso, cargo, lugar, sueldo > 0, movilidad, UrlDocumentoAdjunto |
| Cola e historial de paquetes | Listo | Tablas `hr_outbound_*` + menú Envío Opalosis |
| Consulta de avance Estado/Etapa | Parcial | Botón manual “Actualizar Estado / Etapa” vía `GET /solicitudes-ingreso?Buscar=` |
| `PaisId` default 173 (Perú) | Listo | |
| Biblioteca SharePoint referenciada en UI | Listo (enlace) | El operador debe crear carpeta y pegar URL |
| Modo mock si faltan secrets | Listo | Sin `OPALOSIS_API_BASE_URL` / `OPALOSIS_API_KEY` no llama a Onyx |

**URL base que usamos (según documento):**

```
https://onyx.opaloperu.com/apiempleadoregistro/api/opsflow
```

**Header:**

```
X-Api-Key: <valor entregado por OpaloSis>
```

---

## 3. Gaps / pendientes del lado OpsFlow (antes de producción)

Estos puntos los cerramos nosotros, pero varios **requieren respuesta del admin OpaloSis** (sección 4).

### 3.1. `CamposDetalle` (novedad 2026-07-24) — ✅ **IMPLEMENTADO**

El documento 01 aclara (sección 6, notas): `CamposDetalle` es **opcional** y sirve **exclusivamente** para datos que no forman parte del `RegistroIngresoDTO` estándar; no reemplaza campos del DTO.

**Implementación OpsFlow:** cada `POST /registro-ingreso` ahora incluye:

```json
"CamposDetalle": [
  { "Campo": "NumeroContactoEmergencia", "Valor": "987654321" },
  { "Campo": "NombreContactoEmergencia", "Valor": "Maria Perez" }
]
```

Se envían solo los campos **adicionales/dinámicos** del ATS (los que no tienen columna propia en el DTO). La trazabilidad completa del snapshot sigue viajando en `PayloadJson`.

> Confirmación opcional a OpaloSis (no bloqueante): ¿existe una lista preferida de nombres `Campo` que RRHH espera (p. ej. `NumeroContactoEmergencia`)? Si la envían, alineamos las claves.

### 3.2. `EstadoCivil` (texto, no Id) — ✅ **RESUELTO E IMPLEMENTADO**

Doc 01 (sección 5, nota; changelog 2026-08-07): *“el RegistroIngresoDTO recibe únicamente el valor de EstadoCivil (texto)… OpsFlow debe enviar el nombre del estado civil y no el identificador numérico.”*

**Implementación OpsFlow:** el DTO ahora envía `EstadoCivil` como **texto** (nombre del catálogo, p. ej. `"Soltero"`) en lugar de `EstadoCivilId`. El `EstadoCivilId` se sigue usando solo para la selección en la UI.

### 3.3. `SistemaPension` — ✅ **RESUELTO** (ya era correcto)

Doc 01 (nota bajo `GET /fondo-pension`): *“SistemaPension es de tipo texto. Debe enviarse el nombre del sistema de pensión… y no el identificador (FondoPensionId).”*  
OpsFlow ya envía el **texto**. Sin cambios.

### 3.4. `BancoPreferencia` — ✅ **RESUELTO** (ya era correcto)

Doc 01 (nota bajo `GET /banco`): *“BancoPreferencia recibe el código/identificador del banco como texto (VARCHAR)… no el nombre.”*  
OpsFlow ya envía el **`BancoId` como string**. Sin cambios.

### 3.5. Polling de solicitudes — ✅ **RESUELTO** (bajo demanda es válido)

Doc 01 (nota bajo sección 7): *“GET /solicitudes-ingreso permite consultas bajo demanda o sincronización programada. La implementación de polling… corresponde a OpsFlow.”*

OpsFlow hoy consulta **bajo demanda** (botón “Actualizar Estado / Etapa”), lo cual cumple el contrato.  
**Mejora opcional (no bloqueante):** job/cron de sincronización y uso de `FechaIni` / `FechaFin`.

### 3.6. Configuración operativa que puede estar pendiente en el ambiente OpsFlow

| Ítem | Qué verificar |
|------|----------------|
| Secrets Supabase | `OPALOSIS_API_BASE_URL`, `OPALOSIS_API_KEY`, `OPALOSIS_USE_MOCK=false` |
| Deploy Edge Function | `hr-opalosis-integration` desplegada en el proyecto OpsFlow |
| Migraciones SQL | `MIGRATION_HR_OPALOSIS_INTEGRATION.sql` + `MIGRATION_HR_OPALOSIS_SOLICITUD_TRACKING.sql` aplicadas |
| Prueba real | Script `scripts/test-opalosis-registro-ingreso.ps1` o action `test-registro-ingreso` con `Resultado: true` |

Si los secrets no están o `OPALOSIS_USE_MOCK=true`, la UI puede “enviar” en **modo simulado** sin llegar a Onyx.

### 3.7. Seguridad de la API Key del documento de pruebas

El Word incluye una API Key de ejemplo en texto plano.  
**Acción:** rotar/invalidar esa key si fue de prueba y entregar a OpsFlow una key de **producción** por canal seguro (no por correo/Word compartido). OpsFlow la guardará solo en secrets de Supabase (nunca en frontend ni en git).

---

## 4. Lo que necesitamos del administrador de OpaloSis

### 4.1. Credenciales y ambiente

| # | Pedido | Respuesta esperada |
|---|--------|--------------------|
| A1 | Confirmar URL base de **producción** (¿sigue siendo `onyx.opaloperu.com/.../opsflow`?) | URL exacta |
| A2 | ¿Existe ambiente de **QA/UAT** separado? | URL + key de pruebas |
| A3 | Entregar **API Key de producción** por canal seguro | Key + fecha de vigencia |
| A4 | ¿La key del documento de integración sigue válida o debe rotarse? | Sí/No + nueva key |
| A5 | ¿Hay restricción por IP / firewall hacia Onyx? | Lista de IPs a autorizar (Supabase Edge es egress dinámico; si hay allowlist, necesitamos alternativa: IP fija, VPN, o proxy) |
| A6 | ¿Timeouts / rate limits del API? | p.ej. req/min, timeout recomendado |

### 4.2. Contrato de campos — ✅ resuelto por doc 01 (solo quedan confirmaciones opcionales)

Las ambigüedades originales quedaron aclaradas en `Integracion_API_OpsFlow_OpaloSis01.docx` y ya se ajustó el código:

| # | Punto | Estado |
|---|-------|--------|
| B3 | `EstadoCivil` es **texto** (no Id) | ✅ Resuelto + implementado |
| B4 | `SistemaPension` es **texto** (nombre del catálogo) | ✅ Resuelto (ya era correcto) |
| B5 | `BancoPreferencia` = `BancoId` como **string** | ✅ Resuelto (ya era correcto) |
| B6 | `PayloadJson` opcional; `CamposDetalle` para datos extra | ✅ Resuelto |

Confirmaciones **opcionales** (no bloquean go-live):

| # | Pregunta | Impacto |
|---|----------|---------|
| B2 | ¿Lista preferida de nombres `Campo` para `CamposDetalle`? (ej. `NumeroContactoEmergencia`, `NombreContactoEmergencia`) | Alinear claves |
| B7 | ¿RRHH **observa/rechaza** por API si faltan Sueldo/Cargo/Lugar/UrlDocumentoAdjunto, o solo observación manual? | UX de bloqueos en OpsFlow |

### 4.3. SharePoint (bloqueante operativo)

El documento indica que solo personal OpaloPerú con Microsoft 365 puede acceder a:

```
https://opaloperu1.sharepoint.com/:f:/s/INDICADORESRRHH/...
```

| # | Pedido |
|---|--------|
| C1 | Confirmar que esa biblioteca es la definitiva para `UrlDocumentoAdjunto` |
| C2 | Indicar **quién** crea la carpeta por DNI: ¿operaciones OpsFlow o RRHH OpaloSis? |
| C3 | Si OpsFlow debe subir/pegar el link: otorgar acceso M365 a los usuarios operadores definidos |
| C4 | Confirmar si se acepta solo link a **carpeta** del trabajador (no a un archivo suelto) |
| C5 | ¿Hay validación automática de que la URL sea de ese dominio SharePoint? |

Sin acceso SharePoint, OpsFlow puede armar el POST pero el campo obligatorio `UrlDocumentoAdjunto` quedará incompleto o con links inválidos → observaciones RRHH.

### 4.4. Reglas de negocio a alinear

| # | Tema | Confirmación pedida |
|---|------|---------------------|
| D1 | Duplicados: no nuevo registro si existe solicitud en Recibido/Observado | ¿Sigue vigente? |
| D2 | ¿Se permite reenvío tras Procesado/Rechazado con el mismo documento? | |
| D3 | Vínculo laboral activo: mensaje con Cliente/Cargo/Lugar | ¿OpsFlow debe mostrar el `Mensaje` tal cual? |
| D4 | `UsuarioOf`: ¿formato esperado? (hoy OpsFlow envía p.ej. `opsflow` / usuario) | |
| D5 | `OpaloId` default: OpsFlow usa **103** (Opalo Peru SAC). ¿Es correcto por defecto o debe mapearse por unidad/cliente? | |
| D6 | Relación unidad OpsFlow ↔ `LugarTrabajoId`: ¿OpaloSis mantiene el catálogo y OpsFlow solo elige, o hay IDs maestros que debamos sincronizar de antemano? | |

### 4.5. Seguimiento post-registro

| # | Pedido |
|---|--------|
| E1 | ¿Prefieren **polling** desde OpsFlow o pueden exponer **webhook** cuando cambie Estado/Etapa? |
| E2 | Si polling: frecuencia sugerida (ej. cada 15–30 min en horario laboral) |
| E3 | ¿`GET /solicitudes-ingreso` garantiza match estable por `IngresoCod`? (OpsFlow guarda `IngresoCod` al registrar) |
| E4 | Confirmar textos exactos de Estado (`Recibido`, `Observado`, `Procesado`, `Rechazado`) y Etapa (tabla 8.2 del documento) — ¿pueden cambiar casing/espacios? |

### 4.6. Prueba conjunta (UAT)

Propuesta de prueba controlada:

1. OpaloSis habilita key + confirma URL.
2. OpsFlow hace `GET /tipo-documento` y `GET /empleado-cargo?buscar=...` (smoke test catálogos).
3. OpsFlow envía `POST /registro-ingreso` con **documento de prueba** acordado (que no choque con trabajador real ni solicitud pendiente).
4. OpaloSis confirma aparición en bandeja con `IngresoCod`.
5. OpsFlow consulta `GET /solicitudes-ingreso?Buscar=<IngresoCod|documento>` y verifica Estado=`Recibido`, Etapa=`Nuevo`.
6. (Opcional) RRHH avanza una etapa y OpsFlow refresca Estado/Etapa.
7. Probar un rechazo de negocio (duplicado) y verificar que OpsFlow muestra `Mensaje` sin reintentar.

**Datos de prueba a acordar con OpaloSis:**

| Campo | Valor de prueba (completar juntos) |
|-------|-------------------------------------|
| Documento | ________________ |
| TipoDocumentoId | 1 (DNI) salvo indiquen otro |
| EmpleadoCargoId | ________________ |
| LugarTrabajoId | ________________ |
| OpaloId | ________________ |
| UrlDocumentoAdjunto | carpeta SharePoint de prueba |
| FechaIngreso | ________________ |

---

## 5. Matriz “quién hace qué” para cerrar la conexión

| Acción | Responsable | Bloqueante para go-live |
|--------|-------------|-------------------------|
| Entregar/rotar API Key prod + confirmar URL | **OpaloSis** | Sí |
| Acceso SharePoint a operadores / proceso de carga | **OpaloSis + Ops** | Sí (si UrlDocumento es obligatorio de negocio) |
| Allowlist / conectividad Onyx desde Supabase | **OpaloSis / Infra** | Sí, si hay firewall |
| Configurar secrets + deploy Edge Function (redeploy con estos cambios) | **OpsFlow** | Sí |
| Ejecutar migraciones SQL | **OpsFlow** | Sí |
| ~~Implementar `CamposDetalle`~~ | **OpsFlow** | ✅ Hecho |
| ~~Ajustar `EstadoCivil` a texto~~ | **OpsFlow** | ✅ Hecho |
| (Opcional) lista de nombres `Campo` para `CamposDetalle` | **OpaloSis** | No |
| Polling automático FechaIni/FechaFin (opcional) | **OpsFlow** | No (mejora) |
| Prueba UAT conjunta | **Ambos** | Sí |

---

## 6. Payload que OpsFlow envía hoy (referencia)

Campos principales alineados al `RegistroIngresoDTO` del documento:

- Identidad: `TipoDocumentoId`, `Documento`, `ApellidoPaterno`, `ApellidoMaterno`, `Nombres`, `Sexo`, fechas, dirección, teléfono, correo
- Laborales: `FechaIngreso`, `EmpleadoCargoId`, `LugarTrabajoId`, `OpaloId`, contrato, régimen, jornada, turno
- Pago: `Sueldo`, `Movilidad`, `SistemaPension`, `BancoPreferencia`, `NumeroCuentaTrabajador`
- Otros: tallas, `PaisId`, `UbigeoId`, `SupervisorId`, `CentroCostoId`, `EstadoCivil` (**texto**), `Observacion`, `UsuarioOf`
- Extra: `PayloadJson` (inventario dinámico completo, trazabilidad)
- **`CamposDetalle`**: pares `Campo`/`Valor` con los datos adicionales/dinámicos del ATS (ya se envía)

Reglas OpsFlow al interpretar respuesta:

- `Resultado: true` → guardar `IngresoId` / `IngresoCod`, ítem `recibido`
- `Resultado: false` → mostrar `Mensaje` / `MensajeError`, no reintentar en automático
- HTTP ≠ 200 → error técnico (candidato a reintento manual)

---

## 7. Contacto y próximos pasos sugeridos

**Orden recomendado:**

1. OpaloSis responde sección **4** (sobre todo A1–A5, B1–B5, C1–C3).  
2. OpsFlow configura secrets y cierra gaps de código (`CamposDetalle` + ajustes de contrato).  
3. UAT con documento de prueba (sección 4.6).  
4. Go-live con key de producción y monitoreo de primeros envíos reales.

**Anexos en el repo OpsFlow (uso interno):**

- `HR_OPALOSIS_INTEGRATION.md` — flujo operativo OpsFlow
- `ENV_VARIABLES.md` — secrets de la Edge Function
- `Integracion_API_OpsFlow_OpaloSis 1.docx` — especificación recibida de OpaloSis
- `scripts/test-opalosis-registro-ingreso.ps1` — prueba directa al API
- `scripts/deploy-hr-opalosis-integration.ps1` — despliegue

---

## 8. Plantilla de respuesta rápida (para el admin OpaloSis)

Pueden responder copiando esto:

```text
A1 URL prod: ...
A2 URL QA: ... / N/A
A3 API Key prod: (enviar por canal seguro)
A4 ¿Rotar key del Word?: Sí / No
A5 Restrictión IP: No / Sí → detalle: ...
A6 Rate limit / timeout: ...

B1 PayloadJson vs CamposDetalle: ...
B2 Lista CamposDetalle esperados: ...
B3 Estado civil: EstadoCivilId | EstadoCivil(enum)
B4 SistemaPension formato: ...
B5 BancoPreferencia formato: ...
B6 ¿PayloadJson se usa?: Sí / No
B7 Validación dura en API de campos mínimos: Sí / No / Solo observación

C1–C5 SharePoint: ...

D1–D6 Reglas negocio: ...

E1–E4 Seguimiento: polling | webhook ; frecuencia: ...

UAT documento de prueba: ...
CargoId / LugarTrabajoId / OpaloId de prueba: ...
```
