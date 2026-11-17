# Anticipos bimestrales (RST) — implementación

Cómo va quedando construido el submódulo, fase por fase. El diseño aprobado está en `DISENO.md`. Comparte el motor de Retención en la fuente e IVA: lo que cambia sale del descriptor `RST` de `src/lib/impuestos/impuestos-dian.ts`.

## Fases 1 y 2 · Configuración, nueva revisión y cargue (17/Nov/2026, sin commit)

- **Formulario 2593** (`src/lib/impuestos/formularios/f2593.ts`): renglones 26 a 79 como valores; la tarifa (36) y la hoja 2 no se guardan. El total de los valores a pagar es un renglón `calculado` (1000, rótulo «76 a 79»). Las fórmulas del instructivo (39, 41, 44, 48, 49, 53, 56, 57, 61, 64, 65, 71, 74, 75, 77, 78 y 79) avisan sin bloquear. `definicion.ts` ganó el tipo `calculado`, `rotulo`, `numero` (prefijo y dígitos), `correccion` (casillas), `sinSello`, `pisoCero` en las validaciones y los ayudantes `reglaNumero`, `numeroFormularioValido`, `casillasCorreccion`, `rotuloRenglon`, `renglonesVisibles` y `valorRenglon`. El 350, el 300 y el 490 no cambian (13 dígitos y los dos primeros del código).
- **Descriptor `RST`** y campos nuevos del tipo (`requiereRegimenSimple`, `pagoSumaCadena`, `componentesPago`, `cierreEnFirme`, `cruce.disponible`, `cruce.mensajeNoDisponible`; `renglones` sin `sanciones` en RST, con `renglonSanciones`; `claveFormularioCliente` nulo; `midePresentacion`).
- **490 concepto 27** (`f490.ts`).
- **Calendario `RST_ANTICIPO`** (`calendario.ts`, `mesesHolgura: 3`); `CalendarioDianSchema` deriva sus claves de `CLAVES_CALENDARIO`. Fixture `__fixtures__/calendario-rst-2026.ts` comprobada contra el PDF (NIT …8: 22 de mayo, 22 de junio, 22 de julio, 18 de septiembre, 23 de noviembre y 22 de enero de 2027).
- **Lectura** (`retencion/lectura.ts`): reconoce el 2593 (antes que el 350), su número de 14 dígitos, el ajuste de la casilla 24 (1 o X) con el recibo de la 25, y no le pide fecha (la fuerza a vacía aunque la IA copie la casilla 81). Prompt de fábrica `formulario_dian` con el 2593 (si en `prompts_ia` hay una versión editada a mano, manda esa).
- **Períodos y pagos** (`periodos-revision.ts`, `pagos.ts`): `valoresAPagar` suma, en RST, los valores a pagar de los recibos anteriores de la cadena que tienen su 490; lo declarado de un renglón calculado sale de su fórmula (`valorRenglon`); sin renglón de sanciones, la diferencia es Σ36 − (76 a 79) y la sanción pagada no entra al total. Retención e IVA dan lo mismo que antes.
- **Nueva revisión** (`revisiones-client.tsx`, `crearRevisionImpuesto`, `clientesParaRevision`): la lista trae la marca del Régimen Simple (primero los marcados); un cliente en No pide la casilla de confirmación y la acción pasa su ficha a Sí en la misma transacción («MARCÓ RÉGIMEN SIMPLE DEL CLIENTE»). `RevisionImpuestoSchema` admite `RST` y `confirmaRegimenSimple`.
- **Confirmar** (`impuestos-revisiones.ts`, `ConfirmarFormularioDianSchema`): la fecha del sello puede ir vacía (los controles la exigen en los demás formularios), el concepto 27 y números de 14 dígitos.
- **Pantallas:** menú «Impuestos · DIAN › Anticipos bimestrales (RST)» (`/impuestos/rst`), miga, modal del formulario (sin fecha en el 2593, «Es un ajuste (casilla 24)», total 76 a 79 calculado), lista de formularios (sin «presentado», «Ajusta a», total con rótulo) y «¿Qué revisa el sistema?» con las fórmulas del 2593 tomadas de su definición.
- **Ayuda:** fichas `impuestos.rst` e `impuestos.rst_revision`; las de Calendario tributario, Retención, IVA (rechazan el 2593 y el 490 concepto 27) y Clientes, actualizadas.
- **Pruebas:** `src/lib/impuestos/rst/rst-cargue.test.ts` con las cifras del bimestre 1 real.
- **Sin probar con la IA:** cómo lee los PDF reales del 2593 (se verá al importarlos).

## Fases 3 y 4 · Vistas, Excel, oportunidad, pagos, novedades y cruce en construcción (17/Nov/2026, sin commit)

- **Pestañas:** `RST.pestanas` son las siete de la revisión. El gate de la página (`conResultados` por la pestaña «cruce») no cambió.
- **Vistas** (`retencion/vistas.ts`): las filas salen de `renglonesVisibles` (en el 2593, también el total calculado, que se recalcula y va en negrita); `FilaVista.rotulo` y `renglonDeFila` nombran el renglón «76 a 79» en pantalla y en el Excel.
- **Cruce en construcción:** `resultadosEnVivo` no lee el balance si `cruce.disponible` es falso y devuelve el estado «bloqueado» con `mensajeNoDisponible`; `CruceRevision` lo muestra como «Cruce contable en construcción» (sin selector de balance); `evaluarCierreRetencion({ sinCruce })` no lo cuenta como pendiente; `objetivoDeMarca` y `escogerBalanceImpuesto` rechazan marcas del cruce y la elección de balance.
- **Sin cierre:** sin `cierreEnFirme` no hay barra de cierre, `cerrarRevisionImpuesto` y `desbloquearRevisionImpuesto` responden que aún no está disponible, y Novedades se titula «Pendientes» y lo explica.
- **Oportunidad** (`retencion/oportunidad.ts`): con una declaración `sinSello`, la presentación queda en el estado nuevo `no_aplica` («No aplica») sin marca; la pantalla y el Excel ocultan esas columnas y miden solo el pago del 490 concepto 27.
- **Pagos efectuados:** `FilaPagos.componentes` y `ResultadoPagos.totalComponentes` traen 76, 77, 78 y 79 (solo en RST). La pantalla (`TablaPagosComponentes`) y el Excel (`hojaPagosComponentes`) muestran los cuatro valores, su total, el impuesto pagado (36), la diferencia y, como informativos, la sanción (34) y los intereses (35).
- **Excel:** sin hoja de cruce mientras está en construcción; archivo `Anticipos RST <cliente> <año>-<mes>.xlsx`; «Ajusta a» en Formularios.
- **Ayuda:** la ficha de la revisión de RST tiene las siete pestañas y «Exportar a Excel».
- **Pruebas:** `src/lib/impuestos/rst/rst-resultados.test.ts` (vistas, oportunidad oportuna y extemporánea, pagos con sus componentes, pendientes sin cruce y encabezados del Excel). Retención e IVA conservan sus pruebas sin cambios.
- **Pendiente:** cruce contable y cierre en firme cuando existan las cuentas Russell; release minor («Impuestos · Anticipos bimestrales (RST)») cuando el usuario la pida.
