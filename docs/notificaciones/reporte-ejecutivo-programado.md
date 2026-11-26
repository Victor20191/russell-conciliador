# Envío automático semanal del «Reporte para gerencia»

La plataforma genera sola, en el día y la hora que se elijan, el reporte de
`/config/reportes-ejecutivos` y lo envía por correo a una lista de destinatarios.
Lo que viaja es **el mismo formato que «Copiar formato correo», dentro del cuerpo
del mensaje**: no se adjunta PDF.

El correo de la plataforma es solo para este reporte (manual y programado) y para la prueba
de envío de la conexión en `/config/conexiones`. No hay avisos por correo de balances,
menciones ni soporte: esas novedades viven en la campana. La prueba
`src/lib/correo/solo-reporte-gerencia.test.ts` falla si otro archivo envía correo.

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
  se envía y el período se mide desde el instante programado, no desde la hora real.
- **Un fallo no frena la serie.** La próxima fecha se recalcula siempre, también si el
  envío falla; la semana siguiente se reintenta. Un fallo queda en el historial con su
  mensaje.
- **Sin hora de SQL.** Todo lo que depende de la hora se calcula en la aplicación y recibe
  `ahora` como parámetro (`src/lib/notificaciones/programacion.ts`). Colombia es UTC−5 fijo.

### Qué se envía

- **Período: se elige en «Cuándo se envía» → «Qué período cubre cada envío»** (`modo_periodo` y
  `dias_periodo` de `notificacion_programada`; cálculo en `calcularPeriodoEnvio`):
  - **«Los últimos N días, sin contar el día del envío»** (`ultimos_dias`, N de 1 a 30, por
    defecto 7): los N días que terminan el día *anterior* al envío. Enviado un miércoles con 7
    días, del miércoles anterior al martes (el 25-nov cubre del 18 al 24). Es siempre la misma
    ventana: no depende del último reporte enviado, así un envío manual en medio no acorta la
    semana. Si alguien ya envió (a mano) un reporte que llega hasta ese día anterior o más allá,
    el disparo queda *omitido*. Con envío semanal, N distinto de 7 deja días sin reportar
    (menos) o los repite (más); la pantalla lo advierte.
  - **«Desde el último reporte enviado»** (`continua`, el valor de las programaciones guardadas
    antes de poder elegir): lo que se describe a continuación.
  - **«Contar también el día del envío»** (`incluir_dia_envio`, para las dos opciones; por
    defecto no): el período llega hasta el MISMO día del envío en vez del anterior (miércoles
    con 7 días: del jueves anterior al miércoles). Ese día solo trae lo registrado hasta la hora
    del envío y el período siguiente arranca al día siguiente, así que lo que pase después de esa
    hora no sale en ningún reporte (salvo con más de 7 días, donde lo recoge el envío
    siguiente). La pantalla lo advierte al marcarla.
- **Período en modo «continua»: primer envío de 7 días; los siguientes continúan desde el último envío (máximo 30 días).**
  - **Primer envío por correo:** mientras no exista una ejecución exitosa previa en
    `notificacion_ejecucion` (`programada` o `manual`), siempre cubre los **7 días** que
    terminan el día anterior (no arrastra registros históricos antiguos de `envios_reporte_ejecutivo`).
  - **Hasta:** el día *anterior* al envío, en hora de Colombia (enviado un lunes, termina el
    domingo). Así el día del envío nunca se cuenta dos veces: lo reporta el envío siguiente.
  - **Desde (siguientes envíos):** el día *siguiente* al mayor `periodo_hasta` entre los envíos
    exitosos por correo y los registros posteriores de `envios_reporte_ejecutivo`. Así los
    reportes se encadenan sin huecos ni traslapes.
  - **Tope:** el envío automático se recorta a **30 días** (`TOPE_DIAS_ENVIO_AUTOMATICO`) y el
    mensaje de la ejecución lo anota.
  - **Envío desde la pantalla (prueba y lista):** usa el período elegido arriba, junto al título
    de la página (hasta 366 días, sin pasar de hoy), y deja fuera las novedades marcadas «Omitir»
    en «Novedades del período»: es el mismo reporte de «Ver o descargar». No vuelve a
    pedir fechas; para otro período se cambia el de arriba. Reutiliza la instantánea de ese
    alcance aunque el período siga abierto, así el correo lleva las cifras que se vieron.
  - **Ya cubierto:** si el último reporte ya llega hasta ese día o más allá, no hay período
    nuevo. El disparo programado queda *omitido* («Ya se reportó hasta el …») y la próxima
    fecha avanza igual.
  - **Prueba:** desde la pantalla, el período y las omisiones de la página (como el envío a la
    lista). Llamada sin ellos, usa el período que cubriría el *próximo* envío programado (con
    su regla); si está en pausa o ese envío ya estaría cubierto, los últimos 7 días. No registra nada.
  - **Convención de fechas:** los `periodo_desde`/`periodo_hasta` guardados son instantes que
    producen `parseRangoReporte` (el «hasta» 2026-11-22 es 2026-11-22T23:59:59.999Z). La fecha
    que representan se lee en UTC (`fechaDePeriodoGuardado`), la inversa exacta de esa
    función, la misma que usa `registrarEnvioReporteEjecutivo`; leerlos en hora de Colombia
    correría un día el «desde». Las fechas se pasan al generador como `AAAA-MM-DD`, igual que
    cuando se elige el período en pantalla.
- **Novedades:** el envío programado no omite ninguna. Reutiliza la instantánea del reporte si
  ya existe para ese alcance y se generó con el período terminado (`generarReporteEjecutivoNucleo`,
  sin sesión): una hecha antes —p. ej. por una prueba a mitad de semana, con datos parciales— se
  vuelve a generar. La prueba y el envío a la lista desde la pantalla dejan fuera las marcadas
  «Omitir» en la página; la bitácora anota cuántas quedaron fuera.
- **Asunto:** el título del reporte (en la prueba, con «[Prueba] » delante).
- **Cuerpo:** `htmlConEstilosEnLinea` + `prepararMarcaParaCorreo`, los mismos pasos del
  botón del navegador. En el servidor el HTML lo parsea `linkedom` (no hay `DOMParser`). El
  logotipo azul (PNG de `public/marca`) viaja **incrustado por CID**, como en el correo de
  prueba de envío de la conexión: el correo no depende de ninguna dirección pública (producción puede no tener
  dominio ni HTTPS). Si el archivo no se puede leer, el correo sale sin logotipo y la
  ejecución lo anota. Tampoco se envían las fuentes web Lato: en un correo la tipografía es
  Arial. Ninguna referencia a `/marca/` queda en el cuerpo. Más un texto plano alterno.
- **Uno por destinatario**, sin mostrar a los demás. Gmail recorta cuerpos de más de
  102 000 caracteres; si pasa, el mensaje de la ejecución lo advierte.
- **Constancia:** si al menos un correo fue aceptado, se registra en
  `envios_reporte_ejecutivo` (canal `correo`) con las versiones incluidas, para que el
  siguiente reporte no repita novedades. La prueba nunca registra.

### Tablas (nombres físicos en español)

| Tabla | Para qué |
| --- | --- |
| `notificacion_programada` | Una fila por tipo (`reporte_ejecutivo`): activa, día (1 = lunes … 7), hora `HH:mm` de Colombia, qué período cubre (`modo_periodo`: `ultimos_dias` o `continua`; `dias_periodo`: 1 a 30; `incluir_dia_envio`), `proxima_ejecucion_en`. |
| `notificacion_destinatario` | Correos de la lista (minúsculas, únicos por programación), con nombre opcional y activo/en pausa. Tope: 50. |
| `notificacion_ejecucion` | Historial: origen (`programada`, `manual`, `prueba`), estado (`en_curso`, `ok`, `parcial`, `error`, `omitida`), conteos, período y mensaje. |

Los instantes son `TIMESTAMPTZ`. Los pares «usuario» son FK suaves (solo el `Int`).

## Pantalla

`/config/reportes-ejecutivos` → «Envío automático», que arranca plegado (la página abre en los
indicadores): plegado muestra si está activo, con la fecha del próximo envío, o en pausa, y
cuántos avisos tiene. Abierto: activar o pausar, día, hora y «Qué período
cubre cada envío» (los últimos N días o desde el último reporte enviado, con una explicación
de lo que significa para el envío semanal), «Próximo envío» con lo que cubrirá («Cubrirá: del
… al …») y de dónde sale ese período («Los últimos 7 días antes del envío…», «Continúa desde
el último reporte enviado (del … al …)», «Primer envío: últimos 7 días» o «Ya está cubierto
hasta el …: ese día no se enviará»; calculado en el servidor con la próxima ejecución y el
último envío). Al cambiar algo, antes de guardar, «Al guardar:» muestra la próxima fecha y lo
que cubriría con la misma cuenta. Luego destinatarios (agregar, pausar, quitar), «Enviar prueba» (con el correo de destino), «Enviar ahora
a la lista» y los últimos envíos, cada uno con su período. Avisa si falta la conexión de correo
(con enlace a `/config/conexiones`; su «Dirección de Russell» es opcional), si el servidor no tiene `CRON_SECRET`, si un
envío lleva más de 30 minutos vencido (el cron no está corriendo) y si está activo sin
destinatarios activos.

- La **prueba** y **«Enviar ahora a la lista»** llevan el período elegido arriba y las
  novedades no marcadas «Omitir»; con un período que termina después de hoy, los dos botones
  quedan deshabilitados y la pantalla lo dice. Van en recuadros separados: «Enviar una
  prueba» (el campo del correo y su botón), «Enviar a la lista» (los correos activos y
  su botón), para que no se confunda a quién va cada uno, y «Ver o descargar».
- **«Ver o descargar»** (tercer recuadro de «Enviar ahora»): «Ver reporte» genera el mismo
  reporte (período de arriba, sin lo marcado «Omitir») y abre la vista previa con «Copiar
  formato correo», «Descargar HTML», «Descargar PDF» y «Marcar como enviado» (constancia de una
  entrega por fuera de la plataforma). Ya generado en la visita, «Ver reporte» lo abre directo y
  «Generar de nuevo» deja marcar «Actualizar con datos nuevos».
- La **prueba** va solo al correo que escribe la persona que la pide (de entrada, el de su
  cuenta). No deja constancia en «Reportes enviados»; la bitácora anota el período y a qué
  correo fue («ENVIÓ PRUEBA DEL REPORTE»).
- «Enviar ahora a la lista» abre una ventana con el período, lo que queda fuera y la casilla
  «Actualizar con datos nuevos»; genera el reporte para revisarlo y luego lo envía a toda la
  lista activa. Avisa si el período repite días del último reporte enviado (no lo impide), deja
  constancia a nombre de quien lo pidió y no corre si ya hay otro envío a la lista en curso.
- Guardar sin cambiar el día ni la hora conserva la próxima fecha (no se come un envío
  vencido que el cron aún no atendió); cambiar solo el período tampoco la mueve. La bitácora
  anota el día, la hora y el período que cubre.
- Las migraciones `20261126120000_notificacion_periodo_envio` (`modo_periodo`, `dias_periodo`,
  por defecto `continua` y 7) y `20261126150000_notificacion_incluir_dia_envio`
  (`incluir_dia_envio`, por defecto `false`) solo agregan columnas: el código anterior las
  ignora, así que se aplican antes de desplegar.

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

   Luego, en la pantalla: confirmar que haya una conexión de correo marcada con «Enviar el reporte para gerencia con esta conexión»,
   agregar destinatarios, **enviar una prueba**, y recién entonces activar el envío.

## Operación y solución de problemas

| Síntoma | Causa probable |
| --- | --- |
| Aviso «el envío debía salir… y todavía no salió» | El cron no está corriendo o recibe 401/503: mira `/home/dev/russell-notificaciones.log`. |
| 503 en el log | Falta `CRON_SECRET` en el entorno del proceso (recargar con `--update-env`). |
| 401 en el log | El secreto del crontab no coincide con el del proceso. |
| Ejecución «Con error»: no hay conexión de correo | Marcar una conexión SMTP/Gmail de Producción como «Enviar el reporte para gerencia con esta conexión» en `/config/conexiones`. |
| Ejecución «Omitido» | El cron estuvo caído más de 24 h al llegar la hora; se saltó ese envío. Usa «Enviar ahora» si hace falta. |
| «Parcial» | Algún destinatario fue rechazado por el SMTP; el resto lo recibió. El envío quedó registrado. |
| «Con error» tras «el servidor se reinició» | PM2 reinició a mitad del envío. Comprueba si llegó antes de reenviar. |

Un correo «aceptado» por el SMTP no garantiza que llegue a la bandeja.

## Código

- Pura y con pruebas: `src/lib/notificaciones/` (`programacion.ts`, `destinatarios.ts`,
  `panel.ts`).
- Orquestación (BD, correo): `src/lib/notificaciones/reporte-ejecutivo-servidor.ts`.
- Disparador: `src/app/api/tareas/notificaciones/route.ts`.
- Acciones de la pantalla: `src/app/actions/notificaciones-programadas.ts`; panel en
  `src/app/(app)/config/reportes-ejecutivos/envio-automatico.tsx`.
- Generación sin sesión: `src/lib/auditoria/reporte-ejecutivo/generar-servidor.ts`
  (la acción `generarReporteEjecutivoUso` autoriza y delega en él).
- Formato correo en el servidor: `src/lib/correo/formato-correo-servidor.ts`; envío con HTML
  propio: `enviarHtmlRegistrado` en `src/lib/correo/notificaciones.ts`.
