// Ayuda en pantalla — fichas del balance de comprobación (listado, detalle, diff y terceros).
// Describen la pantalla tal como funciona hoy; los roles salen de la matriz (ver `../roles.ts`).

import { ESTADO_CERRADO, ESTADO_EN_PROCESO, ESTADO_EN_PROCESO_CON_ALERTAS } from "@/lib/balance/estado-balance";
import { REGLAS } from "../reglas";
import type { EstadoAyuda, FichaAyuda } from "../tipos";

const ACCIONES_BALANCE = "src/app/actions/balance.ts";

export const ESTADOS_BALANCE: readonly EstadoAyuda[] = [
  { etiqueta: ESTADO_EN_PROCESO, significado: "Cargado y abierto: se puede corregir y homologar. Los módulos todavía no concilian contra él." },
  {
    etiqueta: ESTADO_EN_PROCESO_CON_ALERTAS,
    significado: "Abierto y con algo pendiente: cuentas con naturaleza contraria sin «Dar OK» o cuentas sin mapeo al Plan Russell.",
  },
  { etiqueta: ESTADO_CERRADO, significado: "Revisado e inmutable. Es el balance contra el que concilian los módulos." },
];

export const FICHA_BALANCE_LISTADO: FichaAyuda = {
  id: "balance.listado",
  titulo: "Balance de comprobación",
  proposito:
    "Los balances de comprobación cargados, agrupados por cliente y por fecha de corte. Desde aquí se carga un balance nuevo y se abre el detalle de cada uno.",
  antesDeEmpezar: [
    "La lista muestra los clientes de tu cartera.",
    "Para cargar, el cliente debe tener su aplicativo de contabilidad (ERP) en la ficha del cliente.",
  ],
  etapas: [
    {
      titulo: "Cargar un balance",
      acciones: [
        {
          nombre: "Cargar balance",
          queHace:
            "Abre la ventana de carga: eliges el archivo del ERP (Excel, CSV, TXT, JSON o PDF), el sistema lo lee y te muestra el resultado antes de pasarlo al borrador.",
          regla: REGLAS.cargarBalance,
          condiciones: [
            "La lista de clientes muestra solo aquellos en los que puedes cargar.",
            "Si el archivo no trae el NIT o no coincide con un cliente, te pide elegirlo.",
            "Si el archivo tiene varias hojas, eliges cuál leer.",
          ],
          fuente: { archivo: ACCIONES_BALANCE, funcion: "leerBalance" },
        },
        {
          nombre: "Ajustar estructura del archivo",
          queHace:
            "Dentro de la carga, corrige qué columna trae cada dato (código, nombre, saldos) y vuelve a leer sin IA. «Guardar perfil» lo deja como perfil del cliente para las próximas cargas.",
          regla: REGLAS.cargarBalance,
        },
        {
          nombre: "Tipo de balance",
          queHace: "Indicas si el balance viene «Por cuenta» o «Por terceros» (con el detalle de cada tercero).",
          regla: REGLAS.cargarBalance,
        },
        {
          nombre: "Ir al borrador",
          queHace:
            "Guarda la lectura como borrador y lo abre. Nada queda como balance oficial hasta que lo cargues desde el borrador.",
          regla: REGLAS.cargarBalance,
          condiciones: ["Necesita un cliente vinculado."],
        },
      ],
    },
    {
      titulo: "Buscar y consultar",
      acciones: [
        { nombre: "Buscar por NIT o razón social", queHace: "Filtra la lista de clientes.", regla: REGLAS.verBalance },
        {
          nombre: "Todos · Con diferencias · Sin comparar · Por mapear",
          queHace:
            "Deja solo los cortes cuyos balances no coinciden entre sí, los que aún no se han comparado o los que tienen cuentas sin mapear.",
          regla: REGLAS.verBalance,
        },
        { nombre: "Ver ›", queHace: "Abre el detalle del balance.", regla: REGLAS.verBalance },
        { nombre: "Número de versiones («Vers.»)", queHace: "Abre las versiones de ese período.", regla: REGLAS.verBalance },
        {
          nombre: "Audit log",
          queHace: "Pestaña con la bitácora de lo que se ha hecho sobre los clientes: quién, cuándo, qué y desde qué IP. Se filtra por cliente.",
          regla: REGLAS.verAuditoria,
        },
      ],
    },
  ],
  estados: [
    ...ESTADOS_BALANCE,
    {
      etiqueta: "Coinciden · Difieren · Sin comparar",
      significado:
        "Comparación entre los balances del cliente que terminan en la misma fecha de corte. Deben coincidir en saldos finales para poder cerrarse.",
    },
    { etiqueta: "Inconsistente", significado: "Este balance difiere de otro del mismo corte." },
    { etiqueta: "N archivos", significado: "El balance se cargó en varias partes del mismo período." },
    { etiqueta: "Mapeo · N sin mapeo", significado: "Cuántas cuentas quedaron homologadas al Plan Russell y cuántas faltan." },
    { etiqueta: "Conciliación en firme", significado: "Módulos que cerraron su conciliación contra ese balance." },
  ],
  preguntas: [
    {
      pregunta: "¿Por qué no veo un cliente?",
      respuesta:
        "La lista muestra solo los clientes de tu cartera: los que tienes asignados o, si eres socio, los de tus gerentes. Si falta uno, pide que te asignen en la ficha del cliente.",
    },
    {
      pregunta: "¿Qué pasa si cargo otro balance del mismo período?",
      respuesta:
        "Queda como una versión nueva del período y las anteriores se conservan en «Versiones». Si la versión vigente está cerrada, hay que abrirla antes de cargar otra.",
    },
    {
      pregunta: "¿Qué es la fecha de corte?",
      respuesta:
        "El último día del balance. Todos los balances de un cliente que terminan el mismo día se comparan entre sí, porque los módulos concilian contra el saldo final.",
    },
  ],
  relacionadas: [
    { label: "Borrador Balance", href: "/balance/borradores", permiso: "balance:crear" },
    { label: "Mapeo cuentas cliente", href: "/config/mapeo-cliente", permiso: "mapeo:ver" },
    { label: "Parámetros de alertas", href: "/config/parametros", permiso: "parametros:ver" },
  ],
};

export const FICHA_BALANCE_DETALLE: FichaAyuda = {
  id: "balance.detalle",
  titulo: "Detalle del balance",
  proposito:
    "Revisa un balance cargado: sus cuentas por niveles, las validaciones, las versiones y el prevalidador. Aquí se homologa al Plan Russell y se cierra para que los módulos concilien contra él.",
  antesDeEmpezar: [
    "Un balance cerrado no se modifica: para corregirlo hay que abrirlo primero.",
    "Las cuentas que un módulo concilió en firme llevan «En firme» y no se cambian.",
  ],
  etapas: [
    {
      titulo: "Consultar y exportar",
      acciones: [
        {
          nombre: "Exportar a Excel",
          queHace: "Descarga el «Balance Homologado», el «Comparativo Homologado vs Cliente» o el «Prevalidador».",
          regla: REGLAS.verBalance,
          condiciones: ["El prevalidador solo se descarga si el informe no está bloqueado."],
        },
        {
          nombre: "Diff de versiones",
          queHace: "Compara esta versión con una anterior del mismo período: cuentas agregadas, eliminadas y modificadas.",
          regla: REGLAS.verBalance,
          condiciones: ["Solo si hay una versión anterior."],
        },
        {
          nombre: "Ver por terceros",
          queHace: "Abre el saldo de cada cuenta por tercero, solo para consulta.",
          regla: REGLAS.verBalance,
          condiciones: ["Solo en balances «Por terceros» con el detalle capturado."],
        },
        {
          nombre: "Conversación",
          queHace: "Comentarios del balance al pie de la página, con menciones. Cada cuenta del árbol tiene además su propia conversación.",
          regla: REGLAS.comentarBalance,
        },
      ],
    },
    {
      titulo: "Homologar",
      acciones: [
        {
          nombre: "Re-homologar",
          queHace:
            "Vuelve a homologar todas las cuentas con la memoria del cliente y las reglas automáticas, sin IA y sin tocar los saldos.",
          regla: REGLAS.revisarBalance,
          condiciones: ["Balance abierto.", "Las cuentas en firme no cambian."],
          fuente: { archivo: ACCIONES_BALANCE, funcion: "reaplicarMapeoBalance" },
        },
      ],
    },
    {
      titulo: "Cerrar, abrir o eliminar",
      acciones: [
        {
          nombre: "Cerrar balance",
          queHace: "Lo deja «Cerrado»: inmutable y disponible para que los módulos concilien contra él.",
          regla: REGLAS.revisarBalance,
          condiciones: [
            "Es la versión vigente de su período y no hay una versión anterior cerrada.",
            "Los balances del mismo corte están comparados y coinciden.",
            "El prevalidador está aprobado y vigente.",
            "Toda cuenta con naturaleza contraria tiene «Dar OK».",
          ],
          fuente: { archivo: ACCIONES_BALANCE, funcion: "freezeBalance" },
        },
        {
          nombre: "Abrir balance",
          queHace:
            "Lo devuelve a «En proceso» para corregirlo, con una justificación de al menos 10 caracteres que queda registrada. Mientras esté abierto, los módulos no concilian contra él.",
          regla: REGLAS.revisarBalance,
          condiciones: ["Las conciliaciones de módulo ya en firme conservan sus cuentas bloqueadas."],
          fuente: { archivo: ACCIONES_BALANCE, funcion: "descongelarBalance" },
        },
        {
          nombre: "Eliminar",
          queHace: "Elimina «Solo esta versión» o «Todo este período».",
          regla: REGLAS.eliminarBalance,
          condiciones: [
            "Un balance cerrado se abre antes.",
            "No se elimina el balance contra el que un módulo cerró su conciliación.",
          ],
          fuente: { archivo: ACCIONES_BALANCE, funcion: "eliminarBalance" },
        },
        {
          nombre: "Todos los balances y perfiles de carga",
          queHace: "Alcance de «Eliminar» que borra todo el historial de balances del cliente junto con sus perfiles de carga.",
          regla: REGLAS.eliminarHistorialBalance,
          fuente: { archivo: ACCIONES_BALANCE, funcion: "eliminarBalance" },
        },
      ],
    },
    {
      titulo: "Balances del mismo corte",
      acciones: [
        {
          nombre: "Revisar comparación",
          queHace: "Vuelve a comparar los saldos finales de este balance con los demás que terminan en la misma fecha.",
          regla: REGLAS.compararCorte,
          fuente: { archivo: "src/app/actions/balance-corte.ts", funcion: "revisarComparacionCorte" },
        },
        {
          nombre: "Reemplazar el balance conciliado",
          queHace:
            "Cuando otro balance del corte tiene una conciliación de módulo en firme, pasa esa conciliación a este, elimina el anterior y deja este cerrado.",
          regla: REGLAS.revisarBalance,
          condiciones: [
            "Las cuentas en firme son idénticas en saldo final y homologación.",
            "Este balance tiene el prevalidador aprobado.",
            "Sin el balance anterior, los del corte coinciden.",
          ],
          fuente: { archivo: ACCIONES_BALANCE, funcion: "reemplazarBalanceConciliado" },
        },
      ],
    },
  ],
  pestanas: [
    {
      id: "breakdown",
      titulo: "Detalle por niveles",
      proposito: "El árbol del balance —clase, grupo, cuenta, subcuenta y cuentas del cliente— con su homologación y sus alertas.",
      etapas: [
        {
          titulo: "Buscar y filtrar",
          acciones: [
            {
              nombre: "Todo · Alertas · Sin mapeo · Naturaleza contraria",
              queHace: "Filtra las cuentas por tipo de alerta. También hay filtros por columna, niveles y pantalla completa.",
              regla: REGLAS.verBalance,
            },
            { nombre: "Expandir todo · Contraer todo", queHace: "Abre o cierra el árbol completo.", regla: REGLAS.verBalance },
          ],
        },
        {
          titulo: "Homologar y validar",
          acciones: [
            {
              nombre: "Asignar",
              queHace:
                "En la columna del mapeo, asigna o cambia la cuenta del Plan Russell, para «Solo esta cuenta» o para «Todas las cuentas del grupo». Queda en la memoria del cliente para las próximas cargas.",
              regla: REGLAS.revisarBalance,
              condiciones: ["Balance abierto.", "Las cuentas en firme no se cambian."],
              fuente: { archivo: ACCIONES_BALANCE, funcion: "asignarCuentaEstandar" },
            },
            {
              nombre: "Dejar pendiente por asignar · Quitar pendiente",
              queHace: "Marca la cuenta como pendiente (sigue contando como sin mapeo) o le quita la marca.",
              regla: REGLAS.revisarBalance,
              condiciones: ["Balance abierto."],
            },
            {
              nombre: "Dar OK",
              queHace:
                "Valida una cuenta del cliente con naturaleza contraria con un comentario de al menos 3 caracteres. «Revertir» lo deshace.",
              regla: REGLAS.cargarBalance,
              condiciones: ["Balance abierto.", "Solo en cuentas del cliente por encima del umbral de naturaleza contraria."],
              fuente: { archivo: ACCIONES_BALANCE, funcion: "validarAlerta" },
            },
            {
              nombre: "Eliminar registro sin mapeo (×)",
              queHace: "Quita del balance una cuenta del cliente sin cuenta Russell; se recuerda para las próximas cargas del cliente.",
              regla: REGLAS.cargarBalance,
              condiciones: ["Balance abierto.", "No en cuentas en firme."],
              fuente: { archivo: ACCIONES_BALANCE, funcion: "eliminarDetalleBalance" },
            },
            {
              nombre: "Comentarios de esta cuenta",
              queHace: "Abre la conversación propia de esa cuenta o nivel del árbol.",
              regla: REGLAS.comentarBalance,
            },
          ],
        },
      ],
    },
    {
      id: "validations",
      titulo: "Validaciones",
      proposito:
        "Las reglas que se revisan sobre el balance: cuadre de saldos finales y de movimientos, naturaleza contraria, cuentas sin mapeo, homologación fuera de la clase y variaciones mayores al 25 %.",
      etapas: [
        {
          titulo: "Consultar",
          acciones: [
            {
              nombre: "Tabla de validaciones",
              queHace:
                "Cada regla con su estado («OK», «N alerta(s)» o «N informativa(s)») y su detalle. Las variaciones mayores al 25 % solo informan.",
              regla: REGLAS.verBalance,
            },
          ],
        },
      ],
    },
    {
      id: "versions",
      titulo: "Versiones",
      proposito: "Las versiones cargadas de este período, la vigente primero.",
      etapas: [
        {
          titulo: "Consultar",
          acciones: [
            { nombre: "vN", queHace: "Abre esa versión del balance.", regla: REGLAS.verBalance },
            { nombre: "Homologado · Comparativo", queHace: "Descarga el Excel de cada versión.", regla: REGLAS.verBalance },
          ],
        },
      ],
    },
    {
      id: "clases",
      titulo: "Saldos por clase",
      proposito: "Los totales por clase contable y el cuadre del balance.",
      etapas: [
        {
          titulo: "Consultar",
          acciones: [
            {
              nombre: "Cuadre",
              queHace:
                "«Cuadrado» con diferencia cero, «Diferencia informativa» por debajo del umbral de descuadre y «Descuadra» desde el umbral.",
              regla: REGLAS.verBalance,
            },
          ],
        },
      ],
    },
    {
      id: "prevalidador",
      titulo: "Prevalidador",
      proposito:
        "Compara, por cada prefijo configurado, lo que suma el balance homologado contra lo que suman las cuentas originales del cliente. Si la homologación respetó la naturaleza de las cuentas, coinciden. No corrige nada: avisa.",
      etapas: [
        {
          titulo: "Revisar y aprobar",
          acciones: [
            {
              nombre: "Aprobar prevalidador",
              queHace: "Deja constancia de que revisaste el informe, con una justificación de 3 a 2.000 caracteres. Es requisito para cerrar el balance.",
              regla: REGLAS.revisarBalance,
              condiciones: ["El informe no está bloqueado y hay cuentas configuradas."],
              fuente: { archivo: "src/app/actions/prevalidador.ts", funcion: "aprobarPrevalidadorBalance" },
            },
            { nombre: "Revocar aprobación", queHace: "Quita la aprobación vigente, con un motivo.", regla: REGLAS.revisarBalance },
            { nombre: "Historial", queHace: "Todas las aprobaciones y revocaciones del balance.", regla: REGLAS.verBalance },
            {
              nombre: "Cuenta del cliente para la cuenta de Russell",
              queHace: "Cambia qué cuenta del cliente se compara contra una cuenta de Russell en el informe, o vuelve a la original.",
              regla: REGLAS.cargarBalance,
              condiciones: ["Balance abierto."],
              fuente: { archivo: "src/app/actions/prevalidador.ts", funcion: "guardarCuentaClientePrevalidador" },
            },
          ],
        },
      ],
    },
  ],
  estados: [
    ...ESTADOS_BALANCE,
    {
      etiqueta: "Naturaleza contraria",
      significado:
        "Saldo de una cuenta del cliente contrario a su naturaleza, por encima del umbral: necesita «Dar OK» para cerrar. «· informativa» cuando está por debajo.",
    },
    { etiqueta: "OK · de vN", significado: "OK que viene de una versión anterior con el mismo saldo final." },
    { etiqueta: "Sin mapeo", significado: "Cuenta del cliente sin cuenta del Plan Russell." },
    { etiqueta: "Otra clase", significado: "Cuenta homologada a una clase contable distinta de la suya." },
    { etiqueta: "En firme · MOD", significado: "Cuenta que un módulo concilió en firme: no se cambia su homologación ni se elimina." },
    {
      etiqueta: "Aprobado y vigente · Aprobación desactualizada",
      significado: "Estado del prevalidador. Si el balance cambió después de aprobarlo, la aprobación queda desactualizada y hay que aprobar otra vez.",
    },
  ],
  preguntas: [
    {
      pregunta: "¿Por qué no me deja cerrar el balance?",
      respuesta:
        "Al pulsar «Cerrar balance» la ventana dice qué falta: que sea la versión vigente, que no haya una versión anterior cerrada, que los balances del mismo corte coincidan, que el prevalidador esté aprobado y que toda naturaleza contraria tenga «Dar OK».",
    },
    {
      pregunta: "¿Por qué no veo «Asignar» en la columna del mapeo?",
      respuesta: "Homologar requiere el permiso de revisar balances y el balance abierto. Sin eso, la homologación se ve en modo consulta.",
    },
    {
      pregunta: "Dos balances del mismo corte no coinciden, ¿qué hago?",
      respuesta:
        "En «Balances del mismo corte» se ven las cuentas que difieren. Se elimina el que sobra (si está cerrado, se abre antes); si tiene una conciliación de módulo en firme, se usa «Reemplazar el balance conciliado».",
    },
    {
      pregunta: "¿Qué significa «Diferencia menor de $X»?",
      respuesta:
        "Una diferencia entre balances del mismo corte por debajo del umbral configurado en Parámetros de alertas. Se muestra, pero no impide cerrar.",
    },
  ],
  relacionadas: [
    { label: "Mapeo cuentas cliente", href: "/config/mapeo-cliente", permiso: "mapeo:ver" },
    { label: "Filtros de cuentas", href: "/config/prevalidador", permiso: "parametros:ver" },
    { label: "Parámetros de alertas", href: "/config/parametros", permiso: "parametros:ver" },
  ],
};

export const FICHA_BALANCE_DIFF: FichaAyuda = {
  id: "balance.diff",
  titulo: "Comparativo de versiones",
  proposito: "Compara dos versiones del mismo período: cuentas agregadas, eliminadas y modificadas, y el total afectado. Es solo de consulta.",
  etapas: [
    {
      titulo: "Consultar",
      acciones: [
        {
          nombre: "Git diff · Antes · Después · Lado a lado",
          queHace: "Cambia la forma de ver las diferencias entre las dos versiones.",
          regla: REGLAS.verBalance,
        },
      ],
    },
  ],
};

export const FICHA_BALANCE_TERCEROS: FichaAyuda = {
  id: "balance.terceros",
  titulo: "Balance por terceros",
  proposito: "El saldo de cada cuenta abierto por tercero, comparado con el balance oficial. Es solo de consulta.",
  etapas: [
    {
      titulo: "Buscar y filtrar",
      acciones: [
        {
          nombre: "Solo con diferencia",
          queHace: "Deja las cuentas cuyo detalle por tercero no coincide con el balance oficial.",
          regla: REGLAS.verBalance,
        },
        {
          nombre: "Ocultar terceros sin saldos ni movimientos",
          queHace: "Esconde los terceros en cero. También hay búsqueda por cuenta, documento o nombre, y filtros de clase y nivel.",
          regla: REGLAS.verBalance,
        },
      ],
    },
  ],
  estados: [
    { etiqueta: "OK", significado: "El detalle por tercero suma lo mismo que la cuenta del balance." },
    { etiqueta: "Mapeo difiere · Importes difieren", significado: "La homologación o los importes del detalle no coinciden con el balance." },
    {
      etiqueta: "Falta detalle por tercero",
      significado: "Una cuenta que debe venir por tercero (grupos 13, 21, 22, 23 y 28) llegó sin ese detalle.",
    },
  ],
};
