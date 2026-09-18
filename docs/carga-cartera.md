# Carga y conciliación de Cartera y Cuentas por pagar

Recorrido del auxiliar por tercero de Cartera (`CAR`) y CxP (`CXP`) desde que se sube el archivo
hasta que la conciliación queda en firme. Ambos módulos usan el mismo motor; los separa el
descriptor (`src/lib/modulos/descriptores.ts`): cuentas Russell de 6 dígitos, naturaleza y cuentas
que dicen el origen.

## 1. Carga (`/modulos/car` y `/modulos/cxp` › Cargar)

1. **Hoja.** En un libro de varias hojas se propone la del auxiliar por su contenido
   (`seleccion-hoja.ts`): se descartan balances y hojas de trabajo. Un archivo que solo trae
   balances se rechaza («cárgalo en Balance»).
2. **Aplicativo y mapeo.** El analista confirma el aplicativo de Contabilidad del cliente del que
   sale el archivo (u «Otro», que se agrega a la ficha, o «Archivo manual»). Si el archivo coincide
   en 80 % o más con un patrón de ese aplicativo (`/modulos/car/patrones`), se lee con él sin
   configurar columnas; si no, la carga se detiene hasta que un administrador cree el patrón. Solo
   con «Archivo manual» se mapea a mano: el sugeridor (`extraccion/sugerir.ts`) reconoce roles,
   rangos de edad, la forma del tercero (columna, cabecera SAP/SIESA, fila rotulada SEVEN), el saldo
   del bloque de SIIGO y la convención de signo, y el mapeo se memoriza en el perfil del cliente.
3. **Tipo de formato.** Lo declara el administrador en cada versión del patrón (y el analista en
   «Archivo manual»); un aplicativo puede tener varias versiones aprobadas, p. ej. una por edades y
   otra por documento, y la carga usa la que reconoce más columnas del archivo:
   - **Por documento**: cada fila es un documento; se valida que la suma de los documentos de cada
     cliente dé el total que el archivo imprime para ese cliente (renglón del cliente, columna
     «Saldo del proveedor» o fila «Total <cliente>» debajo de sus documentos).
   - **Por edades**: cada fila es un tercero; se valida que la suma de sus edades dé su total.
   - **Por documento y edades**: los dos controles, las edades documento por documento.
   - **Por cuenta y NIT**: cada fila es un tercero con su saldo, colgando de la cuenta que lo
     agrupa, sin documento ni edades (el «Reporte de estado de cuentas» de SIESA); se valida que la
     suma de los terceros de cada cuenta dé el total que el archivo imprime para esa cuenta. Como el
     archivo es jerárquico y cada nivel trae su total, solo se compara la cuenta que tiene terceros
     debajo; los niveles de agregación no se comparan (los cubre el total del archivo).

   Si el archivo no trae con qué comparar, el control queda «sin validar» y lo dice. Las versiones
   anteriores sin tipo lo deducen del mapeo. Un período suma por un solo nivel (tercero o
   documento); el otro entra como control. El pie de página del ERP («Siesa Enterprise Net 1.25.0 ·
   Pág. 1 / 1») nunca entra como ítem, aunque su texto caiga en la columna del identificador.
4. **Origen.** Nacional, exterior o mixto (lo decide la cuenta de cada fila).
5. **Moneda, TRM de cierre y fecha de corte.**
   - Una hoja en divisa (el sugeridor la propone por el nombre «USD»/«EUR») se lee en la divisa y
     se convierte a pesos con la TRM de cierre, que es obligatoria. «Oficial» consulta la TRM de
     la fecha de corte.
   - Un importe con su divisa escrita en la celda («USD (54,323.40)», el paréntesis es el signo), en el
     saldo o en un rango de edades, se convierte con la misma
     TRM; sin ella queda como excepción del borrador.
   - La fecha de corte es por defecto el fin del período.
   - La divisa queda en cada fila (`_saldoDivisa`, `_moneda`, `_trm`). La TRM y la fecha son del
     cargue y no se guardan en el perfil.
6. **Borrador y confirmación.** Al confirmar se guarda el detalle, el saldo por tercero
   (`cartera_saldo_tercero`), la TRM y la fecha de corte del encabezado, y el origen de cada fila:
   lo declarado, la moneda y la forma del identificador. En el cruce por tercero manda la cuenta
   asignada en Consolidado (130510/221005 exterior, 130505/220505 nacional). Un anexo del período con otra TRM se rechaza.

## 2. Revisión (`/modulos/[codigo]/[id]`)

- **Detalle.** «Saldo / total» muestra el saldo con que suma la fila: cuando salió de los rangos
  de vencimiento (SIESA deja el total del documento en $0) o de la divisa con la TRM, lo que traía
  el archivo queda en el tooltip. Las fechas se guardan en ISO, también las que llegan como serial
  de Excel. Lo mismo en el borrador y en la exportación. La tabla oculta de entrada las columnas
  sin datos en el cargue y los rangos que no suman (cupo, posfechados, deterioro…); «Mostrar todas
  las columnas» las trae de vuelta. La exportación las lleva todas. Los renglones de cuenta del
  archivo (SIESA), las filas de porcentajes y los pies también se ocultan: el total que el archivo
  imprime para la cuenta queda en el encabezado del grupo con «cuadra» o la diferencia, y los
  encabezados de tercero se ven en cursiva, rotulados «no suma».
- **Consolidado.** Cada cuenta del archivo se asigna a una cuenta Russell de 6 dígitos del módulo
  (Cartera: 130505, 130510, 280505; CxP: las 12 de su descriptor). Las asignaciones guardadas a 4
  dígitos antes de este cambio quedan «sin cuenta» y se vuelven a asignar.
  **Cuenta fuera de la cédula, solo para el período.** El campo y «Buscar…» siguen ofreciendo la
  cédula, pero también se puede escribir cualquier cuenta de 6 dígitos del plan estándar Russell (o
  buscarla en «Otras cuentas del plan Russell»): la asignación de ese renglón vale solo para este
  cliente y este período, con el distintivo «Solo 2025-12». Entra al cruce contable como un renglón
  más (con el saldo de Contabilidad de esa cuenta) y al cruce por tercero (los NIT de esa cuenta en el
  balance y los saldos del auxiliar asignados a ella). Los demás meses siguen con la memoria del
  cliente y la cédula no cambia. Con la conciliación del período en firme no se agregan ni quitan.
  **Archivo sin cuenta.** Si el archivo no trae la columna de la cuenta, sus filas quedan
  «(sin clasificar)». En el borrador, antes de confirmar, se les pone un nombre (p. ej. «COP» y
  «USD» para las dos hojas de OFIMATICA) y cada nombre es un renglón del Consolidado con su propia
  cuenta. Con «Agregar archivo», el borrador ofrece los nombres que ya usa la versión vigente: el
  mismo nombre junta las filas en ese renglón; uno nuevo abre otro. Un nombre usado en meses
  anteriores trae su cuenta sola.
- **Cruce contable.** Por cuenta Russell de 6 dígitos, con el signo del módulo (Cartera débito, CxP
  crédito): un anticipo resta en los dos lados, como en el auxiliar (la 2805 en Cartera, la 1330 en
  CxP), en vez de mostrarse con la naturaleza de su propia cuenta.
- **Cruce por tercero.** Del auxiliar entran los NIT de las cuentas del archivo asignadas en
  Consolidado a una cuenta del módulo; del balance, los NIT de esas cuentas sin las marcadas no
  modulares en el cruce contable. El mismo balance y las mismas compuertas del cruce contable, contra el
  detalle por tercero ligado a ese balance. Un renglón por tercero con la contabilidad por cuenta de
  6 dígitos y el auxiliar nacional/exterior. Las cuentas del grupo que no son del módulo y las que
  no tienen detalle por tercero se informan aparte. Los terceros sin saldo en ningún lado se ocultan de
  entrada: se ven con la tarjeta «Sin saldo», al buscarlos o con «Mostrar los n sin saldo».
- **Emparejar.** Un tercero que solo está en el auxiliar (típicamente sin NIT) se empareja con uno
  del balance; hay sugerencias por nombre. Vale para todos los períodos o solo para el del cargue.
- **Marcas.** Toda diferencia por tercero admite marca; desde el umbral de descuadre de
  `/config/parametros` la exige el cierre.
- **Novedades.** Arriba, los controles del tipo de formato (documentos contra el total de cada
  cliente, edades contra el total) con sus diferencias o el motivo por el que no se validaron;
  lo mismo se ve, resumido, en «Validación del archivo» del borrador. Después, documentos repetidos por el mismo valor entre terceros, colisión
  de claves, saldos contrarios a la naturaleza, días vencidos y rangos de edad contra la fecha de
  corte (en los saldos a cargo del tercero: una nota crédito o un anticipo no envejece), vencimientos
  imposibles y la fecha a la que el archivo calculó sus días cuando no es la
  del cargue. La fecha de corte se puede cambiar desde la pestaña del cruce por tercero.

## 3. Cierre en firme

Lo cierra el senior o gerente asignado cuando el cruce contable está explicado **y** el cruce por
tercero está disponible y con marca en toda diferencia desde el umbral. Se bloquean las cuentas del
balance homologadas a las cuentas de 6 dígitos del módulo y se guarda la evidencia del cruce por
tercero (totales, conteos y huella). Con la conciliación en firme no se cambian emparejamientos ni
la fecha de corte.

## Limitaciones conocidas

- Cambiar la TRM de cierre de un cargue ya confirmado exige cargar de nuevo el archivo: los
  importes se convierten al leer.
- La moneda por fila solo se toma de la celda con código («USD (…)»); una columna «Moneda» se
  conserva como dato pero no dispara conversión, porque los archivos que la traen también traen el
  importe en pesos.
