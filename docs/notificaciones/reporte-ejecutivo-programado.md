# Envío automático semanal del «Reporte para gerencia»

La plataforma genera sola, en el día y la hora que se elijan, el reporte de
`/config/reportes-ejecutivos` y lo envía por correo a una lista de destinatarios.
Lo que viaja es **el mismo formato que «Copiar formato correo», dentro del cuerpo
del mensaje**: no se adjunta PDF.

Acceso: el mismo permiso del reporte (`auditoria:reporte_ejecutivo`, solo
Superadministrador). No hay permiso nuevo, así que no hace falta `db:sync:rbac`.

## Cómo funciona

```
crontab del VPS (cada 10 min)
  └─ POST http://127.0.0.1:3001/api/tareas/notificaciones   (Authorization: Bearer $CRON_SECRET)
       ├─ da por perdidas las ejecuciones «en curso» de más de 30 min
       ├─ busca programaciones activas con proxima_ejecucion_en <= ahora
       └─ por cada una, de a una y de forma síncrona:
            1. reclama el disparo (inserta la ejecución: único programacion + instante programado)
            2. avanza proxima_ejecucion_en a la siguiente ocurrencia
            3. genera el reporte, lo convierte al formato correo y lo envía
            4. registra el resultado y, si salió, el envío en «Reportes enviados»
```

No hay un programador dentro de la aplicación (`setInterval`, `node-cron`): PM2 reinicia
el proceso por memoria y un temporizador interno se perdería. El reloj es el cron del
sistema; la aplicación solo responde «¿hay algo que enviar?» y lo hace una vez.

### Garantías

- **Nunca dos envíos del mismo disparo.** `notificacion_ejecucion` tiene un único
  (`programacion_id`, `programada_para`) y el disparo se reclama *antes* de enviar. Si dos
  llamadas del cron se cruzan, una choca contra el único y se salta. Si el proceso muere a
  mitad de un envío, el disparo ya está reclamado: no se reenvía solo (la ejecución queda
  «en curso» y a los 30 minutos pasa a «con error»; revisa si el correo llegó antes de
  reenviar a mano).
- **Retraso.** Si el cron llega con más de 24 h de retraso, el envío se marca *omitido* y
  solo se avanza la próxima fecha: un reporte de hace días ya no sirve. Con menos de 24 h
  se envía y el período sigue siendo el del instante programado.
- **Un fallo no frena la serie.** La próxima fecha se recalcula siempre, también si el
  envío falla; la semana siguiente se reintenta. Un fallo queda en el historial con su
  mensaje.
- **Sin hora de SQL.** Todo lo que depende de la hora se calcula en la aplicación y recibe
  `ahora` como parámetro (`src/lib/notificaciones/programacion.ts`). Colombia es UTC−5 fijo.

### Qué se envía

- **Período:** los 7 días de calendario que terminan el día *anterior* al envío, en hora de
  Colombia. Enviado un lunes, cubre de lunes a domingo anteriores. Las fechas se pasan al
  generador como `AAAA-MM-DD`, igual que cuando se elige el período en pantalla (el límite
  de cada día es el de la regla del reporte, `rango.ts`).
- **Novedades:** ninguna omitida a mano. Reutiliza la instantánea del reporte si ya existe
  para ese alcance (`generarReporteEjecutivoNucleo`, sin sesión).
- **Asunto:** el título del reporte (en la prueba, con «[Prueba] » delante).
- **Cuerpo:** `htmlConEstilosEnLinea` + `prepararMarcaParaCorreo`, los mismos pasos del
  botón del navegador. En el servidor el HTML lo parsea `linkedom` (no hay `DOMParser`); el
  logotipo sale de la dirección `url_plataforma` de la conexión de correo (PNG de
  `/marca/`, que es público). Más un texto plano alterno.
- **Uno por destinatario**, sin mostrar a los demás. Gmail recorta cuerpos de más de
  102 000 caracteres; si pasa, el mensaje de la ejecución lo advierte.
- **Constancia:** si al menos un correo fue aceptado, se registra en
  `envios_reporte_ejecutivo` (canal `correo`) con las versiones incluidas, para que el
  siguiente reporte no repita novedades. La prueba nunca registra.

### Tablas (nombres físicos en español)

| Tabla | Para qué |
| --- | --- |
| `notificacion_programada` | Una fila por tipo (`reporte_ejecutivo`): activa, día (1 = lunes … 7), hora `HH:mm` de Colombia, `proxima_ejecucion_en`. |
| `notificacion_destinatario` | Correos de la lista (minúsculas, únicos por programación), con nombre opcional y activo/en pausa. Tope: 50. |
| `notificacion_ejecucion` | Historial: origen (`programada`, `manual`, `prueba`), estado (`en_curso`, `ok`, `parcial`, `error`, `omitida`), conteos, período y mensaje. |

Los instantes son `TIMESTAMPTZ`. Los pares «usuario» son FK suaves (solo el `Int`).

## Pantalla

`/config/reportes-ejecutivos` → «Envío automático»: activar o pausar, día y hora, «Próximo
envío», destinatarios (agregar, pausar, quitar), «Enviar prueba a mi correo», «Enviar ahora
a la lista» y los últimos envíos. Avisa si falta la conexión de correo o su dirección de
Russell (con enlace a `/config/conexiones`), si el servidor no tiene `CRON_SECRET`, si un
envío lleva más de 30 minutos vencido (el cron no está corriendo) y si está activo sin
destinatarios activos.

- La **prueba** va solo al correo de la persona que la pide.
- «Enviar ahora» va a toda la lista activa, deja constancia a nombre de quien lo pidió y no
  corre si ya hay otro envío a la lista en curso.
- Guardar sin cambiar el día ni la hora conserva la próxima fecha (no se come un envío
  vencido que el cron aún no atendió).

## Despliegue en el VPS

Orden: migración → variable → código → crontab. Si el código llega antes que la migración,
la página sigue funcionando y el panel avisa que falta aplicarla.

1. **Migración** (crea tres tablas; no toca las existentes). Respaldo previo, como siempre:

   ```bash
   npm run db:status      # debe listar 20261124120000_notificaciones_programadas como pendiente
   npm run db:deploy
   ```

2. **`CRON_SECRET`** (un secreto largo y propio de esa instalación):

   ```bash
   openssl rand -hex 32
   ```

   Debe estar en el entorno del proceso de PM2. Con el procedimiento habitual de
   actualización (README), exportarlo antes de recargar:

   ```bash
   export CRON_SECRET=<el valor>
   pm2 reload ecosystem.config.js --update-env
   pm2 save
   ```

   (Alternativa: ponerlo en el `.env` del servidor, que Next lee al arrancar, y recargar.)
   Sin `CRON_SECRET` la ruta responde **503** y no hace nada; con uno incorrecto, **401**.

3. **Código:** el despliegue de siempre (`npm ci`, `npm run build`, `pm2 reload … --update-env`).
   Esta versión agrega la dependencia `linkedom`: `npm ci` es obligatorio.

4. **Crontab** del usuario que corre PM2 (`crontab -e`). `curl` llama a la propia máquina
   (no al dominio público), así el secreto no viaja por Internet:

   ```cron
   CRON_SECRET=<el mismo valor>
   */10 * * * * curl -sS --max-time 600 -X POST -H "Authorization: Bearer $CRON_SECRET" -w "\n\%{http_code}\n" http://127.0.0.1:3001/api/tareas/notificaciones >> /home/dev/russell-notificaciones.log 2>&1
   ```

   - `--max-time 600` coincide con el `maxDuration` de la ruta.
   - En un crontab el `%` hay que escribirlo `\%`.
   - Si prefieres no dejar el secreto en el crontab: `-H "Authorization: Bearer $(cat /home/dev/.russell-cron)"`
     con ese archivo en modo `600`.
   - El log recibe unas decenas de bytes cada 10 minutos.

5. **Comprobar:**

   ```bash
   curl -i -X POST http://127.0.0.1:3001/api/tareas/notificaciones          # 401 (o 503 si falta la variable)
   curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3001/api/tareas/notificaciones
   # {"ok":true,"revisadas":0,"enviadas":0,"omitidas":0,"saltadas":0,"errores":0,"perdidasCerradas":0}
   ```

   Luego, en la pantalla: confirmar que la conexión de correo tenga la dirección HTTPS de
   Russell, agregar destinatarios, **enviar una prueba**, y recién entonces activar el envío.

## Operación y solución de problemas

| Síntoma | Causa probable |
| --- | --- |
| Aviso «el envío debía salir… y todavía no salió» | El cron no está corriendo o recibe 401/503: mira `/home/dev/russell-notificaciones.log`. |
| 503 en el log | Falta `CRON_SECRET` en el entorno del proceso (recargar con `--update-env`). |
| 401 en el log | El secreto del crontab no coincide con el del proceso. |
| Ejecución «Con error»: no hay conexión de correo | Marcar una conexión SMTP/Gmail de Producción como «Enviar notificaciones de Russell» en `/config/conexiones`. |
| Ejecución «Con error»: falta la dirección HTTPS | Completar «Dirección de Russell» en esa conexión (la usa el logotipo del correo). |
| Ejecución «Omitido» | El cron estuvo caído más de 24 h al llegar la hora; se saltó ese envío. Usa «Enviar ahora» si hace falta. |
| «Parcial» | Algún destinatario fue rechazado por el SMTP; el resto lo recibió. El envío quedó registrado. |
| «Con error» tras «el servidor se reinició» | PM2 reinició a mitad del envío. Comprueba si llegó antes de reenviar. |

Un correo «aceptado» por el SMTP no garantiza que llegue a la bandeja.

## Código

- Pura y con pruebas: `src/lib/notificaciones/` (`programacion.ts`, `destinatarios.ts`,
  `origen-plataforma.ts`).
- Orquestación (BD, correo): `src/lib/notificaciones/reporte-ejecutivo-servidor.ts`.
- Disparador: `src/app/api/tareas/notificaciones/route.ts`.
- Acciones de la pantalla: `src/app/actions/notificaciones-programadas.ts`; panel en
  `src/app/(app)/config/reportes-ejecutivos/envio-automatico.tsx`.
- Generación sin sesión: `src/lib/auditoria/reporte-ejecutivo/generar-servidor.ts`
  (la acción `generarReporteEjecutivoUso` autoriza y delega en él).
- Formato correo en el servidor: `src/lib/correo/formato-correo-servidor.ts`; envío con HTML
  propio: `enviarHtmlRegistrado` en `src/lib/correo/notificaciones.ts`.
