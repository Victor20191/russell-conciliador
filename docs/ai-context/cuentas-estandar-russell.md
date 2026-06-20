# Cuenta estandar Russell Bedford - contexto para modelos de IA

Generado desde la tabla PostgreSQL `cuentas_estandar` el 2026-06-20T02:23:48.571Z.

Este documento describe la estructura semantica del plan estandar Russell Bedford y enumera todas las cuentas cargadas en base de datos. Su proposito es servir como contexto de recuperacion para modelos de inteligencia artificial que comparen cuentas de clientes contra el plan estandar Russell.

## Fuente de verdad

- Tabla fisica: `cuentas_estandar`.
- Modelo Prisma: `StandardAccount`.
- Consumo actual en la app: `src/app/(app)/balance/page.tsx` consulta `prisma.standardAccount.findMany(...)`.
- Cantidad de cuentas cargadas: `346`.
- Este archivo es documentacion derivada. El runtime de la app debe seguir consumiendo la base de datos.

## Que informacion contiene la tabla

La tabla no almacena saldos, movimientos, clientes ni periodos contables. Almacena el catalogo maestro de homologacion: codigo PUC, nombre, clasificacion Russell, naturaleza contable, descripcion funcional, exclusiones, sinonimos probables, soportes esperados y observaciones de auditoria/homologacion.

## Diccionario de campos

| Campo BD | Campo Prisma | Tipo | Descripcion para IA |
|---|---|---|---|
| `id` | `id` | integer | Identificador tecnico autoincremental. No usar para homologacion semantica. |
| `codigo` | `code` | text | Codigo PUC estandar de 6 digitos. Es la clave de negocio principal. |
| `nombre` | `name` | text | Nombre de la cuenta estandar. |
| `nivel` | `level` | integer | Nivel jerarquico usado por la app. En este maestro las cuentas vienen a 6 digitos y se registran como nivel 4. |
| `naturaleza` | `nature` | text | Naturaleza contable esperada: `D` debito o `C` credito. |
| `padre` | `parent` | text/null | Codigo padre logico derivado del prefijo de 4 digitos. Sirve para agrupar familia PUC. |
| `critica` | `critical` | boolean | Marcador operativo de criticidad. El maestro actual no lo usa como criterio principal. |
| `cuenta_russell` | `russellAccount` | text/null | Agrupador Russell o cuenta 4D destino. Es una senal fuerte para homologacion. |
| `tipo_rubro` | `categoryType` | text/null | Rubro o categoria contable/financiera. Ayuda a clasificar por estado financiero o area de auditoria. |
| `incluye` | `includes` | text/null | Describe exactamente que debe entrar en esta cuenta. Campo principal para razonamiento semantico. |
| `no_incluye` | `excludes` | text/null | Describe partidas que NO deben mapearse a esta cuenta. Campo clave para evitar falsos positivos. |
| `cuentas_posibles` | `possibleAccounts` | text/null | Sinonimos, nombres alternos o etiquetas de cuentas de cliente que podrian corresponder a esta cuenta. |
| `soportes_terceros` | `supportingDocuments` | text/null | Evidencia documental esperada para validar el saldo o la clasificacion. |
| `soportes_control` | `controlSupports` | text/null | Atributos de control o tercero que conviene capturar para auditoria. |
| `observaciones_homologacion` | `mappingNotes` | text/null | Reglas, riesgos, alertas NIIF/NIA y criterios de homologacion. |

## Reglas de uso para modelos de IA

1. Para proponer una homologacion, comparar la cuenta del cliente contra `codigo`, `nombre`, `cuenta_russell`, `tipo_rubro`, `incluye` y `cuentas_posibles`.
2. Usar `no_incluye` como filtro negativo obligatorio antes de aceptar una sugerencia.
3. Usar `naturaleza` para detectar saldos con signo o naturaleza contraria.
4. Usar `soportes_terceros` y `soportes_control` para pedir evidencia o explicar validaciones.
5. Usar `observaciones_homologacion` para justificar riesgos, reclasificaciones y criterios de auditoria.
6. No inferir saldos, materialidad o periodo desde esta tabla: esos datos pertenecen al balance del cliente.

## Resumen por clase PUC

| Clase | Nombre | Cuentas |
|---|---|---:|
| 1 | Activo | 114 |
| 2 | Pasivo | 98 |
| 3 | Patrimonio | 16 |
| 4 | Ingresos | 18 |
| 5 | Gastos | 65 |
| 6 | Costos de ventas | 15 |
| 7 | Costos de produccion | 12 |
| 8 | Cuentas de orden deudoras | 4 |
| 9 | Cuentas de orden acreedoras | 4 |

## Indice rapido

- [Clase 1 - Activo](#clase-1-activo) (114 cuentas)
- [Clase 2 - Pasivo](#clase-2-pasivo) (98 cuentas)
- [Clase 3 - Patrimonio](#clase-3-patrimonio) (16 cuentas)
- [Clase 4 - Ingresos](#clase-4-ingresos) (18 cuentas)
- [Clase 5 - Gastos](#clase-5-gastos) (65 cuentas)
- [Clase 6 - Costos de ventas](#clase-6-costos-de-ventas) (15 cuentas)
- [Clase 7 - Costos de produccion](#clase-7-costos-de-produccion) (12 cuentas)
- [Clase 8 - Cuentas de orden deudoras](#clase-8-cuentas-de-orden-deudoras) (4 cuentas)
- [Clase 9 - Cuentas de orden acreedoras](#clase-9-cuentas-de-orden-acreedoras) (4 cuentas)

## Cuentas estandar Russell

## Clase 1 - Activo

### 110505 - Caja general

| Atributo | Valor |
|---|---|
| Codigo | `110505` |
| Nombre | Caja general |
| Cuenta Russell / 4D | Caja |
| Tipo de rubro | Efectivo y equivalentes |
| Naturaleza | Debito (`D`) |
| Padre logico | `1105` |
| Critica | no |

**Que incluye:** Dinero en efectivo de disponibilidad inmediata en poder de la entidad (billetes, monedas, cheques recibidos no consignados) manejado en la caja principal. Transversal a todos los sectores. Retail: recaudo de cajas de tienda pendiente de consignar. Servicios: efectivo recibido.

**Que no incluye:** Cajas menores (110510). Saldos en bancos (1110). Fondos rotatorios (1125). Inversiones temporales (12xx). Vales o documentos por legalizar (anticipos/deudores).

**Cuentas o nombres de cliente que podrian llegar aqui:** Caja general, caja principal, efectivo en caja, dinero en efectivo, caja recaudo, caja tesorería, efectivo disponible, caja moneda nacional, recaudo en caja.

**Soportes o terceros esperados:** Arqueo de caja, recibos de caja, soporte de consignación, conciliación de efectivo.

**Soportes de control recomendados:** Punto de caja, responsable, moneda.

**Observaciones de homologacion:** Practicar arqueo sorpresivo (NIA 501). El saldo debe ser efectivo real disponible. Vales, préstamos o documentos sin legalizar no son caja: reclasificar a deudores. Saldos altos y recurrentes en caja son indicio de riesgo (NIA 240).

### 110510 - Cajas menores

| Atributo | Valor |
|---|---|
| Codigo | `110510` |
| Nombre | Cajas menores |
| Cuenta Russell / 4D | Caja |
| Tipo de rubro | Efectivo y equivalentes |
| Naturaleza | Debito (`D`) |
| Padre logico | `1105` |
| Critica | no |

**Que incluye:** Fondos fijos de caja menor establecidos para gastos menores de operación, sujetos a reembolso. Transversal: cajas menores por sede, área o proyecto.

**Que no incluye:** Caja general (110505). Bancos (1110). Fondos rotatorios de mayor cuantía (1125). Gastos ya legalizados (van al gasto). Anticipos a empleados (133015).

**Cuentas o nombres de cliente que podrian llegar aqui:** Caja menor, cajas menores, fondo fijo, caja chica, caja menor sede, fondo de caja menor, caja menor por área.

**Soportes o terceros esperados:** Resolución de constitución del fondo, arqueo, recibos de caja menor, legalización de reembolsos.

**Soportes de control recomendados:** Fondo/sede, responsable, monto autorizado.

**Observaciones de homologacion:** El saldo es el monto fijo del fondo (efectivo + soportes por legalizar = monto constituido). Arquear y verificar legalización oportuna. Soportes acumulados sin reembolsar indican gastos no causados (corte).

### 111005 - Bancos moneda nacional

| Atributo | Valor |
|---|---|
| Codigo | `111005` |
| Nombre | Bancos moneda nacional |
| Cuenta Russell / 4D | Bancos |
| Tipo de rubro | Efectivo y equivalentes |
| Naturaleza | Debito (`D`) |
| Padre logico | `1110` |
| Critica | no |

**Que incluye:** Saldos en cuentas corrientes en bancos nacionales en pesos colombianos, de disponibilidad inmediata. Transversal a todos los sectores.

**Que no incluye:** Cuentas de ahorro (1120). Bancos en moneda extranjera (111010). Sobregiros (saldo acreedor, pasivo 210505). Fondos rotatorios (1125). Inversiones (12xx).

**Cuentas o nombres de cliente que podrian llegar aqui:** Bancos moneda nacional, bancos nacionales, cuenta corriente, bancos pesos, banco Bancolombia, banco Davivienda, banco BBVA, cuentas bancarias nacionales, banco cuenta corriente, disponible en bancos.

**Soportes o terceros esperados:** Extracto bancario, conciliación bancaria, certificación bancaria de saldos.

**Soportes de control recomendados:** Banco, número de cuenta, tipo de cuenta.

**Observaciones de homologacion:** Conciliar saldo contable vs extracto (NIA 505 confirmaciones). Si el saldo conciliado es acreedor, reclasificar a sobregiro (210505). Revisar partidas conciliatorias antiguas (cheques girados no cobrados, consignaciones en tránsito). Confirmación bancaria directa.

### 111010 - Bancos moneda extranjera

| Atributo | Valor |
|---|---|
| Codigo | `111010` |
| Nombre | Bancos moneda extranjera |
| Cuenta Russell / 4D | Bancos |
| Tipo de rubro | Efectivo y equivalentes |
| Naturaleza | Debito (`D`) |
| Padre logico | `1110` |
| Critica | no |

**Que incluye:** Saldos en cuentas bancarias en moneda extranjera, medidos a TRM de cierre (NIC 21). Frecuente en importadores/exportadores (manufactura, retail), holdings y empresas con operaciones internacionales.

**Que no incluye:** Bancos en pesos (111005). Cuentas de ahorro ME (112010). Inversiones en ME (12xx). Diferencia en cambio (resultados, no es saldo).

**Cuentas o nombres de cliente que podrian llegar aqui:** Bancos moneda extranjera, cuentas en dólares, banco USD, cuenta en el exterior, banco moneda extranjera, cuenta corriente ME, banco divisas, cuenta offshore, foreign currency account.

**Soportes o terceros esperados:** Extracto bancario en ME, TRM de cierre, conciliación, certificación bancaria, registro cambiario.

**Soportes de control recomendados:** Banco, moneda, número de cuenta, TRM.

**Observaciones de homologacion:** Medir a TRM de cierre (NIC 21); la diferencia en cambio va a resultados (421020/530525). Verificar registro cambiario y cumplimiento de normas del Banco de la República. Conciliar el saldo en ME y su conversión.

### 112005 - Cuentas de ahorro moneda nacional

| Atributo | Valor |
|---|---|
| Codigo | `112005` |
| Nombre | Cuentas de ahorro moneda nacional |
| Cuenta Russell / 4D | Cuentas de ahorro |
| Tipo de rubro | Efectivo y equivalentes |
| Naturaleza | Debito (`D`) |
| Padre logico | `1120` |
| Critica | no |

**Que incluye:** Saldos en cuentas de ahorro en bancos nacionales en pesos, de disponibilidad inmediata, generadores de rendimientos. Transversal.

**Que no incluye:** Cuentas corrientes (111005). Ahorro en ME (112010). CDT y otras inversiones (1225). Fondos rotatorios (1125).

**Cuentas o nombres de cliente que podrian llegar aqui:** Cuentas de ahorro, ahorros moneda nacional, cuenta de ahorros, ahorro pesos, cuenta ahorro nacional, ahorro programado, cuenta de ahorro corriente.

**Soportes o terceros esperados:** Extracto, conciliación, certificación bancaria, liquidación de rendimientos.

**Soportes de control recomendados:** Banco, número de cuenta.

**Observaciones de homologacion:** Conciliar con extracto. Los rendimientos van a ingresos financieros (421005); verificar retención que le practicaron (anticipo, 135515). Si está pignorada o restringida, revelar y evaluar reclasificación.

### 112010 - Cuentas de ahorro moneda extranjera

| Atributo | Valor |
|---|---|
| Codigo | `112010` |
| Nombre | Cuentas de ahorro moneda extranjera |
| Cuenta Russell / 4D | Cuentas de ahorro |
| Tipo de rubro | Efectivo y equivalentes |
| Naturaleza | Debito (`D`) |
| Padre logico | `1120` |
| Critica | no |

**Que incluye:** Saldos en cuentas de ahorro en moneda extranjera medidos a TRM de cierre (NIC 21).

**Que no incluye:** Ahorro en pesos (112005). Bancos ME (111010). Inversiones en ME. Diferencia en cambio (resultados).

**Cuentas o nombres de cliente que podrian llegar aqui:** Cuentas de ahorro ME, ahorro en dólares, cuenta de ahorros divisas, ahorro moneda extranjera, savings account USD.

**Soportes o terceros esperados:** Extracto en ME, TRM de cierre, conciliación, certificación.

**Soportes de control recomendados:** Banco, moneda, número de cuenta, TRM.

**Observaciones de homologacion:** Medir a TRM de cierre (NIC 21); diferencia en cambio a resultados. Verificar registro cambiario. Conciliar saldo en ME y conversión.

### 112505 - Fondos rotatorios moneda nacional

| Atributo | Valor |
|---|---|
| Codigo | `112505` |
| Nombre | Fondos rotatorios moneda nacional |
| Cuenta Russell / 4D | Fondos |
| Tipo de rubro | Efectivo y equivalentes |
| Naturaleza | Debito (`D`) |
| Padre logico | `1125` |
| Critica | no |

**Que incluye:** Fondos rotatorios en pesos constituidos para fines específicos (pagos de obra, proyectos, sedes, anticipos rotatorios) con manejo y reembolso periódico.

**Que no incluye:** Caja menor (110510). Bancos (1110). Anticipos a empleados/contratistas (1330). Fondos en ME (112510).

**Cuentas o nombres de cliente que podrian llegar aqui:** Fondos rotatorios, fondo rotatorio nacional, fondo de obra, fondo de proyecto, fondo fijo rotatorio, fondo de caja proyecto, fondo de pagos.

**Soportes o terceros esperados:** Acto de constitución del fondo, conciliación, legalización, arqueo.

**Soportes de control recomendados:** Fondo, responsable, destino, monto.

**Observaciones de homologacion:** Verificar legalización oportuna y que el saldo corresponda al fondo constituido. En construcción, fondos de obra requieren control por proyecto. Soportes sin legalizar indican gastos por causar.

### 112510 - Fondos rotatorios moneda extranjera

| Atributo | Valor |
|---|---|
| Codigo | `112510` |
| Nombre | Fondos rotatorios moneda extranjera |
| Cuenta Russell / 4D | Fondos |
| Tipo de rubro | Efectivo y equivalentes |
| Naturaleza | Debito (`D`) |
| Padre logico | `1125` |
| Critica | no |

**Que incluye:** Fondos rotatorios en moneda extranjera medidos a TRM de cierre, para fines específicos en operaciones internacionales.

**Que no incluye:** Fondos en pesos (112505). Caja menor. Bancos ME (111010). Diferencia en cambio.

**Cuentas o nombres de cliente que podrian llegar aqui:** Fondos rotatorios ME, fondo rotatorio en dólares, fondo de proyecto exterior, fondo divisas, fondo rotatorio moneda extranjera.

**Soportes o terceros esperados:** Constitución del fondo, TRM, conciliación, legalización.

**Soportes de control recomendados:** Fondo, moneda, responsable, TRM.

**Observaciones de homologacion:** Medir a TRM de cierre (NIC 21). Verificar legalización y registro cambiario. Diferencia en cambio a resultados.

### 120595 - Inversiones patrimoniales - acciones

| Atributo | Valor |
|---|---|
| Codigo | `120595` |
| Nombre | Inversiones patrimoniales - acciones |
| Cuenta Russell / 4D | Acciones / inversiones patrimoniales |
| Tipo de rubro | Inversiones |
| Naturaleza | Debito (`D`) |
| Padre logico | `1205` |
| Critica | no |

**Que incluye:** Inversiones en acciones de otras sociedades (participación patrimonial): inversiones de control en subsidiarias/asociadas, inversiones de portafolio en acciones. Holdings: portafolio de participaciones. Medición según NIIF 9 (valor razonable) o método de participación/costo según el caso.

**Que no incluye:** Cuotas o partes de interés social en sociedades no accionarias (121095). Bonos (1215). CDT (1225). Valorizaciones (1905). Dividendos por cobrar (134505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Inversiones en acciones, acciones de otras sociedades, inversiones patrimoniales, participación accionaria, inversión en subsidiaria, inversión en asociada, portafolio de acciones, inversiones permanentes en acciones, acciones cotizadas/no cotizadas.

**Soportes o terceros esperados:** Títulos/registro de acciones, certificado de la participada, estados financieros de la participada, valoración, escritura de constitución.

**Soportes de control recomendados:** Sociedad, porcentaje de participación, tipo (control/asociada/portafolio), método de medición.

**Observaciones de homologacion:** Determinar nivel de control/influencia: subsidiaria (consolida), asociada (método de participación), portafolio (NIIF 9 valor razonable). Distinguir de cuotas sociales (121095). Verificar valoración y revelar como parte relacionada si hay control/influencia (NIC 24). Evaluar deterioro (129905).

### 121095 - Cuotas o partes de interés social

| Atributo | Valor |
|---|---|
| Codigo | `121095` |
| Nombre | Cuotas o partes de interés social |
| Cuenta Russell / 4D | Cuotas o partes de interés social |
| Tipo de rubro | Inversiones |
| Naturaleza | Debito (`D`) |
| Padre logico | `1210` |
| Critica | no |

**Que incluye:** Inversiones en cuotas o partes de interés social de sociedades NO accionarias (Ltda., en comandita simple, SAS no representadas en acciones). Equivalente patrimonial a las acciones pero en sociedades de cuotas.

**Que no incluye:** Acciones (120595). Bonos (1215). Aportes en cooperativas/entidades solidarias (según naturaleza). Derechos fiduciarios (1245).

**Cuentas o nombres de cliente que podrian llegar aqui:** Cuotas o partes de interés social, cuotas sociales, partes de interés, inversión en Ltda., participación en sociedad de cuotas, aportes de capital en sociedad, inversión en partes de interés.

**Soportes o terceros esperados:** Escritura social, registro mercantil, certificado de la participada, estados financieros, valoración.

**Soportes de control recomendados:** Sociedad, porcentaje, tipo societario, método de medición.

**Observaciones de homologacion:** Misma lógica de control/influencia que las acciones (120595). Determinar consolidación/método de participación/valor razonable según el caso. Verificar valoración y deterioro. Revelar como parte relacionada si aplica.

### 121505 - Bonos moneda nacional

| Atributo | Valor |
|---|---|
| Codigo | `121505` |
| Nombre | Bonos moneda nacional |
| Cuenta Russell / 4D | Bonos |
| Tipo de rubro | Inversiones |
| Naturaleza | Debito (`D`) |
| Padre logico | `1215` |
| Critica | no |

**Que incluye:** Inversiones en bonos y títulos de deuda en pesos (deuda corporativa, bonos públicos), medidos a costo amortizado o valor razonable según el modelo de negocio (NIIF 9).

**Que no incluye:** Bonos en ME (121510). Acciones (120595). CDT (1225). TES (123515). Intereses por cobrar (134510).

**Cuentas o nombres de cliente que podrian llegar aqui:** Bonos moneda nacional, bonos corporativos, inversión en bonos, títulos de deuda, bonos en pesos, deuda privada, papeles comerciales, bonos ordinarios.

**Soportes o terceros esperados:** Título/registro del bono, valoración, soporte de adquisición, calificación.

**Soportes de control recomendados:** Emisor, tasa, vencimiento, modelo de negocio (NIIF 9).

**Observaciones de homologacion:** Clasificar según modelo de negocio NIIF 9 (costo amortizado si se mantiene para cobrar flujos; valor razonable si para negociar). Devengar intereses (134510). Evaluar deterioro (pérdida esperada). Distinguir de acciones (instrumento de patrimonio).

### 121510 - Bonos moneda extranjera

| Atributo | Valor |
|---|---|
| Codigo | `121510` |
| Nombre | Bonos moneda extranjera |
| Cuenta Russell / 4D | Bonos |
| Tipo de rubro | Inversiones |
| Naturaleza | Debito (`D`) |
| Padre logico | `1215` |
| Critica | no |

**Que incluye:** Inversiones en bonos y títulos de deuda en moneda extranjera, medidos a TRM de cierre y según modelo NIIF 9.

**Que no incluye:** Bonos en pesos (121505). Acciones. CDT. Diferencia en cambio (resultados).

**Cuentas o nombres de cliente que podrian llegar aqui:** Bonos moneda extranjera, bonos en dólares, títulos de deuda ME, bonos internacionales, deuda externa (inversión), bonos USD, eurobonos.

**Soportes o terceros esperados:** Título, valoración, TRM, soporte de adquisición.

**Soportes de control recomendados:** Emisor, moneda, tasa, vencimiento, TRM.

**Observaciones de homologacion:** Medir a TRM de cierre (NIC 21) y según modelo NIIF 9. Diferencia en cambio a resultados. Devengar intereses. Evaluar deterioro.

### 122505 - Certificados de depósito a término - CDT

| Atributo | Valor |
|---|---|
| Codigo | `122505` |
| Nombre | Certificados de depósito a término - CDT |
| Cuenta Russell / 4D | Certificados |
| Tipo de rubro | Inversiones |
| Naturaleza | Debito (`D`) |
| Padre logico | `1225` |
| Critica | no |

**Que incluye:** Inversiones en certificados de depósito a término (CDT, CDAT) en entidades financieras, medidos a costo amortizado. Inversión de excedentes de tesorería. Transversal.

**Que no incluye:** Cuentas de ahorro (1120). Bonos (1215). TES (123515). Intereses por cobrar (134510). CDT pignorados (revelar restricción).

**Cuentas o nombres de cliente que podrian llegar aqui:** CDT, certificados de depósito a término, CDAT, certificados financieros, inversión en CDT, depósitos a término, certificados de ahorro a término.

**Soportes o terceros esperados:** Certificado/título, soporte de constitución, liquidación de rendimientos, certificación de la entidad.

**Soportes de control recomendados:** Entidad, tasa, plazo, vencimiento.

**Observaciones de homologacion:** Medir a costo amortizado (NIIF 9). Devengar rendimientos (134510); verificar retención que le practicaron. Si está pignorado o restringido como garantía, revelar y evaluar reclasificación. Clasificar corriente/no corriente según vencimiento.

### 123515 - Títulos de tesorería - TES

| Atributo | Valor |
|---|---|
| Codigo | `123515` |
| Nombre | Títulos de tesorería - TES |
| Cuenta Russell / 4D | Títulos |
| Tipo de rubro | Inversiones |
| Naturaleza | Debito (`D`) |
| Padre logico | `1235` |
| Critica | no |

**Que incluye:** Inversiones en títulos de tesorería del Gobierno (TES) y otros títulos públicos, medidos a costo amortizado o valor razonable según modelo NIIF 9.

**Que no incluye:** CDT (1225). Bonos corporativos (1215). Acciones. Intereses por cobrar (134510).

**Cuentas o nombres de cliente que podrian llegar aqui:** TES, títulos de tesorería, títulos públicos, deuda pública, TES clase B, títulos del Gobierno, inversión en TES, títulos de deuda soberana.

**Soportes o terceros esperados:** Registro del título, valoración, soporte de adquisición, custodia (Deceval/DCV).

**Soportes de control recomendados:** Tipo de título, tasa, vencimiento, modelo de negocio.

**Observaciones de homologacion:** Clasificar según modelo NIIF 9. Valoración a precios de mercado si es para negociar. Devengar rendimientos. Custodia en depósito centralizado de valores. Frecuente en tesorerías con excedentes.

### 124505 - Derechos fiduciarios moneda nacional

| Atributo | Valor |
|---|---|
| Codigo | `124505` |
| Nombre | Derechos fiduciarios moneda nacional |
| Cuenta Russell / 4D | Derechos fiduciarios |
| Tipo de rubro | Inversiones |
| Naturaleza | Debito (`D`) |
| Padre logico | `1245` |
| Critica | no |

**Que incluye:** Derechos fiduciarios en pesos derivados de la participación en patrimonios autónomos y encargos fiduciarios: fiducia de administración, inmobiliaria, de inversión, de garantía, fondos de inversión colectiva (FIC). Construcción: derechos en fiducias inmobiliarias y de proyectos. Transversal: inversión en FIC.

**Que no incluye:** Derechos fiduciarios en ME (124510). Inversiones directas en títulos (1215/1225/1235). Depósitos en garantía (1335). Anticipos (1330).

**Cuentas o nombres de cliente que podrian llegar aqui:** Derechos fiduciarios, fiducia de administración, fiducia inmobiliaria, fiducia de inversión, fiducia de garantía, fondo de inversión colectiva, FIC, encargo fiduciario, patrimonio autónomo (derechos), participación en fideicomiso, carteras colectivas.

**Soportes o terceros esperados:** Contrato de fiducia, certificado de derechos fiduciarios, extracto del patrimonio autónomo, estados financieros del fideicomiso, valoración.

**Soportes de control recomendados:** Fiduciaria, tipo de fiducia, patrimonio autónomo, proyecto.

**Observaciones de homologacion:** Analizar el activo subyacente del patrimonio autónomo para clasificación y medición (NIIF 9 / consolidación si hay control de la fiducia). En construcción, los derechos en fiducia inmobiliaria son clave. Distinguir fiducia de inversión (rendimiento) de fiducia de administración/garantía. Verificar valoración del derecho.

### 124510 - Derechos fiduciarios moneda extranjera

| Atributo | Valor |
|---|---|
| Codigo | `124510` |
| Nombre | Derechos fiduciarios moneda extranjera |
| Cuenta Russell / 4D | Derechos fiduciarios |
| Tipo de rubro | Inversiones |
| Naturaleza | Debito (`D`) |
| Padre logico | `1245` |
| Critica | no |

**Que incluye:** Derechos fiduciarios en moneda extranjera, medidos a TRM de cierre, derivados de patrimonios autónomos o fondos en ME.

**Que no incluye:** Derechos fiduciarios en pesos (124505). Inversiones directas. Diferencia en cambio (resultados).

**Cuentas o nombres de cliente que podrian llegar aqui:** Derechos fiduciarios ME, fiducia en dólares, fondo de inversión ME, encargo fiduciario divisas, patrimonio autónomo ME, derechos fiduciarios moneda extranjera.

**Soportes o terceros esperados:** Contrato de fiducia, extracto del patrimonio autónomo, TRM, valoración.

**Soportes de control recomendados:** Fiduciaria, tipo, moneda, TRM.

**Observaciones de homologacion:** Medir a TRM de cierre (NIC 21) y analizar el subyacente (NIIF 9). Diferencia en cambio a resultados. Verificar valoración del derecho.

### 129905 - Deterioro de inversiones

| Atributo | Valor |
|---|---|
| Codigo | `129905` |
| Nombre | Deterioro de inversiones |
| Cuenta Russell / 4D | Deterioro / provisión inversiones |
| Tipo de rubro | Inversiones (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1299` |
| Critica | no |

**Que incluye:** Deterioro acumulado de inversiones (cuenta correctora de naturaleza crédito que minora el valor de las inversiones): pérdida por deterioro de acciones, bonos, CDT, derechos fiduciarios cuando el valor recuperable es menor al valor en libros (NIIF 9 pérdida esperada / NIC 36 según el caso).

**Que no incluye:** Las inversiones brutas (1205-1245). Valorizaciones (1905, naturaleza opuesta). Gasto por deterioro del periodo (519915/519995). Baja de la inversión (venta).

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro de inversiones, provisión de inversiones, deterioro de acciones, deterioro de bonos, pérdida por deterioro inversiones, provisión portafolio, deterioro de derechos fiduciarios, deterioro instrumentos financieros.

**Soportes o terceros esperados:** Cálculo del deterioro, valoración, estados financieros de la participada, evidencia de deterioro.

**Soportes de control recomendados:** Inversión, tipo, causa del deterioro.

**Observaciones de homologacion:** Cuenta correctora (crédito) que minora el activo. Reconocer cuando el valor recuperable es menor al valor en libros. Para instrumentos de deuda, pérdida esperada (NIIF 9); para participaciones medidas al costo, evaluar indicios de deterioro. No confundir con valorizaciones (1905). El gasto del periodo va a 51xx.

### 130505 - Clientes nacionales

| Atributo | Valor |
|---|---|
| Codigo | `130505` |
| Nombre | Clientes nacionales |
| Cuenta Russell / 4D | Clientes |
| Tipo de rubro | Cuentas por cobrar comerciales |
| Naturaleza | Debito (`D`) |
| Padre logico | `1305` |
| Critica | no |

**Que incluye:** Derechos de cobro originados en operaciones comerciales con clientes ubicados en Colombia por venta de bienes, prestación de servicios o ejecución de contratos. Salud: cartera EPS, IPS, medicina prepagada, SOAT, ADRES, glosas conciliadas y aceptadas, servicios hospitalarios facturados. Construcción: actas de obra aprobadas, cortes de obra, cuentas por cobrar a contratantes y desarrolladores. Educación: matrículas, pensiones, derechos académicos, convenios. Transporte: fletes, servicios logísticos, carga facturada. Retail/comercio: clientes crédito, distribuidores, franquiciados, grandes superficies. Manufactura: mayoristas, concesionarios, distribuidores corporativos. Servicios profesionales: honorarios facturados, igualas, contratos ejecutados pendientes de recaudo.

**Que no incluye:** Clientes del exterior (130510). Cuentas por cobrar a vinculados (132005), socios/accionistas (1325). Anticipos a proveedores (133005). Préstamos a trabajadores (133015/136595). Ingresos por cobrar no comerciales (1345). Impuestos a favor (1355). Reclamaciones (1360). Glosas no aceptadas/en discusión (evaluar política). Deterioro de clientes (139905).

**Cuentas o nombres de cliente que podrian llegar aqui:** Cartera EPS, cartera contributivo, cartera subsidiado, cuentas médicas por cobrar, recobros ADRES, clientes nacionales, clientes corporativos, distribuidores, franquiciados, convenios por cobrar, matrículas pendientes, pensiones por cobrar, actas de obra, cuentas por cobrar aseguradoras, fletes por cobrar, servicios facturados pendientes de recaudo.

**Soportes o terceros esperados:** Factura electrónica, contrato, RIPS (salud), actas de obra, órdenes de servicio, remisiones, aceptación de entrega, estados de cuenta, conciliaciones con clientes, recaudos posteriores, análisis de antigüedad.

**Soportes de control recomendados:** Cliente, NIT, unidad de negocio, contrato, sede, línea de servicio, antigüedad de cartera.

**Observaciones de homologacion:** La naturaleza económica prevalece sobre el nombre. Si representa un derecho de cobro derivado de ingresos devengados frente a terceros nacionales, homologa aquí. Confirmaciones externas (NIA 505) y análisis de antigüedad para deterioro (NIIF 9). Cruce con ingresos para validar corte (NIA 240). Saldos crédito (anticipos de clientes) reclasificar a pasivo (280505).

### 130510 - Clientes del exterior

| Atributo | Valor |
|---|---|
| Codigo | `130510` |
| Nombre | Clientes del exterior |
| Cuenta Russell / 4D | Clientes |
| Tipo de rubro | Cuentas por cobrar comerciales |
| Naturaleza | Debito (`D`) |
| Padre logico | `1305` |
| Critica | no |

**Que incluye:** Derechos de cobro comerciales con clientes del exterior por exportación de bienes o servicios, medidos a TRM de cierre (NIC 21). Manufactura/agro: exportaciones por cobrar. Tecnología/servicios: facturación a clientes internacionales, SaaS/servicios exportados. Comercializadoras internacionales.

**Que no incluye:** Clientes nacionales (130505). Vinculados del exterior (132005). Anticipos a proveedores del exterior (133005). Diferencia en cambio (resultados). Reintegros de exportación pendientes (según naturaleza).

**Cuentas o nombres de cliente que podrian llegar aqui:** Clientes del exterior, cartera de exportación, cuentas por cobrar moneda extranjera, clientes internacionales, exportaciones por cobrar, foreign customers, clientes USD, facturación al exterior, cartera exportadores, servicios exportados por cobrar.

**Soportes o terceros esperados:** Factura comercial (invoice), documento de exportación (DEX/DAEX), documento de transporte, contrato, registro cambiario, reintegro de divisas, conciliación.

**Soportes de control recomendados:** Cliente, país, moneda, TRM, Incoterm, antigüedad.

**Observaciones de homologacion:** Medir a TRM de cierre (NIC 21); diferencia en cambio a resultados. Verificar reintegro de divisas y registro cambiario. Confirmaciones externas. Evaluar deterioro (NIIF 9). Distinguir de cartera nacional para análisis de riesgo cambiario.

### 132005 - Cuentas por cobrar a vinculados económicos

| Atributo | Valor |
|---|---|
| Codigo | `132005` |
| Nombre | Cuentas por cobrar a vinculados económicos |
| Cuenta Russell / 4D | Cuentas por cobrar a vinculados económicos |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1320` |
| Critica | no |

**Que incluye:** Derechos de cobro con vinculados económicos (matriz, subsidiarias, hermanas, entidades bajo control común): ventas intragrupo, servicios facturados a vinculados, préstamos a vinculados, cuentas corrientes intercompañía. Holdings y grupos empresariales.

**Que no incluye:** Clientes independientes (1305). Socios/accionistas (1325). Anticipos a proveedores vinculados (1330). Dividendos por cobrar (134505). Deterioro de vinculados (139920).

**Cuentas o nombres de cliente que podrian llegar aqui:** Cuentas por cobrar a vinculados, cuentas por cobrar intercompañía, préstamo a subsidiaria, cuenta corriente con matriz, ventas intragrupo por cobrar, cash pooling activo, cuenta por cobrar a empresa hermana, intercompany receivable, financiación a filial, servicios a vinculados por cobrar.

**Soportes o terceros esperados:** Contrato (mutuo/servicios/suministro), estudio de precios de transferencia, conciliación intercompañía, factura, certificación del vinculado.

**Soportes de control recomendados:** Vinculado, tipo de vinculación, naturaleza (comercial/financiera), conciliación intercompañía.

**Observaciones de homologacion:** Revelar como parte relacionada (NIC 24). Validar precios de transferencia y tasa de mercado en préstamos. Conciliar con la cuenta espejo del vinculado para eliminación en consolidación. Distinguir saldo comercial de financiero. Evaluar deterioro (139920) y realidad de las transacciones (NIA 550).

### 132505 - Cuentas por cobrar a socios

| Atributo | Valor |
|---|---|
| Codigo | `132505` |
| Nombre | Cuentas por cobrar a socios |
| Cuenta Russell / 4D | Cuentas por cobrar a socios y accionistas |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1325` |
| Critica | no |

**Que incluye:** Derechos de cobro frente a socios (sociedades de personas/SAS): préstamos a socios, anticipos de utilidades, cuentas corrientes con socios, gastos pagados por cuenta del socio pendientes de reembolso.

**Que no incluye:** Cuentas por cobrar a accionistas (132510). Vinculados personas jurídicas (132005). Capital suscrito por cobrar (310515). Dividendos/participaciones por cobrar de inversiones (134505). Deterioro (139925).

**Cuentas o nombres de cliente que podrian llegar aqui:** Cuentas por cobrar a socios, préstamo a socio, anticipo de utilidades a socio, cuenta corriente socio, gastos por cuenta de socio, deudor socio, anticipo a socio, retiro de socio por legalizar.

**Soportes o terceros esperados:** Contrato de mutuo, acta, soporte del préstamo/gasto, conciliación con el socio.

**Soportes de control recomendados:** Socio, CC/NIT, naturaleza, tasa si aplica.

**Observaciones de homologacion:** Revelar como parte relacionada (NIC 24). Préstamos a socios deben tener tasa de mercado (precios de transferencia) y generan rendimiento gravable. Verificar que no sean retiros de utilidades encubiertos (riesgo de dividendos en especie / distribución). Validar realidad y soporte.

### 132510 - Cuentas por cobrar a accionistas

| Atributo | Valor |
|---|---|
| Codigo | `132510` |
| Nombre | Cuentas por cobrar a accionistas |
| Cuenta Russell / 4D | Cuentas por cobrar a socios y accionistas |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1325` |
| Critica | no |

**Que incluye:** Derechos de cobro frente a accionistas (sociedades por acciones): préstamos a accionistas, cuentas corrientes, gastos pagados por cuenta del accionista pendientes de reembolso.

**Que no incluye:** Cuentas por cobrar a socios (132505). Capital suscrito por cobrar (310515). Vinculados (132005). Dividendos por cobrar de inversiones (134505). Deterioro (139925).

**Cuentas o nombres de cliente que podrian llegar aqui:** Cuentas por cobrar a accionistas, préstamo a accionista, cuenta corriente accionista, gastos por cuenta de accionista, deudor accionista, anticipo a accionista, retiro de accionista por legalizar.

**Soportes o terceros esperados:** Contrato de mutuo, acta, soporte, conciliación con el accionista.

**Soportes de control recomendados:** Accionista, CC/NIT, naturaleza, tasa si aplica.

**Observaciones de homologacion:** Misma lógica que socios (132505). Revelar como parte relacionada. Validar tasa de mercado y que no encubra distribución de utilidades. Verificar soporte y realidad.

### 133005 - Anticipos y avances a proveedores

| Atributo | Valor |
|---|---|
| Codigo | `133005` |
| Nombre | Anticipos y avances a proveedores |
| Cuenta Russell / 4D | Anticipos y avances |
| Tipo de rubro | Anticipos y avances |
| Naturaleza | Debito (`D`) |
| Padre logico | `1330` |
| Critica | no |

**Que incluye:** Anticipos entregados a proveedores a cuenta de bienes o servicios aún no recibidos. Manufactura/retail: anticipos sobre pedidos de mercancía/materia prima, importaciones. Construcción: anticipos a proveedores de materiales. Salud: anticipos a proveedores de medicamentos/insumos. Transversal: pagos adelantados a proveedores que se cruzan al recibir la factura.

**Que no incluye:** Anticipos a contratistas (133010). Anticipos a trabajadores (133015). Cuentas por pagar a proveedores (pasivo, naturaleza opuesta). Depósitos para importaciones (133505). Gastos pagados por anticipado (1705).

**Cuentas o nombres de cliente que podrian llegar aqui:** Anticipos a proveedores, avances a proveedores, anticipos sobre pedidos, anticipos de mercancía, anticipos de materia prima, anticipos de importación, pagos anticipados a proveedores, abonos a proveedores, anticipos de compra.

**Soportes o terceros esperados:** Orden de compra, soporte del pago anticipado, contrato de suministro, factura posterior de cruce.

**Soportes de control recomendados:** Proveedor, NIT, pedido/orden, antigüedad.

**Observaciones de homologacion:** Es un activo (derecho a recibir bienes/servicios), no debe netearse contra cuentas por pagar del mismo proveedor salvo acuerdo de compensación. Verificar legalización oportuna (cruce con factura). Anticipos antiguos sin cruzar son indicio de riesgo (NIA 240). Distinguir de gasto pagado por anticipado (1705).

### 133010 - Anticipos y avances a contratistas

| Atributo | Valor |
|---|---|
| Codigo | `133010` |
| Nombre | Anticipos y avances a contratistas |
| Cuenta Russell / 4D | Anticipos y avances |
| Tipo de rubro | Anticipos y avances |
| Naturaleza | Debito (`D`) |
| Padre logico | `1330` |
| Critica | no |

**Que incluye:** Anticipos entregados a contratistas a cuenta de obras o servicios por ejecutar, amortizables contra actas de avance. Construcción: anticipo de obra a subcontratistas (porcentaje del contrato). Servicios/tecnología: anticipos sobre contratos de implementación o desarrollo.

**Que no incluye:** Anticipos a proveedores de bienes (133005). Anticipos a trabajadores (133015). Cuentas por pagar a contratistas (232005, pasivo). Retención en garantía descontada (minora la cuenta por pagar al contratista).

**Cuentas o nombres de cliente que podrian llegar aqui:** Anticipos a contratistas, avances a contratistas, anticipo de obra, anticipo contractual entregado, anticipo de subcontrato, anticipo amortizable, pago anticipado a contratista, anticipo de buen manejo.

**Soportes o terceros esperados:** Contrato de obra/servicio, garantía de buen manejo del anticipo, acta de amortización, soporte del pago.

**Soportes de control recomendados:** Contratista, NIT, contrato/obra, porcentaje amortizado.

**Observaciones de homologacion:** Activo amortizable contra el avance de la obra (actas). Verificar garantía de buen manejo del anticipo y amortización oportuna. En construcción es partida material. Anticipos sin amortizar de obras terminadas son riesgo. Controlar saldo no amortizado.

### 133015 - Anticipos y avances a trabajadores

| Atributo | Valor |
|---|---|
| Codigo | `133015` |
| Nombre | Anticipos y avances a trabajadores |
| Cuenta Russell / 4D | Anticipos y avances |
| Tipo de rubro | Anticipos y avances |
| Naturaleza | Debito (`D`) |
| Padre logico | `1330` |
| Critica | no |

**Que incluye:** Anticipos entregados a trabajadores pendientes de legalizar o descontar: anticipos de nómina, anticipos para gastos de viaje, anticipos para compras por cuenta de la empresa, avances para legalizar.

**Que no incluye:** Préstamos a trabajadores con plan de pago (136595). Anticipos a proveedores (133005) o contratistas (133010). Salarios por pagar (pasivo). Gastos ya legalizados (gasto).

**Cuentas o nombres de cliente que podrian llegar aqui:** Anticipos a trabajadores, anticipos de nómina, anticipos de viáticos, avances a empleados, anticipo de gastos a legalizar, avance para compras, anticipo a empleados por legalizar.

**Soportes o terceros esperados:** Autorización del anticipo, soporte de legalización, nómina, recibos de gastos.

**Soportes de control recomendados:** Empleado, concepto, antigüedad.

**Observaciones de homologacion:** Verificar legalización oportuna (gastos de viaje) o descuento de nómina (anticipos de salario). Distinguir de préstamos a trabajadores con plan de pago (136595). Anticipos antiguos sin legalizar deben depurarse (pueden ser gasto no causado o riesgo).

### 133095 - Otros anticipos y avances

| Atributo | Valor |
|---|---|
| Codigo | `133095` |
| Nombre | Otros anticipos y avances |
| Cuenta Russell / 4D | Anticipos y avances |
| Tipo de rubro | Anticipos y avances |
| Naturaleza | Debito (`D`) |
| Padre logico | `1330` |
| Critica | no |

**Que incluye:** Otros anticipos y avances entregados no clasificados en subcuentas específicas: anticipos a entidades, avances varios, anticipos por legalizar de naturaleza distinta.

**Que no incluye:** Anticipos a proveedores (133005), contratistas (133010), trabajadores (133015). Depósitos (1335). Gastos pagados por anticipado (1705).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros anticipos, avances varios, anticipos diversos, anticipos por aplicar, anticipos a entidades, avances por legalizar, otros anticipos entregados.

**Soportes o terceros esperados:** Soporte del pago anticipado, identificación del concepto, legalización.

**Soportes de control recomendados:** Tercero, concepto, antigüedad.

**Observaciones de homologacion:** Cuenta residual de anticipos. Reclasificar a subcuenta específica al identificar. Depurar saldos antiguos sin legalizar.

### 133505 - Depósitos para importaciones

| Atributo | Valor |
|---|---|
| Codigo | `133505` |
| Nombre | Depósitos para importaciones |
| Cuenta Russell / 4D | Depósitos |
| Tipo de rubro | Depósitos entregados |
| Naturaleza | Debito (`D`) |
| Padre logico | `1335` |
| Critica | no |

**Que incluye:** Depósitos entregados para trámites de importación: depósitos ante agencias de aduana, garantías de importación, depósitos para nacionalización, fondos para gastos de importación. Importadores (manufactura, retail, salud, tecnología).

**Que no incluye:** Anticipos a proveedores del exterior (133005). Mercancía en tránsito (146505). Aranceles e IVA de importación (impuestos / mayor valor inventario). Otros depósitos (133595).

**Cuentas o nombres de cliente que podrian llegar aqui:** Depósitos para importaciones, depósitos en aduana, garantía de importación, depósito de nacionalización, fondos de importación, depósito agencia de aduana, depósito SIA.

**Soportes o terceros esperados:** Soporte del depósito, declaración de importación, liquidación de la agencia de aduana, contrato con la SIA.

**Soportes de control recomendados:** Importación, agencia, tercero, antigüedad.

**Observaciones de homologacion:** Verificar legalización contra la importación una vez nacionalizada. Distinguir del anticipo al proveedor (133005) y de la mercancía en tránsito (146505). Depurar depósitos de importaciones ya concluidas.

### 133510 - Depósitos para servicios

| Atributo | Valor |
|---|---|
| Codigo | `133510` |
| Nombre | Depósitos para servicios |
| Cuenta Russell / 4D | Depósitos |
| Tipo de rubro | Depósitos entregados |
| Naturaleza | Debito (`D`) |
| Padre logico | `1335` |
| Critica | no |

**Que incluye:** Depósitos entregados como garantía o requisito para la prestación de servicios a la entidad: depósitos a empresas de servicios públicos, depósitos por conexión, garantías para servicios contratados.

**Que no incluye:** Anticipos por servicios (133005/133095). Depósitos en garantía generales (133535). Gastos pagados por anticipado (1705).

**Cuentas o nombres de cliente que podrian llegar aqui:** Depósitos para servicios, depósito de servicios públicos, depósito por conexión, garantía de servicio entregada, depósito a proveedores de servicios, depósito de instalación.

**Soportes o terceros esperados:** Soporte del depósito, contrato de servicio, condiciones de reembolso.

**Soportes de control recomendados:** Tercero, servicio, condición de reembolso.

**Observaciones de homologacion:** Activo reembolsable al terminar el servicio. Verificar recuperabilidad. Distinguir de anticipo aplicable al servicio (que se consume) y de gasto pagado por anticipado (1705).

### 133515 - Depósitos para contratos

| Atributo | Valor |
|---|---|
| Codigo | `133515` |
| Nombre | Depósitos para contratos |
| Cuenta Russell / 4D | Depósitos |
| Tipo de rubro | Depósitos entregados |
| Naturaleza | Debito (`D`) |
| Padre logico | `1335` |
| Critica | no |

**Que incluye:** Depósitos entregados como garantía de seriedad o cumplimiento de contratos en los que la entidad participa (licitaciones, contratos de suministro), reembolsables al cumplir las condiciones.

**Que no incluye:** Anticipos sobre contratos (1330). Depósitos en garantía generales (133535). Garantías otorgadas sin desembolso (cuentas de orden 8105).

**Cuentas o nombres de cliente que podrian llegar aqui:** Depósitos para contratos, depósito de seriedad, garantía de cumplimiento entregada en efectivo, depósito de licitación, depósito contractual, garantía de oferta en efectivo.

**Soportes o terceros esperados:** Pliego/contrato, soporte del depósito, condiciones de devolución.

**Soportes de control recomendados:** Contrato/licitación, entidad, condición de reembolso.

**Observaciones de homologacion:** Activo reembolsable. Verificar recuperabilidad y devolución al cierre del proceso. Las garantías otorgadas sin desembolso de efectivo van a cuentas de orden (8105).

### 133535 - Depósitos en garantía

| Atributo | Valor |
|---|---|
| Codigo | `133535` |
| Nombre | Depósitos en garantía |
| Cuenta Russell / 4D | Depósitos |
| Tipo de rubro | Depósitos entregados |
| Naturaleza | Debito (`D`) |
| Padre logico | `1335` |
| Critica | no |

**Que incluye:** Depósitos en garantía entregados de naturaleza general: depósitos a arrendadores (canon de garantía), depósitos judiciales, garantías reembolsables diversas entregadas en efectivo.

**Que no incluye:** Depósitos para importaciones (133505), servicios (133510), contratos (133515). Otros depósitos (133595). Garantías sin desembolso (orden 8105).

**Cuentas o nombres de cliente que podrian llegar aqui:** Depósitos en garantía, depósito de arrendamiento, depósito a arrendador, depósito judicial, garantía reembolsable entregada, depósito de alquiler, cauciones en efectivo.

**Soportes o terceros esperados:** Contrato/orden, soporte del depósito, condiciones de reembolso.

**Soportes de control recomendados:** Tercero, concepto, condición de reembolso.

**Observaciones de homologacion:** Activo reembolsable. Verificar recuperabilidad. En arrendamientos, el depósito de garantía es distinto del canon pagado por anticipado (1705). Depurar depósitos de relaciones ya terminadas.

### 133595 - Otros depósitos entregados

| Atributo | Valor |
|---|---|
| Codigo | `133595` |
| Nombre | Otros depósitos entregados |
| Cuenta Russell / 4D | Depósitos |
| Tipo de rubro | Depósitos entregados |
| Naturaleza | Debito (`D`) |
| Padre logico | `1335` |
| Critica | no |

**Que incluye:** Otros depósitos entregados no clasificados en subcuentas específicas.

**Que no incluye:** Depósitos con subcuenta específica (importaciones, servicios, contratos, garantía). Anticipos (1330). Garantías sin desembolso (orden).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros depósitos entregados, depósitos varios, depósitos diversos, depósitos por identificar, otros depósitos.

**Soportes o terceros esperados:** Soporte del depósito, identificación del concepto, condiciones de reembolso.

**Soportes de control recomendados:** Tercero, concepto, antigüedad.

**Observaciones de homologacion:** Cuenta residual de depósitos. Reclasificar a subcuenta específica si aplica. Verificar recuperabilidad y depurar saldos antiguos.

### 134505 - Dividendos y participaciones por cobrar

| Atributo | Valor |
|---|---|
| Codigo | `134505` |
| Nombre | Dividendos y participaciones por cobrar |
| Cuenta Russell / 4D | Ingresos por cobrar |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1345` |
| Critica | no |

**Que incluye:** Dividendos y participaciones decretados a favor de la entidad por inversiones en otras sociedades, pendientes de recaudo. Holdings y entidades con portafolio de participaciones.

**Que no incluye:** Dividendos por pagar a los accionistas de la entidad (pasivo 236005). El ingreso por dividendos (421505). Inversiones (1205/1210). Otros ingresos por cobrar (134595).

**Cuentas o nombres de cliente que podrian llegar aqui:** Dividendos por cobrar, participaciones por cobrar, dividendos decretados por cobrar, dividendos de subsidiarias por cobrar, participaciones de inversiones por cobrar, dividendos pendientes de recaudo.

**Soportes o terceros esperados:** Acta de distribución de la participada, certificado de dividendos, soporte del decreto.

**Soportes de control recomendados:** Sociedad participada, fecha de decreto, gravabilidad.

**Observaciones de homologacion:** Reconocer cuando se establece el derecho (decreto en la participada). Si la inversión se mide por método de participación, el dividendo reduce la inversión, no genera esta cuenta por cobrar contra ingreso. Revelar como parte relacionada. Verificar retención que le practiquen.

### 134510 - Intereses por cobrar

| Atributo | Valor |
|---|---|
| Codigo | `134510` |
| Nombre | Intereses por cobrar |
| Cuenta Russell / 4D | Ingresos por cobrar |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1345` |
| Critica | no |

**Que incluye:** Intereses devengados pendientes de cobro: rendimientos de inversiones (CDT, bonos, TES), intereses de préstamos otorgados, intereses de mora cobrados a clientes, rendimientos de cuentas por cobrar.

**Que no incluye:** El ingreso por intereses (421005). Capital de las inversiones/préstamos (12xx/1370). Intereses por pagar (pasivo). Otros ingresos por cobrar (134595).

**Cuentas o nombres de cliente que podrian llegar aqui:** Intereses por cobrar, rendimientos por cobrar, intereses de CDT por cobrar, intereses de mora por cobrar, intereses de préstamos por cobrar, rendimientos devengados, intereses causados por cobrar.

**Soportes o terceros esperados:** Liquidación de intereses, tabla de rendimientos, contrato, extracto.

**Soportes de control recomendados:** Fuente, deudor, tasa, periodo de devengo.

**Observaciones de homologacion:** Devengar por el transcurso del tiempo (costo amortizado, NIIF 9). Verificar retención que le practicaron (anticipo, 135515). Evaluar recuperabilidad. Distinguir de la inversión/préstamo de capital.

### 134520 - Honorarios por cobrar

| Atributo | Valor |
|---|---|
| Codigo | `134520` |
| Nombre | Honorarios por cobrar |
| Cuenta Russell / 4D | Ingresos por cobrar |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1345` |
| Critica | no |

**Que incluye:** Honorarios devengados pendientes de cobro/facturación en empresas donde no es el giro principal (esporádicos), o derechos por honorarios reconocidos no facturados.

**Que no incluye:** Cartera de clientes por honorarios cuando es el giro (130505). El ingreso (415510/423005). Otros ingresos por cobrar (134595).

**Cuentas o nombres de cliente que podrian llegar aqui:** Honorarios por cobrar, honorarios devengados por cobrar, honorarios facturados pendientes, honorarios por facturar, derechos por honorarios.

**Soportes o terceros esperados:** Contrato, soporte del servicio, factura posterior, conciliación.

**Soportes de control recomendados:** Tercero, servicio, periodo.

**Observaciones de homologacion:** Si los honorarios son el giro, la cartera va a clientes (130505). Esta cuenta aplica a derechos esporádicos o por facturar. Devengar al prestar el servicio (NIIF 15).

### 134525 - Servicios por cobrar

| Atributo | Valor |
|---|---|
| Codigo | `134525` |
| Nombre | Servicios por cobrar |
| Cuenta Russell / 4D | Ingresos por cobrar |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1345` |
| Critica | no |

**Que incluye:** Servicios devengados pendientes de cobro/facturación (esporádicos o por facturar) en empresas donde no es el giro principal, o derechos por servicios reconocidos no facturados (activo de contrato).

**Que no incluye:** Cartera de clientes por servicios del giro (130505). El ingreso (415510/423505). Honorarios por cobrar (134520). Otros (134595).

**Cuentas o nombres de cliente que podrian llegar aqui:** Servicios por cobrar, servicios devengados por cobrar, servicios facturados pendientes, servicios por facturar, activo de contrato, derechos por servicios.

**Soportes o terceros esperados:** Contrato, orden de servicio, soporte de prestación, factura posterior.

**Soportes de control recomendados:** Tercero, servicio, periodo.

**Observaciones de homologacion:** Si los servicios son el giro, la cartera va a clientes (130505). El derecho devengado no facturado puede ser activo de contrato (NIIF 15). Devengar al prestar el servicio.

### 134530 - Arrendamientos por cobrar

| Atributo | Valor |
|---|---|
| Codigo | `134530` |
| Nombre | Arrendamientos por cobrar |
| Cuenta Russell / 4D | Ingresos por cobrar |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1345` |
| Critica | no |

**Que incluye:** Cánones de arrendamiento devengados pendientes de cobro (esporádicos o cuando no es el giro inmobiliario), o cánones reconocidos no recaudados.

**Que no incluye:** Cartera de clientes inmobiliarios cuando es el giro (130505). El ingreso (415505/422005). Cánones cobrados por anticipado (pasivo 270515). Otros (134595).

**Cuentas o nombres de cliente que podrian llegar aqui:** Arrendamientos por cobrar, cánones por cobrar, alquileres por cobrar, arriendos devengados por cobrar, cánones de arrendamiento pendientes.

**Soportes o terceros esperados:** Contrato de arrendamiento, factura, soporte del canon, conciliación.

**Soportes de control recomendados:** Arrendatario, inmueble, contrato, periodo.

**Observaciones de homologacion:** Si el arrendamiento es el giro, la cartera va a clientes (130505). Devengar linealmente (NIIF 16 arrendador). Distinguir del canon cobrado por anticipado (pasivo 270515).

### 134595 - Otros ingresos por cobrar

| Atributo | Valor |
|---|---|
| Codigo | `134595` |
| Nombre | Otros ingresos por cobrar |
| Cuenta Russell / 4D | Ingresos por cobrar |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1345` |
| Critica | no |

**Que incluye:** Otros ingresos devengados pendientes de cobro no clasificados: comisiones por cobrar, regalías por cobrar, otros derechos de ingreso reconocidos no recaudados.

**Que no incluye:** Ingresos por cobrar con subcuenta específica (dividendos, intereses, honorarios, servicios, arrendamientos). Cartera de clientes (1305). Reclamaciones (1360).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros ingresos por cobrar, comisiones por cobrar, regalías por cobrar, ingresos devengados por cobrar, derechos de ingreso varios, otros derechos por cobrar.

**Soportes o terceros esperados:** Soporte del derecho, contrato, conciliación.

**Soportes de control recomendados:** Tercero, concepto, periodo.

**Observaciones de homologacion:** Cuenta residual de ingresos por cobrar. Reclasificar a subcuenta específica si aplica. Evaluar recuperabilidad y devengo correcto.

### 135005 - Retenciones sobre contratos de construcción

| Atributo | Valor |
|---|---|
| Codigo | `135005` |
| Nombre | Retenciones sobre contratos de construcción |
| Cuenta Russell / 4D | Retención sobre contratos |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1350` |
| Critica | no |

**Que incluye:** Retención en garantía (retegarantía) que el contratante descuenta a la entidad sobre contratos de construcción, retenida hasta el cumplimiento/estabilidad de la obra y reembolsable al final. Constructoras/contratistas de obra: porcentaje retenido de cada acta de obra.

**Que no incluye:** Retención en la fuente de renta a favor (135515). Cartera de obra (clientes 130505). Retención en garantía que la entidad descuenta a SUS contratistas (minora la cuenta por pagar 232005). Depósitos (1335).

**Cuentas o nombres de cliente que podrian llegar aqui:** Retención en garantía por cobrar, retegarantía de obra, retención sobre actas, retención de obra por cobrar, garantía retenida por el contratante, retención contractual de construcción, amortización de garantía pendiente.

**Soportes o terceros esperados:** Contrato de obra, actas de obra con retención, soporte de la retención, condiciones de devolución.

**Soportes de control recomendados:** Contrato/obra, contratante, porcentaje, condición de devolución.

**Observaciones de homologacion:** Es un derecho de cobro futuro condicionado a la estabilidad/cumplimiento de la obra. Frecuente y material en construcción. Distinguir de la retención en la fuente (135515) y de la retegarantía que la entidad practica a sus subcontratistas. Evaluar recuperabilidad y oportunidad de cobro.

### 135010 - Retenciones sobre contratos de prestación de servicios

| Atributo | Valor |
|---|---|
| Codigo | `135010` |
| Nombre | Retenciones sobre contratos de prestación de servicios |
| Cuenta Russell / 4D | Retención sobre contratos |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1350` |
| Critica | no |

**Que incluye:** Retención en garantía descontada a la entidad sobre contratos de prestación de servicios, retenida hasta el cumplimiento y reembolsable al final del contrato.

**Que no incluye:** Retenciones sobre contratos de construcción (135005). Retención en la fuente (135515). Cartera de servicios (130505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Retención en garantía servicios por cobrar, retegarantía de servicios, retención sobre contratos de servicios, garantía retenida en servicios, retención contractual de servicios.

**Soportes o terceros esperados:** Contrato de servicios, soporte de la retención, condiciones de devolución.

**Soportes de control recomendados:** Contrato, contratante, porcentaje, condición de devolución.

**Observaciones de homologacion:** Derecho de cobro condicionado al cumplimiento del contrato. Distinguir de la retención en la fuente (135515). Evaluar recuperabilidad.

### 135095 - Otras retenciones sobre contratos

| Atributo | Valor |
|---|---|
| Codigo | `135095` |
| Nombre | Otras retenciones sobre contratos |
| Cuenta Russell / 4D | Retención sobre contratos |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1350` |
| Critica | no |

**Que incluye:** Otras retenciones en garantía sobre contratos no clasificadas en construcción o servicios.

**Que no incluye:** Retenciones sobre construcción (135005) o servicios (135010). Retención en la fuente (135515).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otras retenciones sobre contratos, retención en garantía otros contratos, retegarantía diversa, garantía retenida otros contratos.

**Soportes o terceros esperados:** Contrato, soporte de la retención, condiciones de devolución.

**Soportes de control recomendados:** Contrato, contratante, condición de devolución.

**Observaciones de homologacion:** Cuenta residual de retenciones en garantía sobre contratos. Reclasificar a subcuenta específica si aplica. Evaluar recuperabilidad.

### 135505 - Anticipo impuesto de renta

| Atributo | Valor |
|---|---|
| Codigo | `135505` |
| Nombre | Anticipo impuesto de renta |
| Cuenta Russell / 4D | Anticipo de impuestos y saldos a favor |
| Tipo de rubro | Anticipos de impuestos / saldos a favor |
| Naturaleza | Debito (`D`) |
| Padre logico | `1355` |
| Critica | no |

**Que incluye:** Anticipo del impuesto de renta liquidado en la declaración para la vigencia siguiente, como activo a aplicar contra el impuesto futuro.

**Que no incluye:** Retención en la fuente a favor (135515). Saldos a favor en liquidaciones (135520). Impuesto de renta por pagar (pasivo 240405). Impuesto diferido activo (171076).

**Cuentas o nombres de cliente que podrian llegar aqui:** Anticipo de renta, anticipo impuesto de renta, anticipo de impuesto sobre la renta, anticipo renta vigencia siguiente, anticipo del impuesto.

**Soportes o terceros esperados:** Declaración de renta, liquidación del anticipo, soporte de pago.

**Soportes de control recomendados:** Vigencia, valor.

**Observaciones de homologacion:** Activo que se cruza contra el impuesto de renta de la vigencia siguiente. Distinguir del anticipo de retenciones (135515). Conciliar con la declaración. Verificar aplicación en la siguiente vigencia.

### 135510 - Anticipo impuesto de industria y comercio

| Atributo | Valor |
|---|---|
| Codigo | `135510` |
| Nombre | Anticipo impuesto de industria y comercio |
| Cuenta Russell / 4D | Anticipo de impuestos y saldos a favor |
| Tipo de rubro | Anticipos de impuestos / saldos a favor |
| Naturaleza | Debito (`D`) |
| Padre logico | `1355` |
| Critica | no |

**Que incluye:** Anticipo del impuesto de industria y comercio (ICA) liquidado para la vigencia siguiente, como activo a aplicar, según normativa municipal que lo establezca.

**Que no incluye:** ReteICA a favor (135518). ICA por pagar (pasivo 241205). Saldos a favor (135520).

**Cuentas o nombres de cliente que podrian llegar aqui:** Anticipo de ICA, anticipo industria y comercio, anticipo ICA vigencia siguiente, anticipo del impuesto municipal.

**Soportes o terceros esperados:** Declaración de ICA, liquidación del anticipo, soporte de pago, normativa municipal.

**Soportes de control recomendados:** Municipio, vigencia, valor.

**Observaciones de homologacion:** Aplica según el municipio que establezca anticipo de ICA. Cruzar contra el ICA de la vigencia siguiente. Distinguir del reteICA a favor (135518).

### 135515 - Retención en la fuente a favor

| Atributo | Valor |
|---|---|
| Codigo | `135515` |
| Nombre | Retención en la fuente a favor |
| Cuenta Russell / 4D | Anticipo de impuestos y saldos a favor |
| Tipo de rubro | Anticipos de impuestos / saldos a favor |
| Naturaleza | Debito (`D`) |
| Padre logico | `1355` |
| Critica | no |

**Que incluye:** Retención en la fuente de renta que terceros le practicaron a la entidad, como anticipo del impuesto de renta a descontar en la declaración. Transversal: retenciones sobre ventas, servicios, rendimientos.

**Que no incluye:** Retención que la entidad practica a terceros (pasivo 2365). Anticipo de renta (135505). ReteIVA/reteICA a favor (135517/135518). Saldos a favor (135520).

**Cuentas o nombres de cliente que podrian llegar aqui:** Retención en la fuente a favor, retefuente a favor, retenciones que nos practicaron, anticipo de retención, retención practicada por clientes, autorretención (si se maneja como anticipo), retención sufrida.

**Soportes o terceros esperados:** Certificados de retención emitidos por los agentes retenedores, declaración de renta, conciliación de retenciones.

**Soportes de control recomendados:** Agente retenedor, concepto, vigencia.

**Observaciones de homologacion:** Anticipo del impuesto de renta a descontar. Conciliar con los certificados de retención recibidos. Distinguir de la retención que la entidad practica (pasivo). Verificar soporte (certificados) para su procedencia.

### 135517 - IVA retenido a favor

| Atributo | Valor |
|---|---|
| Codigo | `135517` |
| Nombre | IVA retenido a favor |
| Cuenta Russell / 4D | Anticipo de impuestos y saldos a favor |
| Tipo de rubro | Anticipos de impuestos / saldos a favor |
| Naturaleza | Debito (`D`) |
| Padre logico | `1355` |
| Critica | no |

**Que incluye:** Retención de IVA (reteIVA) que terceros le practicaron a la entidad, como anticipo a descontar en la declaración de IVA.

**Que no incluye:** ReteIVA que la entidad practica (pasivo 236705). IVA descontable (240810). Retención de renta a favor (135515). Saldos a favor de IVA (135520).

**Cuentas o nombres de cliente que podrian llegar aqui:** IVA retenido a favor, reteIVA a favor, retención de IVA que nos practicaron, reteIVA sufrido, IVA retenido por clientes.

**Soportes o terceros esperados:** Certificados de reteIVA, declaración de IVA, conciliación.

**Soportes de control recomendados:** Agente retenedor, periodo.

**Observaciones de homologacion:** Anticipo a descontar en la declaración de IVA. Conciliar con certificados recibidos. Distinguir del reteIVA que la entidad practica (pasivo 236705).

### 135518 - ICA retenido a favor

| Atributo | Valor |
|---|---|
| Codigo | `135518` |
| Nombre | ICA retenido a favor |
| Cuenta Russell / 4D | Anticipo de impuestos y saldos a favor |
| Tipo de rubro | Anticipos de impuestos / saldos a favor |
| Naturaleza | Debito (`D`) |
| Padre logico | `1355` |
| Critica | no |

**Que incluye:** Retención de ICA (reteICA) que terceros le practicaron a la entidad, como anticipo a descontar en la declaración municipal de ICA.

**Que no incluye:** ReteICA que la entidad practica (pasivo 236805). ICA por pagar (241205). Anticipo de ICA (135510). Retención de renta a favor (135515).

**Cuentas o nombres de cliente que podrian llegar aqui:** ICA retenido a favor, reteICA a favor, retención de ICA que nos practicaron, reteICA sufrido, ICA retenido por clientes.

**Soportes o terceros esperados:** Certificados de reteICA, declaración municipal, conciliación.

**Soportes de control recomendados:** Municipio, agente retenedor, periodo.

**Observaciones de homologacion:** Anticipo a descontar en la declaración de ICA del municipio. Conciliar con certificados. Distinguir del reteICA que la entidad practica (pasivo 236805) y del anticipo de ICA (135510).

### 135520 - Saldos a favor en liquidaciones privadas

| Atributo | Valor |
|---|---|
| Codigo | `135520` |
| Nombre | Saldos a favor en liquidaciones privadas |
| Cuenta Russell / 4D | Anticipo de impuestos y saldos a favor |
| Tipo de rubro | Anticipos de impuestos / saldos a favor |
| Naturaleza | Debito (`D`) |
| Padre logico | `1355` |
| Critica | no |

**Que incluye:** Saldos a favor determinados en las declaraciones tributarias (renta, IVA) susceptibles de devolución, compensación o imputación a periodos siguientes.

**Que no incluye:** Retenciones y anticipos individuales (135505-135518). Impuestos por pagar (pasivo). Impuestos descontables (135530).

**Cuentas o nombres de cliente que podrian llegar aqui:** Saldos a favor, saldo a favor en renta, saldo a favor en IVA, saldo a favor por compensar, saldo a favor por devolver, saldo a favor liquidación privada, saldo a favor imputable.

**Soportes o terceros esperados:** Declaración tributaria, solicitud de devolución/compensación, resolución DIAN.

**Soportes de control recomendados:** Impuesto, vigencia, destino (devolución/compensación/imputación).

**Observaciones de homologacion:** Evaluar recuperabilidad y oportunidad (devolución/compensación). Verificar términos de prescripción del derecho. Conciliar con las declaraciones. Saldos a favor antiguos sin gestionar son riesgo de no recuperación.

### 135530 - Impuestos descontables

| Atributo | Valor |
|---|---|
| Codigo | `135530` |
| Nombre | Impuestos descontables |
| Cuenta Russell / 4D | Anticipo de impuestos y saldos a favor |
| Tipo de rubro | Anticipos de impuestos / saldos a favor |
| Naturaleza | Debito (`D`) |
| Padre logico | `1355` |
| Critica | no |

**Que incluye:** Impuestos descontables registrados como activo según el manejo del plan de cuentas (cuando no se manejan en el grupo de IVA por pagar): IVA descontable u otros impuestos con derecho a descuento pendientes de aplicar.

**Que no incluye:** IVA descontable manejado en 240810. Retenciones a favor (135515-135518). Saldos a favor (135520).

**Cuentas o nombres de cliente que podrian llegar aqui:** Impuestos descontables, IVA descontable (activo), descuentos tributarios, impuestos con derecho a descuento, crédito fiscal por aplicar.

**Soportes o terceros esperados:** Facturas de compra, declaración, soporte del descuento.

**Soportes de control recomendados:** Impuesto, periodo.

**Observaciones de homologacion:** Verificar el manejo en el plan de cuentas (algunos lo llevan en 2408, otros como activo en 1355). Validar requisitos de descontabilidad. Evitar doble registro con 240810. Conciliar con la declaración.

### 135595 - Otros anticipos de impuestos y saldos a favor

| Atributo | Valor |
|---|---|
| Codigo | `135595` |
| Nombre | Otros anticipos de impuestos y saldos a favor |
| Cuenta Russell / 4D | Anticipo de impuestos y saldos a favor |
| Tipo de rubro | Anticipos de impuestos / saldos a favor |
| Naturaleza | Debito (`D`) |
| Padre logico | `1355` |
| Critica | no |

**Que incluye:** Otros anticipos de impuestos y saldos a favor no clasificados: anticipos de otros tributos, saldos a favor de impuestos territoriales, otros créditos fiscales.

**Que no incluye:** Conceptos con subcuenta específica (anticipo renta/ICA, retenciones a favor, saldos a favor, descontables). Impuestos por pagar (pasivo).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros anticipos de impuestos, otros saldos a favor, anticipos tributarios varios, créditos fiscales varios, saldos a favor territoriales.

**Soportes o terceros esperados:** Declaración/liquidación, soporte de pago, conciliación.

**Soportes de control recomendados:** Impuesto, vigencia.

**Observaciones de homologacion:** Cuenta residual de activos tributarios. Reclasificar a subcuenta específica si aplica. Evaluar recuperabilidad.

### 136005 - Reclamaciones a compañías aseguradoras

| Atributo | Valor |
|---|---|
| Codigo | `136005` |
| Nombre | Reclamaciones a compañías aseguradoras |
| Cuenta Russell / 4D | Reclamaciones |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1360` |
| Critica | no |

**Que incluye:** Derechos de cobro por reclamaciones presentadas a compañías de seguros por siniestros amparados: indemnizaciones por pérdida de activos, lucro cesante, daños cubiertos, una vez es probable su recaudo.

**Que no incluye:** Otras reclamaciones (136095). Seguros pagados por anticipado (170520). El ingreso/recuperación por la indemnización (4250). Pérdida del activo siniestrado (gasto/baja).

**Cuentas o nombres de cliente que podrian llegar aqui:** Reclamaciones a aseguradoras, indemnización de seguros por cobrar, reclamación de siniestro, siniestro por cobrar, indemnización por cobrar, reclamación de póliza, recobro de seguro.

**Soportes o terceros esperados:** Póliza, reclamación presentada, soporte del siniestro, comunicación de la aseguradora, ajuste del perito.

**Soportes de control recomendados:** Aseguradora, póliza, siniestro, estado de la reclamación.

**Observaciones de homologacion:** Reconocer cuando el recaudo es prácticamente cierto (no antes). Evaluar recuperabilidad según respuesta de la aseguradora. Distinguir la reclamación (derecho) de la baja del activo siniestrado (que se reconoce independientemente). Riesgo de sobreestimación si la reclamación es incierta.

### 136095 - Otras reclamaciones

| Atributo | Valor |
|---|---|
| Codigo | `136095` |
| Nombre | Otras reclamaciones |
| Cuenta Russell / 4D | Reclamaciones |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1360` |
| Critica | no |

**Que incluye:** Otras reclamaciones por cobrar no relacionadas con aseguradoras: reclamaciones a proveedores por garantía/calidad, reclamaciones a transportadores por mercancía dañada, reclamaciones a entidades.

**Que no incluye:** Reclamaciones a aseguradoras (136005). Cartera de clientes (1305). Deudores varios (1380).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otras reclamaciones, reclamaciones a proveedores, reclamación por garantía, reclamación a transportador, reclamación por mercancía dañada, reclamaciones diversas, reclamación de calidad.

**Soportes o terceros esperados:** Reclamación presentada, soporte del hecho, comunicación del tercero.

**Soportes de control recomendados:** Tercero, concepto, estado de la reclamación.

**Observaciones de homologacion:** Reconocer cuando el recaudo es probable. Evaluar recuperabilidad. Depurar reclamaciones antiguas sin respuesta. Distinguir de cartera comercial y deudores varios.

### 136595 - Cuentas por cobrar a trabajadores - otros

| Atributo | Valor |
|---|---|
| Codigo | `136595` |
| Nombre | Cuentas por cobrar a trabajadores - otros |
| Cuenta Russell / 4D | Cuentas por cobrar a trabajadores |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1365` |
| Critica | no |

**Que incluye:** Préstamos y deudas de trabajadores con plan de pago vía descuento de nómina: préstamos a empleados, créditos de vivienda/calamidad, ventas a crédito a empleados, deudas por descontar.

**Que no incluye:** Anticipos de nómina por legalizar (133015). Salarios por pagar (pasivo). Embargos (pasivo 237025). Libranzas de terceros (pasivo 237030).

**Cuentas o nombres de cliente que podrian llegar aqui:** Cuentas por cobrar a trabajadores, préstamos a empleados, créditos a trabajadores, deudas de empleados, préstamo de calamidad, préstamo de vivienda empleado, ventas a crédito a empleados, deudor empleado.

**Soportes o terceros esperados:** Autorización del préstamo, plan de pago, autorización de descuento de nómina, conciliación.

**Soportes de control recomendados:** Empleado, concepto, plan de pago, saldo.

**Observaciones de homologacion:** Distinguir de los anticipos por legalizar (133015): aquí hay préstamo con plan de pago. Verificar autorización de descuento de nómina y límites legales. Evaluar recuperabilidad e intereses (tasa de mercado, beneficio a empleados).

### 137005 - Préstamos a particulares con garantía real

| Atributo | Valor |
|---|---|
| Codigo | `137005` |
| Nombre | Préstamos a particulares con garantía real |
| Cuenta Russell / 4D | Préstamos a particulares |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1370` |
| Critica | no |

**Que incluye:** Préstamos otorgados a terceros particulares (no vinculados, no socios, no empleados) respaldados con garantía real (hipoteca, prenda). Generan intereses.

**Que no incluye:** Préstamos con garantía personal (137010). Cartera de crédito de entidades financieras (giro, otra clasificación). Préstamos a vinculados (132005), socios (1325), trabajadores (136595).

**Cuentas o nombres de cliente que podrian llegar aqui:** Préstamos a particulares con garantía real, préstamo con hipoteca, préstamo con prenda, mutuo con garantía real, crédito a tercero con garantía, préstamo respaldado.

**Soportes o terceros esperados:** Contrato de mutuo, garantía real (hipoteca/prenda), pagaré, soporte de desembolso.

**Soportes de control recomendados:** Deudor, garantía, tasa, plazo.

**Observaciones de homologacion:** Verificar tasa de mercado e intereses gravables. Evaluar recuperabilidad y valor de la garantía. En entidades no financieras, préstamos recurrentes a terceros pueden indicar actividad financiera no autorizada (revisar objeto social). Validar que el deudor no sea parte relacionada (NIA 550).

### 137010 - Préstamos a particulares con garantía personal

| Atributo | Valor |
|---|---|
| Codigo | `137010` |
| Nombre | Préstamos a particulares con garantía personal |
| Cuenta Russell / 4D | Préstamos a particulares |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1370` |
| Critica | no |

**Que incluye:** Préstamos otorgados a terceros particulares respaldados solo con garantía personal (firma, codeudor), sin garantía real. Generan intereses.

**Que no incluye:** Préstamos con garantía real (137005). Cartera de crédito (giro financiero). Préstamos a vinculados/socios/trabajadores.

**Cuentas o nombres de cliente que podrian llegar aqui:** Préstamos a particulares con garantía personal, préstamo sin garantía real, mutuo con firma, préstamo con codeudor, crédito personal a tercero, préstamo quirografario.

**Soportes o terceros esperados:** Contrato de mutuo, pagaré, soporte de desembolso, garantía personal.

**Soportes de control recomendados:** Deudor, tasa, plazo, garantía.

**Observaciones de homologacion:** Mayor riesgo de recuperación al no tener garantía real. Verificar tasa de mercado y deterioro (NIIF 9). Validar que el deudor no sea parte relacionada disfrazada. Préstamos recurrentes pueden indicar actividad ajena al objeto social.

### 138020 - Cuentas por cobrar de terceros

| Atributo | Valor |
|---|---|
| Codigo | `138020` |
| Nombre | Cuentas por cobrar de terceros |
| Cuenta Russell / 4D | Deudores varios |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1380` |
| Critica | no |

**Que incluye:** Derechos de cobro frente a terceros por operaciones no comerciales ni clasificables en otras subcuentas: valores a cargo de terceros, cuentas por cobrar por operaciones diversas, recaudos a cargo de terceros.

**Que no incluye:** Cartera de clientes (1305). Pagos por cuenta de terceros (138025). Otros deudores (138095). Cuentas por cobrar específicas (vinculados, socios, trabajadores).

**Cuentas o nombres de cliente que podrian llegar aqui:** Cuentas por cobrar de terceros, deudores terceros, valores a cargo de terceros, cuentas por cobrar diversas, recaudos a cargo de terceros, cuentas por cobrar varias.

**Soportes o terceros esperados:** Soporte de la operación, identificación del tercero, conciliación.

**Soportes de control recomendados:** Tercero, concepto, antigüedad.

**Observaciones de homologacion:** Evaluar naturaleza y recuperabilidad. Distinguir de pagos por cuenta de terceros (138025) y otros deudores (138095). Depurar saldos antiguos sin identificar.

### 138025 - Pagos por cuenta de terceros

| Atributo | Valor |
|---|---|
| Codigo | `138025` |
| Nombre | Pagos por cuenta de terceros |
| Cuenta Russell / 4D | Deudores varios |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1380` |
| Critica | no |

**Que incluye:** Pagos efectuados por la entidad a nombre o por cuenta de terceros, pendientes de reembolso: gastos asumidos por cuenta de un tercero, pagos a reembolsar por vinculados/clientes, desembolsos recuperables.

**Que no incluye:** Anticipos a proveedores (133005). Préstamos (1370). Cuentas por cobrar de terceros (138020). Otros deudores (138095).

**Cuentas o nombres de cliente que podrian llegar aqui:** Pagos por cuenta de terceros, gastos por reembolsar, desembolsos por cuenta de terceros, pagos a recuperar, gastos asumidos a reembolsar, pagos recuperables.

**Soportes o terceros esperados:** Soporte del pago, identificación del tercero responsable, acuerdo de reembolso.

**Soportes de control recomendados:** Tercero, concepto, antigüedad.

**Observaciones de homologacion:** Verificar acuerdo de reembolso y recuperabilidad. Si el tercero es vinculado, revelar (NIC 24). Depurar pagos antiguos sin reembolsar (pueden ser gasto propio mal clasificado, riesgo).

### 138095 - Otros deudores

| Atributo | Valor |
|---|---|
| Codigo | `138095` |
| Nombre | Otros deudores |
| Cuenta Russell / 4D | Deudores varios |
| Tipo de rubro | Cuentas por cobrar |
| Naturaleza | Debito (`D`) |
| Padre logico | `1380` |
| Critica | no |

**Que incluye:** Otros derechos de cobro no clasificados en ninguna subcuenta específica de deudores: faltantes por cobrar, responsabilidades por establecer, deudores diversos, partidas por identificar deudoras.

**Que no incluye:** Cualquier deudor con cuenta específica (clientes, vinculados, socios, anticipos, ingresos por cobrar, reclamaciones, trabajadores, particulares, pagos por cuenta de terceros). Anticipos de impuestos (1355).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros deudores, deudores varios, faltantes por cobrar, responsabilidades por establecer, deudores diversos, partidas por aplicar deudoras, cuentas por cobrar varias, deudores por identificar.

**Soportes o terceros esperados:** Soporte de la operación, identificación del deudor, conciliación.

**Soportes de control recomendados:** Deudor, concepto, antigüedad.

**Observaciones de homologacion:** Cuenta residual de deudores: vigilar saldos antiguos sin identificar (riesgo de activos inexistentes o sobreestimados). Depurar y reclasificar periódicamente. Foco de auditoría. Faltantes pueden indicar deficiencias de control (NIA 265) o fraude (NIA 240).

### 139905 - Deterioro de clientes

| Atributo | Valor |
|---|---|
| Codigo | `139905` |
| Nombre | Deterioro de clientes |
| Cuenta Russell / 4D | Deterioro / provisiones de deudores |
| Tipo de rubro | Deudores (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1399` |
| Critica | no |

**Que incluye:** Deterioro acumulado de la cartera de clientes (cuenta correctora de naturaleza crédito que minora el valor de los clientes): pérdida esperada por incobrabilidad estimada según antigüedad y experiencia (NIIF 9 modelo de pérdida esperada / matriz de provisiones).

**Que no incluye:** La cartera bruta de clientes (1305). Deterioro de otras cuentas por cobrar (139920-139975). El gasto por deterioro del periodo (519910). Cartera castigada/dada de baja.

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro de cartera, provisión de cartera, deterioro de clientes, provisión de clientes, deterioro de cuentas por cobrar comerciales, provisión de incobrables, estimación de incobrabilidad, deterioro cartera clientes.

**Soportes o terceros esperados:** Análisis de antigüedad de cartera, matriz de provisiones, política de deterioro, cálculo de pérdida esperada (NIIF 9).

**Soportes de control recomendados:** Cliente, antigüedad, tasa de deterioro, sector.

**Observaciones de homologacion:** Cuenta correctora (crédito) que minora el activo. Modelo de pérdida esperada (NIIF 9), no de pérdida incurrida. Verificar matriz de provisiones por antigüedad y razonabilidad de las tasas (NIA 540). El gasto del periodo va a 519910. En salud, considerar glosas en la estimación. Evaluar sesgo de la administración.

### 139920 - Deterioro cuentas por cobrar a vinculados económicos

| Atributo | Valor |
|---|---|
| Codigo | `139920` |
| Nombre | Deterioro cuentas por cobrar a vinculados económicos |
| Cuenta Russell / 4D | Deterioro / provisiones de deudores |
| Tipo de rubro | Deudores (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1399` |
| Critica | no |

**Que incluye:** Deterioro acumulado de las cuentas por cobrar a vinculados económicos (cuenta correctora crédito), por pérdida esperada estimada (NIIF 9).

**Que no incluye:** Las cuentas por cobrar a vinculados brutas (132005). Deterioro de clientes (139905) u otros deudores. Gasto del periodo (519910).

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro de vinculados, provisión cuentas por cobrar vinculados, deterioro intercompañía, provisión de cartera vinculados, deterioro cuentas por cobrar grupo.

**Soportes o terceros esperados:** Análisis de recuperabilidad, estados financieros del vinculado, cálculo de pérdida esperada.

**Soportes de control recomendados:** Vinculado, antigüedad, recuperabilidad.

**Observaciones de homologacion:** Cuenta correctora. Evaluar recuperabilidad considerando la situación del vinculado (NIIF 9). En consolidación, el deterioro de saldos intragrupo se elimina. Revelar como parte relacionada. Atención a deterioros que encubran pérdidas no reconocidas.

### 139925 - Deterioro cuentas por cobrar a socios y accionistas

| Atributo | Valor |
|---|---|
| Codigo | `139925` |
| Nombre | Deterioro cuentas por cobrar a socios y accionistas |
| Cuenta Russell / 4D | Deterioro / provisiones de deudores |
| Tipo de rubro | Deudores (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1399` |
| Critica | no |

**Que incluye:** Deterioro acumulado de las cuentas por cobrar a socios y accionistas (cuenta correctora crédito).

**Que no incluye:** Las cuentas por cobrar a socios/accionistas brutas (1325). Otros deterioros de deudores. Gasto del periodo (519910).

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro de socios, provisión cuentas por cobrar socios, deterioro de accionistas, provisión de cartera socios y accionistas.

**Soportes o terceros esperados:** Análisis de recuperabilidad, cálculo de deterioro.

**Soportes de control recomendados:** Socio/accionista, antigüedad.

**Observaciones de homologacion:** Cuenta correctora. Un deterioro de cuentas por cobrar a socios puede indicar que el saldo era irrecuperable (retiro encubierto). Evaluar con cuidado la naturaleza original del saldo. Revelar como parte relacionada.

### 139930 - Deterioro de anticipos y avances

| Atributo | Valor |
|---|---|
| Codigo | `139930` |
| Nombre | Deterioro de anticipos y avances |
| Cuenta Russell / 4D | Deterioro / provisiones de deudores |
| Tipo de rubro | Deudores (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1399` |
| Critica | no |

**Que incluye:** Deterioro acumulado de anticipos y avances (cuenta correctora crédito) cuando el anticipo entregado se torna irrecuperable o el bien/servicio no será recibido.

**Que no incluye:** Los anticipos brutos (1330). Otros deterioros de deudores. Gasto del periodo (519910).

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro de anticipos, provisión de anticipos, deterioro de avances, provisión anticipos a proveedores/contratistas irrecuperables.

**Soportes o terceros esperados:** Análisis de recuperabilidad, soporte del anticipo, evidencia de incumplimiento.

**Soportes de control recomendados:** Tercero, antigüedad, recuperabilidad.

**Observaciones de homologacion:** Cuenta correctora. Reconocer cuando el anticipo se torna irrecuperable (proveedor/contratista que no entregará). Anticipos antiguos sin legalizar son candidatos a deterioro. Evaluar si debe darse de baja.

### 139945 - Deterioro de ingresos por cobrar

| Atributo | Valor |
|---|---|
| Codigo | `139945` |
| Nombre | Deterioro de ingresos por cobrar |
| Cuenta Russell / 4D | Deterioro / provisiones de deudores |
| Tipo de rubro | Deudores (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1399` |
| Critica | no |

**Que incluye:** Deterioro acumulado de ingresos por cobrar (cuenta correctora crédito): deterioro de intereses, honorarios, servicios, arrendamientos por cobrar de dudoso recaudo.

**Que no incluye:** Los ingresos por cobrar brutos (1345). Otros deterioros de deudores. Gasto del periodo (519910).

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro de ingresos por cobrar, provisión de intereses por cobrar, deterioro de honorarios/servicios por cobrar, provisión de arrendamientos por cobrar.

**Soportes o terceros esperados:** Análisis de recuperabilidad, cálculo de deterioro.

**Soportes de control recomendados:** Concepto, deudor, antigüedad.

**Observaciones de homologacion:** Cuenta correctora. Evaluar recuperabilidad de los ingresos devengados no recaudados (NIIF 9). Reconocer pérdida esperada. El gasto del periodo va a 519910.

### 139975 - Deterioro de otros deudores

| Atributo | Valor |
|---|---|
| Codigo | `139975` |
| Nombre | Deterioro de otros deudores |
| Cuenta Russell / 4D | Deterioro / provisiones de deudores |
| Tipo de rubro | Deudores (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1399` |
| Critica | no |

**Que incluye:** Deterioro acumulado de otros deudores (cuenta correctora crédito): deterioro de reclamaciones, préstamos a particulares, deudores varios de dudoso recaudo.

**Que no incluye:** Los otros deudores brutos (1360/1370/1380). Deterioros con subcuenta específica. Gasto del periodo (519910).

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro de otros deudores, provisión de deudores varios, deterioro de reclamaciones, deterioro de préstamos a particulares, provisión de deudores diversos.

**Soportes o terceros esperados:** Análisis de recuperabilidad, cálculo de deterioro.

**Soportes de control recomendados:** Deudor, concepto, antigüedad.

**Observaciones de homologacion:** Cuenta correctora residual de deterioro de deudores. Evaluar recuperabilidad (NIIF 9). Deudores varios antiguos son candidatos a deterioro o baja. El gasto del periodo va a 519910.

### 140505 - Materias primas

| Atributo | Valor |
|---|---|
| Codigo | `140505` |
| Nombre | Materias primas |
| Cuenta Russell / 4D | Materias primas |
| Tipo de rubro | Inventarios |
| Naturaleza | Debito (`D`) |
| Padre logico | `1405` |
| Critica | no |

**Que incluye:** Materias primas e insumos directos destinados a la transformación en el proceso productivo, valuados al costo o VNR (NIC 2). Manufactura: insumos de producción (acero, textiles, químicos, harinas, componentes). Agroindustria: insumos de proceso. Construcción (producción propia de elementos): materias primas. Alimentos/bebidas: ingredientes.

**Que no incluye:** Productos en proceso (141005). Producto terminado (143005). Mercancía no fabricada para reventa (143505). Materiales, repuestos y accesorios de mantenimiento (145505). Envases y empaques (146005). Inventario en tránsito (146505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Materias primas, materia prima directa, insumos de producción, insumos directos, materiales directos, MP, materia prima en bodega, insumos de fabricación, materiales de transformación.

**Soportes o terceros esperados:** Kárdex, entradas de almacén, facturas de compra, soporte de valuación, inventario físico.

**Soportes de control recomendados:** Tipo de materia prima, bodega, método de valuación (PEPS/promedio).

**Observaciones de homologacion:** Valuar al menor entre costo y VNR (NIC 2). Método PEPS o promedio ponderado (UEPS no permitido). Verificar conteo físico (NIA 501) y conciliación con kárdex. Distinguir materia prima (se transforma) de materiales/repuestos (mantenimiento, 145505). Evaluar obsolescencia (149905).

### 141005 - Productos en proceso

| Atributo | Valor |
|---|---|
| Codigo | `141005` |
| Nombre | Productos en proceso |
| Cuenta Russell / 4D | Productos en proceso |
| Tipo de rubro | Inventarios |
| Naturaleza | Debito (`D`) |
| Padre logico | `1410` |
| Critica | no |

**Que incluye:** Productos en proceso de fabricación al cierre, que incluyen materia prima, mano de obra y CIF aplicados hasta el grado de avance (NIC 2). Manufactura: producción en curso. Construcción de productos: obra/elementos en proceso. Agroindustria: producto en proceso de transformación.

**Que no incluye:** Materias primas sin procesar (140505). Producto terminado (143005). Obra de construcción de contratos (costo de contrato 7405 / activo de contrato según NIIF 15). Costos de producción del periodo (clase 7).

**Cuentas o nombres de cliente que podrian llegar aqui:** Productos en proceso, producción en proceso, inventario en proceso, obra en proceso (producción), producto semielaborado, producción en curso, WIP, work in process, producto en fabricación.

**Soportes o terceros esperados:** Hoja de costos por orden, costeo del proceso, inventario físico de proceso, grado de avance, sistema de costeo.

**Soportes de control recomendados:** Orden de producción, línea, grado de avance, elemento del costo.

**Observaciones de homologacion:** Valuar al costo acumulado (MP+MOD+CIF) hasta el grado de avance, limitado al VNR. Verificar sistema de costeo y prorrateo de CIF. El conteo físico de producto en proceso es complejo (NIA 501): validar grado de avance. Distinguir de la obra de contratos de construcción (NIIF 15).

### 143005 - Productos terminados

| Atributo | Valor |
|---|---|
| Codigo | `143005` |
| Nombre | Productos terminados |
| Cuenta Russell / 4D | Productos terminados |
| Tipo de rubro | Inventarios |
| Naturaleza | Debito (`D`) |
| Padre logico | `1430` |
| Critica | no |

**Que incluye:** Productos terminados fabricados por la entidad disponibles para la venta, valuados al costo de producción o VNR (NIC 2). Manufactura: producto final en bodega. Alimentos/bebidas/farmacéutica: producto terminado. Agroindustria: producto procesado terminado.

**Que no incluye:** Mercancía comprada para reventa sin transformar (143505). Productos en proceso (141005). Materias primas (140505). Producto despachado/vendido (baja por costo de ventas).

**Cuentas o nombres de cliente que podrian llegar aqui:** Productos terminados, producto terminado, inventario de producto terminado, producción terminada, producto final, mercancía fabricada, producto disponible para venta, stock de producto propio, PT.

**Soportes o terceros esperados:** Kárdex, hoja de costos del producto, inventario físico, soporte de valuación.

**Soportes de control recomendados:** Línea de producto, bodega, método de valuación, lote/vencimiento.

**Observaciones de homologacion:** Valuar al menor entre costo de producción y VNR (NIC 2). Verificar conteo físico (NIA 501) y costeo. Distinguir producto fabricado (143005) de mercancía comprada para reventa (143505). En alimentos/farma, controlar lotes y vencimientos (obsolescencia, 149905). El costo se reconoce al vender (correlación con ingreso).

### 143505 - Mercancías no fabricadas por la empresa

| Atributo | Valor |
|---|---|
| Codigo | `143505` |
| Nombre | Mercancías no fabricadas por la empresa |
| Cuenta Russell / 4D | Mercancías no fabricadas por la empresa |
| Tipo de rubro | Inventarios |
| Naturaleza | Debito (`D`) |
| Padre logico | `1435` |
| Critica | no |

**Que incluye:** Mercancías compradas para reventa sin transformación (giro comercial), valuadas al costo de adquisición o VNR. Retail/comercio: mercancía para la venta, surtido de tienda. Distribuidores: producto para distribución. Droguerías: medicamentos para venta. Ferreterías: productos para reventa.

**Que no incluye:** Producto fabricado por la entidad (143005). Materias primas (140505). Materiales y repuestos de uso propio (145505). Mercancía en tránsito (146505). Mercancía de terceros en consignación recibida (cuentas de orden 9110).

**Cuentas o nombres de cliente que podrian llegar aqui:** Mercancías no fabricadas, mercancía para la venta, inventario de mercancía, mercancía de reventa, surtido, stock de tienda, producto para distribución, mercancía comprada, inventario comercial, mercancía disponible para venta, medicamentos para venta.

**Soportes o terceros esperados:** Kárdex, facturas de compra, entradas de almacén, inventario físico, soporte de valuación.

**Soportes de control recomendados:** Línea de producto, bodega/tienda, método de valuación, lote/vencimiento.

**Observaciones de homologacion:** Valuar al menor entre costo y VNR (NIC 2). Costo de adquisición incluye fletes y costos de importación capitalizables. Verificar conteo físico y conciliación con kárdex (NIA 501). Distinguir de producto fabricado (143005). La mercancía de terceros en consignación NO es inventario propio (orden 9110). Evaluar obsolescencia.

### 145505 - Materiales, repuestos y accesorios

| Atributo | Valor |
|---|---|
| Codigo | `145505` |
| Nombre | Materiales, repuestos y accesorios |
| Cuenta Russell / 4D | Materiales, repuestos y accesorios |
| Tipo de rubro | Inventarios |
| Naturaleza | Debito (`D`) |
| Padre logico | `1455` |
| Critica | no |

**Que incluye:** Materiales, repuestos y accesorios para mantenimiento y operación (no para reventa ni transformación directa en producto): repuestos de maquinaria, accesorios, materiales de mantenimiento, dotación industrial. Manufactura: repuestos de planta. Transporte: repuestos de flota. Salud: repuestos de equipos biomédicos.

**Que no incluye:** Materias primas que se transforman (140505). Mercancía para reventa (143505). Envases y empaques (146005). Repuestos mayores capitalizables como PPE (1520). Materiales ya consumidos (gasto/costo).

**Cuentas o nombres de cliente que podrian llegar aqui:** Materiales, repuestos y accesorios, repuestos, inventario de repuestos, accesorios, materiales de mantenimiento, dotación industrial, suministros de operación, repuestos de flota, repuestos de maquinaria, consumibles.

**Soportes o terceros esperados:** Kárdex, facturas de compra, entradas de almacén, inventario físico, control de consumo.

**Soportes de control recomendados:** Tipo, bodega, equipo asociado, rotación.

**Observaciones de homologacion:** Distinguir de materia prima (se transforma) y de mercancía (se revende). Repuestos mayores con vida útil propia pueden ser PPE (1520). Verificar conteo físico. Repuestos de baja rotación son candidatos a deterioro por obsolescencia (149905). Se consumen como costo/gasto al usarse.

### 146005 - Envases y empaques

| Atributo | Valor |
|---|---|
| Codigo | `146005` |
| Nombre | Envases y empaques |
| Cuenta Russell / 4D | Envases y empaques |
| Tipo de rubro | Inventarios |
| Naturaleza | Debito (`D`) |
| Padre logico | `1460` |
| Critica | no |

**Que incluye:** Envases y empaques destinados a contener o empacar los productos: botellas, cajas, bolsas, etiquetas, empaques. Manufactura/alimentos/bebidas: material de empaque. Retail: empaques de despacho. Incluye envases retornables según política.

**Que no incluye:** Materias primas del producto (140505). Mercancía para reventa (143505). Materiales de mantenimiento (145505). Empaques ya consumidos (costo). Envases retornables que sean PPE (según política).

**Cuentas o nombres de cliente que podrian llegar aqui:** Envases y empaques, material de empaque, empaques, envases, etiquetas, cajas, bolsas, material de embalaje, packaging, envases retornables, material de envasado.

**Soportes o terceros esperados:** Kárdex, facturas de compra, inventario físico, control de consumo.

**Soportes de control recomendados:** Tipo, producto asociado, bodega, retornable/no retornable.

**Observaciones de homologacion:** Distinguir de materia prima. Los envases se incorporan al costo del producto al empacar. Envases retornables pueden tener tratamiento de PPE según política y vida útil. Verificar conteo y consumo. Evaluar obsolescencia (cambios de diseño/marca).

### 146505 - Inventarios en tránsito

| Atributo | Valor |
|---|---|
| Codigo | `146505` |
| Nombre | Inventarios en tránsito |
| Cuenta Russell / 4D | Inventarios en tránsito |
| Tipo de rubro | Inventarios |
| Naturaleza | Debito (`D`) |
| Padre logico | `1465` |
| Critica | no |

**Que incluye:** Inventarios adquiridos cuyo control ya es de la entidad pero que están en tránsito (no han llegado físicamente): importaciones en tránsito, mercancía/materia prima en camino, compras nacionales en tránsito según Incoterm. Importadores (manufactura, retail, salud).

**Que no incluye:** Inventario ya recibido en bodega (140505/143505 según tipo). Anticipos a proveedores (133005). Depósitos para importaciones (133505). Mercancía aún no controlada por la entidad (según Incoterm).

**Cuentas o nombres de cliente que podrian llegar aqui:** Inventarios en tránsito, mercancía en tránsito, importaciones en tránsito, materia prima en tránsito, compras en tránsito, mercancía en camino, inventario en aduana, mercancía CIF en tránsito, productos en tránsito.

**Soportes o terceros esperados:** Factura del proveedor, documento de transporte (BL/AWB), Incoterm, declaración de importación, póliza de transporte.

**Soportes de control recomendados:** Tipo de inventario, importación, proveedor, Incoterm.

**Observaciones de homologacion:** Reconocer cuando el control se transfiere según el Incoterm (no necesariamente al recibir físicamente). Verificar corte de inventarios en tránsito al cierre (NIA 501). Al recibir, reclasificar a la cuenta de inventario respectiva. Incluye costos capitalizables (fletes, seguros) hasta la ubicación actual.

### 147005 - Mercancia en consignación

| Atributo | Valor |
|---|---|
| Codigo | `147005` |
| Nombre | Mercancia en consignación |
| Cuenta Russell / 4D | Mercancía en consignación |
| Tipo de rubro | Inventarios / control de bienes de terceros |
| Naturaleza | Debito (`D`) |
| Padre logico | `1470` |
| Critica | no |

**Que incluye:** Mercancía propia entregada a terceros en consignación para exhibición, custodia o venta por cuenta de la entidad, y mercancía recibida de terceros bajo contrato de consignación para control operativo. Para efectos de estados financieros, se reconoce como inventario únicamente la mercancía sobre la cual la entidad conserva o adquiere el control. Retail/comercio: productos ubicados en consignatarios o recibidos de proveedores en tienda. Salud/farma: medicamentos o insumos en consignación. Distribución: productos para venta comisionada.

**Que no incluye:** Mercancía comprada para reventa como inventario propio (143505). Inventario en tránsito pendiente de recepción/control (146505). Mercancía ya vendida o facturada al cliente final. Anticipos, depósitos o cuentas por cobrar/pagar asociados a consignación. Bienes de terceros recibidos en consignación cuando no se ha transferido el control, los cuales deben manejarse como control extracontable o cuentas de orden según política.

**Cuentas o nombres de cliente que podrian llegar aqui:** Mercancía en consignación, inventario en consignación, mercancía entregada en consignación, mercancía recibida en consignación, inventario en poder de terceros, stock en consignatario, mercancía de terceros en tienda, productos de proveedor en consignación, productos en exhibición, inventario para venta comisionada, mercancía consignada.

**Soportes o terceros esperados:** Contrato de consignación, actas o remisiones de entrega/recibo, kárdex de control, reportes de ventas del consignatario o al consignante, liquidaciones de comisión/facturación, conciliaciones con terceros, confirmaciones externas e inventarios físicos.

**Soportes de control recomendados:** Tercero/consignante/consignatario, ubicación, producto/lote, unidades entregadas o recibidas, unidades vendidas/devueltas, fecha de envío/recepción, responsable de custodia, condición de transferencia de control.

**Observaciones de homologacion:** Homologar en esta cuenta los movimientos de mercancía en consignación, separando analíticamente si es propia en poder de terceros o recibida de terceros. Bajo NIIF, la mercancía propia entregada en consignación permanece como inventario si la entidad conserva el control hasta la venta al cliente final; la mercancía recibida de terceros normalmente no se reconoce como activo propio si no se transfiere el control y debe controlarse extracontablemente o en cuentas de orden. Verificar corte de ventas, conciliaciones con terceros, confirmación de existencias (NIA 505/NIA 501), deterioro u obsolescencia y baja del inventario cuando ocurra la venta o transferencia de control.

### 149905 - Deterioro por obsolescencia de inventarios

| Atributo | Valor |
|---|---|
| Codigo | `149905` |
| Nombre | Deterioro por obsolescencia de inventarios |
| Cuenta Russell / 4D | Deterioro / provisiones de inventarios |
| Tipo de rubro | Inventarios (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1499` |
| Critica | no |

**Que incluye:** Deterioro acumulado de inventarios por obsolescencia (cuenta correctora crédito): ajuste al VNR de inventarios obsoletos, de baja rotación, vencidos, fuera de moda o tecnológicamente superados (NIC 2).

**Que no incluye:** El inventario bruto (1405-1465). Deterioro por diferencias de inventario (149910) o pérdidas (149915). El gasto/costo por deterioro del periodo. Inventario dado de baja (retiro).

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro por obsolescencia, provisión de obsolescencia, deterioro de inventarios obsoletos, provisión de inventario de baja rotación, ajuste a VNR, provisión de inventario vencido, deterioro de inventario fuera de moda.

**Soportes o terceros esperados:** Análisis de rotación/antigüedad, cálculo del VNR, política de obsolescencia, control de vencimientos.

**Soportes de control recomendados:** Producto, antigüedad/rotación, causa (obsolescencia/vencimiento), tasa.

**Observaciones de homologacion:** Cuenta correctora (crédito). Ajustar al menor entre costo y VNR (NIC 2). Reconocer por obsolescencia, baja rotación, vencimiento o deterioro tecnológico. En farma/alimentos, controlar vencimientos. Verificar razonabilidad de la estimación (NIA 540) y evitar sesgo. El gasto del periodo va a costo/gasto.

### 149910 - Deterioro por diferencias de inventario físico

| Atributo | Valor |
|---|---|
| Codigo | `149910` |
| Nombre | Deterioro por diferencias de inventario físico |
| Cuenta Russell / 4D | Deterioro / provisiones de inventarios |
| Tipo de rubro | Inventarios (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1499` |
| Critica | no |

**Que incluye:** Deterioro/ajuste acumulado por diferencias entre el inventario físico y el contable (faltantes detectados en conteos) pendientes de aclarar o ajustar.

**Que no incluye:** Deterioro por obsolescencia (149905). Deterioro por pérdidas confirmadas (149915). El inventario bruto. Ajustes ya aplicados al kárdex.

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro por diferencias de inventario, ajuste por diferencias físicas, provisión por faltantes de inventario, deterioro por descuadre de inventario, ajuste de conteo físico.

**Soportes o terceros esperados:** Acta de inventario físico, conciliación físico vs kárdex, análisis de diferencias.

**Soportes de control recomendados:** Producto, bodega, fecha de conteo, diferencia.

**Observaciones de homologacion:** Cuenta correctora. Las diferencias de inventario indican deficiencias de control (NIA 265) o posibles irregularidades (NIA 240). Investigar causa antes de ajustar. Faltantes recurrentes son señal de alerta. Conciliar físico vs contable al cierre (NIA 501).

### 149915 - Deterioro por pérdidas de inventarios

| Atributo | Valor |
|---|---|
| Codigo | `149915` |
| Nombre | Deterioro por pérdidas de inventarios |
| Cuenta Russell / 4D | Deterioro / provisiones de inventarios |
| Tipo de rubro | Inventarios (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1499` |
| Critica | no |

**Que incluye:** Deterioro/ajuste acumulado por pérdidas confirmadas de inventario: daños, mermas extraordinarias, hurtos, deterioro físico, siniestros (la parte no recuperable).

**Que no incluye:** Deterioro por obsolescencia (149905) o diferencias de conteo (149910). Mermas normales del proceso (costo). Pérdidas cubiertas por seguro (reclamación 136005). Inventario dado de baja.

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro por pérdidas de inventario, provisión por daños de inventario, deterioro por mermas, provisión por hurto de inventario, deterioro por siniestro, ajuste por pérdida de inventario.

**Soportes o terceros esperados:** Acta de pérdida/daño, soporte del siniestro, denuncia (hurto), informe técnico.

**Soportes de control recomendados:** Producto, causa (daño/hurto/siniestro), bodega.

**Observaciones de homologacion:** Cuenta correctora. Distinguir merma normal del proceso (costo) de pérdida extraordinaria (este rubro). Pérdidas por hurto/siniestro evaluar cobertura de seguro (136005). Pérdidas significativas indican deficiencias de control (NIA 265). Documentar causa y soporte.

### 150405 - Terrenos urbanos

| Atributo | Valor |
|---|---|
| Codigo | `150405` |
| Nombre | Terrenos urbanos |
| Cuenta Russell / 4D | Terrenos |
| Tipo de rubro | Propiedad, planta y equipo |
| Naturaleza | Debito (`D`) |
| Padre logico | `1504` |
| Critica | no |

**Que incluye:** Terrenos urbanos de propiedad de la entidad destinados a la operación o uso (no para venta): lotes donde se ubican plantas, oficinas, bodegas, sedes. Medidos al costo o modelo de revaluación (NIC 16). No se deprecian.

**Que no incluye:** Terrenos rurales (150410). Terrenos para la venta de constructoras (inventario 14xx). Propiedades de inversión (clasificación específica si genera renta). Construcciones sobre el terreno (1516). Valorizaciones (1910).

**Cuentas o nombres de cliente que podrian llegar aqui:** Terrenos urbanos, lotes urbanos, terreno de planta, terreno de sede, lote de bodega, terreno de oficinas, predio urbano, terreno propio urbano.

**Soportes o terceros esperados:** Escritura pública, certificado de tradición y libertad, avalúo, impuesto predial, soporte del costo.

**Soportes de control recomendados:** Predio, ubicación, uso, modelo (costo/revaluación).

**Observaciones de homologacion:** Los terrenos NO se deprecian (vida útil indefinida). Medir al costo o revaluación (NIC 16). Separar el terreno de la construcción (1516) para depreciación. En constructoras, los terrenos para desarrollo/venta son inventario, no PPE. Verificar titularidad (escritura). Evaluar deterioro (NIC 36).

### 150410 - Terrenos rurales

| Atributo | Valor |
|---|---|
| Codigo | `150410` |
| Nombre | Terrenos rurales |
| Cuenta Russell / 4D | Terrenos |
| Tipo de rubro | Propiedad, planta y equipo |
| Naturaleza | Debito (`D`) |
| Padre logico | `1504` |
| Critica | no |

**Que incluye:** Terrenos rurales de propiedad de la entidad destinados a la operación o uso: predios agrícolas/pecuarios, fincas productivas, lotes rurales de la operación. Medidos al costo o revaluación (NIC 16). No se deprecian.

**Que no incluye:** Terrenos urbanos (150405). Terrenos para venta (inventario). Activos biológicos sobre el terreno (NIC 41). Construcciones rurales (1516). Valorizaciones (1910).

**Cuentas o nombres de cliente que podrian llegar aqui:** Terrenos rurales, predios rurales, finca, lote rural, terreno agrícola, predio rural productivo, terreno pecuario, hacienda, terreno rústico.

**Soportes o terceros esperados:** Escritura pública, certificado de tradición y libertad, avalúo, impuesto predial.

**Soportes de control recomendados:** Predio, ubicación, uso (agrícola/pecuario), modelo.

**Observaciones de homologacion:** Los terrenos no se deprecian. En el sector agropecuario, distinguir el terreno (PPE) de los activos biológicos (NIC 41) y de los cultivos. Verificar titularidad. Evaluar deterioro (NIC 36).

### 150805 - Construcciones en curso

| Atributo | Valor |
|---|---|
| Codigo | `150805` |
| Nombre | Construcciones en curso |
| Cuenta Russell / 4D | Construcciones en curso |
| Tipo de rubro | Propiedad, planta y equipo |
| Naturaleza | Debito (`D`) |
| Padre logico | `1508` |
| Critica | no |

**Que incluye:** Costos acumulados de construcciones de inmuebles propios en proceso (para uso de la entidad, no para venta): edificaciones en construcción, obras de infraestructura propia, costos de materiales/mano de obra/contratos capitalizados hasta su terminación. No se deprecia hasta estar disponible para uso.

**Que no incluye:** Construcciones terminadas (1516). Obra de construcción para venta/contratos (inventario o costo de contrato 7405). Maquinaria en montaje (1512). Costos no capitalizables (gasto).

**Cuentas o nombres de cliente que podrian llegar aqui:** Construcciones en curso, obra en construcción (propia), edificación en proceso, construcción de planta en curso, infraestructura en construcción, obra civil propia en curso, CIP, construction in progress.

**Soportes o terceros esperados:** Presupuesto de obra, actas de avance, facturas y contratos capitalizados, soporte de costos, certificación de terminación.

**Soportes de control recomendados:** Proyecto, componente, grado de avance.

**Observaciones de homologacion:** Capitalizar los costos directamente atribuibles hasta que el activo esté disponible para uso (NIC 16). Incluir costos por préstamos si califican (NIC 23). No se deprecia hasta terminarse. Distinguir de obra para venta/contratos de construcción (que es inventario/costo de contrato). Al terminar, reclasificar a 1516.

### 151205 - Maquinaria y equipo en montaje

| Atributo | Valor |
|---|---|
| Codigo | `151205` |
| Nombre | Maquinaria y equipo en montaje |
| Cuenta Russell / 4D | Maquinaria y equipo en montaje |
| Tipo de rubro | Propiedad, planta y equipo |
| Naturaleza | Debito (`D`) |
| Padre logico | `1512` |
| Critica | no |

**Que incluye:** Costos acumulados de maquinaria y equipo en proceso de instalación/montaje, no disponible aún para uso: maquinaria importada en montaje, equipos en instalación, costos de instalación capitalizados. No se deprecia hasta estar listo para uso.

**Que no incluye:** Maquinaria ya en operación (1520). Maquinaria en tránsito (158805). Construcciones en curso (150805). Costos no capitalizables.

**Cuentas o nombres de cliente que podrian llegar aqui:** Maquinaria y equipo en montaje, equipo en instalación, maquinaria en montaje, equipos por instalar, montaje de maquinaria, maquinaria en ensamble, equipo en proceso de instalación.

**Soportes o terceros esperados:** Facturas de maquinaria, contratos de montaje, soporte de costos de instalación, acta de puesta en marcha.

**Soportes de control recomendados:** Equipo, proyecto, grado de avance del montaje.

**Observaciones de homologacion:** Capitalizar costos de adquisición e instalación hasta que el equipo esté en la ubicación y condiciones para operar (NIC 16). No se deprecia hasta estar disponible para uso. Al terminar el montaje, reclasificar a 1520 e iniciar depreciación.

### 151605 - Construcciones y edificaciones

| Atributo | Valor |
|---|---|
| Codigo | `151605` |
| Nombre | Construcciones y edificaciones |
| Cuenta Russell / 4D | Construcciones y edificaciones |
| Tipo de rubro | Propiedad, planta y equipo |
| Naturaleza | Debito (`D`) |
| Padre logico | `1516` |
| Critica | no |

**Que incluye:** Construcciones y edificaciones terminadas de propiedad de la entidad para su uso: plantas, bodegas, oficinas, sedes, edificios, naves industriales. Medidas al costo o revaluación, depreciadas en su vida útil (NIC 16).

**Que no incluye:** El terreno asociado (1504, no se deprecia). Construcciones en curso (150805). Inmuebles para venta (inventario). Mejoras a propiedades ajenas (171024). Depreciación acumulada (159205). Valorizaciones (1910).

**Cuentas o nombres de cliente que podrian llegar aqui:** Construcciones y edificaciones, edificios, edificaciones, planta física, bodega propia, oficinas propias, naves industriales, instalaciones, sede propia, edificio administrativo, construcciones propias.

**Soportes o terceros esperados:** Escritura, avalúo, soporte del costo de construcción, licencia de construcción, cálculo de depreciación.

**Soportes de control recomendados:** Inmueble, uso, componentes, vida útil, modelo (costo/revaluación).

**Observaciones de homologacion:** Separar el valor del terreno (no se deprecia) del de la construcción. Depreciar en la vida útil (NIC 16); considerar componentes con vidas distintas (componentización). Evaluar deterioro (NIC 36). Distinguir de mejoras a inmuebles ajenos (171024). Verificar titularidad.

### 152005 - Maquinaria y equipo

| Atributo | Valor |
|---|---|
| Codigo | `152005` |
| Nombre | Maquinaria y equipo |
| Cuenta Russell / 4D | Maquinaria y equipo |
| Tipo de rubro | Propiedad, planta y equipo |
| Naturaleza | Debito (`D`) |
| Padre logico | `1520` |
| Critica | no |

**Que incluye:** Maquinaria y equipo de producción/operación en uso: maquinaria industrial, equipos de planta, líneas de producción, equipos médicos (salud), maquinaria amarilla (construcción), equipos especializados. Medidos al costo o revaluación, depreciados (NIC 16).

**Que no incluye:** Maquinaria en montaje (151205) o en tránsito (158805). Equipo de oficina (1524), de cómputo (1528) o de transporte (1540). Repuestos menores (inventario 145505). Depreciación acumulada (159210). Deterioro (159920).

**Cuentas o nombres de cliente que podrian llegar aqui:** Maquinaria y equipo, maquinaria industrial, equipos de producción, línea de producción, maquinaria de planta, equipos médicos/biomédicos, maquinaria amarilla, equipo especializado, herramientas mayores, equipos de operación.

**Soportes o terceros esperados:** Facturas, soporte del costo, ficha técnica, cálculo de depreciación, inventario de activos fijos.

**Soportes de control recomendados:** Equipo, área/planta, vida útil, modelo.

**Observaciones de homologacion:** Depreciar en la vida útil según uso (NIC 16). Considerar componentización si hay partes con vidas distintas. Verificar existencia física (NIA 501) y titularidad. Evaluar deterioro (NIC 36) e indicios (obsolescencia tecnológica). Distinguir de repuestos (inventario).

### 152405 - Equipo de oficina - muebles y enseres

| Atributo | Valor |
|---|---|
| Codigo | `152405` |
| Nombre | Equipo de oficina - muebles y enseres |
| Cuenta Russell / 4D | Equipo de oficina |
| Tipo de rubro | Propiedad, planta y equipo |
| Naturaleza | Debito (`D`) |
| Padre logico | `1524` |
| Critica | no |

**Que incluye:** Muebles y enseres de oficina: escritorios, sillas, archivadores, mobiliario, enseres. Medidos al costo, depreciados (NIC 16). Transversal.

**Que no incluye:** Equipos de oficina no muebles (152410). Equipo de cómputo (1528). Maquinaria (1520). Elementos de bajo valor que se llevan a gasto según política. Depreciación acumulada (159215).

**Cuentas o nombres de cliente que podrian llegar aqui:** Muebles y enseres, mobiliario de oficina, escritorios, sillas, archivadores, enseres, muebles, mobiliario, dotación de oficina (muebles).

**Soportes o terceros esperados:** Facturas, inventario de activos fijos, cálculo de depreciación.

**Soportes de control recomendados:** Tipo, sede/área, vida útil.

**Observaciones de homologacion:** Depreciar en la vida útil (NIC 16). Elementos de bajo valor pueden llevarse a gasto según política de materialidad. Verificar existencia (NIA 501) y control de activos. Distinguir de equipos (152410) y cómputo (1528).

### 152410 - Equipo de oficina - equipos

| Atributo | Valor |
|---|---|
| Codigo | `152410` |
| Nombre | Equipo de oficina - equipos |
| Cuenta Russell / 4D | Equipo de oficina |
| Tipo de rubro | Propiedad, planta y equipo |
| Naturaleza | Debito (`D`) |
| Padre logico | `1524` |
| Critica | no |

**Que incluye:** Equipos de oficina distintos de muebles y de cómputo: fotocopiadoras, impresoras de oficina, equipos de aire acondicionado de oficina, calculadoras, equipos menores de oficina. Medidos al costo, depreciados.

**Que no incluye:** Muebles y enseres (152405). Equipo de cómputo y comunicaciones (1528). Maquinaria (1520). Depreciación acumulada (159215).

**Cuentas o nombres de cliente que podrian llegar aqui:** Equipos de oficina, fotocopiadoras, impresoras, equipos menores de oficina, aire acondicionado de oficina, equipos administrativos, máquinas de oficina.

**Soportes o terceros esperados:** Facturas, inventario de activos fijos, cálculo de depreciación.

**Soportes de control recomendados:** Tipo, sede/área, vida útil.

**Observaciones de homologacion:** Depreciar en la vida útil. Distinguir de muebles (152405) y de equipo de cómputo (1528). Elementos de bajo valor según política de materialidad. Verificar existencia.

### 152805 - Equipo de computación y procesamiento de datos

| Atributo | Valor |
|---|---|
| Codigo | `152805` |
| Nombre | Equipo de computación y procesamiento de datos |
| Cuenta Russell / 4D | Equipo de computación y comunicación |
| Tipo de rubro | Propiedad, planta y equipo |
| Naturaleza | Debito (`D`) |
| Padre logico | `1528` |
| Critica | no |

**Que incluye:** Equipos de cómputo y procesamiento de datos: computadores, servidores, portátiles, equipos de red, hardware, data centers. Medidos al costo, depreciados (vida útil corta por obsolescencia). Tecnología: infraestructura de cómputo.

**Que no incluye:** Software y programas (intangible 171016). Equipos de comunicaciones (152810). Equipo de oficina (1524). Depreciación acumulada (159220). Deterioro (159928).

**Cuentas o nombres de cliente que podrian llegar aqui:** Equipo de computación, computadores, servidores, portátiles, hardware, equipos de cómputo, data center, equipos de procesamiento, infraestructura tecnológica, equipos informáticos, PCs.

**Soportes o terceros esperados:** Facturas, inventario de activos fijos, cálculo de depreciación, ficha técnica.

**Soportes de control recomendados:** Tipo, sede/área, vida útil.

**Observaciones de homologacion:** Depreciar en vida útil corta por obsolescencia tecnológica (NIC 16). Distinguir el hardware (PPE) del software (intangible 171016). Evaluar deterioro por obsolescencia. Verificar existencia y control. En tecnología, los data centers son material.

### 152810 - Equipo de comunicaciones

| Atributo | Valor |
|---|---|
| Codigo | `152810` |
| Nombre | Equipo de comunicaciones |
| Cuenta Russell / 4D | Equipo de computación y comunicación |
| Tipo de rubro | Propiedad, planta y equipo |
| Naturaleza | Debito (`D`) |
| Padre logico | `1528` |
| Critica | no |

**Que incluye:** Equipos de comunicaciones: centrales telefónicas, equipos de telecomunicaciones, radios, equipos de transmisión, antenas. Medidos al costo, depreciados. Transporte/telecomunicaciones: equipos de comunicación de la operación.

**Que no incluye:** Equipo de cómputo (152805). Software (171016). Equipo de oficina (1524). Depreciación acumulada (159220).

**Cuentas o nombres de cliente que podrian llegar aqui:** Equipo de comunicaciones, centrales telefónicas, equipos de telecomunicaciones, radios, antenas, equipos de transmisión, conmutadores, equipos de red de comunicación.

**Soportes o terceros esperados:** Facturas, inventario de activos fijos, cálculo de depreciación.

**Soportes de control recomendados:** Tipo, sede/área, vida útil.

**Observaciones de homologacion:** Depreciar en la vida útil (NIC 16). Distinguir de equipo de cómputo (152805). Evaluar obsolescencia tecnológica. Verificar existencia.

### 154005 - Flota y equipo de transporte

| Atributo | Valor |
|---|---|
| Codigo | `154005` |
| Nombre | Flota y equipo de transporte |
| Cuenta Russell / 4D | Flota y equipo de transporte |
| Tipo de rubro | Propiedad, planta y equipo |
| Naturaleza | Debito (`D`) |
| Padre logico | `1540` |
| Critica | no |

**Que incluye:** Vehículos y equipo de transporte de propiedad de la entidad: automóviles, camiones, tractomulas, buses, montacargas, motos, flota de la operación. Medidos al costo, depreciados (NIC 16). Transporte/logística: flota operativa (activo clave del giro).

**Que no incluye:** Flota en tránsito (158830). Vehículos en leasing operativo (derecho de uso NIIF 16). Maquinaria amarilla autopropulsada según clasificación (1520). Depreciación acumulada (159235). Deterioro (159940).

**Cuentas o nombres de cliente que podrian llegar aqui:** Flota y equipo de transporte, vehículos, automóviles, camiones, tractomulas, buses, montacargas, motos, flota, parque automotor, equipo rodante, flota de carga, flota de pasajeros.

**Soportes o terceros esperados:** Tarjeta de propiedad, facturas, SOAT, inventario de flota, cálculo de depreciación.

**Soportes de control recomendados:** Vehículo, placa, uso, vida útil.

**Observaciones de homologacion:** Depreciar en la vida útil (NIC 16). En transporte/logística es el activo productivo principal (su depreciación es costo, 6145). Verificar titularidad (tarjeta de propiedad) y existencia. Distinguir flota propia de vehículos en leasing (derecho de uso). Evaluar deterioro.

### 158405 - Activos Biologicos

| Atributo | Valor |
|---|---|
| Codigo | `158405` |
| Nombre | Activos Biologicos |
| Cuenta Russell / 4D | Activos biológicos |
| Tipo de rubro | Propiedad, planta y equipo / Activos biológicos |
| Naturaleza | Debito (`D`) |
| Padre logico | `1584` |
| Critica | no |

**Que incluye:** Animales vivos y/o plantas productoras controladas por la entidad, usados en la actividad agropecuaria o productiva y mantenidos para generar beneficios económicos futuros. Incluye ganado, cultivos permanentes, plantaciones, semovientes reproductores o de producción, según política contable y modelo aplicable. Sectores: agropecuario, ganadero, avícola, porcicultura, piscícola, floricultura, forestal y agroindustria.

**Que no incluye:** Inventarios agropecuarios mantenidos para la venta o consumo en el ciclo normal de operación. Productos agrícolas cosechados ya separados del activo biológico. Propiedad, planta y equipo no biológica (maquinaria, terrenos, construcciones). Gastos de mantenimiento o alimentación ya consumidos. Activos biológicos de terceros en custodia o consignación.

**Cuentas o nombres de cliente que podrian llegar aqui:** Activos biológicos, semovientes, ganado, bovinos, porcinos, aves, peces, cultivos permanentes, plantaciones, árboles, animales reproductores, animales de producción, vientres, machos reproductores, ganado lechero, ganado de cría, activos agropecuarios, bienes biológicos.

**Soportes o terceros esperados:** Inventario físico o conteo pecuario/agronómico, registros de nacimientos, compras, bajas, ventas y mortalidad, guías de movilización, certificados sanitarios, avalúos o mediciones de valor razonable, costos acumulados, informes técnicos de producción, registros de lotes o unidades productivas.

**Soportes de control recomendados:** Especie/tipo biológico, lote o hato, ubicación, edad o etapa productiva, cantidad, responsable, método de medición, valor razonable/costo, vida útil o ciclo productivo.

**Observaciones de homologacion:** Bajo NIIF, los activos biológicos se miden generalmente a valor razonable menos costos de venta cuando pueda determinarse de forma fiable; si no, se usa costo menos depreciación/deterioro según corresponda. Separar los activos biológicos del producto agrícola cosechado, que pasa a inventarios. Verificar existencia física, propiedad/control, medición, mortalidad, deterioro y conciliación entre registros técnicos y contables. Definir si el activo es corriente o no corriente según ciclo y finalidad.

### 158805 - PPE en tránsito - maquinaria y equipo

| Atributo | Valor |
|---|---|
| Codigo | `158805` |
| Nombre | PPE en tránsito - maquinaria y equipo |
| Cuenta Russell / 4D | PPE en tránsito |
| Tipo de rubro | Propiedad, planta y equipo |
| Naturaleza | Debito (`D`) |
| Padre logico | `1588` |
| Critica | no |

**Que incluye:** Maquinaria y equipo adquirido en tránsito (importado, no recibido físicamente) cuyo control ya es de la entidad según Incoterm. No se deprecia hasta estar disponible para uso.

**Que no incluye:** Maquinaria recibida (1520) o en montaje (151205). Inventarios en tránsito (146505, son inventario no PPE). Anticipos a proveedores (133005).

**Cuentas o nombres de cliente que podrian llegar aqui:** PPE en tránsito maquinaria, maquinaria en tránsito, equipo en tránsito, maquinaria importada en tránsito, equipo en aduana, maquinaria por nacionalizar.

**Soportes o terceros esperados:** Factura, documento de transporte, Incoterm, declaración de importación.

**Soportes de control recomendados:** Equipo, importación, Incoterm.

**Observaciones de homologacion:** Reconocer según transferencia de control (Incoterm). No se deprecia. Al recibir, reclasificar a montaje (151205) o a maquinaria (1520). Distinguir de inventarios en tránsito (146505), que son para venta/producción no PPE.

### 158815 - PPE en tránsito - equipo de cómputo

| Atributo | Valor |
|---|---|
| Codigo | `158815` |
| Nombre | PPE en tránsito - equipo de cómputo |
| Cuenta Russell / 4D | PPE en tránsito |
| Tipo de rubro | Propiedad, planta y equipo |
| Naturaleza | Debito (`D`) |
| Padre logico | `1588` |
| Critica | no |

**Que incluye:** Equipo de cómputo y comunicaciones adquirido en tránsito cuyo control ya es de la entidad. No se deprecia hasta estar disponible.

**Que no incluye:** Equipo de cómputo recibido (1528). Inventarios en tránsito (146505). Anticipos (133005).

**Cuentas o nombres de cliente que podrian llegar aqui:** PPE en tránsito equipo de cómputo, equipo de cómputo en tránsito, hardware en tránsito, servidores en tránsito, equipos informáticos por nacionalizar.

**Soportes o terceros esperados:** Factura, documento de transporte, Incoterm, declaración de importación.

**Soportes de control recomendados:** Equipo, importación, Incoterm.

**Observaciones de homologacion:** Reconocer según Incoterm. No se deprecia. Al recibir, reclasificar a 1528. Distinguir de inventario en tránsito.

### 158830 - PPE en tránsito - flota y transporte

| Atributo | Valor |
|---|---|
| Codigo | `158830` |
| Nombre | PPE en tránsito - flota y transporte |
| Cuenta Russell / 4D | PPE en tránsito |
| Tipo de rubro | Propiedad, planta y equipo |
| Naturaleza | Debito (`D`) |
| Padre logico | `1588` |
| Critica | no |

**Que incluye:** Flota y equipo de transporte adquirido en tránsito (importado) cuyo control ya es de la entidad. No se deprecia hasta estar disponible para uso.

**Que no incluye:** Flota recibida (1540). Inventarios en tránsito (146505). Anticipos (133005).

**Cuentas o nombres de cliente que podrian llegar aqui:** PPE en tránsito flota, vehículos en tránsito, flota en tránsito, vehículos importados en tránsito, flota por nacionalizar.

**Soportes o terceros esperados:** Factura, documento de transporte, Incoterm, declaración de importación.

**Soportes de control recomendados:** Vehículo, importación, Incoterm.

**Observaciones de homologacion:** Reconocer según Incoterm. No se deprecia. Al recibir y matricular, reclasificar a 1540. Distinguir de inventario en tránsito.

### 159205 - Depreciación acumulada de propiedades, planta y equipo

| Atributo | Valor |
|---|---|
| Codigo | `159205` |
| Nombre | Depreciación acumulada de propiedades, planta y equipo |
| Cuenta Russell / 4D | Depreciación acumulada |
| Tipo de rubro | PPE (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1592` |
| Critica | no |

**Que incluye:** Depreciación acumulada de construcciones, edificaciones, maquinaria, equipo de oficina, equipo de cómputo, comunicaciones, flota y equipo de transporte.

**Que no incluye:** Activo bruto, gasto de depreciación del periodo, deterioro, amortización de intangibles, terrenos y activos no depreciables.

**Cuentas o nombres de cliente que podrian llegar aqui:** Depreciación acumulada edificaciones, depreciación acumulada construcciones, depreciación acumulada maquinaria, depreciación acumulada equipos productivos, depreciación acumulada equipo de oficina, depreciación acumulada muebles y enseres, depreciación acumulada computadores, depreciación acumulada equipos de comunicación, depreciación acumulada hardware, depreciación acumulada vehículos, depreciación acumulada flota, depreciación acumulada equipo de transporte y depreciación acumulada parque automotor.

**Soportes o terceros esperados:** Auxiliar de activos fijos, módulo de propiedad, planta y equipo, cálculo mensual de depreciación, política de vidas útiles, método de depreciación, fecha de adquisición, costo histórico, adiciones, bajas, traslados, actas de retiro, facturas de compra, registros de placa o serial, avalúos cuando aplique y conciliación entre auxiliar de activos fijos y contabilidad.

**Soportes de control recomendados:** Tipo de activo, código o placa del activo, centro de costo, área responsable, ubicación, fecha de adquisición, costo, vida útil, método de depreciación, valor residual, depreciación acumulada, depreciación del periodo, activo asociado, tercero/proveedor cuando aplique y unidad generadora de efectivo si se evalúa deterioro.

**Observaciones de homologacion:** No especificado en el maestro.

### 159916 - Deterioro acumulado de propiedades, planta y equipo

| Atributo | Valor |
|---|---|
| Codigo | `159916` |
| Nombre | Deterioro acumulado de propiedades, planta y equipo |
| Cuenta Russell / 4D | Deterioro / provisiones PPE |
| Tipo de rubro | PPE (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1599` |
| Critica | no |

**Que incluye:** Deterioro acumulado reconocido sobre propiedades, planta y equipo cuando el valor recuperable del activo o de la unidad generadora de efectivo es inferior a su valor en libros. Incluye deterioro de construcciones y edificaciones, maquinaria y equipo, equipo de oficina, muebles y enseres, equipo de cómputo y comunicación, flota, vehículos y equipo de transporte. Aplica por obsolescencia física o tecnológica, daños, siniestros, baja utilización, reducción de valor de mercado, cambios operativos, cierre de sedes, pérdida de capacidad productiva o evidencia de que el activo no recuperará su valor contable.

**Que no incluye:** No incluye el costo bruto del activo, depreciación acumulada, gasto por depreciación, gasto del deterioro del periodo, deterioro de inventarios, deterioro de cartera, deterioro de intangibles, deterioro de inversiones ni bajas de activos. Tampoco incluye provisiones generales sin prueba de deterioro ni ajustes por avalúo que correspondan a medición posterior bajo otro modelo contable.

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro de edificaciones, deterioro de construcciones, deterioro de maquinaria, deterioro de equipos, deterioro de muebles y enseres, deterioro de equipo de oficina, deterioro de computadores, deterioro de hardware, deterioro de equipos tecnológicos, deterioro de comunicaciones, deterioro de vehículos, deterioro de flota, deterioro de parque automotor, deterioro PPE inmuebles, deterioro por obsolescencia, deterioro por accidente, deterioro por daño físico, deterioro por pérdida de valor de mercado.

**Soportes o terceros esperados:** Test de deterioro, cálculo del valor recuperable, avalúo técnico, informe de obsolescencia, análisis de indicios de deterioro, soporte de valor razonable, flujos de efectivo esperados si aplica, informe técnico del activo, evidencia de daño o siniestro, acta de comité contable o aprobación interna, conciliación entre auxiliar de activos fijos y contabilidad.

**Soportes de control recomendados:** Clase de activo, código del activo, activo individual o UGE, centro de costo, sede, causa del deterioro, fecha de identificación, valor en libros, depreciación acumulada, valor recuperable, valor del deterioro, responsable del análisis, soporte técnico, reversión o seguimiento posterior.

**Observaciones de homologacion:** Esta cuenta debe usarse como cuenta correctora de PPE, no como gasto. El gasto por deterioro debe reconocerse separadamente en resultados y esta cuenta acumula el efecto contra el activo. No debe confundirse deterioro con depreciación: la depreciación distribuye el costo del activo durante su vida útil; el deterioro reconoce una pérdida cuando el valor recuperable es menor que el valor en libros. En cada cierre debe revisarse si existen indicios de deterioro y, cuando aplique, calcular valor recuperable. También debe evaluarse si procede reversión de deterioro en periodos posteriores.

### 160510 - Crédito mercantil adquirido

| Atributo | Valor |
|---|---|
| Codigo | `160510` |
| Nombre | Crédito mercantil adquirido |
| Cuenta Russell / 4D | Crédito mercantil |
| Tipo de rubro | Intangibles |
| Naturaleza | Debito (`D`) |
| Padre logico | `1605` |
| Critica | no |

**Que incluye:** Crédito mercantil (goodwill) surgido en combinaciones de negocios: exceso del precio pagado sobre el valor razonable de los activos netos identificables adquiridos (NIIF 3). Holdings y empresas que adquieren negocios en marcha.

**Que no incluye:** Crédito mercantil formado/generado internamente (no se reconoce). Marcas, patentes y otros intangibles identificables adquiridos por separado (1610-1635). Otros activos diversos (1895). Amortización (no se amortiza, se hace test de deterioro).

**Cuentas o nombres de cliente que podrian llegar aqui:** Crédito mercantil, goodwill, plusvalía, crédito mercantil adquirido, fondo de comercio, plusvalía mercantil, goodwill por combinación de negocios, mayor valor de adquisición.

**Soportes o terceros esperados:** Acuerdo de combinación de negocios, valoración de activos netos adquiridos (PPA), estudio de valor razonable, test de deterioro anual.

**Soportes de control recomendados:** Negocio adquirido, unidad generadora de efectivo (UGE).

**Observaciones de homologacion:** Solo se reconoce el crédito mercantil ADQUIRIDO (NIIF 3), nunca el generado internamente. NO se amortiza: se somete a test de deterioro anual obligatorio (NIC 36) por unidad generadora de efectivo. El deterioro NO se reversa. Partida de alto juicio (NIA 540): verificar la asignación del precio de compra y el test de deterioro.

### 161005 - Marcas adquiridas

| Atributo | Valor |
|---|---|
| Codigo | `161005` |
| Nombre | Marcas adquiridas |
| Cuenta Russell / 4D | Marcas |
| Tipo de rubro | Intangibles |
| Naturaleza | Debito (`D`) |
| Padre logico | `1610` |
| Critica | no |

**Que incluye:** Marcas comerciales adquiridas: derechos sobre marcas, nombres comerciales y enseñas comprados a terceros (NIC 38). Retail/manufactura/franquicias: marcas adquiridas. Pueden tener vida útil definida o indefinida.

**Que no incluye:** Marcas generadas internamente (no se reconocen como activo). Patentes (1615). Franquicias (162010). Crédito mercantil (160510). Amortización acumulada (169810).

**Cuentas o nombres de cliente que podrian llegar aqui:** Marcas adquiridas, marcas comerciales, derechos de marca, nombres comerciales, enseñas comerciales, marcas registradas adquiridas, propiedad de marca, brand.

**Soportes o terceros esperados:** Contrato de adquisición, registro de la marca (SIC), valoración, soporte del costo.

**Soportes de control recomendados:** Marca, vida útil (definida/indefinida), método de amortización.

**Observaciones de homologacion:** Solo marcas ADQUIRIDAS (NIC 38); las generadas internamente no se reconocen. Determinar si la vida útil es definida (se amortiza, 169810) o indefinida (no se amortiza, test de deterioro anual). Verificar registro ante la SIC. Evaluar deterioro (1699). Partida de juicio (NIA 540).

### 161505 - Patentes adquiridas

| Atributo | Valor |
|---|---|
| Codigo | `161505` |
| Nombre | Patentes adquiridas |
| Cuenta Russell / 4D | Patentes |
| Tipo de rubro | Intangibles |
| Naturaleza | Debito (`D`) |
| Padre logico | `1615` |
| Critica | no |

**Que incluye:** Patentes de invención y modelos de utilidad adquiridos: derechos de explotación exclusiva de invenciones comprados a terceros (NIC 38). Manufactura/farmacéutica/tecnología: patentes de productos o procesos.

**Que no incluye:** Patentes desarrolladas internamente (evaluar fase de desarrollo, NIC 38). Marcas (1610). Know how (163099). Licencias (163599). Amortización acumulada (169815).

**Cuentas o nombres de cliente que podrian llegar aqui:** Patentes adquiridas, patentes de invención, derechos de patente, modelos de utilidad, patentes de producto, patentes de proceso, propiedad industrial adquirida.

**Soportes o terceros esperados:** Contrato de adquisición, registro de la patente (SIC), valoración, soporte del costo, vigencia de la patente.

**Soportes de control recomendados:** Patente, vida útil (vigencia legal), método.

**Observaciones de homologacion:** Amortizar en la vida útil (usualmente la vigencia legal de la patente) (NIC 38). Verificar registro y vigencia. Patentes desarrolladas internamente solo se capitalizan si cumplen los criterios de la fase de desarrollo. Evaluar deterioro (1699).

### 162005 - Concesiones

| Atributo | Valor |
|---|---|
| Codigo | `162005` |
| Nombre | Concesiones |
| Cuenta Russell / 4D | Concesiones y franquicias |
| Tipo de rubro | Intangibles |
| Naturaleza | Debito (`D`) |
| Padre logico | `1620` |
| Critica | no |

**Que incluye:** Derechos de concesión adquiridos: concesiones de operación de infraestructura, servicios públicos, recursos, espacios (peajes, puertos, aeropuertos, espectro). Infraestructura/transporte/servicios públicos: derechos de concesión (puede aplicar CINIIF 12 acuerdos de concesión de servicios).

**Que no incluye:** Franquicias comerciales (162010). Licencias de software (171016). Otros derechos (162595). Amortización acumulada (169820).

**Cuentas o nombres de cliente que podrian llegar aqui:** Concesiones, derechos de concesión, concesión de operación, concesión vial, concesión portuaria, concesión de servicios públicos, derecho de explotación, concesión de espectro, acuerdo de concesión.

**Soportes o terceros esperados:** Contrato de concesión, soporte del costo, cronograma de la concesión, valoración.

**Soportes de control recomendados:** Concesión, plazo, derecho, método de amortización.

**Observaciones de homologacion:** Amortizar en el plazo de la concesión (NIC 38). Acuerdos de concesión de servicios público-privados pueden caer bajo CINIIF 12 (modelo de activo financiero o intangible). Verificar el contrato y el plazo. Partida material en infraestructura. Evaluar deterioro.

### 162010 - Franquicias

| Atributo | Valor |
|---|---|
| Codigo | `162010` |
| Nombre | Franquicias |
| Cuenta Russell / 4D | Concesiones y franquicias |
| Tipo de rubro | Intangibles |
| Naturaleza | Debito (`D`) |
| Padre logico | `1620` |
| Critica | no |

**Que incluye:** Derechos de franquicia adquiridos: derecho a operar bajo una marca/modelo de negocio franquiciado (fee de entrada de la franquicia). Retail/alimentos/servicios: franquicias adquiridas para operar.

**Que no incluye:** Marcas propias adquiridas (1610). Concesiones (162005). Regalías periódicas de franquicia (gasto). Amortización acumulada (169820).

**Cuentas o nombres de cliente que podrian llegar aqui:** Franquicias, derechos de franquicia, fee de franquicia, franchise, derecho de operación franquiciada, cuota de entrada de franquicia, licencia de franquicia.

**Soportes o terceros esperados:** Contrato de franquicia, soporte del fee de entrada, plazo del contrato, valoración.

**Soportes de control recomendados:** Franquicia, plazo, método de amortización.

**Observaciones de homologacion:** Amortizar en el plazo del contrato de franquicia (NIC 38). Distinguir el fee de entrada capitalizable de las regalías periódicas (gasto). Verificar el contrato y el plazo. Evaluar deterioro.

### 162595 - Otros derechos intangibles

| Atributo | Valor |
|---|---|
| Codigo | `162595` |
| Nombre | Otros derechos intangibles |
| Cuenta Russell / 4D | Derechos |
| Tipo de rubro | Intangibles |
| Naturaleza | Debito (`D`) |
| Padre logico | `1625` |
| Critica | no |

**Que incluye:** Otros derechos intangibles adquiridos no clasificados: derechos de autor, derechos de uso, derechos contractuales, listas de clientes adquiridas, derechos de explotación diversos (NIC 38).

**Que no incluye:** Crédito mercantil (160510), marcas (1610), patentes (1615), concesiones/franquicias (1620), know how (1630), licencias (1635). Amortización acumulada (1698).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros derechos intangibles, derechos de autor, derechos de uso, derechos contractuales, listas de clientes, derechos de explotación, intangibles diversos, derechos adquiridos.

**Soportes o terceros esperados:** Contrato de adquisición, soporte del costo, valoración, registro si aplica.

**Soportes de control recomendados:** Tipo de derecho, vida útil, método.

**Observaciones de homologacion:** Cuenta de derechos intangibles residual. Amortizar en la vida útil si es definida (NIC 38). Reclasificar a subcuenta específica si aplica. Verificar que cumpla criterios de reconocimiento (identificable, control, beneficios futuros). Evaluar deterioro.

### 163099 - Know how

| Atributo | Valor |
|---|---|
| Codigo | `163099` |
| Nombre | Know how |
| Cuenta Russell / 4D | Know how |
| Tipo de rubro | Intangibles |
| Naturaleza | Debito (`D`) |
| Padre logico | `1630` |
| Critica | no |

**Que incluye:** Know how adquirido: conocimiento técnico, fórmulas, procesos, secretos industriales, experiencia técnica comprada a terceros (NIC 38). Manufactura/tecnología/farmacéutica.

**Que no incluye:** Know how generado internamente (no se reconoce). Patentes (1615). Licencias (1635). Asistencia técnica (gasto/servicio). Amortización acumulada (1698).

**Cuentas o nombres de cliente que podrian llegar aqui:** Know how, conocimiento técnico, secretos industriales, fórmulas adquiridas, procesos técnicos, experiencia técnica, savoir faire, conocimiento especializado adquirido.

**Soportes o terceros esperados:** Contrato de transferencia de know how, soporte del costo, valoración.

**Soportes de control recomendados:** Tipo, vida útil, método.

**Observaciones de homologacion:** Solo know how ADQUIRIDO (NIC 38); el generado internamente no se reconoce. Amortizar en la vida útil estimada. Distinguir de asistencia técnica (servicio/gasto). Verificar criterios de reconocimiento. Evaluar deterioro.

### 163599 - Licencias

| Atributo | Valor |
|---|---|
| Codigo | `163599` |
| Nombre | Licencias |
| Cuenta Russell / 4D | Licencias |
| Tipo de rubro | Intangibles |
| Naturaleza | Debito (`D`) |
| Padre logico | `1635` |
| Critica | no |

**Que incluye:** Licencias adquiridas: licencias de explotación, licencias de uso de derechos, licencias de operación, permisos con valor económico (NIC 38). Distinto del software, que puede ir a 171016 según el plan.

**Que no incluye:** Software/programas de computador (171016 según plan). Concesiones (162005). Franquicias (162010). Licencias de uso de software anual (gasto/servicio según caso). Amortización acumulada (169840).

**Cuentas o nombres de cliente que podrian llegar aqui:** Licencias, licencias de explotación, licencias de uso, licencias de operación, derechos de licencia, permisos con valor económico, licencias adquiridas, licencias de derechos.

**Soportes o terceros esperados:** Contrato de licencia, soporte del costo, plazo/vigencia, valoración.

**Soportes de control recomendados:** Licencia, plazo, método de amortización.

**Observaciones de homologacion:** Amortizar en el plazo de la licencia (NIC 38). Distinguir licencias intangibles de larga duración (activo) de licencias de software anuales recurrentes (gasto/servicio). Verificar el contrato. En el plan, el software se maneja en 171016; coordinar para no duplicar. Evaluar deterioro.

### 169805 - Amortización acumulada de activos intangibles

| Atributo | Valor |
|---|---|
| Codigo | `169805` |
| Nombre | Amortización acumulada de activos intangibles |
| Cuenta Russell / 4D | Amortización acumulada intangibles |
| Tipo de rubro | No especificado en el maestro. |
| Naturaleza | Debito (`D`) |
| Padre logico | `1698` |
| Critica | no |

**Que incluye:** Saldo acumulado de amortización de activos intangibles con vida útil finita, reconocido durante el periodo de uso, vigencia contractual o vida económica estimada. Incluye amortización acumulada de marcas con vida útil definida, patentes, concesiones, franquicias, licencias, derechos de uso, derechos contractuales, software capitalizado y otros intangibles amortizables. También puede incluir amortización de crédito mercantil únicamente cuando el marco contable aplicable lo permita o lo exija.

**Que no incluye:** No incluye el costo bruto del intangible, gasto de amortización del periodo, deterioro de intangibles, deterioro de crédito mercantil, plusvalía no amortizable bajo NIIF plenas, intangibles con vida útil indefinida, marcas no amortizables, licencias registradas directamente como gasto, mantenimiento de software ni suscripciones SaaS que no cumplan criterio de activo.

**Cuentas o nombres de cliente que podrian llegar aqui:** Amortización acumulada de crédito mercantil cuando aplique, amortización de marcas, amortización de nombres comerciales, amortización de patentes, amortización de propiedad industrial, amortización de derechos de patente, amortización de concesiones, franquicias, licencias, permisos, derechos contractuales, software capitalizado y otros intangibles de vida útil finita.

**Soportes o terceros esperados:** Cálculo de amortización, política contable, auxiliar de intangibles, contrato, licencia, registro legal, certificado de marca o patente, vigencia contractual, plazo de concesión o franquicia, soporte de adquisición, acta de puesta en uso, conciliación entre auxiliar y contabilidad.

**Soportes de control recomendados:** Tipo de intangible, código del activo intangible, tercero, NIT, contrato o licencia, fecha de adquisición, fecha de inicio de uso, vida útil, método de amortización, periodo amortizado, centro de costo, negocio, responsable, valor bruto, amortización acumulada y valor neto en libros

**Observaciones de homologacion:** Esta cuenta debe usarse como cuenta correctora del activo intangible, no como gasto. El gasto por amortización del periodo debe reconocerse en resultados. Antes de homologar, validar si cada intangible tiene vida útil finita o indefinida. Bajo NIIF plenas, el crédito mercantil no se amortiza y debe evaluarse por deterioro. Bajo NIIF para Pymes puede tener tratamiento diferente según la política y el marco aplicable. Verificar que las licencias o software no estén duplicados entre intangible, gasto, suscripción o mantenimiento.

### 169905 - Deterioro de intangibles

| Atributo | Valor |
|---|---|
| Codigo | `169905` |
| Nombre | Deterioro de intangibles |
| Cuenta Russell / 4D | Deterioro / provisiones intangibles |
| Tipo de rubro | Intangibles (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1699` |
| Critica | no |

**Que incluye:** Deterioro acumulado de activos intangibles (cuenta correctora crédito): pérdida por deterioro de crédito mercantil, marcas, patentes, concesiones, licencias cuando el valor recuperable es menor al valor en libros (NIC 36).

**Que no incluye:** Los intangibles brutos (1605-1635). Amortización acumulada (1698). El gasto por deterioro del periodo (519915/519995).

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro de intangibles, deterioro de crédito mercantil, deterioro de marcas, deterioro de patentes, provisión de intangibles, pérdida por deterioro de goodwill, deterioro de concesiones.

**Soportes o terceros esperados:** Test de deterioro, cálculo del valor recuperable, unidad generadora de efectivo, indicios.

**Soportes de control recomendados:** Intangible, UGE, causa del deterioro.

**Observaciones de homologacion:** Cuenta correctora. El crédito mercantil y los intangibles de vida indefinida requieren test de deterioro ANUAL obligatorio (NIC 36). El deterioro del crédito mercantil NO se reversa. Partida de alto juicio (NIA 540). Verificar UGE y supuestos del test. El gasto del periodo va a 51xx.

### 170520 - Seguros pagados por anticipado

| Atributo | Valor |
|---|---|
| Codigo | `170520` |
| Nombre | Seguros pagados por anticipado |
| Cuenta Russell / 4D | Gastos pagados por anticipado |
| Tipo de rubro | Activos diferidos |
| Naturaleza | Debito (`D`) |
| Padre logico | `1705` |
| Critica | no |

**Que incluye:** Primas de seguros pagadas por anticipado no devengadas: pólizas pagadas que cubren periodos futuros, amortizables al gasto durante la vigencia. Transversal.

**Que no incluye:** Seguros por pagar (pasivo 233555). Seguros ya devengados (gasto). Depósitos en garantía (1335). Otros gastos pagados por anticipado (170595).

**Cuentas o nombres de cliente que podrian llegar aqui:** Seguros pagados por anticipado, primas de seguro anticipadas, pólizas pagadas por anticipado, seguros diferidos, prima diferida, seguros prepagados.

**Soportes o terceros esperados:** Póliza, factura de la aseguradora, soporte de pago, vigencia de la póliza, cálculo de amortización.

**Soportes de control recomendados:** Aseguradora, póliza, ramo, vigencia.

**Observaciones de homologacion:** Amortizar al gasto linealmente durante la vigencia de la póliza (devengo). El saldo es la porción no devengada. Verificar correcta periodificación. Distinguir de seguros por pagar (pasivo 233555). Si la prima se financió, separar el componente financiero.

### 170525 - Arrendamientos pagados por anticipado

| Atributo | Valor |
|---|---|
| Codigo | `170525` |
| Nombre | Arrendamientos pagados por anticipado |
| Cuenta Russell / 4D | Gastos pagados por anticipado |
| Tipo de rubro | Activos diferidos |
| Naturaleza | Debito (`D`) |
| Padre logico | `1705` |
| Critica | no |

**Que incluye:** Cánones de arrendamiento pagados por anticipado no devengados (de contratos que no generan derecho de uso NIIF 16, o pagos anticipados de cánones), amortizables durante el periodo cubierto.

**Que no incluye:** Activo por derecho de uso NIIF 16 (PPE/activo específico). Arrendamientos por pagar (pasivo 233540). Cánones ya devengados (gasto). Depósitos de arrendamiento (1335).

**Cuentas o nombres de cliente que podrian llegar aqui:** Arrendamientos pagados por anticipado, cánones anticipados, arriendo prepagado, alquiler pagado por anticipado, arrendamiento diferido, canon anticipado.

**Soportes o terceros esperados:** Contrato de arrendamiento, soporte de pago, periodo cubierto, cálculo de amortización.

**Soportes de control recomendados:** Arrendador, inmueble/bien, periodo cubierto.

**Observaciones de homologacion:** Amortizar al gasto durante el periodo cubierto. Bajo NIIF 16, verificar si el contrato genera derecho de uso (activo distinto). Distinguir del depósito de garantía (1335). El saldo es la porción no devengada.

### 170540 - Servicios pagados por anticipado

| Atributo | Valor |
|---|---|
| Codigo | `170540` |
| Nombre | Servicios pagados por anticipado |
| Cuenta Russell / 4D | Gastos pagados por anticipado |
| Tipo de rubro | Activos diferidos |
| Naturaleza | Debito (`D`) |
| Padre logico | `1705` |
| Critica | no |

**Que incluye:** Servicios pagados por anticipado no devengados: mantenimientos prepagados, suscripciones, membresías, servicios contratados pagados que cubren periodos futuros. Tecnología: licencias/SaaS anuales prepagados, hosting prepagado.

**Que no incluye:** Servicios ya devengados (gasto). Anticipos a proveedores de servicios (133005). Software como intangible (171016). Otros gastos pagados por anticipado (170595).

**Cuentas o nombres de cliente que podrian llegar aqui:** Servicios pagados por anticipado, mantenimiento prepagado, suscripciones anticipadas, membresías prepagadas, servicios diferidos, hosting prepagado, licencias anuales prepagadas, SaaS prepagado, soporte prepagado.

**Soportes o terceros esperados:** Contrato/factura, soporte de pago, periodo cubierto, cálculo de amortización.

**Soportes de control recomendados:** Proveedor, servicio, periodo cubierto.

**Observaciones de homologacion:** Amortizar al gasto durante el periodo cubierto (devengo). El saldo es la porción no consumida. Distinguir de anticipos a proveedores (133005, aún sin recibir el servicio) y de software intangible (171016). Verificar periodificación.

### 170595 - Otros gastos pagados por anticipado

| Atributo | Valor |
|---|---|
| Codigo | `170595` |
| Nombre | Otros gastos pagados por anticipado |
| Cuenta Russell / 4D | Gastos pagados por anticipado |
| Tipo de rubro | Activos diferidos |
| Naturaleza | Debito (`D`) |
| Padre logico | `1705` |
| Critica | no |

**Que incluye:** Otros gastos pagados por anticipado no clasificados: publicidad prepagada, comisiones pagadas por anticipado, intereses pagados por anticipado, otros pagos diferidos amortizables.

**Que no incluye:** Gastos pagados por anticipado con subcuenta específica (seguros, arrendamientos, servicios). Anticipos a proveedores (133005). Cargos diferidos de otra naturaleza (1710).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros gastos pagados por anticipado, publicidad prepagada, comisiones anticipadas, intereses pagados por anticipado, gastos diferidos varios, pagos anticipados diversos.

**Soportes o terceros esperados:** Soporte de pago, contrato/factura, periodo cubierto, cálculo de amortización.

**Soportes de control recomendados:** Concepto, tercero, periodo cubierto.

**Observaciones de homologacion:** Cuenta residual de gastos pagados por anticipado. Amortizar durante el periodo cubierto. Reclasificar a subcuenta específica si aplica. Verificar que sea un verdadero pago anticipado y no un gasto ya devengado.

### 171016 - Programas para computador - software

| Atributo | Valor |
|---|---|
| Codigo | `171016` |
| Nombre | Programas para computador - software |
| Cuenta Russell / 4D | Cargos diferidos / otros activos |
| Tipo de rubro | Intangibles / cargos diferidos |
| Naturaleza | Debito (`D`) |
| Padre logico | `1710` |
| Critica | no |

**Que incluye:** Software y programas para computador adquiridos o desarrollados que cumplen criterios de activo intangible (NIC 38): licencias de software de larga duración, ERP, sistemas, desarrollos capitalizados, plataformas. Tecnología: software propio desarrollado (fase de desarrollo), plataformas core. Transversal: ERP, sistemas de información.

**Que no incluye:** Hardware/equipo de cómputo (152805). Licencias de software anuales recurrentes (gasto/servicio). Software en investigación (gasto). Mantenimiento de software (gasto). Amortización acumulada (179810). Licencias intangibles de otra naturaleza (1635).

**Cuentas o nombres de cliente que podrian llegar aqui:** Software, programas para computador, licencias de software, ERP, sistemas de información, software desarrollado, plataforma tecnológica, aplicativos, software capitalizado, desarrollo de software, sistema core, intangible de software.

**Soportes o terceros esperados:** Contrato/factura de adquisición, soporte de costos de desarrollo capitalizados, licencia, cálculo de amortización.

**Soportes de control recomendados:** Software, vida útil, adquirido/desarrollado, método.

**Observaciones de homologacion:** Capitalizar software adquirido o en fase de desarrollo que cumpla criterios (NIC 38). La investigación y el mantenimiento van a gasto. Amortizar en la vida útil (179810). Distinguir del hardware (152805) y de licencias anuales recurrentes (gasto). En tecnología, el software core es activo material: validar capitalización de costos de desarrollo. Evaluar deterioro.

### 171024 - Mejoras a propiedades ajenas

| Atributo | Valor |
|---|---|
| Codigo | `171024` |
| Nombre | Mejoras a propiedades ajenas |
| Cuenta Russell / 4D | Cargos diferidos / otros activos |
| Tipo de rubro | Cargos diferidos / otros activos |
| Naturaleza | Debito (`D`) |
| Padre logico | `1710` |
| Critica | no |

**Que incluye:** Mejoras y adecuaciones realizadas en inmuebles arrendados (propiedad de terceros): adecuaciones de locales arrendados, remodelaciones, instalaciones en sedes alquiladas, amortizables en el menor entre la vida útil de la mejora y el plazo del arrendamiento. Retail: adecuación de locales. Servicios/tecnología: adecuación de oficinas arrendadas.

**Que no incluye:** Construcciones propias (1516). Mantenimiento ordinario (gasto). Activo por derecho de uso NIIF 16 (distinto). Mejoras a inmuebles propios (PPE). Amortización acumulada (179810).

**Cuentas o nombres de cliente que podrian llegar aqui:** Mejoras a propiedades ajenas, adecuaciones de locales arrendados, remodelación de local alquilado, mejoras en inmuebles arrendados, adecuación de oficinas arrendadas, leasehold improvements, instalaciones en arrendados.

**Soportes o terceros esperados:** Contrato de arrendamiento, soporte de los costos de adecuación, plazo del contrato, cálculo de amortización.

**Soportes de control recomendados:** Inmueble arrendado, contrato, plazo, vida útil de la mejora.

**Observaciones de homologacion:** Amortizar en el menor entre la vida útil de la mejora y el plazo del arrendamiento (incluidas renovaciones razonablemente ciertas). Distinguir de mantenimiento ordinario (gasto). Relevante en retail/servicios con locales arrendados. Coordinar con el tratamiento del derecho de uso (NIIF 16).

### 171076 - Activo por impuesto diferido

| Atributo | Valor |
|---|---|
| Codigo | `171076` |
| Nombre | Activo por impuesto diferido |
| Cuenta Russell / 4D | Cargos diferidos / otros activos |
| Tipo de rubro | Activos por impuestos |
| Naturaleza | Debito (`D`) |
| Padre logico | `1710` |
| Critica | no |

**Que incluye:** Activo por impuesto diferido por diferencias temporarias deducibles y créditos fiscales: diferencias entre base contable y fiscal que generan menores impuestos futuros, pérdidas fiscales y excesos de renta presuntiva con probabilidad de compensación (NIC 12).

**Que no incluye:** Pasivo por impuesto diferido (272505). Impuesto de renta corriente (240405 / anticipo 135505). Saldos a favor (135520). Retenciones a favor (135515).

**Cuentas o nombres de cliente que podrian llegar aqui:** Activo por impuesto diferido, impuesto diferido activo, diferencias temporarias deducibles, impuesto diferido por pérdidas fiscales, deferred tax asset, impuesto diferido por provisiones, crédito fiscal diferido.

**Soportes o terceros esperados:** Cálculo del impuesto diferido, conciliación de bases contable/fiscal, Formato 2516, proyección de rentas futuras, tasas futuras.

**Soportes de control recomendados:** Diferencia temporaria, origen, tasa.

**Observaciones de homologacion:** Reconocer solo en la medida en que sea probable disponer de ganancias fiscales futuras contra las cuales aplicar las diferencias deducibles/pérdidas (NIC 12, prueba de recuperabilidad). Medir a la tasa esperada de reversión. Recalcular independientemente (NIA 540). Conciliar con Formato 2516. Evaluar compensación con el pasivo diferido (272505).

### 171095 - Otros cargos diferidos

| Atributo | Valor |
|---|---|
| Codigo | `171095` |
| Nombre | Otros cargos diferidos |
| Cuenta Russell / 4D | Cargos diferidos / otros activos |
| Tipo de rubro | Cargos diferidos / otros activos |
| Naturaleza | Debito (`D`) |
| Padre logico | `1710` |
| Critica | no |

**Que incluye:** Otros cargos diferidos no clasificados: costos de establecimiento amortizables (según marco), costos diferidos de proyectos, otros diferidos amortizables que cumplan criterios de activo.

**Que no incluye:** Gastos pagados por anticipado (1705). Software (171016). Mejoras a propiedades ajenas (171024). Impuesto diferido (171076). Gastos del periodo (no diferibles bajo NIIF).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros cargos diferidos, cargos diferidos, costos diferidos, gastos diferidos de proyecto, costos de establecimiento, otros activos diferidos, diferidos varios.

**Soportes o terceros esperados:** Soporte del costo, criterio de capitalización, cálculo de amortización.

**Soportes de control recomendados:** Concepto, periodo de amortización.

**Observaciones de homologacion:** Cuenta residual de diferidos. Bajo NIIF, muchos cargos diferidos tradicionales (preoperativos, establecimiento) NO califican como activo y van a gasto. Verificar que cumplan criterios de reconocimiento. Reclasificar o ajustar a resultados lo que no califique (riesgo de activos ficticios).

### 179810 - Amortización acumulada de otros activos diferidos

| Atributo | Valor |
|---|---|
| Codigo | `179810` |
| Nombre | Amortización acumulada de otros activos diferidos |
| Cuenta Russell / 4D | Amortización acumulada diferidos |
| Tipo de rubro | Diferidos (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1798` |
| Critica | no |

**Que incluye:** Amortización acumulada de software, mejoras a propiedades ajenas y otros cargos diferidos (cuenta correctora crédito que minora las cuentas del grupo 1710).

**Que no incluye:** Los diferidos brutos (1710). Amortización de intangibles del grupo 16 (1698). Gastos pagados por anticipado (se amortizan contra el gasto, no por esta cuenta). El gasto del periodo (5165).

**Cuentas o nombres de cliente que podrian llegar aqui:** Amortización acumulada diferidos, amortización de software, amortización de mejoras a propiedades ajenas, amortización de cargos diferidos, amortización acumulada otros activos.

**Soportes o terceros esperados:** Cálculo de amortización, vida útil/plazo, política.

**Soportes de control recomendados:** Activo diferido, vida útil, método.

**Observaciones de homologacion:** Cuenta correctora. Amortizar software en su vida útil y mejoras a propiedades ajenas en el menor entre vida útil y plazo del arrendamiento (NIC 38). El gasto del periodo va a 5165. Verificar coherencia con la vida transcurrida.

### 189595 - Otros activos diversos

| Atributo | Valor |
|---|---|
| Codigo | `189595` |
| Nombre | Otros activos diversos |
| Cuenta Russell / 4D | Diversos otros activos |
| Tipo de rubro | Otros activos |
| Naturaleza | Debito (`D`) |
| Padre logico | `1895` |
| Critica | no |

**Que incluye:** Otros activos no clasificados en grupos anteriores: bienes de arte y cultura, bienes recibidos en dación de pago pendientes de realizar, activos diversos sin cuenta específica.

**Que no incluye:** Activos con cuenta específica (inversiones, deudores, inventarios, PPE, intangibles, diferidos). Inventarios para la venta. Otros activos diferidos (1710).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros activos diversos, bienes de arte y cultura, bienes recibidos en dación de pago, activos diversos, bienes por realizar, otros activos, activos varios.

**Soportes o terceros esperados:** Soporte del activo, valoración, identificación.

**Soportes de control recomendados:** Tipo de activo, origen.

**Observaciones de homologacion:** Cuenta residual de activos. Reclasificar a cuenta específica si aplica. Bienes recibidos en dación de pago: evaluar su realización y deterioro. Verificar existencia y valoración. Depurar saldos antiguos.

### 189995 - Deterioro de otros activos

| Atributo | Valor |
|---|---|
| Codigo | `189995` |
| Nombre | Deterioro de otros activos |
| Cuenta Russell / 4D | Deterioro / provisiones otros activos |
| Tipo de rubro | Otros activos (cuenta correctora) |
| Naturaleza | Debito (`D`) |
| Padre logico | `1899` |
| Critica | no |

**Que incluye:** Deterioro acumulado de otros activos diversos (cuenta correctora crédito) cuando su valor recuperable es menor al valor en libros.

**Que no incluye:** Los otros activos brutos (1895). Deterioros con cuenta específica (inversiones, deudores, inventarios, PPE, intangibles). El gasto del periodo (519995).

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro de otros activos, provisión de otros activos, deterioro de bienes diversos, deterioro de bienes recibidos en dación, provisión de activos diversos.

**Soportes o terceros esperados:** Cálculo del deterioro, valoración, indicios.

**Soportes de control recomendados:** Activo, causa del deterioro.

**Observaciones de homologacion:** Cuenta correctora residual. Reconocer cuando el valor recuperable es menor al valor en libros. Bienes recibidos en dación suelen requerir deterioro si su realización es incierta. El gasto va a 519995.

### 190505 - Valorizaciones de inversiones

| Atributo | Valor |
|---|---|
| Codigo | `190505` |
| Nombre | Valorizaciones de inversiones |
| Cuenta Russell / 4D | Valorizaciones de inversiones |
| Tipo de rubro | Valorizaciones |
| Naturaleza | Debito (`D`) |
| Padre logico | `1905` |
| Critica | no |

**Que incluye:** Mayor valor de inversiones por medición a valor razonable sobre el costo (saldo deudor), con contrapartida en el superávit por valorizaciones (patrimonio, 3805). Aplica a inversiones medidas a valor razonable con cambios en ORI (NIIF 9).

**Que no incluye:** Las inversiones al costo (1205-1245). Deterioro de inversiones (129905, naturaleza opuesta). Valorizaciones de PPE (1910). Ganancia realizada en venta (resultados).

**Cuentas o nombres de cliente que podrian llegar aqui:** Valorizaciones de inversiones, valorización de acciones, mayor valor de inversiones, superávit de inversiones (activo), ajuste a valor razonable de inversiones, valorización de portafolio.

**Soportes o terceros esperados:** Valoración a valor razonable, soporte del valor de mercado, cálculo de la valorización.

**Soportes de control recomendados:** Inversión, fecha de valoración, método.

**Observaciones de homologacion:** Bajo NIIF 9, las valorizaciones de instrumentos de patrimonio medidos a valor razonable con cambios en ORI tienen contrapartida en el patrimonio (superávit 3805), no en resultados. Distinguir de deterioro (129905). El esquema tradicional de valorizaciones/superávit se mantiene conceptualmente bajo el modelo de ORI. Verificar la medición.

### 191004 - Valorizaciones de terrenos

| Atributo | Valor |
|---|---|
| Codigo | `191004` |
| Nombre | Valorizaciones de terrenos |
| Cuenta Russell / 4D | Valorizaciones PPE |
| Tipo de rubro | Valorizaciones |
| Naturaleza | Debito (`D`) |
| Padre logico | `1910` |
| Critica | no |

**Que incluye:** Mayor valor de terrenos por aplicación del modelo de revaluación (NIC 16) o saldos históricos de valorización, con contrapartida en el superávit por revaluación (patrimonio, 3810).

**Que no incluye:** Los terrenos al costo (1504). Valorizaciones de construcciones (191008). Valorizaciones de inversiones (1905). Deterioro de PPE (1599).

**Cuentas o nombres de cliente que podrian llegar aqui:** Valorizaciones de terrenos, valorización de lotes, revaluación de terrenos, superávit de terrenos (activo), mayor valor de terrenos, ajuste por revaluación de terrenos.

**Soportes o terceros esperados:** Avalúo técnico, soporte de la revaluación, cálculo de la valorización.

**Soportes de control recomendados:** Predio, fecha de avalúo, método.

**Observaciones de homologacion:** Bajo el modelo de revaluación (NIC 16), el mayor valor tiene contrapartida en el superávit por revaluación (ORI/patrimonio, 3810). Requiere avalúos técnicos periódicos. Los terrenos no se deprecian, por lo que la revaluación no afecta depreciación. Verificar el avalúo y la consistencia del modelo (todo el grupo de activos).

### 191008 - Valorizaciones de construcciones y edificaciones

| Atributo | Valor |
|---|---|
| Codigo | `191008` |
| Nombre | Valorizaciones de construcciones y edificaciones |
| Cuenta Russell / 4D | Valorizaciones PPE |
| Tipo de rubro | Valorizaciones |
| Naturaleza | Debito (`D`) |
| Padre logico | `1910` |
| Critica | no |

**Que incluye:** Mayor valor de construcciones y edificaciones por el modelo de revaluación (NIC 16) o saldos históricos de valorización, con contrapartida en el superávit por revaluación (patrimonio, 3810).

**Que no incluye:** Las construcciones al costo (1516). Valorizaciones de terrenos (191004). Valorizaciones de inversiones (1905). Depreciación (159205) y deterioro (159916).

**Cuentas o nombres de cliente que podrian llegar aqui:** Valorizaciones de construcciones, valorización de edificaciones, revaluación de inmuebles, superávit de edificaciones (activo), mayor valor de construcciones, ajuste por revaluación de edificios.

**Soportes o terceros esperados:** Avalúo técnico, soporte de la revaluación, cálculo, tratamiento de la depreciación posterior.

**Soportes de control recomendados:** Inmueble, fecha de avalúo, método.

**Observaciones de homologacion:** Bajo el modelo de revaluación (NIC 16), contrapartida en superávit por revaluación (ORI/patrimonio, 3810). Requiere avalúos periódicos y revaluar todo el grupo de activos. La depreciación posterior se calcula sobre el valor revaluado. Distinguir del terreno (191004). Verificar avalúo y consistencia del modelo.

## Clase 2 - Pasivo

### 210505 - Sobregiros bancarios nacionales

| Atributo | Valor |
|---|---|
| Codigo | `210505` |
| Nombre | Sobregiros bancarios nacionales |
| Cuenta Russell / 4D | Bancos nacionales |
| Tipo de rubro | Obligaciones financieras |
| Naturaleza | Credito (`C`) |
| Padre logico | `2105` |
| Critica | no |

**Que incluye:** Saldos en rojo (sobregiros) de cuentas corrientes con bancos nacionales, ya sean pactados (cupo de sobregiro autorizado) o no pactados (descubierto). Surge cuando el saldo conciliado de la cuenta bancaria es acreedor. Aplica de forma transversal a cualquier sector.

**Que no incluye:** Saldos débito de bancos (van al activo, 1110). Pagarés y créditos rotativos formalizados (210510). Tarjetas de crédito corporativas (clasificar como obligación financiera específica). Cheques girados no cobrados que no generan sobregiro real (revisar conciliación).

**Cuentas o nombres de cliente que podrian llegar aqui:** Sobregiro bancario, descubierto en cuenta corriente, sobregiro Bancolombia, sobregiro Davivienda, cupo de sobregiro utilizado, saldo rojo banco, sobregiro contable por conciliación, sobregiro técnico, overdraft nacional, sobregiro cuenta corriente operativa.

**Soportes o terceros esperados:** Extracto bancario, conciliación bancaria, contrato de cupo de sobregiro, certificación de la entidad financiera.

**Soportes de control recomendados:** Entidad financiera, número de cuenta, unidad de negocio.

**Observaciones de homologacion:** Verificar que el sobregiro sea real y no producto de partidas conciliatorias (cheques girados no cobrados, notas pendientes). Si tras conciliar la cuenta queda en débito, reclasificar al activo. El sobregiro contable no respaldado por un cupo formal debe revelarse.

### 210510 - Pagarés bancos nacionales

| Atributo | Valor |
|---|---|
| Codigo | `210510` |
| Nombre | Pagarés bancos nacionales |
| Cuenta Russell / 4D | Bancos nacionales |
| Tipo de rubro | Obligaciones financieras |
| Naturaleza | Credito (`C`) |
| Padre logico | `2105` |
| Critica | no |

**Que incluye:** Obligaciones formalizadas mediante pagaré, crédito de tesorería, crédito rotativo, crédito ordinario o de libre inversión con bancos nacionales. Incluye capital de créditos de corto y largo plazo (separar porción corriente/no corriente según política). Transversal a todos los sectores: capital de trabajo en manufactura y retail, créditos puente en construcción, financiación de flota en transporte.

**Que no incluye:** Sobregiros (210505). Leasing financiero (211520/212020). Obligaciones con el exterior (211010/213005). Intereses causados por pagar (233505 o cuenta de gastos financieros por pagar). Obligaciones con particulares o socios (219505/219520).

**Cuentas o nombres de cliente que podrian llegar aqui:** Pagaré bancario, crédito ordinario, crédito de tesorería, crédito rotativo, crédito de libre inversión, crédito de fomento, obligación bancaria nacional, préstamo bancario, crédito capital de trabajo, crédito sindicado nacional, financiación bancaria, crédito Bancóldex redescuento, crédito Finagro.

**Soportes o terceros esperados:** Pagaré, contrato de crédito, tabla de amortización, extracto de la obligación, certificación bancaria de saldos, comprobante de desembolso.

**Soportes de control recomendados:** Entidad financiera, número de obligación, tasa, plazo, porción corriente/no corriente, garantía asociada.

**Observaciones de homologacion:** La naturaleza (deuda con entidad financiera vigilada nacional) prevalece sobre el nombre. Separar capital de intereses. Reclasificar la porción corriente según vencimiento a 12 meses. Créditos de redescuento (Finagro, Bancóldex) siguen siendo obligación con el banco intermediario, no con la entidad de redescuento.

### 211010 - Pagarés bancos del exterior

| Atributo | Valor |
|---|---|
| Codigo | `211010` |
| Nombre | Pagarés bancos del exterior |
| Cuenta Russell / 4D | Bancos del exterior |
| Tipo de rubro | Obligaciones financieras |
| Naturaleza | Credito (`C`) |
| Padre logico | `2110` |
| Critica | no |

**Que incluye:** Obligaciones con bancos del exterior formalizadas por pagaré o contrato de crédito en moneda extranjera. Incluye capital de la deuda medido a la TRM de cierre. Frecuente en importadores (manufactura, retail), holdings con financiación internacional y proyectos de infraestructura.

**Que no incluye:** Obligaciones con otras entidades financieras del exterior no bancarias (213005). Proveedores del exterior por importación de bienes (221005). Diferencia en cambio causada (va a resultados, no al pasivo de capital). Obligaciones con vinculados del exterior (219510 o cuenta de vinculados).

**Cuentas o nombres de cliente que podrian llegar aqui:** Crédito banco del exterior, préstamo en dólares, financiación internacional, crédito offshore, pagaré moneda extranjera, deuda externa bancaria, crédito banca internacional, préstamo USD/EUR, trade finance bancario, línea de crédito exterior.

**Soportes o terceros esperados:** Contrato de crédito internacional, pagaré en ME, registro de endeudamiento externo ante Banco de la República (Formulario 6), tabla de amortización, certificación del banco extranjero.

**Soportes de control recomendados:** Entidad, moneda, TRM de cierre, número de registro de endeudamiento externo, porción corriente/no corriente.

**Observaciones de homologacion:** Medir a TRM de cierre (NIC 21); la diferencia en cambio va a resultados. Verificar registro de endeudamiento externo ante el Banco de la República. Distinguir crédito bancario de financiación de proveedor del exterior, que es deuda comercial (221005).

### 211520 - Leasing financiero - corporaciones financieras

| Atributo | Valor |
|---|---|
| Codigo | `211520` |
| Nombre | Leasing financiero - corporaciones financieras |
| Cuenta Russell / 4D | Corporaciones financieras |
| Tipo de rubro | Obligaciones financieras |
| Naturaleza | Credito (`C`) |
| Padre logico | `2115` |
| Critica | no |

**Que incluye:** Pasivo por arrendamiento financiero (leasing) contratado con corporaciones financieras, reconocido bajo NIIF 16 / NIC 17 como obligación por el valor presente de los cánones. Incluye leasing de maquinaria (manufactura, construcción), vehículos y flota (transporte), equipos médicos (salud), inmuebles (leasing inmobiliario) y tecnología.

**Que no incluye:** Arrendamiento operativo sin reconocimiento de pasivo financiero (gasto). Leasing con compañías de financiamiento comercial (212020). Cánones por pagar ya causados del mes (cuentas por pagar). Opción de compra ya ejercida (el bien pasa a PPE y se cancela el pasivo).

**Cuentas o nombres de cliente que podrian llegar aqui:** Leasing financiero, pasivo por arrendamiento NIIF 16, obligación leasing maquinaria, leasing vehículos, leasing inmobiliario, canon leasing por pagar (capital), leasing equipo médico, leasing tecnológico, arrendamiento financiero corporación, deuda por derecho de uso.

**Soportes o terceros esperados:** Contrato de leasing, tabla de amortización de cánones, cálculo del valor presente, registro del activo por derecho de uso, certificación de la corporación financiera.

**Soportes de control recomendados:** Entidad, contrato, bien arrendado, valor presente, porción corriente/no corriente, opción de compra.

**Observaciones de homologacion:** Bajo NIIF 16 casi todo arrendamiento genera pasivo. Distinguir leasing financiero (pasivo) de arrendamiento operativo de bajo valor o corto plazo (gasto). El nombre del cliente puede decir 'arriendo' pero si hay reconocimiento de derecho de uso es pasivo financiero. Separar capital de intereses implícitos.

### 212020 - Leasing financiero - compañías de financiamiento

| Atributo | Valor |
|---|---|
| Codigo | `212020` |
| Nombre | Leasing financiero - compañías de financiamiento |
| Cuenta Russell / 4D | Compañías de financiamiento comercial |
| Tipo de rubro | Obligaciones financieras |
| Naturaleza | Credito (`C`) |
| Padre logico | `2120` |
| Critica | no |

**Que incluye:** Pasivo por leasing financiero contratado con compañías de financiamiento comercial. Misma naturaleza que 211520 pero con tipo distinto de entidad. Muy común en leasing de vehículos, flota de transporte, maquinaria amarilla en construcción y equipo productivo en pymes.

**Que no incluye:** Leasing con corporaciones financieras (211520). Crédito de consumo o rotativo de la misma compañía (clasificar como pagaré/obligación). Arrendamiento operativo. Cánones causados del periodo.

**Cuentas o nombres de cliente que podrian llegar aqui:** Leasing compañía de financiamiento, leasing vehicular, leasing flota, leasing maquinaria amarilla, arrendamiento financiero CFC, obligación leasing CFC, leasing equipo productivo, pasivo derecho de uso CFC, leasing operativo financiero, canon capital por pagar CFC.

**Soportes o terceros esperados:** Contrato de leasing, tabla de amortización, cálculo de valor presente, registro de derecho de uso, certificación de la CFC.

**Soportes de control recomendados:** Entidad, contrato, bien arrendado, valor presente, porción corriente/no corriente.

**Observaciones de homologacion:** La diferencia con 211520 es únicamente el tipo de entidad (CFC vs corporación financiera). Verificar la naturaleza de la entidad en la certificación. Aplican los mismos criterios NIIF 16.

### 213005 - Obligaciones con entidades financieras del exterior

| Atributo | Valor |
|---|---|
| Codigo | `213005` |
| Nombre | Obligaciones con entidades financieras del exterior |
| Cuenta Russell / 4D | Entidades financieras del exterior |
| Tipo de rubro | Obligaciones financieras |
| Naturaleza | Credito (`C`) |
| Padre logico | `2130` |
| Critica | no |

**Que incluye:** Obligaciones con entidades financieras del exterior NO bancarias: fondos de deuda, multilaterales (BID, CAF, IFC), agencias de crédito a la exportación, financieras internacionales. Capital medido a TRM de cierre. Frecuente en holdings, infraestructura, energía y grandes proyectos.

**Que no incluye:** Pagarés con bancos del exterior (211010). Proveedores del exterior (221005). Vinculados del exterior (cuenta de vinculados). Diferencia en cambio causada.

**Cuentas o nombres de cliente que podrian llegar aqui:** Crédito multilateral, deuda con CAF, crédito IFC, crédito BID Invest, financiación ECA, crédito fondo de deuda exterior, obligación financiera offshore, project finance exterior, club deal internacional, deuda mezzanine exterior.

**Soportes o terceros esperados:** Contrato de financiación, registro de endeudamiento externo, tabla de amortización, covenants financieros, certificación de la entidad.

**Soportes de control recomendados:** Entidad, moneda, TRM, registro de endeudamiento externo, covenants, porción corriente/no corriente.

**Observaciones de homologacion:** Distinguir entidad bancaria (211010) de no bancaria/multilateral (213005). Revisar covenants para riesgo de negocio en marcha (NIA 570) y posible reclasificación de no corriente a corriente por incumplimiento de covenants.

### 219505 - Obligaciones financieras con particulares

| Atributo | Valor |
|---|---|
| Codigo | `219505` |
| Nombre | Obligaciones financieras con particulares |
| Cuenta Russell / 4D | Otras obligaciones financieras |
| Tipo de rubro | Obligaciones financieras |
| Naturaleza | Credito (`C`) |
| Padre logico | `2195` |
| Critica | no |

**Que incluye:** Préstamos recibidos de personas naturales o jurídicas NO vigiladas (particulares, terceros prestamistas) que generan intereses. Común en pymes, ESAL y empresas familiares que se financian con terceros distintos al sistema financiero.

**Que no incluye:** Préstamos de socios o accionistas (219520). Préstamos de vinculados económicos (219510). Cuentas por pagar comerciales a proveedores (2205). Anticipos de clientes (280505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Préstamo de particular, mutuo con tercero, crédito con persona natural, financiación privada, préstamo de inversionista, deuda con prestamista, crédito extrabancario, obligación con tercero no vigilado, mutuo oneroso, préstamo de financista privado.

**Soportes o terceros esperados:** Contrato de mutuo, pagaré, comprobante de desembolso, certificación del acreedor, soporte de causación de intereses.

**Soportes de control recomendados:** Acreedor, NIT/CC, tasa, plazo, vinculación (verificar que NO sea parte relacionada).

**Observaciones de homologacion:** Verificar que el prestamista no sea parte relacionada disfrazada (NIA 550); de serlo, reclasificar a vinculados/socios. Revisar razonabilidad de la tasa frente a precios de transferencia y posible desconocimiento de intereses por subcapitalización (Art. 118-1 E.T.).

### 219510 - Obligaciones financieras con vinculados

| Atributo | Valor |
|---|---|
| Codigo | `219510` |
| Nombre | Obligaciones financieras con vinculados |
| Cuenta Russell / 4D | Otras obligaciones financieras |
| Tipo de rubro | Obligaciones financieras |
| Naturaleza | Credito (`C`) |
| Padre logico | `2195` |
| Critica | no |

**Que incluye:** Préstamos con intereses recibidos de vinculados económicos (matriz, subsidiarias, hermanas, entidades bajo control común). Típico en holdings o financiación intragrupo.

**Que no incluye:** Préstamos de socios personas naturales (219520). Particulares no vinculados (219505). Cuentas por pagar comerciales a vinculados (222505). Dividendos por pagar a la matriz (236005).

**Cuentas o nombres de cliente que podrian llegar aqui:** Préstamo intercompañía, financiación intragrupo, cuenta de mutuo con matriz, crédito de subsidiaria, cash pooling pasivo, deuda con casa matriz, préstamo de filial, obligación con controlante, financiación de empresa hermana, intercompany loan.

**Soportes o terceros esperados:** Contrato de mutuo intragrupo, estudio de precios de transferencia, tabla de amortización, conciliación intercompañía, certificación del vinculado.

**Soportes de control recomendados:** Vinculado, tipo de vinculación, moneda, tasa, conciliación intercompañía.

**Observaciones de homologacion:** Revelar como parte relacionada (NIC 24). Validar tasa de mercado (precios de transferencia) y límite de subcapitalización (Art. 118-1 E.T.). Conciliar con la cuenta espejo del vinculado para consolidación. Distinguir deuda financiera (con interés) de cuenta corriente comercial.

### 219520 - Obligaciones financieras con socios o accionistas

| Atributo | Valor |
|---|---|
| Codigo | `219520` |
| Nombre | Obligaciones financieras con socios o accionistas |
| Cuenta Russell / 4D | Otras obligaciones financieras |
| Tipo de rubro | Obligaciones financieras |
| Naturaleza | Credito (`C`) |
| Padre logico | `2195` |
| Critica | no |

**Que incluye:** Préstamos con intereses otorgados por socios o accionistas personas naturales a la sociedad. Muy frecuente en pymes y sociedades de familia donde el socio inyecta liquidez vía préstamo en lugar de capitalizar.

**Que no incluye:** Aportes para futuras capitalizaciones (patrimonio o cuenta específica). Dividendos por pagar (236005). Deudas con socios sin interés de naturaleza comercial (235505/235510). Vinculados personas jurídicas (219510).

**Cuentas o nombres de cliente que podrian llegar aqui:** Préstamo de socio, préstamo de accionista, mutuo con socio, financiación del dueño, deuda con accionista, crédito de socio gestor, aporte reembolsable con interés, préstamo del propietario, cuenta por pagar socio (financiera), shareholder loan.

**Soportes o terceros esperados:** Contrato de mutuo, acta que autoriza el préstamo, comprobante de ingreso de los fondos, certificación del socio, soporte de intereses.

**Soportes de control recomendados:** Socio, CC/NIT, tasa, plazo, vinculación.

**Observaciones de homologacion:** Diferenciar préstamo con interés (219520) de cuenta por pagar a socio sin interés (235505). Validar subcapitalización (Art. 118-1) y precios de transferencia. Verificar que no se trate de un aporte de capital encubierto. Riesgo de retención sobre intereses al socio.

### 220505 - Proveedores nacionales

| Atributo | Valor |
|---|---|
| Codigo | `220505` |
| Nombre | Proveedores nacionales |
| Cuenta Russell / 4D | Proveedores nacionales |
| Tipo de rubro | Cuentas por pagar comerciales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2205` |
| Critica | no |

**Que incluye:** Obligaciones por compra de bienes, mercancías, materias primas o servicios directamente asociados al objeto social, con proveedores ubicados en Colombia. Para homologación incorporar: Manufactura: proveedores de materia prima, insumos, empaques, repuestos productivos. Retail/comercio: proveedores de mercancía, marcas, distribuidores mayoristas, importadores nacionales. Construcción: proveedores de materiales (cemento, acero, agregados), ferreterías, concreteras. Salud: proveedores de medicamentos, dispositivos médicos, insumos hospitalarios, droguerías. Transporte/logística: proveedores de combustible, llantas, repuestos, peajes facturados. Educación: proveedores de material didáctico, alimentación, papelería. Tecnología: proveedores de hardware, equipos, infraestructura. Agro: proveedores de semillas, fertilizantes, agroquímicos.

**Que no incluye:** Proveedores del exterior (221005). Proveedores vinculados económicos (222505). Costos y gastos por pagar de servicios indirectos: honorarios, servicios técnicos, arrendamientos, servicios públicos (2335). Contratistas de obra/servicio (232005). Acreedores varios no comerciales (238095). Anticipos a proveedores (activo, 1330).

**Cuentas o nombres de cliente que podrian llegar aqui:** Proveedores nacionales, proveedores de mercancía, proveedores de materia prima, proveedores de insumos, cuentas por pagar comerciales, proveedores droguerías, proveedores materiales construcción, proveedores combustible, proveedores hardware, proveedores nacionales bienes, proveedores de productos, acreedores comerciales nacionales, proveedores de inventario, proveedores marca propia, proveedores de empaque.

**Soportes o terceros esperados:** Factura electrónica de venta del proveedor (recibida), orden de compra, remisión, entrada de almacén, contrato de suministro, conciliación de cuenta con proveedor, soporte de pago.

**Soportes de control recomendados:** Proveedor, NIT, antigüedad del saldo, línea de producto, centro de costo, condición de pago.

**Observaciones de homologacion:** La naturaleza (deuda comercial por bienes/servicios del giro con tercero nacional independiente) prevalece sobre el nombre. Separar lo que es servicio indirecto (va a 2335) de bien/servicio del giro (2205). Verificar partidas débito en proveedores (anticipos) que deben reclasificarse al activo. Cruzar con búsqueda de pasivos no registrados (NIA 501) y con cuentas por cobrar del proveedor.

### 221005 - Proveedores del exterior

| Atributo | Valor |
|---|---|
| Codigo | `221005` |
| Nombre | Proveedores del exterior |
| Cuenta Russell / 4D | Proveedores del exterior |
| Tipo de rubro | Cuentas por pagar comerciales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2210` |
| Critica | no |

**Que incluye:** Obligaciones comerciales por importación de bienes o servicios con proveedores del exterior, medidas a TRM de cierre. Retail/manufactura: importación de mercancía y materia prima, CIF/FOB pendientes de pago. Tecnología: licencias y equipos importados, SaaS internacional facturado. Salud: dispositivos y medicamentos importados. Construcción: equipos y maquinaria importada. Transporte: repuestos y vehículos importados.

**Que no incluye:** Proveedores nacionales (220505). Vinculados del exterior (cuenta de vinculados / 222505 si aplica). Obligaciones financieras con bancos del exterior (211010). Diferencia en cambio causada (resultados). Aranceles e IVA de importación (impuestos por pagar / mayor valor del inventario). Anticipos a proveedores del exterior (activo).

**Cuentas o nombres de cliente que podrian llegar aqui:** Proveedores del exterior, importaciones por pagar, cuentas por pagar moneda extranjera, proveedores USD, foreign suppliers, acreedores del exterior, proveedor internacional, cuenta por pagar importación, licencias del exterior por pagar, SaaS internacional por pagar, proveedor CIF, proveedor FOB, mercancía en tránsito por pagar, proveedor de equipos importados.

**Soportes o terceros esperados:** Factura comercial (invoice), documento de transporte (BL/AWB), declaración de importación (DIM), giro al exterior, registro cambiario, conciliación con el proveedor.

**Soportes de control recomendados:** Proveedor, país, moneda, TRM, Incoterm, declaración de importación, antigüedad.

**Observaciones de homologacion:** Medir a TRM de cierre (NIC 21); diferencia en cambio a resultados. Distinguir deuda comercial (221005) de financiación bancaria del exterior (211010) y de financiación del propio proveedor a plazo (sigue siendo comercial salvo que se documente como crédito). Verificar mercancía en tránsito y corte de importaciones.

### 222505 - Proveedores vinculados económicos

| Atributo | Valor |
|---|---|
| Codigo | `222505` |
| Nombre | Proveedores vinculados económicos |
| Cuenta Russell / 4D | Compañías vinculadas |
| Tipo de rubro | Cuentas por pagar comerciales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2225` |
| Critica | no |

**Que incluye:** Obligaciones comerciales (compra de bienes/servicios del giro) con vinculados económicos: matriz, subsidiarias, hermanas, entidades bajo control común. Común en grupos con centralización de compras, holdings que facturan servicios compartidos o manufactura intragrupo. Incluye compras de mercancía a la comercializadora del grupo, materia prima a la productora vinculada, servicios facturados por la matriz.

**Que no incluye:** Proveedores nacionales independientes (220505). Proveedores del exterior independientes (221005). Préstamos financieros de vinculados (219510). Dividendos por pagar a la matriz (236005). Cuentas corrientes de mutuo sin contenido comercial.

**Cuentas o nombres de cliente que podrian llegar aqui:** Proveedor vinculado, compras intercompañía, cuenta por pagar a matriz (comercial), proveedor filial, suministro intragrupo, compras a empresa hermana, servicios compartidos por pagar, cuenta por pagar comercial vinculado, intercompany payable, proveedor del grupo, facturación intragrupo por pagar, compras a la controlante.

**Soportes o terceros esperados:** Factura electrónica intragrupo, contrato de suministro o de servicios compartidos, estudio de precios de transferencia, conciliación intercompañía, soporte de pago.

**Soportes de control recomendados:** Vinculado, tipo de vinculación, naturaleza (bien/servicio), conciliación intercompañía.

**Observaciones de homologacion:** Revelar como parte relacionada (NIC 24) y validar precios de transferencia. Conciliar con la cuenta espejo del vinculado para eliminación en consolidación. Distinguir saldo comercial (222505) de saldo financiero con interés (219510). Verificar realidad económica de servicios facturados (NIA 550, riesgo de fraude/erosión de base).

### 232005 - Cuentas por pagar a contratistas

| Atributo | Valor |
|---|---|
| Codigo | `232005` |
| Nombre | Cuentas por pagar a contratistas |
| Cuenta Russell / 4D | A contratistas |
| Tipo de rubro | Cuentas por pagar |
| Naturaleza | Credito (`C`) |
| Padre logico | `2320` |
| Critica | no |

**Que incluye:** Obligaciones con contratistas por ejecución de obras o prestación de servicios mediante contrato (no relación laboral). Construcción: subcontratistas de obra civil, actas de avance aprobadas por pagar, cortes de obra a subcontratistas, retención en garantía (retegarantía) por pagar al contratista. Manufactura/servicios: maquila, contratos de servicios tercerizados (outsourcing). Salud: contratos por evento o cápita con IPS/profesionales independientes. Transporte: contratistas de transporte (terceros propietarios de vehículos), comisionistas de carga. Tecnología: desarrollo de software por contrato, fábrica de software.

**Que no incluye:** Proveedores de bienes (220505). Honorarios profesionales sueltos sin contrato de obra (233525). Nómina y prestaciones de empleados (25xx). Anticipos entregados a contratistas (activo). Servicios públicos, arrendamientos (2335).

**Cuentas o nombres de cliente que podrian llegar aqui:** Cuentas por pagar a contratistas, subcontratistas por pagar, actas de obra por pagar, cortes de obra, retención en garantía por pagar, maquila por pagar, outsourcing por pagar, contratistas de obra civil, tercerización por pagar, fábrica de software por pagar, contratos por evento (salud), terceros transportadores por pagar, contratistas independientes, obra por administración por pagar.

**Soportes o terceros esperados:** Contrato de obra/servicio, acta de avance o de obra aprobada, factura del contratista, corte de obra, soporte de retención en garantía, conciliación con el contratista.

**Soportes de control recomendados:** Contratista, NIT, contrato, obra/proyecto, acta, retención en garantía, antigüedad.

**Observaciones de homologacion:** Distinguir contratista (ejecuta obra/servicio con autonomía, factura) de empleado (nómina) y de proveedor de bienes (2205). En construcción es crítico separar el acta aprobada por pagar de la retención en garantía retenida. Verificar realidad del servicio y soporte de seguridad social del contratista (riesgo UGPP y rechazo de costo, Art. 87-1).

### 233505 - Gastos financieros por pagar

| Atributo | Valor |
|---|---|
| Codigo | `233505` |
| Nombre | Gastos financieros por pagar |
| Cuenta Russell / 4D | Costos y gastos por pagar |
| Tipo de rubro | Cuentas por pagar |
| Naturaleza | Credito (`C`) |
| Padre logico | `2335` |
| Critica | no |

**Que incluye:** Intereses y demás gastos financieros causados y pendientes de pago: intereses de créditos bancarios, intereses de leasing, comisiones financieras causadas, GMF causado, intereses de mora a entidades financieras. Transversal a todos los sectores con endeudamiento.

**Que no incluye:** Capital de las obligaciones financieras (21xx). Comisiones comerciales a terceros (233520). Diferencia en cambio. Intereses sobre cesantías laborales (251505). Sanciones e intereses tributarios (van a impuestos por pagar / provisiones).

**Cuentas o nombres de cliente que podrian llegar aqui:** Intereses por pagar, gastos financieros causados, intereses bancarios por pagar, comisiones bancarias por pagar, GMF por pagar, intereses de leasing por pagar, intereses de mora financieros, causación de intereses, financial accruals, intereses de obligaciones por pagar.

**Soportes o terceros esperados:** Extracto bancario, tabla de amortización, liquidación de intereses, soporte de causación.

**Soportes de control recomendados:** Entidad, obligación asociada, periodo de causación.

**Observaciones de homologacion:** Separar el gasto financiero causado (este rubro) del capital de la obligación (21xx). Verificar causación de intereses al cierre por el principio de devengo (corte, NIA 240). Validar deducibilidad y límite de subcapitalización (Art. 118-1 E.T.).

### 233510 - Gastos legales por pagar

| Atributo | Valor |
|---|---|
| Codigo | `233510` |
| Nombre | Gastos legales por pagar |
| Cuenta Russell / 4D | Costos y gastos por pagar |
| Tipo de rubro | Cuentas por pagar |
| Naturaleza | Credito (`C`) |
| Padre logico | `2335` |
| Critica | no |

**Que incluye:** Obligaciones por trámites y gastos legales: registro mercantil, notariales, autenticaciones, derechos de cámara de comercio, registros de instrumentos públicos, tasas y derechos legales causados pendientes de pago. Transversal.

**Que no incluye:** Honorarios de abogados (233525). Provisión de contingencias legales/litigios (263505/263520/263540). Sanciones y multas (impuestos / provisiones). Costas judiciales provisionadas.

**Cuentas o nombres de cliente que podrian llegar aqui:** Gastos legales por pagar, derechos notariales por pagar, registro mercantil por pagar, gastos de cámara de comercio, registro de instrumentos públicos, tasas legales por pagar, autenticaciones por pagar, derechos de registro, trámites legales por pagar, gastos de constitución por pagar.

**Soportes o terceros esperados:** Factura o cuenta de cobro, liquidación de derechos, recibo de notaría/cámara de comercio.

**Soportes de control recomendados:** Tercero, tipo de trámite, entidad.

**Observaciones de homologacion:** No confundir el trámite legal (este rubro) con el honorario del abogado (233525) ni con la provisión por litigio (2635). Es un gasto operativo, no una contingencia.

### 233520 - Comisiones por pagar

| Atributo | Valor |
|---|---|
| Codigo | `233520` |
| Nombre | Comisiones por pagar |
| Cuenta Russell / 4D | Costos y gastos por pagar |
| Tipo de rubro | Cuentas por pagar |
| Naturaleza | Credito (`C`) |
| Padre logico | `2335` |
| Critica | no |

**Que incluye:** Comisiones causadas pendientes de pago a terceros por intermediación o ventas. Retail/comercio: comisiones a vendedores externos, comisiones a marketplaces y pasarelas de pago, comisiones a franquiciados. Salud: comisiones a corredores de seguros/EPS, intermediación. Transporte: comisiones a agencias de carga, brokers logísticos. Tecnología: comisiones a partners, afiliados, app stores. Servicios financieros: comisiones a corredores y agentes. Manufactura: comisiones a representantes de ventas.

**Que no incluye:** Comisiones bancarias/financieras (233505). Honorarios profesionales (233525). Salarios y comisiones laborales de empleados (250505/2530). Comisiones de tarjetas que son menor valor del recaudo.

**Cuentas o nombres de cliente que podrian llegar aqui:** Comisiones por pagar, comisiones de ventas, comisiones a intermediarios, comisiones marketplace, comisiones pasarela de pago, comisiones a corredores, comisiones a agentes, comisiones de carga, comisiones de afiliados, comisiones a partners, comisiones app store, comisiones a representantes, comisiones de intermediación, fee de intermediación por pagar.

**Soportes o terceros esperados:** Factura o cuenta de cobro, contrato de comisión/intermediación, liquidación de comisiones, soporte de la venta que la origina.

**Soportes de control recomendados:** Tercero, NIT, contrato, base de liquidación, canal.

**Observaciones de homologacion:** Distinguir comisión a tercero independiente (este rubro) de comisión laboral a empleado (nómina) y de comisión bancaria (233505). Verificar causación contra la venta que la genera (correlación de costos). Validar retención en la fuente por comisiones (236520) y soporte del servicio (realidad).

### 233525 - Honorarios por pagar

| Atributo | Valor |
|---|---|
| Codigo | `233525` |
| Nombre | Honorarios por pagar |
| Cuenta Russell / 4D | Costos y gastos por pagar |
| Tipo de rubro | Cuentas por pagar |
| Naturaleza | Credito (`C`) |
| Padre logico | `2335` |
| Critica | no |

**Que incluye:** Honorarios profesionales causados pendientes de pago a personas naturales o jurídicas por servicios calificados sin subordinación. Transversal: honorarios de abogados, contadores, revisoría fiscal, consultores, asesores tributarios, auditores, ingenieros (diseño/interventoría en construcción), médicos especialistas independientes (salud), arquitectos, profesionales TI (tecnología), docentes catedráticos por honorarios (educación), juntas directivas.

**Que no incluye:** Servicios técnicos (233530, requieren menor componente intelectual). Comisiones (233520). Salarios de empleados (250505). Contratistas de obra (232005). Servicios de mantenimiento (233535). Provisión de honorarios estimados sin causar (260515).

**Cuentas o nombres de cliente que podrian llegar aqui:** Honorarios por pagar, honorarios profesionales, honorarios de asesoría, honorarios de consultoría, honorarios jurídicos, honorarios contables, honorarios de revisoría fiscal, honorarios de auditoría, honorarios de junta directiva, honorarios médicos, honorarios de interventoría, honorarios de diseño, honorarios docentes catedráticos, asesoría externa por pagar, honorarios de interventores.

**Soportes o terceros esperados:** Factura electrónica o cuenta de cobro (no obligado a facturar), contrato de prestación de servicios, soporte de seguridad social del contratista (Art. 87-1), entregable del servicio.

**Soportes de control recomendados:** Tercero, NIT/CC, tipo de honorario, contrato, centro de costo.

**Observaciones de homologacion:** Distinguir honorario (servicio intelectual/profesional autónomo) de servicio técnico (233530) y de salario (subordinación). Verificar retención en la fuente por honorarios (236515) y soporte de seguridad social del prestador para deducibilidad (Art. 87-1, riesgo UGPP). Si está estimado pero no causado con soporte, va a provisión (260515).

### 233530 - Servicios profesionales

| Atributo | Valor |
|---|---|
| Codigo | `233530` |
| Nombre | Servicios profesionales |
| Cuenta Russell / 4D | Costos y gastos por pagar |
| Tipo de rubro | Cuentas por pagar |
| Naturaleza | Credito (`C`) |
| Padre logico | `2335` |
| Critica | no |

**Que incluye:** Obligaciones causadas pendientes de pago por servicios técnicos, tecnológicos, mantenimiento, reparación, asistencia técnica, soporte especializado, calibraciones, montajes, adecuaciones menores, mantenimiento preventivo o correctivo, mantenimiento locativo, de equipos, flota, infraestructura, software, data centers, maquinaria, equipos biomédicos y otros servicios ejecutados por terceros que no correspondan a compra pura de bienes ni a mejoras capitalizables. Aplica cuando el servicio conserva, repara, ajusta, mantiene, soporta o pone en funcionamiento un activo, proceso o infraestructura, sin generar un activo nuevo ni aumentar de forma significativa la vida útil, capacidad o rendimiento del bien.

**Que no incluye:** Honorarios profesionales de alto componente intelectual: 233525. Servicios públicos: 233550. Compra de repuestos sin servicio: proveedores / 2205. Contratistas de obra: 232005 o cuenta específica. Licencias de software capitalizables o intangibles: activo intangible o gasto, según análisis. Mejoras que aumentan vida útil, capacidad, eficiencia o rendimiento del activo: propiedades, planta y equipo.

**Cuentas o nombres de cliente que podrian llegar aqui:** Servicios técnicos por pagar, soporte técnico, implementación, parametrización, hosting técnico, asistencia técnica, calibración, ensayos de laboratorio, topografía, estudios de suelos, mantenimiento de equipos, mantenimiento de planta, mantenimiento locativo, mantenimiento biomédico, mantenimiento de flota, taller por pagar, reparaciones, mantenimiento preventivo, mantenimiento correctivo, mantenimiento de infraestructura, mantenimiento de software, aseo con mantenimiento, adecuaciones menores, montajes técnicos.

**Soportes o terceros esperados:** Factura electrónica, contrato u orden de servicio, orden de trabajo, reporte de servicio ejecutado, acta de recibo, entregable técnico, evidencia de prestación del servicio, soporte de seguridad social cuando aplique, certificación de retención practicada si corresponde.

**Soportes de control recomendados:** Tercero, NIT, tipo de servicio, contrato u orden de servicio, centro de costo, activo intervenido cuando aplique, tipo de mantenimiento preventivo/correctivo, periodo de causación, área solicitante, responsable de aprobación.

**Observaciones de homologacion:** Validar la realidad económica del servicio para no confundir servicios técnicos con honorarios profesionales, porque puede cambiar la retención aplicable. Diferenciar mantenimiento gasto de mejora capitalizable: el mantenimiento conserva el activo; la mejora aumenta vida útil, capacidad, eficiencia o rendimiento. Verificar que repuestos con instalación no se dupliquen como compra de inventario/proveedor y como mantenimiento. Asistencia técnica del exterior puede tener tratamiento tributario especial. Validar causación, soporte, retención en la fuente, IVA, centro de costo y periodo correcto.

### 233540 - Servicios recurrentes, arrendamientos, transporte y servicios públicos por pagar

| Atributo | Valor |
|---|---|
| Codigo | `233540` |
| Nombre | Servicios recurrentes, arrendamientos, transporte y servicios públicos por pagar |
| Cuenta Russell / 4D | Costos y gastos por pagar |
| Tipo de rubro | Cuentas por pagar |
| Naturaleza | Credito (`C`) |
| Padre logico | `2335` |
| Critica | no |

**Que incluye:** Obligaciones causadas pendientes de pago por servicios recurrentes o contractuales recibidos de terceros, tales como arrendamientos operativos o cánones corrientes que no generen pasivo por derecho de uso, alquileres de bajo valor o corto plazo, transporte, fletes, acarreos, mensajería, distribución, última milla, servicios públicos domiciliarios, energía, acueducto, gas, aseo, telefonía, internet y telecomunicaciones. Incluye servicios necesarios para la operación administrativa, comercial, logística, productiva o de apoyo, siempre que correspondan a servicios ya devengados y pendientes de pago.

**Que no incluye:** Pasivos por arrendamiento bajo NIIF 16 o derecho de uso. Leasing financiero. Arrendamientos que deban reconocerse como pasivo financiero. Compra de bienes o repuestos sin servicio asociado. Fletes de compra que deban capitalizarse como mayor valor del inventario. Fletes que correspondan al costo principal de empresas cuyo objeto social es transporte. Mejoras capitalizables en activos. Servicios técnicos especializados, mantenimiento o soporte técnico que deban ir a cuenta específica. Administración de propiedad horizontal si se maneja separada. Energía o servicios que deban reconocerse como costo directo de producción según el modelo de costeo.

**Cuentas o nombres de cliente que podrian llegar aqui:** Arrendamientos por pagar, canon de arrendamiento por pagar, arriendo de local, bodega, oficina, patios o coworking por pagar, alquiler de equipos de corto plazo, fletes por pagar, transportes por pagar, acarreos por pagar, distribución por pagar, última milla, mensajería, courier, transporte de carga, transporte de materiales, servicios públicos por pagar, energía, acueducto, gas, aseo, telefonía, internet, telecomunicaciones, agua, alumbrado y servicios domiciliarios por pagar.

**Soportes o terceros esperados:** Contrato de arrendamiento, factura electrónica, cuenta de cobro, soporte de causación del canon, orden de servicio, remesa terrestre de carga, manifiesto de carga, soporte de entrega, factura de servicios públicos, lectura o soporte de consumo, evidencia de servicio recibido.

**Soportes de control recomendados:** Tercero, NIT, tipo de servicio, contrato, periodo causado, sede, inmueble o bien arrendado, ruta o destino cuando aplique, centro de costo, área usuaria, tipo de gasto o costo, responsable de aprobación.

**Observaciones de homologacion:** Validar la naturaleza del servicio antes de homologar. En arrendamientos, revisar si el contrato genera derecho de uso bajo NIIF 16 o si aplica excepción de corto plazo o bajo valor. En transporte, diferenciar fletes de distribución de fletes capitalizables al inventario o costos directos del negocio de transporte. En servicios públicos, causar consumos devengados no facturados al cierre. Revisar retenciones aplicables por arrendamientos, transporte y servicios. No usar esta cuenta para ocultar gastos técnicos, mantenimientos, compras de bienes o activos capitalizables.

### 233555 - Seguros por pagar

| Atributo | Valor |
|---|---|
| Codigo | `233555` |
| Nombre | Seguros por pagar |
| Cuenta Russell / 4D | Costos y gastos por pagar |
| Tipo de rubro | Cuentas por pagar |
| Naturaleza | Credito (`C`) |
| Padre logico | `2335` |
| Critica | no |

**Que incluye:** Primas de seguros causadas pendientes de pago: pólizas de todo riesgo, responsabilidad civil, cumplimiento, vida, transporte de mercancía, SOAT de flota, seguros de obra (construcción), pólizas de cumplimiento de contratos. Transversal.

**Que no incluye:** Seguros pagados por anticipado no devengados (activo, gastos pagados por anticipado 1705). Comisiones del corredor de seguros (233520). Aportes a ARL (237006). Provisión de garantías (2640).

**Cuentas o nombres de cliente que podrian llegar aqui:** Seguros por pagar, primas de seguro por pagar, pólizas por pagar, SOAT por pagar, seguro de cumplimiento por pagar, póliza todo riesgo por pagar, RC por pagar, seguro de transporte por pagar, seguro de obra por pagar, seguro de vida grupal por pagar.

**Soportes o terceros esperados:** Factura/cuenta de cobro de la aseguradora, póliza, soporte de causación, financiación de prima si aplica.

**Soportes de control recomendados:** Aseguradora, póliza, ramo, vigencia, bien asegurado.

**Observaciones de homologacion:** Separar la prima devengada por pagar (este rubro) de la prima pagada por anticipado no devengada (activo). Si la prima se financió, parte puede ser obligación financiera. Verificar correlación de la vigencia con el periodo.

### 233595 - Otros costos y gastos por pagar

| Atributo | Valor |
|---|---|
| Codigo | `233595` |
| Nombre | Otros costos y gastos por pagar |
| Cuenta Russell / 4D | Costos y gastos por pagar |
| Tipo de rubro | Cuentas por pagar |
| Naturaleza | Credito (`C`) |
| Padre logico | `2335` |
| Critica | no |

**Que incluye:** Costos y gastos causados por pagar no clasificables en las subcuentas específicas de 2335: suscripciones, membresías, gastos de viaje por reembolsar, publicidad menor, papelería, cafetería, gastos varios de operación causados.

**Que no incluye:** Cualquier concepto con subcuenta específica (honorarios, comisiones, servicios técnicos, mantenimiento, arrendamientos, fletes, servicios públicos, seguros). Proveedores de bienes (2205). Acreedores varios no operativos (238095).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros gastos por pagar, gastos varios por pagar, suscripciones por pagar, membresías por pagar, publicidad por pagar, gastos de viaje por pagar, papelería por pagar, gastos diversos por pagar, otros costos por pagar, reembolsos por pagar.

**Soportes o terceros esperados:** Factura/cuenta de cobro, soporte del gasto, autorización.

**Soportes de control recomendados:** Tercero, concepto, centro de costo.

**Observaciones de homologacion:** Cuenta residual: usar solo cuando no aplique una subcuenta específica de 2335. Revisar periódicamente para reclasificar conceptos recurrentes a su cuenta propia. Vigilar que no se use para ocultar partidas sin soporte.

### 235505 - Deudas con accionistas

| Atributo | Valor |
|---|---|
| Codigo | `235505` |
| Nombre | Deudas con accionistas |
| Cuenta Russell / 4D | Deudas con accionistas o socios |
| Tipo de rubro | Cuentas por pagar |
| Naturaleza | Credito (`C`) |
| Padre logico | `2355` |
| Critica | no |

**Que incluye:** Deudas de naturaleza NO financiera (sin interés) con accionistas: reembolsos de gastos pagados por el accionista a nombre de la sociedad, cuentas corrientes comerciales con el accionista, saldos por liquidar a favor del accionista distintos de dividendos y préstamos.

**Que no incluye:** Préstamos financieros con interés de accionistas (219520). Dividendos por pagar (236005). Aportes para futura capitalización (patrimonio). Deudas con socios no accionistas (235510).

**Cuentas o nombres de cliente que podrian llegar aqui:** Deudas con accionistas, cuenta por pagar accionista, reembolso a accionista, cuenta corriente accionista, saldo a favor accionista, gastos asumidos por accionista, cuenta socio (no financiera), acreedor accionista.

**Soportes o terceros esperados:** Soporte del gasto reembolsable, acta, conciliación de la cuenta con el accionista.

**Soportes de control recomendados:** Accionista, CC/NIT, naturaleza del saldo.

**Observaciones de homologacion:** Revelar como parte relacionada (NIC 24). Distinguir de préstamo financiero (219520) y de dividendo (236005). Verificar que no encubra distribución de utilidades sin retención. Validar realidad y soporte de los reembolsos.

### 235510 - Deudas con socios

| Atributo | Valor |
|---|---|
| Codigo | `235510` |
| Nombre | Deudas con socios |
| Cuenta Russell / 4D | Deudas con accionistas o socios |
| Tipo de rubro | Cuentas por pagar |
| Naturaleza | Credito (`C`) |
| Padre logico | `2355` |
| Critica | no |

**Que incluye:** Deudas de naturaleza no financiera con socios (en sociedades de personas/SAS): reembolsos, cuentas corrientes comerciales, saldos por liquidar al socio distintos de préstamos con interés y de participaciones.

**Que no incluye:** Préstamos con interés de socios (219520). Participaciones por pagar (236010). Aportes para futura capitalización (patrimonio). Deudas con accionistas (235505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Deudas con socios, cuenta por pagar socio, reembolso a socio, cuenta corriente socio, saldo a favor socio, gastos asumidos por socio, acreedor socio, cuenta socio gestor.

**Soportes o terceros esperados:** Soporte del gasto reembolsable, acta, conciliación con el socio.

**Soportes de control recomendados:** Socio, CC/NIT, naturaleza del saldo.

**Observaciones de homologacion:** Misma lógica que 235505 pero para socios. Revelar como parte relacionada. Verificar que no encubra retiros de utilidades. Diferenciar saldo comercial de préstamo con interés (219520).

### 236005 - Dividendos por pagar

| Atributo | Valor |
|---|---|
| Codigo | `236005` |
| Nombre | Dividendos por pagar |
| Cuenta Russell / 4D | Dividendos o participaciones por pagar |
| Tipo de rubro | Cuentas por pagar |
| Naturaleza | Credito (`C`) |
| Padre logico | `2360` |
| Critica | no |

**Que incluye:** Dividendos decretados por la asamblea pendientes de pago a accionistas (sociedades por acciones: S.A., SAS). Surge del acta de distribución de utilidades. Transversal.

**Que no incluye:** Participaciones por pagar en sociedades de personas (236010). Utilidades no distribuidas (patrimonio). Préstamos a accionistas. Deudas comerciales con accionistas (235505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Dividendos por pagar, dividendos decretados, dividendos por distribuir, dividendos pendientes, dividendos causados, dividendo preferencial por pagar, dividendos a accionistas.

**Soportes o terceros esperados:** Acta de asamblea que decreta dividendos, proyecto de distribución de utilidades, soporte de retención sobre dividendos.

**Soportes de control recomendados:** Accionista, participación, fecha de decreto, retención aplicable.

**Observaciones de homologacion:** Reconocer solo cuando están decretados por el órgano competente (acta). Verificar retención en la fuente sobre dividendos (236510) según gravabilidad y régimen del Art. 242 E.T. Revelar como parte relacionada.

### 236010 - Participaciones por pagar

| Atributo | Valor |
|---|---|
| Codigo | `236010` |
| Nombre | Participaciones por pagar |
| Cuenta Russell / 4D | Dividendos o participaciones por pagar |
| Tipo de rubro | Cuentas por pagar |
| Naturaleza | Credito (`C`) |
| Padre logico | `2360` |
| Critica | no |

**Que incluye:** Participaciones de utilidades decretadas pendientes de pago a socios en sociedades de personas y similares (Ltda., en comandita). Equivalente al dividendo pero en sociedades no accionarias.

**Que no incluye:** Dividendos en sociedades por acciones (236005). Utilidades retenidas (patrimonio). Préstamos a socios. Deudas comerciales con socios (235510).

**Cuentas o nombres de cliente que podrian llegar aqui:** Participaciones por pagar, participaciones decretadas, utilidades por distribuir a socios, participaciones pendientes, reparto de utilidades por pagar, participación social por pagar.

**Soportes o terceros esperados:** Acta de junta de socios que decreta participaciones, proyecto de distribución, soporte de retención.

**Soportes de control recomendados:** Socio, participación, fecha de decreto, retención.

**Observaciones de homologacion:** Misma lógica que dividendos pero para sociedades de personas. Reconocer solo si están decretadas. Verificar retención y régimen tributario aplicable.

### 236505 - Retención en la fuente por salarios y pagos laborales

| Atributo | Valor |
|---|---|
| Codigo | `236505` |
| Nombre | Retención en la fuente por salarios y pagos laborales |
| Cuenta Russell / 4D | Retención en la fuente |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2365` |
| Critica | no |

**Que incluye:** Retención en la fuente practicada sobre pagos laborales (procedimiento 1 o 2) pendiente de declarar y consignar a la DIAN. Transversal a toda entidad con empleados.

**Que no incluye:** Aportes de seguridad social (2370). Retención por honorarios/servicios/comisiones (236515/236525/236520). Salarios por pagar (250505). Retención asumida.

**Cuentas o nombres de cliente que podrian llegar aqui:** Retención salarios por pagar, retefuente laboral, retención empleados, retención procedimiento 1, retención procedimiento 2, retención sobre nómina, retención rentas de trabajo, retención pagos laborales.

**Soportes o terceros esperados:** Nómina, liquidación de retención por empleado, declaración de retención en la fuente (Form. 350), certificados de ingresos y retenciones.

**Soportes de control recomendados:** Periodo, empleado, procedimiento, concepto.

**Observaciones de homologacion:** Verificar correcto cálculo de procedimiento 1/2 y depuración (rentas exentas, deducciones). Conciliar retención causada vs declarada vs nómina. La no consignación genera responsabilidad. Cruzar con certificados emitidos.

### 236510 - Retención en la fuente por dividendos y participaciones

| Atributo | Valor |
|---|---|
| Codigo | `236510` |
| Nombre | Retención en la fuente por dividendos y participaciones |
| Cuenta Russell / 4D | Retención en la fuente |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2365` |
| Critica | no |

**Que incluye:** Retención practicada sobre dividendos y participaciones decretados, pendiente de declarar y consignar. Aplica a sociedades que distribuyen utilidades gravadas o no gravadas según Art. 242 / 242-1 E.T.

**Que no incluye:** El dividendo mismo (236005). Retención por otros conceptos (otras subcuentas 2365). Impuesto de renta de la sociedad (240405).

**Cuentas o nombres de cliente que podrian llegar aqui:** Retención dividendos por pagar, retefuente dividendos, retención participaciones, retención sobre utilidades, retención Art. 242, retención dividendos accionistas, retención distribución.

**Soportes o terceros esperados:** Acta de distribución, liquidación de retención, declaración de retención (Form. 350).

**Soportes de control recomendados:** Accionista, tipo (residente/no residente), gravabilidad, periodo.

**Observaciones de homologacion:** Tarifa según residencia y gravabilidad del dividendo (Art. 242, 242-1, 245). Distinguir dividendo gravado/no gravado y accionista nacional/extranjero. Conciliar con el dividendo decretado (236005).

### 236515 - Retención en la fuente por honorarios

| Atributo | Valor |
|---|---|
| Codigo | `236515` |
| Nombre | Retención en la fuente por honorarios |
| Cuenta Russell / 4D | Retención en la fuente |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2365` |
| Critica | no |

**Que incluye:** Retención practicada sobre pagos de honorarios pendiente de declarar y consignar. Asociada a la causación de honorarios (233525).

**Que no incluye:** Retención por servicios (236525), comisiones (236520), salarios (236505). Honorarios mismos (233525). Retención por pagos al exterior (236550).

**Cuentas o nombres de cliente que podrian llegar aqui:** Retención honorarios por pagar, retefuente honorarios, retención asesorías, retención consultoría, retención profesionales, retención junta directiva, retención honorarios médicos, retención interventoría.

**Soportes o terceros esperados:** Factura/cuenta de cobro, liquidación de retención, declaración (Form. 350), certificado de retención.

**Soportes de control recomendados:** Tercero, tarifa, base, periodo.

**Observaciones de homologacion:** Verificar tarifa correcta (10%/11% según calidad y monto) y base. Conciliar retención vs concepto causado. Cruzar con certificados emitidos a terceros.

### 236520 - Retención en la fuente por comisiones

| Atributo | Valor |
|---|---|
| Codigo | `236520` |
| Nombre | Retención en la fuente por comisiones |
| Cuenta Russell / 4D | Retención en la fuente |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2365` |
| Critica | no |

**Que incluye:** Retención practicada sobre comisiones pendiente de declarar y consignar. Asociada a la causación de comisiones (233520).

**Que no incluye:** Retención por honorarios (236515), servicios (236525). Comisiones mismas (233520). Retención al exterior (236550).

**Cuentas o nombres de cliente que podrian llegar aqui:** Retención comisiones por pagar, retefuente comisiones, retención intermediación, retención corredores, retención agentes, retención comisionistas, retención representantes.

**Soportes o terceros esperados:** Factura/cuenta de cobro, liquidación de retención, declaración (Form. 350).

**Soportes de control recomendados:** Tercero, tarifa, base, periodo.

**Observaciones de homologacion:** Tarifa de comisiones (generalmente 10%/11%). Verificar correcta clasificación del concepto (comisión vs honorario vs servicio), que determina la tarifa.

### 236525 - Retención en la fuente por servicios

| Atributo | Valor |
|---|---|
| Codigo | `236525` |
| Nombre | Retención en la fuente por servicios |
| Cuenta Russell / 4D | Retención en la fuente |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2365` |
| Critica | no |

**Que incluye:** Retención practicada sobre pagos por servicios (técnicos y generales) pendiente de declarar y consignar. Asociada a servicios técnicos, mantenimiento, transporte y otros servicios.

**Que no incluye:** Retención por honorarios (236515), comisiones (236520), arrendamientos (236530). Servicios mismos (2335). Retención al exterior (236550).

**Cuentas o nombres de cliente que podrian llegar aqui:** Retención servicios por pagar, retefuente servicios, retención servicios técnicos, retención mantenimiento, retención transporte, retención vigilancia, retención aseo, retención temporales, retención servicios generales.

**Soportes o terceros esperados:** Factura, liquidación de retención, declaración (Form. 350).

**Soportes de control recomendados:** Tercero, tarifa (servicio general/técnico/especial), base, periodo.

**Observaciones de homologacion:** Tarifas variables según tipo de servicio (general 4%/6%, vigilancia/temporales/aseo con bases especiales AIU). Verificar base gravable correcta, especialmente en servicios con AIU.

### 236530 - Retención en la fuente por arrendamientos

| Atributo | Valor |
|---|---|
| Codigo | `236530` |
| Nombre | Retención en la fuente por arrendamientos |
| Cuenta Russell / 4D | Retención en la fuente |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2365` |
| Critica | no |

**Que incluye:** Retención practicada sobre cánones de arrendamiento (de bienes inmuebles y muebles) pendiente de declarar y consignar. Asociada a 233540.

**Que no incluye:** Retención por servicios (236525). Cánones mismos (233540). Pasivo por leasing (21xx). Retención al exterior.

**Cuentas o nombres de cliente que podrian llegar aqui:** Retención arrendamientos por pagar, retefuente arrendamientos, retención canon, retención arriendo inmueble, retención arriendo muebles, retención locales, retención bodegas.

**Soportes o terceros esperados:** Contrato, factura/cuenta de cobro, liquidación de retención, declaración.

**Soportes de control recomendados:** Arrendador, tipo de bien (inmueble/mueble), tarifa, periodo.

**Observaciones de homologacion:** Tarifa diferente para inmuebles (3.5%) vs muebles (4%). Verificar tipo de bien. Conciliar con el canon causado (233540).

### 236535 - Retención en la fuente por rendimientos financieros

| Atributo | Valor |
|---|---|
| Codigo | `236535` |
| Nombre | Retención en la fuente por rendimientos financieros |
| Cuenta Russell / 4D | Retención en la fuente |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2365` |
| Critica | no |

**Que incluye:** Retención practicada sobre rendimientos financieros pagados pendiente de declarar y consignar (cuando la entidad es agente retenedor de rendimientos).

**Que no incluye:** Retención que le practican a la entidad sobre sus rendimientos (es un anticipo, activo). Otros conceptos de retención. Intereses por pagar (233505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Retención rendimientos por pagar, retefuente rendimientos financieros, retención intereses pagados, retención sobre intereses, retención financiera por pagar.

**Soportes o terceros esperados:** Liquidación de intereses, liquidación de retención, declaración.

**Soportes de control recomendados:** Beneficiario, base, tarifa, periodo.

**Observaciones de homologacion:** Distinguir la retención que la entidad PRACTICA (pasivo) de la que le PRACTICAN (anticipo, activo). Tarifa general de rendimientos. Poco frecuente fuera del sector financiero.

### 236540 - Retención en la fuente por compras

| Atributo | Valor |
|---|---|
| Codigo | `236540` |
| Nombre | Retención en la fuente por compras |
| Cuenta Russell / 4D | Retención en la fuente |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2365` |
| Critica | no |

**Que incluye:** Retención practicada sobre compras de bienes pendiente de declarar y consignar. Asociada a compras a proveedores (2205) cuando supera bases.

**Que no incluye:** Retención por servicios (236525), honorarios (236515). Compras mismas (proveedores 2205). Autorretención (236575). IVA retenido (2367).

**Cuentas o nombres de cliente que podrian llegar aqui:** Retención compras por pagar, retefuente compras, retención adquisiciones, retención mercancía, retención bienes, retención compras generales, retención proveedores.

**Soportes o terceros esperados:** Factura del proveedor, liquidación de retención, declaración.

**Soportes de control recomendados:** Proveedor, base, tarifa (declarante/no declarante), periodo.

**Observaciones de homologacion:** Tarifa según calidad del proveedor (declarante/no declarante) y base mínima en UVT. Verificar bases de retención actualizadas. Conciliar con compras a proveedores.

### 236550 - Retención en la fuente por pagos al exterior

| Atributo | Valor |
|---|---|
| Codigo | `236550` |
| Nombre | Retención en la fuente por pagos al exterior |
| Cuenta Russell / 4D | Retención en la fuente |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2365` |
| Critica | no |

**Que incluye:** Retención practicada sobre pagos al exterior pendiente de declarar y consignar: servicios, honorarios, regalías, intereses, asistencia técnica, licencias pagadas a no residentes. Frecuente en tecnología (SaaS, licencias), manufactura (regalías, asistencia técnica) y holdings.

**Que no incluye:** Retención a residentes (otras subcuentas 2365). Pagos mismos (proveedores exterior 221005 o gastos). IVA asumido en importación de servicios.

**Cuentas o nombres de cliente que podrian llegar aqui:** Retención pagos al exterior por pagar, retención no residentes, retención regalías exterior, retención licencias exterior, retención asistencia técnica exterior, retención intereses exterior, retención servicios exterior, retención SaaS exterior, withholding pagos exterior.

**Soportes o terceros esperados:** Factura del exterior, contrato, certificado de residencia fiscal, liquidación de retención, declaración, soporte de convenio de doble imposición si aplica.

**Soportes de control recomendados:** Beneficiario, país, concepto, convenio de doble imposición, tarifa.

**Observaciones de homologacion:** Tarifa según concepto y existencia de convenio para evitar doble imposición (CDI). Verificar certificado de residencia fiscal del beneficiario. Concurre frecuentemente con IVA asumido en importación de servicios. Alta exposición de fiscalización.

### 236570 - Otras retenciones en la fuente

| Atributo | Valor |
|---|---|
| Codigo | `236570` |
| Nombre | Otras retenciones en la fuente |
| Cuenta Russell / 4D | Retención en la fuente |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2365` |
| Critica | no |

**Que incluye:** Retenciones en la fuente por conceptos no clasificados en las subcuentas específicas: loterías, premios, enajenación de activos fijos, otros conceptos residuales pendientes de declarar.

**Que no incluye:** Conceptos con subcuenta específica (salarios, honorarios, comisiones, servicios, arrendamientos, compras, exterior). Autorretención (236575). IVA/ICA retenido (2367/2368).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otras retenciones por pagar, retención otros conceptos, retención premios, retención enajenación activos, retención loterías, retención conceptos varios, retefuente otros.

**Soportes o terceros esperados:** Soporte del pago, liquidación de retención, declaración.

**Soportes de control recomendados:** Tercero, concepto, base, tarifa.

**Observaciones de homologacion:** Cuenta residual. Reclasificar a subcuenta específica cuando el concepto la tenga. Revisar que no se usen para conceptos mal clasificados.

### 236575 - Autorretenciones por pagar

| Atributo | Valor |
|---|---|
| Codigo | `236575` |
| Nombre | Autorretenciones por pagar |
| Cuenta Russell / 4D | Retención en la fuente |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2365` |
| Critica | no |

**Que incluye:** Autorretención a título de renta (incluida la autorretención especial del Art. 1.2.6.6 del DUR, antes CREE) que la entidad se practica a sí misma sobre sus ingresos, pendiente de declarar y consignar. Aplica a sociedades exoneradas de aportes (Art. 114-1 E.T.).

**Que no incluye:** Retenciones practicadas a terceros (otras subcuentas 2365). Anticipo de renta. Autorretención de IVA si existiera mecanismo separado.

**Cuentas o nombres de cliente que podrian llegar aqui:** Autorretención por pagar, autorretención especial, autorretención renta, autorretención CREE (histórico), autorretención Decreto 2201, autorretención sobre ingresos, autorretención a título de renta.

**Soportes o terceros esperados:** Liquidación de autorretención sobre ingresos, declaración de retención, base de ingresos del periodo.

**Soportes de control recomendados:** Actividad económica (tarifa), base de ingresos, periodo.

**Observaciones de homologacion:** Tarifa según actividad económica (CIIU) del Decreto 2201/2016. Se liquida sobre ingresos brutos del periodo. Verificar que la entidad sea sujeto de autorretención especial (exonerada Art. 114-1). Conciliar base de autorretención con ingresos.

### 236705 - IVA retenido por pagar

| Atributo | Valor |
|---|---|
| Codigo | `236705` |
| Nombre | IVA retenido por pagar |
| Cuenta Russell / 4D | IVA retenido |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2367` |
| Critica | no |

**Que incluye:** Retención de IVA (reteIVA) practicada a proveedores responsables de IVA, pendiente de declarar y consignar. Aplica al porcentaje de retención de IVA vigente sobre el IVA facturado por el proveedor.

**Que no incluye:** IVA generado en ventas (240805). IVA descontable (240810). Retención en la fuente de renta (2365). ICA retenido (2368).

**Cuentas o nombres de cliente que podrian llegar aqui:** IVA retenido por pagar, reteIVA por pagar, retención de IVA, IVA retenido a proveedores, reteIVA régimen común, IVA retenido importación servicios, IVA asumido por pagar, retención IVA practicada.

**Soportes o terceros esperados:** Factura del proveedor con IVA, liquidación de reteIVA, declaración de retención (Form. 350).

**Soportes de control recomendados:** Proveedor, base, porcentaje, periodo.

**Observaciones de homologacion:** Verificar porcentaje de reteIVA vigente y aplicación correcta (incluido IVA asumido en importación de servicios y operaciones con no responsables especiales). Conciliar con IVA descontable y con la declaración de retención.

### 236795 - Otros IVA retenido

| Atributo | Valor |
|---|---|
| Codigo | `236795` |
| Nombre | Otros IVA retenido |
| Cuenta Russell / 4D | IVA retenido |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2367` |
| Critica | no |

**Que incluye:** Otras retenciones de IVA no clasificadas en 236705: IVA retenido en regímenes especiales o por conceptos particulares pendiente de declarar.

**Que no incluye:** ReteIVA general (236705). IVA generado/descontable (2408). Retención de renta (2365).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros IVA retenido, reteIVA especial, IVA retenido otros conceptos, retención IVA régimen especial, IVA retenido tarjetas, IVA retenido otros.

**Soportes o terceros esperados:** Soporte de la operación, liquidación, declaración.

**Soportes de control recomendados:** Tercero, concepto, base, periodo.

**Observaciones de homologacion:** Cuenta residual de reteIVA. Reclasificar a 236705 si corresponde a reteIVA general. Verificar correcta aplicación del régimen especial.

### 236805 - ICA retenido por pagar

| Atributo | Valor |
|---|---|
| Codigo | `236805` |
| Nombre | ICA retenido por pagar |
| Cuenta Russell / 4D | ICA retenido |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2368` |
| Critica | no |

**Que incluye:** Retención de ICA (reteICA) practicada a terceros, pendiente de declarar y consignar al municipio respectivo. Tarifa según actividad y acuerdo municipal.

**Que no incluye:** ICA propio por pagar (241205). Retención de renta (2365) o IVA (2367). ICA de otros municipios sin retención.

**Cuentas o nombres de cliente que podrian llegar aqui:** ICA retenido por pagar, reteICA por pagar, retención de ICA, reteICA Bogotá, reteICA municipal, retención industria y comercio, ICA retenido a proveedores, reteICA practicada.

**Soportes o terceros esperados:** Factura, liquidación de reteICA, declaración municipal de retención de ICA.

**Soportes de control recomendados:** Municipio, tercero, actividad, tarifa, periodo.

**Observaciones de homologacion:** La tarifa y obligación dependen del municipio (regulación local). Distinguir el reteICA practicado (pasivo) del ICA propio (241205) y del reteICA que le practican a la entidad (anticipo). Cada municipio tiene calendario y tarifas propias.

### 236895 - Otros ICA retenido

| Atributo | Valor |
|---|---|
| Codigo | `236895` |
| Nombre | Otros ICA retenido |
| Cuenta Russell / 4D | ICA retenido |
| Tipo de rubro | Pasivos por impuestos / retenciones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2368` |
| Critica | no |

**Que incluye:** Otras retenciones de ICA no clasificadas en 236805, por conceptos o municipios particulares pendiente de declarar.

**Que no incluye:** ReteICA general (236805). ICA propio (241205). Otras retenciones (2365/2367).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros ICA retenido, reteICA especial, retención ICA otros municipios, ICA retenido otros conceptos, reteICA régimen especial.

**Soportes o terceros esperados:** Soporte de la operación, liquidación, declaración municipal.

**Soportes de control recomendados:** Municipio, tercero, concepto, periodo.

**Observaciones de homologacion:** Cuenta residual de reteICA. Reclasificar a 236805 si aplica. Verificar normativa del municipio correspondiente.

### 237005 - Aportes a EPS por pagar

| Atributo | Valor |
|---|---|
| Codigo | `237005` |
| Nombre | Aportes a EPS por pagar |
| Cuenta Russell / 4D | Retenciones y aportes de nómina |
| Tipo de rubro | Pasivos laborales / parafiscales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2370` |
| Critica | no |

**Que incluye:** Aportes a salud (EPS) por pagar, tanto la porción del empleador como la retenida al trabajador, liquidada vía PILA y pendiente de consignar. Transversal a toda entidad con nómina.

**Que no incluye:** Aportes a pensión (237045), ARL (237006), parafiscales (237010). Retención en la fuente laboral (236505). Salarios por pagar (250505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Aportes EPS por pagar, salud por pagar, aporte salud empleador, aporte salud empleado, PILA salud por pagar, seguridad social salud, cotización salud por pagar.

**Soportes o terceros esperados:** Planilla PILA, nómina, liquidación de aportes, soporte de pago.

**Soportes de control recomendados:** Periodo, empleado, IBC, porción empleador/empleado.

**Observaciones de homologacion:** Verificar IBC correcto (riesgo UGPP) y aplicación de la exoneración del Art. 114-1 E.T. para trabajadores con menos de 10 SMMLV en entidades beneficiarias. Conciliar con nómina y PILA. La no consignación afecta deducibilidad.

### 237006 - Aportes a ARL por pagar

| Atributo | Valor |
|---|---|
| Codigo | `237006` |
| Nombre | Aportes a ARL por pagar |
| Cuenta Russell / 4D | Retenciones y aportes de nómina |
| Tipo de rubro | Pasivos laborales / parafiscales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2370` |
| Critica | no |

**Que incluye:** Aportes a riesgos laborales (ARL) por pagar a cargo del empleador, según nivel de riesgo de la actividad, liquidados vía PILA. Mayor peso en construcción, manufactura, transporte y salud por niveles de riesgo altos.

**Que no incluye:** Aportes EPS (237005), pensión (237045), parafiscales (237010). Indemnizaciones por accidentes (provisiones/contingencias). Retención laboral.

**Cuentas o nombres de cliente que podrian llegar aqui:** Aportes ARL por pagar, riesgos laborales por pagar, ARL empleador, PILA ARL, cotización riesgos profesionales, aporte riesgos laborales, seguro riesgos laborales por pagar.

**Soportes o terceros esperados:** Planilla PILA, clasificación de riesgo, nómina, soporte de pago.

**Soportes de control recomendados:** Periodo, empleado, nivel de riesgo, IBC.

**Observaciones de homologacion:** Verificar nivel de riesgo correcto por actividad/cargo (riesgo de subcotización UGPP). 100% a cargo del empleador. Conciliar con PILA y nómina.

### 237010 - Aportes ICBF, SENA y cajas por pagar

| Atributo | Valor |
|---|---|
| Codigo | `237010` |
| Nombre | Aportes ICBF, SENA y cajas por pagar |
| Cuenta Russell / 4D | Retenciones y aportes de nómina |
| Tipo de rubro | Pasivos laborales / parafiscales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2370` |
| Critica | no |

**Que incluye:** Aportes parafiscales por pagar: ICBF (3%), SENA (2%) y cajas de compensación (4%), liquidados sobre la nómina vía PILA. Transversal.

**Que no incluye:** Aportes a seguridad social (EPS/pensión/ARL). Aportes FIC en construcción (237015). Retención laboral. Salarios.

**Cuentas o nombres de cliente que podrian llegar aqui:** Aportes parafiscales por pagar, ICBF por pagar, SENA por pagar, caja de compensación por pagar, parafiscales nómina, aporte caja por pagar, parafiscales por pagar.

**Soportes o terceros esperados:** Planilla PILA, nómina, liquidación de parafiscales.

**Soportes de control recomendados:** Periodo, entidad (ICBF/SENA/caja), IBC.

**Observaciones de homologacion:** Verificar exoneración de aportes a SENA e ICBF (Art. 114-1 E.T.) para trabajadores con menos de 10 SMMLV en entidades beneficiarias; la caja de compensación NO está exonerada. Conciliar con PILA.

### 237015 - Aportes FIC por pagar

| Atributo | Valor |
|---|---|
| Codigo | `237015` |
| Nombre | Aportes FIC por pagar |
| Cuenta Russell / 4D | Retenciones y aportes de nómina |
| Tipo de rubro | Pasivos laborales / parafiscales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2370` |
| Critica | no |

**Que incluye:** Aportes al Fondo de la Industria de la Construcción (FIC) por pagar, específico del sector construcción, liquidados sobre la nómina de trabajadores de obra. Cuenta sectorial.

**Que no incluye:** Parafiscales generales (237010). Seguridad social. Aportes de otros sectores.

**Cuentas o nombres de cliente que podrian llegar aqui:** Aportes FIC por pagar, fondo industria construcción por pagar, FIC SENA por pagar, aporte FIC obra, contribución FIC.

**Soportes o terceros esperados:** Planilla PILA, nómina de obra, liquidación FIC.

**Soportes de control recomendados:** Periodo, obra, trabajadores de construcción.

**Observaciones de homologacion:** Exclusivo del sector construcción. Se liquida sobre la nómina de trabajadores de obra. Verificar base y tarifa FIC vigente. No homologar aquí aportes de empresas que no son de construcción.

### 237025 - Embargos judiciales por pagar

| Atributo | Valor |
|---|---|
| Codigo | `237025` |
| Nombre | Embargos judiciales por pagar |
| Cuenta Russell / 4D | Retenciones y aportes de nómina |
| Tipo de rubro | Pasivos laborales / parafiscales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2370` |
| Critica | no |

**Que incluye:** Descuentos de nómina por embargos judiciales ordenados sobre salarios de empleados, retenidos y pendientes de consignar al juzgado o beneficiario. Transversal.

**Que no incluye:** Embargos sobre cuentas de la sociedad (indemnizaciones, 283005). Libranzas (237030). Otros descuentos (237095). Retención laboral.

**Cuentas o nombres de cliente que podrian llegar aqui:** Embargos por pagar, embargos de nómina, descuento judicial por pagar, retención judicial salarios, embargo alimentos por pagar, embargo laboral por pagar.

**Soportes o terceros esperados:** Oficio judicial de embargo, nómina, soporte de consignación al juzgado.

**Soportes de control recomendados:** Empleado, proceso judicial, beneficiario, juzgado.

**Observaciones de homologacion:** Manejar con reserva (información sensible del empleado). Distinguir embargo de nómina del empleado (este rubro) de embargo sobre activos de la sociedad (283005). Verificar límites de embargabilidad del salario.

### 237030 - Libranzas por pagar

| Atributo | Valor |
|---|---|
| Codigo | `237030` |
| Nombre | Libranzas por pagar |
| Cuenta Russell / 4D | Retenciones y aportes de nómina |
| Tipo de rubro | Pasivos laborales / parafiscales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2370` |
| Critica | no |

**Que incluye:** Descuentos de nómina por libranzas (créditos de libranza) retenidos al empleado y pendientes de girar a la entidad operadora de libranza. Transversal.

**Que no incluye:** Embargos judiciales (237025). Aportes y retenciones (237005-237015). Préstamos de la empresa al empleado (activo). Otros descuentos (237095).

**Cuentas o nombres de cliente que podrian llegar aqui:** Libranzas por pagar, descuento libranza por pagar, créditos de libranza por pagar, libranza cooperativa, libranza banco por pagar, descuento nómina libranza, libranza fondo empleados.

**Soportes o terceros esperados:** Autorización de libranza del empleado, nómina, soporte de giro a la operadora.

**Soportes de control recomendados:** Empleado, operadora de libranza, periodo.

**Observaciones de homologacion:** La empresa actúa como intermediario: descuenta y gira a la operadora. Verificar autorización del empleado y límite de descuentos. No confundir con préstamos directos de la empresa (activo).

### 237045 - Fondos de pensiones y cesantías por pagar

| Atributo | Valor |
|---|---|
| Codigo | `237045` |
| Nombre | Fondos de pensiones y cesantías por pagar |
| Cuenta Russell / 4D | Retenciones y aportes de nómina |
| Tipo de rubro | Pasivos laborales / parafiscales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2370` |
| Critica | no |

**Que incluye:** Aportes a pensión por pagar (empleador y empleado) y consignación de cesantías a los fondos, liquidados vía PILA / proceso anual de cesantías, pendientes de pago. Transversal.

**Que no incluye:** Cesantías consolidadas como pasivo laboral (251010). Aportes EPS (237005), ARL (237006). Pensiones a cargo de la empresa (253205). Retención laboral.

**Cuentas o nombres de cliente que podrian llegar aqui:** Aportes pensión por pagar, fondo de pensiones por pagar, cesantías por consignar, pensión empleador, pensión empleado, PILA pensión, AFP por pagar, fondo cesantías por pagar, consignación cesantías.

**Soportes o terceros esperados:** Planilla PILA, liquidación de cesantías, nómina, soporte de consignación.

**Soportes de control recomendados:** Periodo, empleado, fondo, IBC.

**Observaciones de homologacion:** Distinguir el aporte mensual a pensión (PILA) de la consignación anual de cesantías al fondo. La cesantía consolidada como obligación va en 251010; este rubro es el aporte/consignación pendiente al fondo. Verificar IBC (UGPP).

### 237095 - Otros descuentos y aportes de nómina por pagar

| Atributo | Valor |
|---|---|
| Codigo | `237095` |
| Nombre | Otros descuentos y aportes de nómina por pagar |
| Cuenta Russell / 4D | Retenciones y aportes de nómina |
| Tipo de rubro | Pasivos laborales / parafiscales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2370` |
| Critica | no |

**Que incluye:** Otros descuentos de nómina por pagar no clasificados: aportes voluntarios, fondo de empleados, sindicato, seguros voluntarios, ahorros, descuentos autorizados por el empleado pendientes de girar.

**Que no incluye:** Embargos (237025), libranzas (237030), aportes obligatorios (237005-237045). Retención laboral (236505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros descuentos de nómina, fondo de empleados por pagar, sindicato por pagar, aportes voluntarios por pagar, ahorro empleados por pagar, seguros voluntarios nómina, descuentos autorizados por pagar, cooperativa empleados por pagar.

**Soportes o terceros esperados:** Autorización del empleado, nómina, soporte de giro al beneficiario.

**Soportes de control recomendados:** Empleado, concepto, beneficiario, periodo.

**Observaciones de homologacion:** Cuenta residual de descuentos de nómina. Verificar autorización escrita del empleado para cada descuento. Reclasificar a subcuenta específica si existe.

### 238095 - Acreedores varios - otros

| Atributo | Valor |
|---|---|
| Codigo | `238095` |
| Nombre | Acreedores varios - otros |
| Cuenta Russell / 4D | Acreedores varios |
| Tipo de rubro | Cuentas por pagar |
| Naturaleza | Credito (`C`) |
| Padre logico | `2380` |
| Critica | no |

**Que incluye:** Obligaciones con terceros no clasificables como proveedores comerciales, contratistas, costos/gastos por pagar específicos, impuestos o laborales: reembolsos a terceros, sobrantes por identificar, recaudos a favor de terceros pendientes de girar, acreedores diversos no operativos.

**Que no incluye:** Proveedores de bienes/servicios del giro (2205/2335). Contratistas (232005). Ingresos recibidos para terceros (281505). Anticipos de clientes (280505). Cualquier concepto con cuenta específica.

**Cuentas o nombres de cliente que podrian llegar aqui:** Acreedores varios, acreedores diversos, cuentas por pagar varias, sobrantes por identificar, reembolsos por pagar a terceros, recaudos a favor de terceros, acreedores no comerciales, partidas por aplicar acreedoras, otros acreedores.

**Soportes o terceros esperados:** Soporte de la obligación, conciliación, identificación del tercero.

**Soportes de control recomendados:** Tercero, concepto, antigüedad.

**Observaciones de homologacion:** Cuenta residual: vigilar saldos antiguos sin identificar (riesgo de partidas conciliatorias o pasivos inexistentes/sobreestimados). Depurar periódicamente. No usar para ocultar partidas que tienen cuenta propia. Cruzar con búsqueda de pasivos no registrados y con ingresos para terceros (281505).

### 240405 - Impuesto de renta vigencia fiscal corriente

| Atributo | Valor |
|---|---|
| Codigo | `240405` |
| Nombre | Impuesto de renta vigencia fiscal corriente |
| Cuenta Russell / 4D | Impuesto de renta y complementarios |
| Tipo de rubro | Pasivos por impuestos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2404` |
| Critica | no |

**Que incluye:** Impuesto de renta y complementarios a cargo de la vigencia fiscal corriente, neto de anticipos y autorretenciones, pendiente de pago. Transversal a todo contribuyente del régimen ordinario.

**Que no incluye:** Impuesto de vigencias anteriores (240410). Impuesto diferido (272505 pasivo / activo). Anticipo de renta (activo). Autorretenciones (236575). Retenciones que le practicaron (anticipo, activo).

**Cuentas o nombres de cliente que podrian llegar aqui:** Impuesto de renta por pagar, renta corriente por pagar, provisión impuesto de renta, impuesto de renta vigencia actual, renta líquida por pagar, impuesto a las ganancias corriente, saldo a pagar renta.

**Soportes o terceros esperados:** Declaración de renta, conciliación fiscal (Formato 2516), liquidación del impuesto, soporte de anticipos y retenciones.

**Soportes de control recomendados:** Vigencia fiscal, anticipo, autorretenciones, retenciones, saldo neto.

**Observaciones de homologacion:** Presentar neto de anticipos, autorretenciones y retenciones que le practicaron. Conciliar utilidad contable con renta líquida (NIC 12 / conciliación fiscal). Separar el componente corriente del diferido. Verificar coherencia con Formato 2516.

### 240410 - Impuesto de renta vigencias anteriores

| Atributo | Valor |
|---|---|
| Codigo | `240410` |
| Nombre | Impuesto de renta vigencias anteriores |
| Cuenta Russell / 4D | Impuesto de renta y complementarios |
| Tipo de rubro | Pasivos por impuestos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2404` |
| Critica | no |

**Que incluye:** Saldos del impuesto de renta de vigencias fiscales anteriores pendientes de pago, incluidos mayores valores por correcciones o liquidaciones oficiales, intereses y sanciones asociados.

**Que no incluye:** Renta de la vigencia corriente (240405). Impuesto diferido. Otras sanciones tributarias (otros impuestos / provisiones).

**Cuentas o nombres de cliente que podrian llegar aqui:** Impuesto de renta vigencias anteriores, renta años anteriores por pagar, mayor valor renta liquidación oficial, corrección renta por pagar, saldo renta anterior, acuerdo de pago renta DIAN.

**Soportes o terceros esperados:** Declaraciones anteriores, liquidaciones oficiales, acuerdos de pago, soportes de intereses y sanciones.

**Soportes de control recomendados:** Vigencia, concepto (capital/interés/sanción), acuerdo de pago.

**Observaciones de homologacion:** Separar capital, intereses y sanciones. Si hay acuerdo de pago con la DIAN, revelar plazos. Evaluar impacto en negocio en marcha si los saldos son significativos.

### 240805 - IVA generado

| Atributo | Valor |
|---|---|
| Codigo | `240805` |
| Nombre | IVA generado |
| Cuenta Russell / 4D | IVA por pagar |
| Tipo de rubro | Pasivos por impuestos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2408` |
| Critica | no |

**Que incluye:** IVA generado (débito fiscal) sobre ventas de bienes y servicios gravados del periodo. Transversal a responsables de IVA. Mayor complejidad en sectores con tarifas diferenciales, ventas mixtas (gravadas/excluidas/exentas) y AIU.

**Que no incluye:** IVA descontable (240810). IVA retenido (236705). IVA de devoluciones (240815). IVA en ventas excluidas o exentas (no genera). Impuesto al consumo (otra cuenta).

**Cuentas o nombres de cliente que podrian llegar aqui:** IVA generado, IVA en ventas, débito fiscal IVA, IVA por ventas, IVA facturado, IVA cobrado, impuesto sobre las ventas generado, IVA débito.

**Soportes o terceros esperados:** Facturas de venta, libro de ventas, declaración de IVA, conciliación de ventas gravadas.

**Soportes de control recomendados:** Tarifa, tipo de operación (gravada/exenta/excluida), periodo.

**Observaciones de homologacion:** Conciliar IVA generado vs ventas gravadas vs facturación electrónica DIAN vs declaración. Verificar tarifas diferenciales y bases AIU. Distinguir ventas exentas (tarifa 0%, dan derecho a descontable) de excluidas (sin IVA). Cruce clave en auditoría tributaria.

### 240810 - IVA descontable

| Atributo | Valor |
|---|---|
| Codigo | `240810` |
| Nombre | IVA descontable |
| Cuenta Russell / 4D | IVA por pagar |
| Tipo de rubro | Pasivos por impuestos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2408` |
| Critica | no |

**Que incluye:** IVA descontable (crédito fiscal) sobre compras y gastos gravados que dan derecho a descuento, según la operación del responsable. Naturaleza débito dentro del grupo de IVA por pagar (se neta contra el generado).

**Que no incluye:** IVA generado (240805). IVA que no da derecho a descuento (mayor valor del costo/gasto, ej. en operaciones excluidas). IVA retenido (236705). IVA descontable de activos según proporcionalidad.

**Cuentas o nombres de cliente que podrian llegar aqui:** IVA descontable, IVA en compras, crédito fiscal IVA, IVA pagado en compras, IVA deducible, IVA crédito, impuesto descontable, IVA por compras.

**Soportes o terceros esperados:** Facturas de compra con IVA, libro de compras, declaración de IVA, soporte de proporcionalidad.

**Soportes de control recomendados:** Tarifa, tipo de operación, proporcionalidad si aplica.

**Observaciones de homologacion:** Verificar requisitos para descontabilidad (factura válida, relación con operación gravada, oportunidad). En operaciones mixtas aplicar proporcionalidad. El IVA sin derecho a descuento es mayor valor del costo. Cuenta de naturaleza débito dentro del pasivo de IVA.

### 240815 - IVA por devoluciones, anulaciones y ajustes

| Atributo | Valor |
|---|---|
| Codigo | `240815` |
| Nombre | IVA por devoluciones, anulaciones y ajustes |
| Cuenta Russell / 4D | IVA por pagar |
| Tipo de rubro | Pasivos por impuestos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2408` |
| Critica | no |

**Que incluye:** IVA asociado a devoluciones, anulaciones, rescisiones y descuentos en ventas y compras, que ajusta el IVA generado o descontable del periodo. Vinculado a notas crédito/débito.

**Que no incluye:** IVA generado base (240805) o descontable base (240810). Devoluciones sin IVA. Retención de IVA (236705).

**Cuentas o nombres de cliente que podrian llegar aqui:** IVA en devoluciones, IVA notas crédito, IVA anulaciones, ajuste IVA ventas, ajuste IVA compras, IVA rescisiones, IVA descuentos, reverso IVA.

**Soportes o terceros esperados:** Notas crédito/débito, soporte de la devolución, declaración de IVA.

**Soportes de control recomendados:** Tipo de ajuste, factura origen, periodo.

**Observaciones de homologacion:** Conciliar con notas crédito/débito y con el ajuste correspondiente en ventas o compras. Verificar oportunidad del ajuste del IVA. Cruce con el análisis de notas crédito (riesgo de manipulación de ingresos/IVA).

### 240895 - IVA saldo a pagar / pagos de IVA

| Atributo | Valor |
|---|---|
| Codigo | `240895` |
| Nombre | IVA saldo a pagar / pagos de IVA |
| Cuenta Russell / 4D | IVA por pagar |
| Tipo de rubro | Pasivos por impuestos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2408` |
| Critica | no |

**Que incluye:** Saldo neto a pagar del IVA del periodo (generado menos descontable menos retenciones, según liquidación) y/o pagos de IVA aplicados, pendiente de consignar a la DIAN.

**Que no incluye:** IVA generado o descontable individual (240805/240810). Saldo a favor de IVA (activo). Retención de IVA (236705).

**Cuentas o nombres de cliente que podrian llegar aqui:** IVA por pagar neto, saldo a pagar IVA, IVA a consignar, liquidación IVA por pagar, pago de IVA pendiente, impuesto a las ventas por pagar, saldo IVA bimestral/cuatrimestral.

**Soportes o terceros esperados:** Declaración de IVA, liquidación del periodo, soporte de pago.

**Soportes de control recomendados:** Periodo (bimestral/cuatrimestral), saldo a pagar/favor.

**Observaciones de homologacion:** Es el resultado neto de la liquidación. Si resulta saldo a favor, va al activo. Conciliar generado menos descontable menos retenciones con la declaración. Verificar periodicidad correcta (bimestral/cuatrimestral).

### 241205 - ICA vigencia fiscal corriente

| Atributo | Valor |
|---|---|
| Codigo | `241205` |
| Nombre | ICA vigencia fiscal corriente |
| Cuenta Russell / 4D | Industria y comercio |
| Tipo de rubro | Pasivos por impuestos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2412` |
| Critica | no |

**Que incluye:** Impuesto de industria y comercio (ICA) y complementario de avisos y tableros de la vigencia corriente, por pagar al municipio donde se ejerce la actividad. Complejidad por territorialidad (múltiples municipios).

**Que no incluye:** ReteICA practicada (236805) o que le practicaron (anticipo). ICA de vigencias anteriores (241210). Otros impuestos municipales (249505).

**Cuentas o nombres de cliente que podrian llegar aqui:** ICA por pagar, industria y comercio por pagar, ICA vigencia actual, ICA y avisos por pagar, impuesto municipal ICA, ICA Bogotá por pagar, ICA consolidado por pagar, RIT por pagar.

**Soportes o terceros esperados:** Declaración de ICA municipal, liquidación por municipio, soporte de ingresos por territorio.

**Soportes de control recomendados:** Municipio, actividad/CIIU, base gravable territorial, periodo.

**Observaciones de homologacion:** Territorialidad clave: distribuir ingresos por municipio donde se realiza la actividad. Tarifas y calendarios varían por municipio. Restar reteICA que le practicaron. Riesgo de doble tributación o no declaración en municipios donde opera.

### 241210 - ICA vigencias fiscales anteriores

| Atributo | Valor |
|---|---|
| Codigo | `241210` |
| Nombre | ICA vigencias fiscales anteriores |
| Cuenta Russell / 4D | Industria y comercio |
| Tipo de rubro | Pasivos por impuestos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2412` |
| Critica | no |

**Que incluye:** Saldos de ICA de vigencias anteriores pendientes de pago, incluidos mayores valores, intereses y sanciones por correcciones o liquidaciones municipales.

**Que no incluye:** ICA corriente (241205). ReteICA (236805). Otros impuestos.

**Cuentas o nombres de cliente que podrian llegar aqui:** ICA vigencias anteriores, ICA años anteriores por pagar, mayor valor ICA, corrección ICA, acuerdo de pago ICA, sanción ICA municipal.

**Soportes o terceros esperados:** Declaraciones anteriores, liquidaciones municipales, acuerdos de pago.

**Soportes de control recomendados:** Municipio, vigencia, concepto (capital/interés/sanción).

**Observaciones de homologacion:** Separar capital, intereses y sanciones por municipio. Revelar acuerdos de pago. Evaluar contingencias por municipios donde podría existir omisión.

### 249505 - Otros impuestos, gravámenes y tasas por pagar

| Atributo | Valor |
|---|---|
| Codigo | `249505` |
| Nombre | Otros impuestos, gravámenes y tasas por pagar |
| Cuenta Russell / 4D | Otros impuestos, gravámenes y tasas |
| Tipo de rubro | Pasivos por impuestos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2495` |
| Critica | no |

**Que incluye:** Otros tributos por pagar no clasificados: impuesto al patrimonio, GMF (4x1000) cuando aplica como pasivo, impuesto al consumo, sobretasas, estampillas, impuesto predial, vehículos, tasas y contribuciones sectoriales (Supersociedades, Superfinanciera, etc.).

**Que no incluye:** Renta (2404), IVA (2408), ICA (2412), retenciones (2365-2368). Impuestos diferidos (272505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Impuesto al patrimonio por pagar, GMF por pagar, impuesto al consumo por pagar, estampillas por pagar, predial por pagar, impuesto de vehículos, sobretasa bomberil, contribución superintendencia, tasa de vigilancia, impuesto de delineación, impuesto de avisos, contribuciones sectoriales.

**Soportes o terceros esperados:** Liquidación del tributo, declaración respectiva, factura/recibo oficial.

**Soportes de control recomendados:** Tipo de tributo, entidad, periodo, base.

**Observaciones de homologacion:** Cuenta agregadora de tributos menores: idealmente segregar por tipo en subcuentas. El impuesto al patrimonio aplica según umbrales vigentes. Verificar contribuciones de superintendencias según la entidad vigilante del cliente.

### 250505 - Salarios por pagar

| Atributo | Valor |
|---|---|
| Codigo | `250505` |
| Nombre | Salarios por pagar |
| Cuenta Russell / 4D | Salarios por pagar |
| Tipo de rubro | Pasivos laborales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2505` |
| Critica | no |

**Que incluye:** Salarios, sueldos y demás pagos laborales devengados pendientes de pago a los empleados al cierre del periodo. Transversal.

**Que no incluye:** Aportes y retenciones de nómina (2370). Retención en la fuente laboral (236505). Prestaciones sociales consolidadas (2510-2540). Honorarios a no empleados (233525).

**Cuentas o nombres de cliente que podrian llegar aqui:** Salarios por pagar, sueldos por pagar, nómina por pagar, pagos laborales por pagar, salario devengado por pagar, jornales por pagar, quincena por pagar, nómina pendiente.

**Soportes o terceros esperados:** Nómina, contratos laborales, liquidación de nómina, soporte de pago.

**Soportes de control recomendados:** Empleado, periodo, concepto, centro de costo.

**Observaciones de homologacion:** Causar el salario devengado no pagado al cierre (corte por devengo). Conciliar con nómina. Verificar que las apropiaciones de seguridad social y prestaciones se reconozcan en sus cuentas respectivas.

### 251010 - Cesantías consolidadas

| Atributo | Valor |
|---|---|
| Codigo | `251010` |
| Nombre | Cesantías consolidadas |
| Cuenta Russell / 4D | Cesantías consolidadas |
| Tipo de rubro | Pasivos laborales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2510` |
| Critica | no |

**Que incluye:** Cesantías consolidadas a favor de los empleados acumuladas al cierre, como obligación laboral (un salario mensual por año trabajado, proporcional). Transversal.

**Que no incluye:** Intereses sobre cesantías (251505). Provisión de cesantías del periodo si se maneja por provisión (261005). Consignación al fondo (237045). Otras prestaciones.

**Cuentas o nombres de cliente que podrian llegar aqui:** Cesantías consolidadas, cesantías por pagar, auxilio de cesantías, cesantías acumuladas, pasivo de cesantías, cesantías retroactivas, cesantías a favor empleados.

**Soportes o terceros esperados:** Nómina, liquidación de cesantías, contratos laborales.

**Soportes de control recomendados:** Empleado, régimen (anualizado/retroactivo), periodo.

**Observaciones de homologacion:** Distinguir régimen tradicional (retroactivo, anterior a Ley 50) del anualizado. Conciliar con liquidación individual. La consignación al fondo se refleja en 237045. Verificar causación completa al cierre.

### 251505 - Intereses sobre cesantías por pagar

| Atributo | Valor |
|---|---|
| Codigo | `251505` |
| Nombre | Intereses sobre cesantías por pagar |
| Cuenta Russell / 4D | Intereses sobre cesantías |
| Tipo de rubro | Pasivos laborales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2515` |
| Critica | no |

**Que incluye:** Intereses sobre las cesantías (12% anual o proporcional) a favor de los empleados, por pagar directamente al trabajador. Transversal.

**Que no incluye:** Cesantías consolidadas (251010). Provisión de intereses (261010). Gastos financieros (233505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Intereses sobre cesantías por pagar, intereses cesantías, intereses a las cesantías, 12% cesantías por pagar, intereses laborales cesantías.

**Soportes o terceros esperados:** Liquidación de intereses sobre cesantías, nómina.

**Soportes de control recomendados:** Empleado, base de cesantías, periodo.

**Observaciones de homologacion:** Se liquidan al 12% anual sobre la cesantía consolidada (o proporcional) y se pagan al trabajador en enero. Verificar liquidación correcta. No confundir con intereses financieros.

### 252005 - Prima de servicios por pagar

| Atributo | Valor |
|---|---|
| Codigo | `252005` |
| Nombre | Prima de servicios por pagar |
| Cuenta Russell / 4D | Prima de servicios |
| Tipo de rubro | Pasivos laborales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2520` |
| Critica | no |

**Que incluye:** Prima de servicios consolidada a favor de los empleados pendiente de pago (un salario mensual por año, pagadero en dos contados). Transversal.

**Que no incluye:** Provisión de prima del periodo (261020). Otras prestaciones. Bonificaciones extralegales (2530).

**Cuentas o nombres de cliente que podrian llegar aqui:** Prima de servicios por pagar, prima legal por pagar, prima semestral por pagar, prima de junio/diciembre, prima por pagar empleados, prestación prima por pagar.

**Soportes o terceros esperados:** Nómina, liquidación de prima, contratos.

**Soportes de control recomendados:** Empleado, semestre, base salarial.

**Observaciones de homologacion:** Causar la proporción devengada al cierre aunque no sea fecha de pago. Conciliar con liquidación. Verificar inclusión de factores salariales correctos en la base.

### 252505 - Vacaciones consolidadas

| Atributo | Valor |
|---|---|
| Codigo | `252505` |
| Nombre | Vacaciones consolidadas |
| Cuenta Russell / 4D | Vacaciones consolidadas |
| Tipo de rubro | Pasivos laborales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2525` |
| Critica | no |

**Que incluye:** Vacaciones consolidadas a favor de los empleados causadas y no disfrutadas al cierre (15 días hábiles por año, proporcional). Transversal.

**Que no incluye:** Provisión de vacaciones del periodo (261015). Prima de vacaciones extralegal (2530). Otras prestaciones.

**Cuentas o nombres de cliente que podrian llegar aqui:** Vacaciones consolidadas, vacaciones por pagar, provisión vacaciones causadas, vacaciones acumuladas, vacaciones no disfrutadas, descanso remunerado por pagar.

**Soportes o terceros esperados:** Nómina, control de vacaciones, liquidación.

**Soportes de control recomendados:** Empleado, días acumulados, base salarial.

**Observaciones de homologacion:** Causar las vacaciones devengadas no disfrutadas. Conciliar con control individual de días. Las vacaciones son un beneficio a empleados (NIC 19). Verificar acumulación de días pendientes.

### 253095 - Prestaciones extralegales por pagar

| Atributo | Valor |
|---|---|
| Codigo | `253095` |
| Nombre | Prestaciones extralegales por pagar |
| Cuenta Russell / 4D | Prestaciones extralegales |
| Tipo de rubro | Pasivos laborales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2530` |
| Critica | no |

**Que incluye:** Prestaciones y beneficios extralegales pactados (convención, pacto, política) por pagar: primas extralegales, bonificaciones habituales, auxilios convencionales, beneficios a empleados adicionales a los legales (NIC 19).

**Que no incluye:** Prestaciones legales (cesantías, prima, vacaciones, intereses). Salarios (250505). Indemnizaciones (254005). Bonos ocasionales no constitutivos.

**Cuentas o nombres de cliente que podrian llegar aqui:** Prestaciones extralegales por pagar, prima extralegal por pagar, bonificación habitual por pagar, auxilio convencional por pagar, beneficios extralegales, prima de antigüedad, bonos por pagar, beneficios a empleados extralegales.

**Soportes o terceros esperados:** Convención/pacto colectivo, política de beneficios, nómina, liquidación.

**Soportes de control recomendados:** Empleado, tipo de beneficio, fuente (convención/política).

**Observaciones de homologacion:** Reconocer beneficios a empleados según NIC 19. Evaluar si son constitutivos de salario (impacto en bases prestacionales y de aportes). Beneficios de largo plazo pueden requerir cálculo actuarial.

### 253205 - Pensiones por pagar

| Atributo | Valor |
|---|---|
| Codigo | `253205` |
| Nombre | Pensiones por pagar |
| Cuenta Russell / 4D | Pensiones por pagar |
| Tipo de rubro | Pasivos laborales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2532` |
| Critica | no |

**Que incluye:** Obligaciones pensionales a cargo directo de la entidad: pensiones de jubilación a cargo del empleador (regímenes anteriores), cuotas partes pensionales, bonos pensionales por pagar. Más relevante en empresas antiguas con pasivo pensional propio.

**Que no incluye:** Aportes mensuales a fondos de pensión (237045). Cesantías (251010). Provisión actuarial si se maneja separada. Indemnizaciones (254005).

**Cuentas o nombres de cliente que podrian llegar aqui:** Pensiones por pagar, pensión de jubilación por pagar, cuotas partes pensionales, bono pensional por pagar, pasivo pensional, mesadas pensionales por pagar, pensión a cargo del empleador.

**Soportes o terceros esperados:** Cálculo actuarial, resoluciones de pensión, soporte de cuotas partes, conciliación con fondos.

**Soportes de control recomendados:** Pensionado, tipo (jubilación/cuota parte/bono), cálculo actuarial.

**Observaciones de homologacion:** El pasivo pensional propio requiere cálculo actuarial (NIC 19, beneficios post-empleo). Distinguir del aporte mensual ordinario (237045). Verificar actualización actuarial y amortización. Relevante para entidades con régimen pensional propio anterior a Ley 100.

### 254005 - Indemnizaciones laborales por pagar

| Atributo | Valor |
|---|---|
| Codigo | `254005` |
| Nombre | Indemnizaciones laborales por pagar |
| Cuenta Russell / 4D | Indemnizaciones laborales |
| Tipo de rubro | Pasivos laborales |
| Naturaleza | Credito (`C`) |
| Padre logico | `2540` |
| Critica | no |

**Que incluye:** Indemnizaciones por terminación del contrato laboral (despido sin justa causa), bonificaciones por retiro y planes de retiro pactados, pendientes de pago.

**Que no incluye:** Liquidación de prestaciones ordinarias (cesantías, prima, vacaciones). Provisión de contingencias laborales en litigio (263520). Salarios por pagar (250505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Indemnizaciones laborales por pagar, indemnización por despido, bonificación por retiro, plan de retiro por pagar, indemnización terminación contrato, liquidación de retiro por pagar.

**Soportes o terceros esperados:** Liquidación de la indemnización, acta de terminación, soporte legal, conciliación laboral.

**Soportes de control recomendados:** Empleado, causa de retiro, concepto.

**Observaciones de homologacion:** Distinguir la indemnización ya causada/pactada (este rubro) de la contingencia laboral en litigio sin certeza (provisión 263520). Verificar cálculo según norma o convención. Beneficio por terminación (NIC 19).

### 260505 - Provisión para intereses

| Atributo | Valor |
|---|---|
| Codigo | `260505` |
| Nombre | Provisión para intereses |
| Cuenta Russell / 4D | Provisiones para costos y gastos |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2605` |
| Critica | no |

**Que incluye:** Provisión de intereses devengados estimados pendientes de causación formal (factura/liquidación), bajo el principio de devengo. Se usa cuando hay obligación presente de intereses pero falta el documento.

**Que no incluye:** Intereses ya causados con soporte (233505). Capital de la obligación (21xx). Intereses tributarios (impuestos por pagar).

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisión de intereses, intereses estimados por pagar, provisión gastos financieros, devengo de intereses, intereses por causar.

**Soportes o terceros esperados:** Tabla de amortización, estimación de intereses devengados, contrato de crédito.

**Soportes de control recomendados:** Obligación, periodo, tasa.

**Observaciones de homologacion:** Distinguir provisión (estimación sin documento) de la causación con soporte (233505). Al recibir el documento, reclasificar. Verificar razonabilidad del cálculo del devengo.

### 260515 - Provisión para honorarios

| Atributo | Valor |
|---|---|
| Codigo | `260515` |
| Nombre | Provisión para honorarios |
| Cuenta Russell / 4D | Provisiones para costos y gastos |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2605` |
| Critica | no |

**Que incluye:** Provisión de honorarios devengados estimados pendientes de factura o cuenta de cobro al cierre: revisoría fiscal, auditoría, asesorías en curso, servicios profesionales prestados no facturados.

**Que no incluye:** Honorarios ya causados con factura/cuenta de cobro (233525). Provisión de servicios técnicos (260520). Otros gastos provisionados.

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisión de honorarios, honorarios estimados por pagar, provisión revisoría fiscal, provisión auditoría, honorarios por causar, provisión asesorías, devengo honorarios.

**Soportes o terceros esperados:** Contrato de servicios, estimación del devengo, propuesta de honorarios.

**Soportes de control recomendados:** Tercero, servicio, periodo devengado.

**Observaciones de homologacion:** Reconocer el servicio devengado aunque no esté facturado (corte por devengo, NIA 240). Al recibir el documento, reclasificar a 233525. Verificar razonabilidad de la estimación y soporte de seguridad social al causar definitivamente.

### 260520 - Provisión para servicios técnicos

| Atributo | Valor |
|---|---|
| Codigo | `260520` |
| Nombre | Provisión para servicios técnicos |
| Cuenta Russell / 4D | Provisiones para costos y gastos |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2605` |
| Critica | no |

**Que incluye:** Provisión de servicios técnicos devengados estimados pendientes de factura al cierre.

**Que no incluye:** Servicios técnicos causados (233530). Provisión de honorarios (260515). Provisión de mantenimiento.

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisión de servicios técnicos, servicios técnicos estimados por pagar, provisión soporte técnico, servicios técnicos por causar, devengo servicios técnicos.

**Soportes o terceros esperados:** Contrato/orden de servicio, estimación del devengo.

**Soportes de control recomendados:** Tercero, servicio, periodo.

**Observaciones de homologacion:** Estimación del servicio devengado no facturado. Reclasificar a 233530 al recibir documento. Verificar razonabilidad.

### 260535 - Provisión para servicios públicos

| Atributo | Valor |
|---|---|
| Codigo | `260535` |
| Nombre | Provisión para servicios públicos |
| Cuenta Russell / 4D | Provisiones para costos y gastos |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2605` |
| Critica | no |

**Que incluye:** Provisión del consumo de servicios públicos devengado no facturado al cierre (energía, agua, gas del periodo aún sin factura).

**Que no incluye:** Servicios públicos ya facturados (233550). Otros gastos provisionados.

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisión servicios públicos, consumo estimado por pagar, provisión energía, provisión agua, servicios públicos por causar, devengo servicios públicos.

**Soportes o terceros esperados:** Histórico de consumo, estimación del periodo, facturas posteriores.

**Soportes de control recomendados:** Servicio, sede, periodo.

**Observaciones de homologacion:** Estimar con base en histórico de consumo. Reclasificar a 233550 al llegar la factura. Verificar contra la factura posterior para validar razonabilidad.

### 260545 - Provisión para garantías

| Atributo | Valor |
|---|---|
| Codigo | `260545` |
| Nombre | Provisión para garantías |
| Cuenta Russell / 4D | Provisiones para costos y gastos |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2605` |
| Critica | no |

**Que incluye:** Provisión por garantías sobre productos vendidos o servicios/obras prestadas, estimada según experiencia histórica de reclamaciones. Manufactura/retail: garantía de productos (electrodomésticos, vehículos, tecnología). Construcción: garantía de estabilidad de obra, postventa. Tecnología: garantía de software/hardware. Automotor: garantías de fábrica.

**Que no incluye:** Provisión de garantías de obligaciones específicas con cálculo formal (2640). Pólizas de seguro de cumplimiento (233555). Reparaciones ya causadas (233535). Pasivos contingentes no provisionables (cuentas de orden 9120).

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisión de garantías, garantía de productos, provisión postventa, garantía de obra, provisión reclamaciones garantía, garantía de estabilidad, reserva de garantías, provisión servicio técnico garantía, warranty provision.

**Soportes o terceros esperados:** Política de garantías, histórico de reclamaciones, contratos de venta, cálculo estadístico de la provisión.

**Soportes de control recomendados:** Línea de producto/obra, periodo de garantía, tasa histórica de reclamación.

**Observaciones de homologacion:** Reconocer cuando existe obligación presente por garantías y es estimable confiablemente (NIC 37). Calcular con base en experiencia histórica. Distinguir de pasivos contingentes (no provisionables, van a orden 9120). Evaluar sesgo de la administración (NIA 540).

### 260595 - Otras provisiones para costos y gastos

| Atributo | Valor |
|---|---|
| Codigo | `260595` |
| Nombre | Otras provisiones para costos y gastos |
| Cuenta Russell / 4D | Provisiones para costos y gastos |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2605` |
| Critica | no |

**Que incluye:** Otras provisiones de costos y gastos devengados estimados no clasificados en subcuentas específicas: comisiones estimadas, fletes estimados, arrendamientos por causar, otros gastos devengados sin documento.

**Que no incluye:** Provisiones con subcuenta específica (intereses, honorarios, servicios técnicos, servicios públicos, garantías). Costos/gastos ya causados (2335). Provisiones laborales (2610), fiscales (2615) o de contingencias (2635).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otras provisiones de gastos, provisión gastos varios, provisión comisiones, provisión fletes, provisión arrendamientos, gastos estimados por pagar, devengo otros gastos, provisión costos por causar.

**Soportes o terceros esperados:** Estimación del devengo, soporte del gasto, contratos.

**Soportes de control recomendados:** Concepto, tercero, periodo.

**Observaciones de homologacion:** Cuenta residual de provisiones operativas. Reclasificar a la cuenta definitiva al recibir el documento. Vigilar que no se usen para diferir o suavizar resultados (riesgo de manejo de utilidades, NIA 540).

### 261005 - Provisión para cesantías

| Atributo | Valor |
|---|---|
| Codigo | `261005` |
| Nombre | Provisión para cesantías |
| Cuenta Russell / 4D | Provisiones obligaciones laborales |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2610` |
| Critica | no |

**Que incluye:** Provisión del gasto de cesantías del periodo cuando la entidad maneja la apropiación mensual por provisión antes de consolidar. Beneficio a empleados (NIC 19).

**Que no incluye:** Cesantías consolidadas como obligación final (251010). Consignación al fondo (237045). Intereses sobre cesantías (261010).

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisión de cesantías, apropiación cesantías, provisión mensual cesantías, gasto cesantías por provisión, cesantías estimadas.

**Soportes o terceros esperados:** Nómina, cálculo de la apropiación, liquidación.

**Soportes de control recomendados:** Empleado, periodo, base salarial.

**Observaciones de homologacion:** Algunos planes de cuentas usan provisión (2610) y otros consolidan directo (2510). Verificar la política y que no haya doble reconocimiento. Conciliar con la consolidación anual.

### 261010 - Provisión intereses sobre cesantías

| Atributo | Valor |
|---|---|
| Codigo | `261010` |
| Nombre | Provisión intereses sobre cesantías |
| Cuenta Russell / 4D | Provisiones obligaciones laborales |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2610` |
| Critica | no |

**Que incluye:** Provisión de los intereses sobre cesantías del periodo (apropiación mensual del 12% anual proporcional).

**Que no incluye:** Intereses sobre cesantías consolidados por pagar al trabajador (251505). Provisión de cesantías (261005).

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisión intereses cesantías, apropiación intereses cesantías, provisión 12% cesantías, intereses cesantías estimados.

**Soportes o terceros esperados:** Nómina, cálculo de la apropiación.

**Soportes de control recomendados:** Empleado, periodo, base.

**Observaciones de homologacion:** Apropiación mensual de los intereses. Al cierre del año se consolida y paga al trabajador (251505). Verificar que no exista doble reconocimiento.

### 261015 - Provisión de vacaciones

| Atributo | Valor |
|---|---|
| Codigo | `261015` |
| Nombre | Provisión de vacaciones |
| Cuenta Russell / 4D | Provisiones obligaciones laborales |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2610` |
| Critica | no |

**Que incluye:** Provisión del gasto de vacaciones del periodo (apropiación mensual por el devengo de días de descanso).

**Que no incluye:** Vacaciones consolidadas (252505). Prima de vacaciones extralegal (2530). Provisión de prima (261020).

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisión de vacaciones, apropiación vacaciones, provisión mensual vacaciones, vacaciones estimadas, gasto vacaciones por provisión.

**Soportes o terceros esperados:** Nómina, cálculo de la apropiación, control de vacaciones.

**Soportes de control recomendados:** Empleado, periodo, base.

**Observaciones de homologacion:** Apropiación del devengo de vacaciones (NIC 19). Verificar política (provisión vs consolidación). Conciliar con días acumulados pendientes.

### 261020 - Provisión prima de servicios

| Atributo | Valor |
|---|---|
| Codigo | `261020` |
| Nombre | Provisión prima de servicios |
| Cuenta Russell / 4D | Provisiones obligaciones laborales |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2610` |
| Critica | no |

**Que incluye:** Provisión del gasto de prima de servicios del periodo (apropiación mensual del devengo de la prima).

**Que no incluye:** Prima consolidada por pagar (252005). Prima extralegal (2530). Otras provisiones laborales.

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisión prima de servicios, apropiación prima, provisión mensual prima, prima estimada, gasto prima por provisión.

**Soportes o terceros esperados:** Nómina, cálculo de la apropiación.

**Soportes de control recomendados:** Empleado, semestre, base.

**Observaciones de homologacion:** Apropiación del devengo de la prima. Verificar política contable y base salarial correcta. Conciliar con la liquidación semestral.

### 261595 - Otras provisiones fiscales

| Atributo | Valor |
|---|---|
| Codigo | `261595` |
| Nombre | Otras provisiones fiscales |
| Cuenta Russell / 4D | Provisiones obligaciones fiscales |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2615` |
| Critica | no |

**Que incluye:** Provisiones de obligaciones fiscales estimadas distintas del impuesto corriente liquidado: estimación de mayores impuestos, sanciones tributarias probables, provisión de impuestos en discusión con probabilidad de pago.

**Que no incluye:** Impuesto de renta corriente liquidado (240405). ICA liquidado (241205). Impuesto diferido (272505). Contingencias administrativas/fiscales en litigio sin probabilidad de pago (orden) o con probabilidad (263505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisión fiscal, provisión de impuestos, provisión sanciones tributarias, provisión mayor impuesto, impuestos estimados por pagar, provisión contingencia tributaria probable, provisión DIAN.

**Soportes o terceros esperados:** Análisis tributario, requerimientos de la DIAN, concepto del asesor, cálculo de la estimación.

**Soportes de control recomendados:** Tributo, vigencia, probabilidad, concepto.

**Observaciones de homologacion:** Reconocer cuando es probable la salida de recursos y estimable (NIC 37). Si solo es posible, va a cuentas de orden (8120/9120). Distinguir de la provisión de contingencias generales (2635). Evaluar con el asesor tributario y revelar.

### 263505 - Provisión contingencias administrativas, multas y sanciones

| Atributo | Valor |
|---|---|
| Codigo | `263505` |
| Nombre | Provisión contingencias administrativas, multas y sanciones |
| Cuenta Russell / 4D | Provisiones para contingencias |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2635` |
| Critica | no |

**Que incluye:** Provisión por contingencias administrativas, multas y sanciones de entidades de control (Supersociedades, Superfinanciera, DIAN administrativa, entes municipales, ambientales) cuando es probable la salida de recursos.

**Que no incluye:** Contingencias laborales (263520), comerciales (263540). Provisiones fiscales por mayor impuesto (261595). Contingencias posibles (cuentas de orden 9120). Sanciones ya liquidadas y ciertas (impuestos/cuentas por pagar).

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisión contingencias administrativas, provisión multas, provisión sanciones, provisión sanciones administrativas, contingencia regulatoria, provisión procesos administrativos, provisión sanciones ambientales.

**Soportes o terceros esperados:** Procesos administrativos, concepto del abogado, valoración de probabilidad, requerimientos.

**Soportes de control recomendados:** Proceso, entidad, probabilidad, cuantía estimada.

**Observaciones de homologacion:** Reconocer solo si es probable y estimable (NIC 37). Si es posible, revelar en orden (9120). Soportar con concepto del abogado sobre probabilidad. Evaluar negocio en marcha si es material (NIA 570).

### 263520 - Provisión contingencias laborales

| Atributo | Valor |
|---|---|
| Codigo | `263520` |
| Nombre | Provisión contingencias laborales |
| Cuenta Russell / 4D | Provisiones para contingencias |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2635` |
| Critica | no |

**Que incluye:** Provisión por procesos y contingencias laborales (demandas de empleados, reliquidaciones, reintegros, acoso laboral, solidaridad laboral con contratistas) cuando es probable la salida de recursos.

**Que no incluye:** Indemnizaciones ya pactadas/ciertas (254005). Prestaciones consolidadas (25xx). Contingencias laborales posibles (orden 9120). Otras contingencias (263505/263540).

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisión contingencias laborales, provisión demandas laborales, provisión procesos laborales, contingencia reintegro, provisión reliquidación laboral, provisión solidaridad laboral, provisión litigios laborales.

**Soportes o terceros esperados:** Demandas, concepto del abogado laboral, valoración de probabilidad, pretensiones.

**Soportes de control recomendados:** Proceso, demandante, probabilidad, pretensión.

**Observaciones de homologacion:** Reconocer si es probable y estimable (NIC 37). Soportar con calificación del abogado. La solidaridad laboral por contratistas/tercerización es un riesgo frecuente. Si es posible, revelar en orden (9120).

### 263540 - Provisión contingencias comerciales

| Atributo | Valor |
|---|---|
| Codigo | `263540` |
| Nombre | Provisión contingencias comerciales |
| Cuenta Russell / 4D | Provisiones para contingencias |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2635` |
| Critica | no |

**Que incluye:** Provisión por contingencias comerciales y civiles: litigios con clientes/proveedores, incumplimientos contractuales, responsabilidad civil, disputas mercantiles, cuando es probable la salida de recursos.

**Que no incluye:** Contingencias laborales (263520), administrativas (263505). Garantías de producto (260545/2640). Contingencias posibles (orden 9120). Obligaciones ciertas (cuentas por pagar).

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisión contingencias comerciales, provisión litigios civiles, provisión demandas comerciales, provisión responsabilidad civil, provisión incumplimiento contractual, provisión disputas mercantiles, provisión procesos civiles.

**Soportes o terceros esperados:** Demandas, contratos en disputa, concepto del abogado, valoración de probabilidad.

**Soportes de control recomendados:** Proceso, contraparte, probabilidad, pretensión.

**Observaciones de homologacion:** Reconocer si es probable y estimable (NIC 37). Soportar con concepto jurídico. Distinguir de garantías de producto (260545). Si es posible, revelar en orden (9120).

### 263595 - Otras provisiones para contingencias

| Atributo | Valor |
|---|---|
| Codigo | `263595` |
| Nombre | Otras provisiones para contingencias |
| Cuenta Russell / 4D | Provisiones para contingencias |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2635` |
| Critica | no |

**Que incluye:** Otras provisiones por contingencias no clasificadas (ambientales, tributarias en litigio no incluidas en 261595, regulatorias sectoriales) cuando es probable la salida de recursos.

**Que no incluye:** Contingencias administrativas (263505), laborales (263520), comerciales (263540). Provisiones operativas (2605). Contingencias posibles (orden 9120).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otras provisiones de contingencias, provisión contingencias ambientales, provisión contingencias regulatorias, provisión riesgos diversos, provisión contingencias sectoriales, otras contingencias probables.

**Soportes o terceros esperados:** Concepto técnico/jurídico, valoración de probabilidad, soporte del riesgo.

**Soportes de control recomendados:** Tipo de contingencia, probabilidad, cuantía.

**Observaciones de homologacion:** Cuenta residual de contingencias. Reclasificar a subcuenta específica si aplica. Reconocer solo lo probable y estimable; lo posible va a orden (9120).

### 264005 - Provisión para obligaciones de garantías

| Atributo | Valor |
|---|---|
| Codigo | `264005` |
| Nombre | Provisión para obligaciones de garantías |
| Cuenta Russell / 4D | Provisiones para garantías |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2640` |
| Critica | no |

**Que incluye:** Provisión por obligaciones de garantía con cálculo formal/contractual: garantías de cumplimiento, garantías de estabilidad de obra contractuales, garantías financieras otorgadas, obligaciones de garantía específicas medidas según contrato. Construcción: garantía de estabilidad y calidad de obra. Manufactura/tecnología: garantías contractuales específicas.

**Que no incluye:** Provisión estadística de garantías de producto por experiencia (260545). Pólizas de seguro de cumplimiento (233555). Pasivos contingentes posibles (orden 9120). Garantías recibidas (orden 9105).

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisión obligaciones de garantía, garantía de cumplimiento, garantía de estabilidad de obra, provisión garantía contractual, garantía financiera otorgada, provisión garantía de calidad, obligación de garantía específica.

**Soportes o terceros esperados:** Contratos con cláusulas de garantía, cálculo de la obligación, soporte de estabilidad de obra.

**Soportes de control recomendados:** Contrato, obra, tipo de garantía, vigencia.

**Observaciones de homologacion:** Distinguir de la provisión estadística de garantías de producto (260545): aquí la obligación deriva de un contrato específico medible. Aplicar NIC 37. En construcción es clave la garantía de estabilidad. Evaluar sesgo de estimación (NIA 540).

### 269595 - Provisiones diversas

| Atributo | Valor |
|---|---|
| Codigo | `269595` |
| Nombre | Provisiones diversas |
| Cuenta Russell / 4D | Provisiones diversas |
| Tipo de rubro | Provisiones |
| Naturaleza | Credito (`C`) |
| Padre logico | `2695` |
| Critica | no |

**Que incluye:** Provisiones no clasificadas en grupos anteriores: provisiones por desmantelamiento/restauración (NIC 37), contratos onerosos, reestructuraciones, otras obligaciones presentes estimables sin cuenta específica.

**Que no incluye:** Provisiones operativas (2605), laborales (2610), fiscales (2615), contingencias (2635), garantías (2640). Pasivos ciertos. Contingencias posibles (orden).

**Cuentas o nombres de cliente que podrian llegar aqui:** Provisiones diversas, provisión desmantelamiento, provisión restauración ambiental, provisión contratos onerosos, provisión reestructuración, provisión cierre de operaciones, otras provisiones, provisión abandono.

**Soportes o terceros esperados:** Cálculo de la provisión, valor presente, soporte técnico/legal de la obligación.

**Soportes de control recomendados:** Tipo de provisión, base de cálculo, valor presente.

**Observaciones de homologacion:** Cuenta residual de provisiones. Desmantelamiento/restauración se mide a valor presente y puede formar parte del costo del activo (NIC 16/37). Reestructuración requiere plan formal anunciado. Reclasificar a cuenta específica si existe.

### 270505 - Ingresos recibidos por anticipado - intereses

| Atributo | Valor |
|---|---|
| Codigo | `270505` |
| Nombre | Ingresos recibidos por anticipado - intereses |
| Cuenta Russell / 4D | Ingresos recibidos por anticipado |
| Tipo de rubro | Pasivos diferidos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2705` |
| Critica | no |

**Que incluye:** Intereses cobrados por anticipado aún no devengados, reconocidos como pasivo hasta su causación al ingreso por el transcurso del tiempo. Frecuente en entidades que financian a clientes y cobran interés anticipado.

**Que no incluye:** Intereses ya devengados (ingreso, 4210). Anticipos de clientes por bienes/servicios (280505). Otros ingresos anticipados (270595).

**Cuentas o nombres de cliente que podrian llegar aqui:** Intereses recibidos por anticipado, intereses diferidos, intereses no devengados, ingreso financiero anticipado, intereses cobrados por anticipado.

**Soportes o terceros esperados:** Contrato de financiación, liquidación de intereses, tabla de devengo.

**Soportes de control recomendados:** Cliente, contrato, periodo de devengo.

**Observaciones de homologacion:** Reconocer el ingreso a medida que se devenga por el transcurso del tiempo (NIIF 15 / costo amortizado). El saldo es el no devengado. Verificar correcto cálculo del devengo periódico.

### 270515 - Ingresos recibidos por anticipado - arrendamientos

| Atributo | Valor |
|---|---|
| Codigo | `270515` |
| Nombre | Ingresos recibidos por anticipado - arrendamientos |
| Cuenta Russell / 4D | Ingresos recibidos por anticipado |
| Tipo de rubro | Pasivos diferidos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2705` |
| Critica | no |

**Que incluye:** Cánones de arrendamiento cobrados por anticipado no devengados (entidad arrendadora). Inmobiliario/retail: cánones anticipados de locales. También aplica a quien subarrienda.

**Que no incluye:** Cánones ya devengados (ingreso 4155/4220). Depósitos en garantía recibidos (281015). Anticipos por otros conceptos (270595).

**Cuentas o nombres de cliente que podrian llegar aqui:** Arrendamientos recibidos por anticipado, cánones anticipados, renta diferida, alquiler cobrado por anticipado, arrendamiento diferido, ingreso por arriendo anticipado.

**Soportes o terceros esperados:** Contrato de arrendamiento, soporte de cobro, calendario de devengo.

**Soportes de control recomendados:** Arrendatario, inmueble, periodo de devengo.

**Observaciones de homologacion:** Devengar el ingreso linealmente durante el plazo del arrendamiento (NIIF 16 arrendador). El saldo es lo no devengado. Distinguir del depósito en garantía (281015), que es reembolsable.

### 270525 - Ingresos recibidos por anticipado - servicios técnicos

| Atributo | Valor |
|---|---|
| Codigo | `270525` |
| Nombre | Ingresos recibidos por anticipado - servicios técnicos |
| Cuenta Russell / 4D | Ingresos recibidos por anticipado |
| Tipo de rubro | Pasivos diferidos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2705` |
| Critica | no |

**Que incluye:** Pagos recibidos por anticipado por servicios técnicos o de soporte aún no prestados. Tecnología: contratos de soporte/mantenimiento prepagados. Servicios: contratos anuales cobrados al inicio.

**Que no incluye:** Servicios ya prestados (ingreso). Anticipos de clientes en construcción/obra (280510). Suscripciones SaaS (pueden ir aquí o en 270595 según política).

**Cuentas o nombres de cliente que podrian llegar aqui:** Servicios recibidos por anticipado, soporte prepagado, mantenimiento prepagado, servicios diferidos, ingreso por servicios anticipado, contrato de soporte anticipado.

**Soportes o terceros esperados:** Contrato de servicio, soporte de cobro, cronograma de prestación.

**Soportes de control recomendados:** Cliente, contrato, periodo de prestación.

**Observaciones de homologacion:** Reconocer el ingreso a medida que se satisface la obligación de desempeño (NIIF 15). El saldo es la obligación pendiente de cumplir. Relevante para reconocimiento de ingresos en servicios recurrentes.

### 270595 - Otros ingresos recibidos por anticipado

| Atributo | Valor |
|---|---|
| Codigo | `270595` |
| Nombre | Otros ingresos recibidos por anticipado |
| Cuenta Russell / 4D | Ingresos recibidos por anticipado |
| Tipo de rubro | Pasivos diferidos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2705` |
| Critica | no |

**Que incluye:** Otros ingresos cobrados por anticipado no devengados: suscripciones (SaaS, membresías, medios), matrículas y pensiones cobradas por anticipado (educación), planes prepagados (salud, medicina prepagada), tiquetes/servicios vendidos antes de prestarse, programas de fidelización.

**Que no incluye:** Ingresos por anticipado con subcuenta específica (intereses, arrendamientos, servicios técnicos). Anticipos sobre contratos de obra (280510). Ingresos ya devengados.

**Cuentas o nombres de cliente que podrian llegar aqui:** Ingresos diferidos, suscripciones por anticipado, matrículas por anticipado, pensiones por anticipado, planes prepagados, medicina prepagada anticipada, membresías diferidas, SaaS diferido, tiquetes vendidos por anticipado, programa de puntos, deferred revenue, contratos por ejecutar.

**Soportes o terceros esperados:** Contrato/suscripción, soporte de cobro, cronograma de devengo, política de reconocimiento.

**Soportes de control recomendados:** Cliente, tipo de plan, periodo de devengo, línea de negocio.

**Observaciones de homologacion:** Pasivo por contrato bajo NIIF 15: reconocer el ingreso al satisfacer la obligación de desempeño. Cuenta crítica en suscripciones, educación y salud prepagada. Verificar correcta periodificación (riesgo de reconocimiento anticipado de ingresos, NIA 240). Conciliar con el calendario de prestación.

### 272505 - Pasivo por impuesto diferido

| Atributo | Valor |
|---|---|
| Codigo | `272505` |
| Nombre | Pasivo por impuesto diferido |
| Cuenta Russell / 4D | Impuesto diferido pasivo |
| Tipo de rubro | Pasivos por impuestos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2725` |
| Critica | no |

**Que incluye:** Impuesto diferido pasivo por diferencias temporarias imponibles entre la base contable y fiscal de activos y pasivos (NIC 12): mayor valor contable de PPE, revaluaciones, depreciaciones aceleradas fiscales, etc.

**Que no incluye:** Impuesto de renta corriente (240405). Activo por impuesto diferido (diferencias deducibles, va al activo). Provisiones fiscales (261595).

**Cuentas o nombres de cliente que podrian llegar aqui:** Impuesto diferido pasivo, pasivo por impuesto diferido, diferencias temporarias imponibles, impuesto diferido por PPE, impuesto diferido por revaluación, deferred tax liability.

**Soportes o terceros esperados:** Cálculo del impuesto diferido, conciliación de bases contable/fiscal, Formato 2516, tasas futuras.

**Soportes de control recomendados:** Diferencia temporaria, activo/pasivo origen, tasa.

**Observaciones de homologacion:** Medir con la tasa esperada de reversión (NIC 12). Identificar todas las diferencias temporarias imponibles. Recalcular independientemente (NIA 540). Conciliar con el Formato 2516. Distinguir del impuesto corriente. Evaluar compensación con el activo diferido según norma.

### 280505 - Anticipos y avances recibidos de clientes

| Atributo | Valor |
|---|---|
| Codigo | `280505` |
| Nombre | Anticipos y avances recibidos de clientes |
| Cuenta Russell / 4D | Anticipos y avances recibidos |
| Tipo de rubro | Pasivos por anticipos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2805` |
| Critica | no |

**Que incluye:** Anticipos recibidos de clientes a cuenta de bienes o servicios aún no entregados/prestados, que generan obligación de desempeño. Construcción: anticipos sobre contratos de obra, pagos anticipados de promesas de compraventa, separaciones de inmuebles. Manufactura: anticipos sobre pedidos por fabricar. Retail/comercio: separaciones, pedidos pagados por adelantado, e-commerce prepago. Servicios: anticipos sobre contratos. Educación: inscripciones anticipadas.

**Que no incluye:** Ingresos ya devengados (4xxx). Anticipos específicos sobre contratos (280510 si se discrimina). Ingresos recibidos por anticipado financieros/arrendamientos/servicios (2705). Depósitos en garantía reembolsables (2810). Valores recibidos para terceros (281505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Anticipos de clientes, avances de clientes, anticipos recibidos, separaciones, pagos anticipados de clientes, anticipo de obra, anticipo de pedido, prepago de clientes, abonos de clientes, anticipo promesa de compraventa, e-commerce prepago, reservas de clientes, pasivo por contrato.

**Soportes o terceros esperados:** Contrato/pedido, soporte de recaudo del anticipo, factura de anticipo si aplica, cronograma de entrega.

**Soportes de control recomendados:** Cliente, NIT, contrato/pedido, obra, avance de la obligación.

**Observaciones de homologacion:** Pasivo por contrato (NIIF 15): es obligación de entregar, no ingreso, hasta satisfacer la obligación de desempeño. Distinguir de saldo a favor del cliente por sobrepago (que puede ser devolución). En construcción, el anticipo de obra se amortiza contra las actas. Cruce clave con ingresos para validar reconocimiento (riesgo NIA 240).

### 280510 - Anticipos recibidos sobre contratos

| Atributo | Valor |
|---|---|
| Codigo | `280510` |
| Nombre | Anticipos recibidos sobre contratos |
| Cuenta Russell / 4D | Anticipos y avances recibidos |
| Tipo de rubro | Pasivos por anticipos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2805` |
| Critica | no |

**Que incluye:** Anticipos recibidos específicamente vinculados a contratos formales de obra o servicio que se amortizan contra avances/actas. Construcción/infraestructura: anticipo contractual (típicamente porcentaje del valor del contrato) amortizable contra actas de obra. Servicios/tecnología: anticipos sobre contratos de implementación o desarrollo por hitos.

**Que no incluye:** Anticipos generales de clientes sin contrato formal (280505). Ingresos devengados por avance (4xxx). Depósitos en garantía (2810). Retención en garantía a favor del cliente (cuenta por pagar al contratista, no aquí).

**Cuentas o nombres de cliente que podrian llegar aqui:** Anticipos sobre contratos, anticipo contractual, anticipo de obra amortizable, anticipo por hitos, anticipo de implementación, anticipo de desarrollo, pago anticipado contractual, anticipo amortizable contra actas.

**Soportes o terceros esperados:** Contrato con cláusula de anticipo, acta de amortización del anticipo, garantía de buen manejo del anticipo, cronograma.

**Soportes de control recomendados:** Contrato, cliente, obra/proyecto, porcentaje amortizado.

**Observaciones de homologacion:** Diferencia con 280505: aquí el anticipo está atado a un contrato formal con mecanismo de amortización (actas/hitos). Verificar la amortización contra el avance y la garantía de buen manejo del anticipo. Pasivo por contrato (NIIF 15). Controlar el saldo no amortizado.

### 280595 - Otros anticipos y avances recibidos

| Atributo | Valor |
|---|---|
| Codigo | `280595` |
| Nombre | Otros anticipos y avances recibidos |
| Cuenta Russell / 4D | Anticipos y avances recibidos |
| Tipo de rubro | Pasivos por anticipos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2805` |
| Critica | no |

**Que incluye:** Otros anticipos recibidos no clasificados en 280505/280510: anticipos diversos, abonos sin asignación definida, pagos anticipados de naturaleza distinta.

**Que no incluye:** Anticipos generales de clientes (280505). Anticipos sobre contratos (280510). Depósitos en garantía (2810). Valores para terceros (281505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros anticipos recibidos, anticipos varios, abonos por aplicar, anticipos diversos, pagos anticipados otros, avances por identificar.

**Soportes o terceros esperados:** Soporte del recaudo, identificación del concepto y tercero.

**Soportes de control recomendados:** Tercero, concepto, antigüedad.

**Observaciones de homologacion:** Cuenta residual de anticipos. Depurar abonos sin identificar (riesgo de partidas antiguas). Reclasificar a 280505/280510 al identificar el contrato u obligación. Vigilar saldos antiguos.

### 281015 - Depósitos recibidos en garantía de prestación de servicios

| Atributo | Valor |
|---|---|
| Codigo | `281015` |
| Nombre | Depósitos recibidos en garantía de prestación de servicios |
| Cuenta Russell / 4D | Depósitos recibidos |
| Tipo de rubro | Otros pasivos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2810` |
| Critica | no |

**Que incluye:** Depósitos reembolsables recibidos como garantía de prestación de servicios o cumplimiento: depósitos de arrendatarios, garantías de servicios públicos privados, depósitos de clientes reembolsables al terminar la relación.

**Que no incluye:** Anticipos a cuenta de servicios (no reembolsables, se aplican al servicio - 280505). Ingresos recibidos por anticipado (2705). Garantías recibidas registradas en orden (9105).

**Cuentas o nombres de cliente que podrian llegar aqui:** Depósitos en garantía recibidos, depósito de arrendatario, garantía reembolsable, depósito de servicios, depósito de cumplimiento, depósito reembolsable de clientes, fianza recibida en efectivo.

**Soportes o terceros esperados:** Contrato con cláusula de depósito, soporte de recaudo, condiciones de reembolso.

**Soportes de control recomendados:** Tercero, contrato, condición de reembolso.

**Observaciones de homologacion:** Es pasivo reembolsable (no ingreso). Distinguir del anticipo que se aplica al servicio (280505) y del ingreso anticipado (2705). Verificar condiciones de devolución. Si la garantía es solo respaldo sin movimiento de efectivo, va a cuentas de orden (9105).

### 281020 - Depósitos recibidos para garantía de contratos

| Atributo | Valor |
|---|---|
| Codigo | `281020` |
| Nombre | Depósitos recibidos para garantía de contratos |
| Cuenta Russell / 4D | Depósitos recibidos |
| Tipo de rubro | Otros pasivos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2810` |
| Critica | no |

**Que incluye:** Depósitos en efectivo recibidos como garantía de cumplimiento de contratos (de contratistas, proveedores o contrapartes), reembolsables al cumplir las condiciones contractuales.

**Que no incluye:** Retención en garantía descontada al contratista (reduce la cuenta por pagar al contratista). Garantías recibidas sin efectivo (orden 9105). Anticipos de clientes (280505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Depósitos garantía de contratos, garantía de cumplimiento recibida en efectivo, depósito de contratista, fianza de contrato, depósito de seriedad, garantía contractual en efectivo recibida.

**Soportes o terceros esperados:** Contrato, soporte de recaudo del depósito, condiciones de devolución.

**Soportes de control recomendados:** Tercero, contrato, condición de reembolso.

**Observaciones de homologacion:** Pasivo reembolsable. Distinguir de la retención en garantía que se descuenta al contratista (que minora la cuenta por pagar, no genera este pasivo). Las garantías recibidas como mero respaldo van a orden (9105).

### 281095 - Otros depósitos recibidos

| Atributo | Valor |
|---|---|
| Codigo | `281095` |
| Nombre | Otros depósitos recibidos |
| Cuenta Russell / 4D | Depósitos recibidos |
| Tipo de rubro | Otros pasivos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2810` |
| Critica | no |

**Que incluye:** Otros depósitos reembolsables recibidos no clasificados en subcuentas específicas.

**Que no incluye:** Depósitos de servicios (281015) o de contratos (281020). Anticipos (2805). Garantías en orden (9105).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros depósitos recibidos, depósitos varios, depósitos reembolsables otros, depósitos por identificar.

**Soportes o terceros esperados:** Soporte del recaudo, condiciones de reembolso.

**Soportes de control recomendados:** Tercero, concepto, condición de reembolso.

**Observaciones de homologacion:** Cuenta residual de depósitos. Reclasificar a subcuenta específica si aplica. Verificar naturaleza reembolsable.

### 281505 - Valores recibidos para terceros

| Atributo | Valor |
|---|---|
| Codigo | `281505` |
| Nombre | Valores recibidos para terceros |
| Cuenta Russell / 4D | Ingresos recibidos para terceros |
| Tipo de rubro | Otros pasivos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2815` |
| Critica | no |

**Que incluye:** Valores recaudados por cuenta de terceros que no son ingreso propio: recaudos de cartera de terceros, dineros de mandantes, recaudos de servicios públicos por convenio, valores de fiducia/encargo, dineros en administración. Servicios financieros/recaudo: convenios de recaudo. Inmobiliario: cánones recaudados para propietarios.

**Que no incluye:** Ingresos propios de la entidad (4xxx). Comisión propia por el recaudo (sí es ingreso). Ventas por cuenta de terceros (281510). Anticipos de clientes propios (280505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Valores recibidos para terceros, recaudos para terceros, dineros de mandantes, recaudo convenio, cánones de propietarios por girar, dineros en administración, fondos de terceros, valores en custodia por girar, recaudo de cartera de terceros.

**Soportes o terceros esperados:** Contrato de mandato/convenio, conciliación de recaudos, soporte de giro al tercero.

**Soportes de control recomendados:** Mandante/tercero, convenio, periodo, saldo por girar.

**Observaciones de homologacion:** NO es ingreso propio (solo lo es la comisión). Mantener separado y girar al tercero. Riesgo de reconocer como ingreso lo que es de terceros (sobreestimación de ingresos, NIA 240). Conciliar recaudos vs giros. Relevante en modelos de intermediación.

### 281510 - Venta por cuenta de terceros

| Atributo | Valor |
|---|---|
| Codigo | `281510` |
| Nombre | Venta por cuenta de terceros |
| Cuenta Russell / 4D | Ingresos recibidos para terceros |
| Tipo de rubro | Otros pasivos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2815` |
| Critica | no |

**Que incluye:** Valores por ventas realizadas por cuenta de terceros bajo mandato/consignación, donde la entidad actúa como agente y no como principal (NIIF 15). Retail/marketplace: ventas de productos de terceros (marketplace, consignación, concesión de espacios). Distribución: ventas en consignación. Agencias: ventas por cuenta del mandante.

**Que no incluye:** Ventas propias como principal (ingreso 4xxx). Comisión/margen propio por la intermediación (sí es ingreso). Valores recibidos para terceros por recaudo (281505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Ventas por cuenta de terceros, ventas en consignación por girar, ventas marketplace de terceros, recaudo por consignación, ventas por mandato, concesión de terceros por girar, ventas de aliados por girar, dropshipping por girar.

**Soportes o terceros esperados:** Contrato de mandato/consignación/marketplace, liquidación al tercero, conciliación de ventas, soporte de giro.

**Soportes de control recomendados:** Mandante/vendedor, convenio, periodo, comisión, saldo por girar.

**Observaciones de homologacion:** Determinante agente vs principal (NIIF 15): si actúa como agente, solo la comisión es ingreso y el resto es pasivo con el tercero. Error frecuente: registrar como ingreso propio el valor bruto de ventas de terceros (infla ingresos y costos). Análisis crítico en marketplaces y consignación.

### 283005 - Embargos judiciales - indemnizaciones

| Atributo | Valor |
|---|---|
| Codigo | `283005` |
| Nombre | Embargos judiciales - indemnizaciones |
| Cuenta Russell / 4D | Embargos judiciales |
| Tipo de rubro | Otros pasivos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2830` |
| Critica | no |

**Que incluye:** Valores embargados judicialmente a la sociedad (sobre cuentas/activos de la entidad) e indemnizaciones ordenadas pendientes de pago por mandato judicial.

**Que no incluye:** Embargos de nómina a empleados (237025). Provisiones de contingencias en litigio (2635). Indemnizaciones laborales pactadas (254005).

**Cuentas o nombres de cliente que podrian llegar aqui:** Embargos judiciales sociedad, indemnizaciones judiciales por pagar, valores embargados, embargo de cuentas, condena judicial por pagar, indemnización ordenada por pagar, depósito judicial por pagar.

**Soportes o terceros esperados:** Oficio judicial, sentencia, soporte del embargo, conciliación.

**Soportes de control recomendados:** Proceso judicial, juzgado, beneficiario, concepto.

**Observaciones de homologacion:** Distinguir el embargo sobre activos de la sociedad (este rubro) del embargo de nómina del empleado (237025). Una condena en firme es obligación cierta; en litigio sin firmeza es provisión/contingencia (2635). Manejar con reserva.

### 289595 - Otros pasivos diversos

| Atributo | Valor |
|---|---|
| Codigo | `289595` |
| Nombre | Otros pasivos diversos |
| Cuenta Russell / 4D | Diversos otros pasivos |
| Tipo de rubro | Otros pasivos |
| Naturaleza | Credito (`C`) |
| Padre logico | `2895` |
| Critica | no |

**Que incluye:** Pasivos diversos no clasificables en ninguna cuenta específica: partidas conciliatorias acreedoras, sobrantes de caja por identificar, ingresos por aplicar, otros pasivos transitorios pendientes de clasificación.

**Que no incluye:** Cualquier pasivo con cuenta específica (proveedores, costos/gastos por pagar, impuestos, laborales, anticipos, depósitos, terceros). Acreedores varios operativos (238095).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros pasivos diversos, pasivos varios, partidas por aplicar acreedoras, sobrantes por identificar, ingresos por aplicar, pasivos transitorios, otros pasivos por clasificar, recaudos sin identificar.

**Soportes o terceros esperados:** Soporte de la partida, conciliación, identificación pendiente.

**Soportes de control recomendados:** Concepto, antigüedad, tercero si se conoce.

**Observaciones de homologacion:** Cuenta residual final de pasivos: vigilar saldos antiguos sin depurar (riesgo de pasivos inexistentes o ingresos no reconocidos). Depurar y reclasificar periódicamente. Foco de auditoría por riesgo de manipulación. Cruzar con búsqueda de pasivos no registrados y con ingresos diferidos.

## Clase 3 - Patrimonio

### 310505 - Capital autorizado

| Atributo | Valor |
|---|---|
| Codigo | `310505` |
| Nombre | Capital autorizado |
| Cuenta Russell / 4D | Capital suscrito y pagado |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3105` |
| Critica | no |

**Que incluye:** Monto máximo de capital que la sociedad por acciones está autorizada a emitir según estatutos. Cuenta de control del capital autorizado en sociedades por acciones (S.A., SAS).

**Que no incluye:** Capital por suscribir (310510, naturaleza débito que minora). Capital suscrito por cobrar (310515). Aportes sociales en sociedades de personas (311505). Prima en colocación (320505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Capital autorizado, capital social autorizado, capital máximo autorizado, capital estatutario autorizado.

**Soportes o terceros esperados:** Estatutos sociales, escritura de constitución/reforma, certificado de cámara de comercio.

**Soportes de control recomendados:** Clase de acción, valor nominal.

**Observaciones de homologacion:** Es el tope autorizado en estatutos. El capital suscrito y pagado resulta de restar el capital por suscribir (310510). Verificar coherencia con escritura y cámara de comercio. Solo aplica a sociedades por acciones.

### 310510 - Capital por suscribir

| Atributo | Valor |
|---|---|
| Codigo | `310510` |
| Nombre | Capital por suscribir |
| Cuenta Russell / 4D | Capital suscrito y pagado |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3105` |
| Critica | no |

**Que incluye:** Porción del capital autorizado aún no suscrita (cuenta de naturaleza débito que minora el capital autorizado). El neto (autorizado menos por suscribir) es el capital suscrito.

**Que no incluye:** Capital autorizado (310505). Capital suscrito por cobrar (310515). Aportes sociales (311505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Capital por suscribir, capital autorizado por suscribir, acciones por suscribir, capital pendiente de suscripción.

**Soportes o terceros esperados:** Estatutos, libro de registro de accionistas, reglamento de suscripción.

**Soportes de control recomendados:** Clase de acción, valor nominal.

**Observaciones de homologacion:** Naturaleza débito: minora el capital autorizado. Capital suscrito = autorizado (310505) menos por suscribir (310510). Verificar coherencia con el libro de accionistas.

### 310515 - Capital suscrito por cobrar

| Atributo | Valor |
|---|---|
| Codigo | `310515` |
| Nombre | Capital suscrito por cobrar |
| Cuenta Russell / 4D | Capital suscrito y pagado |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3105` |
| Critica | no |

**Que incluye:** Porción del capital suscrito aún no pagada por los accionistas (cuenta de naturaleza débito que minora el capital suscrito). El neto es el capital pagado.

**Que no incluye:** Capital autorizado (310505) o por suscribir (310510). Cuentas por cobrar a accionistas por otros conceptos (132510). Aportes sociales (311505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Capital suscrito por cobrar, capital por pagar de accionistas, acciones suscritas no pagadas, capital pendiente de pago, suscripciones por cobrar.

**Soportes o terceros esperados:** Reglamento de suscripción, libro de accionistas, soporte de pagos de capital.

**Soportes de control recomendados:** Accionista, clase de acción, plazo de pago.

**Observaciones de homologacion:** Naturaleza débito: minora el capital suscrito. Capital pagado = suscrito menos suscrito por cobrar. Distinguir de cuentas por cobrar a accionistas por otros conceptos (132510). Verificar plazos de pago del capital (máximo legal). Riesgo si los saldos son antiguos.

### 311505 - Aportes sociales

| Atributo | Valor |
|---|---|
| Codigo | `311505` |
| Nombre | Aportes sociales |
| Cuenta Russell / 4D | Aportes sociales |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3115` |
| Critica | no |

**Que incluye:** Aportes de capital en sociedades de personas (Ltda., en comandita) y en entidades del sector solidario (cooperativas, fondos de empleados, asociaciones mutuales): cuotas o partes de interés pagadas, aportes sociales de asociados.

**Que no incluye:** Capital en sociedades por acciones (3105). Prima en colocación (320505). Reservas (33xx). Aportes para futuras capitalizaciones (según naturaleza).

**Cuentas o nombres de cliente que podrian llegar aqui:** Aportes sociales, capital social, cuotas sociales pagadas, partes de interés, aportes de asociados, aportes cooperativos, capital de fondo de empleados, aportes ESAL, aportes mutuales.

**Soportes o terceros esperados:** Estatutos, escritura, libro de registro de socios/asociados, soporte de aportes.

**Soportes de control recomendados:** Socio/asociado, número de cuotas/aportes.

**Observaciones de homologacion:** Aplica a sociedades de personas y sector solidario. En cooperativas, los aportes sociales tienen tratamiento especial (mínimo irreducible, revalorización). Distinguir de capital por acciones (3105). Verificar coherencia con el libro de socios/asociados.

### 320505 - Prima en colocación de acciones

| Atributo | Valor |
|---|---|
| Codigo | `320505` |
| Nombre | Prima en colocación de acciones |
| Cuenta Russell / 4D | Prima en colocación |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3205` |
| Critica | no |

**Que incluye:** Exceso del valor de colocación de acciones/cuotas sobre su valor nominal: prima en colocación de acciones, prima en colocación de cuotas. Surge cuando se emiten acciones por encima del nominal.

**Que no incluye:** Capital (3105/3115). Reservas (33xx). Resultados (36/37). Revalorización del patrimonio (340505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Prima en colocación de acciones, prima en colocación de cuotas, prima de emisión, superávit de capital, prima sobre el nominal, sobreprecio en colocación.

**Soportes o terceros esperados:** Reglamento de colocación, escritura/acta de emisión, soporte de la suscripción.

**Soportes de control recomendados:** Emisión, clase de acción.

**Observaciones de homologacion:** Es el sobreprecio sobre el valor nominal. Forma parte del patrimonio. Verificar el cálculo (valor de colocación menos nominal). Su capitalización o distribución requiere acto societario y tiene efectos tributarios. No confundir con capital.

### 330505 - Reserva legal

| Atributo | Valor |
|---|---|
| Codigo | `330505` |
| Nombre | Reserva legal |
| Cuenta Russell / 4D | Reservas obligatorias |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3305` |
| Critica | no |

**Que incluye:** Reserva legal constituida por mandato de ley (Código de Comercio): apropiación del 10% de las utilidades líquidas hasta completar el 50% del capital suscrito en sociedades por acciones, o según normativa aplicable a otras formas societarias.

**Que no incluye:** Otras reservas obligatorias (330595). Reservas estatutarias (331095) u ocasionales (331595). Utilidades acumuladas (370505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Reserva legal, reserva obligatoria legal, apropiación legal, reserva legal acumulada.

**Soportes o terceros esperados:** Acta de distribución de utilidades, estatutos, cálculo de la apropiación.

**Soportes de control recomendados:** Periodo de constitución.

**Observaciones de homologacion:** Obligatoria: 10% de utilidades líquidas hasta el 50% del capital suscrito (sociedades por acciones, Art. 452 C.Co.). Verificar correcta apropiación. Su uso está restringido (absorber pérdidas). Distinguir de reservas voluntarias.

### 330595 - Otras reservas obligatorias

| Atributo | Valor |
|---|---|
| Codigo | `330595` |
| Nombre | Otras reservas obligatorias |
| Cuenta Russell / 4D | Reservas obligatorias |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3305` |
| Critica | no |

**Que incluye:** Otras reservas de constitución obligatoria por ley o regulación especial sectorial: reservas obligatorias del sector solidario, reservas de protección de aportes, reservas obligatorias de entidades vigiladas.

**Que no incluye:** Reserva legal (330505). Reservas estatutarias (331095) u ocasionales (331595). Reservas voluntarias.

**Cuentas o nombres de cliente que podrian llegar aqui:** Otras reservas obligatorias, reserva de protección de aportes, reserva obligatoria cooperativa, reserva especial obligatoria, reservas obligatorias sectoriales, reserva para readquisición.

**Soportes o terceros esperados:** Normativa sectorial, acta, estatutos, cálculo.

**Soportes de control recomendados:** Tipo de reserva, norma de origen.

**Observaciones de homologacion:** Reservas obligatorias distintas de la legal, por regulación sectorial (cooperativas, entidades vigiladas). Verificar la norma de origen y su correcta constitución y uso restringido.

### 331095 - Reservas estatutarias

| Atributo | Valor |
|---|---|
| Codigo | `331095` |
| Nombre | Reservas estatutarias |
| Cuenta Russell / 4D | Reservas estatutarias |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3310` |
| Critica | no |

**Que incluye:** Reservas constituidas por disposición de los estatutos sociales para fines específicos previstos en ellos.

**Que no incluye:** Reserva legal (330505) y otras obligatorias (330595). Reservas ocasionales (331595). Resultados acumulados (37xx).

**Cuentas o nombres de cliente que podrian llegar aqui:** Reservas estatutarias, reserva por estatutos, reserva estatutaria específica, reservas previstas en estatutos.

**Soportes o terceros esperados:** Estatutos sociales, acta de distribución, cálculo.

**Soportes de control recomendados:** Finalidad, periodo.

**Observaciones de homologacion:** Constituidas por mandato de los estatutos. Verificar coherencia con los estatutos y la finalidad. Su liberación requiere reforma estatutaria o cumplimiento de la finalidad.

### 331595 - Reservas ocasionales

| Atributo | Valor |
|---|---|
| Codigo | `331595` |
| Nombre | Reservas ocasionales |
| Cuenta Russell / 4D | Reservas ocasionales |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3315` |
| Critica | no |

**Que incluye:** Reservas constituidas voluntariamente por decisión de la asamblea/junta de socios para fines específicos (ensanche, futuras inversiones, contingencias), de libre disposición por el mismo órgano.

**Que no incluye:** Reservas obligatorias (3305) y estatutarias (331095). Utilidades acumuladas sin destinación (370505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Reservas ocasionales, reserva para ensanche, reserva para inversiones, reserva para contingencias, reserva voluntaria, reserva para readquisición de acciones, reservas de libre disposición.

**Soportes o terceros esperados:** Acta de asamblea/junta, proyecto de distribución de utilidades.

**Soportes de control recomendados:** Finalidad, periodo.

**Observaciones de homologacion:** Voluntarias y de libre disposición por la asamblea/junta. Verificar el acta que las constituye. Su liberación al resultado/distribución requiere decisión del órgano. Reservas ocasionales muy antiguas pueden estar pendientes de definición.

### 340505 - Ajustes patrimoniales / revalorización

| Atributo | Valor |
|---|---|
| Codigo | `340505` |
| Nombre | Ajustes patrimoniales / revalorización |
| Cuenta Russell / 4D | Revalorización / ajustes patrimoniales |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3405` |
| Critica | no |

**Que incluye:** Revalorización del patrimonio (saldos históricos de ajustes integrales por inflación) y ajustes patrimoniales por adopción/transición a NIIF (ESFA): partidas del patrimonio surgidas en la convergencia o ajustes acumulados.

**Que no incluye:** Superávit por valorizaciones/revaluación (38xx). Prima en colocación (320505). Resultados acumulados (37xx). Reservas (33xx).

**Cuentas o nombres de cliente que podrian llegar aqui:** Revalorización del patrimonio, ajustes patrimoniales, ajustes por convergencia NIIF, ESFA, superávit por convergencia, ganancias retenidas por adopción NIIF, ajustes por inflación acumulados.

**Soportes o terceros esperados:** Estado de situación financiera de apertura (ESFA), conciliación de convergencia, soporte de los ajustes.

**Soportes de control recomendados:** Origen del ajuste (inflación/convergencia).

**Observaciones de homologacion:** Incluye revalorización del patrimonio (histórica) y ajustes de convergencia a NIIF (ESFA). La revalorización del patrimonio tiene restricciones de distribución y efectos tributarios. Verificar el origen de los saldos y su tratamiento. Los ajustes de ESFA son ganancias retenidas no realizadas.

### 360505 - Utilidad del ejercicio

| Atributo | Valor |
|---|---|
| Codigo | `360505` |
| Nombre | Utilidad del ejercicio |
| Cuenta Russell / 4D | Utilidad del ejercicio |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3605` |
| Critica | no |

**Que incluye:** Resultado positivo (utilidad neta) del ejercicio en curso, antes de su distribución por la asamblea/junta. Saldo crédito que se traslada a utilidades acumuladas o se distribuye en el periodo siguiente.

**Que no incluye:** Pérdida del ejercicio (361005). Utilidades acumuladas de periodos anteriores (370505). Reservas (33xx). El resultado integral (ORI va a patrimonio específico).

**Cuentas o nombres de cliente que podrian llegar aqui:** Utilidad del ejercicio, utilidad neta del periodo, resultado del ejercicio (utilidad), ganancia del ejercicio, utilidad neta, resultado positivo del periodo.

**Soportes o terceros esperados:** Estado de resultados, cierre contable, conciliación con la utilidad.

**Soportes de control recomendados:** Periodo.

**Observaciones de homologacion:** Resultado neto del periodo pendiente de distribución. Debe coincidir con el estado de resultados. La distribución requiere acta de asamblea/junta. Verificar el cierre contable y la coherencia con el ER. El ORI no pasa por esta cuenta.

### 361005 - Pérdida del ejercicio

| Atributo | Valor |
|---|---|
| Codigo | `361005` |
| Nombre | Pérdida del ejercicio |
| Cuenta Russell / 4D | Pérdida del ejercicio |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3610` |
| Critica | no |

**Que incluye:** Resultado negativo (pérdida neta) del ejercicio en curso (cuenta de naturaleza débito que minora el patrimonio). Se traslada a pérdidas acumuladas o se enjuga según decisión del órgano.

**Que no incluye:** Utilidad del ejercicio (360505). Pérdidas acumuladas de periodos anteriores (371005). El ORI.

**Cuentas o nombres de cliente que podrian llegar aqui:** Pérdida del ejercicio, pérdida neta del periodo, resultado del ejercicio (pérdida), pérdida neta, resultado negativo del periodo.

**Soportes o terceros esperados:** Estado de resultados, cierre contable, conciliación.

**Soportes de control recomendados:** Periodo.

**Observaciones de homologacion:** Naturaleza débito: minora el patrimonio. Debe coincidir con el ER. Evaluar el efecto en causales de disolución (Art. 457 C.Co. / Ley 2069 de 2020: pérdidas que comprometan el patrimonio). Alerta de negocio en marcha (NIA 570) si es recurrente o material.

### 370505 - Utilidades acumuladas

| Atributo | Valor |
|---|---|
| Codigo | `370505` |
| Nombre | Utilidades acumuladas |
| Cuenta Russell / 4D | Utilidades acumuladas |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3705` |
| Critica | no |

**Que incluye:** Utilidades de ejercicios anteriores no distribuidas ni apropiadas a reservas: resultados acumulados retenidos, ganancias retenidas disponibles para distribución o capitalización.

**Que no incluye:** Utilidad del ejercicio en curso (360505). Pérdidas acumuladas (371005). Reservas (33xx). Ajustes de convergencia (340505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Utilidades acumuladas, resultados acumulados, ganancias retenidas, utilidades de ejercicios anteriores, utilidades retenidas, resultados de ejercicios anteriores, superávit acumulado.

**Soportes o terceros esperados:** Actas de distribución, libro de resultados, conciliación.

**Soportes de control recomendados:** Periodo de origen, disponibilidad.

**Observaciones de homologacion:** Ganancias retenidas disponibles para distribución/capitalización según decisión del órgano. Distinguir las realizadas (distribuibles) de las no realizadas por convergencia (340505, restringidas). Verificar el movimiento histórico y efectos tributarios de la distribución.

### 371005 - Pérdidas acumuladas

| Atributo | Valor |
|---|---|
| Codigo | `371005` |
| Nombre | Pérdidas acumuladas |
| Cuenta Russell / 4D | Pérdidas acumuladas |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3710` |
| Critica | no |

**Que incluye:** Pérdidas de ejercicios anteriores no enjugadas (cuenta de naturaleza débito que minora el patrimonio), pendientes de absorber con utilidades futuras, reservas o capital.

**Que no incluye:** Pérdida del ejercicio en curso (361005). Utilidades acumuladas (370505). Reservas (33xx).

**Cuentas o nombres de cliente que podrian llegar aqui:** Pérdidas acumuladas, déficit acumulado, pérdidas de ejercicios anteriores, resultados acumulados negativos, pérdidas por enjugar, déficit patrimonial.

**Soportes o terceros esperados:** Actas, libro de resultados, conciliación.

**Soportes de control recomendados:** Periodo de origen.

**Observaciones de homologacion:** Naturaleza débito: minora el patrimonio. Evaluar causales de disolución por pérdidas (Art. 457 C.Co. / Ley 2069 de 2020). Indicador clave de negocio en marcha (NIA 570). Verificar el plan de absorción (reservas, capitalización, utilidades futuras).

### 380505 - Superávit por valorización de inversiones

| Atributo | Valor |
|---|---|
| Codigo | `380505` |
| Nombre | Superávit por valorización de inversiones |
| Cuenta Russell / 4D | Superávit por valorizaciones inversiones |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3805` |
| Critica | no |

**Que incluye:** Superávit por la valorización de inversiones (contrapartida patrimonial de la valorización de inversiones 1905): mayor valor de inversiones medidas a valor razonable con cambios en ORI (NIIF 9).

**Que no incluye:** Superávit por valorización de PPE (381008). La valorización del activo (1905). Resultados realizados (al vender se reclasifica según el caso). Revalorización del patrimonio (340505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Superávit por valorización de inversiones, superávit de inversiones, ORI por inversiones, ganancias no realizadas en inversiones, reserva por valoración de inversiones.

**Soportes o terceros esperados:** Valoración a valor razonable, soporte del valor de mercado, cálculo.

**Soportes de control recomendados:** Inversión, fecha de valoración.

**Observaciones de homologacion:** Contrapartida patrimonial de la valorización de inversiones (1905). Bajo NIIF 9, los cambios de valor razonable de instrumentos de patrimonio designados van al ORI (patrimonio). Verificar consistencia activo-patrimonio. Al realizar, el tratamiento depende de la designación (algunos no se reclasifican a resultados).

### 381008 - Superávit por valorización de PPE

| Atributo | Valor |
|---|---|
| Codigo | `381008` |
| Nombre | Superávit por valorización de PPE |
| Cuenta Russell / 4D | Superávit por valorizaciones PPE |
| Tipo de rubro | Patrimonio |
| Naturaleza | Credito (`C`) |
| Padre logico | `3810` |
| Critica | no |

**Que incluye:** Superávit por revaluación de propiedad, planta y equipo (contrapartida patrimonial de las valorizaciones de PPE 1910): mayor valor de terrenos y edificaciones bajo el modelo de revaluación (NIC 16).

**Que no incluye:** Superávit por valorización de inversiones (380505). La valorización del activo (1910). Resultados. Revalorización del patrimonio (340505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Superávit por valorización de PPE, superávit por revaluación, superávit de propiedades, ORI por revaluación, reserva por revaluación de activos, superávit de terrenos y edificaciones.

**Soportes o terceros esperados:** Avalúo técnico, cálculo de la revaluación, soporte de la valorización.

**Soportes de control recomendados:** Activo, fecha de avalúo.

**Observaciones de homologacion:** Contrapartida patrimonial de la revaluación de PPE (1910) bajo el modelo de revaluación (NIC 16). Se realiza/transfiere a ganancias retenidas a medida que se usa el activo o al venderlo (no pasa por resultados). Verificar consistencia activo-patrimonio y los avalúos.

## Clase 4 - Ingresos

### 410505 - Ingresos gravados a la tarifa general

| Atributo | Valor |
|---|---|
| Codigo | `410505` |
| Nombre | Ingresos gravados a la tarifa general |
| Cuenta Russell / 4D | 4105 – Ingresos operacionales gravados |
| Tipo de rubro | Ingreso operacional gravado con IVA tarifa general |
| Naturaleza | Credito (`C`) |
| Padre logico | `4105` |
| Critica | no |

**Que incluye:** Ventas de bienes o prestación de servicios gravados con la tarifa general de IVA. Ingresos facturados electrónicamente con IVA pleno.

**Que no incluye:** Ingresos exentos, excluidos, no gravados, anticipos no causados, devoluciones, descuentos comerciales e ingresos financieros.

**Cuentas o nombres de cliente que podrian llegar aqui:** Ventas nacionales gravadas, prestación de servicios gravados, ingresos por actividades ordinarias sujetas a IVA general.

**Soportes o terceros esperados:** Factura electrónica, contratos, órdenes de compra, remisiones, actas de entrega, RUT de clientes, libro auxiliar de ventas, reporte de facturación electrónica.

**Soportes de control recomendados:** Conciliación facturación electrónica vs. contabilidad, conciliación libro de ventas vs. declaración de IVA, prueba de corte de facturación, revisión de notas crédito y débito.

**Observaciones de homologacion:** Homologar aquí únicamente operaciones con IVA general. Validar que la base gravable coincida con la factura y con la declaración de IVA. No mezclar con ingresos excluidos o exentos.

### 410510 - Ingresos gravados a la tarifa del 5%

| Atributo | Valor |
|---|---|
| Codigo | `410510` |
| Nombre | Ingresos gravados a la tarifa del 5% |
| Cuenta Russell / 4D | 4105 – Ingresos operacionales gravados tarifa diferencial |
| Tipo de rubro | Ingreso operacional gravado con tarifa diferencial |
| Naturaleza | Credito (`C`) |
| Padre logico | `4105` |
| Critica | no |

**Que incluye:** Ventas de bienes o servicios sujetos legalmente a tarifa diferencial del 5%, según clasificación tributaria aplicable.

**Que no incluye:** Ingresos gravados a tarifa general, exentos, excluidos, AIU o ingresos no sujetos a IVA.

**Cuentas o nombres de cliente que podrian llegar aqui:** Bienes o servicios con tarifa diferencial, productos o servicios clasificados por norma con IVA del 5%.

**Soportes o terceros esperados:** Factura electrónica con tarifa 5%, matriz tributaria de productos/servicios, concepto tributario interno, contratos, maestro de artículos o servicios.

**Soportes de control recomendados:** Cruce maestro de productos vs. tarifa facturada, conciliación IVA generado 5% vs. declaración de IVA, revisión de parametrización del ERP.

**Observaciones de homologacion:** Requiere soporte normativo por producto o servicio. Para auditoría, dejar evidencia de por qué aplica tarifa diferencial.

### 410515 - Ingresos gravados a la tarifa del 0%

| Atributo | Valor |
|---|---|
| Codigo | `410515` |
| Nombre | Ingresos gravados a la tarifa del 0% |
| Cuenta Russell / 4D | 4105 – Ingresos operacionales tarifa 0% |
| Tipo de rubro | Ingreso operacional gravado a tarifa cero |
| Naturaleza | Credito (`C`) |
| Padre logico | `4105` |
| Critica | no |

**Que incluye:** Operaciones tratadas en el sistema como gravadas al 0%, normalmente asociadas a operaciones con tarifa cero o tratamiento equivalente definido por la política tributaria de la entidad.

**Que no incluye:** Ingresos excluidos, ingresos no gravados, ingresos ordinarios sin soporte de exención, ingresos financieros o recuperaciones.

**Cuentas o nombres de cliente que podrian llegar aqui:** Exportaciones, operaciones con tarifa 0%, ventas con tratamiento especial, según análisis fiscal.

**Soportes o terceros esperados:** Factura electrónica, documentos de exportación cuando aplique, contrato, certificaciones, soporte de tratamiento tributario, auxiliares de ventas.

**Soportes de control recomendados:** Conciliación de ingresos 0% vs. declaración de IVA, revisión documental de exención/tarifa cero, cruce con operaciones de comercio exterior si aplica.

**Observaciones de homologacion:** Validar si esta cuenta debe separarse de “Ingresos exentos”. En muchos casos, tarifa 0% y exento pueden generar duplicidad conceptual; mantener ambas solo si la firma o el cliente diferencia por política de reporte.

### 410520 - Ingresos gravados por AIU

| Atributo | Valor |
|---|---|
| Codigo | `410520` |
| Nombre | Ingresos gravados por AIU |
| Cuenta Russell / 4D | 4105 – Ingresos operacionales AIU |
| Tipo de rubro | Ingreso operacional con base gravable especial |
| Naturaleza | Credito (`C`) |
| Padre logico | `4105` |
| Critica | no |

**Que incluye:** Ingresos de contratos donde el IVA se liquida sobre el componente AIU o base especial autorizada: administración, imprevistos y utilidad, según el tipo de servicio y contrato.

**Que no incluye:** Contratos sin cláusula AIU, ventas gravadas sobre base plena, ingresos excluidos, anticipos no causados, reembolsos de gastos no reconocidos como ingreso.

**Cuentas o nombres de cliente que podrian llegar aqui:** Servicios integrales, vigilancia, aseo, cafetería, servicios temporales u otros contratos con estructura AIU, según procedencia legal.

**Soportes o terceros esperados:** Contrato con cláusula AIU, factura electrónica discriminada, cálculo de base gravable, certificación del cliente, actas de prestación del servicio.

**Soportes de control recomendados:** Revisión del cálculo AIU, conciliación base contable vs. base fiscal IVA, validación de porcentaje aplicado, cruce con declaración de IVA y retenciones.

**Observaciones de homologacion:** Cuenta de alto riesgo fiscal. La homologación debe conservar trazabilidad entre valor total del contrato, componente AIU, base de IVA e ingreso contable.

### 410525 - Ingresos exentos

| Atributo | Valor |
|---|---|
| Codigo | `410525` |
| Nombre | Ingresos exentos |
| Cuenta Russell / 4D | 4105 – Ingresos operacionales exentos |
| Tipo de rubro | Ingreso operacional exento de IVA |
| Naturaleza | Credito (`C`) |
| Padre logico | `4105` |
| Critica | no |

**Que incluye:** Operaciones legalmente exentas de IVA, usualmente con tarifa 0% y posible derecho a impuestos descontables, compensación o devolución cuando aplique.

**Que no incluye:** Ingresos excluidos, no gravados, operaciones sin soporte normativo de exención, ingresos con tarifa general o diferencial.

**Cuentas o nombres de cliente que podrian llegar aqui:** Exportaciones, bienes o servicios expresamente exentos, operaciones con tratamiento preferencial según norma tributaria.

**Soportes o terceros esperados:** Factura electrónica, documentos de exportación, certificaciones, soporte normativo, contratos, declaraciones de IVA, conciliación de IVA descontable asociado.

**Soportes de control recomendados:** Validación jurídica del beneficio, conciliación ingresos exentos vs. declaración de IVA, revisión de IVA descontable relacionado, prueba de corte y soporte de exportación si aplica.

**Observaciones de homologacion:** No homologar como excluido. El exento pertenece al universo del IVA con tarifa 0%; el excluido no causa IVA. La diferencia impacta IVA descontable y declaraciones.

### 410530 - Ingresos excluidos

| Atributo | Valor |
|---|---|
| Codigo | `410530` |
| Nombre | Ingresos excluidos |
| Cuenta Russell / 4D | 4105 – Ingresos operacionales excluidos |
| Tipo de rubro | Ingreso operacional excluido de IVA |
| Naturaleza | Credito (`C`) |
| Padre logico | `4105` |
| Critica | no |

**Que incluye:** Ventas de bienes o servicios que por disposición legal no causan IVA. Se facturan sin IVA por exclusión expresa.

**Que no incluye:** Ingresos exentos, gravados, tarifa 0%, operaciones no facturadas, anticipos, ingresos no operacionales.

**Cuentas o nombres de cliente que podrian llegar aqui:** Servicios o bienes expresamente excluidos, operaciones que no generan IVA por mandato legal.

**Soportes o terceros esperados:** Factura electrónica sin IVA, soporte normativo de exclusión, matriz tributaria, contratos, descripción técnica del bien o servicio, auxiliares contables.

**Soportes de control recomendados:** Conciliación de ingresos excluidos vs. declaración de IVA, revisión de parametrización tributaria, control de IVA descontable no procedente o mayor valor del costo/gasto cuando aplique.

**Observaciones de homologacion:** Cuenta crítica para auditoría fiscal. Debe existir soporte legal específico; no basta con que la factura no tenga IVA. Validar tratamiento de IVA descontable asociado.

### 417505 - Devoluciones, rebajas y descuentos en ventas

| Atributo | Valor |
|---|---|
| Codigo | `417505` |
| Nombre | Devoluciones, rebajas y descuentos en ventas |
| Cuenta Russell / 4D | Devoluciones en ventas |
| Tipo de rubro | Ingresos operacionales (menor valor) |
| Naturaleza | Credito (`C`) |
| Padre logico | `4175` |
| Critica | no |

**Que incluye:** Devoluciones, rebajas y descuentos en ventas que minoran el ingreso operacional bruto (naturaleza débito). Incluye descuentos comerciales/condicionados otorgados, devoluciones de mercancía, rebajas por calidad. Transversal a todos los sectores.

**Que no incluye:** Descuentos por pronto pago tratados como gasto financiero (según política). Descuentos ya netos en factura (no se registran aparte si ya minoran el ingreso). Notas crédito por anulación total (reverso del ingreso). Costo de la mercancía devuelta (afecta inventario/costo).

**Cuentas o nombres de cliente que podrian llegar aqui:** Devoluciones en ventas, rebajas en ventas, descuentos en ventas, devoluciones de mercancía, descuentos comerciales, notas crédito en ventas, rebajas por calidad, descuentos condicionados, devoluciones de clientes.

**Soportes o terceros esperados:** Notas crédito, soporte de la devolución, política comercial de descuentos, ingreso de mercancía devuelta a inventario.

**Soportes de control recomendados:** Cliente, motivo, línea de producto, periodo.

**Observaciones de homologacion:** Naturaleza débito que minora el ingreso (NIIF 15: contraprestación variable, presentar el ingreso neto). Conciliar con notas crédito. Volumen alto de devoluciones/notas crédito es indicio de riesgo (NIA 240): revisar corte y motivos. Cruzar con el ajuste de IVA (240815) e inventario.

### 420505 - Otras ventas no operacionales

| Atributo | Valor |
|---|---|
| Codigo | `420505` |
| Nombre | Otras ventas no operacionales |
| Cuenta Russell / 4D | Otras ventas |
| Tipo de rubro | Ingresos no operacionales |
| Naturaleza | Credito (`C`) |
| Padre logico | `4205` |
| Critica | no |

**Que incluye:** Ventas no relacionadas con el giro ordinario: venta de material de desecho, chatarra, subproductos, sobrantes, activos menores no clasificados como PPE, otras ventas ocasionales ajenas al objeto social.

**Que no incluye:** Ventas del giro (41xx). Utilidad en venta de PPE (4245). Recuperaciones (4250). Ingresos diversos (4295). Venta de inventario del giro.

**Cuentas o nombres de cliente que podrian llegar aqui:** Otras ventas, venta de chatarra, venta de desechos, venta de subproductos, venta de sobrantes, ventas ocasionales, venta de material reciclable, otras ventas no operacionales, venta de residuos.

**Soportes o terceros esperados:** Factura, soporte de la venta, identificación del bien vendido.

**Soportes de control recomendados:** Tipo de bien, comprador, periodo.

**Observaciones de homologacion:** Solo ventas ajenas al giro. Si el desecho/subproducto es recurrente y propio del proceso, evaluar si debe ir a ingresos del giro o como menor costo. Distinguir de venta de PPE (4245).

### 421005 - Ingresos por intereses

| Atributo | Valor |
|---|---|
| Codigo | `421005` |
| Nombre | Ingresos por intereses |
| Cuenta Russell / 4D | Ingresos financieros |
| Tipo de rubro | Ingresos no operacionales |
| Naturaleza | Credito (`C`) |
| Padre logico | `4210` |
| Critica | no |

**Que incluye:** Rendimientos e intereses financieros de tesorería en empresas NO financieras: intereses de cuentas de ahorro/CDT, rendimientos de inversiones de liquidez, intereses de mora cobrados a clientes, rendimientos de portafolio de tesorería.

**Que no incluye:** Intereses de cartera de crédito en entidades financieras (giro, 415005). Diferencia en cambio (421020). Dividendos (4215). Otros ingresos financieros (421095).

**Cuentas o nombres de cliente que podrian llegar aqui:** Ingresos por intereses, rendimientos financieros, intereses de CDT, rendimientos de inversiones, intereses de mora cobrados, intereses bancarios ganados, rendimientos de tesorería, intereses sobre cuentas de ahorro.

**Soportes o terceros esperados:** Extracto bancario, liquidación de rendimientos, soporte de inversión.

**Soportes de control recomendados:** Fuente (banco/CDT/inversión), periodo.

**Observaciones de homologacion:** En empresas no financieras estos rendimientos son no operacionales (4210). Verificar retención que le practicaron (anticipo, activo). Distinguir de ingresos financieros del giro (415005). Medir a costo amortizado (NIIF 9).

### 421020 - Ingreso por diferencia en cambio

| Atributo | Valor |
|---|---|
| Codigo | `421020` |
| Nombre | Ingreso por diferencia en cambio |
| Cuenta Russell / 4D | Ingresos financieros |
| Tipo de rubro | Ingresos no operacionales |
| Naturaleza | Credito (`C`) |
| Padre logico | `4210` |
| Critica | no |

**Que incluye:** Ingreso por diferencia en cambio realizada y no realizada favorable sobre activos y pasivos en moneda extranjera (cuentas por cobrar/pagar en ME, obligaciones en ME, efectivo en ME) medidos a TRM (NIC 21).

**Que no incluye:** Gasto por diferencia en cambio desfavorable (gasto). Capital de obligaciones en ME (21xx). Coberturas designadas (tratamiento NIIF 9). Diferencia en cambio capitalizable al activo (casos específicos).

**Cuentas o nombres de cliente que podrian llegar aqui:** Diferencia en cambio, ingreso por diferencia en cambio, diferencia cambiaria favorable, ganancia por tipo de cambio, ajuste por diferencia en cambio, revaluación de saldos en ME.

**Soportes o terceros esperados:** TRM de cierre, soporte de saldos en ME, cálculo de la diferencia en cambio.

**Soportes de control recomendados:** Moneda, partida origen (activo/pasivo), realizada/no realizada.

**Observaciones de homologacion:** Medir saldos en ME a TRM de cierre (NIC 21). Separar diferencia realizada (al pago/cobro) de no realizada (revaluación de saldos). Conciliar con los saldos en ME del balance. Verificar tratamiento de coberturas si existen.

### 421095 - Otros ingresos financieros

| Atributo | Valor |
|---|---|
| Codigo | `421095` |
| Nombre | Otros ingresos financieros |
| Cuenta Russell / 4D | Ingresos financieros |
| Tipo de rubro | Ingresos no operacionales |
| Naturaleza | Credito (`C`) |
| Padre logico | `4210` |
| Critica | no |

**Que incluye:** Otros ingresos de naturaleza financiera no clasificados: ganancias en valoración de instrumentos financieros (NIIF 9), descuentos financieros obtenidos, ingresos por valoración de derivados, otros rendimientos financieros.

**Que no incluye:** Intereses (421005). Diferencia en cambio (421020). Dividendos (4215). Ingresos financieros del giro (415005).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros ingresos financieros, valoración de inversiones, ganancia en derivados, descuentos financieros obtenidos, valoración a valor razonable, ingresos por instrumentos financieros, rendimientos varios financieros.

**Soportes o terceros esperados:** Valoración del instrumento, soporte de la operación, cálculo de valor razonable.

**Soportes de control recomendados:** Instrumento, tipo de ingreso, periodo.

**Observaciones de homologacion:** Cuenta residual financiera. Valoraciones a valor razonable según NIIF 9. Distinguir realizado de no realizado. Reclasificar a subcuenta específica si aplica.

### 421505 - Dividendos y participaciones recibidos

| Atributo | Valor |
|---|---|
| Codigo | `421505` |
| Nombre | Dividendos y participaciones recibidos |
| Cuenta Russell / 4D | Dividendos y participaciones |
| Tipo de rubro | Ingresos no operacionales |
| Naturaleza | Credito (`C`) |
| Padre logico | `4215` |
| Critica | no |

**Que incluye:** Dividendos y participaciones recibidos o decretados a favor de la entidad por inversiones en otras sociedades (método del costo o valor razonable). En holdings de inversión puede ser parte relevante del resultado.

**Que no incluye:** Resultado por método de participación (cuenta específica de inversiones/patrimonio según política). Dividendos por pagar a accionistas (236005). Rendimientos de inversiones de renta fija (4210). Utilidad en venta de inversiones (4245 según caso).

**Cuentas o nombres de cliente que podrian llegar aqui:** Dividendos recibidos, participaciones recibidas, ingresos por dividendos, dividendos de inversiones, participaciones de subsidiarias, dividendos decretados a favor, ingresos por inversiones patrimoniales.

**Soportes o terceros esperados:** Acta de distribución de la participada, soporte de pago/decreto, certificado de dividendos.

**Soportes de control recomendados:** Sociedad participada, tipo de inversión, gravabilidad.

**Observaciones de homologacion:** Reconocer cuando se establece el derecho a recibir (decreto). Si la inversión se mide por método de participación, el dividendo reduce la inversión (no es ingreso). Distinguir método del costo vs participación. Verificar gravabilidad del dividendo recibido.

### 422005 - Ingresos por arrendamientos no operacionales

| Atributo | Valor |
|---|---|
| Codigo | `422005` |
| Nombre | Ingresos por arrendamientos no operacionales |
| Cuenta Russell / 4D | Arrendamientos |
| Tipo de rubro | Ingresos no operacionales |
| Naturaleza | Credito (`C`) |
| Padre logico | `4220` |
| Critica | no |

**Que incluye:** Ingresos por arrendamiento esporádico/no habitual en empresas cuyo giro NO es inmobiliario: subarriendo de espacios ociosos, alquiler ocasional de equipos/bodegas no usados, arrendamiento de inmuebles no afectos a la operación. Manufactura/retail: alquiler de espacio sobrante. Transporte: alquiler ocasional de bodega.

**Que no incluye:** Arrendamiento como giro principal (operacional 415505). Cánones cobrados por anticipado no devengados (270515). Venta de inmuebles (4130/4245). Servicios empresariales (415510).

**Cuentas o nombres de cliente que podrian llegar aqui:** Arrendamientos no operacionales, ingresos por subarriendo, alquiler de espacios ociosos, arrendamiento ocasional, alquiler de equipos no operacional, renta de bodega sobrante, arrendamiento de activos no operativos.

**Soportes o terceros esperados:** Contrato de arrendamiento, factura, soporte del canon.

**Soportes de control recomendados:** Inmueble/bien, arrendatario, contrato.

**Observaciones de homologacion:** Distinguir del arrendamiento como giro (415505): aquí es esporádico y ajeno al objeto principal. Arrendador bajo NIIF 16. Reconocer linealmente. Cánones anticipados no devengados son pasivo (270515).

### 423005 - Ingresos por honorarios no operacionales

| Atributo | Valor |
|---|---|
| Codigo | `423005` |
| Nombre | Ingresos por honorarios no operacionales |
| Cuenta Russell / 4D | Honorarios |
| Tipo de rubro | Ingresos no operacionales |
| Naturaleza | Credito (`C`) |
| Padre logico | `4230` |
| Critica | no |

**Que incluye:** Honorarios percibidos de forma esporádica/no habitual en empresas cuyo giro no es la prestación de servicios profesionales: asesorías ocasionales prestadas a terceros, participación en juntas directivas por parte de la sociedad, servicios profesionales aislados ajenos al objeto.

**Que no incluye:** Honorarios como giro principal (operacional 415510). Servicios no operacionales (4235). Comisiones (intermediación). Ingresos del objeto social.

**Cuentas o nombres de cliente que podrian llegar aqui:** Honorarios no operacionales, honorarios ocasionales, ingresos por asesoría esporádica, honorarios de junta directiva recibidos, ingresos por consultoría ocasional, honorarios aislados.

**Soportes o terceros esperados:** Factura, contrato/orden de servicio, soporte de la prestación.

**Soportes de control recomendados:** Cliente, tipo de servicio, periodo.

**Observaciones de homologacion:** Distinguir de honorarios como giro (415510): aquí es esporádico y ajeno al objeto. Reconocer al prestar el servicio (NIIF 15). Si se vuelve recurrente, evaluar reclasificación a operacional.

### 423505 - Ingresos por servicios no operacionales

| Atributo | Valor |
|---|---|
| Codigo | `423505` |
| Nombre | Ingresos por servicios no operacionales |
| Cuenta Russell / 4D | Servicios |
| Tipo de rubro | Ingresos no operacionales |
| Naturaleza | Credito (`C`) |
| Padre logico | `4235` |
| Critica | no |

**Que incluye:** Ingresos por servicios prestados de forma esporádica ajenos al giro: servicios ocasionales a terceros, reembolsos de servicios con margen, servicios aislados no habituales (mantenimiento prestado a un tercero, servicios técnicos ocasionales).

**Que no incluye:** Servicios como giro (operacional 415510/417005). Honorarios no operacionales (4230). Recuperaciones (4250). Ingresos diversos (4295).

**Cuentas o nombres de cliente que podrian llegar aqui:** Servicios no operacionales, ingresos por servicios ocasionales, servicios esporádicos a terceros, ingresos por servicios aislados, servicios prestados no habituales, reembolso de servicios con margen.

**Soportes o terceros esperados:** Factura, orden de servicio, soporte de la prestación.

**Soportes de control recomendados:** Cliente, tipo de servicio, periodo.

**Observaciones de homologacion:** Distinguir de servicios como giro (415510/417005): aquí son esporádicos. Reconocer al prestar el servicio. Si se vuelven recurrentes, reclasificar a operacional.

### 424515 - Utilidad en venta de PPE

| Atributo | Valor |
|---|---|
| Codigo | `424515` |
| Nombre | Utilidad en venta de PPE |
| Cuenta Russell / 4D | Utilidad en venta de activos |
| Tipo de rubro | Ingresos no operacionales |
| Naturaleza | Credito (`C`) |
| Padre logico | `4245` |
| Critica | no |

**Que incluye:** Utilidad (ganancia) en la venta o disposición de propiedad, planta y equipo, propiedades de inversión, intangibles e inversiones: diferencia positiva entre el precio de venta y el valor en libros del activo enajenado. Transversal.

**Que no incluye:** Venta de inventario del giro (41xx). Pérdida en venta de activos (gasto). Ingreso bruto de la venta sin netear el costo en libros (se reconoce la utilidad neta). Recuperaciones (4250).

**Cuentas o nombres de cliente que podrian llegar aqui:** Utilidad en venta de PPE, ganancia en venta de activos, utilidad en venta de propiedad planta y equipo, utilidad en venta de vehículos, ganancia en venta de inmuebles, utilidad en venta de inversiones, utilidad en disposición de activos, ganancia en enajenación de activos.

**Soportes o terceros esperados:** Contrato/factura de venta, soporte del valor en libros, depreciación acumulada, cálculo de la utilidad.

**Soportes de control recomendados:** Activo enajenado, valor en libros, precio de venta.

**Observaciones de homologacion:** Se reconoce la utilidad NETA (precio menos valor en libros), no el valor bruto de la venta (NIC 16). Verificar baja del activo y su depreciación acumulada. Si resulta pérdida, va a gasto. Distinguir de la venta de inventario del giro.

### 425005 - Recuperaciones

| Atributo | Valor |
|---|---|
| Codigo | `425005` |
| Nombre | Recuperaciones |
| Cuenta Russell / 4D | Recuperaciones |
| Tipo de rubro | Ingresos no operacionales |
| Naturaleza | Credito (`C`) |
| Padre logico | `4250` |
| Critica | no |

**Que incluye:** Recuperación de gastos, provisiones o deterioros reconocidos en periodos anteriores: reversión de deterioro de cartera, recuperación de cartera castigada, reversión de provisiones no utilizadas, reintegro de costos/gastos, indemnizaciones de seguros recibidas, recuperación de descuentos.

**Que no incluye:** Ingresos del giro (41xx). Utilidad en venta de activos (4245). Ingresos diversos (4295). Reversión que debe ajustar la cuenta original (según naturaleza).

**Cuentas o nombres de cliente que podrian llegar aqui:** Recuperaciones, recuperación de cartera castigada, reversión de provisión, reversión de deterioro, recuperación de gastos, indemnización de seguros, reintegro de costos, recuperación de provisiones, reintegro de gastos años anteriores, recuperación de deterioro de cartera.

**Soportes o terceros esperados:** Soporte del recaudo recuperado, cálculo de la reversión, liquidación de seguro, soporte del castigo original.

**Soportes de control recomendados:** Concepto recuperado, periodo de origen, tipo.

**Observaciones de homologacion:** Reconocer al revertir provisiones/deterioros ya no necesarios o al recuperar partidas castigadas (NIC 37/NIIF 9). Verificar que la reversión sea procedente y no manejo de resultados (NIA 540). Distinguir recuperación de provisión de la reversión que ajusta la cuenta original. Indemnizaciones de seguros aquí o como menor gasto según caso.

### 429595 - Ingresos diversos

| Atributo | Valor |
|---|---|
| Codigo | `429595` |
| Nombre | Ingresos diversos |
| Cuenta Russell / 4D | Diversos |
| Tipo de rubro | Ingresos no operacionales |
| Naturaleza | Credito (`C`) |
| Padre logico | `4295` |
| Critica | no |

**Que incluye:** Ingresos no operacionales no clasificados en cuentas específicas: aprovechamientos, sobrantes de inventario, ingresos por donaciones recibidas (según caso), subvenciones del Gobierno (NIC 20), reintegros varios, ingresos ocasionales menores, multas/sanciones cobradas a terceros.

**Que no incluye:** Ingresos con cuenta específica (intereses, diferencia en cambio, dividendos, arrendamientos, honorarios, servicios, utilidad en venta de activos, recuperaciones). Ingresos del giro (41xx).

**Cuentas o nombres de cliente que podrian llegar aqui:** Ingresos diversos, aprovechamientos, sobrantes de inventario, ingresos por donaciones, subvenciones del Gobierno, reintegros varios, ingresos ocasionales, multas cobradas a terceros, ingresos varios, otros ingresos no operacionales, auxilios recibidos.

**Soportes o terceros esperados:** Soporte del ingreso, identificación del concepto, acto de donación/subvención.

**Soportes de control recomendados:** Concepto, tercero, periodo.

**Observaciones de homologacion:** Cuenta residual de ingresos no operacionales. Subvenciones del Gobierno bajo NIC 20 (verificar condiciones). Vigilar saldos significativos que deban tener cuenta propia. Sobrantes de inventario recurrentes pueden indicar deficiencia de control (NIA 265). Reclasificar a cuenta específica si aplica.

## Clase 5 - Gastos

### 510506 - Sueldos

| Atributo | Valor |
|---|---|
| Codigo | `510506` |
| Nombre | Sueldos |
| Cuenta Russell / 4D | Gastos de personal administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5105` |
| Critica | no |

**Que incluye:** Sueldos y salarios del personal del área administrativa: salarios básicos, sobresueldos, subsidio de transporte del personal de administración. Transversal.

**Que no incluye:** Sueldos de ventas (520506) o de producción (7205). Prestaciones sociales (510530-510539). Aportes (510568-510570). Honorarios (5110).

**Cuentas o nombres de cliente que podrian llegar aqui:** Sueldos administración, salarios administrativos, sueldos personal administrativo, salario básico administración, nómina administrativa, sueldos de oficina.

**Soportes o terceros esperados:** Nómina, contratos laborales, liquidación.

**Soportes de control recomendados:** Empleado, centro de costo administrativo, periodo.

**Observaciones de homologacion:** Clasificar por área (administración vs ventas vs producción). El criterio es la función del empleado. Verificar causación completa y aportes asociados. Cruzar con UGPP (IBC) y deducibilidad (pago de seguridad social).

### 510530 - Cesantías

| Atributo | Valor |
|---|---|
| Codigo | `510530` |
| Nombre | Cesantías |
| Cuenta Russell / 4D | Gastos de personal administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5105` |
| Critica | no |

**Que incluye:** Gasto por cesantías del personal administrativo (auxilio de cesantías devengado en el periodo). Beneficio a empleados (NIC 19).

**Que no incluye:** Cesantías de ventas (5205) o producción (7205). Intereses sobre cesantías. Cesantías consolidadas como pasivo (251010). Provisión (261005).

**Cuentas o nombres de cliente que podrian llegar aqui:** Cesantías administración, gasto de cesantías administrativas, auxilio de cesantías administración, cesantías personal administrativo.

**Soportes o terceros esperados:** Nómina, liquidación de cesantías.

**Soportes de control recomendados:** Empleado, centro de costo, periodo.

**Observaciones de homologacion:** Gasto del periodo por prestación. La contrapartida es el pasivo (2510) o provisión (2610). Verificar base de liquidación y factores salariales. Clasificar por área.

### 510536 - Prima de servicios

| Atributo | Valor |
|---|---|
| Codigo | `510536` |
| Nombre | Prima de servicios |
| Cuenta Russell / 4D | Gastos de personal administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5105` |
| Critica | no |

**Que incluye:** Gasto por prima de servicios del personal administrativo devengada en el periodo. Beneficio a empleados (NIC 19).

**Que no incluye:** Prima de ventas (5205) o producción (7205). Prima consolidada como pasivo (252005). Provisión (261020).

**Cuentas o nombres de cliente que podrian llegar aqui:** Prima de servicios administración, gasto de prima administrativa, prima legal administración, prima personal administrativo.

**Soportes o terceros esperados:** Nómina, liquidación de prima.

**Soportes de control recomendados:** Empleado, centro de costo, periodo.

**Observaciones de homologacion:** Gasto del periodo. Contrapartida en pasivo (252005) o provisión (261020). Verificar base. Clasificar por área.

### 510539 - Vacaciones

| Atributo | Valor |
|---|---|
| Codigo | `510539` |
| Nombre | Vacaciones |
| Cuenta Russell / 4D | Gastos de personal administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5105` |
| Critica | no |

**Que incluye:** Gasto por vacaciones del personal administrativo devengadas en el periodo. Beneficio a empleados (NIC 19).

**Que no incluye:** Vacaciones de ventas (5205) o producción (7205). Vacaciones consolidadas como pasivo (252505). Provisión (261015).

**Cuentas o nombres de cliente que podrian llegar aqui:** Vacaciones administración, gasto de vacaciones administrativas, vacaciones personal administrativo, descanso remunerado administración.

**Soportes o terceros esperados:** Nómina, control de vacaciones, liquidación.

**Soportes de control recomendados:** Empleado, centro de costo, periodo.

**Observaciones de homologacion:** Gasto del periodo por el devengo de días de descanso. Contrapartida en pasivo (252505) o provisión (261015). Clasificar por área.

### 510568 - Aportes ARL

| Atributo | Valor |
|---|---|
| Codigo | `510568` |
| Nombre | Aportes ARL |
| Cuenta Russell / 4D | Gastos de personal administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5105` |
| Critica | no |

**Que incluye:** Gasto por aportes a riesgos laborales (ARL) del personal administrativo a cargo del empleador.

**Que no incluye:** Aportes EPS (510569) o pensión (510570). ARL de ventas (5205) o producción (7205). ARL por pagar (237006).

**Cuentas o nombres de cliente que podrian llegar aqui:** Aportes ARL administración, riesgos laborales administración, gasto ARL administrativo, aporte riesgos laborales administración.

**Soportes o terceros esperados:** PILA, nómina, clasificación de riesgo.

**Soportes de control recomendados:** Empleado, nivel de riesgo, periodo.

**Observaciones de homologacion:** Gasto a cargo del empleador. Contrapartida en 237006. Verificar nivel de riesgo (UGPP). Clasificar por área.

### 510569 - Aportes EPS

| Atributo | Valor |
|---|---|
| Codigo | `510569` |
| Nombre | Aportes EPS |
| Cuenta Russell / 4D | Gastos de personal administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5105` |
| Critica | no |

**Que incluye:** Gasto por aportes a salud (EPS) del personal administrativo a cargo del empleador.

**Que no incluye:** Aportes ARL (510568) o pensión (510570). EPS de ventas/producción. EPS por pagar (237005). Exoneración Art. 114-1.

**Cuentas o nombres de cliente que podrian llegar aqui:** Aportes EPS administración, salud administración, gasto EPS administrativo, aporte salud empleador administración.

**Soportes o terceros esperados:** PILA, nómina.

**Soportes de control recomendados:** Empleado, IBC, periodo.

**Observaciones de homologacion:** Gasto a cargo del empleador. Verificar exoneración del Art. 114-1 E.T. (trabajadores < 10 SMMLV en entidades beneficiarias). Contrapartida en 237005. Cruzar IBC con UGPP. Clasificar por área.

### 510570 - Aportes pensión y cesantías

| Atributo | Valor |
|---|---|
| Codigo | `510570` |
| Nombre | Aportes pensión y cesantías |
| Cuenta Russell / 4D | Gastos de personal administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5105` |
| Critica | no |

**Que incluye:** Gasto por aportes a pensión y a fondos de cesantías del personal administrativo a cargo del empleador.

**Que no incluye:** Aportes EPS (510569) o ARL (510568). Pensión de ventas/producción. Aportes por pagar (237045).

**Cuentas o nombres de cliente que podrian llegar aqui:** Aportes pensión administración, fondo de pensiones administración, aportes cesantías administración, pensión empleador administración, gasto pensión administrativo.

**Soportes o terceros esperados:** PILA, nómina.

**Soportes de control recomendados:** Empleado, IBC, periodo.

**Observaciones de homologacion:** Gasto a cargo del empleador. Contrapartida en 237045. Verificar IBC (UGPP). Clasificar por área.

### 510595 - Otros gastos de personal

| Atributo | Valor |
|---|---|
| Codigo | `510595` |
| Nombre | Otros gastos de personal |
| Cuenta Russell / 4D | Gastos de personal administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5105` |
| Critica | no |

**Que incluye:** Otros gastos de personal administrativo: parafiscales, dotación, capacitación, bienestar, auxilios, indemnizaciones, gastos médicos, otros beneficios del personal de administración.

**Que no incluye:** Sueldos y prestaciones con subcuenta específica (510506-510570). Personal de ventas/producción. Honorarios (5110).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros gastos de personal administración, parafiscales administración, dotación administración, capacitación administración, bienestar administración, auxilios al personal, indemnizaciones administración, gastos médicos.

**Soportes o terceros esperados:** Nómina, PILA, soporte de los gastos.

**Soportes de control recomendados:** Empleado, concepto, periodo.

**Observaciones de homologacion:** Cuenta de otros conceptos de personal. Incluye parafiscales (verificar exoneración SENA/ICBF Art. 114-1). Clasificar por área. Verificar que beneficios sean deducibles y su tratamiento (constitutivo o no de salario).

### 511005 - Honorarios

| Atributo | Valor |
|---|---|
| Codigo | `511005` |
| Nombre | Honorarios |
| Cuenta Russell / 4D | Honorarios administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5110` |
| Critica | no |

**Que incluye:** Honorarios profesionales del área administrativa: revisoría fiscal, auditoría externa, asesoría jurídica, contable, tributaria, consultoría administrativa, honorarios de junta directiva.

**Que no incluye:** Honorarios de ventas (521005) o atribuibles a producción/servicio (clase 7/6). Servicios técnicos (5135). Comisiones (5195). Honorarios por pagar (233525).

**Cuentas o nombres de cliente que podrian llegar aqui:** Honorarios administración, honorarios profesionales, revisoría fiscal, auditoría externa, asesoría jurídica, asesoría tributaria, consultoría administrativa, honorarios junta directiva, asesoría contable.

**Soportes o terceros esperados:** Factura/cuenta de cobro, contrato, soporte de seguridad social del prestador (Art. 87-1), entregable.

**Soportes de control recomendados:** Tercero, tipo de honorario, centro de costo.

**Observaciones de homologacion:** Clasificar por área. Verificar retención por honorarios (236515) y seguridad social del prestador para deducibilidad (Art. 87-1). Distinguir honorario de servicio técnico (5135) por el componente intelectual. Contrapartida en 233525.

### 511095 - Otros honorarios

| Atributo | Valor |
|---|---|
| Codigo | `511095` |
| Nombre | Otros honorarios |
| Cuenta Russell / 4D | Honorarios administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5110` |
| Critica | no |

**Que incluye:** Otros honorarios del área administrativa no clasificados en 511005.

**Que no incluye:** Honorarios principales (511005). Honorarios de ventas (5210). Servicios técnicos (5135).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros honorarios administración, honorarios varios administración, honorarios diversos administrativos, otros honorarios profesionales.

**Soportes o terceros esperados:** Factura/cuenta de cobro, contrato, seguridad social del prestador.

**Soportes de control recomendados:** Tercero, tipo, centro de costo.

**Observaciones de homologacion:** Subcuenta residual de honorarios administrativos. Mismas validaciones que 511005 (retención, seguridad social, deducibilidad).

### 511505 - Impuestos de industria y comercio gasto

| Atributo | Valor |
|---|---|
| Codigo | `511505` |
| Nombre | Impuestos de industria y comercio gasto |
| Cuenta Russell / 4D | Impuestos administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5115` |
| Critica | no |

**Que incluye:** Gasto por impuesto de industria y comercio (ICA) y complementarios atribuible a la administración.

**Que no incluye:** ICA por pagar (241205). Otros impuestos (511595). Impuesto de renta (5405). ICA de ventas (5215). Impuestos descontables/recuperables (activo).

**Cuentas o nombres de cliente que podrian llegar aqui:** ICA gasto, industria y comercio gasto, impuesto de avisos y tableros, ICA administración, gasto de ICA.

**Soportes o terceros esperados:** Declaración de ICA, liquidación, soporte de pago.

**Soportes de control recomendados:** Municipio, periodo.

**Observaciones de homologacion:** Gasto deducible (Art. 115 E.T., con condiciones). Distinguir del ICA por pagar (241205) y del reteICA. Verificar deducibilidad y territorialidad. Clasificar por área.

### 511595 - Otros impuestos, tasas y contribuciones gasto

| Atributo | Valor |
|---|---|
| Codigo | `511595` |
| Nombre | Otros impuestos, tasas y contribuciones gasto |
| Cuenta Russell / 4D | Impuestos administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5115` |
| Critica | no |

**Que incluye:** Otros impuestos, tasas y contribuciones que son gasto del periodo: GMF (4x1000), impuesto predial, vehículos, registro, estampillas, contribuciones a superintendencias, tasas, parte deducible de otros tributos.

**Que no incluye:** ICA gasto (511505). Impuesto de renta (5405). IVA descontable (activo). Impuestos por pagar (24xx). Impuestos de ventas (5215).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros impuestos gasto, GMF, 4x1000, gravamen a movimientos financieros, predial gasto, impuesto de vehículos, estampillas, contribución superintendencia, tasas y contribuciones, impuesto de registro.

**Soportes o terceros esperados:** Liquidación del tributo, soporte de pago, declaración.

**Soportes de control recomendados:** Tipo de tributo, periodo.

**Observaciones de homologacion:** Verificar deducibilidad de cada tributo (Art. 115 E.T.: el GMF es deducible al 50%; predial e ICA con condiciones). Distinguir gasto de tributos deducibles de no deducibles (impuesto de renta no es deducible). Clasificar por área.

### 512005 - Arrendamientos

| Atributo | Valor |
|---|---|
| Codigo | `512005` |
| Nombre | Arrendamientos |
| Cuenta Russell / 4D | Arrendamientos administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5120` |
| Critica | no |

**Que incluye:** Gasto por arrendamientos del área administrativa: oficinas, equipos, parqueaderos de administración (de contratos que no generan derecho de uso NIIF 16 o el componente de gasto).

**Que no incluye:** Arrendamientos de ventas (5220) o producción (7305). Depreciación del derecho de uso NIIF 16 (5160). Arrendamientos por pagar (233540). Cánones pagados por anticipado (170525).

**Cuentas o nombres de cliente que podrian llegar aqui:** Arrendamientos administración, arriendo de oficinas, alquiler administrativo, canon de oficina, arrendamiento de equipos administración, arriendo de parqueadero.

**Soportes o terceros esperados:** Contrato de arrendamiento, factura/cuenta de cobro.

**Soportes de control recomendados:** Arrendador, inmueble/bien, centro de costo.

**Observaciones de homologacion:** Bajo NIIF 16, verificar si el contrato genera derecho de uso (en cuyo caso el gasto es depreciación + interés, no canon). Arrendamientos de bajo valor/corto plazo van a gasto. Verificar retención (236530). Clasificar por área.

### 512505 - Contribuciones

| Atributo | Valor |
|---|---|
| Codigo | `512505` |
| Nombre | Contribuciones |
| Cuenta Russell / 4D | Contribuciones y afiliaciones administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5125` |
| Critica | no |

**Que incluye:** Gasto por contribuciones y afiliaciones del área administrativa: afiliaciones a gremios, cámaras, asociaciones, suscripciones institucionales, cuotas de sostenimiento.

**Que no incluye:** Contribuciones de superintendencias (impuestos 511595). Donaciones (539525). Aportes parafiscales (510595).

**Cuentas o nombres de cliente que podrian llegar aqui:** Contribuciones y afiliaciones, afiliaciones a gremios, cuotas de asociación, afiliación a cámara, suscripciones institucionales, cuotas de sostenimiento, membresías gremiales.

**Soportes o terceros esperados:** Factura/cuenta de cobro, soporte de la afiliación.

**Soportes de control recomendados:** Entidad, concepto, periodo.

**Observaciones de homologacion:** Verificar deducibilidad (relación con la actividad productora de renta). Distinguir de contribuciones obligatorias a entes de control (511595) y de donaciones (539525).

### 513005 - Seguros

| Atributo | Valor |
|---|---|
| Codigo | `513005` |
| Nombre | Seguros |
| Cuenta Russell / 4D | Seguros administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5130` |
| Critica | no |

**Que incluye:** Gasto por seguros del área administrativa devengados en el periodo: pólizas de oficinas, RC, manejo, cumplimiento, vida del personal administrativo, asociadas a la administración.

**Que no incluye:** Seguros de ventas (5230) o producción (7305). Seguros pagados por anticipado no devengados (170520). Seguros por pagar (233555).

**Cuentas o nombres de cliente que podrian llegar aqui:** Seguros administración, primas de seguro administración, pólizas administrativas, seguro de oficinas, RC administración, seguro de manejo, gasto de seguros.

**Soportes o terceros esperados:** Póliza, factura, cálculo del devengo.

**Soportes de control recomendados:** Aseguradora, ramo, vigencia, centro de costo.

**Observaciones de homologacion:** Reconocer la porción devengada en el periodo (la no devengada es activo, 170520). Verificar deducibilidad. Clasificar por área.

### 513505 - Servicios

| Atributo | Valor |
|---|---|
| Codigo | `513505` |
| Nombre | Servicios |
| Cuenta Russell / 4D | Servicios administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5135` |
| Critica | no |

**Que incluye:** Gasto por servicios del área administrativa: servicios públicos (energía, agua, gas, aseo, telefonía, internet), vigilancia, aseo, temporales, servicios técnicos administrativos, procesamiento de datos.

**Que no incluye:** Servicios de ventas (5235) o producción (7305). Transportes y fletes (513550). Honorarios (5110). Mantenimiento (5145). Servicios por pagar (2335).

**Cuentas o nombres de cliente que podrian llegar aqui:** Servicios administración, servicios públicos, energía, agua, telefonía, internet, vigilancia, aseo, servicios temporales, servicios técnicos administración, procesamiento de datos, servicios generales.

**Soportes o terceros esperados:** Factura, contrato/orden de servicio, soporte de seguridad social (servicios personales).

**Soportes de control recomendados:** Proveedor, tipo de servicio, centro de costo.

**Observaciones de homologacion:** Agrupa servicios administrativos varios. Verificar retención por servicios (236525) y bases AIU en vigilancia/aseo/temporales. Causar servicios públicos devengados no facturados (corte). Clasificar por área.

### 513550 - Transportes, fletes y acarreos

| Atributo | Valor |
|---|---|
| Codigo | `513550` |
| Nombre | Transportes, fletes y acarreos |
| Cuenta Russell / 4D | Servicios administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5135` |
| Critica | no |

**Que incluye:** Gasto por transportes, fletes y acarreos del área administrativa: mensajería, transporte de documentos, acarreos administrativos.

**Que no incluye:** Fletes de distribución de ventas (523550). Fletes capitalizables al inventario (costo). Transporte como costo del servicio (giro, 6145). Fletes por pagar (233545).

**Cuentas o nombres de cliente que podrian llegar aqui:** Transportes administración, fletes administración, acarreos administrativos, mensajería, transporte de documentos, courier administrativo, portes.

**Soportes o terceros esperados:** Factura, soporte del servicio.

**Soportes de control recomendados:** Proveedor, concepto, centro de costo.

**Observaciones de homologacion:** Distinguir de fletes de distribución de ventas (523550) y de fletes capitalizables al inventario. Verificar retención por transporte. Clasificar por área.

### 514005 - Gastos legales

| Atributo | Valor |
|---|---|
| Codigo | `514005` |
| Nombre | Gastos legales |
| Cuenta Russell / 4D | Gastos legales administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5140` |
| Critica | no |

**Que incluye:** Gastos legales del área administrativa: registro mercantil, notariales, autenticaciones, derechos de cámara de comercio, trámites legales.

**Que no incluye:** Honorarios de abogados (5110). Multas y sanciones (539520). Gastos legales por pagar (233510). Gastos legales de ventas (5240).

**Cuentas o nombres de cliente que podrian llegar aqui:** Gastos legales administración, registro mercantil, gastos notariales, autenticaciones, derechos de cámara de comercio, trámites legales, registro de instrumentos.

**Soportes o terceros esperados:** Factura/recibo, liquidación de derechos.

**Soportes de control recomendados:** Tipo de trámite, entidad.

**Observaciones de homologacion:** Distinguir del honorario del abogado (5110) y de multas/sanciones (539520). Verificar deducibilidad. Clasificar por área.

### 514505 - Mantenimiento y reparaciones

| Atributo | Valor |
|---|---|
| Codigo | `514505` |
| Nombre | Mantenimiento y reparaciones |
| Cuenta Russell / 4D | Mantenimiento y reparaciones administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5145` |
| Critica | no |

**Que incluye:** Gasto por mantenimiento y reparaciones del área administrativa: mantenimiento de oficinas, equipos administrativos, locativo administrativo, software/equipos de cómputo administrativos.

**Que no incluye:** Mantenimiento de ventas (5245) o producción (7305). Mejoras capitalizables (PPE/diferido). Mantenimiento por pagar (233535). Adecuaciones (5150).

**Cuentas o nombres de cliente que podrian llegar aqui:** Mantenimiento administración, reparaciones administrativas, mantenimiento de oficinas, mantenimiento de equipos administrativos, mantenimiento locativo, soporte de software administración.

**Soportes o terceros esperados:** Factura, orden de trabajo, contrato de mantenimiento.

**Soportes de control recomendados:** Proveedor, activo, centro de costo.

**Observaciones de homologacion:** Distinguir mantenimiento (gasto) de mejora capitalizable (aumenta vida útil/capacidad, va a PPE o 171024). Verificar retención. Clasificar por área.

### 515005 - Adecuación e instalación

| Atributo | Valor |
|---|---|
| Codigo | `515005` |
| Nombre | Adecuación e instalación |
| Cuenta Russell / 4D | Adecuación e instalación administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5150` |
| Critica | no |

**Que incluye:** Gastos de adecuación e instalación del área administrativa que no califican para capitalización: instalaciones menores, adecuaciones temporales, reparaciones locativas menores.

**Que no incluye:** Adecuaciones capitalizables (mejoras a propiedades ajenas 171024 o PPE). Adecuación de ventas (5250 si existe) o producción. Mantenimiento (5145).

**Cuentas o nombres de cliente que podrian llegar aqui:** Adecuación e instalación administración, instalaciones menores, adecuaciones administrativas, reparaciones locativas menores, instalaciones temporales.

**Soportes o terceros esperados:** Factura, soporte del costo, criterio de capitalización.

**Soportes de control recomendados:** Concepto, centro de costo.

**Observaciones de homologacion:** Distinguir adecuación menor (gasto) de mejora capitalizable a inmueble propio (PPE) o ajeno (171024). Evaluar criterio de capitalización (vida útil > 1 año, aumenta valor). Clasificar por área.

### 515505 - Gastos de viaje

| Atributo | Valor |
|---|---|
| Codigo | `515505` |
| Nombre | Gastos de viaje |
| Cuenta Russell / 4D | Gastos de viaje administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5155` |
| Critica | no |

**Que incluye:** Gastos de viaje del personal administrativo: tiquetes, alojamiento, manutención, viáticos, transporte en comisión del área administrativa.

**Que no incluye:** Gastos de viaje de ventas (5255). Anticipos de viaje por legalizar (133015). Gastos de representación (según política). Viáticos constitutivos de salario (nómina).

**Cuentas o nombres de cliente que podrian llegar aqui:** Gastos de viaje administración, viáticos administración, tiquetes administración, alojamiento en comisión, manutención de viaje, transporte en comisión, viáticos administrativos.

**Soportes o terceros esperados:** Legalización de gastos, recibos, autorización de comisión.

**Soportes de control recomendados:** Empleado, comisión, centro de costo.

**Observaciones de homologacion:** Verificar legalización con soportes (deducibilidad). Distinguir viáticos ocasionales (gasto) de permanentes constitutivos de salario (nómina, con aportes). Clasificar por área.

### 516005 - Depreciaciones

| Atributo | Valor |
|---|---|
| Codigo | `516005` |
| Nombre | Depreciaciones |
| Cuenta Russell / 4D | Depreciaciones administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5160` |
| Critica | no |

**Que incluye:** Gasto por depreciación de PPE asignado al área administrativa: depreciación de edificios, muebles, equipos de oficina, cómputo y vehículos de administración (NIC 16).

**Que no incluye:** Depreciación de ventas (5260) o producción (7305/costo). Depreciación acumulada (1592). Amortización de intangibles (5165). Deterioro (5199).

**Cuentas o nombres de cliente que podrian llegar aqui:** Depreciaciones administración, gasto de depreciación administrativa, depreciación de activos administración, depreciación de oficinas, depreciación de equipos administrativos.

**Soportes o terceros esperados:** Cálculo de depreciación, registro de activos fijos, política de vidas útiles.

**Soportes de control recomendados:** Activo, centro de costo, vida útil.

**Observaciones de homologacion:** Contrapartida en la depreciación acumulada (1592). Asignar al área según uso del activo (administración vs ventas vs producción). En producción la depreciación es costo, no gasto. Verificar vidas útiles (NIC 16).

### 516510 - Amortización de intangibles

| Atributo | Valor |
|---|---|
| Codigo | `516510` |
| Nombre | Amortización de intangibles |
| Cuenta Russell / 4D | Amortizaciones administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5165` |
| Critica | no |

**Que incluye:** Gasto por amortización de intangibles asignado al área administrativa: amortización de software, licencias, marcas/patentes de vida definida, mejoras a propiedades ajenas administrativas (NIC 38).

**Que no incluye:** Amortización de ventas/producción. Amortización acumulada (1698/179810). Depreciación de PPE (5160). Deterioro (5199).

**Cuentas o nombres de cliente que podrian llegar aqui:** Amortización de intangibles administración, amortización de software, amortización de licencias, amortización administrativa, amortización de mejoras a propiedades ajenas.

**Soportes o terceros esperados:** Cálculo de amortización, registro de intangibles, política.

**Soportes de control recomendados:** Intangible, centro de costo, vida útil.

**Observaciones de homologacion:** Contrapartida en amortización acumulada (1698/179810). Asignar al área según uso. Solo se amortizan intangibles de vida definida. Verificar vida útil (NIC 38).

### 519505 - Comisiones

| Atributo | Valor |
|---|---|
| Codigo | `519505` |
| Nombre | Comisiones |
| Cuenta Russell / 4D | Diversos administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5195` |
| Critica | no |

**Que incluye:** Gasto por comisiones del área administrativa: comisiones a terceros por gestiones administrativas, comisiones de servicios.

**Que no incluye:** Comisiones bancarias/financieras (5305). Comisiones de ventas (5295). Comisiones laborales (nómina). Comisiones por pagar (233520).

**Cuentas o nombres de cliente que podrian llegar aqui:** Comisiones administración, comisiones a terceros, comisiones de gestión, comisiones administrativas, comisiones por servicios.

**Soportes o terceros esperados:** Factura/cuenta de cobro, contrato, liquidación.

**Soportes de control recomendados:** Tercero, concepto, centro de costo.

**Observaciones de homologacion:** Distinguir de comisiones bancarias (5305), de ventas (5295) y laborales (nómina). Verificar retención (236520). Clasificar por área.

### 519530 - Útiles, papelería y fotocopias

| Atributo | Valor |
|---|---|
| Codigo | `519530` |
| Nombre | Útiles, papelería y fotocopias |
| Cuenta Russell / 4D | Diversos administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5195` |
| Critica | no |

**Que incluye:** Gasto por útiles de oficina, papelería, fotocopias e insumos de oficina del área administrativa.

**Que no incluye:** Útiles de ventas (5295) o producción (7305). Equipos de oficina (PPE). Software (intangible).

**Cuentas o nombres de cliente que podrian llegar aqui:** Útiles y papelería, papelería administración, fotocopias, útiles de oficina, insumos de oficina, suministros de oficina, elementos de papelería.

**Soportes o terceros esperados:** Factura, soporte del gasto.

**Soportes de control recomendados:** Concepto, centro de costo.

**Observaciones de homologacion:** Gasto menor de operación. Verificar que no incluya activos (equipos). Clasificar por área.

### 519535 - Combustibles y lubricantes

| Atributo | Valor |
|---|---|
| Codigo | `519535` |
| Nombre | Combustibles y lubricantes |
| Cuenta Russell / 4D | Diversos administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5195` |
| Critica | no |

**Que incluye:** Gasto por combustibles y lubricantes de vehículos y equipos del área administrativa.

**Que no incluye:** Combustible de ventas (5295) o de la flota productiva (costo 6145/7305). Combustible para reventa (inventario/costo). Mantenimiento (5145).

**Cuentas o nombres de cliente que podrian llegar aqui:** Combustibles y lubricantes, combustible administración, gasolina, ACPM, lubricantes, combustible de vehículos administrativos.

**Soportes o terceros esperados:** Factura, control de consumo.

**Soportes de control recomendados:** Vehículo/equipo, centro de costo.

**Observaciones de homologacion:** Distinguir del combustible de la flota productiva (costo del servicio, 6145) y del combustible para reventa. Verificar soporte y control de consumo. Clasificar por área.

### 519595 - Otros gastos

| Atributo | Valor |
|---|---|
| Codigo | `519595` |
| Nombre | Otros gastos |
| Cuenta Russell / 4D | Diversos administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5195` |
| Critica | no |

**Que incluye:** Otros gastos diversos del área administrativa no clasificados: aseo y cafetería, gastos de representación, publicidad institucional menor, suscripciones, taxis, parqueaderos, gastos varios administrativos.

**Que no incluye:** Gastos con subcuenta específica. Gastos de ventas (5295). Gastos financieros (5305). Gastos no operacionales (5310-5395).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros gastos administración, gastos varios, aseo y cafetería, gastos de representación, taxis, parqueaderos, suscripciones, gastos diversos administrativos, elementos de aseo.

**Soportes o terceros esperados:** Factura/soporte del gasto, autorización.

**Soportes de control recomendados:** Concepto, centro de costo.

**Observaciones de homologacion:** Cuenta residual de gastos administrativos. Reclasificar a subcuenta específica si aplica. Verificar deducibilidad (gastos de representación con condiciones). Vigilar que no oculte partidas sin soporte.

### 519910 - Deterioro de deudores

| Atributo | Valor |
|---|---|
| Codigo | `519910` |
| Nombre | Deterioro de deudores |
| Cuenta Russell / 4D | Provisiones administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5199` |
| Critica | no |

**Que incluye:** Gasto por deterioro (provisión) de cartera y deudores reconocido en el periodo: pérdida esperada de cartera de clientes y otros deudores (NIIF 9).

**Que no incluye:** El deterioro acumulado (cuenta correctora del activo, 1399). Deterioro de PPE (519915) o inventarios (costo). Castigos directos de cartera.

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro de deudores, gasto de provisión de cartera, provisión de deudores, deterioro de cartera, gasto por incobrables, provisión de clientes, pérdida esperada de cartera.

**Soportes o terceros esperados:** Cálculo de pérdida esperada, matriz de provisiones, análisis de antigüedad, política.

**Soportes de control recomendados:** Cartera, antigüedad, periodo.

**Observaciones de homologacion:** Gasto del periodo; la contrapartida es la cuenta correctora del activo (1399). Modelo de pérdida esperada (NIIF 9). Verificar razonabilidad (NIA 540) y consistencia con la matriz de provisiones. Evaluar sesgo de la administración.

### 519915 - Deterioro de PPE

| Atributo | Valor |
|---|---|
| Codigo | `519915` |
| Nombre | Deterioro de PPE |
| Cuenta Russell / 4D | Provisiones administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5199` |
| Critica | no |

**Que incluye:** Gasto por deterioro de propiedad, planta y equipo e intangibles reconocido en el periodo cuando el valor recuperable es menor al valor en libros (NIC 36).

**Que no incluye:** El deterioro acumulado (cuentas correctoras 1599/1699). Depreciación (5160). Deterioro de deudores (519910) o inventarios (costo). Baja de activos (5310).

**Cuentas o nombres de cliente que podrian llegar aqui:** Deterioro de PPE, gasto por deterioro de activos, deterioro de propiedad planta y equipo, pérdida por deterioro, deterioro de intangibles, provisión de PPE.

**Soportes o terceros esperados:** Test de deterioro, cálculo del valor recuperable, indicios, UGE.

**Soportes de control recomendados:** Activo/UGE, causa, periodo.

**Observaciones de homologacion:** Gasto del periodo; contrapartida en cuentas correctoras (1599/1699). Reconocer cuando el valor recuperable es menor al valor en libros (NIC 36). Partida de juicio (NIA 540). Verificar indicios y supuestos del test. Evaluar reversión (excepto crédito mercantil).

### 519995 - Otros deterioros y provisiones

| Atributo | Valor |
|---|---|
| Codigo | `519995` |
| Nombre | Otros deterioros y provisiones |
| Cuenta Russell / 4D | Provisiones administración |
| Tipo de rubro | Gastos de administración |
| Naturaleza | Debito (`D`) |
| Padre logico | `5199` |
| Critica | no |

**Que incluye:** Otros deterioros y provisiones reconocidos como gasto del periodo no clasificados: deterioro de inversiones, deterioro de otros activos, provisiones diversas administrativas.

**Que no incluye:** Deterioro de deudores (519910) o de PPE (519915). Provisiones de pasivos (2605-2695, con su propia contrapartida de gasto). Castigos directos.

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros deterioros y provisiones, deterioro de inversiones, deterioro de otros activos, provisiones diversas, gasto por provisiones administrativas, otros deterioros.

**Soportes o terceros esperados:** Cálculo del deterioro/provisión, soporte, política.

**Soportes de control recomendados:** Activo/concepto, causa, periodo.

**Observaciones de homologacion:** Cuenta residual de deterioros/provisiones como gasto. Reclasificar a subcuenta específica si aplica. Verificar razonabilidad (NIA 540). Distinguir deterioro de activos de provisiones de pasivos.

### 520506 - Sueldos

| Atributo | Valor |
|---|---|
| Codigo | `520506` |
| Nombre | Sueldos |
| Cuenta Russell / 4D | 5205 – Gastos de personal |
| Tipo de rubro | Gasto laboral – salario ordinario |
| Naturaleza | Debito (`D`) |
| Padre logico | `5205` |
| Critica | no |

**Que incluye:** Sueldos básicos, salario ordinario, salario integral si aplica, pagos salariales del personal comercial, administrativo o del área clasificada en 5205.

**Que no incluye:** Prestaciones sociales, seguridad social patronal, parafiscales, anticipos de nómina, préstamos a empleados, bonificaciones no salariales, indemnizaciones y pagos a contratistas.

**Cuentas o nombres de cliente que podrian llegar aqui:** Salario básico, horas ordinarias, ajustes salariales, retroactivos salariales, comisiones salariales si la política las clasifica dentro de sueldos.

**Soportes o terceros esperados:** Nómina mensual, contratos laborales, novedades de nómina, desprendibles de pago, autorizaciones salariales, soporte de ingreso y retiro.

**Soportes de control recomendados:** Conciliación nómina vs. contabilidad, revisión de empleados activos, prueba de corte, validación de novedades, cruce con pagos bancarios y comprobantes de egreso.

**Observaciones de homologacion:** Homologar aquí únicamente remuneración salarial. Revisar que no existan contratistas, anticipos o beneficios no salariales registrados como sueldo.

### 520530 - Cesantías

| Atributo | Valor |
|---|---|
| Codigo | `520530` |
| Nombre | Cesantías |
| Cuenta Russell / 4D | 5205 – Gastos de personal |
| Tipo de rubro | Beneficio a empleados – prestación social |
| Naturaleza | Debito (`D`) |
| Padre logico | `5205` |
| Critica | no |

**Que incluye:** Causación o provisión de cesantías del personal clasificado en 5205. Incluye el valor proporcional causado por el tiempo laborado.

**Que no incluye:** Intereses sobre cesantías si se manejan en cuenta separada, vacaciones, prima, sueldos, seguridad social, indemnizaciones o pagos no laborales.

**Cuentas o nombres de cliente que podrian llegar aqui:** Cesantías causadas de personal comercial, administrativo, vendedores, coordinadores o personal asociado al rubro 5205.

**Soportes o terceros esperados:** Liquidación de nómina, acumulado de prestaciones, contrato laboral, reporte por empleado, certificado o soporte del fondo de cesantías.

**Soportes de control recomendados:** Recalculo por empleado, conciliación provisión contable vs. nómina, validación de base salarial, revisión de pagos al fondo y saldos pendientes.

**Observaciones de homologacion:** Cuenta sensible en cierre anual. Debe conciliarse lo causado, pagado y pendiente por empleado. Las cesantías tienen regulación laboral específica en el Código Sustantivo del Trabajo. (Secretaría del Senado)

### 520536 - Prima de servicios

| Atributo | Valor |
|---|---|
| Codigo | `520536` |
| Nombre | Prima de servicios |
| Cuenta Russell / 4D | 5205 – Gastos de personal |
| Tipo de rubro | Beneficio a empleados – prestación social |
| Naturaleza | Debito (`D`) |
| Padre logico | `5205` |
| Critica | no |

**Que incluye:** Causación de prima legal de servicios del personal clasificado en 5205. Incluye prima proporcional y saldos pendientes de pago.

**Que no incluye:** Bonificaciones extralegales, comisiones, cesantías, vacaciones, auxilios no salariales o pagos extraordinarios no clasificados como prima.

**Cuentas o nombres de cliente que podrian llegar aqui:** Prima de servicios de vendedores, personal comercial, personal administrativo asignado a ventas o empleados clasificados en 5205.

**Soportes o terceros esperados:** Nómina, acumulado semestral, comprobantes de pago, liquidaciones definitivas, contratos laborales y novedades.

**Soportes de control recomendados:** Recalculo semestral, conciliación provisión vs. pagos de junio y diciembre, revisión de empleados retirados, validación de base salarial.

**Observaciones de homologacion:** En cierre mensual debe causarse proporcionalmente. En cierre anual debe quedar conciliada la obligación pendiente y los pagos realizados.

### 520539 - Vacaciones

| Atributo | Valor |
|---|---|
| Codigo | `520539` |
| Nombre | Vacaciones |
| Cuenta Russell / 4D | 5205 – Gastos de personal |
| Tipo de rubro | Beneficio a empleados – ausencia remunerada |
| Naturaleza | Debito (`D`) |
| Padre logico | `5205` |
| Critica | no |

**Que incluye:** Provisión de vacaciones causadas, vacaciones disfrutadas y vacaciones pendientes de pago del personal asociado al rubro 5205.

**Que no incluye:** Cesantías, prima, incapacidades, licencias no remuneradas, indemnizaciones o bonificaciones.

**Cuentas o nombres de cliente que podrian llegar aqui:** Vacaciones de personal comercial, administrativo de ventas, coordinadores, vendedores y empleados relacionados con 5205.

**Soportes o terceros esperados:** Kardex de vacaciones, nómina, reporte de días causados y disfrutados, liquidaciones definitivas, autorizaciones de vacaciones.

**Soportes de control recomendados:** Conciliación de días causados vs. días disfrutados, recalculo de provisión, revisión de saldos negativos, corte de retiros y comparación contra auxiliar de nómina.

**Observaciones de homologacion:** Las vacaciones deben soportarse por empleado y no solo por estimación global. En auditoría anual es crítico validar días pendientes, base salarial y liquidaciones definitivas.

### 520568 - Aportes ARL

| Atributo | Valor |
|---|---|
| Codigo | `520568` |
| Nombre | Aportes ARL |
| Cuenta Russell / 4D | 5205 – Gastos de personal |
| Tipo de rubro | Seguridad social patronal – riesgos laborales |
| Naturaleza | Debito (`D`) |
| Padre logico | `5205` |
| Critica | no |

**Que incluye:** Aportes patronales a la Administradora de Riesgos Laborales correspondientes al personal clasificado en 5205.

**Que no incluye:** EPS, pensión, caja de compensación, SENA, ICBF, descuentos al trabajador, incapacidades por cobrar o recobros.

**Cuentas o nombres de cliente que podrian llegar aqui:** ARL de vendedores, personal comercial, supervisores, personal de campo o empleados de ventas sujetos a riesgo laboral.

**Soportes o terceros esperados:** Planilla PILA, nómina, matriz de riesgos, afiliación ARL, reporte de IBC y comprobantes de pago.

**Soportes de control recomendados:** Conciliación PILA vs. nómina y contabilidad, revisión de clase de riesgo, validación de IBC, cruce de empleados afiliados y pagos oportunos.

**Observaciones de homologacion:** Cuenta de riesgo UGPP. Validar que el aporte corresponda a la clase de riesgo real y que todos los empleados estén incluidos en PILA. (UGPP)

### 520569 - Aportes EPS

| Atributo | Valor |
|---|---|
| Codigo | `520569` |
| Nombre | Aportes EPS |
| Cuenta Russell / 4D | 5205 – Gastos de personal |
| Tipo de rubro | Seguridad social patronal – salud |
| Naturaleza | Debito (`D`) |
| Padre logico | `5205` |
| Critica | no |

**Que incluye:** Aporte patronal a salud correspondiente al personal clasificado en 5205, causado según el IBC reportado.

**Que no incluye:** Descuentos de salud al trabajador, pensión, ARL, parafiscales, recobros de incapacidades, préstamos o anticipos.

**Cuentas o nombres de cliente que podrian llegar aqui:** EPS de empleados comerciales, administrativos de ventas, vendedores y personal asociado al rubro 5205.

**Soportes o terceros esperados:** Planilla PILA, nómina, afiliaciones EPS, reporte de IBC, comprobantes de pago y relación de empleados.

**Soportes de control recomendados:** Conciliación PILA vs. nómina y contabilidad, validación de novedades, ingresos, retiros, licencias, incapacidades y base de cotización.

**Observaciones de homologacion:** Homologar aquí solo la porción patronal si la contabilidad separa aportes del empleado. Los descuentos del trabajador deben registrarse como pasivo.

### 520570 - Aportes pensión y cesantías

| Atributo | Valor |
|---|---|
| Codigo | `520570` |
| Nombre | Aportes pensión y cesantías |
| Cuenta Russell / 4D | 5205 – Gastos de personal |
| Tipo de rubro | Seguridad social / beneficios a empleados |
| Naturaleza | Debito (`D`) |
| Padre logico | `5205` |
| Critica | no |

**Que incluye:** Aportes patronales a pensión y, si la parametrización lo permite, pagos o ajustes relacionados con fondos de cesantías del personal clasificado en 5205.

**Que no incluye:** EPS, ARL, caja de compensación, SENA, ICBF, descuentos del trabajador, préstamos, anticipos o pagos no laborales.

**Cuentas o nombres de cliente que podrian llegar aqui:** Aportes patronales a pensión, fondos de pensiones, ajustes PILA, pagos a fondos de cesantías cuando la entidad los registra en esta cuenta.

**Soportes o terceros esperados:** Planilla PILA, nómina, certificados de fondos de pensiones y cesantías, comprobantes de pago, auxiliares por tercero.

**Soportes de control recomendados:** Conciliación PILA vs. contabilidad, revisión de terceros, validación de IBC, separación entre aporte a pensión y provisión/pago de cesantías.

**Observaciones de homologacion:** Recomendación de auditoría: separar pensión y cesantías en cuentas distintas. Pensión corresponde a seguridad social; cesantías corresponde a prestación social. Mezclarlas reduce trazabilidad.

### 520595 - Otros gastos de personal

| Atributo | Valor |
|---|---|
| Codigo | `520595` |
| Nombre | Otros gastos de personal |
| Cuenta Russell / 4D | 5205 – Gastos de personal |
| Tipo de rubro | Otros beneficios a empleados |
| Naturaleza | Debito (`D`) |
| Padre logico | `5205` |
| Critica | no |

**Que incluye:** Dotación, bienestar, auxilios, capacitaciones, exámenes médicos ocupacionales, bonificaciones, beneficios extralegales, incapacidades no recuperables u otros conceptos laborales del personal 5205.

**Que no incluye:** Gastos personales de socios, pagos sin soporte, préstamos a empleados, anticipos, honorarios de contratistas, viáticos sin relación laboral o gastos administrativos no laborales.

**Cuentas o nombres de cliente que podrian llegar aqui:** Dotación, auxilios de alimentación o transporte extralegal, bienestar laboral, capacitaciones comerciales, bonificaciones no salariales, medicina laboral.

**Soportes o terceros esperados:** Facturas de proveedores, nómina, política de beneficios, autorizaciones internas, relación de empleados beneficiarios, comprobantes de pago.

**Soportes de control recomendados:** Revisión analítica mensual, aprobación del gasto, validación de soporte, cruce con política interna, análisis de conceptos inusuales y reclasificación si aplica.

**Observaciones de homologacion:** Cuenta residual de alto riesgo. No debe usarse como cuenta “bolsillo”. Para auditoría conviene subclasificar por naturaleza: dotación, bienestar, capacitación, bonificaciones, auxilios e incapacidades.

### 521005 - Honorarios

| Atributo | Valor |
|---|---|
| Codigo | `521005` |
| Nombre | Honorarios |
| Cuenta Russell / 4D | Honorarios ventas |
| Tipo de rubro | Gastos de ventas |
| Naturaleza | Debito (`D`) |
| Padre logico | `5210` |
| Critica | no |

**Que incluye:** Honorarios profesionales del área comercial: asesorías de mercadeo, estudios de mercado, consultoría comercial, honorarios de agencias.

**Que no incluye:** Honorarios de administración (5110) o producción. Comisiones (5295). Publicidad (523560). Servicios técnicos (5235). Honorarios por pagar (233525).

**Cuentas o nombres de cliente que podrian llegar aqui:** Honorarios ventas, asesoría de mercadeo, estudios de mercado, consultoría comercial, honorarios de agencia, asesoría comercial.

**Soportes o terceros esperados:** Factura/cuenta de cobro, contrato, seguridad social del prestador.

**Soportes de control recomendados:** Tercero, tipo, centro de costo.

**Observaciones de homologacion:** Clasificar por área. Verificar retención (236515) y seguridad social (Art. 87-1). Distinguir de publicidad (523560) y comisiones (5295).

### 521595 - Otros impuestos

| Atributo | Valor |
|---|---|
| Codigo | `521595` |
| Nombre | Otros impuestos |
| Cuenta Russell / 4D | Impuestos ventas |
| Tipo de rubro | Gastos de ventas |
| Naturaleza | Debito (`D`) |
| Padre logico | `5215` |
| Critica | no |

**Que incluye:** Impuestos, tasas y contribuciones del área de ventas que son gasto: ICA atribuible a ventas, otros tributos comerciales deducibles.

**Que no incluye:** Impuestos de administración (5115). Impuesto de renta (5405). IVA (cuentas de IVA). Impuestos por pagar (24xx).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros impuestos ventas, ICA ventas, impuestos comerciales, tasas y contribuciones ventas, impuestos del área comercial.

**Soportes o terceros esperados:** Liquidación del tributo, declaración, soporte de pago.

**Soportes de control recomendados:** Tipo de tributo, municipio, periodo.

**Observaciones de homologacion:** Verificar deducibilidad (Art. 115 E.T.). Distinguir de impuestos de administración (5115). Clasificar por área. La mayoría de empresas concentra el ICA en una sola cuenta; verificar la asignación.

### 522005 - Arrendamientos

| Atributo | Valor |
|---|---|
| Codigo | `522005` |
| Nombre | Arrendamientos |
| Cuenta Russell / 4D | Arrendamientos ventas |
| Tipo de rubro | Gastos de ventas |
| Naturaleza | Debito (`D`) |
| Padre logico | `5220` |
| Critica | no |

**Que incluye:** Gasto por arrendamientos del área comercial: locales comerciales, puntos de venta, showrooms, bodegas de distribución, espacios en centros comerciales (componente de gasto / contratos sin derecho de uso NIIF 16). Retail: arriendo de locales y puntos de venta.

**Que no incluye:** Arrendamientos de administración (5120) o producción (7305). Derecho de uso NIIF 16 (depreciación 5260). Arrendamientos por pagar (233540). Cánones pagados por anticipado (170525).

**Cuentas o nombres de cliente que podrian llegar aqui:** Arrendamientos ventas, arriendo de locales, alquiler de puntos de venta, canon de local comercial, arriendo de showroom, arrendamiento de bodega de distribución, espacio en centro comercial.

**Soportes o terceros esperados:** Contrato de arrendamiento, factura/cuenta de cobro.

**Soportes de control recomendados:** Arrendador, local/punto de venta, centro de costo.

**Observaciones de homologacion:** En retail es partida material. Bajo NIIF 16, verificar si genera derecho de uso (depreciación + interés en lugar de canon). Contratos de bajo valor/corto plazo van a gasto. Verificar retención (236530). Clasificar por área.

### 523005 - Seguros

| Atributo | Valor |
|---|---|
| Codigo | `523005` |
| Nombre | Seguros |
| Cuenta Russell / 4D | Seguros ventas |
| Tipo de rubro | Gastos de ventas |
| Naturaleza | Debito (`D`) |
| Padre logico | `5230` |
| Critica | no |

**Que incluye:** Gasto por seguros del área comercial devengados: pólizas de puntos de venta, mercancía en exhibición, transporte de mercancía vendida, RC comercial.

**Que no incluye:** Seguros de administración (5130) o producción (7305). Seguros pagados por anticipado no devengados (170520). Seguros por pagar (233555).

**Cuentas o nombres de cliente que podrian llegar aqui:** Seguros ventas, primas de seguro comercial, pólizas de puntos de venta, seguro de mercancía, seguro de transporte de ventas, RC comercial.

**Soportes o terceros esperados:** Póliza, factura, cálculo del devengo.

**Soportes de control recomendados:** Aseguradora, ramo, vigencia, centro de costo.

**Observaciones de homologacion:** Reconocer la porción devengada (la no devengada es activo, 170520). Verificar deducibilidad. Clasificar por área.

### 523505 - Servicios

| Atributo | Valor |
|---|---|
| Codigo | `523505` |
| Nombre | Servicios |
| Cuenta Russell / 4D | Servicios ventas |
| Tipo de rubro | Gastos de ventas |
| Naturaleza | Debito (`D`) |
| Padre logico | `5235` |
| Critica | no |

**Que incluye:** Gasto por servicios del área comercial: servicios públicos de puntos de venta, vigilancia y aseo de locales, servicios técnicos comerciales, comisiones de pasarelas/medios de pago según política.

**Que no incluye:** Servicios de administración (5135) o producción (7305). Transportes y fletes (523550). Publicidad (523560). Honorarios (5210). Servicios por pagar (2335).

**Cuentas o nombres de cliente que podrian llegar aqui:** Servicios ventas, servicios públicos de locales, vigilancia comercial, aseo de puntos de venta, servicios técnicos comerciales, comisiones de pasarela, servicios de puntos de venta.

**Soportes o terceros esperados:** Factura, contrato/orden de servicio, soporte de seguridad social (servicios personales).

**Soportes de control recomendados:** Proveedor, tipo de servicio, punto de venta/centro de costo.

**Observaciones de homologacion:** Agrupa servicios del área comercial. Verificar retención (236525) y bases AIU (vigilancia/aseo). Las comisiones de medios de pago según política pueden ir aquí o como menor valor del recaudo. Clasificar por área.

### 523550 - Transportes, fletes y acarreos

| Atributo | Valor |
|---|---|
| Codigo | `523550` |
| Nombre | Transportes, fletes y acarreos |
| Cuenta Russell / 4D | Servicios ventas |
| Tipo de rubro | Gastos de ventas |
| Naturaleza | Debito (`D`) |
| Padre logico | `5235` |
| Critica | no |

**Que incluye:** Gasto por transportes, fletes y acarreos de distribución (entrega de mercancía vendida): fletes de distribución, última milla, transporte de mercancía a clientes, paqueteo, courier de despachos. Retail/comercio/manufactura: distribución del producto vendido.

**Que no incluye:** Fletes de administración (513550). Fletes capitalizables al inventario de compra (costo). Transporte como costo del servicio (giro de transporte, 6145). Fletes por pagar (233545).

**Cuentas o nombres de cliente que podrian llegar aqui:** Fletes de distribución, transportes ventas, acarreos de distribución, última milla, courier de despachos, paqueteo, transporte de mercancía vendida, fletes de entrega, distribución a clientes, logística de salida.

**Soportes o terceros esperados:** Factura, remesa de carga, guía, soporte de entrega.

**Soportes de control recomendados:** Transportador, ruta/zona, centro de costo.

**Observaciones de homologacion:** Gasto de distribución de la mercancía vendida (no se capitaliza al inventario, a diferencia de los fletes de compra). Distinguir del transporte como giro del negocio (6145). En e-commerce/retail es material. Verificar retención por transporte. Clasificar por área.

### 523560 - Publicidad, propaganda y promoción

| Atributo | Valor |
|---|---|
| Codigo | `523560` |
| Nombre | Publicidad, propaganda y promoción |
| Cuenta Russell / 4D | Servicios ventas |
| Tipo de rubro | Gastos de ventas |
| Naturaleza | Debito (`D`) |
| Padre logico | `5235` |
| Critica | no |

**Que incluye:** Gasto por publicidad, propaganda, promoción y mercadeo: pauta digital y tradicional, agencias de publicidad, material POP, eventos comerciales, influencers, promociones, branding, marketing. Retail/consumo/tecnología: inversión publicitaria (partida material).

**Que no incluye:** Honorarios de mercadeo (5210). Marcas adquiridas (intangible 1610). Descuentos en ventas (menor ingreso, 417505). Muestras gratis según política (gasto/menor inventario).

**Cuentas o nombres de cliente que podrian llegar aqui:** Publicidad y propaganda, promoción, mercadeo, pauta digital, pauta publicitaria, agencia de publicidad, material POP, eventos comerciales, influencers, marketing, branding, campañas, promociones, publicidad en redes.

**Soportes o terceros esperados:** Factura, contrato/orden de publicidad, plan de medios, soporte de la pauta.

**Soportes de control recomendados:** Medio/canal, campaña, producto, centro de costo.

**Observaciones de homologacion:** Partida material en sectores de consumo. Verificar deducibilidad (relación con la actividad y, para algunos pagos al exterior, límites). Distinguir de honorarios de mercadeo (5210) y de marcas (intangible). La pauta a plataformas del exterior puede generar retención y reteIVA (importación de servicios). Clasificar por área.

### 524005 - Gastos legales

| Atributo | Valor |
|---|---|
| Codigo | `524005` |
| Nombre | Gastos legales |
| Cuenta Russell / 4D | Gastos legales ventas |
| Tipo de rubro | Gastos de ventas |
| Naturaleza | Debito (`D`) |
| Padre logico | `5240` |
| Critica | no |

**Que incluye:** Gastos legales del área comercial: trámites legales, registros, derechos asociados a la actividad comercial.

**Que no incluye:** Honorarios de abogados (5210). Multas (539520). Gastos legales de administración (5140). Gastos legales por pagar (233510).

**Cuentas o nombres de cliente que podrian llegar aqui:** Gastos legales ventas, trámites legales comerciales, registros comerciales, derechos legales de ventas.

**Soportes o terceros esperados:** Factura/recibo, liquidación de derechos.

**Soportes de control recomendados:** Tipo de trámite, centro de costo.

**Observaciones de homologacion:** Distinguir del honorario del abogado (5210). Clasificar por área. Verificar deducibilidad.

### 524505 - Mantenimiento y reparaciones

| Atributo | Valor |
|---|---|
| Codigo | `524505` |
| Nombre | Mantenimiento y reparaciones |
| Cuenta Russell / 4D | Mantenimiento y reparaciones ventas |
| Tipo de rubro | Gastos de ventas |
| Naturaleza | Debito (`D`) |
| Padre logico | `5245` |
| Critica | no |

**Que incluye:** Gasto por mantenimiento y reparaciones del área comercial: mantenimiento de locales y puntos de venta, equipos comerciales, vehículos de distribución, exhibidores.

**Que no incluye:** Mantenimiento de administración (5145) o producción (7305). Mejoras capitalizables (PPE/171024). Mantenimiento por pagar (233535).

**Cuentas o nombres de cliente que podrian llegar aqui:** Mantenimiento ventas, reparaciones comerciales, mantenimiento de locales, mantenimiento de puntos de venta, mantenimiento de exhibidores, mantenimiento de vehículos de distribución.

**Soportes o terceros esperados:** Factura, orden de trabajo, contrato.

**Soportes de control recomendados:** Proveedor, activo/local, centro de costo.

**Observaciones de homologacion:** Distinguir mantenimiento (gasto) de mejora capitalizable. Verificar retención. Clasificar por área.

### 525505 - Gastos de viaje

| Atributo | Valor |
|---|---|
| Codigo | `525505` |
| Nombre | Gastos de viaje |
| Cuenta Russell / 4D | Gastos de viaje ventas |
| Tipo de rubro | Gastos de ventas |
| Naturaleza | Debito (`D`) |
| Padre logico | `5255` |
| Critica | no |

**Que incluye:** Gastos de viaje de la fuerza comercial: tiquetes, alojamiento, manutención, viáticos y transporte en comisiones comerciales (visitas a clientes, ferias).

**Que no incluye:** Gastos de viaje de administración (5155). Anticipos por legalizar (133015). Viáticos permanentes constitutivos de salario (nómina). Gastos de representación.

**Cuentas o nombres de cliente que podrian llegar aqui:** Gastos de viaje ventas, viáticos comerciales, tiquetes de ventas, alojamiento comercial, manutención de viaje ventas, transporte en comisión comercial, gastos de feria.

**Soportes o terceros esperados:** Legalización, recibos, autorización de comisión.

**Soportes de control recomendados:** Empleado, comisión, centro de costo.

**Observaciones de homologacion:** Verificar legalización con soportes (deducibilidad). Distinguir viáticos ocasionales (gasto) de permanentes salariales (nómina). Clasificar por área.

### 526005 - Depreciaciones

| Atributo | Valor |
|---|---|
| Codigo | `526005` |
| Nombre | Depreciaciones |
| Cuenta Russell / 4D | Depreciaciones ventas |
| Tipo de rubro | Gastos de ventas |
| Naturaleza | Debito (`D`) |
| Padre logico | `5260` |
| Critica | no |

**Que incluye:** Gasto por depreciación de PPE asignado al área comercial: depreciación de locales, exhibidores, vehículos de distribución, equipos de puntos de venta (NIC 16).

**Que no incluye:** Depreciación de administración (5160) o producción (7305/costo). Depreciación acumulada (1592). Amortización de intangibles (5165). Deterioro (5199).

**Cuentas o nombres de cliente que podrian llegar aqui:** Depreciaciones ventas, depreciación comercial, depreciación de locales, depreciación de exhibidores, depreciación de vehículos de distribución, depreciación de puntos de venta.

**Soportes o terceros esperados:** Cálculo de depreciación, registro de activos, política de vidas útiles.

**Soportes de control recomendados:** Activo, centro de costo, vida útil.

**Observaciones de homologacion:** Contrapartida en depreciación acumulada (1592). Asignar al área según uso. Verificar vidas útiles (NIC 16). Clasificar por área.

### 529505 - Comisiones

| Atributo | Valor |
|---|---|
| Codigo | `529505` |
| Nombre | Comisiones |
| Cuenta Russell / 4D | Diversos ventas |
| Tipo de rubro | Gastos de ventas |
| Naturaleza | Debito (`D`) |
| Padre logico | `5295` |
| Critica | no |

**Que incluye:** Comisiones a terceros (no empleados) por ventas/intermediación comercial: comisiones a distribuidores, marketplaces, pasarelas, afiliados, agentes comerciales, representantes externos. Retail/tecnología: comisiones de canales digitales y marketplaces.

**Que no incluye:** Comisiones laborales a empleados (520518). Comisiones bancarias (5305). Comisiones de administración (519505). Comisiones por pagar (233520).

**Cuentas o nombres de cliente que podrian llegar aqui:** Comisiones ventas, comisiones a distribuidores, comisiones marketplace, comisiones pasarela de pago, comisiones de afiliados, comisiones a agentes, comisiones a representantes, comisiones de canal, comisiones de intermediación comercial, comisiones app store.

**Soportes o terceros esperados:** Factura/cuenta de cobro, contrato de comisión, liquidación, soporte de la venta.

**Soportes de control recomendados:** Tercero, canal, base de liquidación, centro de costo.

**Observaciones de homologacion:** Distinguir comisión a tercero independiente (este rubro, con retención 236520) de comisión laboral a empleado (520518, con aportes). Correlacionar con las ventas que las generan. La comisión a plataformas del exterior puede generar retención/reteIVA. Clasificar por área.

### 529595 - Otros gastos

| Atributo | Valor |
|---|---|
| Codigo | `529595` |
| Nombre | Otros gastos |
| Cuenta Russell / 4D | Diversos ventas |
| Tipo de rubro | Gastos de ventas |
| Naturaleza | Debito (`D`) |
| Padre logico | `5295` |
| Critica | no |

**Que incluye:** Otros gastos diversos del área comercial no clasificados: empaques de despacho (según política), muestras, atenciones a clientes, útiles comerciales, combustible de ventas, gastos varios comerciales.

**Que no incluye:** Gastos con subcuenta específica. Gastos de administración (5195). Publicidad (523560). Comisiones (529505). Gastos no operacionales (5310-5395).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros gastos ventas, gastos varios comerciales, empaques de despacho, muestras, atenciones a clientes, útiles comerciales, combustible ventas, gastos diversos de ventas.

**Soportes o terceros esperados:** Factura/soporte del gasto, autorización.

**Soportes de control recomendados:** Concepto, centro de costo.

**Observaciones de homologacion:** Cuenta residual de gastos de ventas. Reclasificar a subcuenta específica si aplica. Verificar deducibilidad (atenciones a clientes con condiciones). Clasificar por área.

### 530505 - Gastos bancarios

| Atributo | Valor |
|---|---|
| Codigo | `530505` |
| Nombre | Gastos bancarios |
| Cuenta Russell / 4D | Financieros |
| Tipo de rubro | Gastos no operacionales |
| Naturaleza | Debito (`D`) |
| Padre logico | `5305` |
| Critica | no |

**Que incluye:** Gastos por servicios bancarios: cuota de manejo, chequeras, comisiones de transacciones, costos de plataformas bancarias, portes, certificaciones bancarias.

**Que no incluye:** Intereses financieros (530520). Comisiones financieras de crédito (530515). GMF (511595/otros impuestos). Diferencia en cambio (530525).

**Cuentas o nombres de cliente que podrian llegar aqui:** Gastos bancarios, cuota de manejo, comisiones bancarias, chequeras, costos de transacción bancaria, portes bancarios, certificaciones bancarias, servicios bancarios.

**Soportes o terceros esperados:** Extracto bancario, soporte de la comisión.

**Soportes de control recomendados:** Banco, concepto, periodo.

**Observaciones de homologacion:** Distinguir de intereses (530520) y comisiones de crédito (530515). El GMF va a impuestos. Verificar deducibilidad. Cuenta de gastos financieros no operacionales.

### 530515 - Comisiones financieras

| Atributo | Valor |
|---|---|
| Codigo | `530515` |
| Nombre | Comisiones financieras |
| Cuenta Russell / 4D | Financieros |
| Tipo de rubro | Gastos no operacionales |
| Naturaleza | Debito (`D`) |
| Padre logico | `5305` |
| Critica | no |

**Que incluye:** Comisiones de naturaleza financiera: comisiones de crédito, comisiones de aval/garantía bancaria, comisiones de cartas de crédito, comisiones de factoring, comisiones de estructuración.

**Que no incluye:** Gastos bancarios operativos (530505). Intereses (530520). Comisiones comerciales a terceros (5295/233520). Diferencia en cambio (530525).

**Cuentas o nombres de cliente que podrian llegar aqui:** Comisiones financieras, comisiones de crédito, comisiones de aval, comisiones de garantía bancaria, comisiones de carta de crédito, comisiones de factoring, comisiones de estructuración financiera.

**Soportes o terceros esperados:** Liquidación de la comisión, contrato de crédito, soporte bancario.

**Soportes de control recomendados:** Entidad, operación, periodo.

**Observaciones de homologacion:** Distinguir de gastos bancarios operativos (530505) y de comisiones comerciales (5295). Algunas comisiones de crédito deben formar parte del costo amortizado de la obligación (NIIF 9), no del gasto del periodo. Verificar tratamiento.

### 530520 - Intereses financieros

| Atributo | Valor |
|---|---|
| Codigo | `530520` |
| Nombre | Intereses financieros |
| Cuenta Russell / 4D | Financieros |
| Tipo de rubro | Gastos no operacionales |
| Naturaleza | Debito (`D`) |
| Padre logico | `5305` |
| Critica | no |

**Que incluye:** Gasto por intereses de obligaciones financieras: intereses de créditos bancarios, leasing, intereses de mora financieros, intereses de obligaciones con particulares/socios/vinculados, componente financiero de instrumentos medidos a costo amortizado.

**Que no incluye:** Capital de las obligaciones (21xx). Comisiones financieras (530515). Diferencia en cambio (530525). Intereses sobre cesantías (laboral). Intereses capitalizables al activo (NIC 23).

**Cuentas o nombres de cliente que podrian llegar aqui:** Intereses financieros, intereses bancarios, intereses de créditos, intereses de leasing, intereses de mora, gastos por intereses, costo financiero, intereses de obligaciones, intereses de financiación.

**Soportes o terceros esperados:** Tabla de amortización, liquidación de intereses, extracto, contrato de crédito.

**Soportes de control recomendados:** Obligación, entidad, tasa, periodo.

**Observaciones de homologacion:** Reconocer por el método del costo amortizado (NIIF 9). Verificar capitalización de intereses de activos aptos (NIC 23). Validar deducibilidad y límite de subcapitalización (Art. 118-1 E.T.). Intereses a vinculados: precios de transferencia. Partida material en empresas endeudadas.

### 530525 - Gasto por diferencia en cambio

| Atributo | Valor |
|---|---|
| Codigo | `530525` |
| Nombre | Gasto por diferencia en cambio |
| Cuenta Russell / 4D | Financieros |
| Tipo de rubro | Gastos no operacionales |
| Naturaleza | Debito (`D`) |
| Padre logico | `5305` |
| Critica | no |

**Que incluye:** Gasto por diferencia en cambio desfavorable sobre activos y pasivos en moneda extranjera (cuentas por cobrar/pagar en ME, obligaciones en ME, efectivo en ME) medidos a TRM (NIC 21).

**Que no incluye:** Ingreso por diferencia en cambio favorable (421020). Capital de las partidas en ME. Coberturas designadas (NIIF 9). Diferencia en cambio capitalizable al activo (casos específicos).

**Cuentas o nombres de cliente que podrian llegar aqui:** Gasto por diferencia en cambio, diferencia en cambio desfavorable, pérdida por diferencia en cambio, pérdida por tipo de cambio, ajuste cambiario desfavorable, diferencia cambiaria gasto.

**Soportes o terceros esperados:** TRM de cierre, soporte de saldos en ME, cálculo de la diferencia.

**Soportes de control recomendados:** Moneda, partida origen, realizada/no realizada.

**Observaciones de homologacion:** Medir saldos en ME a TRM de cierre (NIC 21). Separar realizada (al pago/cobro) de no realizada (revaluación de saldos). Conciliar con los saldos en ME. Verificar tratamiento de coberturas. Distinguir del ingreso por diferencia en cambio (421020).

### 530595 - Otros gastos financieros

| Atributo | Valor |
|---|---|
| Codigo | `530595` |
| Nombre | Otros gastos financieros |
| Cuenta Russell / 4D | Financieros |
| Tipo de rubro | Gastos no operacionales |
| Naturaleza | Debito (`D`) |
| Padre logico | `5305` |
| Critica | no |

**Que incluye:** Otros gastos financieros no clasificados: descuentos financieros condicionados otorgados, pérdida en valoración de instrumentos financieros (NIIF 9), gastos de derivados, otros costos financieros.

**Que no incluye:** Gastos bancarios (530505), comisiones (530515), intereses (530520), diferencia en cambio (530525). Gastos operativos.

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros gastos financieros, descuentos financieros condicionados, pérdida en valoración de inversiones, gastos de derivados, valoración a valor razonable (gasto), otros costos financieros.

**Soportes o terceros esperados:** Liquidación, valoración del instrumento, soporte.

**Soportes de control recomendados:** Concepto, instrumento, periodo.

**Observaciones de homologacion:** Cuenta residual de gastos financieros. Los descuentos por pronto pago según política pueden ir aquí o como menor ingreso. Valoraciones a valor razonable (NIIF 9). Reclasificar a subcuenta específica si aplica.

### 531015 - Pérdida en venta de PPE

| Atributo | Valor |
|---|---|
| Codigo | `531015` |
| Nombre | Pérdida en venta de PPE |
| Cuenta Russell / 4D | Pérdida en venta y retiro de bienes |
| Tipo de rubro | Gastos no operacionales |
| Naturaleza | Debito (`D`) |
| Padre logico | `5310` |
| Critica | no |

**Que incluye:** Pérdida en la venta o disposición de propiedad, planta y equipo, intangibles e inversiones: diferencia negativa entre el precio de venta y el valor en libros del activo enajenado.

**Que no incluye:** Utilidad en venta de activos (ingreso 424515). Pérdida en retiro de otros activos (531095). Baja por deterioro (5199). Costo de inventario vendido (costo).

**Cuentas o nombres de cliente que podrian llegar aqui:** Pérdida en venta de PPE, pérdida en venta de activos, pérdida en venta de propiedad planta y equipo, pérdida en venta de vehículos, pérdida en venta de inmuebles, pérdida en venta de inversiones, pérdida en enajenación de activos.

**Soportes o terceros esperados:** Contrato/factura de venta, valor en libros, depreciación acumulada, cálculo de la pérdida.

**Soportes de control recomendados:** Activo, valor en libros, precio de venta.

**Observaciones de homologacion:** Se reconoce la pérdida NETA (valor en libros menos precio). Verificar baja del activo y depreciación acumulada (NIC 16). Si resulta utilidad, va a ingreso (424515). Distinguir de la baja por deterioro.

### 531095 - Pérdida en retiro de otros activos

| Atributo | Valor |
|---|---|
| Codigo | `531095` |
| Nombre | Pérdida en retiro de otros activos |
| Cuenta Russell / 4D | Pérdida en venta y retiro de bienes |
| Tipo de rubro | Gastos no operacionales |
| Naturaleza | Debito (`D`) |
| Padre logico | `5310` |
| Critica | no |

**Que incluye:** Pérdida por retiro, baja o destrucción de activos sin venta: baja de activos obsoletos/dañados, retiro de inventarios destruidos (la parte no provisionada), baja de activos no recuperables.

**Que no incluye:** Pérdida en venta de PPE (531015). Deterioro reconocido vía cuenta correctora (5199). Costo de ventas normal. Pérdidas de inventario provisionadas (149915).

**Cuentas o nombres de cliente que podrian llegar aqui:** Pérdida en retiro de otros activos, baja de activos, retiro de activos obsoletos, baja de inventario destruido, pérdida por destrucción de activos, baja de PPE no recuperable, castigo de activos.

**Soportes o terceros esperados:** Acta de baja, soporte de la destrucción/retiro, autorización, valor en libros.

**Soportes de control recomendados:** Activo, causa de la baja.

**Observaciones de homologacion:** Reconocer la baja por el valor en libros no recuperable. Distinguir de la venta (531015) y del deterioro vía cuenta correctora. Las bajas de inventario tienen efectos en IVA (ajuste de descontable según causa). Documentar el acta de baja. Bajas recurrentes indican deficiencias de control.

### 531520 - Impuestos asumidos

| Atributo | Valor |
|---|---|
| Codigo | `531520` |
| Nombre | Impuestos asumidos |
| Cuenta Russell / 4D | Gastos extraordinarios |
| Tipo de rubro | Gastos no operacionales |
| Naturaleza | Debito (`D`) |
| Padre logico | `5315` |
| Critica | no |

**Que incluye:** Impuestos asumidos por la entidad que correspondían a terceros: retenciones asumidas, IVA asumido no descontable, impuestos de terceros asumidos por acuerdo.

**Que no incluye:** Impuestos propios deducibles (5115/511595). Impuesto de renta (5405). IVA descontable (activo). Retenciones practicadas (pasivo 2365).

**Cuentas o nombres de cliente que podrian llegar aqui:** Impuestos asumidos, retenciones asumidas, IVA asumido (no descontable), gravámenes asumidos, impuestos de terceros asumidos.

**Soportes o terceros esperados:** Soporte del impuesto asumido, acuerdo, liquidación.

**Soportes de control recomendados:** Impuesto, tercero, periodo.

**Observaciones de homologacion:** Los impuestos asumidos generalmente NO son deducibles (corresponden a terceros). Verificar el tratamiento tributario. Distinguir del IVA asumido descontable (importación de servicios, que es activo). Evaluar por qué se asumen (puede indicar deficiencia en la contratación).

### 531595 - Otros gastos extraordinarios

| Atributo | Valor |
|---|---|
| Codigo | `531595` |
| Nombre | Otros gastos extraordinarios |
| Cuenta Russell / 4D | Gastos extraordinarios |
| Tipo de rubro | Gastos no operacionales |
| Naturaleza | Debito (`D`) |
| Padre logico | `5315` |
| Critica | no |

**Que incluye:** Otros gastos extraordinarios no recurrentes no clasificados: pérdidas por siniestros no cubiertos, gastos de ejercicios anteriores, costos no recurrentes extraordinarios.

**Que no incluye:** Gastos con subcuenta específica. Gastos operativos (51/52). Multas y sanciones (539520). Pérdida en venta/retiro de activos (5310).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros gastos extraordinarios, pérdidas extraordinarias, siniestros no cubiertos, gastos de ejercicios anteriores, costos no recurrentes, gastos atípicos.

**Soportes o terceros esperados:** Soporte del gasto, autorización, documentación del hecho.

**Soportes de control recomendados:** Concepto, periodo.

**Observaciones de homologacion:** Bajo NIIF no existen 'partidas extraordinarias' como categoría separada; revelar la naturaleza de partidas no recurrentes materiales. Gastos de ejercicios anteriores pueden requerir corrección de error (NIC 8). Verificar deducibilidad y oportunidad.

### 539505 - Demandas laborales

| Atributo | Valor |
|---|---|
| Codigo | `539505` |
| Nombre | Demandas laborales |
| Cuenta Russell / 4D | Gastos diversos |
| Tipo de rubro | Gastos no operacionales |
| Naturaleza | Debito (`D`) |
| Padre logico | `5395` |
| Critica | no |

**Que incluye:** Gasto por demandas y litigios laborales: condenas laborales pagadas, conciliaciones laborales, constitución de provisiones por contingencias laborales reconocidas en el periodo.

**Que no incluye:** Indemnizaciones laborales ordinarias por retiro (254005). Salarios y prestaciones (51/52/72). Provisión acumulada de contingencias (263520). Multas administrativas (539520).

**Cuentas o nombres de cliente que podrian llegar aqui:** Demandas laborales, condenas laborales, conciliaciones laborales, litigios laborales, provisión de demandas laborales, gasto por procesos laborales, costas laborales.

**Soportes o terceros esperados:** Sentencia/conciliación, concepto del abogado, soporte del pago, cálculo de la provisión.

**Soportes de control recomendados:** Proceso, demandante, concepto.

**Observaciones de homologacion:** Distinguir el pago/condena (gasto) de la provisión por contingencia probable (contrapartida en 263520). Reconocer provisión si es probable y estimable (NIC 37). Demandas laborales recurrentes pueden indicar riesgo de cumplimiento (UGPP, tercerización). Soportar con concepto jurídico.

### 539520 - Multas, sanciones y litigios

| Atributo | Valor |
|---|---|
| Codigo | `539520` |
| Nombre | Multas, sanciones y litigios |
| Cuenta Russell / 4D | Gastos diversos |
| Tipo de rubro | Gastos no operacionales |
| Naturaleza | Debito (`D`) |
| Padre logico | `5395` |
| Critica | no |

**Que incluye:** Gasto por multas, sanciones y litigios: sanciones tributarias, multas administrativas, sanciones de entes de control, intereses de mora tributarios, condenas civiles/comerciales, costas judiciales.

**Que no incluye:** Impuestos propios (5115/511595/5405). Demandas laborales (539505). Provisiones de contingencias (2635). Gastos legales/trámites (5140).

**Cuentas o nombres de cliente que podrian llegar aqui:** Multas y sanciones, sanciones tributarias, multas administrativas, intereses de mora tributarios, sanciones DIAN, sanciones de superintendencia, condenas civiles, litigios, costas judiciales, sanciones ambientales.

**Soportes o terceros esperados:** Resolución sancionatoria, liquidación, sentencia, soporte de pago.

**Soportes de control recomendados:** Tipo de sanción, entidad, concepto.

**Observaciones de homologacion:** Las multas, sanciones e intereses de mora NO son deducibles (Art. 11 y otros del E.T.). Separar capital, intereses y sanción. Reconocer provisión si es probable (NIC 37, contrapartida 2635). Sanciones recurrentes indican deficiencias de control/cumplimiento (NIA 265). Relevante para riesgo del revisor fiscal.

### 539525 - Donaciones

| Atributo | Valor |
|---|---|
| Codigo | `539525` |
| Nombre | Donaciones |
| Cuenta Russell / 4D | Gastos diversos |
| Tipo de rubro | Gastos no operacionales |
| Naturaleza | Debito (`D`) |
| Padre logico | `5395` |
| Critica | no |

**Que incluye:** Gasto por donaciones a terceros: donaciones a entidades sin ánimo de lucro, donaciones a entidades estatales, aportes filantrópicos, donaciones en especie.

**Que no incluye:** Contribuciones y afiliaciones gremiales (512505). Gastos de bienestar del personal (510595). Patrocinios comerciales (publicidad 523560). Aportes parafiscales.

**Cuentas o nombres de cliente que podrian llegar aqui:** Donaciones, donaciones a ESAL, aportes filantrópicos, donaciones a entidades estatales, donaciones en especie, contribuciones benéficas, mecenazgo.

**Soportes o terceros esperados:** Certificado de donación, acto de la entidad receptora, soporte del bien donado.

**Soportes de control recomendados:** Receptor, tipo (efectivo/especie), periodo.

**Observaciones de homologacion:** Las donaciones pueden dar derecho a descuento tributario (no deducción) según el Art. 257 E.T. y requieren requisitos (receptor calificado, certificado). Verificar tratamiento (descuento vs no deducible). Distinguir de patrocinios comerciales (publicidad). Soportar con certificado.

### 539595 - Otros gastos diversos

| Atributo | Valor |
|---|---|
| Codigo | `539595` |
| Nombre | Otros gastos diversos |
| Cuenta Russell / 4D | Gastos diversos |
| Tipo de rubro | Gastos no operacionales |
| Naturaleza | Debito (`D`) |
| Padre logico | `5395` |
| Critica | no |

**Que incluye:** Otros gastos no operacionales diversos no clasificados: gastos no deducibles varios, faltantes asumidos, castigos diversos, gastos varios no operacionales.

**Que no incluye:** Gastos con subcuenta específica. Gastos operativos (51/52). Gastos financieros (5305). Multas (539520), donaciones (539525), demandas laborales (539505).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otros gastos diversos, gastos no deducibles, faltantes asumidos, castigos varios, gastos varios no operacionales, gastos atípicos, otros egresos.

**Soportes o terceros esperados:** Soporte del gasto, autorización.

**Soportes de control recomendados:** Concepto, periodo.

**Observaciones de homologacion:** Cuenta residual de gastos no operacionales. Reclasificar a subcuenta específica si aplica. Identificar partidas no deducibles para la conciliación fiscal. Vigilar que no oculte gastos sin soporte (riesgo de rechazo y NIA 240).

### 540505 - Impuesto de renta y complementarios

| Atributo | Valor |
|---|---|
| Codigo | `540505` |
| Nombre | Impuesto de renta y complementarios |
| Cuenta Russell / 4D | Impuesto de renta y complementarios |
| Tipo de rubro | Impuesto a las ganancias |
| Naturaleza | Debito (`D`) |
| Padre logico | `5405` |
| Critica | no |

**Que incluye:** Gasto por impuesto de renta y complementarios del periodo: impuesto corriente (liquidado sobre la renta líquida) más/menos el impuesto diferido (NIC 12). Transversal a contribuyentes del régimen ordinario.

**Que no incluye:** Impuesto de renta por pagar (pasivo 240405). Impuesto diferido en el balance (171076/272505). Otros impuestos (5115/511595). Anticipos y retenciones (1355).

**Cuentas o nombres de cliente que podrian llegar aqui:** Impuesto de renta, gasto de impuesto de renta, impuesto a las ganancias, provisión impuesto de renta (gasto), impuesto corriente y diferido, gasto por impuesto, impuesto de renta y complementarios.

**Soportes o terceros esperados:** Declaración de renta, conciliación fiscal (Formato 2516), cálculo del impuesto corriente y diferido, tasas.

**Soportes de control recomendados:** Componente (corriente/diferido), vigencia.

**Observaciones de homologacion:** Separar el componente corriente (sobre renta líquida) del diferido (NIC 12). Conciliar la utilidad contable con la renta líquida (tasa efectiva). El gasto puede diferir del impuesto por pagar por el efecto diferido. Recalcular y conciliar con el Formato 2516 (NIA 540). Partida clave de auditoría.

## Clase 6 - Costos de ventas

### 610505 - Costo agropecuario general

| Atributo | Valor |
|---|---|
| Codigo | `610505` |
| Nombre | Costo agropecuario general |
| Cuenta Russell / 4D | Costo agropecuario |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6105` |
| Critica | no |

**Que incluye:** Costo de lo vendido/producido en actividades agrícolas, pecuarias y forestales: semillas, fertilizantes, agroquímicos, mano de obra de campo, alimento para animales, costos de cultivo y de cría, depreciación de activos biológicos productores, costo de la cosecha/producto agrícola vendido (NIC 41/NIC 2).

**Que no incluye:** Costo de manufactura/procesamiento industrial (612005). Costo de mercancía comprada para reventa (6135). Gastos de administración/ventas (51xx/52xx). PPE agrícola (activo).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo agropecuario, costo de producción agrícola, costo de cultivo, costo pecuario, costo de cría, costo de cosecha, insumos agrícolas, costo de alimento animal, mano de obra de campo, costo forestal, costo de producto agrícola vendido.

**Soportes o terceros esperados:** Órdenes de producción/cultivo, costeo del producto, soporte de insumos, nómina de campo, NIC 41.

**Soportes de control recomendados:** Línea (agrícola/pecuario/forestal), producto, predio, elemento del costo.

**Observaciones de homologacion:** Correlacionar con el ingreso agropecuario (410505). Medición bajo NIC 41 (activos biológicos a valor razonable menos costos de venta) y NIC 2 (productos agrícolas). Distinguir costo de producción agropecuaria de costo de transformación industrial (612005).

### 611005 - Costo de pesca general

| Atributo | Valor |
|---|---|
| Codigo | `611005` |
| Nombre | Costo de pesca general |
| Cuenta Russell / 4D | Costo pesca |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6110` |
| Critica | no |

**Que incluye:** Costo de lo vendido en pesca y acuicultura: combustible de embarcaciones, mano de obra, alimento para cultivo acuícola, costos de captura/cosecha, depreciación de embarcaciones y equipos productivos, costo del producto del mar vendido.

**Que no incluye:** Costo de procesamiento industrial de pescado (612005). Costo de reventa (6135). Gastos de administración/ventas. Embarcaciones (PPE).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo de pesca, costo acuícola, costo de captura, costo de cultivo acuícola, costo de cosecha de camarón, combustible de pesca, alimento acuícola, mano de obra pesquera, costo del producto del mar vendido.

**Soportes o terceros esperados:** Costeo de la captura/cosecha, soporte de insumos, nómina, NIC 41.

**Soportes de control recomendados:** Producto, tipo (extractiva/acuicultura), elemento del costo.

**Observaciones de homologacion:** Correlacionar con el ingreso de pesca (411005). Activos biológicos acuícolas bajo NIC 41. Distinguir de procesamiento industrial (612005).

### 611505 - Costo minería y canteras general

| Atributo | Valor |
|---|---|
| Codigo | `611505` |
| Nombre | Costo minería y canteras general |
| Cuenta Russell / 4D | Costo minería |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6115` |
| Critica | no |

**Que incluye:** Costo de lo extraído y vendido en minería y canteras: explosivos, combustible, energía de extracción, mano de obra minera, depreciación de maquinaria minera, costos de extracción y beneficio primario, regalías como costo, amortización de derechos mineros, costos de remediación.

**Que no incluye:** Costo de transformación industrial del mineral (612005). Costo de reventa de minerales (6135). Gastos de administración. Maquinaria (PPE). Provisión de desmantelamiento (se capitaliza al activo, NIC 16/37).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo minero, costo de extracción, costo de cantera, explosivos, combustible de extracción, mano de obra minera, regalías (costo), amortización derechos mineros, costo de beneficio mineral, costo de material pétreo extraído, depreciación maquinaria minera.

**Soportes o terceros esperados:** Costeo de extracción, soporte de insumos, liquidación de regalías, nómina, títulos mineros.

**Soportes de control recomendados:** Mineral/material, mina/cantera, elemento del costo.

**Observaciones de homologacion:** Correlacionar con ingreso minero (411505). Regalías como costo de producción. Amortización de derechos por método de unidades de producción. Distinguir extracción de transformación (612005). Considerar provisión de remediación (NIC 37).

### 612005 - Costo de manufactura general

| Atributo | Valor |
|---|---|
| Codigo | `612005` |
| Nombre | Costo de manufactura general |
| Cuenta Russell / 4D | Costo manufactura |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6120` |
| Critica | no |

**Que incluye:** Costo de producción de bienes manufacturados (costo de ventas industrial): materia prima directa, mano de obra directa y costos indirectos de fabricación (CIF) aplicados a los productos vendidos. Incluye depreciación de planta, energía de producción, materiales indirectos, costo de producto terminado vendido. Alimentos, bebidas, textiles, químicos, metalmecánica, farmacéutica, cemento.

**Que no incluye:** Costo de mercancía comprada para reventa sin transformar (6135). Gastos de administración (51xx) y ventas (52xx). Costo de servicios (6155/6170). Inventarios en proceso/terminados (activo hasta vender). Materia prima en bodega (inventario).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo de manufactura, costo de producción, costo de ventas industrial, materia prima consumida, mano de obra directa, CIF, costos indirectos de fabricación, costo de producto terminado vendido, costo de fabricación, costo de transformación, costo de producción vendida.

**Soportes o terceros esperados:** Hoja de costos/orden de producción, costeo del producto, kárdex de inventario, nómina de producción, prorrateo de CIF, sistema de costeo.

**Soportes de control recomendados:** Línea de producto, planta, orden de producción, elemento (MP/MOD/CIF).

**Observaciones de homologacion:** Correlacionar con ingreso de manufactura (412005). Verificar sistema de costeo (órdenes/procesos/estándar) y prorrateo de CIF. Distinguir costo de producción (transforma) de costo de reventa (6135). Validar valuación de inventarios (NIC 2, costo o VNR). El costo se reconoce al vender (correlación).

### 612505 - Costo de servicios públicos general

| Atributo | Valor |
|---|---|
| Codigo | `612505` |
| Nombre | Costo de servicios públicos general |
| Cuenta Russell / 4D | Costo servicios públicos |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6125` |
| Critica | no |

**Que incluye:** Costo de prestación de servicios públicos domiciliarios: compra de energía en bloque, costos de generación/distribución, tratamiento de agua, operación de redes, mano de obra operativa, depreciación de infraestructura de servicio, costos de la actividad regulada vendida.

**Que no incluye:** Servicios públicos consumidos por la entidad (gasto 233550/51xx). Costo de comercialización de equipos (6135). Gastos de administración. Infraestructura (PPE).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo de servicios públicos, costo de energía vendida, costo de generación, costo de distribución, tratamiento de agua, operación de redes, compra de energía en bloque, costo de la actividad regulada, costo de prestación ESP.

**Soportes o terceros esperados:** Costeo del servicio, soporte de compra de energía, operación de redes, regulación CREG/CRA.

**Soportes de control recomendados:** Servicio, componente (generación/distribución/comercialización), periodo.

**Observaciones de homologacion:** Correlacionar con ingreso de servicios públicos (412505). Sector regulado. Distinguir el costo del servicio prestado (giro) del servicio público consumido por la empresa (gasto).

### 613005 - Costo de construcción y obras

| Atributo | Valor |
|---|---|
| Codigo | `613005` |
| Nombre | Costo de construcción y obras |
| Cuenta Russell / 4D | Costo construcción |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6130` |
| Critica | no |

**Que incluye:** Costo de contratos de construcción y obras: materiales de construcción, mano de obra de obra, subcontratos, maquinaria y equipo de obra, costos indirectos de obra, costo del avance de obra reconocido, costo de inmuebles construidos vendidos. Constructoras, promotoras, obra civil, infraestructura.

**Que no incluye:** Costo de comercialización de materiales (6135). Gastos de administración. Honorarios de diseño/interventoría no atribuibles a obra (51xx). Anticipos a contratistas (activo). Maquinaria propia (PPE, su depreciación sí es costo).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo de construcción, costo de obra, materiales de construcción, mano de obra de obra, subcontratos de obra, costo de avance de obra, costo de inmuebles vendidos, costos indirectos de obra, costo de urbanismo, costo de proyecto inmobiliario, maquinaria de obra.

**Soportes o terceros esperados:** Presupuesto de obra, actas de avance, costeo por obra, contratos de subcontratistas, kárdex de materiales, control de obra.

**Soportes de control recomendados:** Proyecto/obra, contrato, elemento del costo, grado de avance.

**Observaciones de homologacion:** Correlacionar el costo con el ingreso reconocido por grado de avance (NIIF 15). Verificar el método de costeo por obra y el reconocimiento de costos del contrato. Distinguir costo de obra de comercialización de materiales (6135). Validar costos por avance vs presupuesto (riesgo de sobre/subestimación).

### 613505 - Costo de mercancías vendidas - comercio mayorista

| Atributo | Valor |
|---|---|
| Codigo | `613505` |
| Nombre | Costo de mercancías vendidas - comercio mayorista |
| Cuenta Russell / 4D | Costo comercio |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6135` |
| Critica | no |

**Que incluye:** Costo de la mercancía vendida en comercio mayorista: costo de adquisición de los productos revendidos (precio de compra más fletes y costos de importación capitalizables), salida de inventario al vender (kárdex). Distribuidores, mayoristas, importadores comercializadores.

**Que no incluye:** Costo de producción (manufactura 612005). Costo de comercio minorista (613520, si se discrimina). Inventario en bodega (activo hasta vender). Gastos de administración/ventas. Fletes de distribución como gasto (233545).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo de mercancía vendida mayorista, costo de ventas comercio, CMV mayorista, costo de mercancía vendida, costo de producto revendido, salida de inventario mayorista, costo de distribución de mercancía, costo de adquisición vendido.

**Soportes o terceros esperados:** Kárdex de inventario, costeo de la mercancía, facturas de compra, soporte de fletes capitalizados, método de valuación.

**Soportes de control recomendados:** Línea de producto, canal mayorista, método de valuación (PEPS/promedio).

**Observaciones de homologacion:** Correlacionar con ingreso mayorista (413505). Verificar método de valuación de inventarios (NIC 2: PEPS o promedio ponderado, no UEPS). Validar el costo al transferir control. Distinguir de costo de producción (612005).

### 613520 - Costo de mercancías vendidas - comercio minorista

| Atributo | Valor |
|---|---|
| Codigo | `613520` |
| Nombre | Costo de mercancías vendidas - comercio minorista |
| Cuenta Russell / 4D | Costo comercio |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6135` |
| Critica | no |

**Que incluye:** Costo de la mercancía vendida en comercio minorista al consumidor final: costo de adquisición de los productos vendidos al detal, salida de inventario por ventas POS/e-commerce. Tiendas, supermercados, retail, droguerías, almacenes.

**Que no incluye:** Costo de producción (612005). Costo mayorista (613505). Inventario en tienda/bodega (activo). Mermas extraordinarias (según política). Gastos de operación de tienda (51xx/52xx).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo de mercancía vendida minorista, costo de ventas retail, CMV minorista, costo de producto vendido al detal, salida de inventario POS, costo de mercancía de tienda, costo de mercancía vendida droguería, costo de ventas al consumidor.

**Soportes o terceros esperados:** Kárdex, costeo de la mercancía, facturas de compra, conciliación de inventario, método de valuación.

**Soportes de control recomendados:** Tienda/sede, línea de producto, método de valuación.

**Observaciones de homologacion:** Correlacionar con ingreso minorista (413520). Verificar valuación (NIC 2) y conciliación de inventarios (mermas, faltantes). Distinguir minorista de mayorista (613505). Las mermas/faltantes según política pueden ser costo o gasto. Conciliar con inventario físico.

### 614005 - Costo hoteles y restaurantes general

| Atributo | Valor |
|---|---|
| Codigo | `614005` |
| Nombre | Costo hoteles y restaurantes general |
| Cuenta Russell / 4D | Costo hoteles y restaurantes |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6140` |
| Critica | no |

**Que incluye:** Costo de prestación de servicios de hotelería y gastronomía: costo de alimentos y bebidas (insumos de cocina/bar), mano de obra operativa (cocina, servicio, habitaciones), amenities, costos de operación de habitaciones, depreciación de la operación, costo de eventos.

**Que no incluye:** Costo de reventa de productos empacados (6135). Gastos de administración/ventas. Infraestructura hotelera (PPE). Servicios públicos administrativos (51xx).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo de alimentos y bebidas, costo de A&B, costo de operación hotelera, costo de habitaciones, mano de obra de cocina, insumos de restaurante, costo de eventos, amenities, costo de banquetes, costo de servicio hotelero.

**Soportes o terceros esperados:** Costeo de recetas/platos, kárdex de insumos, nómina operativa, control de consumo, escandallos.

**Soportes de control recomendados:** Línea (A&B/habitación/eventos), sede, elemento del costo.

**Observaciones de homologacion:** Correlacionar con ingreso de hoteles y restaurantes (414005). Separar costo de A&B (insumos) de costo de habitación (operación). Verificar control de consumo de insumos (mermas en cocina/bar). Costeo por receta/escandallo.

### 614505 - Costo de transporte, logística y comunicaciones

| Atributo | Valor |
|---|---|
| Codigo | `614505` |
| Nombre | Costo de transporte, logística y comunicaciones |
| Cuenta Russell / 4D | Costo transporte, almacenamiento y comunicaciones |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6145` |
| Critica | no |

**Que incluye:** Costo de prestación de servicios de transporte y logística: combustible, mantenimiento de flota, peajes, mano de obra de conductores/operarios, fletes a terceros transportadores (cuando se subcontrata), depreciación de flota, costos de almacenamiento y operación logística, seguros de la operación.

**Que no incluye:** Fletes pagados como gasto de distribución por empresas de otro giro (233545). Costo de reventa de combustible (6135). Gastos de administración. Vehículos (PPE, su depreciación sí es costo). Venta de vehículos.

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo de transporte, costo de fletes, combustible de flota, mantenimiento de flota, peajes, mano de obra de conductores, costo logístico, costo de almacenamiento, fletes a terceros (subcontratados), depreciación de flota, costo de operación de transporte, costo de distribución (giro).

**Soportes o terceros esperados:** Costeo del servicio, soporte de combustible/peajes, mantenimiento, nómina de conductores, control de flota, liquidación a terceros transportadores.

**Soportes de control recomendados:** Servicio (carga/pasajeros), ruta, vehículo, elemento del costo.

**Observaciones de homologacion:** Correlacionar con ingreso de transporte (414505). Distinguir el costo del servicio (giro) del flete como gasto de distribución de otras empresas (233545). El flete a terceros transportadores subcontratados es costo. Verificar depreciación de flota como costo.

### 615005 - Costo de actividad financiera

| Atributo | Valor |
|---|---|
| Codigo | `615005` |
| Nombre | Costo de actividad financiera |
| Cuenta Russell / 4D | Costo actividad financiera |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6150` |
| Critica | no |

**Que incluye:** Costo de la actividad financiera (entidades financieras): costo de fondos (intereses pagados a captaciones/depósitos), deterioro de cartera de crédito como costo del giro, costos de intermediación, provisiones de cartera del negocio financiero.

**Que no incluye:** Gastos financieros de empresas no financieras (gasto). Costo de otros giros. Gastos de administración. Capital de obligaciones (21xx).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo de actividad financiera, costo de fondos, intereses pagados a depositantes, deterioro de cartera de crédito, provisión de cartera (financiera), costo de intermediación, costo de captaciones, costo del negocio financiero.

**Soportes o terceros esperados:** Liquidación de intereses de captación, cálculo de deterioro de cartera, soporte de provisiones, regulación financiera.

**Soportes de control recomendados:** Producto, componente del costo, periodo.

**Observaciones de homologacion:** Solo para entidades cuyo giro es financiero. Correlacionar con ingreso financiero (415005). Deterioro de cartera bajo NIIF 9 (pérdida esperada). Sector regulado (Superfinanciera/sector solidario).

### 615505 - Costo de arrendamientos y servicios empresariales

| Atributo | Valor |
|---|---|
| Codigo | `615505` |
| Nombre | Costo de arrendamientos y servicios empresariales |
| Cuenta Russell / 4D | Costo actividades inmobiliarias y empresariales |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6155` |
| Critica | no |

**Que incluye:** Costo de prestación de servicios inmobiliarios y empresariales: costos directos asociados a los servicios facturados (mano de obra profesional/técnica atribuible, costos de operación del servicio, depreciación de inmuebles arrendados en modelo de arrendador, costos de administración inmobiliaria). Tecnología: costo de infraestructura cloud, licencias atribuibles al servicio, nómina de desarrollo. Consultoría/BPO: nómina del equipo atribuible al servicio.

**Que no incluye:** Gastos de administración generales (51xx). Servicios no operacionales. Comercialización de bienes (6135). Inmuebles (PPE). Costos no atribuibles directamente al servicio (gasto).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo de servicios empresariales, costo de consultoría, costo de BPO, costo de servicios de TI, costo de infraestructura cloud, nómina de desarrollo (costo), costo de arrendamiento (arrendador), costo de administración inmobiliaria, costo de outsourcing, licencias atribuibles al servicio, costo del servicio prestado.

**Soportes o terceros esperados:** Costeo del servicio, nómina atribuible, soporte de infraestructura, contratos, asignación de costos.

**Soportes de control recomendados:** Línea de servicio, proyecto/contrato, elemento del costo.

**Observaciones de homologacion:** Correlacionar con ingreso de servicios empresariales (415510) e inmobiliarios (415505). Atribuir directamente los costos al servicio prestado. En tecnología, separar costo de infraestructura/desarrollo (costo) de gastos generales. Distinguir costo atribuible (6155) de gasto de estructura (51xx).

### 616005 - Costo de enseñanza

| Atributo | Valor |
|---|---|
| Codigo | `616005` |
| Nombre | Costo de enseñanza |
| Cuenta Russell / 4D | Costo enseñanza |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6160` |
| Critica | no |

**Que incluye:** Costo de prestación del servicio educativo: nómina docente atribuible, material académico consumido, costos de plataformas e-learning, costos directos de operación académica, depreciación de equipos de enseñanza, costos de certificación.

**Que no incluye:** Gastos de administración escolar (51xx). Venta de material didáctico (6135). Servicios de alimentación/transporte (según caso). Infraestructura educativa (PPE).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo de enseñanza, costo educativo, nómina docente (costo), material académico, costo de plataforma e-learning, costo de operación académica, costo del programa, costo de certificación, costo del servicio educativo.

**Soportes o terceros esperados:** Costeo del programa, nómina docente, soporte de material, contratos de plataforma.

**Soportes de control recomendados:** Programa/nivel, periodo académico, elemento del costo.

**Observaciones de homologacion:** Correlacionar con ingreso educativo (416005). Atribuir nómina docente y costos directos al servicio. Distinguir costo del servicio educativo de gastos de administración. Reconocer a lo largo del periodo lectivo (correlación con el ingreso devengado).

### 616505 - Costo de servicios sociales y salud

| Atributo | Valor |
|---|---|
| Codigo | `616505` |
| Nombre | Costo de servicios sociales y salud |
| Cuenta Russell / 4D | Costo servicios sociales y salud |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6165` |
| Critica | no |

**Que incluye:** Costo de prestación de servicios de salud: medicamentos e insumos médico-quirúrgicos consumidos, dispositivos, honorarios del personal asistencial atribuibles, costo de procedimientos/cirugías, depreciación de equipos biomédicos, costos de contratos por evento/cápita, costo de la atención prestada.

**Que no incluye:** Gastos de administración hospitalaria (51xx). Venta de medicamentos al público (6135 droguería). Glosas (afectan ingreso/cartera). Equipos biomédicos (PPE, su depreciación sí es costo). Cartera (activo).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo de servicios de salud, costo de atención, medicamentos consumidos, insumos médico-quirúrgicos, dispositivos médicos consumidos, honorarios asistenciales (costo), costo de procedimientos, costo de cirugías, costo de cápita, depreciación equipos biomédicos, costo de la prestación médica.

**Soportes o terceros esperados:** Costeo del servicio, kárdex de medicamentos/insumos, nómina y honorarios asistenciales, RIPS, contratos cápita/evento.

**Soportes de control recomendados:** Servicio, contrato (cápita/evento), sede, elemento del costo.

**Observaciones de homologacion:** Correlacionar con ingreso de salud (416505). Controlar consumo de medicamentos/insumos (kárdex, mermas, vencimientos). En modelo cápita, el costo se causa al prestar independientemente de la facturación. Distinguir costo asistencial de gasto administrativo. Validar valuación de inventarios médicos (NIC 2, vencimientos).

### 617005 - Costo de otros servicios

| Atributo | Valor |
|---|---|
| Codigo | `617005` |
| Nombre | Costo de otros servicios |
| Cuenta Russell / 4D | Costo otros servicios |
| Tipo de rubro | Costos |
| Naturaleza | Debito (`D`) |
| Padre logico | `6170` |
| Critica | no |

**Que incluye:** Costo de prestación de servicios del giro no clasificados en líneas específicas: costo de vigilancia/seguridad (nómina de guardas, dotación, armamento), costo de aseo (nómina, insumos), costo de servicios temporales (nómina de los trabajadores en misión), costos directos de servicios culturales/recreativos/deportivos.

**Que no incluye:** Costo de servicios con línea específica (educación 6160, salud 6165, transporte 6145, empresariales 6155). Gastos de administración. Comercialización de bienes (6135).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costo de otros servicios, costo de vigilancia, costo de aseo, costo de servicios temporales, nómina en misión (costo), dotación e insumos (costo), costo de servicios culturales, costo de servicios recreativos, costo del servicio prestado (giro), costo de personal operativo.

**Soportes o terceros esperados:** Costeo del servicio, nómina operativa/en misión, soporte de insumos/dotación, contratos.

**Soportes de control recomendados:** Tipo de servicio, contrato/cliente, elemento del costo.

**Observaciones de homologacion:** Correlacionar con ingreso de otros servicios (417005). En servicios temporales, el costo principal es la nómina de trabajadores en misión. En vigilancia/aseo, nómina + dotación + insumos. Atribuir directamente al servicio. Distinguir de gastos de administración.

## Clase 7 - Costos de produccion

### 710505 - Materias primas e insumos directos

| Atributo | Valor |
|---|---|
| Codigo | `710505` |
| Nombre | Materias primas e insumos directos |
| Cuenta Russell / 4D | Materia prima directa |
| Tipo de rubro | Costos de producción |
| Naturaleza | Debito (`D`) |
| Padre logico | `7105` |
| Critica | no |

**Que incluye:** Costo de las materias primas e insumos directos consumidos en el proceso productivo del periodo (elemento del costo de producción): consumo de materia prima de manufactura, insumos directos de transformación. Manufactura/agroindustria: materia prima incorporada al producto.

**Que no incluye:** Materia prima en inventario sin consumir (140505). Mano de obra directa (720505). CIF (730505). Materiales indirectos (CIF). Costo de mercancía para reventa (6135).

**Cuentas o nombres de cliente que podrian llegar aqui:** Materias primas e insumos directos, consumo de materia prima, materia prima directa, insumos directos consumidos, MP consumida, materiales directos, consumo de insumos de producción.

**Soportes o terceros esperados:** Requisiciones de almacén, kárdex, hoja de costos, consumo de producción, costeo.

**Soportes de control recomendados:** Producto/orden, materia prima, planta, periodo.

**Observaciones de homologacion:** Elemento del costo de producción que se acumula y traslada al inventario en proceso/terminado y luego al costo de ventas al vender (correlación). Verificar consumo real (requisiciones, kárdex) vs producción. Conciliar con el movimiento de inventario de MP. Distinguir directo (se identifica con el producto) de indirecto (CIF).

### 720505 - Salarios

| Atributo | Valor |
|---|---|
| Codigo | `720505` |
| Nombre | Salarios |
| Cuenta Russell / 4D | Mano de obra directa |
| Tipo de rubro | Costos de producción |
| Naturaleza | Debito (`D`) |
| Padre logico | `7205` |
| Critica | no |

**Que incluye:** Costo de la mano de obra directa del proceso productivo (elemento del costo): salarios, prestaciones y aportes del personal directamente involucrado en la transformación del producto. Manufactura: operarios de producción.

**Que no incluye:** Mano de obra indirecta (CIF 730505). Personal de administración (5105) o ventas (5205). MOD en inventario de producto no vendido (se capitaliza). Servicios de terceros (CIF o contratistas).

**Cuentas o nombres de cliente que podrian llegar aqui:** Mano de obra directa, MOD, salarios de producción, nómina de planta, costo de personal directo, mano de obra de fabricación, operarios directos, jornales de producción.

**Soportes o terceros esperados:** Nómina de producción, tarjetas de tiempo, hoja de costos, costeo, prorrateo.

**Soportes de control recomendados:** Producto/orden, centro de producción, periodo.

**Observaciones de homologacion:** Elemento del costo que se acumula al producto. Distinguir mano de obra directa (se identifica con el producto) de indirecta (CIF). Las prestaciones y aportes de los operarios son parte de la MOD. Verificar prorrateo y costeo. Se capitaliza al inventario y se reconoce al vender. Cruzar con UGPP.

### 720510 - Cesantías

| Atributo | Valor |
|---|---|
| Codigo | `720510` |
| Nombre | Cesantías |
| Cuenta Russell / 4D | 7205 – Costos / gastos de personal |
| Tipo de rubro | Beneficio a empleados – prestación social causada |
| Naturaleza | Debito (`D`) |
| Padre logico | `7205` |
| Critica | no |

**Que incluye:** Provisión o causación de cesantías del personal asociado al costo, producción, operación o prestación del servicio. Incluye el valor causado proporcional al tiempo laborado.

**Que no incluye:** Intereses sobre cesantías si la entidad los controla en cuenta separada, pagos de nómina ordinaria, vacaciones, primas, aportes a seguridad social, indemnizaciones o bonificaciones no salariales.

**Cuentas o nombres de cliente que podrian llegar aqui:** Cesantías de personal operativo, personal de producción, personal de proyectos, personal técnico o personal directamente relacionado con la prestación del servicio.

**Soportes o terceros esperados:** Liquidación de nómina, base salarial, contrato laboral, acumulado de prestaciones, certificado del fondo de cesantías, liquidación definitiva cuando aplique.

**Soportes de control recomendados:** Conciliación provisión contable vs. auxiliar de nómina, cruce con empleados activos y retirados, validación de base salarial, recalculo de provisión, revisión de pagos al fondo.

**Observaciones de homologacion:** Homologar aquí únicamente cesantías causadas. Verificar que no se dupliquen con cuentas de gasto administrativo o ventas. En auditoría anual debe revisarse causación acumulada, pagos al fondo y saldos pendientes por empleado.

### 720515 - Prima de servicios

| Atributo | Valor |
|---|---|
| Codigo | `720515` |
| Nombre | Prima de servicios |
| Cuenta Russell / 4D | 7205 – Costos / gastos de personal |
| Tipo de rubro | Beneficio a empleados – prestación social causada |
| Naturaleza | Debito (`D`) |
| Padre logico | `7205` |
| Critica | no |

**Que incluye:** Provisión o causación de prima legal de servicios del personal asociado al costo u operación. Incluye prima proporcional por tiempo laborado y saldos pendientes de pago.

**Que no incluye:** Bonificaciones voluntarias, auxilios no salariales, primas extralegales si se manejan separadamente, cesantías, vacaciones o aportes a seguridad social.

**Cuentas o nombres de cliente que podrian llegar aqui:** Prima de servicios de personal operativo, producción, proyectos, técnicos, cuadrillas o personal directamente asignado al servicio.

**Soportes o terceros esperados:** Nómina, acumulado semestral, contrato laboral, liquidación de prestaciones, comprobantes de pago, desprendibles de nómina.

**Soportes de control recomendados:** Recalculo por empleado, conciliación provisión vs. nómina, revisión de pagos de junio y diciembre, corte de empleados retirados, validación de base salarial.

**Observaciones de homologacion:** Cuenta sensible a errores de corte. En cierre mensual debe causarse proporcionalmente; en cierre anual debe quedar conciliado lo pagado, causado y pendiente.

### 720520 - Vacaciones

| Atributo | Valor |
|---|---|
| Codigo | `720520` |
| Nombre | Vacaciones |
| Cuenta Russell / 4D | 7205 – Costos / gastos de personal |
| Tipo de rubro | Beneficio a empleados – ausencia remunerada |
| Naturaleza | Debito (`D`) |
| Padre logico | `7205` |
| Critica | no |

**Que incluye:** Provisión de vacaciones causadas por el personal relacionado con costos u operación. Incluye días causados no disfrutados y vacaciones pendientes de pago.

**Que no incluye:** Vacaciones pagadas de áreas administrativas si están en cuenta de gasto, primas, cesantías, incapacidades, licencias no remuneradas, indemnizaciones o compensaciones especiales no clasificadas como vacaciones.

**Cuentas o nombres de cliente que podrian llegar aqui:** Vacaciones causadas de operarios, técnicos, personal de campo, personal de proyectos o empleados asignados directamente a la operación.

**Soportes o terceros esperados:** Reporte de vacaciones causadas y disfrutadas, nómina, kardex de vacaciones, contrato laboral, liquidaciones definitivas, autorizaciones de vacaciones.

**Soportes de control recomendados:** Conciliación de días causados vs. días disfrutados, recalculo de provisión por empleado, revisión de saldos negativos, validación de retiros, comparación contra auxiliar de nómina.

**Observaciones de homologacion:** No confundir vacaciones con prestación social; contablemente son beneficio a empleados por ausencia remunerada. En auditoría se debe validar el saldo por empleado y la razonabilidad de la provisión.

### 720525 - Aportes ARL

| Atributo | Valor |
|---|---|
| Codigo | `720525` |
| Nombre | Aportes ARL |
| Cuenta Russell / 4D | 7205 – Costos / gastos de personal |
| Tipo de rubro | Aporte patronal a seguridad social – riesgos laborales |
| Naturaleza | Debito (`D`) |
| Padre logico | `7205` |
| Critica | no |

**Que incluye:** Aportes a Administradora de Riesgos Laborales correspondientes al personal operativo o de costo. Incluye el valor patronal causado según clase de riesgo y base de cotización aplicable.

**Que no incluye:** Aportes de EPS, pensión, caja de compensación, SENA, ICBF, provisiones laborales, incapacidades o recobros.

**Cuentas o nombres de cliente que podrian llegar aqui:** ARL de personal operativo, producción, obra, campo, mantenimiento, proyectos o actividades con exposición a riesgo laboral.

**Soportes o terceros esperados:** Planilla PILA, certificado de afiliación ARL, nómina, matriz de riesgos, contratos laborales, reporte de IBC.

**Soportes de control recomendados:** Conciliación PILA vs. contabilidad, revisión de clase de riesgo, cruce de empleados afiliados vs. nómina, validación de IBC, revisión de pagos oportunos.

**Observaciones de homologacion:** Cuenta de alto riesgo para auditoría laboral y UGPP. Validar que todos los empleados estén afiliados y que la clase de riesgo corresponda a la actividad real.

### 720530 - Aportes EPS

| Atributo | Valor |
|---|---|
| Codigo | `720530` |
| Nombre | Aportes EPS |
| Cuenta Russell / 4D | 7205 – Costos / gastos de personal |
| Tipo de rubro | Aporte patronal a seguridad social – salud |
| Naturaleza | Debito (`D`) |
| Padre logico | `7205` |
| Critica | no |

**Que incluye:** Aporte patronal a salud correspondiente al personal clasificado como costo u operación, de acuerdo con la base de cotización reportada.

**Que no incluye:** Descuentos al trabajador, pensión, ARL, parafiscales, incapacidades por cobrar, recobros de EPS o ajustes de nómina no relacionados.

**Cuentas o nombres de cliente que podrian llegar aqui:** EPS de personal operativo, técnico, producción, proyectos, servicios o personal directamente relacionado con ingresos operacionales.

**Soportes o terceros esperados:** Planilla PILA, nómina, reporte de IBC, certificados de afiliación EPS, comprobantes de pago, relación de empleados.

**Soportes de control recomendados:** Conciliación PILA vs. nómina y contabilidad, validación de IBC, revisión de novedades, ingresos, retiros, incapacidades y licencias.

**Observaciones de homologacion:** Homologar solo la porción patronal si la contabilidad separa aportes del empleado. Los descuentos al trabajador deben ir como pasivo, no como costo.

### 720535 - Aportes pensión y cesantías

| Atributo | Valor |
|---|---|
| Codigo | `720535` |
| Nombre | Aportes pensión y cesantías |
| Cuenta Russell / 4D | 7205 – Costos / gastos de personal |
| Tipo de rubro | Aportes patronales / beneficios a empleados |
| Naturaleza | Debito (`D`) |
| Padre logico | `7205` |
| Critica | no |

**Que incluye:** Puede incluir aporte patronal a pensión y, si la parametrización contable lo permite, pagos o provisiones relacionadas con fondos de cesantías del personal operativo.

**Que no incluye:** Aportes EPS, ARL, caja de compensación, SENA, ICBF, descuentos de nómina del trabajador, préstamos a empleados o pagos no laborales.

**Cuentas o nombres de cliente que podrian llegar aqui:** Aporte patronal a pensión, fondos de pensiones, fondos de cesantías, ajustes de seguridad social del personal de costo.

**Soportes o terceros esperados:** Planilla PILA, certificados de fondos de pensiones y cesantías, nómina, auxiliares por tercero, comprobantes de pago.

**Soportes de control recomendados:** Conciliación PILA vs. contabilidad, cruce con nómina, validación de terceros, revisión de pagos a fondos, separación entre provisión de cesantías y pago al fondo.

**Observaciones de homologacion:** Recomendación de auditoría: separar pensión y cesantías en cuentas distintas. “Pensión” corresponde a seguridad social; “cesantías” corresponde a prestación social. Mezclarlas reduce trazabilidad.

### 720540 - Otros gastos de personal

| Atributo | Valor |
|---|---|
| Codigo | `720540` |
| Nombre | Otros gastos de personal |
| Cuenta Russell / 4D | 7205 – Costos / gastos de personal |
| Tipo de rubro | Otros beneficios a empleados / costos laborales complementarios |
| Naturaleza | Debito (`D`) |
| Padre logico | `7205` |
| Critica | no |

**Que incluye:** Beneficios, auxilios, dotación, capacitaciones, bienestar, bonificaciones, incapacidades no recuperables, auxilios extralegales o conceptos laborales asociados al personal operativo, siempre que correspondan al costo de la operación.

**Que no incluye:** Gastos administrativos, gastos de ventas, préstamos a empleados, anticipos, indemnizaciones materiales, sanciones, gastos personales de socios, pagos sin soporte laboral o conceptos no relacionados con empleados.

**Cuentas o nombres de cliente que podrian llegar aqui:** Dotación, bienestar laboral, auxilios de transporte o alimentación, bonificaciones operativas, capacitaciones técnicas, exámenes ocupacionales, beneficios extralegales.

**Soportes o terceros esperados:** Nómina, política de beneficios, facturas de proveedores, contratos, autorizaciones internas, relación de empleados beneficiarios, comprobantes de pago.

**Soportes de control recomendados:** Revisión analítica mensual, validación de soportes, aprobación del gasto, cruce con política interna, análisis de conceptos inusuales, prueba de clasificación contable.

**Observaciones de homologacion:** Cuenta residual de alto riesgo. No debe convertirse en “bolsillo contable”. Para homologación, se recomienda subclasificar por naturaleza: dotación, bienestar, auxilios, capacitación, bonificaciones e incapacidades.

### 730505 - Costos indirectos de fabricación u operación

| Atributo | Valor |
|---|---|
| Codigo | `730505` |
| Nombre | Costos indirectos de fabricación u operación |
| Cuenta Russell / 4D | Costos indirectos fabricación / operación |
| Tipo de rubro | Costos de producción |
| Naturaleza | Debito (`D`) |
| Padre logico | `7305` |
| Critica | no |

**Que incluye:** Costos indirectos de fabricación (CIF): materiales indirectos, mano de obra indirecta (supervisores, mantenimiento), depreciación de planta y maquinaria de producción, energía de planta, arrendamiento de planta, seguros de producción, mantenimiento de planta, y demás costos indirectos del proceso productivo.

**Que no incluye:** Materia prima directa (710505) y mano de obra directa (720505). Gastos de administración (5105) y ventas (5205). Costos no productivos. CIF en inventario no vendido (se capitaliza).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costos indirectos de fabricación, CIF, materiales indirectos, mano de obra indirecta, depreciación de planta, energía de producción, arrendamiento de planta, mantenimiento de producción, seguros de planta, supervisión de producción, costos indirectos de operación.

**Soportes o terceros esperados:** Hoja de costos, prorrateo de CIF, soporte de los costos, base de aplicación, costeo.

**Soportes de control recomendados:** Producto/orden, centro de costo, naturaleza del CIF, periodo.

**Observaciones de homologacion:** Tercer elemento del costo. Se aplica al producto mediante una base de prorrateo (horas máquina/hombre, etc.). Verificar el método de aplicación de CIF y el tratamiento de la capacidad ociosa (los costos de subactividad van a resultados, no al inventario, NIC 2). Se capitaliza al inventario y se reconoce al vender. Distinguir de gastos del periodo.

### 740505 - Costos de contratos o proyectos en ejecución

| Atributo | Valor |
|---|---|
| Codigo | `740505` |
| Nombre | Costos de contratos o proyectos en ejecución |
| Cuenta Russell / 4D | Costos de contratos / proyectos |
| Tipo de rubro | Costos de producción |
| Naturaleza | Debito (`D`) |
| Padre logico | `7405` |
| Critica | no |

**Que incluye:** Costos acumulados de contratos o proyectos en ejecución (construcción, obras, proyectos de servicios por avance): materiales, mano de obra, subcontratos y costos indirectos atribuibles a contratos. Construcción/ingeniería: costos de obra/contrato. Servicios/tecnología: costos de proyectos por hitos.

**Que no incluye:** Producción de inventario estándar (clase 7 71-73). Gastos de administración/ventas. Anticipos a contratistas (133010). Costos de contratos terminados ya trasladados al costo de ventas. Activos del proyecto (PPE).

**Cuentas o nombres de cliente que podrian llegar aqui:** Costos de contratos, costos de proyectos en ejecución, costo de obra en curso, costos de obra, costos de proyecto, costos acumulados de contrato, costos de ejecución de contrato, work in progress de proyecto.

**Soportes o terceros esperados:** Presupuesto de obra/proyecto, actas de avance, costeo por contrato, control de costos, grado de avance.

**Soportes de control recomendados:** Contrato/proyecto, componente del costo, grado de avance.

**Observaciones de homologacion:** Acumula los costos del contrato para correlacionarlos con el ingreso reconocido por grado de avance (NIIF 15). Verificar el método de medición del avance (costos incurridos vs costos totales estimados) y la estimación de costos para completar. Reconocer pérdida esperada del contrato de inmediato si los costos totales exceden el ingreso. Clave en construcción (cruce con 4130/6130).

### 799505 - Traslado o cierre de costos de producción

| Atributo | Valor |
|---|---|
| Codigo | `799505` |
| Nombre | Traslado o cierre de costos de producción |
| Cuenta Russell / 4D | Traslado / cierre costos producción |
| Tipo de rubro | Costos de producción (cuenta de cierre) |
| Naturaleza | Debito (`D`) |
| Padre logico | `7995` |
| Critica | no |

**Que incluye:** Cuenta puente de traslado/cierre de los costos de producción acumulados (clase 7) hacia el inventario (producto en proceso/terminado) y/o el costo de ventas. Cuenta de naturaleza contraria que cancela los costos acumulados al cierre del proceso de costeo.

**Que no incluye:** Los costos acumulados directos (7105/7205/7305/7405). El costo de ventas final (61xx). El inventario (14xx). No es un costo real, es una cuenta de traslado.

**Cuentas o nombres de cliente que podrian llegar aqui:** Traslado de costos de producción, cierre de costos, costos por contra, traslado a inventario, cancelación de costos de producción, contrapartida de costos, liquidación de costos de producción.

**Soportes o terceros esperados:** Cierre del proceso de costeo, conciliación de costos, soporte del traslado.

**Soportes de control recomendados:** Periodo, destino (inventario/costo de ventas).

**Observaciones de homologacion:** Cuenta técnica de traslado: cancela los costos acumulados de la clase 7 contra el inventario o el costo de ventas. Su saldo debe ser cero tras el cierre del proceso de costeo. Verificar que el traslado cuadre (costos acumulados = capitalizado a inventario + llevado a costo de ventas). No es un costo económico real, sino un mecanismo de costeo.

## Clase 8 - Cuentas de orden deudoras

### 810505 - Garantías y cauciones entregadas

| Atributo | Valor |
|---|---|
| Codigo | `810505` |
| Nombre | Garantías y cauciones entregadas |
| Cuenta Russell / 4D | Cuentas de orden deudoras - garantías |
| Tipo de rubro | Cuentas de orden deudoras |
| Naturaleza | Debito (`D`) |
| Padre logico | `8105` |
| Critica | no |

**Que incluye:** Registro de control (no afecta resultados ni patrimonio) de garantías, cauciones, avales y respaldos entregados por la entidad a terceros: garantías reales/personales otorgadas, avales, cartas de crédito stand-by, prendas/hipotecas constituidas a favor de terceros, pólizas de cumplimiento entregadas.

**Que no incluye:** Provisiones por garantías que sí afectan resultados (2640/260545). Pasivos reales por garantías ejecutadas (pasivo). Garantías recibidas (cuenta de orden acreedora 9105). Depósitos entregados en garantía (activo real).

**Cuentas o nombres de cliente que podrian llegar aqui:** Garantías entregadas, cauciones entregadas, avales otorgados, garantías reales constituidas, hipotecas a favor de terceros, prendas entregadas, cartas de crédito stand-by, pólizas de cumplimiento entregadas, respaldos otorgados, garantías a favor de terceros.

**Soportes o terceros esperados:** Contrato de garantía, escritura de hipoteca/prenda, póliza, soporte del aval.

**Soportes de control recomendados:** Beneficiario, tipo de garantía, bien afectado, vigencia.

**Observaciones de homologacion:** Cuenta de orden (memorando): controla compromisos sin afectar estados financieros principales. Revelar en notas. Evaluar si la garantía implica un pasivo contingente o real que deba reconocerse o revelarse (NIC 37). Verificar coherencia con las garantías reveladas.

### 811005 - Bienes y valores entregados en custodia

| Atributo | Valor |
|---|---|
| Codigo | `811005` |
| Nombre | Bienes y valores entregados en custodia |
| Cuenta Russell / 4D | Cuentas de orden deudoras - bienes |
| Tipo de rubro | Cuentas de orden deudoras |
| Naturaleza | Debito (`D`) |
| Padre logico | `8110` |
| Critica | no |

**Que incluye:** Registro de control de bienes y valores propios entregados a terceros en custodia, consignación, depósito o comodato: mercancía en consignación entregada, bienes en comodato dados, valores en custodia, inventario en poder de terceros.

**Que no incluye:** Bienes propios en las instalaciones de la entidad (activo real). Bienes recibidos de terceros en custodia (cuenta de orden acreedora 9110). Mercancía vendida (baja del inventario).

**Cuentas o nombres de cliente que podrian llegar aqui:** Bienes entregados en custodia, mercancía en consignación entregada, bienes en comodato, valores en custodia, inventario en poder de terceros, bienes en depósito entregados, mercancía en poder de distribuidores (consignación).

**Soportes o terceros esperados:** Contrato de consignación/comodato/custodia, remisión, acta de entrega, conciliación con el tercero.

**Soportes de control recomendados:** Tercero, tipo de bien, contrato, ubicación.

**Observaciones de homologacion:** Cuenta de orden de control. El bien sigue siendo activo de la entidad (mercancía en consignación entregada permanece en inventario hasta su venta real). Conciliar con el tercero. Relevante para verificar existencia de inventarios en poder de terceros (NIA 501).

### 812005 - Demandas y contingencias a favor

| Atributo | Valor |
|---|---|
| Codigo | `812005` |
| Nombre | Demandas y contingencias a favor |
| Cuenta Russell / 4D | Cuentas de orden deudoras - contingencias |
| Tipo de rubro | Cuentas de orden deudoras |
| Naturaleza | Debito (`D`) |
| Padre logico | `8120` |
| Critica | no |

**Que incluye:** Registro de control de derechos contingentes a favor de la entidad: demandas instauradas por la entidad con expectativa de fallo favorable, activos contingentes (no reconocidos hasta ser prácticamente ciertos, NIC 37), pretensiones a favor en litigios.

**Que no incluye:** Activos contingentes prácticamente ciertos (se reconocen como activo). Cuentas por cobrar ciertas (activo). Contingencias en contra (cuenta de orden acreedora 9120). Provisiones (pasivo).

**Cuentas o nombres de cliente que podrian llegar aqui:** Demandas a favor, contingencias a favor, activos contingentes, pretensiones a favor, litigios a favor, derechos contingentes, reclamaciones a favor, procesos a favor de la entidad.

**Soportes o terceros esperados:** Demanda, concepto del abogado, valoración de probabilidad, pretensión.

**Soportes de control recomendados:** Proceso, contraparte, probabilidad, pretensión.

**Observaciones de homologacion:** Cuenta de orden de control. Los activos contingentes NO se reconocen hasta ser prácticamente ciertos (NIC 37); solo se revelan si son probables. Soportar con concepto del abogado. No inflar el activo con contingencias inciertas.

### 819595 - Otras cuentas de orden deudoras

| Atributo | Valor |
|---|---|
| Codigo | `819595` |
| Nombre | Otras cuentas de orden deudoras |
| Cuenta Russell / 4D | Otras cuentas de orden deudoras |
| Tipo de rubro | Cuentas de orden deudoras |
| Naturaleza | Debito (`D`) |
| Padre logico | `8195` |
| Critica | no |

**Que incluye:** Otras cuentas de orden deudoras de control no clasificadas: activos totalmente depreciados en uso, bienes recibidos en arrendamiento (control), diferencias fiscales de control, títulos por cobrar de control, otros registros memorando deudores.

**Que no incluye:** Cuentas de orden con subcuenta específica (garantías 8105, bienes en custodia 8110, contingencias 8120). Partidas reales de balance. Cuentas de orden acreedoras (91xx).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otras cuentas de orden deudoras, activos depreciados en uso, bienes en arrendamiento (control), diferencias fiscales de control, títulos de control, ajustes por inflación de control, cuentas memorando deudoras, control de activos castigados.

**Soportes o terceros esperados:** Soporte del registro de control, conciliación, documentación de respaldo.

**Soportes de control recomendados:** Concepto, tipo de control.

**Observaciones de homologacion:** Cuenta de orden residual deudora. Útil para control de activos totalmente depreciados aún en uso (NIA 501) y otros registros memorando. No afecta estados financieros principales. Verificar utilidad y depuración del registro.

## Clase 9 - Cuentas de orden acreedoras

### 910505 - Garantías y cauciones recibidas

| Atributo | Valor |
|---|---|
| Codigo | `910505` |
| Nombre | Garantías y cauciones recibidas |
| Cuenta Russell / 4D | Cuentas de orden acreedoras - garantías |
| Tipo de rubro | Cuentas de orden acreedoras |
| Naturaleza | Credito (`C`) |
| Padre logico | `9105` |
| Critica | no |

**Que incluye:** Registro de control de garantías, cauciones, avales y respaldos recibidos de terceros a favor de la entidad: garantías de proveedores/contratistas, pólizas de cumplimiento recibidas, avales recibidos, prendas/hipotecas a favor de la entidad, cartas de crédito recibidas.

**Que no incluye:** Depósitos recibidos en garantía en efectivo (pasivo real 2810). Garantías entregadas (cuenta de orden deudora 8105). Pasivos reales.

**Cuentas o nombres de cliente que podrian llegar aqui:** Garantías recibidas, cauciones recibidas, avales recibidos, pólizas de cumplimiento recibidas, garantías de contratistas, prendas a favor, hipotecas a favor, cartas de crédito recibidas, respaldos recibidos, garantías de proveedores.

**Soportes o terceros esperados:** Póliza, contrato de garantía, escritura, soporte del aval recibido.

**Soportes de control recomendados:** Garante, tipo de garantía, bien afectado, vigencia, contrato asociado.

**Observaciones de homologacion:** Cuenta de orden de control. Distinguir de los depósitos en garantía recibidos en efectivo (pasivo real, 2810). Útil para verificar cobertura de garantías de contratistas/proveedores. Revelar en notas. No afecta estados financieros principales.

### 911005 - Bienes y valores recibidos en custodia

| Atributo | Valor |
|---|---|
| Codigo | `911005` |
| Nombre | Bienes y valores recibidos en custodia |
| Cuenta Russell / 4D | Cuentas de orden acreedoras - bienes |
| Tipo de rubro | Cuentas de orden acreedoras |
| Naturaleza | Credito (`C`) |
| Padre logico | `9110` |
| Critica | no |

**Que incluye:** Registro de control de bienes y valores de terceros recibidos en custodia, consignación, depósito o comodato: mercancía de terceros en consignación recibida, bienes en comodato recibidos, valores en administración, inventario de terceros en las instalaciones.

**Que no incluye:** Bienes propios (activo real). Bienes propios entregados a terceros (cuenta de orden deudora 8110). Mercancía de terceros vendida (genera pasivo con el tercero, 281510).

**Cuentas o nombres de cliente que podrian llegar aqui:** Bienes recibidos en custodia, mercancía en consignación recibida, bienes en comodato recibidos, valores en administración, inventario de terceros, bienes en depósito recibidos, mercancía de consignación de proveedores, activos de terceros en custodia.

**Soportes o terceros esperados:** Contrato de consignación/comodato/custodia, remisión de entrada, acta de recibo, conciliación con el propietario.

**Soportes de control recomendados:** Propietario/tercero, tipo de bien, contrato, ubicación.

**Observaciones de homologacion:** Cuenta de orden de control. Los bienes recibidos NO son activo de la entidad. La mercancía de terceros en consignación recibida no es inventario propio; al venderla se genera pasivo con el tercero (281510). Relevante para no inflar inventarios propios (NIA 501).

### 912005 - Demandas y contingencias en contra

| Atributo | Valor |
|---|---|
| Codigo | `912005` |
| Nombre | Demandas y contingencias en contra |
| Cuenta Russell / 4D | Cuentas de orden acreedoras - contingencias |
| Tipo de rubro | Cuentas de orden acreedoras |
| Naturaleza | Credito (`C`) |
| Padre logico | `9120` |
| Critica | no |

**Que incluye:** Registro de control de pasivos contingentes en contra de la entidad: demandas y procesos en contra cuyo desenlace desfavorable es posible (no probable), pasivos contingentes no provisionables, pretensiones en contra en litigios calificados como posibles.

**Que no incluye:** Contingencias probables y estimables (se provisionan, 2635). Obligaciones ciertas (pasivo real). Contingencias a favor (cuenta de orden deudora 8120). Provisiones reconocidas.

**Cuentas o nombres de cliente que podrian llegar aqui:** Demandas en contra, contingencias en contra, pasivos contingentes, litigios en contra (posibles), procesos en contra, pretensiones en contra, contingencias laborales posibles, contingencias civiles posibles, contingencias fiscales posibles, reclamaciones en contra.

**Soportes o terceros esperados:** Demanda, concepto del abogado, calificación de probabilidad (posible), pretensión.

**Soportes de control recomendados:** Proceso, demandante, probabilidad, pretensión, tipo (laboral/civil/fiscal).

**Observaciones de homologacion:** Cuenta de orden de control para contingencias POSIBLES (no probables): se revelan, no se provisionan (NIC 37). Si la probabilidad pasa a probable y es estimable, reclasificar a provisión (2635). Soportar con concepto del abogado. Clave para revelación de contingencias y evaluación de negocio en marcha (NIA 570).

### 919595 - Otras cuentas de orden acreedoras

| Atributo | Valor |
|---|---|
| Codigo | `919595` |
| Nombre | Otras cuentas de orden acreedoras |
| Cuenta Russell / 4D | Otras cuentas de orden acreedoras |
| Tipo de rubro | Cuentas de orden acreedoras |
| Naturaleza | Credito (`C`) |
| Padre logico | `9195` |
| Critica | no |

**Que incluye:** Otras cuentas de orden acreedoras de control no clasificadas: créditos disponibles no utilizados (cupos aprobados), bienes recibidos en arrendamiento (control acreedor), diferencias fiscales de control, otros registros memorando acreedores.

**Que no incluye:** Cuentas de orden acreedoras con subcuenta específica (garantías 9105, bienes en custodia 9110, contingencias 9120). Pasivos reales. Cuentas de orden deudoras (81xx).

**Cuentas o nombres de cliente que podrian llegar aqui:** Otras cuentas de orden acreedoras, cupos de crédito no utilizados, créditos disponibles, bienes en arrendamiento (control), diferencias fiscales de control, compromisos de control, cuentas memorando acreedoras, líneas de crédito disponibles.

**Soportes o terceros esperados:** Soporte del registro de control, aprobación de cupos, conciliación.

**Soportes de control recomendados:** Concepto, tipo de control.

**Observaciones de homologacion:** Cuenta de orden residual acreedora. Útil para controlar cupos de crédito disponibles no utilizados y otros compromisos memorando. No afecta estados financieros principales. Verificar utilidad y depuración del registro.

