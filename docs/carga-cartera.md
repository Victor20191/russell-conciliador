# Carga y conciliación de Cartera y Cuentas por pagar

Recorrido del auxiliar por tercero de Cartera (`CAR`) y CxP (`CXP`) desde que se sube el archivo
hasta que la conciliación queda en firme. Ambos módulos usan el mismo motor; los separa el
descriptor (`src/lib/modulos/descriptores.ts`): cuentas Russell de 6 dígitos, naturaleza y cuentas
que dicen el origen.

## 1. Carga (`/modulos/car` y `/modulos/cxp` › Cargar)

1. **Hoja.** En un libro de varias hojas se propone la del auxiliar por su contenido
   (`seleccion-hoja.ts`): se descartan balances y hojas de trabajo. Un archivo que solo trae
   balances se rechaza («cárgalo en Balance»).
2. **Mapeo.** El sugeridor (`extraccion/sugerir.ts`) reconoce roles, rangos de edad, la forma del
   tercero (columna, cabecera SAP/SIESA, fila rotulada SEVEN), el saldo del bloque de SIIGO y la
   convención de signo. Todo se memoriza en el perfil del cliente.
3. **Qué es cada fila.** Un tercero (resumen por edades) o un documento. Un período suma por un
   solo nivel; el otro entra como control.
4. **Origen.** Nacional, exterior o mixto (lo decide la cuenta de cada fila).
5. **Moneda, TRM de cierre y fecha de corte.**
   - Una hoja en divisa (el sugeridor la propone por el nombre «USD»/«EUR») se lee en la divisa y
     se convierte a pesos con la TRM de cierre, que es obligatoria. «Oficial» consulta la TRM de
     la fecha de corte.
   - Un importe con su divisa escrita en la celda («USD (54,323.40)») se convierte con la misma
     TRM; sin ella queda como excepción del borrador.
   - La fecha de corte es por defecto el fin del período.
   - La divisa queda en cada fila (`_saldoDivisa`, `_moneda`, `_trm`). La TRM y la fecha son del
     cargue y no se guardan en el perfil.
6. **Borrador y confirmación.** Al confirmar se guarda el detalle, el saldo por tercero
   (`cartera_saldo_tercero`), la TRM y la fecha de corte del encabezado, y el origen de cada fila:
   la cuenta de la fila (130510/221005 exterior, 130505/220505 nacional), lo declarado, la moneda y
   la forma del identificador. Un anexo del período con otra TRM se rechaza.

## 2. Revisión (`/modulos/[codigo]/[id]`)

- **Cruce por tercero.** El mismo balance y las mismas compuertas del cruce contable, contra el
  detalle por tercero ligado a ese balance. Un renglón por tercero con la contabilidad por cuenta de
  6 dígitos y el auxiliar nacional/exterior. Las cuentas del grupo que no son del módulo y las que
  no tienen detalle por tercero se informan aparte.
- **Emparejar.** Un tercero que solo está en el auxiliar (típicamente sin NIT) se empareja con uno
  del balance; hay sugerencias por nombre. Vale para todos los períodos o solo para el del cargue.
- **Marcas.** Toda diferencia por tercero admite marca; desde el umbral de descuadre de
  `/config/parametros` la exige el cierre.
- **Novedades.** Edades vs total, documentos repetidos por el mismo valor entre terceros, colisión
  de claves, saldos contrarios a la naturaleza, días vencidos y rangos de edad contra la fecha de
  corte, vencimientos imposibles y la fecha a la que el archivo calculó sus días cuando no es la
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
