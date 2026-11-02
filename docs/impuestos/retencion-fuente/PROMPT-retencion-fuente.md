# Módulo Impuestos · Retención en la fuente (formularios DIAN 350 y 490)

Usa el agente `russell-conciliador-evolucion` y trabaja en el proyecto principal
`C:\Proyectos - xentria\russell-conciliador` (sin worktrees: el usuario revisa en su
localhost:3000). Responde siempre en español.

## 0. Cómo trabajar

- Lee primero `CLAUDE.md` y `AGENTS.md` (Next 16 con cambios de ruptura: consulta
  `node_modules/next/dist/docs/`; base de datos en español con `@@map`/`@map`).
- **Por fases.** Cada fase termina con `npx tsc --noEmit`, `npm run test` y `npm run lint`
  en verde, un resumen de lo hecho y lo que quedó pendiente, las fichas de ayuda
  actualizadas, y **esperas el visto bueno del usuario antes de seguir**.
- **`.env` apunta a PRODUCCIÓN y la app local escribe en producción.** Las migraciones son
  aditivas y se aplican con `npm run db:deploy` solo cuando el usuario lo autorice. No
  pulses botones dentro de confirmaciones al verificar en el navegador. Cargar los PDF de
  ejemplo en la app crea datos reales del cliente: pide permiso antes; prefiere pruebas
  unitarias con fixtures.
- Dinero siempre en `Decimal(18,2)`, nunca `Float`.
- Tras `prisma generate`, reinicia el servidor de desarrollo (el cliente de Prisma en
  `globalThis` sobrevive al HMR). En archivos `"use server"` no re-exportes tipos.
  Si cambias la forma de algo cacheado con `unstable_cache`, cambia su llave.
- Sin commit, tag ni push salvo que el usuario lo pida.

## 1. Qué es y para qué sirve

Impuestos (DIAN) tendrá tres submódulos: **Retención en la fuente**, IVA e ICA. Ahora se
construye solo Retención en la fuente, pero diseña la base (catálogo de formularios,
periodicidad por cliente, calendario de vencimientos, carga de PDF, mapeo renglón → cuenta
Russell) para que IVA (F300) e ICA la reutilicen.

En Russell la revisión del formulario 350 es **acumulada a un corte**: el **precierre**
(generalmente al 30 de septiembre: 9 formularios) y el **cierre** (31 de diciembre: 12).
El usuario importa los PDF de los formularios 350 (declaración) y 490 (recibo de pago) de
cada mes del año hasta el corte, y el sistema:

1. Muestra los valores de cada renglón por mes (Vista 1) y acumulados (Vista 2).
2. Concilia lo declarado contra el **saldo final** del balance por terceros al corte.
3. Mide la oportunidad de presentación y de pago contra el calendario DIAN.
4. Compara lo pagado (F490) contra lo declarado (F350).

## 2. Insumos (léelos antes de diseñar)

En `docs/impuestos/retencion-fuente/`:

- `Informacion Retencion en la fuente.docx` — instrucciones levantadas con los usuarios.
- `Retencion en la fuente - F350 y F490.xlsx` — ocho pestañas:
  - **Formulario 350** y **Formulario 490**: cada casilla, qué se guarda («x no guardar»
    marca lo que no) y de dónde se leen la corrección (25, 26) y las fechas (997).
  - **F350-Mapeo Russell**: renglón → cuenta Russell (tabla de la sección 4).
  - **Vista 1 - Meses (expandido)** y **Vista 2 - Meses (Colapsado)**: las dos vistas.
  - **Resultado - Cruce Contable**, **Resultad -Indicador oportunidad** y
    **Resultado- Pagos efectuados**: el formato de los tres resultados.
  - Las pestañas valen por su **estructura e intención**. Sus fórmulas tienen deslices
    (sección 6): las reglas de cálculo son las de este prompt.
- `Calendario_Tributario_2026.pdf` — página 1, sección «Retención en la fuente».

Fuera del repositorio (datos reales; no los copies al proyecto ni los versiones):

- `C:\Users\Compumax\Downloads\Retención.zip` — 8 formularios 350 y 9 formularios 490
  reales de MELONN S.A.S. (NIT 901427659-5), 2026, períodos 1 a 8. Descomprímelos en una
  carpeta temporal fuera del proyecto. Resultados esperados en la sección 7.
- `C:\Users\Compumax\Downloads\Programa de Impuestos 2026 Indaer (1).xlsx` — el papel de
  trabajo que Russell usa hoy (hojas «Declaraciones Rte Fte», «Rete Fuente cruce»,
  «Oportunidad Dec. Rte Fte», «Cuadro oportunidad de pago», «Vencimientos»). **Solo
  referencia: tiene errores** (sección 6). Ignora las hojas de IVA.

## 3. Lo que ya existe

Reutiliza (verifica cada pieza antes de usarla):

- **Balance por terceros**: `balance_tercero_encabezado` / `balance_tercero_detalle`
  (saldo inicial, débitos, créditos y saldo final por tercero; `nit_tercero` núcleo de 9
  dígitos, `identidad_tercero` con nombre y DV). Las cuentas que empiezan por 23 y 24 conservan
  sus terceros (`PREFIJOS_TERCERO_CONSERVADOS`, `src/lib/balance/staging-tercero.ts`), pero
  el detalle solo existe si el balance se cargó con apertura por tercero. Lee siempre con
  `filasEfectivasTercero`. Ayudas de NIT/DV en `src/lib/nit.ts`.
- **Homologación**: `cuentas_cliente.cuenta_6_russell`, leída siempre con
  `resolverMapeoCliente` (`src/lib/balance/mapeo-cliente-config.ts`); plan Russell en
  `cuentas_estandar` (`/config/mapeo`). El plan tiene 236505, 236510, 236515, 236520,
  236525, 236530, 236535, 236540, 236550, 236570, 236575, 236599 («Pago de retención en
  la fuente», D), 236705, 236795 y 236799 («Pago ReteIVA», D); también 236805, 236895 y
  236899 (ICA), útiles para el tercer submódulo. En `prisma/data/puc-maestro-russell.json`
  faltan **236545, 236560 y 236565**: confírmalo en la BD con una consulta de solo lectura
  y créalas desde el plan Russell con visto bueno (nunca con `db:load:puc`).
- **Selección del balance del corte**: `seleccionarBalanceCruceModulo` /
  `motivoSinBalanceCruce` (balance cerrado y vigente que termina en el mes del corte, con
  prevalidador aprobado).
- **Cruce, marcas y cierre de los módulos**: `construirCruceContable` con su opción
  `agruparMultiAsignados` y la llave `claveGrupoCruce` (`src/lib/modulos/cruce-contable.ts`), marcas de auditoría
  (`src/lib/modulos/marcas-cruce.ts`, `marca_cruce_modulo` con soportes), comentarios de
  alertas (`comentario_alerta_modulo`), cierre en firme con copia congelada y período de
  solo lectura (`src/lib/conciliacion/cuentas-bloqueo.ts`, `copia-cierre.ts`,
  `exigirPeriodoAbierto`).
- **Umbrales**: `src/lib/balance/umbrales-alertas.ts` + `src/lib/parametros/umbrales.ts`
  (`/config/parametros`). Agrega aquí el umbral nuevo de la sección 5, Fase 4.
- **Originales y exportación**: almacenamiento de objetos (`src/lib/storage/objetos.ts`,
  patrón de `archivos_originales_modulo`) y Excel (`src/lib/export/modulo.ts`).
- **IA (si hace falta)**: lectura de PDF con Claude como en
  `src/lib/balance/extraccion/extraer.ts` (bloque `document` + `messages.parse` con Zod),
  consumo con `registrarConsumoIA` y prompt editable en `prompts_ia`.
- **Permisos y publicación**: `src/lib/rbac/catalogo.ts` (matriz; `db:sync:rbac` en
  simulación primero), `src/lib/rbac/modulos-plataforma.ts` (publicación). Los seis
  módulos actuales comparten la llave `modulos_datos`: Impuestos necesita **su propia
  llave** para quedar «En desarrollo» (solo la ve el Superadministrador) hasta terminar.
- **Ayuda en pantalla**: fichas en `src/lib/ayuda/fichas/`, reglas en
  `src/lib/ayuda/reglas.ts`, ciclo en `ciclo.ts`; se actualizan en el mismo cambio y
  describen el estado actual.

No sirve tal cual:

- El área actual «Impuestos · DIAN» (`src/app/(app)/dian/`, `src/app/(app)/config/dian/`,
  `src/app/actions/dian.ts`, tablas `formularios_dian`, `secciones_dian`, `renglones_dian`,
  `mapeos_dian`, `comentarios_dian`, `periodos_dian`) es un **prototipo de demostración**:
  datos globales (no por cliente), montos en `Float` y una «IA» de texto fijo. Decisión del
  usuario: **se quita y Retención se construye aparte** (detalle en `DISENO.md`, sección
  11). `formularios_dian` y `formularios_dian_cliente` se conservan: son el campo
  «Formatos DIAN» de la ficha del cliente.
- El motor genérico de módulos lee hojas de cálculo con mapeo de columnas; el 350 y el
  490 son formularios de estructura fija en PDF. Reutiliza su cruce, marcas y cierre,
  no su lectura.
- No hay librería de PDF en `package.json` (y no se agrega: la lectura es con Claude).

Ojo: Nómina trata las deducciones abonadas a 2365 como cuentas de **control**
(`src/lib/modulos/nomina/cruce-nomina.ts`), no de su cédula. Comprueba que el cierre en
firme de Retención (que bloquea las cuentas 2365/2367 del cliente) no impida nada en
Nómina, y al revés.

## 4. Reglas del formulario 350 (fuente de verdad del cálculo)

Todos los valores se guardan **en positivo**. Los renglones «Menos…» restan en su total.

**No se guardan ni se concilian las bases**: 29 a 41, 55, 56, 59 a 67, 77 a 92, 109,
110 y 113 a 120. Tampoco nombres, apellidos, código de seccional, 27, 28, 139, 140, 980
(del 350), 981 a 983 ni 994.

**Se guardan**: 1 (año), 3 (período), 4 (número de formulario), 5 (NIT), 6 (DV),
11 (razón social), 25 (código de corrección), 26 (número del formulario anterior), los
valores de retención 42 a 54, 57, 58, 68 a 76, 93 a 108, 111, 112, 121 a 138, 996
(autoadhesivo) y 997 (fecha de presentación). De la hoja 2 (pagos al exterior): 141, 143,
147 y los totales 150, 151, 154 y 155.

**Totales** (se recalculan y deben coincidir con lo impreso):

- 130 = Σ(42…54) + 57 + 58 + Σ(68…76) + Σ(93…108) + 111 + 112 + Σ(121…128) − 129
- 134 = 131 + 132 − 133
- 136 = 130 + 134 + 135
- 138 = 136 + 137
- Hoja 2: 150 = 57, 151 = 111, 154 = 58, 155 = 112

Los renglones 129 a 138 son un solo valor (sin división persona jurídica / natural).

**Conceptos y cuenta Russell** (tabla configurable por la operación en «Mapeos DIAN»;
estos son los valores iniciales):

| Concepto | P. jurídica | P. natural | Cuenta Russell |
|---|---|---|---|
| Rentas de trabajo | — | 93 | 236505 |
| Rentas de pensiones | — | 94 | 236505 |
| Honorarios | 42 | 95 | 236515 |
| Comisiones | 43 | 96 | 236520 |
| Servicios | 44 | 97 | 236525 |
| Rendimientos financieros e intereses | 45 | 98 | 236535 |
| Arrendamientos (muebles e inmuebles) | 46 | 99 | 236530 |
| Regalías y propiedad intelectual | 47 | 100 | 236570 |
| Dividendos y participaciones | 48 | 101 | 236510 |
| Compras | 49 | 102 | 236540 |
| Transacciones con tarjetas débito y crédito | 50 | 103 | 236570 |
| Contratos de construcción | 51 | 104 | 236570 |
| Enajenación de activos fijos de personas naturales | — | 105 | 236560 (por crear) |
| Loterías, rifas, apuestas y similares | 52 | 106 | 236545 (por crear) |
| Hidrocarburos, carbón y demás productos mineros | 53 | 107 | 236570 |
| Otros pagos sujetos a retención | 54 | 108 | 236570 |
| Pagos al exterior, países sin convenio | 57 | 111 | 236550 |
| Pagos al exterior, países con convenio | 58 | 112 | 236550 |
| Autorretención, exonerados de aportes (art. 114-1 E.T.) | 68 | — | 236575 |
| Autorretención: ventas, honorarios, comisiones, servicios, rendimientos, pagos provisionales, exportación de hidrocarburos, otros | 69 a 76 | 121 a 128 | 236575 |
| Menos retenciones de renta en exceso o indebidas | — | 129 | sin cuenta (ver Fase 4) |
| ReteIVA a responsables del IVA | — | 131 | 236705 |
| ReteIVA por servicios a no residentes | — | 132 | 236705 |
| Menos reteIVA en exceso o indebidas | — | 133 | 236705 (resta) |
| Retención de timbre nacional | — | 135 | 236565 (por crear) |
| Sanciones | — | 137 | no entra al cruce (solo a Pagos) |

Cada concepto suma sus dos columnas (Honorarios = 42 + 95).

**Formulario 490** (recibo de pago). Se guardan: 1 (año), 2 (concepto de pago), 3
(período), 4 (número), 5, 6, 11, 27 y 28 (cuota), 29 (número del formulario que se paga),
32 (fecha para el pago), 34 (pago sanción), 35 (intereses de mora), 36 (pago impuesto),
980 (= 34 + 35 + 36), 996 (autoadhesivo) y 997 (fecha de pago). Cada 350 puede tener
hasta tres pagos, según los saldos que declare:

- concepto **61** (retención de renta y autorretenciones) paga el **130**;
- concepto **62** (reteIVA) paga el **134**;
- concepto **63** (timbre) paga el **135**.

## 5. Requisitos por fase

### Fase 0 — Diseño (sin código)

Entrega `docs/impuestos/retencion-fuente/DISENO.md` y espera el visto bueno. Debe cubrir:
modelo de datos (formularios cargados por cliente, año, período y versión; renglones;
pagos; causales de meses sin formulario; mapeo; calendario), pantallas y su ubicación en el
menú, permisos y publicación, qué se reutiliza de la sección 3 y qué se hace con el
prototipo «Impuestos · DIAN», cómo se leerán los PDF (punto 2.3), y el valor de fábrica
que propones para el umbral de la Fase 4. Describe el formulario 350 como **dato**
(renglón, sección, tipo de persona, valor/base/total, fórmula del total, se guarda sí/no),
probado, para que el F300 de IVA se agregue igual.

### Fase 1 — Configuración

1. **Periodicidad por cliente**: periodicidad de Retención en la fuente (mensual por
   defecto) y de presentación de IVA (bimestral o cuatrimestral), como dato operativo del
   cliente (lo edita quien tiene `clientes:editar`). Evalúa guardarla como columna nueva
   de `formularios_dian_cliente` (hoy solo tiene cliente y formulario; quedaría una
   periodicidad por cliente y formulario).
2. **Mapeos DIAN**: la tabla de la sección 4, editable por Gerente, Socio y
   administradores (`mapeos_dian:configurar`) y consultable por todos. Por **cuenta
   Russell** (no por renglón, porque los renglones que comparten cuenta comparten su
   saldo): «restar el tercero DIAN», sí por defecto y **no en 236575** (sus movimientos
   con la DIAN son la autorretención misma). Los NIT de la DIAN son una lista configurable,
   sembrada con **800197268** (el que traen los balances) y 800197384 (el del
   levantamiento), y se comparan por núcleo de 9 dígitos, con o sin DV. Un renglón puede
   quedar «sin cuenta».
3. **Calendario de vencimientos** (Parametrización): por año, formulario, período y
   último dígito del NIT → fecha límite. Se importa desde el PDF de la DIAN con propuesta
   que el usuario revisa y confirma, y se puede corregir a mano. Valida 12 períodos × 10
   dígitos y que cada fecha sea posterior a su período. Prepáralo para IVA bimestral y
   cuatrimestral. Cuidado: el texto del PDF sale desordenado (p. ej. «9 del NIT 10 14 15…»
   en junio significa dígito 1 → 9, dígito 2 → 10…). Tabla 2026 de Retención para
   comprobar (día del mes siguiente; dígitos 1, 2, 3, 4, 5, 6, 7, 8, 9, 0):

   | Período | Vence en | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 0 |
   |---|---|---|---|---|---|---|---|---|---|---|---|
   | Enero | Feb | 10 | 11 | 12 | 13 | 16 | 17 | 18 | 19 | 20 | 23 |
   | Febrero | Mar | 10 | 11 | 12 | 13 | 16 | 17 | 18 | 19 | 20 | 24 |
   | Marzo | Abr | 13 | 14 | 15 | 16 | 20 | 21 | 22 | 23 | 24 | 27 |
   | Abril | May | 12 | 13 | 14 | 15 | 19 | 20 | 21 | 22 | 25 | 26 |
   | Mayo | Jun | 10 | 11 | 12 | 16 | 17 | 18 | 19 | 22 | 23 | 24 |
   | Junio | Jul | 9 | 10 | 14 | 15 | 16 | 17 | 21 | 22 | 23 | 24 |
   | Julio | Ago | 12 | 13 | 14 | 18 | 19 | 20 | 21 | 24 | 25 | 26 |
   | Agosto | Sep | 9 | 10 | 11 | 14 | 15 | 16 | 17 | 18 | 21 | 22 |
   | Septiembre | Oct | 9 | 13 | 14 | 15 | 16 | 19 | 20 | 21 | 22 | 23 |
   | Octubre | Nov | 11 | 12 | 13 | 17 | 18 | 19 | 20 | 23 | 24 | 25 |
   | Noviembre | Dic | 10 | 11 | 14 | 15 | 16 | 17 | 18 | 21 | 22 | 23 |
   | Diciembre | Ene 2027 | 13 | 14 | 15 | 18 | 19 | 20 | 21 | 22 | 25 | 26 |

### Fase 2 — Cargue de formularios

1. **Inicio**: cliente → año → **corte** (el sistema siempre pregunta a qué corte se
   revisa; precierre septiembre y cierre diciembre como atajos, cualquier mes posible) →
   confirmar la periodicidad del cliente (si no es mensual, cambian los períodos
   esperados). Con eso arma la lista de períodos esperados.
2. **Importación**: varios PDF a la vez. Cada archivo se reconoce como 350 o 490, se valida
   contra el cliente (NIT por núcleo de 9 dígitos), el año y el corte, y se rechaza un
   formulario repetido (mismo número). Se conserva el original.
3. **Lectura del PDF** (exactitud al peso). Son PDF generados por la DIAN con capa de
   texto. Ubica cada valor por su **número de renglón**, no por el rótulo: en los ejemplos
   el rótulo y el valor de 133/134 salen corridos, el NIT viene pegado al DV
   («9014276595»), las fechas vienen espaciadas («2 0 2 6 -0 3 -1 9») y el 997 trae hora
   («2026-03-19 / 03:08:44 PM»). Decisión del usuario: **la lectura la hace Claude** (sin
   librería de PDF nueva), validada en código con los totales de la sección 4; si no
   cuadra o falta un dato, segunda lectura con el modelo más capaz y, si sigue sin cuadrar,
   corrección manual. Antes de guardar, el usuario confirma un resumen por formulario (período,
   número, si es corrección, totales).
4. **Correcciones**: un período puede tener dos o más 350. Se reconoce la corrección por
   25 = 1 y 26 = número del formulario que corrige (puede haber cadena), y el usuario lo
   confirma. Se guardan todos; **los valores salen del último** (la corrección vigente) y
   la **oportunidad del primero** (el original). Si llega la corrección sin el original,
   se avisa y el indicador de ese mes queda pendiente hasta cargarlo.
5. **Mes sin formulario**: no siempre es un error. El usuario confirma que no importará el
   350 de ese mes y escribe la causal (obligatoria); queda en la auditoría.
6. **Pagos (490)**: se asocian a su 350 por año, período y renglón 29, sabiendo que el 29
   puede apuntar al original aunque exista corrección. La lista del período muestra qué
   pagos se esperan (61 si 130 > 0, 62 si 134 > 0, 63 si 135 > 0) y cuáles faltan. Varios
   490 del mismo concepto (cuotas, pagos posteriores) se suman.
7. **Alertas de la carga**: PENDIENTE (aún no se diseñan). Deja el punto de extensión.

### Fase 3 — Vistas

1. **Vista 1 — Meses (expandido)**: renglones en filas (en el orden del formulario y con
   sus secciones), meses en columnas con persona jurídica / persona natural, y total. Debajo,
   el bloque de pagos del 490 por mes: sanciones (34), intereses de mora (35), pago por
   concepto 61, 62 y 63 (36) y total pagado. Cada mes muestra qué formulario se usó (y si es
   corrección) con enlace al PDF.
2. **Vista 2 — Meses (colapsado)**: la suma de todos los meses por renglón.
3. Ambas se exportan a Excel.

### Fase 4 — Cruce contable

1. **Balance**: el del corte, con detalle por tercero. Si no lo tiene, la pantalla explica
   qué falta.
2. **Lado contable por cuenta Russell**: saldo final al corte de las cuentas del cliente
   homologadas a esa cuenta, presentado en positivo (son pasivos de naturaleza crédito).
   Al desplegar: las cuentas del cliente que la forman y, dentro de cada una, los
   terceros que sustentan el saldo (NIT, nombre, saldo). No se concilia tercero por
   tercero, pero los terceros deben verse.
3. **Tercero DIAN**: en las cuentas marcadas para restarlo, el saldo del 800197384 se
   muestra **tachado** y se resta del total (suele venir con signo contrario: son los
   pagos). Propuesta a confirmar con Russell: si el cliente lleva los pagos en cuentas
   aparte (homologadas a 236599 «Pago de retención en la fuente» o 236799 «Pago
   ReteIVA», de naturaleza débito en el plan), esas cuentas no entran al cruce.
4. **Aviso de saldo inicial**: cuando un tercero (distinto de la DIAN) trae saldo inicial
   distinto de cero, se avisa que el saldo final puede arrastrar retenciones de períodos
   anteriores. No cambia la cifra.
5. **Agrupación**: los conceptos que comparten cuenta Russell (236505 = 93 + 94; 236570
   = regalías + tarjetas + construcción + hidrocarburos + otros pagos; 236550 = los dos de
   exterior; 236575 = todas las autorretenciones; 236705 = 131 + 132 − 133) van en una fila
   agrupada, como en los módulos, con el detalle de qué se suma al desplegar.
6. **Formato del resultado** (pestaña «Resultado - Cruce Contable», completándola):
   Concepto | Declaraciones de retención (Σ de los meses hasta el corte) | Contabilidad |
   Diferencia, con subtotales 130 (renta), 134 (IVA), 135 (timbre) y 136 (total). El 129
   no tiene cuenta: aparece como renglón que resta en el lado declarado del 130 (en la
   contabilidad la reversión ya está en la cuenta de cada concepto); si la operación le
   asigna cuenta en «Mapeos DIAN», cruza contra ella.
7. **Diferencias y marcas**: umbral nuevo **«Diferencias de impuestos»** en Parámetros de
   alertas, en su propia sección e independiente del de los módulos. Por debajo es
   diferencia informativa; desde el umbral exige marca para cerrar (la DIAN redondea cada
   renglón a miles, así que casi todas las filas tendrán unos cientos de pesos de
   diferencia).
8. **Alertas del cruce**: PENDIENTE (aún no se diseñan). Deja el punto de extensión.

### Fase 5 — Oportunidad, pagos efectuados y cierre

1. **Indicador de oportunidad** (pestaña «Resultad -Indicador oportunidad»), por mes:
   No. autoadhesivo del 350 (996) | No. autoadhesivo del pago (996 del 490) | fecha de
   vencimiento | fecha de presentación | fecha de pago | estado de presentación | estado
   de pago.
   - Vencimiento: calendario del año, período y **último dígito del NIT sin el DV** (en un
     NIT de 9 dígitos, el 9.º). Nunca el DV. Ejemplo del levantamiento: NIT 902058973,
     enero 2026 → 12 de febrero.
   - Presentación: 997 del **primer** 350 del período (el original, no la corrección).
   - Pago: 997 del 490 concepto 61.
   - Estado: «Oportuno» si la fecha es igual o anterior al vencimiento; «Extemporáneo» si
     es posterior; un mes sin formulario, sin calendario o sin original lo dice así
     (nunca «Oportuno» por falta de fecha). Se comparan fechas del calendario de
     Colombia, sin la hora.
2. **Pagos efectuados** (pestaña «Resultado- Pagos efectuados»), por mes, con el 350
   vigente:
   136 | 137 | 138 | Σ renglón 36 de los 490 (61 + 62 + 63) | Σ 34 | total pagado (Σ36 + Σ34) |
   diferencia | estado.
   - Diferencia = 138 − total pagado = (136 − Σ36) + (137 − Σ34). Los intereses de mora (35) van en su propia sección, no suman al total pagado y
     no generan diferencia.
   - Desglose por concepto para ver qué falta: 130 vs 61, 134 vs 62, 135 vs 63.
   - Comparación al peso. «Pago completo» o «Diferencia en el pago»; la diferencia exige
     marca para cerrar.
3. **Cierre en firme** como en los módulos: exige cada período del corte resuelto
   (formulario cargado o causal), correcciones confirmadas y marca en toda diferencia que
   la pida. Período de solo lectura y copia congelada; desbloquear exige justificación.
4. Exportación a Excel de los resultados y versión `minor` en borrador
   (`npm run version:release -- --bump minor --title "..." --db`) al terminar; no se
   publica.

## 6. Errores del Programa de Impuestos que no se deben repetir

- El vencimiento se busca con el valor 1 de la celda B4 (el **DV** de 901240097) en vez
  del último dígito del NIT (7), aunque la hoja «Datos» sí lo calcula bien
  (`MID(C12,9,1)` = 7): todos los meses salen «Extemporáneo». Con el dígito 7, enero vence
  el 18 de febrero y se presentó el 17: era oportuno.
- Los meses sin presentar salen «Oportuno» porque la fecha vacía vale 0.
- El 134 **suma** el 133 en vez de restarlo (en «Declaraciones Rte Fte» y en el cruce).
- El 136 = 130 + 134 deja por fuera el **135** (timbre), que además está escrito en 0.
- Los «pagos» se copian del propio 350, no del 490, así que siempre da «Pago completo»;
  el estado de todos los meses mira la fila de enero (`$B$48=$C$48`) y la diferencia está
  escrita a mano.
- Las fechas de pago y de presentación se digitan a mano (y son la misma).
- En el cruce, el total de renta suma solo hasta «Otros conceptos»: deja por fuera los
  pagos al exterior y el 129; los rangos de exterior van cortados (enero a septiembre y
  a octubre); faltan hidrocarburos (53/107) y exportación de hidrocarburos (75/127), y la
  diferencia del 129 tiene el signo al revés.
- El lado contable es la suma de los movimientos de un auxiliar por tercero, con el signo
  invertido a mano, no el saldo final del balance por terceros.

En el Excel del levantamiento también hay deslices de fórmula: en la Vista 1 el 130 resta
el 129 de la columna de persona jurídica (el 129 es un solo valor) y en noviembre y
diciembre no lo resta; los pagos de la Vista 1 apuntan a renglones del 350; en «Pagos
efectuados» el total pagado suma C+D+E (sanciones del 350, el 138 y lo pagado) en vez de
E+F+G (las columnas del 490); al cruce le faltan 53/107 y 75/127.

## 7. Casos de prueba con los PDF de MELONN (corte agosto 2026)

Último dígito del NIT 901427659: **9**. Las pruebas unitarias usan texto extraído y
anonimizado (NIT y razón social ficticios); los PDF no se versionan.

| Per. | 350 vigente | 130 | 134 | 136 | Presentó (997) | Pagó 61 (997) | Vence |
|---|---|---|---|---|---|---|---|
| 1 | 3510673781751 (corrección) | 113.762.000 | 2.156.000 | 115.918.000 | original no cargado | 20-feb | 20-feb |
| 2 | 3510673398173 | 127.141.000 | 2.556.000 | 129.697.000 | 19-mar | 20-mar | 20-mar |
| 3 | 3510676289861 | 129.528.000 | 1.873.000 | 131.401.000 | 22-abr | 23-abr | 24-abr |
| 4 | 3510681197247 | 135.987.000 | 2.040.000 | 138.027.000 | 21-may | 25-may | 25-may |
| 5 | 3510684896886 | 129.065.000 | 2.174.000 | 131.239.000 | 20-jun | 22-jun | 23-jun |
| 6 | 3510688576900 | 141.712.000 | 2.659.000 | 144.371.000 | 21-jul | 22-jul | 23-jul |
| 7 | 3510692214725 | 144.922.000 | 1.814.000 | 146.736.000 | 18-ago | 19-ago | 25-ago |
| 8 | 3510696773029 | 152.256.000 | 2.545.000 | 154.801.000 | 17-sep | 18-sep | 21-sep |

Lo que debe pasar:

- **Período 1**: la corrección (25 = 1, 26 = 3510669606483, presentada el 7-abr) llega sin
  su original → aviso y presentación pendiente; el 490 de enero (concepto 61, renglón 29 =
  3510669606483, el original) paga 122.704.000 → «Diferencia en el pago» de **−6.786.000**
  (136 − Σ36 = 115.918.000 − 122.704.000), con desglose 130 vs 61 = −8.942.000 y 134 vs 62
  = +2.156.000 (no hay 490 del 62). Es el caso de una corrección que **baja** lo declarado
  después de pagado: la diferencia negativa es real y pide marca.
- **Períodos 2 a 7**: solo hay pago 61; falta el 62 (reteIVA) → la lista lo marca como
  faltante y «Pagos efectuados» da «Diferencia en el pago» por el 134 de cada mes
  (p. ej. febrero 2.556.000).
- **Período 8**: 61 = 152.256.000 y 62 = 2.545.000 → «Pago completo».
- Presentación y pago oportunos en los períodos 2 a 8 (abril se pagó el mismo día del
  vencimiento: oportuno).
- Vista 2 acumulada: 130 = 1.074.373.000; 134 = 17.817.000; 136 = 1.092.190.000;
  135 = 137 = 0.
- Febrero cuadra el 130 con sus renglones: 93 = 63.256.000; 42 = 717.000; 95 = 622.000;
  43 = 28.000; 44 = 8.317.000; 97 = 65.000; 46 = 5.927.000; 49 = 2.033.000;
  57 = 1.134.000; 68 = 45.042.000. 134 = 158.000 + 2.398.000 − 0.
- Con corte a septiembre la lista pide el 350 de septiembre (o su causal).
- Regresión del Programa: INDAER (NIT 901240097, dígito 7), enero presentado el 17-feb →
  «Oportuno» (vence el 18-feb).

## 8. Pendientes y decisiones abiertas

- Alertas de la carga de formularios y alertas del cruce: pendientes de diseño.
- Cuenta del renglón 129: pendiente con Russell (por ahora sin cuenta, ver Fase 4).
- Cuentas Russell por crear: 236545, 236560 y 236565.
- Casos sin regla del levantamiento (propón y confirma con el usuario): un mes con varios
  490 del concepto 61 (cuotas) para la fecha de pago; un mes sin concepto 61 (solo
  reteIVA o timbre); qué períodos se esperan con una periodicidad distinta de la mensual.

## 9. Terminado, en cada fase

- Pruebas puras con Vitest junto al código (lectura sobre los fixtures, totales, cadena de
  correcciones, último dígito del NIT, oportunidad, pagos, agrupación del cruce y
  exclusión de la DIAN), `tsc`, `test` y `lint` en verde.
- Fichas de ayuda y reglas actualizadas en el mismo cambio, informadas en el resumen.
- Auditoría (`logAudit`) en cada acción que escribe; Server Actions con el orden del
  proyecto (autorizar con `clientId` → Zod → try/catch → auditoría → revalidar).
- Resumen al usuario: qué se hizo, qué falta, qué no se verificó, y si hay migración o
  `db:sync:rbac` por aplicar.
