// Ayuda en pantalla — fichas de Impuestos · DIAN (Mapeos DIAN y Calendario tributario).
// Describen la pantalla tal como funciona hoy.

import { REGLAS } from "../reglas";
import type { FichaAyuda } from "../tipos";

const ACCIONES = "src/app/actions";

export const FICHA_MAPEOS_DIAN: FichaAyuda = {
  id: "catalogo.mapeos_dian",
  titulo: "Mapeos DIAN",
  proposito:
    "Contra qué cuenta Russell se concilia cada concepto del formulario 350 (Retención en la fuente) y qué terceros son la DIAN. Vale para todos los clientes. Todos la consultan; la editan quienes configuran Impuestos.",
  antesDeEmpezar: [
    "Cada concepto suma sus dos columnas del formulario, persona jurídica y natural (Honorarios = 42 + 95), y se compara con el saldo final de su cuenta Russell en el balance por terceros.",
    "Las bases sujetas a retención no se concilian y no aparecen aquí.",
    "Una cuenta Russell solo se puede asignar si existe en el plan Russell; las que faltan se crean en Plan Estándar Russell.",
  ],
  etapas: [
    {
      titulo: "Conceptos del formulario 350",
      acciones: [
        {
          nombre: "Guardar",
          queHace:
            "Cambia la cuenta Russell de un concepto. Vacía, el concepto queda sin cuenta: lo declarado no tiene contra qué cruzar.",
          regla: REGLAS.configurarImpuestos,
          condiciones: ["La cuenta tiene 6 dígitos y existe en el plan Russell.", "Las sanciones no llevan cuenta: no entran al cruce contable."],
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
            "Decide si en esa cuenta Russell el saldo de los terceros DIAN se muestra tachado y se resta del saldo que se concilia (los pagos a la DIAN registrados en las mismas cuentas).",
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
    { etiqueta: "Resta", significado: "El renglón se resta en su total (retenciones practicadas en exceso o indebidas)." },
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
    "Las fechas límite de la DIAN para presentar y pagar la Retención en la fuente, por período y último dígito del NIT. Con ellas se mide si cada formulario se presentó y se pagó a tiempo. Se carga una vez por año.",
  antesDeEmpezar: [
    "La fecha depende del último dígito del NIT sin el dígito de verificación: en un NIT de 9 dígitos, el noveno.",
    "Sin el calendario de un año, la oportunidad de ese año no se puede calcular.",
  ],
  etapas: [
    {
      titulo: "Cargar",
      acciones: [
        {
          nombre: "Importar desde el PDF de la DIAN",
          queHace:
            "La IA lee la sección de Retención en la fuente del calendario de la DIAN y propone la grilla del año. No se guarda nada hasta revisarla y guardarla.",
          regla: REGLAS.configurarImpuestos,
          condiciones: ["Un PDF de hasta 15 MB.", "La lectura con IA tiene que estar disponible."],
          fuente: { archivo: `${ACCIONES}/impuestos-configuracion.ts`, funcion: "leerCalendarioPdf" },
        },
        {
          nombre: "Escribir a mano · Editar a mano",
          queHace: "Abre la grilla para escribir o corregir cada fecha.",
          regla: REGLAS.configurarImpuestos,
        },
      ],
    },
    {
      titulo: "Revisar y guardar",
      acciones: [
        {
          nombre: "Guardar calendario · Reemplazar calendario",
          queHace:
            "Guarda la grilla del año. Si ya había una, la reemplaza completa. Las fechas que cambian frente a lo guardado se resaltan.",
          regla: REGLAS.configurarImpuestos,
          condiciones: [
            "Están las diez fechas de cada uno de los doce períodos.",
            "Cada fecha es posterior al cierre de su período.",
          ],
          fuente: { archivo: `${ACCIONES}/impuestos-configuracion.ts`, funcion: "guardarCalendarioDian" },
        },
        { nombre: "Descartar", queHace: "Cierra la grilla sin guardar.", regla: REGLAS.configurarImpuestos },
      ],
    },
  ],
  estados: [
    { etiqueta: "Para guardar falta corregir", significado: "Faltan fechas, hay casillas repetidas o una fecha cae antes de terminar su período." },
    { etiqueta: "Avisos", significado: "Fechas más de dos meses después del período, que no crecen con el dígito o un documento de otro año. Se puede guardar, pero conviene revisarlas." },
  ],
  preguntas: [
    {
      pregunta: "¿Por qué diciembre vence en enero?",
      respuesta: "Cada período se declara al mes siguiente: la retención de diciembre se presenta en enero del año que sigue.",
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
            "Abre la revisión de un cliente para un año y un corte (precierre a septiembre, cierre a diciembre u otro mes) y confirma su periodicidad, que define qué formularios se esperan. Si la revisión ya existe, la abre.",
          regla: REGLAS.cargarImpuestos,
          condiciones: ["Si cambias la periodicidad, queda también en la ficha del cliente cuando puedes editarla."],
          fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "crearRevisionRetencion" },
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
    "Los formularios 350 y 490 de un cliente y un año hasta el corte: se importan los PDF, la IA los lee y cada uno se revisa y confirma. La tabla dice, por período, qué 350 rige, si es una corrección y qué pagos faltan; el cruce contable compara lo declarado con el balance del corte, la oportunidad mide las fechas contra el calendario DIAN y los pagos efectuados comparan lo declarado con los recibos. Al terminar, la revisión se cierra en firme.",
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
            "Cada mes con diferencia en el pago y cada mes cuya corrección llegó sin el original tiene marca.",
          ],
          fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "cerrarRevisionRetencion" },
        },
        {
          nombre: "Desbloquear",
          queHace: "Vuelve a dejar la revisión en proceso y libera las cuentas bloqueadas. La justificación queda en la bitácora.",
          regla: REGLAS.desbloquearConciliacion,
          condiciones: ["La revisión está en firme.", "Justificación de al menos 10 caracteres."],
          fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "desbloquearRevisionRetencion" },
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
          fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "eliminarRevisionRetencion" },
        },
      ],
    },
  ],
  pestanas: [
    {
      id: "formularios",
      titulo: "Formularios",
      proposito: "Importar los PDF, confirmar lo que leyó la IA y ver, por período, qué 350 rige y qué pagos faltan.",
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
            "Se rechaza un formulario de otro cliente u otro año, uno ya cargado o uno al que no se le lee el número o el período.",
            "La revisión no está en firme.",
          ],
          fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "importarFormularioDian" },
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
          fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "confirmarFormularioDian" },
        },
        {
          nombre: "Corregir un valor",
          queHace: "Cambia un importe que la IA leyó mal antes de confirmar. Queda constancia de los renglones corregidos a mano.",
          regla: REGLAS.editarImpuestos,
          fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "confirmarFormularioDian" },
        },
        {
          nombre: "Descartar (por confirmar)",
          queHace: "Saca un formulario por confirmar; el original se conserva.",
          regla: REGLAS.cargarImpuestos,
          fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "descartarFormularioDian" },
        },
        {
          nombre: "Descartar (confirmado)",
          queHace: "Saca un formulario ya confirmado: deja de contar en todas las revisiones del año.",
          regla: REGLAS.eliminarImpuestos,
          condiciones: ["Ninguna revisión de ese año está en firme."],
          fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "descartarFormularioDian" },
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
          fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "registrarPeriodoSinFormulario" },
        },
        {
          nombre: "Quitar causal",
          queHace: "Vuelve a esperar el 350 del período.",
          regla: REGLAS.cargarImpuestos,
          fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "quitarPeriodoSinFormulario" },
        },
      ],
    },
      ],
    },
    {
      id: "meses",
      titulo: "Por meses",
      proposito:
        "Cada renglón del 350 por mes, con persona jurídica y natural, y debajo los pagos de los recibos 490. Los valores son los del 350 vigente de cada mes (la última corrección) y los totales se recalculan con los renglones del formulario.",
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
        "Lo declarado en los 350 vigentes hasta el corte contra el saldo final del balance del corte, por cuenta Russell de 2365 y 2367, con subtotales de renta (130), IVA (134) y timbre (135) y el total (136). Los conceptos que comparten cuenta van en una fila; la contabilidad va en positivo porque son pasivos. En las cuentas que lo indican en Mapeos DIAN, el saldo de la DIAN (los pagos registrados en la misma cuenta) se tacha y no suma. Si el balance empieza el 1 de enero, también se puede restar el saldo inicial de los demás terceros. Usa el balance cerrado y vigente que termina en el mes de corte, con detalle por tercero y con el prevalidador aprobado.",
      etapas: [
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
          titulo: "Restar el saldo inicial",
          acciones: [
            {
              nombre: "Restar terceros con saldo inicial",
              queHace:
                "Quita de la contabilidad el saldo inicial de los terceros distintos de la DIAN, en toda la revisión, y actualiza las diferencias. El tercero sin movimiento queda tachado; el que tuvo movimiento sigue sumando solo lo del año, con su saldo inicial tachado. Antes de aplicar muestra cómo queda el total. Las marcas cuya diferencia cambie quedan desactualizadas y la fila vuelve a pedirlas.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["El balance del corte empieza el 1 de enero del año de la revisión; con otro balance no se ofrece y no resta nada.", "Algún tercero distinto de la DIAN trae saldo inicial.", "La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "cambiarRestaSaldoInicial" },
            },
            {
              nombre: "Dejar de restar",
              queHace: "Vuelve a sumar el saldo final completo de esos terceros y actualiza las diferencias.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "cambiarRestaSaldoInicial" },
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
              fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "guardarMarcaRetencion" },
            },
            {
              nombre: "Editar la marca",
              queHace: "Cambia la explicación o la referencia; la marca queda con la diferencia de hoy.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "guardarMarcaRetencion" },
            },
            {
              nombre: "Quitar marca",
              queHace: "Retira la marca; si la diferencia llega al umbral, la fila vuelve a pedirla.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "quitarMarcaRetencion" },
            },
          ],
        },
      ],
    },
    {
      id: "oportunidad",
      titulo: "Oportunidad",
      proposito:
        "Por período, la fecha límite del calendario tributario (año, período y último dígito del NIT sin el dígito de verificación) contra la presentación del 350 ORIGINAL (renglón 997 del primero de la cadena, no de la corrección) y el pago (997 del último recibo 490 del concepto 61; sin 61, el primer recibo que haya). Igual o antes del vencimiento es «Oportuno»; después, «Extemporáneo» con los días de atraso. Un mes sin formulario, sin calendario o sin original lo dice así.",
      etapas: [
        {
          titulo: "Documentar",
          acciones: [
            {
              nombre: "Marcar un mes sin original",
              queHace: "Explica por qué falta el 350 original de un mes cuya corrección sí se cargó (sin él no se mide la presentación). La marca es obligatoria para cerrar.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La corrección del mes llegó sin su original.", "La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "guardarMarcaRetencion" },
            },
          ],
        },
      ],
    },
    {
      id: "pagos",
      titulo: "Pagos efectuados",
      proposito:
        "Por período, el 350 vigente (136 retenciones, 137 sanciones, 138 total) contra los recibos 490 de su cadena (impuesto y sanción). Diferencia = Total (138) − Total pagado. Los intereses de mora van en su propia sección: no suman al total pagado ni se comparan. Se compara al peso. Al desplegar un período se ve qué falta por concepto: 130 contra el 61, 134 contra el 62 y 135 contra el 63. La columna Alerta dice qué recibo 490 falta adjuntar: el 350 declara ese concepto y no hay recibo cargado.",
      etapas: [
        {
          titulo: "Documentar",
          acciones: [
            {
              nombre: "Marcar una diferencia en el pago",
              queHace: "Explica la diferencia del mes. La marca guarda la cifra: si la diferencia cambia, queda desactualizada. Es obligatoria para cerrar.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["El mes tiene diferencia en el pago.", "La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "guardarMarcaRetencion" },
            },
            {
              nombre: "Quitar marca",
              queHace: "Retira la marca del mes; si sigue la diferencia, vuelve a pedirla.",
              regla: REGLAS.marcarImpuestos,
              condiciones: ["La revisión no está en firme."],
              fuente: { archivo: `${ACCIONES}/impuestos-retencion.ts`, funcion: "quitarMarcaRetencion" },
            },
          ],
        },
      ],
    },
    {
      id: "novedades",
      titulo: "Novedades",
      proposito:
        "Lo que falta para cerrar en firme, agrupado por pestaña (formularios, cruce contable, pagos y oportunidad) con un acceso a cada una, y los avisos que no impiden cerrar (por ejemplo, un 350 fuera de la cadena de correcciones o un mes sin recibo del concepto 61).",
      etapas: [
        {
          titulo: "Consultar",
          acciones: [{ nombre: "Ir", queHace: "Abre la pestaña donde se resuelve el pendiente.", regla: REGLAS.verRevisionImpuestos }],
        },
      ],
    },
  ],
  estados: [
    { etiqueta: "Completo", significado: "El período tiene su 350 confirmado y los recibos 490 de lo que declaró." },
    { etiqueta: "Por confirmar", significado: "Hay un formulario del período leído y sin confirmar." },
    { etiqueta: "Falta el 350", significado: "No hay un 350 confirmado ni una causal de mes sin formulario." },
    { etiqueta: "Sin formulario", significado: "Se registró que en el período no hubo 350, con su causal." },
    { etiqueta: "Falta el original", significado: "Llegó una corrección sin el formulario que corrige: sin el original no se mide la oportunidad de presentación." },
    { etiqueta: "Faltan pagos", significado: "El 350 declara un valor (renta, reteIVA o timbre) y falta su recibo 490." },
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
        "El cruce necesita el balance cerrado y vigente que termina en el mes de corte, cargado con detalle por tercero, y la aprobación vigente de su prevalidador. La pantalla dice cuál falta.",
    },
    {
      pregunta: "¿Por qué la oportunidad dice «Sin calendario»?",
      respuesta: "Falta el calendario tributario del año en Parametrización › Calendario tributario, o la periodicidad del cliente no es mensual (el calendario tiene una fecha por mes).",
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
