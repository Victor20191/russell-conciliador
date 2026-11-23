# Impuestos para clientes sin balance por terceros: movimientos por tercero del ERP

## Para qué

Un cliente con la excepción «No maneja balance por terceros» (`clientes.balance_por_terceros = false`, hoy MUMA S.A.S) concilia Cartera y CxP por cuenta. Los impuestos (Retención en la fuente, IVA y RST), en cambio, necesitan el detalle por tercero para tachar a la DIAN. Para ellos el cliente entrega, además de los formularios, el reporte de su ERP con los movimientos de enero a la fecha de corte por cuenta y documento, con el NIT y el nombre del tercero.

## Por qué alcanza el movimiento

Con un balance que empieza el 1 de enero, el cruce de impuestos deja a la DIAN en cero y a cada tercero le resta su saldo inicial (`aporteTercero`, `src/lib/impuestos/retencion/cruce.ts`). Es decir, trabaja con el movimiento del año. Por eso cada tercero del archivo se guarda con saldo inicial 0 y saldo final = débitos − créditos: el cruce da lo mismo que con un balance por terceros equivalente (prueba en `retencion.test.ts`).

La excepción son las cuentas donde no se resta la DIAN (236575, 135595 y las que se configuren en Mapeo cuentas DIAN). Ahí la DIAN suma solo su movimiento del año, porque el archivo no trae saldos iniciales por tercero; la pantalla lo avisa y la diferencia se explica con marca.

## Flujo

1. El balance del corte se carga y se cierra como siempre (por cuenta). Debe empezar el 1 de enero.
2. En el balance, donde una tarjeta dice «Cliente con excepción de balance por terceros», botón «Adjuntar terceros» y, en esa pantalla, otra vez «Adjuntar terceros»: Excel `.xlsx`, subido por partes (`/api/balance/archivo-temporal`).
3. Se escogen las columnas: cuenta, NIT, nombre (opcional) y valores, como débito y crédito o como un importe con signo (positivo = débito). Se sugieren por los encabezados; el reporte de SAP de MUMA trae «Cuenta», «Importe en moneda local», «DB», «CR», «Clave referencia 1» (NIT) y «Clave referencia 3» (nombre).
4. «Leer y amarrar con el balance» recorre el archivo en flujo (400 mil filas en unos 30 s), agrega por cuenta y tercero solo los grupos 13, 21, 22, 23, 24 y 28, y liga cada cuenta con la del balance (la misma o la más larga del balance que sea su prefijo), que aporta el nombre y la homologación.
5. **Amarre**: por cuenta, el movimiento del archivo debe igualar el del balance (saldo final − saldo inicial) dentro del umbral «descuadre». Si una cuenta no amarra, o el archivo trae una cuenta con movimiento que no está en el balance, no se guarda nada y se muestra la tabla.
6. Se guarda como captura por tercero ligada al balance (`balance_tercero_encabezado` con el `lote_id` del balance y `origen_extraccion = "movimientos-erp"`). Los movimientos sin NIT ni nombre quedan en el tercero «Sin tercero».

## Reglas

- Solo para clientes con la excepción. Los impuestos aceptan la captura de movimientos solo si el cliente tiene la excepción (`cargarCandidatosBalanceCruce(..., { aceptarMovimientosErp })`); Cartera y CxP nunca la toman como balance por terceros.
- Permiso `balance:crear` con alcance de escritura sobre el cliente.
- Reemplazar o quitar el archivo queda bloqueado mientras haya un cierre en firme contra ese balance.
- No hay migración: se reutilizan las tablas de la captura por tercero.

## Código

- Lógica pura: `src/lib/balance/movimientos-tercero.ts` (+ `.test.ts`) y constantes en `movimientos-tercero-constantes.ts`.
- Lectura en flujo: `src/lib/balance/movimientos-tercero-servidor.ts`.
- Acciones: `src/app/actions/balance-movimientos-tercero.ts`.
- Pantalla: `src/app/(app)/balance/[id]/terceros/movimientos-tercero-panel.tsx`.
- Cruce: `src/lib/impuestos/retencion/cruce-servidor.ts` (letrero «Balance por cuenta con terceros agregados» en `cruce-revision.tsx`).

## Nombres en pantalla

- El balance con el archivo adjunto se llama **«Balance por cuenta con terceros agregados»** (etiqueta junto al archivo, tarjeta del balance, descripción del balance en el cruce de impuestos).
- El botón del balance dice **«Adjuntar terceros»** y, ya agregados, **«Terceros agregados»**; la pantalla lleva el mismo nombre.
- Todas dicen que los terceros agregados sirven **solo para los impuestos**.
