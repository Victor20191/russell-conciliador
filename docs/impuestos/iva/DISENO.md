# Diseño · Impuestos › IVA (formularios 300 y 490)

Estado: **aprobado el 7/Nov/2026**. Se construye por fases con visto bueno entre cada una (avance en `IMPLEMENTACION.md`). Especificación del levantamiento en `PROMPT-iva.md`.


## Contexto

Russell revisa con cada cliente, de forma acumulada a un corte (precorte en agosto o cierre en diciembre), que las declaraciones de IVA (F300) se presentaron bien y a tiempo y se pagaron (F490), y cruza cada renglón con saldo contra el saldo contable de su cuenta Russell. «Retención en la fuente» ya hace exactamente esto con el F350 (`docs/impuestos/retencion-fuente/`; ~9.500 líneas en `src/lib/impuestos`, `src/app/actions/impuestos-retencion.ts`, `src/app/(app)/impuestos/retencion`, `src/app/(app)/config/{mapeos-dian,calendario-tributario}`). El usuario pide el submódulo IVA en el menú «Impuestos · DIAN» con la misma experiencia, Mapeos DIAN con dos pestañas (Retención / IVA) y que una sola importación del calendario tributario cargue Retención e IVA.

Fuentes (se copian a `docs/impuestos/iva/`): `Downloads\IVA - F300 y F490.xlsx` (Formulario 300, Formulario 490, F300-Mapeo Russell, Vista 1, Vista 2, Resultado Cruce contable, Indicador de oportunidad, Pagos efectuados), `Informacion IVA.docx`, `Formulario_300_2025.pdf`, `Calendario_Tributario_2026.pdf` (ya está en la carpeta de Retención).

## Decisiones del usuario (7/Nov/2026)

1. **Periodicidad y corte**: la periodicidad sale de la ficha del cliente (`formularios_dian_cliente.periodicidad`; se agrega «Anual» a `PERIODICIDADES_POR_FORMULARIO.IVA`). Si el cliente no la tiene, «Nueva revisión» la pide y la guarda en la ficha. El corte solo puede cerrar período: bimestral 2/4/6/8/10/12, cuatrimestral 4/8/12, anual 12. Atajos «Precorte · agosto» y «Cierre · diciembre».
2. **Lado contable por naturaleza del plan Russell** (`cuentas_estandar.naturaleza` D|C): crédito → −saldo final, débito → +saldo (IVA descontable 2408 40–50, 135517, 417505). El usuario corrige 240834/240835 a Crédito y crea 240837, 240847, 240848 y 240849 desde Plan Estándar Russell (el mapeo las acepta aunque no existan, como hizo Retención).
3. **Por fases con visto bueno** entre cada una, revisadas en su localhost:3000 (la app local escribe en la BD de producción: ninguna migración, revisión, importación, marca o release sin su permiso).

Resueltos con el criterio de Retención: formularios 300/490 en la misma tabla `formulario_dian_cargado` discriminados por `impuesto`; un 490 con concepto 05/57/58 solo entra por IVA, uno con 61/62/63 solo por Retención, un 350 se rechaza en IVA y un 300 en Retención; DIAN tachada por tercero y saldo inicial restado con balance desde enero igual que Retención, solo en 2408 y 135517; ingresos por cuenta (`balance_prueba_detalle`), sin terceros; renglón 40 con once cuentas en una fila; alertas de carga y de cruce PENDIENTES de diseño (como en Retención); «Acumulado» oculto con periodicidad Anual; umbral `impuestos_diferencia` ($501) compartido.

## Especificación de IVA (resumen operativo)

- **F300 (se guarda)**: 1, 3, 4, 5, 6, 11, 24 (periodicidad marcada), 25, 26; ingresos 27–43 (41 = Σ27..40; 43 = 41 − 42); generado 58–67 (67 = Σ58..66); descontable 68–81 (77 = Σ68..76; 81 = 77 + 78 + 79 − 80); liquidación 82 = max(0, 67−81), 83 = max(0, 81−67), 84, 85 valores, 86 = max(0, 82−84−85), 87 valor, 88 = max(0, 82−84−85+87), 89 = max(0, 83+84+85−87); control de saldos 90, 91, 92 (90+91+92 = 89 avisa, no bloquea), 93 = 89 − 90; 980 informativo; 996, 997 (presentación). NO se guardan compras 44–57 (`base`), nombres, seccional, 100, firmas (101, 102, 981–983, 994). Período (3): 1–6 / 1–3 / 1. Número empieza por «30».
- **F490 de IVA**: casilla 2 = 05 (bimestral) / 57 (cuatrimestral) / 58 (anual), acorde con la periodicidad; 29 = número del 300; 36 paga el 86, 34 el 87, 35 intereses aparte; 980 = 34+35+36. Pago esperado si el 88 recalculado > 0. Pagos efectuados: diferencia = (Σ36 − 86) + (Σ34 − 87), al peso, exige marca (136→86, 137→87, 138→88).
- **Correcciones**: igual que el 350 (25 = 1, 26; vigente = último; oportunidad con el original; «Falta el original» bloquea el cierre).
- **Vistas**: «Por períodos» (columnas «Bimestre 01 · Enero–Febrero», «Cuatrimestre 02 · Mayo–Agosto», «Año 2026»; sin P. jurídica/P. natural) y «Acumulado» (oculto en Anual). Filas 27–43, 58–67, 68–81, 82–89, 90–93, 980 y bloque 490 (34, 35, 36, total). Totales recalculados por período; acumulado = Σ de períodos.
- **Mapeo F300 → Russell** (global): 27→410510, 28→410505, 29→410520, 30/31/32/33/35→410525, 34/36/37→410505, 38→410510, 39→410530, 40→420505+421005+421020+421095+421505+422005+423005+423505+424515+425005+429595, 42→417505 (resta en el subtotal), 58→240807, 59→240830, 60→240808, 61→240834, 62→240835, 63→240836, 64→240837, 65→240809, 66→240815, 68→240845, 69→240844, 70→240847, 71→240841, 72→240840, 73→240848, 74→240843, 75→240842, 76→240849, 78→240846, 79→240820, 80→240850 (resta en el subtotal), 84 y 87 sin cuenta y fuera del cruce, 85→135517.
- **Cruce** (orden fijo, sin total general): IMPUESTO GENERADO (58–66, total 67) · IMPUESTO DESCONTABLE (68–80, total 81; 80 resta) · RETENCIÓN DE IVA (85) · INGRESOS (27–40, total 41; 42 resta; total 43). Varios renglones a una cuenta → una fila con detalle; una fila con varias cuentas (el 40) reúne las cuentas del cliente de todas. Marca desde el umbral.
- **Oportunidad**: vencimiento = `IVA_BIMESTRAL`/`IVA_CUATRIMESTRAL` del año (período × último dígito sin DV) o `IVA_ANUAL` del año SIGUIENTE (el calendario 2026 trae en febrero el vencimiento del año gravable 2025, por pares 1-2, 3-4, 5-6, 7-8, 9-0); presentación = 997 del 300 original; pago = 997 del último 490 (una columna).
- **Calendario 2026 (del PDF, fixture)**: bimestral → marzo 10 11 12 13 16 17 18 19 20 24 · mayo 12 13 14 15 19 20 21 22 25 26 · julio 9 10 14 15 16 17 21 22 23 24 · septiembre 9 10 11 14 15 16 17 18 21 22 · noviembre 11 12 13 17 18 19 20 23 24 25 · enero 2027 13 14 15 18 19 20 21 22 25 26; cuatrimestral → mayo 12…26 (igual al 2.º bimestre) · septiembre 9…22 (igual al 4.º) · enero 2027 13…26; anual (RST «Consolidada de IVA», año gravable 2025) → febrero 2026: 1-2→16, 3-4→17, 5-6→18, 7-8→19, 9-0→20. (Ejemplo del usuario: NIT …3 bimestral, 1.er bimestre vence el 12 de marzo ✓.)

## Arquitectura: un descriptor por impuesto, un solo motor

Se PARAMETRIZA el código de Retención in situ, no se duplica. `src/lib/impuestos/retencion/` queda como motor común (se documenta en el encabezado de cada archivo; mover a `comun/` sería una fase 6 mecánica, opcional). Cada función pura gana un parámetro `impuesto` **con valor por defecto `RETENCION`**, así ninguna prueba de Retención cambia y su comportamiento es idéntico.

**`src/lib/impuestos/impuestos-dian.ts`** (nuevo, puro, importable desde cliente): `ImpuestoDian` y constantes `RETENCION`, `IVA`, `IMPUESTOS`, `impuestoPorClave("RET"|"IVA")`, `impuestoPorSlug("retencion"|"iva")`. Campos: `clave` (código de módulo en marcas, cierre, elección de balance y columna `impuesto`), `slug` (ruta, miga, clave del PDF en el almacén, tipo de la copia congelada), `nombre`, `nombreCorto` (bitácora: «CREÓ REVISIÓN DE IVA»), `claveFormularioCliente` (RETEFUENTE | IVA), `declaracion` (F350 | F300; el prefijo del número sale del código 35/30), `conceptosPago` ({concepto, nombre, renglonPagado, periodicidad?}: 61→130, 62→134, 63→135 · 05/57/58→86 con su periodicidad), `renglones` {impuesto, sanciones, total} (136/137/138 · 86/87/88), `columnasPersona`, `periodicidades`, `cortesAtajo` (9/12 · 8 «Precorte · agosto»/12 «Cierre · diciembre»), `calendario(periodicidad, anio)` → {formulario, anio} (IVA Anual → `IVA_ANUAL`, anio+1), `oportunidad.columnasPago` (RET: 61 y 62; IVA: una columna con 05/57/58), `cruce` {grupos (grupo, etiqueta, secciones del mapeo, porTercero, renglón total, líneas declaradas extra como el 41), prefijosTercero (["2365","2367"] · ["2408","135517"]), conTotalGeneral, signoPorNaturaleza}, `vistas` {filasUnicas, ocultarAcumulado(periodicidad), etiquetaPeriodo}, `textos`.

Regla para componentes cliente: viaja `impuestoClave` (serializable) y cada componente resuelve `impuestoPorClave` localmente (el descriptor tiene funciones).

Claves internas de datos ya guardados NO cambian (`falta_350`, `pago61/pago62`, `fueraDeRetencion`, `tipo: "retencion"` en copias congeladas): se agregan campos nuevos y se mantienen los viejos como alias.

## Modelo de datos (una migración aditiva en SQL a mano: `prisma/migrations/20261108120000_impuestos_iva`)

- `revision_retencion` → `revision_impuesto` (RENAME de tabla, pkey, secuencia e índice; modelo Prisma `RevisionImpuesto`), columna `impuesto TEXT NOT NULL DEFAULT 'RET'`, única `(cliente_id, impuesto, anio, mes_corte)` (se suelta la actual: único `DROP CONSTRAINT`, documentado; el test de semillas solo revisa la migración 20261031120000). Las 3 revisiones existentes quedan RET; el código de Retención aún no está desplegado, así que renombrar no cuesta.
- `formulario_dian_cargado.impuesto TEXT NOT NULL DEFAULT 'RET'` + índice `(cliente_id, impuesto, anio, estado)`.
- `periodo_sin_formulario`: sin columna; `formulario` ('350'|'300') ya discrimina (el código usa `impuesto.declaracion.codigo` en vez del literal).
- Siembra de `MAPEO_F300_FABRICA` en `mapeo_renglon_dian` (`formulario='300'`, un concepto por renglón, `renglon_pj` = renglón, `renglon_pn` NULL, signo '−' en 42 y 80, `en_cruce=false` y cuenta NULL en 84 y 87, el 40 con las once cuentas en formato `claveGrupoCruce` «420505+421005+…»; `ON CONFLICT DO NOTHING`). Sin cambio de esquema: `normalizarCuentaMapeo` acepta `\d{6}(\+\d{6})*` (también coma o espacio) y normaliza con `claveGrupoCruce`; `cuentasDeMapeo(fila)` = `cuentasDeClaveCruce`.
- `vencimiento_dian.formulario`: claves nuevas `IVA_BIMESTRAL`, `IVA_CUATRIMESTRAL`, `IVA_ANUAL`.
- `cuenta_russell_dian` y `tercero_dian` se comparten sin cambios.
- `impuestos-semillas.test.ts`: regex parametrizada por formulario y `cuenta_russell` con «+»; segundo caso que lee la migración nueva contra `MAPEO_F300_FABRICA`; la comprobación «aditiva» de la nueva permite exactamente ese `DROP CONSTRAINT`.

## Fases (cada una: `tsc`, `test`, `lint` en verde, resumen, visto bueno)

### Fase 1 · Configuración
- `formularios/definicion.ts` → `"300"`, `RenglonDian.pisoCero` (`controlarTotales`/`calcularTotal` aplican max(0, Σ)), `validaciones` no bloqueantes (90+91+92 = 89).
- `formularios/f300.ts` (nuevo), `formularios/f490.ts` → `CONCEPTOS_PAGO_IVA`, `etiquetaConceptoPago(concepto, impuesto = RETENCION)`.
- `impuestos-dian.ts` (nuevo) + `impuestos-dian.test.ts` (consistencia: cada concepto de pago apunta a un total de la definición; los grupos cubren las secciones del mapeo de fábrica).
- `periodicidad.ts` → `Anual` en IVA, `mesesCorteValidos`, `etiquetaPeriodo`.
- `calendario.ts` → cuatro formularios (`anioDelPeriodo` −1 y `digitosPorPares` en IVA_ANUAL, `instruccionPdf` por sección); `calendario-lectura-servidor.ts` → `leerCalendarioCompletoConIA(pdf, anio)` = cuatro llamadas en paralelo (una por sección, 4 consumos), expansión de pares a 10 dígitos; prompt de fábrica `calendario_dian` generalizado (la huella invalida la caché; si en `prompts_ia` hay una fila editada manda ella: avisar).
- `mapeo-dian.ts` → grupos de cuentas; `iva/mapeo-f300.ts` (nuevo) → `MAPEO_F300_FABRICA`.
- `configuracion-servidor.ts` → `cargarMapeoDian(formulario)` expande grupos para nombres del plan; `cargarCalendariosDian(anio)`.
- `impuestos-configuracion.ts` → `guardarCuentaMapeoDian` con `formulario` y grupos (valida cada cuenta en el plan), `cambiarRestaTerceroDian` expandiendo grupos, `leerCalendarioPdf` devuelve las cuatro propuestas, `guardarCalendarioDian` por formulario (`CalendarioDianSchema.formulario = enum de FORMULARIOS_CALENDARIO`).
- `definitions.ts` → `CuentaMapeoDianSchema` (formulario + grupos), `RevisionImpuestoSchema` (impuesto, periodicidad?), `CLAVE_MARCA_IMPUESTO` admite `\d{6}(\+\d{6})*`.
- `config/mapeos-dian/{page,mapeos-dian-client}.tsx` → pestañas «Retención en la fuente · 350» / «IVA · 300» (`?formulario=`), tabla IVA con una columna «Renglón» y «Cuentas Russell» (varias, ayuda «sepáralas con +»); «Tercero DIAN por cuenta» solo con cuentas de grupos por tercero del formulario activo; «NIT de la DIAN» compartida. Componente `Pestañas` nuevo en `src/components/` extraído del `TabBtn` duplicado (`revision-client.tsx`, `mapeo-client.tsx`).
- `config/calendario-tributario/{page,calendario-tributario-client}.tsx` → chips Retención / IVA bimestral / IVA cuatrimestral / IVA anual con estado (sin cargar / cargado / propuesta), `?formulario=`; «Importar desde el PDF» produce las cuatro propuestas con su `validarCalendario`; guardar por chip; etiqueta «Año gravable N−1» en el anual.
- Migración y `schema.prisma`; `__fixtures__/calendario-iva-2026.ts`; pruebas de `formularios.test.ts`, `impuestos.test.ts` (todo `valor` del F300 con concepto; 84/87 fuera), calendario (validación anual, grillas 6/3/1), semillas.
- Fichas de ayuda de Mapeos DIAN y Calendario actualizadas (`src/lib/ayuda/fichas/impuestos.ts`). Docs `docs/impuestos/iva/{PROMPT-iva.md, DISENO.md}` + copias de los adjuntos.
- Verificación: el usuario aplica `npm run db:deploy`; Mapeos DIAN (33 conceptos del 350 intactos; 300 con el 40 de once cuentas; cuentas sin plan marcadas); importar el PDF 2026 (consume IA, con permiso) y comparar con el fixture; ficha del cliente con «Anual»; `/impuestos/retencion` igual que antes.

### Fase 2 · Cargue de formularios (revisiones de IVA)
- `retencion/tipos.ts` → `claveObjetoFormulario(impuesto, …)` (`impuestos/<slug>/…`; RET conserva su ruta).
- `retencion/lectura.ts` → `LecturaCruda.periodicidad` (tolera ausencia en lecturas guardadas), `normalizarLectura` reconoce «300» (prueba contra falsos positivos con `includes`); `ContextoLectura` += `impuesto` (default RETENCION) y `periodicidad`; controles: formulario del impuesto (un 350 en IVA bloquea con «cárgalo en Retención en la fuente» y `importar` lo rechaza sin guardar), prefijo 30/35, período ≤ 12/meses del período, periodicidad leída = la de la revisión (bloquea), 490: concepto del impuesto y acorde con la periodicidad (05↔Bimestral…), `numeroPagado` con prefijo del impuesto, totales con piso cero, aviso 90+91+92.
- `retencion/lectura-servidor.ts` → zod `periodicidad`; prompt de fábrica `formulario_dian` ampliado (300, casilla 24 como texto, renglones 27–93 y 980), nombre y descripción del catálogo.
- `retencion/periodos-revision.ts` → `impuesto` (conceptos, `renglonPagado`, esperado por `renglones.total` recalculado > 0), `etiquetaEstadoPeriodo(estado, impuesto)` (claves internas intactas), `etiquetaPeriodoRevision` delega en `periodicidad.etiquetaPeriodo`.
- `retencion/revision-servidor.ts` → `prisma.revisionImpuesto`; `cargarRevision` filtra formularios por `impuesto` y causales por `formulario`; `RevisionVista.impuesto`; `cargarRevisiones(ids, impuesto)`; `clientesParaRevision` con la periodicidad de IVA de la ficha.
- `src/app/actions/impuestos-retencion.ts` → renombrado `impuestos-revisiones.ts` con nombres genéricos (`crearRevisionImpuesto`, `eliminarRevisionImpuesto`, `guardarMarcaImpuesto`, `quitarMarcaImpuesto`, `escogerBalanceImpuesto`, `cerrarRevisionImpuesto`, `desbloquearRevisionImpuesto`; las de formularios y causales conservan su nombre). El impuesto sale de la fila de la revisión (`revisionConAlcance`); solo `crearRevisionImpuesto` lo lee del FormData: RET → «Mensual»; IVA → periodicidad de `ClientDianForm` (IVA) o la del formulario (valida y hace upsert en la ficha, con bitácora), corte en `mesesCorteValidos`. Todo `where` sobre `formularioDianCargado` lleva `impuesto` (también `firmaParaCierre`, conteos de `descartar`, `confirmarFormulariosDian`); causales con `formulario`; candados `marca-impuesto:{clave}:…` y `conciliacion-cierre:{cliente}:{clave}:{periodo}`; bitácora con `nombreCorto` (RET idéntica a hoy). Solo funciones async exportadas.
- Pantallas: `git mv src/app/(app)/impuestos/retencion → src/app/(app)/impuestos/[impuesto]` (segmento dinámico; `impuestoPorSlug` o `notFound()`): `page.tsx` y `revisiones-client.tsx` (textos, atajos y meses válidos del descriptor, selector de periodicidad solo si la ficha no la tiene, Anual fuerza diciembre), `[id]/page.tsx`, `revision-client.tsx` (pestañas filtradas, «Por períodos», textos 300/490, `etiquetaEstadoPeriodo`), `formulario-modal.tsx` (definición por formulario, conceptos del descriptor, casilla 24 de solo lectura), `controles-modal.tsx` (contenido GENERADO desde la definición y el descriptor para no desfasarse de `controlesLectura`), `tabs.ts` → `TABS_REVISION_IMPUESTO`. `impuestos/page.tsx` sigue redirigiendo a Retención.
- `nav.ts` (hijo «IVA» → `/impuestos/iva`), `topbar.tsx` (`iva: "IVA"`), `modulos-plataforma.ts` (descripción), `ayuda/resolver.ts` (`impuestos/<slug>` por descriptor; `FichaId` += `impuestos.iva`, `impuestos.iva_revision`), fichas IVA (listado y revisión, pestañas de Formularios por ahora) en `fichas/impuestos.ts` + `fichas/index.ts`; `fichas.test.ts` (import de `tabs.ts`, `fuente.archivo/funcion` nuevos).
- Pruebas: `__fixtures__/iva-2026.ts` (4 bimestres con un 300 corregido, 490 concepto 05 con sanción, un bimestre con 88 = 0), `iva/iva.test.ts` (períodos, esperado por 88, lectura y rechazos cruzados, periodicidad del 24).
- Verificación: `/impuestos/iva`, «Nueva revisión» (pide periodicidad si falta), importar 300 y 490 reales si el usuario los entrega (con permiso), rechazo de un 350; en Retención, rechazo de un 490 de IVA.

### Fase 3 · Vistas y Excel
- `retencion/vistas.ts` → `vistasRevision(periodos, impuesto = RETENCION, periodicidad = "Mensual")`: filas concepto solo con `columnasPersona`; IVA desde `filasUnicas`; bloque 490 con los conceptos del descriptor.
- `[impuesto]/[id]/vistas-revision.tsx` → modo sin personas (`colSpan` 1, sin subencabezado, encabezados `meses[].etiqueta`); «Acumulado» no se ofrece en Anual.
- `src/lib/export/retencion.ts` → `excelRevisionImpuesto(impuesto, …)` (`excelRetencion` queda como wrapper para su test): hoja «Por períodos» de una columna por período, sin «Acumulado» en Anual, subtotales por grupo, total general solo si `conTotalGeneral`, oportunidad por `columnasPago`, pagos por `renglones`. Ruta `/api/impuestos/revisiones/[id]/excel` lee el impuesto de la revisión; archivo `IVA <cliente> <año>-<mes>.xlsx`.
- Pruebas: `export/iva.test.ts`, `iva.test.ts` (vistas).

### Fase 4 · Cruce contable
- `retencion/cruce.ts` → `EntradaCruce` += `impuesto`, `naturalezas` (Map cuenta → D|C), `filasContablesCuenta` (balance por cuenta para grupos `porTercero:false`); grupos por `impuesto.cruce.grupos` (sección del mapeo → grupo); signo contable `signoPorNaturaleza ? (C → −1, D → +1) : −1`; **signo del mapeo en el subtotal** para IVA (42 y 80: la fila compara en positivo; Retención conserva su regla del 129); filas por `claveGrupoCruce(cuentasDeMapeo)` (una fila con varias cuentas reúne sus cuentas del cliente; conceptos con la misma clave se unen); `total` se calcula igual y la pantalla lo oculta si `!conTotalGeneral`; `fueraDeRetencion` se mantiene como nombre (alias `fueraDelImpuesto`) con los prefijos por tercero del descriptor.
- `retencion/cruce-servidor.ts` → `moduloCodigo = impuesto.clave`, `cargarMapeoDian(impuesto.declaracion.codigo)`, prefijos por tercero del descriptor en `balanceTerceroDetalle`, consulta a `balancePruebaDetalle` del balance elegido para las cuentas de los grupos por cuenta, naturalezas con `getCuentasEstandar()`.
- `[impuesto]/[id]/{cruce-revision,marca-modal}.tsx` → textos del descriptor («Declarado · Formulario 300», subtotal por grupo, sin total general, filas por cuenta sin despliegue de terceros, prefijos en los avisos), acciones genéricas, ancla `marca-<slug>-N`.
- `umbrales-alertas.ts` → `dondeAplica` «Cruce contable de Retención en la fuente e IVA».
- Pruebas: `iva.test.ts` (cruce: naturaleza, fila «+» de once cuentas, ingresos por cuenta sin DIAN ni saldo inicial, 42 y 80 restando, agrupación, umbral).
- Verificación con un cliente real con balance por terceros cerrado del corte (el usuario elige); Retención: revisión de Melonn igual que antes.

### Fase 5 · Oportunidad, pagos, novedades, cierre, ayuda y release
- `retencion/oportunidad.ts` → `FilaOportunidad.pagos[]` por `columnasPago` (RET sigue rellenando `pago61/pago62`), calendario por `impuesto.calendario(periodicidad, anio)` (Anual lee N+1; sin él, «Sin calendario»).
- `retencion/pagos.ts` → `impuesto.declaracion` y `renglones` (86/87/88), desglose por `conceptosPago`.
- `retencion/{cierre,copia-cierre,resultados-servidor}.ts` → textos por código, `tipo: slug` en la copia (`leerCopia(valor, impuesto)`), código de módulo y calendario del descriptor.
- `impuestos-revisiones.ts` → `cerrarRevisionImpuesto` / `desbloquearRevisionImpuesto`: `cuentasRussell` = prefijos por tercero + prefijos de las cuentas de ingreso del mapeo, `cuentasRussell6` = cuentas individuales de todas las filas (grupos expandidos), copia por impuesto, candados y `conciliacion_modulo_cierre`/`cuenta_bloqueada_conciliacion`/`eleccion_balance_cruce` con `impuesto.clave`.
- `src/lib/conciliacion/referencia-cierre.ts` (+ test) → por descriptor: «IVA · revisión #N» → `/impuestos/iva/N`; `balance/[id]/conciliacion-en-firme.tsx` texto neutro.
- `[impuesto]/[id]/resultados-revision.tsx` → columnas de pago generadas (celda lee `pagos[]` y, en copias viejas, `pago61/62`), encabezados de Pagos por `renglones`, Novedades con `TabRevisionImpuesto`.
- Ayuda: fichas IVA completas; `docs/impuestos/iva/IMPLEMENTACION.md`, nota en `docs/impuestos/retencion-fuente/IMPLEMENTACION.md` (renombre de tabla y acciones), una viñeta en `CLAUDE.md`.
- Release: `npm run version:release -- --bump minor --title "Impuestos · IVA" --db` y notas en borrador, solo cuando el usuario lo pida.
- Pruebas: `iva.test.ts` (oportunidad anual con pares, pagos 86/87/88, cierre), `copia-cierre.test.ts` (tipo iva), `referencia-cierre.test.ts`.
- Verificación: oportunidad, pagos, novedades, cerrar y desbloquear (con permiso); `/balance/[id]` muestra «IVA · revisión #N»; ayuda en cada pantalla.

## Verificación transversal
`npx tsc --noEmit`, `npm run test`, `npm run lint` por fase (fallas conocidas en este Windows: chevron, pdf, deducir-lectura). En cada fase se vuelve a mirar Retención en el navegador (lista, revisión de Melonn, cruce) para confirmar que no cambió. `grep` final de `formularioDianCargado.` sin `impuesto` en el `where`.

## Riesgos y cuidados
- Sin el filtro `impuesto`, un 490 de IVA entraría a Retención como «recibo de otro 350» y cambiaría conteos y la firma del cierre.
- Copias congeladas RET v1: no renombrar claves internas; `leerCopia` acepta el tipo del impuesto.
- Pruebas que fijan literales: `fichas.test.ts` (TABS y `fuente.*`), `referencia-cierre.test.ts`, `compuerta-cruce.test.ts` (no cambia), `impuestos-semillas.test.ts`, `export/retencion.test.ts`.
- `"use server"`: ningún `export type` en acciones.
- Prompts editados en `prompts_ia` mandan sobre los de fábrica: avisar al usuario si existen.
- IVA Anual con corte agosto no tiene períodos: el modal fuerza diciembre; su oportunidad exige el calendario del año siguiente.
- Cierre de IVA bloquea cuentas 41/42 que también bloquea Ingresos (ING): dos cierres sobre la misma cuenta, como ya permite el diseño; documentar.
- Cuentas Russell faltantes y naturaleza de 240834/240835: las corrige el usuario; el cruce marca «cuenta no está en el plan» como Retención.
