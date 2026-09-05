# Comparación de aperturas de balance

## Comportamiento

Después de confirmar un cargue se comparan sus cuentas de movimiento con todos
los archivos confirmados de apertura opuesta del mismo cliente y de las mismas
fechas inicial y final. La apertura por cuenta debe estar declarada y no ser el
subproducto de un cargue por terceros. El número de versión y el congelado no
seleccionan la pareja ni cambian por ejecutar este control.

Se comparan saldo inicial, débitos, créditos y saldo final por código completo
del cliente (`cuenta8`, sin recortar). Se suman movimientos repetidos; solo se
excluye la fila propia del tercero cuando ya hay un desglose real de esa cuenta.
Una diferencia de un centavo, o una cuenta ausente en una apertura, marca ambos
archivos como inconsistentes. No se usa el umbral de materialidad de alertas.

`balance_cruce_aperturas` conserva una evidencia por pareja y muestra las mismas
cuentas/importes en ambos archivos. Una vez detectada la inconsistencia, editar
cuentas, revisar otra vez o subir una nueva versión no la elimina. Solo eliminar
uno de los dos archivos retira esa pareja, mediante FK `ON DELETE CASCADE`.
Las inconsistencias con otros archivos siguen vigentes. Los bloqueos existentes
del borrado y el permiso `balance:eliminar` se conservan.

## Interfaz y recuperación

- `/balance`: indicador de archivos inconsistentes por período.
- `/balance/[id]`: panel con ambos archivos, códigos originales, cuatro importes
  y diferencias; la pestaña Versiones marca individualmente cada archivo afectado.
- `/balance/[id]/terceros`: el mismo panel entre archivos y, además, comparación
  completa de los cuatro importes dentro del cargue ligado. Conserva su árbol,
  filtros, identificación y validaciones de homologación/presencia.
- `Revisar archivos`: permite validar cargues anteriores o reintentar un control
  fallido, con permiso crear/editar y alcance del cliente. No resuelve alertas.
- Un error del control posterior no revierte una promoción exitosa. El panel
  diferencia validación pendiente/no disponible de ausencia de contraparte.

## Conservación del borrador

El enganche está después del commit de `persistirCargue`. No modifica extracción,
signos, segmentación, omisiones, filas forzadas, captura o purga del staging. El
comparador lee únicamente detalles confirmados. No cambia aprobación, congelado,
oficialidad ni las compuertas de conciliación de módulos.

## Validación funcional

1. Cargar un archivo por cuenta y después otro por terceros, mismo cliente y
   fechas, con débitos/créditos distintos y el mismo saldo final. Al confirmar,
   verificar aviso y panel en ambos archivos; invertir el orden y repetir.
2. Probar diferencia individual de SI/DB/CR/SF, incluso 0,01, cuentas ausentes y
   cuentas de más de ocho dígitos. Verificar cada importe y la diferencia firmada.
3. Revisar otra vez o cargar una tercera versión: las parejas inconsistentes
   originales deben permanecer. Eliminar una sola versión: solo desaparecen sus
   parejas; el estado original de los restantes balances no cambia.
4. Cargar solo por terceros: el balance agregado del mismo lote no constituye una
   contraparte independiente. La vista indica que falta la otra apertura.
5. En el visor ligado comprobar diferencias en movimientos compensados, filtro
   Solo con diferencia, despliegue por cuenta/tercero y ausencia de doble conteo.

La migración es aditiva. Aplicar con `prisma migrate deploy`; no usar reset ni
reprocesar archivos históricos para habilitar el control. Preparar release minor
solo tras pasar pruebas, lint, TypeScript y build.
