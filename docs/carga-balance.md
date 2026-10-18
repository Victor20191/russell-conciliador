# Balance de comprobación — Funcionalidad

Guía funcional de la sección **Balance de comprobación** y, en especial, de la **carga de balances asistida por inteligencia artificial**. Documento de negocio: describe **qué** hace la funcionalidad y **cómo trabaja la IA**, sin entrar en detalles técnicos.

> Actualización: 15-sep-2026

---

## 1. Qué es

**Balance de comprobación** es la fuente única de los balances de cada cliente. Aquí se cargan, se versionan, se validan y se dejan trazados los balances, de modo que el resto de la plataforma (Impuestos · DIAN y Conciliaciones) trabaje siempre sobre la misma información confiable.

La novedad central es **Cargar balance**: en lugar de exigir una plantilla rígida, la plataforma usa **inteligencia artificial** para leer el balance del cliente tal como lo entrega su sistema contable —en distintos formatos— y dejarlo listo para usar, mostrando con claridad qué quedó cargado y qué quedó por fuera y por qué.

---

## 2. Qué se puede hacer en esta sección

- **Ver** los balances por cliente, agrupados por **fecha de corte** (el mensual, el anual y el «por terceros» que terminan el mismo día van juntos), con el período completo de cada uno, su estado («En proceso», «En proceso con alertas» o «Cerrado») y si sus saldos finales coinciden con los demás del corte.
- **Cargar** un nuevo balance (función asistida por IA, descrita abajo).
- **Comparar versiones** de un mismo período para ver qué cambió.
- **Cerrar** un balance para que los módulos concilien contra él (exige que los balances del mismo corte coincidan en saldos finales) y **abrirlo** para corregirlo.
- **Consultar** el plan de cuentas estándar y la bitácora de actividad.

Cada usuario ve únicamente los balances de **sus clientes** (los responsables de la plataforma ven todos).

---

## 3. Quién puede cargar balances

- **Cargar un balance:** el equipo operativo (Staff) y los administradores de la plataforma.
- **Cerrar y abrir un balance:** el senior asignado al cliente y los administradores.
- **Ver y comentar:** todos los roles, siempre sobre los clientes que tienen a cargo.

Si un usuario no tiene permiso para cargar, simplemente no verá el botón.

---

## 4. Cómo cargar un balance (paso a paso)

1. En la sección Balance, pulsar **Cargar balance**.
2. Elegir el **cliente** y el **mes y año** del período. El **tipo de balance** queda referido por defecto como **NIF**.
3. Adjuntar el **archivo** del balance (ver formatos admitidos).
4. Confirmar. La plataforma procesa el archivo con ayuda de la IA.
5. Al terminar, se crea una **nueva versión** del balance y se muestra:
   - un **resumen** del cargue (cuentas importadas, mapeo al plan estándar, si el balance cuadra);
   - las **excepciones** (lo que no se pudo cargar y por qué);
   - un **resumen de auditoría** del proceso;
   - un enlace para **ver el balance** recién cargado.

Cada cargue del mismo cliente y período genera una **versión nueva** (v1, v2, …), conservando el historial.

---

## 5. Cómo trabaja la IA en esta ruta

La inteligencia artificial actúa como un **asistente contable experto en lectura de balances**. Su trabajo, en lenguaje sencillo:

1. **Lee el archivo en el formato en que venga.** No exige una plantilla; se adapta a cómo cada sistema contable exporta el balance.
2. **Reconoce la estructura automáticamente.** Identifica cuál es la hoja del balance (incluidos balances abiertos por tercero), dónde están los encabezados —incluso cuando están repartidos en varias filas— y qué significa cada columna (código, nombre, identificación y nombre del tercero, saldo inicial, débitos, créditos, saldo final).
3. **Extrae las cuentas con sus cifras**, interpretando correctamente los distintos formatos de números (separadores de miles y decimales colombianos o internacionales, símbolos de moneda, valores negativos entre paréntesis, etc.).
4. **Identifica los datos de cabecera sin inventarlos:** el NIT de la empresa (nunca el de un tercero) y el período. Si un dato no está, lo deja vacío en lugar de suponerlo; si hay información contradictoria (por ejemplo, fechas que no coinciden), lo reporta como excepción en vez de elegir por su cuenta.
5. **Distingue las cuentas de detalle de las cuentas “padre” y los totales**, para no duplicar cifras. Excluye filas de totales, subtotales y encabezados repetidos.
6. **Normaliza el signo de los créditos** según cómo los entregue cada sistema, de modo que la información quede homogénea.
7. **Agrupa el detalle por tercero cuando corresponde**, sumando por cuenta para que el balance quede a nivel de cuenta y no de tercero.

Sobre lo que la IA interpreta, la plataforma aplica además **controles automáticos** (descritos en el punto 7) para asegurar que la carga sea correcta y no dependa solo del criterio del modelo.

El cargador admite también Excel binario (`.xlsb`), con selección de hoja y lectura de los valores guardados. En este formato no recupera la negrita; sus perfiles deben distinguir las cuentas por códigos, columnas o niveles. La búsqueda de perfiles de balance considera las primeras 60 filas no vacías, para reconocer reportes que empiezan con parámetros del sistema contable. Los rótulos `TOTAL` y `SUBTOTAL` seguidos de una cuenta al pie del detalle no se usan como evidencia de cabeceras de terceros por su negrita.

### Lectura de balances por tercero

- La identificación y el nombre del tercero se conservan por separado. Se reconocen encabezados como **Nombre NIT** y **Nombre tercero**; cuando existen **Identificación** y **Tercero**, este último puede contener el nombre. Un tercero con nombre y sin documento se conserva con identificación vacía.
- En reportes con el detalle debajo de la cuenta, las filas que dejan vacíos el código y nombre de cuenta heredan la cuenta del bloque. En reportes con cuentas en negrita, se conservan **Genérico** y los nombres con números, como **T3 TEXTILES**, aunque documento y nombre compartan celda.
- Cuando se confirma el formato **total de tercero + desglose por centro de costo**, se conserva el total una sola vez. Si el desglose difiere, se muestra una excepción para revisar el archivo. El modo automático exige evidencia repetida del patrón; una fila con centro vacío por sí sola no basta. El modo **tercero totalizado** conserva las filas independientes.

Estas correcciones se aplican al leer o reprocesar el archivo. Para corregir un borrador previo, revisar las columnas de identificación y nombre en el editor de estructura, adjuntar nuevamente el original y pulsar **Reprocesar sin IA**. Los balances ya guardados no se recalculan automáticamente.

### Por qué es eficiente y confiable

- **Eficiente:** para archivos grandes (miles de cuentas), la IA se concentra en **entender la estructura** del archivo y la plataforma procesa el resto de las filas de forma automática. Así la carga es rápida y de bajo costo, incluso con balances extensos.
- **Confiable:** la IA **no fabrica datos**. Cualquier fila o dato dudoso se envía a **excepciones** en lugar de cargarse, y siempre se valida el cuadre contable antes de aceptar una cuenta.
- **Adaptable:** las reglas con las que la IA interpreta los balances están documentadas y se pueden ajustar con el tiempo, sin rehacer la funcionalidad.

---

## 6. Formatos de archivo admitidos

- Excel (`.xlsx`, `.xlsm`, `.xls`)
- CSV
- JSON
- PDF

Tamaño máximo por archivo tabular: **60 MB**. Para PDF se conservan **20 MB**
porque el documento se envía al proveedor de IA. Los archivos grandes se cargan
en fragmentos y los Excel se leen por streaming para evitar los límites del
transporte y el consumo excesivo de memoria durante la extracción.

---

## 7. Qué información se extrae y se valida

De cada balance se obtiene, por cuenta: **código de cuenta, nombre, saldo inicial, débitos, créditos y saldo final**; y a nivel general: **NIT de la empresa, período (inicial y final) y tipo de balance NIF**.

Antes de aceptar la información, la plataforma valida:

- **Cuadre contable por cuenta:** que el saldo final corresponda al saldo inicial más los débitos menos los créditos. Las cuentas que no cuadran **no se cargan** y quedan reportadas.
- **Balance cuadrado** a nivel general (partida doble).
- **Mapeo al plan de cuentas estándar** Russell (cuántas cuentas quedaron mapeadas y cuántas no).
- **Coherencia de naturaleza** (saldos contrarios a la naturaleza de la cuenta) y **variaciones** relevantes frente al período anterior.

---

## 8. Qué entrega el cargue

- **Versión cargada:** una nueva versión del balance del cliente para ese período, con sus sumas, su desglose por grupos y sus validaciones, lista para consultar y comparar.
- **Excepciones:** la lista de filas o datos que **no** se cargaron, con el motivo y la acción recomendada (por ejemplo, una cuenta que descuadra o un período contradictorio). Se muestran al finalizar el cargue.
- **Resumen de auditoría:** cuántas filas se leyeron, cuántas se importaron, cuántas se excluyeron, cuántas descuadraron, y de dónde salió cada dato de cabecera (del parámetro elegido, del propio archivo o inferido).

### Archivos que no se pueden cargar

Algunos archivos no son balances de comprobación completos y la plataforma los rechaza con una explicación clara; por ejemplo, un archivo que solo trae **movimientos del período** (sin saldos) o un **libro diario** de partidas. En esos casos se solicita un balance con saldos.

---

## 9. Después de cargar: detalle, comparación y cierre

- **Ver el balance:** muestra los grandes totales (activo, pasivo, patrimonio, utilidad), el detalle por grupos de cuentas con su mapeo al estándar, las validaciones y el historial de versiones.
- **Exportar el balance homologado:** genera un Excel donde el número y la descripción del nivel, el código de cuenta y la descripción de la cuenta aparecen en columnas independientes.
- **Comparar versiones:** evidencia qué cuentas se agregaron, se quitaron o cambiaron entre una versión y otra.
- **Balances del mismo corte:** todos los balances que terminan en la misma fecha deben tener los mismos saldos finales, porque los módulos concilian contra esa columna. La pantalla del balance compara cada uno con los demás del corte y muestra las cuentas que difieren. El borrador hace la misma comparación antes de confirmar: se puede cargar igual, y el balance queda inconsistente hasta que se elimine uno de los dos.
- **Cerrar balance:** lo deja inmutable y habilita a los módulos a conciliar contra él. Solo se cierra la versión vigente de su línea, cuando todos los balances del corte coinciden en saldos finales y el prevalidador está aprobado. Si hay diferencias, el aviso dice con qué balances y cómo resolverlo: el que sobra se elimina (si está cerrado, primero se abre) y uno con una conciliación de módulo en firme solo se **reemplaza**: la conciliación pasa al nuevo, el viejo se elimina y el nuevo queda cerrado, todo en un paso, siempre que sus cuentas en firme sean idénticas en saldo final y homologación.
- **Versión nueva:** para cargar una versión nueva de un balance cerrado, primero se abre la vigente con «Abrir balance». Así nunca quedan versiones viejas cerradas.
- **Módulos:** solo concilian contra un balance cerrado del mes del cargue (Cartera y Cuentas por pagar, además, «Por terceros»). Sin él, el cruce no se calcula y la pestaña explica qué falta.

---

## 10. Consideraciones

- **Uso de IA:** para leer e interpretar los archivos, el contenido del balance se procesa mediante un servicio de inteligencia artificial. Es la base de que la plataforma pueda “entender” archivos en cualquier formato.
- **Control humano:** la carga separa siempre lo aceptado de las excepciones, de modo que el responsable revise y decida sobre lo que quedó por fuera.
- **Trazabilidad:** cada cargue queda versionado y con su resumen de auditoría, conservando el historial completo por cliente y período.
