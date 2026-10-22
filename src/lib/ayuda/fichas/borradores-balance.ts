// Ayuda en pantalla — fichas del borrador de balance (listado y detalle).

import { REGLAS } from "../reglas";
import type { FichaAyuda } from "../tipos";

const ACCIONES_BALANCE = "src/app/actions/balance.ts";

export const FICHA_BORRADORES_BALANCE: FichaAyuda = {
  id: "balance.borradores",
  titulo: "Borrador Balance",
  proposito:
    "Lo que se leyó de cada archivo antes de cargarlo como balance. Nada de esto es oficial todavía: se revisa, se corrige y se carga desde el borrador.",
  etapas: [
    {
      titulo: "Revisar",
      acciones: [
        { nombre: "Revisar borrador", queHace: "Abre el borrador para revisarlo, corregirlo y cargarlo.", regla: REGLAS.verBorradoresBalance },
        {
          nombre: "Buscar por archivo, NIT o razón social",
          queHace: "Filtra la lista. Las columnas se ordenan pulsando su título.",
          regla: REGLAS.verBorradoresBalance,
        },
      ],
    },
    {
      titulo: "Descartar",
      acciones: [
        {
          nombre: "Descartar borrador",
          queHace: "Elimina el borrador sin cargarlo. No se puede deshacer.",
          regla: REGLAS.descartarBorradorBalance,
          fuente: { archivo: ACCIONES_BALANCE, funcion: "descartarBorrador" },
        },
      ],
    },
  ],
  estados: [
    {
      etiqueta: "Cuadrado",
      significado:
        "Pasa las cuatro condiciones: ecuación contable, partida doble, clases contra el archivo y agrupadoras contra su desglose.",
    },
    {
      etiqueta: "Descuadrado",
      significado:
        "Falla al menos una condición, desde el umbral de descuadre; debajo se ve cuál. Para cargarlo hay que escribir un comentario por cada condición que falla.",
    },
    {
      etiqueta: "Sin verificar",
      significado: "La ecuación y la partida doble cuadran, pero faltan revisar las clases y las agrupadoras: al abrirlo se verifica.",
    },
    { etiqueta: "N archivos · parte N", significado: "Borrador armado con varias partes del mismo período." },
  ],
  preguntas: [
    {
      pregunta: "¿Quién ve un borrador?",
      respuesta:
        "Un borrador con cliente lo ve quien tiene ese cliente en su cartera y puede cargar o revisar balances. Uno sin cliente solo lo ve quien lo cargó.",
    },
  ],
  relacionadas: [{ label: "Balance de comprobación", href: "/balance", permiso: "balance:ver" }],
};

export const FICHA_BORRADOR_BALANCE: FichaAyuda = {
  id: "balance.borrador",
  titulo: "Borrador de balance",
  proposito:
    "La estructura que se leyó del archivo, todavía sin homologar. Aquí corriges la lectura, revisas que cuadre y la cargas como balance oficial.",
  antesDeEmpezar: [
    "Los cambios del árbol no se aplican hasta pulsar «Guardar cambios».",
    "Para cargar se necesitan cliente, período (no futuro y confirmado) y tipo de balance.",
    "Quien puede revisar balances pero no cargarlos abre el borrador en modo consulta: lo revisa y lo puede descartar.",
  ],
  etapas: [
    {
      titulo: "Completar el balance",
      acciones: [
        {
          nombre: "Agregar otra parte",
          queHace:
            "Suma otro archivo del mismo cliente y período al borrador, por ejemplo cuando el ERP saca el estado de situación y el de resultados por separado.",
          regla: REGLAS.cargarBalance,
          condiciones: [
            "El borrador ya tiene cliente.",
            "Sin cambios sin guardar.",
            "No acepta un archivo repetido ni de otro NIT o período.",
          ],
        },
        {
          nombre: "Omitir la de la parte N",
          queHace: "Cuando dos partes traen la misma cuenta con los mismos importes, deja solo una.",
          regla: REGLAS.cargarBalance,
        },
      ],
    },
    {
      titulo: "Corregir la lectura",
      acciones: [
        {
          nombre: "Más acciones (⋯)",
          queHace:
            "Menú de cada fila: «Reubicar cuenta», «Convertir en agrupadora» o «en movimiento», «Gestionar movimientos», «Desacoplar», «Omitir del cálculo» / «Incluir de nuevo», «Subir un nivel» y «Mover bajo agrupadora».",
          regla: REGLAS.cargarBalance,
          condiciones: ["Mover una cuenta a otra clase contable exige una justificación de al menos 10 caracteres."],
        },
        {
          nombre: "Guardar cambios",
          queHace: "Aplica los cambios pendientes. Se recuerdan por cliente y cuenta y se aplican solos en los borradores siguientes de ese cliente.",
          regla: REGLAS.cargarBalance,
          fuente: { archivo: ACCIONES_BALANCE, funcion: "aplicarCambiosBorrador" },
        },
        {
          nombre: "Descartar cambios",
          queHace: "Deshace «Solo el último cambio» o «Todos los cambios» que aún no se han guardado.",
          regla: REGLAS.cargarBalance,
        },
        { nombre: "Deshacer auto-corrección", queHace: "Revierte el anidado que el sistema corrigió solo.", regla: REGLAS.cargarBalance },
        {
          nombre: "Ajustes avanzados de jerarquía",
          queHace: "Fuerza o quita el modo «solo hojas» cuando el archivo no anida bien sus cuentas.",
          regla: REGLAS.cargarBalance,
        },
        {
          nombre: "Control de manipulaciones manuales",
          queHace:
            "Lista los ajustes manuales que hay que justificar («Revisar y justificar») o deshacer («Deshacer y no repetir»). Con la marca «Bloquea la carga», el balance no se carga hasta resolverlos.",
          regla: REGLAS.cargarBalance,
        },
      ],
    },
    {
      titulo: "Revisar que cuadre",
      acciones: [
        {
          nombre: "Validación del balance (ⓘ)",
          queHace: "Explica cómo leer las barras de partida doble, ecuación y clases.",
          regla: REGLAS.verBorradoresBalance,
        },
        { nombre: "Diagnóstico del descuadre", queHace: "Señala las cuentas que explican un descuadre.", regla: REGLAS.verBorradoresBalance },
        { nombre: "Exportar a Excel", queHace: "Descarga lo guardado del borrador (no los cambios sin guardar).", regla: REGLAS.verBorradoresBalance },
        { nombre: "Versiones (N)", queHace: "Otros borradores del mismo cliente y período, con su Excel.", regla: REGLAS.verBorradoresBalance },
      ],
    },
    {
      titulo: "Cargar como balance oficial",
      acciones: [
        {
          nombre: "Agregar notas de carga de este cliente",
          queHace: "Notas que se muestran en cada carga del cliente (hasta 2.000 caracteres).",
          regla: REGLAS.cargarBalance,
        },
        {
          nombre: "Comentario(s) de aprobación",
          queHace:
            "Si el borrador está descuadrado, escribes un comentario por cada condición que falla (hasta 1.000 caracteres cada uno). Quedan en el balance como «Justificación del descuadre».",
          regla: REGLAS.cargarBalance,
        },
        {
          nombre: "Agregar nota (opcional)",
          queHace: "Si el borrador cuadra, puedes dejar una nota que acompaña al balance.",
          regla: REGLAS.cargarBalance,
        },
        {
          nombre: "Cargar balance",
          queHace: "Crea la versión oficial del balance («En proceso») y abre su detalle.",
          regla: REGLAS.cargarBalance,
          condiciones: [
            "Cliente, período y tipo de balance elegidos; período no futuro y confirmado con «Sí, es correcto».",
            "Sin cambios sin guardar ni reubicaciones pendientes.",
            "Un comentario por cada condición que falla, si está descuadrado.",
            "El cliente tiene su aplicativo de contabilidad (ERP) en la ficha.",
            "La versión vigente de ese período no está cerrada.",
          ],
          fuente: { archivo: ACCIONES_BALANCE, funcion: "cargarBorrador" },
        },
        {
          nombre: "Descartar borrador",
          queHace: "Elimina el borrador sin cargarlo. No se puede deshacer.",
          regla: REGLAS.descartarBorradorBalance,
          fuente: { archivo: ACCIONES_BALANCE, funcion: "descartarBorrador" },
        },
      ],
    },
  ],
  estados: [
    {
      etiqueta: "Cuadra · Diferencia informativa · No cuadra",
      significado:
        "Estado de la partida doble y de la ecuación: diferencia cero, por debajo del umbral de descuadre, o desde el umbral (pide comentario para cargar).",
    },
    { etiqueta: "Omitida · no cuenta", significado: "Fila que quedó fuera del cálculo." },
    { etiqueta: "Clase cruzada", significado: "Cuenta reubicada a otra clase contable; necesita justificación." },
    { etiqueta: "Subtotal duplicado · no se carga", significado: "Subtotal del archivo que repite lo que ya suman sus cuentas." },
    {
      etiqueta: "Balances del mismo corte",
      significado:
        "Compara el borrador con los balances ya cargados que terminan en la misma fecha. Si difiere se puede cargar igual y queda «Inconsistente».",
    },
  ],
  preguntas: [
    {
      pregunta: "¿Por qué está deshabilitado «Cargar balance»?",
      respuesta:
        "Falta algo de lo que pide: cliente, período confirmado, tipo de balance, guardar los cambios, los comentarios de un borrador descuadrado o resolver las reubicaciones pendientes.",
    },
    {
      pregunta: "¿Se pierden mis correcciones en la próxima carga?",
      respuesta:
        "No. Lo que guardas (reubicar, omitir, convertir…) se recuerda por cliente y cuenta y se aplica solo en los borradores siguientes de ese cliente.",
    },
    {
      pregunta: "¿Qué hago si el borrador está descuadrado?",
      respuesta:
        "Revisa el diagnóstico del descuadre y corrige la lectura. Si la diferencia es real, escribe el comentario de cada condición que falla y cárgalo: queda registrado como justificación.",
    },
  ],
  relacionadas: [
    { label: "Borrador Balance", href: "/balance/borradores", permiso: "balance:crear" },
    { label: "Balance de comprobación", href: "/balance", permiso: "balance:ver" },
  ],
};
