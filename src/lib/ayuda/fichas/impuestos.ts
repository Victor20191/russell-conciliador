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
  ],
  estados: [
    { etiqueta: "En proceso", significado: "La revisión se puede trabajar: importar, confirmar y registrar meses sin formulario." },
    { etiqueta: "En firme", significado: "La revisión está cerrada y no se puede cambiar." },
  ],
  relacionadas: [
    { label: "Mapeos DIAN", href: "/config/mapeos-dian", permiso: "impuestos:ver" },
    { label: "Calendario tributario", href: "/config/calendario-tributario", permiso: "impuestos:ver" },
  ],
};

export const FICHA_RETENCION_REVISION: FichaAyuda = {
  id: "impuestos.retencion_revision",
  titulo: "Revisión de Retención en la fuente",
  proposito:
    "Los formularios 350 y 490 de un cliente y un año hasta el corte: se importan los PDF, la IA los lee y cada uno se revisa y confirma. La tabla dice, por período, qué 350 rige, si es una corrección y qué pagos faltan.",
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
          queHace: "Descarga la revisión en un libro con tres hojas: por meses, acumulado y los formularios cargados.",
          regla: REGLAS.verRevisionImpuestos,
          fuente: { archivo: "src/app/api/impuestos/revisiones/[id]/excel/route.ts", funcion: "GET" },
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
  ],
  estados: [
    { etiqueta: "Completo", significado: "El período tiene su 350 confirmado y los recibos 490 de lo que declaró." },
    { etiqueta: "Por confirmar", significado: "Hay un formulario del período leído y sin confirmar." },
    { etiqueta: "Falta el 350", significado: "No hay un 350 confirmado ni una causal de mes sin formulario." },
    { etiqueta: "Sin formulario", significado: "Se registró que en el período no hubo 350, con su causal." },
    { etiqueta: "Falta el original", significado: "Llegó una corrección sin el formulario que corrige: sin el original no se mide la oportunidad de presentación." },
    { etiqueta: "Faltan pagos", significado: "El 350 declara un valor (renta, reteIVA o timbre) y falta su recibo 490." },
  ],
  preguntas: [
    {
      pregunta: "¿Por qué un recibo dice que paga un formulario de otro período?",
      respuesta: "Su renglón 29 apunta a un 350 que no es de ese período ni de su cadena de correcciones. Revisa el recibo o el 350 del período.",
    },
  ],
  relacionadas: [
    { label: "Retención en la fuente", href: "/impuestos/retencion", permiso: "impuestos:ver" },
    { label: "Mapeos DIAN", href: "/config/mapeos-dian", permiso: "impuestos:ver" },
    { label: "Calendario tributario", href: "/config/calendario-tributario", permiso: "impuestos:ver" },
  ],
};
