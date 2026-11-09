# Módulo Impuestos · IVA (formularios DIAN 300 y 490)

Especificación levantada con el usuario el 7/Nov/2026. Las decisiones de diseño y el plan por fases están en `DISENO.md`; cómo quedó construido, en `IMPLEMENTACION.md`. Se trabaja igual que Retención en la fuente (`docs/impuestos/retencion-fuente/PROMPT-retencion-fuente.md`, sección 0): por fases con visto bueno, `tsc`, `test` y `lint` en verde, la app local escribe en producción y nada se aplica en la BD sin permiso.

## 1. Insumos (en esta carpeta)

- `Informacion IVA.docx` — instrucciones del levantamiento.
- `IVA - F300 y F490.xlsx` — pestañas «Formulario 300» y «Formulario 490» (qué casillas se guardan; «x no guardar» marca lo que no), «F300-Mapeo Russell», «Vista 1 - Bimestral (expandido)», «Vista 2 - Bimestral (colapsado)», «Resultado - Cruce contable», «Resultado - Indicador oportunidad» y «Resultado - Pagos efectuados». Sus fórmulas valen por la intención; las reglas de cálculo son las de este documento.
- `Formulario_300_2025.pdf` — formulario e instructivo oficial de la DIAN.
- `../retencion-fuente/Calendario_Tributario_2026.pdf` — página 1, secciones «IVA - Bimestral» e «IVA - Cuatrimestral», y «RST · Consolidada de IVA» (declaración anual).

## 2. Qué es

Impuestos (DIAN) tiene tres submódulos: Retención en la fuente, IVA e ICA. Lo que es igual entre Retención e IVA se ve igual: misma experiencia de usuario.

Russell revisa el F300 de forma **acumulada a un corte**: un precorte (normalmente el 4.º bimestre o el 2.º cuatrimestre, a agosto) y el cierre a 31 de diciembre. El sistema pregunta siempre el corte. El usuario importa los PDF de los F300 y F490 de cada período hasta el corte.

**Periodicidad**: bimestral, cuatrimestral o anual; siempre la misma por cliente (parámetro de la ficha del cliente). El formulario conserva siempre la misma estructura.

## 3. Formulario 300

- Se guardan: año (1), período (3: 1–6 bimestral, 1–3 cuatrimestral, 1 anual), número (4), NIT (5), DV (6), razón social (11), periodicidad (24), corrección (25) y formulario anterior (26); ingresos 27–43; impuesto generado 58–67; impuesto descontable 68–81; liquidación 82–89; control de saldos 90–93; pago total (980, informativo); 996 y 997 (fecha de presentación).
- No se guardan: nombres (7–10), seccional (12), **compras 44–57** (no se tienen en cuenta ni se concilian), firmas y signatario.
- Totales (todos los valores en positivo; en los totales unos renglones suman y otros restan): 41 = Σ27..40; 43 = 41 − 42; 67 = Σ58..66; 77 = Σ68..76; 81 = 77 + 78 + 79 − 80; 82 = 67 − 81 (mínimo 0); 83 = 81 − 67 (mínimo 0); 86 = 82 − 84 − 85 (mínimo 0); 88 = 82 − 84 − 85 + 87 (mínimo 0); 89 = 83 + 84 + 85 − 82 − 87 (mínimo 0; la DIAN imprime «83 + 84 + 85 − 87», pero con saldo a pagar el 84 y el 85 ya se descontaron en el 88, así que el 89 resta el 82: el 88 y el 89 nunca tienen valor a la vez, corrección del 9/Nov/2026); 93 = 89 − 90; 90 + 91 + 92 debe ser igual a 89. El 93 va al 84 del período siguiente.
- Un período puede tener saldo a favor y no pagar: no es error si el 88 es cero.
- **Correcciones**: puede haber dos o más PDF por período; todos se guardan. Para los valores cuenta el último (la corrección: 25 = 1 y 26 = número que corrige). El sistema reconoce la primera versión y la corrección, y el usuario lo confirma.
- Alertas de la carga del F300: **pendientes de diseño**.

## 4. Formulario 490

- Con él se pagan los F300. Casilla 3 (concepto, «casilla 2» del formulario) según la periodicidad del 300: 05 bimestral, 57 cuatrimestral, 58 anual.
- Si el 88 del 300 es distinto de cero, debe haber un 490.
- Lo que se paga por el 86 del 300 va en el 36 del 490; las sanciones (87) en el 34. Puede venir el 35 (intereses de mora).
- Se guardan 1, 2, 3, 4, 5, 6, 11, 27, 28, 29, 32, 34, 35, 36, 980, 996 y 997 (fecha de pago).

## 5. Vistas

- **Vista 1 (expandida)**: todos los renglones guardados por período (bimestre, cuatrimestre o año), con el bloque de pagos del 490 (sanciones, intereses, impuesto, total pagado).
- **Vista 2 (colapsada)**: la suma de los períodos hasta el corte. No aplica con periodicidad anual (sería igual a la Vista 1).

## 6. Cruce contable

- Cada renglón con saldo se compara contra el **saldo final** del cliente en la cuenta Russell del renglón (tabla configurable en **Mapeos DIAN**, pestaña IVA; valores de fábrica de «F300-Mapeo Russell»).
- El balance es **por terceros**: el saldo de cada cuenta se muestra sustentado por sus terceros (sin conciliar tercero por tercero). **Ingresos no**: se toma el saldo de la cuenta, sin terceros.
- Los pagos a la DIAN contabilizados en las mismas cuentas se **restan y salen tachados** (terceros 800197268 y 800197384, configurables; por cuenta se decide si se restan).
- Como en Retención: con un balance desde enero, el saldo inicial de los terceros que lo traen se resta del saldo final y se detalla en Novedades. No aplica a ingresos.
- Varias cuentas del cliente pueden ir a una cuenta Russell: se puede desplegar el detalle. Varios renglones pueden ir a la misma cuenta: se agrupan en una fila, con el detalle de lo que se suma.
- Formato y orden del Excel: Impuesto generado, Impuesto descontable, Retención de IVA e **Ingresos al final**.
- Toda diferencia desde el umbral «Diferencias de impuestos» ($501) exige una marca para cerrar.
- Alertas del cruce: **pendientes de diseño**.

## 7. Indicador de oportunidad

- Fecha de vencimiento según el calendario DIAN del año y el último dígito del NIT (sin el DV), contra la fecha de presentación (997 del **primer** F300, no de la corrección) y la de pago (997 del 490). Resultado: Oportuno o Extemporáneo.
- Requiere haber importado el calendario de vencimientos de IVA (bimestral, cuatrimestral y anual). El anual toma el año gravable de la casilla 1 y busca el vencimiento en febrero del año siguiente (calendario del año siguiente).
- Ejemplo: NIT terminado en 3, bimestral, 1.er bimestre de 2026 → hasta el 12 de marzo.

## 8. Pagos efectuados

Por período: 86 + 87 del F300 contra 36 + 34 de los F490. Si coinciden, «Pago completo»; si no, «Diferencia en el pago» y exige marca. Los intereses (35) se muestran aparte.

## 9. Configuración compartida

- **Mapeos DIAN**: dos pestañas, Retención en la fuente (350) e IVA (300).
- **Calendario tributario**: al importar el PDF de la DIAN se cargan de una vez Retención en la fuente e IVA (bimestral, cuatrimestral y anual).
