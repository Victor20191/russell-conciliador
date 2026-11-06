# Diseño · Impuestos › Retención en la fuente (Fase 0)

Estado: **aprobado el 31/Oct/2026**. Fase 1 construida el mismo día (ver «Avance» al final).
Fuente: `PROMPT-retencion-fuente.md` (misma carpeta), las respuestas que diste el 31/Oct/2026
y una consulta de solo lectura a la base del mismo día.

## 1. Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Base del cruce | Saldo final al corte − tercero DIAN, con aviso de saldo inicial y, si el balance empieza el 1 de enero, opción de restarlo por revisión |
| NIT de la DIAN | Lista configurable con **800197268** y **800197384** |
| Pagos efectuados | Intereses de mora (35) aparte: 136 vs Σ36 y 137 vs Σ34 |
| Diferencias del cruce | Umbral propio «Diferencias de impuestos» |
| Prototipo «Impuestos · DIAN» | Se quita; Retención se construye aparte |
| Lectura de PDF | Solo Claude (sin librería de PDF nueva) |
| Entregas | Por fases, con tu visto bueno entre cada una |

## 2. Lo que encontró la consulta a la base (y cómo cambia el diseño)

- **La DIAN está con el NIT 800197268**, no con el del documento. En los 31 balances por
  tercero que tienen 2365/2367, 800197268 aparece en 26 (de 20 clientes), como «U.A.E.
  DIRECCION DE IMPUESTOS Y ADUANAS NACIONALES», «DIAN» y otras variantes; 800197384 no
  aparece en ninguna fila de 2365/2367 (solo en 1355 y 2335). Por eso la lista lleva los dos.
- **Hay un tercero DIAN sin NIT** (31 filas en un balance, con el nombre completo). Con solo
  la lista de NIT no se tacharía. Propuesta: si el nombre contiene «IMPUESTOS Y ADUANAS»,
  el sistema lo propone como DIAN y el usuario lo confirma; nunca por «DIAN» suelto (hay
  personas llamadas Diana).
- **El 9 % de los terceros de 2365 trae saldo inicial** (2.405 de 25.825 filas, en balances
  que empiezan el 1 de enero). El aviso se agrupa por cuenta («N terceros traen saldo
  inicial por $X») para no llenar la pantalla.
- **Solo 15 de 33 balances por tercero empiezan el 1 de enero**; el resto son mensuales. En
  un balance mensual el saldo inicial de un proveedor es normal (acumula el año), así que
  el aviso solo se calcula cuando el balance del corte empieza el 1 de enero del año
  revisado; si no, la pantalla dice que no se puede comprobar el arrastre.
- **Autorretenciones (236575) son el volumen grande**: 46.517 de las 60.114 filas de
  2365/2367. El detalle de terceros se carga al desplegar y por páginas.
- Algunas cuentas del cliente 2365/2367 están homologadas a 2408 o 2495 (8 cuentas, 3
  balances). El cruce lee por cuenta Russell, así que esas no entran: se avisa.
- **Faltan en el plan Russell 236545, 236560 y 236565** (confirmado en la base).
- Los **174 clientes** tienen NIT de 9 dígitos sin DV ni símbolos y **todos** están
  marcados con RETEFUENTE, IVA e ICA en `formularios_dian_cliente`. El último dígito para
  el calendario es el 9.º carácter del NIT guardado.
- El prototipo tiene datos de demostración: 11 períodos, 44 renglones, 7 mapeos y 5
  comentarios; `dian` y `mapeos_dian` están ocultos para quien no es Superadministrador.
- `formularios_dian` tiene ICA con código «F-CHIP», que no corresponde (el ICA es
  municipal). Se corrige cuando llegue ICA.

## 3. Menú, rutas y pantallas

| Menú | Entrada | Ruta |
|---|---|---|
| Trabajo | **Impuestos › Retención en la fuente** (IVA e ICA después) | `/impuestos/retencion` |
| Catálogos contables | **Mapeos DIAN** | `/config/mapeos-dian` |
| Parametrización | **Calendario tributario** | `/config/calendario-tributario` |

**`/impuestos/retencion`** — índice agrupado cliente → año → revisiones (precierre,
cierre u otro corte), con estado (En proceso / con pendientes / En firme), como el índice
de los módulos. Botón «Nueva revisión»: cliente → año → corte (atajos «Precierre ·
septiembre» y «Cierre · diciembre», cualquier mes posible). La periodicidad no se pregunta:
Retención en la fuente es siempre mensual (5/Nov/2026).

**`/impuestos/retencion/[id]`** — una revisión, con pestañas:

1. **Formularios** — la lista de períodos esperados hasta el corte. Por período: el 350
   (original, correcciones y cuál está vigente), los 490 esperados (61/62/63) y cuáles
   faltan, o la causal si no hubo formulario. Botón «Importar PDF» (varios a la vez) y,
   por período, «No hubo formulario» con causal.
2. **Por meses** (Vista 1) y **Acumulado** (Vista 2).
3. **Cruce contable**.
4. **Oportunidad**.
5. **Pagos efectuados**.
6. **Novedades** — lo que falta para cerrar (formularios, pagos, marcas) y, cuando se
   diseñen, las alertas.

Barra superior: balance del corte usado, estado, «Exportar a Excel», «Cerrar en firme» /
«Desbloquear».

**Confirmación de lectura** (panel dentro de Formularios): el PDF al lado y lo leído, con
los controles aritméticos en verde o rojo, los valores editables y «Confirmar». Un
formulario sin confirmar no cuenta en ningún cálculo.

**`/config/mapeos-dian`** — la tabla concepto → renglones → cuenta Russell, por cuenta
Russell la casilla «Restar el tercero DIAN» y la lista de NIT de la DIAN.

**`/config/calendario-tributario`** — por año y formulario, la grilla período × dígito.
«Importar desde el PDF de la DIAN» (Claude propone, el usuario revisa y confirma) y edición
a mano.

## 4. Permisos y publicación

Publicación: llave nueva **`impuestos`** («Impuestos DIAN», grupo Trabajo), **En
desarrollo** hasta terminar: solo la ve el Superadministrador. Oculta las tres entradas
del menú.

| Permiso | Para | Roles | Alcance |
|---|---|---|---|
| `impuestos:ver` | Ver revisiones, vistas, resultados, Mapeos DIAN y calendario | Todos | lectura del cliente |
| `impuestos:cargar` | Crear revisión, importar PDF, confirmar lecturas, causales | Staff, Senior, admins | escritura |
| `impuestos:editar` | Marcas de diferencias, corrección manual de una lectura | Staff, Senior, admins | escritura |
| `impuestos:eliminar` | Descartar un formulario o una revisión sin firme | Senior, admins | escritura |
| `impuestos:comentar` | Comentar | Todos | lectura |
| `impuestos:configurar` | Editar Mapeos DIAN y el calendario tributario | Gerente, Socio, admins | — |
| `conciliaciones:cerrar` / `:desbloquear` (existentes) | Cerrar en firme / desbloquear | senior o gerente asignado, Superadmin | como en los módulos |

Se retiran `dian:*` y `mapeos_dian:*` con el prototipo. Activar exige
`npm run db:sync:rbac` (simulación primero; `-- --aplicar` también revoca concesiones a
mano) y subir la llave de la caché de la matriz y la de publicación.

## 5. Modelo de datos (migración aditiva)

Todas las tablas y columnas en español; dinero `Decimal(18,2)`; FK suaves a clientes y
usuarios, como el resto del proyecto.

**`revision_retencion`** — una revisión por cliente, año y corte.
`id`, `cliente_id`, `nombre_cliente`, `nit_cliente`, `anio`, `mes_corte` (1–12),
`periodo` («2026-09»: la llave de marcas y cierre), `periodicidad` (la confirmada al
crearla), `estado` (`en_proceso` | `en_firme`), `creado_por(_id)`, `creado_en`,
`actualizado_en`. Única (`cliente_id`, `anio`, `mes_corte`).

**`formulario_dian_cargado`** — cada PDF leído, del cliente y el año (no de la revisión:
el precierre y el cierre del mismo año comparten los formularios de enero a septiembre).
`id`, `cliente_id`, `anio`, `periodo` (1–12), `formulario` (`350` | `490`), `numero`
(renglón 4, único), `estado` (`por_confirmar` | `confirmado` | `descartado`),
`codigo_correccion` (25), `numero_anterior` (26), `fecha_presentacion` (997 del 350, fecha
de Colombia), `autoadhesivo` (996), `nit_leido`, `dv_leido`, `razon_social`;
solo 490: `concepto` (61/62/63), `numero_pagado` (29), `cuota`, `de_cuotas`,
`fecha_limite_pago` (32), `fecha_pago` (997 del 490);
archivo: `nombre_archivo`, `clave_objeto`, `huella_sha256`, `tamano_bytes`;
lectura: `lectura_json` (lo que devolvió Claude, tal cual), `modelo_lectura`,
`controles_json` (resultado de los controles), `corregido_a_mano` (lista de renglones),
`anexo_exterior` (JSON de la hoja 2: 141, 143, 147 por línea; informativo);
`cargado_por(_id)`, `confirmado_por(_id)`, `confirmado_en`, `creado_en`.

**`renglon_formulario_dian`** — `formulario_id`, `renglon`, `valor` (Decimal). Solo los
renglones que se guardan (sección 4 del prompt). Única (`formulario_id`, `renglon`).

**`periodo_sin_formulario`** — `cliente_id`, `anio`, `periodo`, `formulario` (`350`),
`causal` (obligatoria), `registrado_por(_id)`, `registrado_en`. Única por las cuatro
primeras.

**`mapeo_renglon_dian`** — global (vale para todos los clientes, como el plan Russell).
`formulario`, `concepto` (clave estable, p. ej. `honorarios`), `etiqueta`, `seccion`,
`renglon_pj`, `renglon_pn`, `cuenta_russell` (null = sin cuenta), `signo` (+/−), `orden`.
Se siembra con la tabla del prompt.

**`cuenta_russell_dian`** — `cuenta_russell`, `restar_tercero_dian` (sí por defecto; no en
236575). **`tercero_dian`** — `nit` (núcleo de 9 dígitos), `etiqueta`; se siembra con
800197268 y 800197384.

**`vencimiento_dian`** — `anio`, `formulario` (`RETEFUENTE`; luego `IVA_BIMESTRAL`,
`IVA_CUATRIMESTRAL`…), `periodo`, `ultimo_digito` (0–9), `fecha`. Única por las cuatro
primeras. Quién y cuándo lo importó o editó queda en la auditoría.

**`formularios_dian_cliente.periodicidad`** — columna nueva, nula = la del formulario
(`formularios_dian.periodicidad`, «Mensual» para RETEFUENTE).

**Se reutilizan sin cambios de esquema** (con `modulo_codigo = 'RET'` y `periodo` de la
revisión):

- `marca_cruce_modulo` + `adjuntos_marca_cruce`: dimensión `cuenta4` para las filas del
  cruce (la clave es la cuenta Russell o la llave del grupo) y dimensión `control` para los
  meses de «Pagos efectuados» (`pago:2026-02`) y de oportunidad pendiente
  (`oportunidad:2026-01`).
- `conciliacion_modulo_cierre` + `cuenta_bloqueada_conciliacion`: el cierre en firme. Así
  el balance protege las cuentas 2365/2367 conciliadas (no se re-homologan ni se reemplaza
  el balance sin pasar por el bloqueo), con el mismo código que ya lo hace para los
  módulos. `modulo_dato_encabezado_id` guarda el id de la revisión: es FK suave y fuera de los
  módulos solo se usa para rotular «cargue #N» en los mensajes de bloqueo y de reemplazo
  del balance (`mensajePeriodoEnFirme`, `mensajeConciliacionEnFirme`,
  `reemplazo-balance.ts`) y para la ruta; con `RET` dirán «revisión #N» y la ruta de la
  revisión.
  La copia congelada guarda el resultado completo.
- `umbrales_alertas`: el umbral nuevo (sección 9).

## 6. Los formularios como dato

`src/lib/impuestos/formularios/f350.ts` y `f490.ts` (puros, con pruebas) describen cada
renglón: número, sección, persona (jurídica / natural / única), tipo (`valor` | `base` |
`total` | `dato`), si se guarda, y para los totales su fórmula como lista de términos con
signo:

```ts
{ renglon: 134, tipo: "total", terminos: [[131, +1], [132, +1], [133, -1]] }
```

La misma definición alimenta la lectura (qué pedirle a Claude y qué descartar), los
controles, las vistas (orden y secciones) y el Excel. El F300 de IVA será otro archivo con
la misma forma.

## 7. Flujos

**Nueva revisión.** Cliente → año → corte; la periodicidad es siempre mensual (decisión del
5/Nov/2026: antes se confirmaba y se guardaba en la ficha). Si ya existe la revisión, se
abre. Con eso se calculan los períodos esperados.

**Importar PDF.** Varios a la vez (tope de tamaño y de páginas por archivo). Por cada uno:

1. Huella SHA-256: si ya está cargado, se avisa y no se vuelve a leer.
2. Se guarda el original en el almacén de objetos
   (`impuestos/retencion/<cliente>/<año>/<huella>.pdf`).
3. **Lectura con Claude**: el PDF como bloque `document` y salida estructurada con Zod,
   como `src/lib/balance/extraccion/extraer.ts`. El esquema pide tipo de formulario,
   encabezado y una lista `{ renglon, valor }` con el valor **como texto de dígitos**; el
   código lo convierte a Decimal. El prompt de sistema es editable en `prompts_ia` (clave
   nueva `extraccion_formulario_dian`). Cada llamada se registra en `consumo_ia`
   (`tipoOperacion` nuevo `extraccion_formulario_dian`, con el cliente).
4. **Controles en código** (puros): los totales del formulario (130, 134, 136, 138; en el
   490, 980 = 34 + 35 + 36), la hoja 2 contra 57/58/111/112, NIT contra el cliente por
   núcleo y DV con `dvValido`, año, período ≤ corte, prefijo del número (350 → «35…»,
   490 → «49…») y concepto 61/62/63.
5. Si un control falla, **segunda lectura** con el modelo más capaz (la cascada que ya
   usa el balance: Sonnet → Opus). Si vuelve a fallar, queda «por confirmar» con los
   controles en rojo y el usuario corrige el renglón a mano (queda marcado y en la
   auditoría).
6. Queda `por_confirmar`. El usuario revisa el resumen (período, número, si es corrección,
   totales) y confirma.

Las lecturas corren en el servidor de a pocas a la vez (como el mapeo IA), con el avance
visible; un fallo en un archivo no detiene los demás.

**Correcciones.** Al confirmar un 350 con 25 = 1 se busca el 26 entre los confirmados del
período; el sistema muestra la cadena (original → corrección → …) y el usuario la
confirma. Vigente = el último de la cadena; original = el primero. Corrección sin original:
aviso, y la oportunidad de ese mes queda «falta el original».

**Mes sin formulario.** «No hubo formulario» con causal obligatoria; se puede deshacer
mientras la revisión no esté en firme.

**Pagos.** Un 490 confirmado se asocia al período por año + período, y se comprueba que
su renglón 29 sea un 350 de ese período (original o corrección). Pagos esperados según el
350 vigente: 61 si 130 > 0, 62 si 134 > 0, 63 si 135 > 0. Varios 490 del mismo concepto se
suman.

**Descartar.** Un formulario se descarta (el original se conserva) mientras la revisión no
esté en firme; queda en la auditoría.

## 8. Cálculos (todos puros, en `src/lib/impuestos/retencion/`)

- `periodos.ts` — períodos esperados según año, corte y periodicidad.
- `correcciones.ts` — cadena, vigente y original por período.
- `vistas.ts` — Vista 1 (por mes, persona jurídica / natural, bloque de pagos del 490) y
  Vista 2 (acumulado), siempre con los totales recalculados de la definición.
- `cruce.ts` — por concepto, suma lo declarado hasta el corte (vigentes); agrupa por cuenta
  Russell (llave con `claveGrupoCruce` cuando un concepto va a varias); lado contable =
  −saldo final de las cuentas del cliente homologadas (pasivos en positivo), con sus
  terceros; tacha y resta los terceros DIAN en las cuentas marcadas; aviso de saldo
  inicial; 129 resta en el declarado del 130; subtotales 130, 134, 135 y 136; nivel de cada
  diferencia con `nivelDiferencia` y el umbral nuevo.
- `oportunidad.ts` — vencimiento por calendario y último dígito del NIT (sin DV);
  presentación del original; pago del 490 concepto 61; estados Oportuno / Extemporáneo /
  Sin formulario / Falta el original / Sin calendario / Sin pago.
- `pagos.ts` — por mes con el 350 vigente: (136 − Σ36) + (137 − Σ34), intereses aparte,
  desglose 130/61, 134/62, 135/63; «Pago completo» o «Diferencia en el pago».
- `cierre.ts` — qué falta para cerrar en firme.

Se reutilizan `claveGrupoCruce`, `nivelDiferencia`, `siguienteNumeroMarca`,
`nucleoNit`/`dvValido` y la selección del balance (`seleccionarBalanceCruceModulo`). El
cruce de los módulos (`construirCruceContable`) no se fuerza: su entrada es el Consolidado
de un archivo, y aquí el lado declarado, los terceros, la DIAN y los subtotales del
formulario son distintos.

**Balance del corte.** El cerrado y vigente que termina en el mes del corte, con
aprobación vigente del prevalidador y **con detalle por tercero**. Retención **no se agrega
al catálogo del prevalidador**: hacerlo cambiaría su huella y dejaría desactualizadas las
aprobaciones de todos los balances. Se usa la misma compuerta sin la condición «el módulo
está cubierto por el catálogo».

## 9. Umbral «Diferencias de impuestos»

Clave `impuestos_diferencia`, sección nueva «Impuestos» en Parámetros de alertas.
**Valor de fábrica propuesto: $6.000** — es lo máximo que el redondeo a miles de la DIAN
($500 por renglón y mes) acumula en un renglón en 12 meses. Por debajo, «Diferencia
informativa» sin marca; desde el umbral, marca obligatoria para cerrar. Lo cambian Gerente,
Socio y administradores en `/config/parametros`. «Pagos efectuados» no usa umbral: compara
al peso.

## 10. Cierre en firme

Exige: cada período esperado con su 350 confirmado o su causal; las cadenas de corrección
confirmadas; ningún formulario por confirmar; marca en cada fila del cruce desde el umbral,
en cada mes con «Diferencia en el pago» y en cada mes con «Falta el original». Bloquea las
cuentas del cliente que entraron al cruce, deja el período de solo lectura y guarda la
copia congelada. Desbloquear exige justificación. El cierre no toca Nómina: Nómina trata la
2365 como control y su cierre es independiente (dos cierres pueden bloquear la misma
cuenta).

## 11. El prototipo «Impuestos · DIAN»

- **Se quitan**: las pantallas `/dian` y `/config/dian`, `src/app/actions/dian.ts`, sus
  entradas del menú, los permisos `dian:*` y `mapeos_dian:*`, y las llaves de publicación
  `dian` y `mapeos_dian`.
- **Se borran después, con tu visto bueno y en una migración aparte**: las tablas
  `periodos_dian`, `secciones_dian`, `renglones_dian`, `mapeos_dian` y `comentarios_dian`
  con sus datos de demostración.
- **Se conservan**: `formularios_dian` y `formularios_dian_cliente`. No son del prototipo:
  son el campo «Formatos DIAN» de la ficha del cliente (formulario, importación y
  exportación por Excel), con los 174 clientes marcados.

## 12. Pruebas

Junto al código, sin BD: definición del 350/490 y sus fórmulas; normalización (fechas
«2 0 2 6 -0 3 -1 9» y «2026-03-19 / 03:08:44 PM», NIT pegado al DV, valores con comas);
controles; correcciones; períodos y pagos esperados; último dígito del NIT; oportunidad;
pagos; cruce (agrupación, DIAN por lista de NIT y por cuenta, saldo inicial, 129); y
validación del calendario con la tabla 2026 del prompt.

Fixtures: los valores leídos de los PDF de Melonn como JSON **anonimizados** (NIT y razón
social ficticios), con los resultados esperados de la sección 7 del prompt, y la regresión
de INDAER (dígito 7). Los PDF no se versionan. La llamada a Claude se prueba con un
simulador; una prueba real con un PDF se hace solo a mano y con tu permiso (escribe en
producción).

## 13. Plan por fases

| Fase | Entrega | Migración / BD |
|---|---|---|
| 1 · Configuración | Llave `impuestos` y permisos nuevos; Mapeos DIAN y Calendario tributario en el menú; periodicidad en la ficha; Mapeos DIAN; calendario (importar con Claude + grilla); definición del 350/490; retiro de las pantallas del prototipo | Aditiva + `db:sync:rbac`; las tres cuentas se crean desde Plan Estándar Russell |
| 2 · Cargue | Entrada «Impuestos › Retención en la fuente» del menú; revisión, importación, lectura con Claude, confirmación, correcciones, causales, pagos | Aditiva (tablas de formularios) |
| 3 · Vistas | Por meses, Acumulado, Excel | — |
| 4 · Cruce | Cruce contable, terceros, DIAN, aviso de saldo inicial, umbral, marcas | Fila del umbral |
| 5 · Oportunidad, pagos y cierre | Oportunidad, Pagos efectuados, cierre en firme, Novedades, ayuda, versión minor en borrador | — |
| Después | Borrar las tablas del prototipo | Destructiva, aparte |

Cada fase: `tsc`, `test` y `lint` en verde; fichas de ayuda (`src/lib/ayuda/fichas/impuestos.ts`
nueva y sus reglas); resumen; tu visto bueno. Migraciones con `npm run db:deploy` solo
cuando lo autorices.

## 14. Por confirmar

1. **DIAN sin NIT**: proponer como DIAN al tercero cuyo nombre contiene «IMPUESTOS Y
   ADUANAS», con confirmación del usuario.
2. **Aviso de saldo inicial** solo cuando el balance del corte empieza el 1 de enero.
3. **Umbral de fábrica $6.000.**
4. **Retención fuera del catálogo del prevalidador** (sección 8).
5. **Mapeo global** para todos los clientes (no por cliente).
6. **Conservar `formularios_dian` y `formularios_dian_cliente`** (sección 11).
7. **Falta el original → marca para cerrar** ese mes.
8. **Fecha de pago con varios 490 del 61**: la del último pago; **mes sin 61**: la del
   primer 490 que haya, indicando cuál.
9. **Periodicidades distintas de mensual**: ¿cuáles hay? Propuesta: bimestral, trimestral,
   semestral y anual, cada una con sus períodos esperados. Cerrada el 5/Nov/2026: Retención
   en la fuente es siempre mensual y no se pregunta.
10. **Cuentas de pago aparte** (236599, 236799): fuera del cruce (ya señalado en el prompt).
11. **Cuenta del renglón 129**: sigue pendiente con Russell.

## Avance

**Fase 1 (31/Oct/2026) — construida, sin desplegar.** Migración `20261031120000_impuestos_configuracion`
(aditiva, sin aplicar), permisos `impuestos:*` y llave de publicación `impuestos` (en desarrollo),
`/config/mapeos-dian`, `/config/calendario-tributario`, periodicidad en la ficha del cliente, definición
del 350/490 con pruebas y retiro de las pantallas del prototipo. Dos ajustes frente al plan:

- Las cuentas 236545, 236560 y 236565 no se crean con un script: se saltaría la bitácora del plan y la
  caché del plan Russell no se invalidaría. Se crean desde Plan Estándar Russell › Nueva Subcuenta.
- La entrada «Impuestos › Retención en la fuente» del menú llega en la Fase 2, con su pantalla.

La migración y `db:sync:rbac` se aplicaron el 31/Oct/2026.

**Fase 2 (31/Oct/2026) — construida, sin desplegar.** Migración `20261031180000_impuestos_formularios`
(aditiva). Pantallas `/impuestos/retencion` (revisiones y «Nueva revisión») y `/impuestos/retencion/[id]`
(importar varios PDF, por confirmar, formularios por período, causales, eliminar revisión), panel de
confirmación con controles en vivo, lectura con Claude en dos modelos y ruta del PDF original. Ajustes
frente al diseño:

- La confirmación de la cadena de correcciones es la misma confirmación del formulario: el panel muestra a
  cuál corrige y, en la tabla, si el original no está cargado. No hay un paso aparte.
- Descartar un formulario por confirmar lo puede hacer quien carga (`impuestos:cargar`); uno confirmado,
  solo con `impuestos:eliminar` (senior).
- Un formulario de un período posterior al corte se guarda (sirve para el cierre del mismo año) con un aviso;
  no cuenta en la revisión.

La migración se aplicó el 31/Oct/2026 y la Fase 2 se probó con los 17 PDF reales de Melonn (revisión n.º 1,
2026 corte agosto, que se conserva): las 17 lecturas coincidieron con los PDF y la tabla de períodos dio el
resultado esperado de la sección 7 del prompt.

**Fase 3 (31/Oct/2026) — construida, sin desplegar.** Pestañas «Formularios», «Por meses» y «Acumulado» en la
revisión y «Exportar a Excel» (por meses, acumulado y formularios). Sin migración.

**Fase 4 (31/Oct/2026) — construida, sin desplegar.** Pestaña «Cruce contable» (filas por cuenta Russell con
sus conceptos, subtotales 130/134/135 y total 136, detalle desplegable con las cuentas del cliente y sus
terceros, DIAN tachada, avisos de saldo inicial y de DIAN sin NIT, cuentas fuera del cruce y marcas con
número), umbral «Diferencias de impuestos» ($6.000) en Parámetros de alertas y hoja «Cruce contable» en el
Excel con todos los terceros. Sin migración: las marcas usan `marca_cruce_modulo` con código RET. Ajustes
frente al diseño:

- La compuerta del prevalidador del cruce es la misma de los módulos, pero sin exigir que Retención esté en el
  catálogo del prevalidador (`validarCompuertaPrevalidador` con módulo `null`): sí exige su aprobación vigente.
- Un tercero sin NIT con nombre de la DIAN solo se avisa; confirmarlo como DIAN queda para después.
- Las alertas del cruce siguen pendientes de diseño; el punto de extensión es `ResultadoCruce`.

**Fase 5 (31/Oct/2026) — construida, sin desplegar.** Pestañas «Oportunidad», «Pagos efectuados» y «Novedades»,
marcas de los meses de pagos y de oportunidad, «Cerrar en firme» y «Desbloquear» con copia congelada, hojas
«Oportunidad» y «Pagos efectuados» en el Excel. Con Melonn (corte agosto) da lo esperado en la sección 7 del
prompt: enero «Falta el original» con pago oportuno el día del vencimiento, febrero a agosto oportunos, pagos de
enero −6.786.000 (130 vs 61 = −8.942.000; 134 vs 62 = +2.156.000), febrero a julio sin el reteIVA y agosto
«Pago completo». Sin migración. Ajustes frente al diseño:

- La marca de oportunidad (corrección sin original) no guarda cifra: vale mientras el mes siga sin original.
- La copia congelada guarda también los períodos: en firme, «Por meses», «Acumulado» y la tabla de
  formularios por período salen de ella.
- Un cierre puede quedar sin cuentas bloqueadas si ninguna cuenta del cliente está homologada a las del cruce;
  los módulos lo rechazan, aquí se permite porque el cruce ya exigió marcar esas diferencias.
- Novedades lista lo que falta para cerrar y los avisos; las alertas de la carga y del cruce siguen pendientes.
