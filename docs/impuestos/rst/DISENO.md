# Diseño · Impuestos › Anticipos bimestrales (RST) (recibos 2593 y 490 concepto 27)

Estado: **aprobado el 17/Nov/2026**. Se construye por fases con visto bueno (avance en `IMPLEMENTACION.md`).

## Contexto

Russell revisa con cada cliente del Régimen Simple de Tributación (RST) que los anticipos bimestrales se liquidaron y se pagaron a tiempo. El usuario pidió un tercer submódulo en «Impuestos · DIAN», «Anticipos bimestrales (RST)», con la misma experiencia de Retención en la fuente e IVA, solo para clientes con «Régimen Simple de Tributación» en Sí (campo de la ficha del cliente, `clientes.regimen_simple_tributacion`, 17/Nov/2026).

Fuentes: `Formulario_2593_2024.pdf` (formulario e instructivo de las dos hojas, copiado aquí), cuatro recibos 2593 reales de 2026 (bimestres 1 a 4) con sus 490 y la página 2 del calendario tributario 2026 (`docs/impuestos/retencion-fuente/Calendario_Tributario_2026.pdf`). Los recibos reales del cliente no se copian al repositorio; las pruebas usan sus cifras con NIT y nombre ficticios.

## Decisiones del usuario (17/Nov/2026)

1. El formulario es el **2593** («Recibo electrónico del SIMPLE»). El usuario escribió 2592 en el pedido, pero los PDF son 2593 y así lo confirmó.
2. **Siempre bimestral.** El corte es «Precierre» con su mes (febrero, abril, junio, agosto u octubre) o «Cierre · diciembre».
3. **Solo clientes del Régimen Simple.** «Nueva revisión» pregunta el cliente; si su ficha dice No, pide confirmar que sí pertenece al régimen y, al confirmar, la ficha queda en Sí (bitácora «MARCÓ RÉGIMEN SIMPLE DEL CLIENTE»).
4. **Validación central:** 76 (ICA) + 77 (anticipo SIMPLE) + 78 (impuesto al consumo) + 79 (IVA) del 2593 = casilla 36 del 490 concepto 27 (Pagos efectuados; una diferencia exige marca).
5. **Oportunidad = fecha de pago:** el sello (997) del 490 concepto 27 contra el calendario «RST – Anticipo bimestral». El 2593 no trae sello de presentación.
6. **Cruce contable en construcción:** faltan las cuentas Russell. La pestaña existe y lo dice.
7. **Sin cierre en firme** hasta que exista el cruce. Novedades muestra lo pendiente.
8. Vistas «Por períodos» y «Acumulado», y «Pagos efectuados», como en IVA y Retención.

## Supuestos sobre los ajustes (del instructivo; no hay recibos de ajuste reales)

- El ajuste (casilla 24) y el recibo que ajusta (25) se tratan como la corrección del 350/300 (25 y 26).
- Un ajuste descuenta lo ya pagado (casillas 55, 63, 73 y 103), así que sus valores a pagar traen solo lo adicional y tiene su propio 490. Lo que debe pagar el bimestre suma 76 a 79 de la vigente y de cada recibo anterior de la cadena que tiene un 490 que lo paga (`valoresAPagar`). Un recibo anterior sin pago no suma: el ajuste lo reemplazó entero.
- Los intereses de un ajuste pagado tarde (54, 62, 72, 102) van dentro de 76 a 79 y el 490 los separa en su casilla 35: la regla del usuario (76 a 79 contra la 36) dará una diferencia que se explica con marca.

## Arquitectura

Tercer descriptor `RST` en `src/lib/impuestos/impuestos-dian.ts` sobre el mismo motor (`src/lib/impuestos/retencion/`). **Sin migración:** las columnas que distinguen impuestos y formularios son texto libre.

- **Formulario como dato** (`formularios/f2593.ts`): hoja 1, renglones 26 a 79 como valores (la tarifa 36 no se guarda; la hoja 2, tampoco). Las fórmulas del instructivo son `validaciones` que avisan (con `pisoCero` donde dice «resultado positivo»). Renglón `calculado` 1000 («76 a 79») = 76 + 77 + 78 + 79: no se lee, no se guarda, no se controla; se muestra y es lo que paga el 490. Número de 14 dígitos con prefijo 2593 (`numero`), ajuste en 24/25 (`correccion`), sin sello (`sinSello`).
- **Descriptor:** `claveFormularioCliente: null`, `requiereRegimenSimple`, `pagoSumaCadena`, `renglones` sin `sanciones` (`renglonSanciones` → null), `componentesPago` 76 a 79, `cierreEnFirme: false`, `cruce.disponible: false` con `mensajeNoDisponible`. Oportunidad sin presentación cuando la declaración es `sinSello` (`midePresentacion`).
- **490 concepto 27** (`f490.ts`); un 490 concepto 27 en Retención o IVA, o uno de sus conceptos en RST, se rechaza (`otro_impuesto`).
- **Calendario** `RST_ANTICIPO` (`calendario.ts`): 6 bimestres, un dígito por columna, holgura de 3 meses (el primer bimestre vence en mayo). La importación del PDF pasa a 5 lecturas.
- **Pagos efectuados:** sin renglón de sanciones, la diferencia es Σ36 − (76 a 79); la sanción (34) y los intereses (35) se muestran aparte y no entran ni al total pagado.

## Fases

1. Configuración: F2593, 490 concepto 27, descriptor, reglas de número, calendario y esquemas.
2. Nueva revisión (con la confirmación del Régimen Simple) y cargue: lectura y controles, períodos, modal del formulario, «¿Qué revisa el sistema?», menú, migas y ayuda. → visto bueno del usuario con los PDF reales.
3. Vistas «Por períodos» y «Acumulado» y el Excel.
4. Oportunidad, Pagos efectuados, Novedades y el cruce en construcción; ayuda y pruebas. → visto bueno final.

## Fuera de alcance

Cruce contable y mapeo del 2593 (faltan las cuentas Russell), cierre en firme, hoja 2 del 2593 (ICA por municipio), hoja 2 del 490 (desglose por concepto) y la columna del Régimen Simple en «Importar desde Excel» de clientes.
