// Ayuda en pantalla — fichas de Impuestos · DIAN (Mapeos DIAN y Calendario tributario).
// Describen la pantalla tal como funciona hoy.

import { REGLAS } from "../reglas";
import type { FichaAyuda } from "../tipos";

const ACCIONES = "src/app/actions";

export const FICHA_MAPEOS_DIAN: FichaAyuda = {
  id: "catalogo.mapeos_dian",
  titulo: "Mapeos DIAN",
  proposito:
    "Contra qué cuenta Russell se concilia cada renglón de los formularios de la DIAN y qué terceros son la DIAN. Tiene una pestaña por formulario: Retención en la fuente (350) e IVA (300). Vale para todos los clientes. Todos la consultan; la editan quienes configuran Impuestos.",
  antesDeEmpezar: [
    "En el 350, cada concepto suma sus dos columnas del formulario, persona jurídica y natural (Honorarios = 42 + 95), y se compara con el saldo final de su cuenta Russell en el balance por terceros.",
    "En el 300, cada renglón va contra una o varias cuentas Russell. Las de IVA y la de retenciones de IVA (135517) se concilian por tercero; las de ingresos, por el saldo de la cuenta.",
    "Las bases sujetas a retención y las compras del 300 (44 a 57) no se concilian y no aparecen aquí.",
    "Una cuenta Russell solo se puede asignar si existe en el plan Russell; las que faltan se crean en Plan Estándar Russell.",
  ],
  etapas: [
    {
      titulo: "Conceptos del formulario 350 · Renglones del formulario 300",
      acciones: [
        {
          nombre: "Retención en la fuente · 350 · IVA · 300",
          queHace: "Cambia de formulario.",
          regla: REGLAS.verImpuestos,
        },
        {
          nombre: "Guardar",
          queHace:
            "Cambia la cuenta Russell de un concepto o renglón. Vacía, queda sin cuenta: lo declarado no tiene contra qué cruzar. En el 300 se pueden escribir varias cuentas separadas con +; en el cruce suman juntas en una fila.",
          regla: REGLAS.configurarImpuestos,
          condiciones: [
            "Cada cuenta tiene 6 dígitos y existe en el plan Russell.",
            "El saldo a favor anterior (84) y las sanciones no llevan cuenta: no entran al cruce contable.",
          ],
          fuente: { archivo: `${ACCIONES}/impuestos-configuracion.ts`, funcion: "guardarCuentaMapeoDian" },
        },
      ],
    },
    {
      titulo: "Tercero DIAN por cuenta",
      acciones: [
        {
          nombre: "Restar · No restar",
          queHace:
            "Decide si en esa cuenta Russell el saldo de los terceros DIAN se muestra tachado y se resta del saldo que se concilia (los pagos a la DIAN registrados en las mismas cuentas). Solo aparecen las cuentas que se concilian por tercero del formulario de la pestaña.",
          regla: REGLAS.configurarImpuestos,
          fuente: { archivo: `${ACCIONES}/impuestos-configuracion.ts`, funcion: "cambiarRestaTerceroDian" },
        },
      ],
    },
    {
      titulo: "NIT de la DIAN",
      acciones: [
        {
          nombre: "Agregar NIT",
          queHace: "Agrega un NIT a la lista de la DIAN. Se compara sin el dígito de verificación.",
          regla: REGLAS.configurarImpuestos,
          fuente: { archivo: `${ACCIONES}/impuestos-configuracion.ts`, funcion: "agregarTerceroDian" },
        },
        {
          nombre: "Quitar",
          queHace: "Quita un NIT de la lista, con confirmación.",
          regla: REGLAS.configurarImpuestos,
          condiciones: ["La lista conserva al menos un NIT."],
          fuente: { archivo: `${ACCIONES}/impuestos-configuracion.ts`, funcion: "quitarTerceroDian" },
        },
      ],
    },
  ],
  estados: [
    { etiqueta: "Resta", significado: "El renglón se resta en su total: retenciones practicadas en exceso o indebidas en el 350; devoluciones en ventas (42) y ajuste de descontables (80) en el 300." },
    { etiqueta: "No existe en el plan Russell", significado: "La cuenta todavía no está en el plan: sus conceptos no tienen contra qué cruzar hasta que se cree." },
    { etiqueta: "Resta el tercero DIAN · No resta el tercero DIAN", significado: "Si el saldo de los terceros DIAN se descuenta en esa cuenta. Las autorretenciones no lo restan: sus movimientos con la DIAN son la autorretención misma." },
  ],
  relacionadas: [
    { label: "Plan Estándar Russell", href: "/config/mapeo", permiso: "mapeo:ver" },
    { label: "Calendario tributario", href: "/config/calendario-tributario", permiso: "impuestos:ver" },
    { label: "Parámetros de alertas", href: "/config/parametros", permiso: "parametros:ver" },
  ],
};

export const FICHA_CALENDARIO_TRIBUTARIO: FichaAyuda = {
  id: "parametros.calendario_tributario",
  titulo: "Calendario tributario",
  proposito:
    "Las fechas límite de la DIAN para presentar y pagar la Retención en la fuente y el IVA (bimestral, cuatrimestral y anual), por período y último dígito del NIT. Con ellas se mide si cada formulario se presentó y se pagó a tiempo. Se carga una vez por año.",
  antesDeEmpezar: [
    "La fecha depende del último dígito del NIT sin el dígito de verificación: en un NIT de 9 dígitos, el noveno.",
    "Sin el calendario de un año, la oportunidad de ese año no se puede calcular.",
    "Cada formulario tiene su pestaña: Retención en la fuente, IVA bimestral, IVA cuatrimestral e IVA anual. La pestaña dice si está cargado, sin cargar o con una propuesta sin guardar.",
  ],
  etapas: [
    {
      titulo: "Cargar",
      acciones: [
        {
          nombre: "Importar desde el PDF de la DIAN",
          queHace:
            "La IA lee del mismo PDF las secciones de Retención en la fuente, IVA bimestral, IVA cuatrimestral y la declaración anual consolidada de IVA del Régimen Simple, y propone una grilla por formulario. No se guarda nada hasta revisar y guardar cada una. Si una sección no se pudo leer, el aviso la nombra. Mientras lee, la pantalla avisa si intentas salir o recargar, porque se perdería la lectura.",
          regla: REGLAS.configurarImpuestos,
          condiciones: ["Un PDF de hasta 15 MB.", "La lectura con IA tiene que estar disponible."],
          fuente: { archivo: `${ACCIONES}/impuestos-configuracion.ts`, funcion: "leerCalendarioPdf" },
        },
        {
          nombre: "Escribir a mano · Editar a mano",
          queHace: "Abre la grilla del formulario de la pestaña para escribir o corregir cada fecha.",
          regla: REGLAS.configurarImpuestos,
        },
      ],
    },
    {
      titulo: "Revisar y guardar",
      acciones: [
        {
          nombre: "Guardar · Reemplazar",
          queHace:
            "Guarda la grilla del formulario de la pestaña. Si ya había una, la reemplaza completa. Las fechas que cambian frente a lo guardado se resaltan. Las propuestas de los otros formularios siguen abiertas en sus pestañas hasta guardarlas o descartarlas.",
          regla: REGLAS.configurarImpuestos,
          condiciones: [
            "Están las diez fechas de cada período del formulario.",
            "Cada fecha es posterior al cierre de su período.",
          ],
          fuente: { archivo: `${ACCIONES}/impuestos-configuracion.ts`, funcion: "guardarCalendarioDian" },
        },
        { nombre: "Descartar", queHace: "Cierra la grilla del formulario de la pestaña sin guardar.", regla: REGLAS.configurarImpuestos },
      ],
    },
  ],
  estados: [
    { etiqueta: "Para guardar falta corregir", significado: "Faltan fechas, hay casillas repetidas o una fecha cae antes de terminar su período." },
    { etiqueta: "Avisos", significado: "Fechas más de dos meses después del período, que no crecen con el dígito, dos dígitos del mismo par con fechas distintas en el IVA anual o un documento de otro año. Se puede guardar, pero conviene revisarlas." },
  ],
  preguntas: [
    {
      pregunta: "¿Por qué el último período vence en enero?",
      respuesta: "Cada período se declara después de terminar: la retención de diciembre y el IVA de noviembre-diciembre o de septiembre-diciembre se presentan en enero del año que sigue.",
    },
    {
      pregunta: "¿Por qué el IVA anual del calendario de un año es del año anterior?",
      respuesta: "La declaración anual de IVA del Régimen Simple se presenta en febrero por el año gravable que terminó. El calendario de 2026 trae el vencimiento del año gravable 2025, y la DIAN lo publica con los dígitos del NIT de a dos (1-2, 3-4…).",
    },
  ],
  relacionadas: [{ label: "Mapeos DIAN", href: "/config/mapeos-dian", permiso: "impuestos:ver" }],
};

export const FICHA_RETENCION_LISTADO: FichaAyuda = {
  id: "impuestos.retencion",
  titulo: "Retención en la fuente",
  proposito:
    "Las revisiones de Retención en la fuente de los clientes: cada una revisa, acumulado a un corte, los formularios 350 (declaración) y 490 (pago) del año. El precierre suele ser a septiembre y el cierre a diciembre.",
  antesDeEmpezar: [
    "Se ven las revisiones de los clientes de tu cartera.",
    "Los formularios son del cliente y el año: el precierre y el cierre del mismo año comparten los de enero a septiembre.",
  ],
  etapas: [
    {
      titulo: "Empezar",
      acciones: [
        {
          nombre: "Nueva revisión",
          queHace:
            "Abre la revisión de un cliente para un año y un corte (precierre a septiembre, cierre a diciembre u otro mes). Retención en la fuente es siempre mensual: se espera un 350 por cada mes hasta el corte. Si la revisión ya existe, la abre.",
          regla: REGLAS.cargarImpuestos,
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "crearRevisionImpuesto" },
        },
      ],
    },
    {
      titulo: "Consultar",
      acciones: [
        { nombre: "Buscar por cliente, NIT o año", queHace: "Deja en la lista las revisiones que coinciden. El NIT se encuentra con o sin dígito de verificación.", regla: REGLAS.verImpuestos },
        { nombre: "Estado: Todos · En proceso · En firme", queHace: "Filtra las revisiones por su estado y muestra cuántas hay de cada uno.", regla: REGLAS.verImpuestos },
      ],
    },
  ],
  estados: [
    { etiqueta: "En proceso", significado: "La revisión se puede trabajar: importar, confirmar y registrar meses sin formulario." },
    { etiqueta: "En firme", significado: "La revisión está cerrada y no se puede cambiar." },
  ],
  relacionadas: [
    { label: "Mapeos DIAN", href: "/config/mapeos-dian", permiso: "impuestos:ver" },
    { label: "Calendario tributario", href: "/config/calendario-tributario", permiso: "impuestos:ver" },
    { label: "Parámetros de alertas", href: "/config/parametros", permiso: "parametros:ver" },
  ],
};

export const FICHA_RETENCION_REVISION: FichaAyuda = {
  id: "impuestos.retencion_revision",
  titulo: "Revisión de Retención en la fuente",
  proposito:
    "Los formularios 350 y 490 de un cliente y un año hasta el corte: se importan los PDF, la IA los lee y cada uno se revisa y confirma. La tabla dice, por período, qué 350 rige, si es una corrección y qué recibos 490 hay (confirmados o por confirmar); la columna Alertas reúne lo que hay que resolver en el mes (un recibo 490 que falta, el 350 original que falta, un 350 fuera de la cadena, un recibo de otro 350 o recibos 490 sin 350), con el detalle al pasar el mouse, y dice cuáles exigen marca y en qué pestaña; el cruce contable compara lo declarado con el balance del corte, la oportunidad mide las fechas contra el calendario DIAN y los pagos efectuados comparan lo declarado con los recibos. Al terminar, la revisión se cierra en firme.",
  antesDeEmpezar: [
    "Un formulario solo cuenta cuando está confirmado.",
    "Un período puede tener varios 350: una corrección (renglón 25 = 1) corrige al del renglón 26. Los valores salen de la última corrección y la oportunidad, del original.",
    "Cada 350 se paga con hasta tres recibos 490: concepto 61 (renta y autorretenciones, renglón 130), 62 (reteIVA, 134) y 63 (timbre, 135).",
  ],
  etapas: [
    {
      titulo: "Exportar",
      acciones: [
        {
          nombre: "Exportar a Excel",
          queHace: "Descarga la revisión en un libro con seis hojas: por meses, acumulado, los formularios cargados, el cruce contable con todos los terceros de cada cuenta y las marcas, la oportunidad y los pagos efectuados. En firme, los resultados son los de la copia congelada.",
          regla: REGLAS.verRevisionImpuestos,
          fuente: { archivo: "src/app/api/impuestos/revisiones/[id]/excel/route.ts", funcion: "GET" },
        },
      ],
    },
    {
      titulo: "Cerrar en firme",
      acciones: [
        {
          nombre: "Cerrar en firme",
          queHace:
            "Deja la revisión de solo lectura con una copia congelada de sus resultados y bloquea el saldo final y la homologación de las cuentas del cliente que entraron al cruce, en el balance del corte.",
          regla: REGLAS.cerrarConciliacion,
          condiciones: [
            "Cada período del corte tiene su 350 confirmado o la causal de que no hubo formulario.",
            "Ningún formulario de esos períodos está por confirmar.",
            "El cruce contable está disponible y cada diferencia desde el umbral tiene marca.",
            "Si el cruce resta el saldo inicial, la sección «Saldos restados: NITs con saldo inicial a enero» de Novedades tiene marca y el total no cambió desde que se marcó.",
            "Si llegó una corrección, su 350 original también está cargado: una marca no lo reemplaza.",
            "Cada mes con diferencia en el pago, con un recibo que paga un 350 de otro período o con recibos 490 sin 350 tiene marca.",
          ],
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "cerrarRevisionImpuesto" },
        },
        {
          nombre: "Desbloquear",
          queHace: "Vuelve a dejar la revisión en proceso y libera las cuentas bloqueadas. La justificación queda en la bitácora.",
          regla: REGLAS.desbloquearConciliacion,
          condiciones: ["La revisión está en firme.", "Justificación de al menos 10 caracteres."],
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "desbloquearRevisionImpuesto" },
        },
      ],
    },
    {
      titulo: "Administrar",
      acciones: [
        {
          nombre: "Eliminar revisión",
          queHace: "Elimina la revisión. Los formularios del año se conservan porque los usan las otras revisiones.",
          regla: REGLAS.eliminarImpuestos,
          condiciones: ["La revisión no está en firme."],
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "eliminarRevisionImpuesto" },
        },
      ],
    },
  ],
  pestanas: [
    {
      id: "formularios",
      titulo: "Formularios",
      proposito: "Importar los PDF, confirmar lo que leyó la IA y ver, por período, qué 350 rige, qué recibos hay y, en la columna Alertas, qué falta.",
      etapas: [
    {
      titulo: "Importar",
      acciones: [
        {
          nombre: "Importar formularios",
          queHace:
            "Lee con IA uno o varios PDF de la DIAN, guarda el original y deja cada formulario por confirmar. Los controles revisan NIT, año, período, número y los totales del formulario.",
          regla: REGLAS.cargarImpuestos,
          condiciones: [
            "PDF de hasta 10 MB.",
            "Se rechaza un formulario de otro cliente u otro año, uno ya cargado, uno al que no se le lee el número o el período, o uno de IVA (un 300, o un 490 de los conceptos 05, 57 o 58).",
            "La revisión no está en firme.",
          ],
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "importarFormularioDian" },
        },
      ],
    },
    {
      titulo: "Revisar y confirmar",
      acciones: [
        {
          nombre: "Confirmar formulario",
          queHace:
            "Confirma lo leído: fecha del sello (renglón 997), si es corrección y a cuál corrige, o el concepto y el 350 que paga el recibo, y los valores.",
          regla: REGLAS.cargarImpuestos,
          condiciones: ["Todos los controles en rojo están corregidos: los totales cuadran y el NIT, el año y el período son los de la revisión."],
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "confirmarFormularioDian" },
        },
        {
          nombre: "¿Qué revisa el sistema?",
          queHace: "Recuerda qué revisa el sistema en cada formulario para decir «Cuadrado» (con un check) o «N por corregir».",
          regla: REGLAS.verRevisionImpuestos,
        },
        {
          nombre: "Confirmar seleccionados",
          queHace:
            "Confirma de una vez los formularios marcados, tal como los leyó la IA, sin abrirlos uno por uno. «Seleccionar todos» marca los que se pueden confirmar y puedes desmarcar los que no quieras. Cada uno queda en la auditoría.",
          regla: REGLAS.cargarImpuestos,
          condiciones: ["Solo se pueden marcar los que dicen «Cuadrado»; los que dicen «por corregir» se corrigen en «Revisar»."],
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "confirmarFormulariosDian" },
        },
        {
          nombre: "Corregir un valor",
          queHace: "Cambia un importe que la IA leyó mal antes de confirmar. Queda constancia de los renglones corregidos a mano.",
          regla: REGLAS.editarImpuestos,
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "confirmarFormularioDian" },
        },
        {
          nombre: "Descartar (por confirmar)",
          queHace: "Saca un formulario por confirmar; el original se conserva.",
          regla: REGLAS.cargarImpuestos,
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "descartarFormularioDian" },
        },
        {
          nombre: "Descartar (confirmado)",
          queHace: "Saca un formulario ya confirmado: deja de contar en todas las revisiones del año.",
          regla: REGLAS.eliminarImpuestos,
          condiciones: ["Ninguna revisión de ese año está en firme."],
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "descartarFormularioDian" },
        },
      ],
    },
    {
      titulo: "Meses sin formulario",
      acciones: [
        {
          nombre: "No hubo formulario",
          queHace: "Confirma que en ese período no hubo 350 y registra la causal, que es obligatoria.",
          regla: REGLAS.cargarImpuestos,
          condiciones: ["El período no tiene un 350 confirmado."],
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "registrarPeriodoSinFormulario" },
        },
        {
          nombre: "Quitar causal",
          queHace: "Vuelve a esperar el 350 del período.",
          regla: REGLAS.cargarImpuestos,
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "quitarPeriodoSinFormulario" },
        },
      ],
    },
      ],
    },
    {
      id: "meses",
      titulo: "Por meses",
      proposito:
        "Cada renglón del 350 por mes, con persona jurídica y natural, y debajo los pagos de los recibos 490. Los valores son los del 350 vigente de cada mes (la última corrección) y los totales se recalculan con los renglones del formulario. El pago total (renglón 980) sale aparte, como informativo: no entra a los totales, al cruce ni a Pagos efectuados.",
      etapas: [
        {
          titulo: "Consultar",
          acciones: [
            { nombre: "Número del formulario", queHace: "Abre el 350 del mes con sus valores y el PDF.", regla: REGLAS.verRevisionImpuestos },
            { nombre: "Ocultar los renglones en cero", queHace: "Deja solo los conceptos con valor; los totales siempre se ven.", regla: REGLAS.verRevisionImpuestos },
            { nombre: "Pantalla completa", queHace: "Abre la tabla en toda la pantalla, con los títulos y los conceptos fijos al desplazarse. Se sale con el mismo botón o con Esc.", regla: REGLAS.verRevisionImpuestos },
          ],
        },
      ],
    },
    {
      id: "acumulado",
      titulo: "Acumulado",
      proposito: "La suma de los meses hasta el corte, por concepto, y lo pagado con los recibos 490. Avisa si faltan meses con 350.",
      etapas: [
        {
          titulo: "Consultar",
          acciones: [{ nombre: "Ocultar los renglones en cero", queHace: "Deja solo los conceptos con valor; los totales siempre se ven.", regla: REGLAS.verRevisionImpuestos }],
        },
      ],
    },
    {
      id: "cruce",
      titulo: "Cruce contable",
      proposito:
        "Lo declarado en los 350 vigentes hasta el corte contra el saldo final del balance del corte, por cuenta Russell de 2365 y 2367, con subtotales de renta (130), IVA (134) y timbre (135) y el total (136). Los conceptos que comparten cuenta van en una fila; la contabilidad va en positivo porque son pasivos. En las cuentas que lo indican en Mapeos DIAN, el saldo de la DIAN (los pagos registrados en la misma cuenta) se tacha y no suma. Si el balance empieza el 1 de enero, siempre se resta del saldo final el saldo inicial de los demás terceros, sin que nadie lo active: el tercero sin movimiento queda tachado y el que se movió suma solo lo del año. El detalle de lo restado y su marca, obligatoria para cerrar, están en Novedades. Abajo se informan, sin impedir el cierre, las cuentas homologadas a una cuenta Russell de 2365 o 2367 que no está en el mapeo y las cuentas del cliente en 2365 o 2367 homologadas fuera de retención, cuyo saldo no llega al cruce. Usa un balance cerrado y vigente que termine el último día del mes de corte, con detalle por tercero y con el prevalidador aprobado; si sirven varios, se escoge cuál.",
      etapas: [
        {
          titulo: "Escoger el balance",
          acciones: [
            {
              nombre: "Conciliar contra este",
              queHace:
                "Cuando sirven varios balances cerrados del corte, lista cada uno con su apertura, su período y su última modificación, y fija contra cuál se concilia la revisión. Coinciden en saldos finales, pero pueden traer homologaciones distintas. Mientras nadie escoge, se usa el de modificación más reciente.",
              regla: REGLAS.marcarImpuestos,
              condiciones: [
                "Solo aparece si sirve más de un balance.",
                "La elección queda en la auditoría.",
                "La revisión no está en firme: en firme manda el balance con que se cerró.",
              ],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "escogerBalanceImpuesto" },
            },
          ],
        },
        {
          titulo: "Consultar",
          acciones: [
            {
              nombre: "Desplegar una fila",
              queHace:
                "Muestra los conceptos declarados que forman la fila y las cuentas del cliente con su saldo; al desplegar una cuenta se ven sus terceros (NIT, nombre, saldo), con la DIAN tachada. Avisa los terceros con saldo inicial (cuando el balance empieza el 1 de enero) y los que tienen nombre de la DIAN pero no NIT, que no se restan solos.",
              regla: REGLAS.verRevisionImpuestos,
            },
            {
              nombre: "Ocultar los renglones en cero",
              queHace: "Deja solo las filas con valor, con marca o con aviso, y quita el grupo que se queda sin filas. El total siempre se ve.",
              regla: REGLAS.verRevisionImpuestos,
            },
            {
              nombre: "Pantalla completa",
              queHace: "Abre el cruce en toda la pantalla, con los títulos fijos al desplazarse. Se sale con el mismo botón o con Esc.",
              regla: REGLAS.verRevisionImpuestos,
            },
          ],
        },
        {
          titulo: "Documentar diferencias",
          acciones: [
            {
              nombre: "Marcar una diferencia",
              queHace:
                "Explica la diferencia de una fila con una nota y, si se quiere, la referencia del anexo. La marca toma un número del período y guarda la diferencia del momento: si la diferencia cambia, queda desactualizada y la fila vuelve a pedirla.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La fila tiene diferencia.", "La explicación tiene al menos 10 caracteres.", "La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "guardarMarcaImpuesto" },
            },
            {
              nombre: "Editar la marca",
              queHace: "Cambia la explicación o la referencia; la marca queda con la diferencia de hoy.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "guardarMarcaImpuesto" },
            },
            {
              nombre: "Quitar marca",
              queHace: "Retira la marca; si la diferencia llega al umbral, la fila vuelve a pedirla.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "quitarMarcaImpuesto" },
            },
          ],
        },
      ],
    },
    {
      id: "oportunidad",
      titulo: "Oportunidad",
      proposito:
        "Por período, la fecha límite del calendario tributario (año, período y último dígito del NIT sin el dígito de verificación) contra la presentación del 350 ORIGINAL (renglón 997 del primero de la cadena, no de la corrección) y el pago en dos columnas: concepto 61 (renta, renglón 130) y concepto 62 (reteIVA, renglón 134), cada una con el 997 del último recibo 490 de ese concepto. Igual o antes del vencimiento es «Oportuno»; después, «Extemporáneo» con los días de atraso. Si el 350 no declara ese valor, dice «Sin valor a pagar»; si lo declara y no hay recibo, «Sin pago». Un mes sin formulario, sin calendario o sin original lo dice así.",
      etapas: [
        {
          titulo: "Documentar",
          acciones: [
            {
              nombre: "Marcar un mes sin original",
              queHace: "Explica por qué falta el 350 original de un mes cuya corrección sí se cargó (sin él no se mide la presentación). La marca es opcional: para cerrar en firme hay que cargar el original.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La corrección del mes llegó sin su original.", "La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "guardarMarcaImpuesto" },
            },
          ],
        },
      ],
    },
    {
      id: "pagos",
      titulo: "Pagos efectuados",
      proposito:
        "Por período, el 350 vigente (136 retenciones, 137 sanciones, 138 total) contra los recibos 490 de su cadena (impuesto y sanción). Diferencia = Total pagado antes de intereses − Total (138): positiva si se pagó de más y negativa si se pagó de menos. Los intereses de mora van en su propia sección: no suman al total pagado ni se comparan. Se compara al peso. Al desplegar un período se ve qué falta por concepto: el 61 contra el 130, el 62 contra el 134 y el 63 contra el 135. La columna Alerta dice qué recibo 490 falta adjuntar (el 350 declara ese concepto y no hay recibo cargado), si un recibo paga un 350 de otro período o si hay recibos 490 en un mes sin 350: en ese caso se muestra lo pagado, todo es diferencia y exige marca, aunque se haya registrado que no hubo formulario.",
      etapas: [
        {
          titulo: "Documentar",
          acciones: [
            {
              nombre: "Marcar una diferencia en el pago",
              queHace: "Explica la diferencia del mes, por qué un recibo paga un 350 de otro período o por qué hay recibos 490 en un mes sin 350. La marca guarda la cifra: si la diferencia cambia, queda desactualizada. Es obligatoria para cerrar.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["El mes tiene diferencia en el pago, un recibo que paga un 350 de otro período o recibos 490 sin 350 (aunque se haya registrado que no hubo formulario).", "La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "guardarMarcaImpuesto" },
            },
            {
              nombre: "Quitar marca",
              queHace: "Retira la marca del mes; si sigue la diferencia, vuelve a pedirla.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "quitarMarcaImpuesto" },
            },
          ],
        },
      ],
    },
    {
      id: "novedades",
      titulo: "Novedades",
      proposito:
        "Lo que falta para cerrar en firme, agrupado por pestaña (formularios, cruce contable, pagos y saldos restados; la corrección sin su 350 original va en formularios) con un acceso a cada una, y los avisos que no impiden cerrar (por ejemplo, un 350 fuera de la cadena de correcciones). Si el cruce resta el saldo inicial, la sección «Saldos restados: NITs con saldo inicial a enero» muestra, NIT por NIT y cuenta por cuenta, lo que se le restó de su saldo final: NIT y nombre, cuenta del cliente, cuenta Russell, saldo inicial, saldo final y lo restado (su saldo inicial), con el total.",
      etapas: [
        {
          titulo: "Consultar",
          acciones: [{ nombre: "Ir", queHace: "Abre la pestaña donde se resuelve el pendiente.", regla: REGLAS.verRevisionImpuestos }],
        },
        {
          titulo: "Documentar",
          acciones: [
            {
              nombre: "Marcar los saldos restados",
              queHace: "Explica por qué se les resta a esos NITs el saldo inicial que traían a enero (por ejemplo, retenciones del año anterior pagadas en enero). Es una sola marca para todo lo restado y guarda el total: si cambia, queda desactualizada. Es obligatoria para cerrar.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["El cruce contable resta el saldo inicial.", "La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "guardarMarcaImpuesto" },
            },
          ],
        },
      ],
    },
  ],
  estados: [
    { etiqueta: "Completo", significado: "El período tiene su 350 confirmado y los recibos 490 de lo que declaró." },
    { etiqueta: "Por confirmar", significado: "Hay un formulario del período leído y sin confirmar." },
    { etiqueta: "Falta el 350", significado: "No hay un 350 confirmado ni una causal de mes sin formulario." },
    { etiqueta: "Sin formulario", significado: "Se registró que en el período no hubo 350, con su causal." },
    { etiqueta: "Falta el original", significado: "Llegó una corrección sin el formulario que corrige: sin el original no se mide la oportunidad de presentación y la revisión no se puede cerrar en firme." },
    { etiqueta: "Faltan pagos", significado: "El 350 declara un valor (renta, reteIVA o timbre) y su recibo 490 no está cargado." },
    { etiqueta: "En firme", significado: "La revisión se cerró: es de solo lectura, sus resultados salen de la copia congelada y las cuentas del cruce quedan bloqueadas en el balance del corte." },
  ],
  preguntas: [
    {
      pregunta: "¿Por qué casi todas las filas del cruce tienen una diferencia de unos cientos de pesos?",
      respuesta:
        "La DIAN redondea cada renglón del 350 a miles. Por debajo del umbral «Diferencias de impuestos» de Parámetros de alertas la diferencia es informativa; desde el umbral pide marca.",
    },
    {
      pregunta: "¿Por qué el cruce dice que no hay balance o que está bloqueado?",
      respuesta:
        "El cruce necesita un balance cerrado y vigente que termine el último día del mes de corte, cargado con detalle por tercero, y la aprobación vigente de su prevalidador. La pantalla dice cuál falta. Si el balance en uso está bloqueado y sirve otro, se puede escoger el otro.",
    },
    {
      pregunta: "¿Por qué la oportunidad dice «Sin calendario»?",
      respuesta: "Falta el calendario tributario del año en Parametrización › Calendario tributario.",
    },
    {
      pregunta: "¿Una corrección importada después cambia una revisión en firme?",
      respuesta: "No. La revisión en firme muestra la copia congelada del cierre. Para que tome la corrección, el senior o el gerente la desbloquea y se vuelve a cerrar.",
    },
    {
      pregunta: "¿Por qué un recibo dice que paga un formulario de otro período?",
      respuesta: "Su renglón 29 apunta a un 350 que no es de ese período ni de su cadena de correcciones. Revisa el recibo o el 350 del período.",
    },
  ],
  relacionadas: [
    { label: "Retención en la fuente", href: "/impuestos/retencion", permiso: "impuestos:ver" },
    { label: "Mapeos DIAN", href: "/config/mapeos-dian", permiso: "impuestos:ver" },
    { label: "Calendario tributario", href: "/config/calendario-tributario", permiso: "impuestos:ver" },
    { label: "Parámetros de alertas", href: "/config/parametros", permiso: "parametros:ver" },
  ],
};

export const FICHA_IVA_LISTADO: FichaAyuda = {
  id: "impuestos.iva",
  titulo: "IVA",
  proposito:
    "Las revisiones de IVA de los clientes: cada una revisa, acumulado a un corte, los formularios 300 (declaración) y 490 (pago) del año. El precorte suele ser a agosto y el cierre a diciembre.",
  antesDeEmpezar: [
    "Se ven las revisiones de los clientes de tu cartera.",
    "La periodicidad (bimestral, cuatrimestral o anual) es la de la ficha del cliente y es la misma todo el año.",
    "Los formularios son del cliente y el año: el precorte y el cierre del mismo año comparten los de enero a agosto.",
  ],
  etapas: [
    {
      titulo: "Empezar",
      acciones: [
        {
          nombre: "Nueva revisión",
          queHace:
            "Abre la revisión de un cliente para un año y un corte. El corte tiene que cerrar un período de la periodicidad del cliente: bimestral, febrero, abril, junio, agosto, octubre o diciembre; cuatrimestral, abril, agosto o diciembre; anual, diciembre. Si el cliente no tiene periodicidad de IVA en su ficha, la pide y la guarda allí. Si la revisión ya existe, la abre.",
          regla: REGLAS.cargarImpuestos,
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "crearRevisionImpuesto" },
        },
      ],
    },
    {
      titulo: "Consultar",
      acciones: [
        { nombre: "Buscar por cliente, NIT o año", queHace: "Deja en la lista las revisiones que coinciden. El NIT se encuentra con o sin dígito de verificación.", regla: REGLAS.verImpuestos },
        { nombre: "Estado: Todos · En proceso · En firme", queHace: "Filtra las revisiones por su estado y muestra cuántas hay de cada uno.", regla: REGLAS.verImpuestos },
      ],
    },
  ],
  estados: [
    { etiqueta: "En proceso", significado: "La revisión se puede trabajar: importar, confirmar y registrar períodos sin formulario." },
    { etiqueta: "En firme", significado: "La revisión está cerrada y no se puede cambiar." },
  ],
  relacionadas: [
    { label: "Mapeos DIAN", href: "/config/mapeos-dian", permiso: "impuestos:ver" },
    { label: "Calendario tributario", href: "/config/calendario-tributario", permiso: "impuestos:ver" },
  ],
};

export const FICHA_IVA_REVISION: FichaAyuda = {
  id: "impuestos.iva_revision",
  titulo: "Revisión de IVA",
  proposito:
    "Los formularios 300 y 490 de un cliente y un año hasta el corte: se importan los PDF, la IA los lee y cada uno se revisa y confirma. La tabla dice, por período (bimestre, cuatrimestre o año), qué 300 rige, si es una corrección y qué recibos 490 hay; la columna Alertas reúne lo que hay que resolver en el período. El cruce contable compara lo declarado con el balance del corte, la oportunidad mide las fechas contra el calendario DIAN de la periodicidad y los pagos efectuados comparan lo declarado con los recibos. Al terminar, la revisión se cierra en firme.",
  antesDeEmpezar: [
    "Un formulario solo cuenta cuando está confirmado.",
    "Un período puede tener varios 300: una corrección (renglón 25 = 1) corrige al del renglón 26. Los valores salen de la última corrección y la oportunidad, del original.",
    "Si el total saldo a pagar (renglón 88) es mayor que cero, se espera un recibo 490 del concepto de la periodicidad: 05 bimestral, 57 cuatrimestral o 58 anual. Un período con saldo a favor y el 88 en cero no necesita recibo.",
    "Las compras (renglones 44 a 57) no se guardan ni se concilian.",
  ],
  etapas: [
    {
      titulo: "Exportar",
      acciones: [
        {
          nombre: "Exportar a Excel",
          queHace: "Descarga la revisión en un libro con la vista por períodos, el acumulado (salvo con periodicidad anual, donde sería igual), los formularios cargados, el cruce contable con todos los terceros de cada cuenta y las marcas, la oportunidad y los pagos efectuados. En firme, los resultados son los de la copia congelada.",
          regla: REGLAS.verRevisionImpuestos,
          fuente: { archivo: "src/app/api/impuestos/revisiones/[id]/excel/route.ts", funcion: "GET" },
        },
      ],
    },
    {
      titulo: "Cerrar en firme",
      acciones: [
        {
          nombre: "Cerrar en firme",
          queHace:
            "Deja la revisión de solo lectura con una copia congelada de sus resultados y bloquea el saldo final y la homologación de las cuentas del cliente que entraron al cruce, en el balance del corte: las de IVA, la de retención de IVA y las de ingresos. Las cuentas de ingresos pueden quedar bloqueadas también por el cierre del módulo de Ingresos.",
          regla: REGLAS.cerrarConciliacion,
          condiciones: [
            "Cada período del corte tiene su 300 confirmado o la causal de que no hubo formulario.",
            "Ningún formulario de esos períodos está por confirmar.",
            "El cruce contable está disponible y cada diferencia desde el umbral tiene marca.",
            "Si el cruce resta el saldo inicial, la sección «Saldos restados: NITs con saldo inicial a enero» de Novedades tiene marca y el total no cambió desde que se marcó.",
            "Si llegó una corrección, su 300 original también está cargado: una marca no lo reemplaza.",
            "Cada período con diferencia en el pago, con un recibo que paga un 300 de otro período o con recibos 490 sin 300 tiene marca.",
          ],
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "cerrarRevisionImpuesto" },
        },
        {
          nombre: "Desbloquear",
          queHace: "Vuelve a dejar la revisión en proceso y libera las cuentas bloqueadas. La justificación queda en la bitácora.",
          regla: REGLAS.desbloquearConciliacion,
          condiciones: ["La revisión está en firme.", "Justificación de al menos 10 caracteres."],
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "desbloquearRevisionImpuesto" },
        },
      ],
    },
    {
      titulo: "Administrar",
      acciones: [
        {
          nombre: "Eliminar revisión",
          queHace: "Elimina la revisión. Los formularios del año se conservan porque los usan las otras revisiones.",
          regla: REGLAS.eliminarImpuestos,
          condiciones: ["La revisión no está en firme."],
          fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "eliminarRevisionImpuesto" },
        },
      ],
    },
  ],
  pestanas: [
    {
      id: "formularios",
      titulo: "Formularios",
      proposito: "Importar los PDF, confirmar lo que leyó la IA y ver, por período, qué 300 rige, qué recibos hay y, en la columna Alertas, qué falta.",
      etapas: [
        {
          titulo: "Importar",
          acciones: [
            {
              nombre: "Importar formularios",
              queHace:
                "Lee con IA uno o varios PDF de la DIAN, guarda el original y deja cada formulario por confirmar. Los controles revisan NIT, año, período, periodicidad, número y los totales del formulario.",
              regla: REGLAS.cargarImpuestos,
              condiciones: [
                "PDF de hasta 10 MB.",
                "Se rechaza un formulario de otro cliente u otro año, uno ya cargado, uno al que no se le lee el número o el período, o uno de Retención en la fuente (un 350, o un 490 de los conceptos 61, 62 o 63).",
                "La revisión no está en firme.",
              ],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "importarFormularioDian" },
            },
          ],
        },
        {
          titulo: "Revisar y confirmar",
          acciones: [
            {
              nombre: "Confirmar formulario",
              queHace:
                "Confirma lo leído: fecha del sello (renglón 997), si es corrección y a cuál corrige, o el concepto y el 300 que paga el recibo, y los valores. En el 300 se ve también la periodicidad marcada en la casilla 24.",
              regla: REGLAS.cargarImpuestos,
              condiciones: [
                "Todos los controles en rojo están corregidos: los totales cuadran (82, 83, 86, 88 y 89 van en cero si dan negativo) y el NIT, el año, el período y la periodicidad son los de la revisión.",
                "Si 90 + 91 + 92 no da el 89, solo se avisa.",
              ],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "confirmarFormularioDian" },
            },
            {
              nombre: "¿Qué revisa el sistema?",
              queHace: "Recuerda qué revisa el sistema en el 300 y en el 490 para decir «Cuadrado» (con un check) o «N por corregir».",
              regla: REGLAS.verRevisionImpuestos,
            },
            {
              nombre: "Confirmar seleccionados",
              queHace: "Confirma de una vez los formularios marcados, tal como los leyó la IA, sin abrirlos uno por uno. Cada uno queda en la auditoría.",
              regla: REGLAS.cargarImpuestos,
              condiciones: ["Solo se pueden marcar los que dicen «Cuadrado»; los que dicen «por corregir» se corrigen en «Revisar»."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "confirmarFormulariosDian" },
            },
            {
              nombre: "Corregir un valor",
              queHace: "Cambia un importe que la IA leyó mal antes de confirmar. Queda constancia de los renglones corregidos a mano.",
              regla: REGLAS.editarImpuestos,
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "confirmarFormularioDian" },
            },
            {
              nombre: "Descartar (por confirmar)",
              queHace: "Saca un formulario por confirmar; el original se conserva.",
              regla: REGLAS.cargarImpuestos,
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "descartarFormularioDian" },
            },
            {
              nombre: "Descartar (confirmado)",
              queHace: "Saca un formulario ya confirmado: deja de contar en todas las revisiones de IVA del año.",
              regla: REGLAS.eliminarImpuestos,
              condiciones: ["Ninguna revisión de IVA de ese año está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "descartarFormularioDian" },
            },
          ],
        },
        {
          titulo: "Períodos sin formulario",
          acciones: [
            {
              nombre: "No hubo formulario",
              queHace: "Confirma que en ese período no hubo 300 y registra la causal, que es obligatoria.",
              regla: REGLAS.cargarImpuestos,
              condiciones: ["El período no tiene un 300 confirmado."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "registrarPeriodoSinFormulario" },
            },
            {
              nombre: "Quitar causal",
              queHace: "Vuelve a esperar el 300 del período.",
              regla: REGLAS.cargarImpuestos,
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "quitarPeriodoSinFormulario" },
            },
          ],
        },
      ],
    },
    {
      id: "meses",
      titulo: "Por períodos",
      proposito:
        "Cada renglón guardado del 300 por período (bimestre, cuatrimestre o año): ingresos, impuesto generado, descontable, liquidación privada y control de saldos, y debajo los pagos de los recibos 490. Los valores son los del 300 vigente de cada período (la última corrección) y los totales se recalculan con los renglones del formulario. El pago total (980) sale aparte, como informativo.",
      etapas: [
        {
          titulo: "Consultar",
          acciones: [
            { nombre: "Número del formulario", queHace: "Abre el 300 del período con sus valores y el PDF.", regla: REGLAS.verRevisionImpuestos },
            { nombre: "Ocultar los renglones en cero", queHace: "Deja solo los renglones con valor; los totales siempre se ven.", regla: REGLAS.verRevisionImpuestos },
            { nombre: "Pantalla completa", queHace: "Abre la tabla en toda la pantalla, con los títulos y los renglones fijos al desplazarse. Se sale con el mismo botón o con Esc.", regla: REGLAS.verRevisionImpuestos },
          ],
        },
      ],
    },
    {
      id: "acumulado",
      titulo: "Acumulado",
      proposito: "La suma de los períodos hasta el corte, renglón por renglón, y lo pagado con los recibos 490. Avisa si faltan períodos con 300. Con periodicidad anual no aparece: sería igual a la vista por períodos.",
      etapas: [
        {
          titulo: "Consultar",
          acciones: [{ nombre: "Ocultar los renglones en cero", queHace: "Deja solo los renglones con valor; los totales siempre se ven.", regla: REGLAS.verRevisionImpuestos }],
        },
      ],
    },
    {
      id: "cruce",
      titulo: "Cruce contable",
      proposito:
        "Lo declarado en los 300 vigentes hasta el corte contra el saldo final del balance del corte, por cuenta Russell, en las secciones del levantamiento: impuesto generado (subtotal 67), impuesto descontable (81), retención de IVA (85) e ingresos al final (43). No hay total general. Los renglones que van a la misma cuenta se reúnen en una fila, y una fila puede tener varias cuentas, como las once de las operaciones no gravadas (40). La contabilidad lleva el signo de la naturaleza de la cuenta en el plan Russell, así que todo queda en positivo; las devoluciones en ventas (42) y el ajuste de descontables (80) restan en el subtotal de su sección. Las cuentas de IVA y la de retención de IVA se sustentan por tercero: el saldo de la DIAN (los pagos registrados en la misma cuenta) se tacha y no suma, y si el balance empieza el 1 de enero se resta del saldo final el saldo inicial de los demás terceros. Los ingresos se toman por el saldo de la cuenta, sin terceros. Abajo se informan, sin impedir el cierre, las cuentas homologadas a una cuenta de 2408 o a la 135517 que no está en el mapeo y las cuentas del cliente en 2408 homologadas fuera de IVA. Usa un balance cerrado y vigente que termine el último día del mes de corte, con detalle por tercero y con el prevalidador aprobado; si sirven varios, se escoge cuál.",
      etapas: [
        {
          titulo: "Escoger el balance",
          acciones: [
            {
              nombre: "Conciliar contra este",
              queHace:
                "Cuando sirven varios balances cerrados del corte, lista cada uno con su apertura, su período y su última modificación, y fija contra cuál se concilia la revisión. Mientras nadie escoge, se usa el de modificación más reciente.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["Solo aparece si sirve más de un balance.", "La elección queda en la auditoría.", "La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "escogerBalanceImpuesto" },
            },
          ],
        },
        {
          titulo: "Consultar",
          acciones: [
            {
              nombre: "Desplegar una fila",
              queHace:
                "Muestra los renglones declarados que forman la fila y las cuentas del cliente con su saldo. En las cuentas de IVA y de retención de IVA, al desplegar una cuenta se ven sus terceros (NIT, nombre, saldo), con la DIAN tachada; las de ingresos dicen «saldo de la cuenta».",
              regla: REGLAS.verRevisionImpuestos,
            },
            {
              nombre: "Ocultar los renglones en cero",
              queHace: "Deja solo las filas con valor, con marca o con aviso, y quita la sección que se queda sin filas.",
              regla: REGLAS.verRevisionImpuestos,
            },
            {
              nombre: "Pantalla completa",
              queHace: "Abre el cruce en toda la pantalla, con los títulos fijos al desplazarse. Se sale con el mismo botón o con Esc.",
              regla: REGLAS.verRevisionImpuestos,
            },
          ],
        },
        {
          titulo: "Documentar diferencias",
          acciones: [
            {
              nombre: "Marcar una diferencia",
              queHace:
                "Explica la diferencia de una fila con una nota y, si se quiere, la referencia del anexo. La marca toma un número del período y guarda la diferencia del momento: si la diferencia cambia, queda desactualizada y la fila vuelve a pedirla. Desde el umbral «Diferencias de impuestos» la marca es obligatoria.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La fila tiene diferencia.", "La explicación tiene al menos 10 caracteres.", "La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "guardarMarcaImpuesto" },
            },
            {
              nombre: "Editar la marca",
              queHace: "Cambia la explicación o la referencia; la marca queda con la diferencia de hoy.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "guardarMarcaImpuesto" },
            },
            {
              nombre: "Quitar marca",
              queHace: "Retira la marca; si la diferencia llega al umbral, la fila vuelve a pedirla.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "quitarMarcaImpuesto" },
            },
          ],
        },
      ],
    },
    {
      id: "oportunidad",
      titulo: "Oportunidad",
      proposito:
        "Por período, la fecha límite del calendario tributario de la periodicidad del cliente (IVA bimestral o cuatrimestral del año; el de la declaración anual es el del año siguiente, que la DIAN agrupa por pares de dígitos), según el período y el último dígito del NIT sin el dígito de verificación, contra la presentación del 300 ORIGINAL (renglón 997 del primero de la cadena, no de la corrección) y el pago: el 997 del último recibo 490 del concepto de la periodicidad (05, 57 o 58). Igual o antes del vencimiento es «Oportuno»; después, «Extemporáneo» con los días de atraso. Si el total saldo a pagar (88) es cero, dice «Sin valor a pagar»; si es mayor y no hay recibo, «Sin pago». Un período sin formulario, sin calendario o sin original lo dice así.",
      etapas: [
        {
          titulo: "Documentar",
          acciones: [
            {
              nombre: "Marcar un período sin original",
              queHace: "Explica por qué falta el 300 original de un período cuya corrección sí se cargó (sin él no se mide la presentación). La marca es opcional: para cerrar en firme hay que cargar el original.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La corrección del período llegó sin su original.", "La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "guardarMarcaImpuesto" },
            },
          ],
        },
      ],
    },
    {
      id: "pagos",
      titulo: "Pagos efectuados",
      proposito:
        "Por período, el 300 vigente (86 saldo a pagar por impuesto, 87 sanciones, 88 total saldo a pagar) contra los recibos 490 de su cadena: el impuesto pagado (36) contra el 86 y la sanción pagada (34) contra el 87. Diferencia = Total pagado antes de intereses − Total saldo a pagar (88): positiva si se pagó de más y negativa si se pagó de menos; si no cuadra, el estado es «Diferencia en el pago». Los intereses de mora (35) van en su propia sección: no suman al total pagado ni se comparan. Se compara al peso. La columna Alerta dice qué recibo 490 falta adjuntar, si un recibo paga un 300 de otro período o si hay recibos 490 en un período sin 300: en ese caso se muestra lo pagado, todo es diferencia y exige marca.",
      etapas: [
        {
          titulo: "Documentar",
          acciones: [
            {
              nombre: "Marcar una diferencia en el pago",
              queHace: "Explica la diferencia del período, por qué un recibo paga un 300 de otro período o por qué hay recibos 490 en un período sin 300. La marca guarda la cifra: si la diferencia cambia, queda desactualizada. Es obligatoria para cerrar.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["El período tiene diferencia en el pago, un recibo que paga un 300 de otro período o recibos 490 sin 300.", "La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "guardarMarcaImpuesto" },
            },
            {
              nombre: "Quitar marca",
              queHace: "Retira la marca del período; si sigue la diferencia, vuelve a pedirla.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "quitarMarcaImpuesto" },
            },
          ],
        },
      ],
    },
    {
      id: "novedades",
      titulo: "Novedades",
      proposito:
        "Lo que falta para cerrar en firme, agrupado por pestaña (formularios, cruce contable, pagos y saldos restados; la corrección sin su 300 original va en formularios) con un acceso a cada una, y los avisos que no impiden cerrar (por ejemplo, un 300 fuera de la cadena de correcciones). Si el cruce resta el saldo inicial de las cuentas de IVA, la sección «Saldos restados: NITs con saldo inicial a enero» muestra, NIT por NIT y cuenta por cuenta, lo que se le restó de su saldo final, con el total.",
      etapas: [
        {
          titulo: "Consultar",
          acciones: [{ nombre: "Ir", queHace: "Abre la pestaña donde se resuelve el pendiente.", regla: REGLAS.verRevisionImpuestos }],
        },
        {
          titulo: "Documentar",
          acciones: [
            {
              nombre: "Marcar los saldos restados",
              queHace: "Explica por qué se les resta a esos NITs el saldo inicial que traían a enero (por ejemplo, el IVA del último período del año anterior, declarado y pagado en enero). Es una sola marca para todo lo restado y guarda el total: si cambia, queda desactualizada. Es obligatoria para cerrar.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["El cruce contable resta el saldo inicial.", "La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-revisiones.ts`, funcion: "guardarMarcaImpuesto" },
            },
          ],
        },
      ],
    },
  ],
  estados: [
    { etiqueta: "Completo", significado: "El período tiene su 300 confirmado y, si el 88 es mayor que cero, su recibo 490." },
    { etiqueta: "Por confirmar", significado: "Hay formularios del período leídos y sin confirmar." },
    { etiqueta: "Falta el 300", significado: "No se ha cargado la declaración del período ni registrado que no hubo." },
    { etiqueta: "Sin formulario", significado: "Se registró que en el período no hubo 300, con su causal." },
    { etiqueta: "Falta el original", significado: "Llegó una corrección sin el 300 que corrige." },
    { etiqueta: "Faltan pagos", significado: "El 300 tiene total saldo a pagar (88) y no hay recibo 490." },
    { etiqueta: "En firme", significado: "La revisión se cerró: es de solo lectura, sus resultados salen de la copia congelada y las cuentas del cruce quedan bloqueadas en el balance del corte." },
  ],
  preguntas: [
    {
      pregunta: "¿Por qué la oportunidad de la declaración anual dice «Sin calendario»?",
      respuesta: "El IVA anual vence en febrero del año siguiente: la oportunidad usa el calendario tributario de ese año (sección IVA anual). Impórtalo en Parametrización › Calendario tributario.",
    },
    {
      pregunta: "¿Por qué un período con saldo a favor no pide recibo 490?",
      respuesta: "Solo se espera pago cuando el total saldo a pagar (renglón 88) es mayor que cero. Con saldo a favor (89) el 88 queda en cero.",
    },
    {
      pregunta: "¿Una corrección importada después cambia una revisión en firme?",
      respuesta: "No. La revisión en firme muestra la copia congelada del cierre. Para que tome la corrección, el senior o el gerente la desbloquea y se vuelve a cerrar.",
    },
  ],
  relacionadas: [
    { label: "IVA", href: "/impuestos/iva", permiso: "impuestos:ver" },
    { label: "Mapeos DIAN", href: "/config/mapeos-dian", permiso: "impuestos:ver" },
    { label: "Calendario tributario", href: "/config/calendario-tributario", permiso: "impuestos:ver" },
  ],
};
