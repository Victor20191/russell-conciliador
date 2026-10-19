# Balances por fecha de corte

Desde el 18/Oct/2026 los balances de un cliente se organizan, comparan y cierran por su **fecha de
corte** (`periodo_fin`). Reemplaza al control entre archivos de aperturas distintas
(`balance_cruce_aperturas`, sin uso; se borra después del despliegue).

## Por qué

Toda la conciliación de los módulos se hace contra el **saldo final** del balance. Por eso lo que
importa de un balance es el día en que termina, no desde cuándo arranca ni si viene por cuenta o
por terceros. «Diciembre 2025», «Enero 2025 – Diciembre 2025» y el «por terceros» de diciembre
tienen que coincidir en sus saldos finales.

## Conceptos

- **Corte:** cliente + fecha final exacta.
- **Línea:** dentro del corte, el texto del período más la apertura efectiva (la de
  `aperturaDeListado`, igual que el listado). Recargar el mismo balance crea una versión nueva de
  su línea; los números siguen saliendo de `siguienteVersionCargue`, por texto.
- **Vigente:** la versión más reciente de cada línea (fecha de carga y luego id). Solo los
  vigentes entran a la comparación; las versiones anteriores son historial.

Código puro en `src/lib/balance/corte.ts`.

## Comparación

`compararSaldosFinales` (`src/lib/balance/comparacion-corte.ts`) compara dos balances por cuenta
del cliente (`cuenta8`): suma las filas repetidas, toma una cuenta ausente como cero y redondea a
centavos. Se guardan todas las cuentas con diferencia.

**Umbral del corte** (18/Oct/2026): «Diferencia entre balances del mismo corte» (`corte_saldo_final`
en /config/parametros, fábrica $1.000). Solo una cuenta que difiere desde ese monto (inclusive)
vuelve inconsistente el par e impide cerrar; las menores se muestran en el panel y en el borrador
rotuladas «no impide cerrar». El umbral se aplica al LEER (`resumenDiferenciasCorte`,
`resumenDeComparacion`), así que cambiarlo rige de inmediato sin recalcular; la columna
`inconsistente` de la tabla solo dice si el par difiere a centavos. Cambiar el umbral no genera
notificaciones: solo un cambio de saldos que vuelve inconsistente un par.

`balance_comparacion_corte` guarda un registro por par de vigentes (`balance_a_id < balance_b_id`,
FK en cascada). El recálculo (`recalcularComparacionesDelCorteEn`, en
`comparacion-corte-datos.ts`, sin `server-only` porque lo usa el script) toma el candado
`balance-corte:{cliente}:{AAAA-MM-DD}`, borra los pares que ya no son de vigentes y reescribe los
demás. No es pegajoso: si el balance se corrige, el par vuelve a coincidir.

Se recalcula al confirmar un cargue, al reintentar un borrador, al eliminar una cuenta del detalle,
al eliminar un balance (la versión anterior vuelve a ser la vigente), al cerrar y con «Revisar
comparación». Las páginas solo leen: un corte «Sin comparar» se resuelve con una de esas acciones.
Cada par que pasa a tener diferencias queda en la bitácora («DETECTÓ DIFERENCIAS ENTRE BALANCES DEL
CORTE») y en las notificaciones.

## Pantallas

- `/balance`: dentro de cada cliente, un grupo por corte (el más reciente primero) con una fila por
  vigente. Con dos o más vigentes, el rótulo dice si son consistentes, inconsistentes o están sin
  comparar.
- `/balance/[id]`: el panel «Balances del mismo corte» muestra los demás vigentes, si coinciden y,
  si no, la tabla de cuentas con diferencia. Ofrece **Abrir**, **Eliminar** o **Reemplazar el
  balance conciliado** según el caso.
- Borrador: antes de «Cargar balance» compara la lectura con los vigentes del corte. Se puede
  cargar igual; el balance queda inconsistente. Si la vigente de la misma línea está cerrada, el
  botón se deshabilita: hay que abrirla primero.

## Cerrar, abrir, eliminar y reemplazar

- **Cerrar** (`freezeBalance`, `evaluarCierreBalance`): solo la versión vigente de su línea, sin
  versiones anteriores cerradas, con todos los vigentes del corte comparados y coincidentes, y con
  el prevalidador aprobado. Ya no existe la «versión oficial» ni el traslado del cierre de una
  conciliación.
- **Versión nueva:** `persistirCargue` rechaza una versión nueva si la vigente de su línea está
  cerrada (`motivoVersionSobreCerrada`).
- **Abrir** (`descongelarBalance`): igual que antes; los módulos dejan de cruzar contra él.
- **Eliminar** (`eliminarBalance`): un balance cerrado se abre antes de eliminarlo; uno con una
  conciliación de módulo en firme no se elimina.
- **Reemplazar** (`reemplazarBalanceConciliado`, `evaluarReemplazoBalance`): en un solo acto mueve
  la conciliación del balance viejo al nuevo, elimina el viejo y cierra el nuevo. Exige la misma
  fecha de corte, que el nuevo sea vigente y tenga el prevalidador aprobado, que sus cuentas en
  firme sean idénticas en saldo final y homologación (y su detalle por tercero en Cartera y CxP), y
  que sin el viejo el corte quede consistente.

Orden global de candados: `prevalidador-catalogo` → `balance-eliminar:{c}` →
`balance-oficial:{c}:{texto}` → `conciliacion-cierre:*` → `balance-tercero-cargue:*` →
`balance-corte:{c}:{fecha}`.

## Conciliación en firme

Lo que queda en firme es el **saldo final y la homologación** de las cuentas del alcance del cierre,
en todo balance del mismo mes de corte (el guard sigue siendo por mes). En `/balance/[id]` el
distintivo «En firme» va bajo el saldo final y la homologación de esas cuentas no se puede cambiar.

## Módulos

`seleccionarBalanceCruceModulo` solo elige un balance **cerrado y vigente** que termine en el mes del
cargue; Cartera y CxP exigen además el detalle por tercero. Sin él, `motivoSinBalanceCruce` explica
qué falta y la cédula no se calcula. Una conciliación en firme sigue fijada a su balance.

## Migración de datos

`npm run db:balances:cortes-18oct` (simulación por defecto; `--aplicar`; `--revertir <snapshot>`)
abre los cerrados vigentes con diferencias y las versiones anteriores cerradas (salvo las que sean
base de una conciliación en firme, que solo reporta) y guarda las comparaciones de todos los cortes.
Orden: migración `20261019120000_balance_comparacion_corte` → código → script.

La tabla del control anterior, `balance_cruce_aperturas`, sigue en la base sin uso: el modelo ya
salió del esquema, pero el código desplegado antes de este cambio la lee en `/balance`. Se borra
con una migración propia (`DROP TABLE "balance_cruce_aperturas"`) DESPUÉS de desplegar este código.
