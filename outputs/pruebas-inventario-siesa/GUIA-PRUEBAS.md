# Pruebas de inventario SIESA · septiembre de 2026

Los cinco archivos contienen **datos totalmente ficticios**, con corte al **30 de septiembre de 2026**, 18 referencias, 3 tipos de inventario y valores en pesos colombianos (COP). Cada libro tiene una sola hoja de datos; esta guía no forma parte de los XLSX.

El formato de los archivos 01 y 03 conserva los 11 encabezados y el mapeo del **patrón INV/SIESA aprobado v5, identificador 29**, consultado en la configuración de Russell el 3 de octubre de 2026 mediante una transacción de solo lectura. Se eligió esa versión porque clasifica por tipo de inventario. La v9 más reciente usa un clasificador global. No son exportaciones oficiales de SIESA ni contienen datos o muestras de clientes.

El archivo 02 es una **simulación de un formato nuevo**, con otros encabezados. Se comprobó que no coincide con ninguno de los ocho patrones INV/SIESA consultados, incluidos los pendientes. Reordenar columnas no habría servido para probar este caso.

## Archivos y resultados esperados

| Archivo | Objetivo | Referencias | Detalle COP | Total declarado COP | Declarado menos detalle COP |
| --- | --- | ---: | ---: | ---: | ---: |
| `01_siesa_base_2026-09.xlsx` | Carga con patrón conocido v5 | 18 | $19.140.500 | $19.140.500 | $0 |
| `02_siesa_formato_nuevo_2026-09.xlsx` | Asistencia de IA y aprendizaje local | 18 | $19.140.500 | $19.140.500 | $0 |
| `03_siesa_descuadre_2026-09.xlsx` | Descuadre declarado deliberado | 18 | $19.140.500 | $19.190.500 | **$50.000** |
| `04_siesa_campos_en_una_celda_2026-09.xlsx` | Referencia, descripción, tipo, cantidad y costos juntos en una celda | 18 | $19.140.500 | $19.140.500 | $0 |
| `05_siesa_producto_en_varias_filas_2026-09.xlsx` | Producto repartido en cuatro filas de una columna; tipo por sección | 18 | $19.140.500 | $19.140.500 | $0 |

Los archivos 01–04 tienen encabezado en la fila 1, movimientos en las filas 2–19 y control total en la fila 20. Esa última fila se reconoce como total y no se suma nuevamente como inventario. En los archivos 01 y 03 el total está en `K20`; en el 02, en `F20`; en el 04, dentro del texto de `A20`. El 05 tiene 95 filas físicas: cada producto empieza con `Ref:`, ocupa cuatro filas y hereda el último `TIPO DE INVENTARIO:`; el control está en `A95`. Los espacios entre productos prueban que los desplazamientos respetan las filas físicas del archivo.

## Control independiente por tipo

| Tipo de inventario | Referencias | Cantidad (UND) | Valor COP |
| --- | ---: | ---: | ---: |
| Materias primas | 6 | 565 | $2.700.000 |
| Productos en proceso | 6 | 200 | $5.147.500 |
| Productos terminados | 6 | 110 | $11.293.000 |
| **Total** | **18** | **875** | **$19.140.500** |

| Referencia | Cantidad | Unitario COP | Total COP |
| --- | ---: | ---: | ---: |
| MP-001 | 120 | $2.500 | $300.000 |
| MP-002 | 80 | $4.800 | $384.000 |
| MP-003 | 50 | $12.500 | $625.000 |
| MP-004 | 200 | $850 | $170.000 |
| MP-005 | 75 | $6.200 | $465.000 |
| MP-006 | 40 | $18.900 | $756.000 |
| PP-001 | 35 | $32.000 | $1.120.000 |
| PP-002 | 45 | $18.500 | $832.500 |
| PP-003 | 20 | $47.500 | $950.000 |
| PP-004 | 60 | $12.000 | $720.000 |
| PP-005 | 25 | $28.000 | $700.000 |
| PP-006 | 15 | $55.000 | $825.000 |
| PT-001 | 24 | $82.000 | $1.968.000 |
| PT-002 | 16 | $125.000 | $2.000.000 |
| PT-003 | 30 | $56.500 | $1.695.000 |
| PT-004 | 12 | $149.000 | $1.788.000 |
| PT-005 | 18 | $94.000 | $1.692.000 |
| PT-006 | 10 | $215.000 | $2.150.000 |

## Recorrido de prueba

Realizar las cargas en un entorno de pruebas con un cliente de prueba que tenga SIESA asignado al proceso Inventarios. Elegir período `2026-09`. Estos archivos no se han subido a la plataforma ni a producción.

1. **Patrón conocido.** Cargar el archivo 01. Debe reconocerse la v5 con 100 % de coincidencia y prepararse un borrador con 18 movimientos, los tres tipos y $19.140.500, sin preguntas de tipo o total y sin llamar a IA. Revisar que el total de la fila 20 no se duplique.
2. **Formato nuevo.** Cargar el archivo 02. Ningún patrón de la consulta inicial resulta elegible (coincidencia máxima medida: 0 %). La asistencia debe proponer el mapeo y preparar el borrador; si pregunta, resolver únicamente lo ambiguo. El resultado debe volver a ser 18 movimientos y $19.140.500.
3. **Corrección en lenguaje natural.** Si se necesita probar el campo de instrucciones, usar: «El tipo está en Familia de inventario; las unidades están en Unidades disponibles al corte; el valor es Importe de existencias (COP). La fila 20 es el total general». La IA debe ajustar la estructura, sin inventar ni modificar importes.
4. **Confirmación y aprendizaje.** Confirmar la carga final del archivo 02 únicamente después de verificar sus cifras, en el cliente de prueba. El patrón aprendido debe aparecer validado para ese cliente, con el original privado separado de la muestra compartida. Preparar un borrador por sí solo no debe enseñar un patrón reutilizable.
5. **Recarga sin IA.** Volver a seleccionar el archivo 02 para el mismo cliente y aplicativo. Debe tomar el patrón local aprendido, mantener las cifras y evitar una llamada nueva a IA. Basta revisar el segundo borrador y descartarlo para no confirmar una carga adicional del período. Verificar también que otro cliente no usa ese patrón local hasta la aprobación global administrativa.
6. **Descuadre real.** Cargar el archivo 03. Debe mantener el detalle de $19.140.500 y advertir que el archivo declara $19.190.500: diferencia de $50.000. El total declarado se modificó deliberadamente; la asistencia no debe cambiar cantidades, costos o referencias para hacerlo cuadrar. No confirmar este caso como si estuviera conciliado.
7. **Campos juntos en una celda.** Cargar el 04 y revisar los ejemplos: deben separar referencia, descripción, tipo, cantidad, valor unitario y total, mostrando su celda original. La primera interpretación requiere confirmar estos ejemplos. Si pide aclaración, explicar: «Cada fila es un producto. Las etiquetas Ref, Descripción, Tipo, Cant, Unit y Total identifican sus campos. TOTAL GENERAL es el control, no un producto».
8. **Productos repartidos entre filas.** Cargar el 05. La referencia MP-001 está en A3, su descripción en A4, cantidad en A5 y costos en A6; su tipo viene de A2. Cada producto debe convertirse en un solo movimiento. Si pide aclaración, explicar: «Cada Ref inicia un producto de cuatro filas. La fila siguiente es descripción; luego cantidad; luego costo unitario y total. El tipo se hereda de TIPO DE INVENTARIO hasta la siguiente sección».
9. **Corregir la interpretación sin aceptarla.** Si algún ejemplo no corresponde, escribir la explicación y pulsar **Revisar interpretación**. No hace falta aceptar ejemplos incorrectos. La propuesta ajustada exige una nueva revisión. Tras confirmar la carga final, volver a cargar el mismo formato para comprobar su reutilización para ese cliente.

## Mapeos de referencia

| Dato | Archivos 01 y 03 | Archivo 02 |
| --- | --- | --- |
| Hoja | `Sheet1` | `Existencias septiembre 2026` |
| Tipo | C · Tipo inventario | A · Familia de inventario |
| Referencia | F · Referencia | B · Identificador de material |
| Descripción | G · Desc. item | C · Nombre del material |
| Cantidad | I · Existencia | D · Unidades disponibles al corte |
| Valor unitario | J · Costo prom. unit. (ins) | E · Costo por pieza (COP) |
| Valor total | K · Costo prom. tot. (ins) | F · Importe de existencias (COP) |

## Validación realizada

- Recalculo de fórmulas, control independiente de cifras y revisión visual de los tres libros.
- Lectura de los XLSX guardados mediante `ingerir`, selección mediante `mejorVersion`, transformación mediante `transformarModulo` y comprobación con el nuevo `validarLecturaInventario`.
- Base y descuadre seleccionan el patrón aprobado v5. El archivo 02 no resulta elegible para ninguno de los ocho patrones consultados.
- Los tres archivos producen 18 movimientos y los controles por tipo de esta guía. Base y formato nuevo no generan errores, preguntas ni advertencias. El tercero genera la advertencia exacta por $50.000.
- **IA real verificada el 3 de octubre de 2026:** con autorización expresa del usuario se envió una muestra del archivo ficticio 02 a Anthropic mediante el motor nuevo. La prueba obtuvo un mapa con origen `ia`, consumo del proveedor registrado en el resultado, 18 referencias, $19.140.500, total declarado de $19.140.500, diferencia cero y ninguna pregunta pendiente. La ejecución completa de esta comprobación tardó 6,94 segundos; es una medición puntual, no una garantía de tiempo.
- **Reutilización sin IA verificada:** dentro de la misma prueba se volvió a procesar el XLSX con el spec devuelto por la IA como patrón de entrada. Conservó exactamente el resumen y no realizó otra llamada de IA (`usos: []`). Esto verifica la reutilización del mapa en memoria; **no prueba el aprendizaje persistido en BD**, que sólo ocurre al confirmar una carga en la plataforma.
- No se crearon cargas, patrones ni registros de consumo en la base de datos durante esta prueba. La confirmación, el aprendizaje transaccional y la recarga desde un patrón guardado en BD siguen siendo los pasos interactivos 4 y 5 del recorrido anterior.
- **Archivos irregulares 04 y 05:** lectura de los XLSX exportados con la ingesta real, interpretación determinista por reglas, contraste de las 18 referencias, cantidades, costos y tipos, confirmación ligada al mapa y reutilización del patrón en memoria. Ambos producen 875 unidades y $19.140.500 con diferencia cero. Se inspeccionaron visualmente ambos libros; los números dentro de texto son intencionales para reproducir el caso irregular.
- **IA real de los formatos irregulares verificada el 3 de octubre de 2026:** con autorización expresa, Anthropic interpretó ambos XLSX mediante una llamada por archivo. En ambos detectó 18 referencias, 875 unidades, tres tipos y $19.140.500, con total declarado idéntico y diferencia cero. La única pregunta pendiente fue confirmar los ejemplos de interpretación. Aceptarlos preparó la lectura sin otra llamada; reutilizar la regla como patrón tampoco invocó IA. Tiempos puntuales: 8,52 segundos para el 04 y 6,88 segundos para el 05. No se guardaron cargas, patrones ni consumo en BD. Esta comprobación prueba el proveedor y la reutilización en memoria; el aprendizaje persistido se verifica con la confirmación interactiva del inventario.

La prueba real se reproduce con `INV_IA_SMOKE=1 npx vitest run src/lib/modulos/asistencia/ia-live.test.ts`. Requiere configurar Anthropic y transmite únicamente el archivo ficticio 02; está omitida por defecto en la suite para evitar llamadas externas y consumo accidental. Las pruebas ordinarias del motor simulan el proveedor y verifican los cálculos sobre el archivo completo.

La prueba real de los formatos irregulares se reproduce con `INV_IA_FLEXIBLE_SMOKE=1 npx vitest run src/lib/modulos/asistencia/ia-flexible-live.test.ts`. Envía únicamente los archivos ficticios 04 y 05 y también está omitida por defecto. Requiere la autorización correspondiente para transmitirlos al proveedor.

Los patrones configurados pueden cambiar después de esta consulta. Un formato nuevo aprendido durante las pruebas dejará de ser desconocido para ese cliente, que es precisamente el comportamiento esperado.
