// Ayuda en pantalla — fichas de Parametrización: Filtros de cuentas (una por módulo, armada con su
// descriptor) y Parámetros de alertas.

import type { DescriptorModulo } from "@/lib/modulos/descriptores";
import { REGLAS } from "../reglas";
import type { AplicaModulo, FichaAyuda } from "../tipos";

const ACCIONES = "src/app/actions";

/** Inventarios y Activos fijos concilian subgrupos de 4 dígitos; los demás, cuentas de 6. */
const porSubgrupos: AplicaModulo = (d) => d.codigo === "INV" || d.codigo === "AFI";
const porCuentas: AplicaModulo = (d) => !porSubgrupos(d);
const esAfi: AplicaModulo = (d) => d.codigo === "AFI";
const esNomina: AplicaModulo = (d) => !!d.nomina;
const porTercero: AplicaModulo = (d) => d.crucePorTercero.habilitado;

export function fichaFiltrosCuentas(d: DescriptorModulo): FichaAyuda {
  return {
    id: "parametros.filtros_cuentas",
    titulo: `Filtros de cuentas · ${d.label}`,
    proposito:
      "Dos cosas distintas del módulo: los prefijos del prevalidador, que solo validan el balance (su informe y su aprobación), y las cuentas propias del módulo, que son las que entran a su cruce contable.",
    antesDeEmpezar: [
      "Los cambios rigen de inmediato en los cargues abiertos; una conciliación en firme conserva lo que tenía al cerrar.",
      "Un balance con el prevalidador aprobado conserva el catálogo con que se aprobó; para aplicarle el nuevo, se revoca y se aprueba otra vez.",
    ],
    etapas: [
      {
        titulo: "Prefijos del prevalidador",
        acciones: [
          {
            nombre: "Agregar cuenta",
            queHace: "Agrega un prefijo Russell de 2 o 4 dígitos con su etiqueta, su base de cálculo (saldo final o movimiento) y su orden en el informe.",
            regla: REGLAS.administrarParametros,
            condiciones: ["No puede solaparse con otro prefijo del módulo."],
            fuente: { archivo: `${ACCIONES}/prevalidador.ts`, funcion: "guardarFilaPrevalidador" },
          },
          {
            nombre: "Activa",
            queHace: "Desmarcarla saca el prefijo del informe sin borrarlo: es la forma recomendada de retirarlo.",
            regla: REGLAS.administrarParametros,
          },
          {
            nombre: "Eliminar (papelera)",
            queHace: "Borra el prefijo junto con las cuentas alternativas que tengan los balances para él.",
            regla: REGLAS.administrarParametros,
            condiciones: ["No si un balance con cuenta alternativa en ese prefijo tiene el prevalidador aprobado: se inactiva o se revoca la aprobación antes."],
            fuente: { archivo: `${ACCIONES}/prevalidador.ts`, funcion: "eliminarFilaPrevalidador" },
          },
        ],
      },
      {
        titulo: "Cuentas que concilia",
        aplica: porCuentas,
        acciones: [
          {
            nombre: d.nomina ? "Agregar cuenta" : "Agregar cuenta que concilia",
            queHace: "Agrega una cuenta Russell de 6 dígitos que siempre entra al cruce del módulo, aunque esté fuera de los prefijos.",
            regla: REGLAS.administrarParametros,
            condiciones: ["Debe existir en el Plan Estándar Russell."],
            fuente: { archivo: `${ACCIONES}/cuentas-conciliacion.ts`, funcion: "guardarCuentaConciliacion" },
          },
          {
            nombre: "Origen: Nacional · Exterior",
            queHace: "Decide si la cuenta es nacional o del exterior en el cruce por tercero.",
            regla: REGLAS.administrarParametros,
            aplica: porTercero,
          },
          {
            nombre: "Categoría: Concilia · Solo visible",
            queHace: "Las cuentas solo visibles se muestran en el cruce, pero no cuentan para la conciliación.",
            regla: REGLAS.administrarParametros,
            aplica: esNomina,
          },
          {
            nombre: "Quitar (papelera)",
            queHace: "La cuenta deja de conciliarse en los cargues abiertos: su saldo pasa a «fuera del módulo».",
            regla: REGLAS.administrarParametros,
            condiciones: ["El módulo conserva al menos una cuenta que concilia."],
            fuente: { archivo: `${ACCIONES}/cuentas-conciliacion.ts`, funcion: "quitarCuentaConciliacion" },
          },
        ],
      },
      {
        titulo: "Subgrupos que concilia",
        aplica: porSubgrupos,
        acciones: [
          {
            nombre: "Agregar subgrupo que concilia",
            queHace: "Agrega un subgrupo Russell de 4 dígitos al cruce del módulo.",
            regla: REGLAS.administrarParametros,
            condiciones: ["Debe existir en el Plan Estándar Russell."],
            fuente: { archivo: `${ACCIONES}/cuentas-conciliacion.ts`, funcion: "agregarSubgrupoConciliacion" },
          },
          {
            nombre: "Quitar (papelera)",
            queHace: "El subgrupo deja de conciliarse en los cargues abiertos; los períodos en firme lo conservan.",
            regla: REGLAS.administrarParametros,
            condiciones: ["El módulo conserva al menos un subgrupo."],
            fuente: { archivo: `${ACCIONES}/cuentas-conciliacion.ts`, funcion: "quitarSubgrupoConciliacion" },
          },
        ],
      },
      {
        titulo: "Activo y su depreciación",
        aplica: esAfi,
        acciones: [
          {
            nombre: "Agregar pareja",
            queHace: "Empareja un activo de 4 dígitos con su depreciación de 6, que cuelga de 1592; la cédula los compara en el mismo renglón.",
            regla: REGLAS.administrarParametros,
            condiciones: ["Cada activo tiene una sola pareja: agregar otra la reemplaza."],
            fuente: { archivo: `${ACCIONES}/cuentas-conciliacion.ts`, funcion: "guardarParDepreciacion" },
          },
          {
            nombre: "Quitar pareja",
            queHace: "En los cargues abiertos, el activo queda sin su depreciación y esta pasa a su propio renglón.",
            regla: REGLAS.administrarParametros,
            condiciones: ["Si se quita la última pareja, el módulo vuelve a usar las parejas de fábrica."],
            fuente: { archivo: `${ACCIONES}/cuentas-conciliacion.ts`, funcion: "quitarParDepreciacion" },
          },
        ],
      },
    ],
    estados: [
      {
        etiqueta: "Fuera de los prefijos",
        significado: "Cuenta que concilia aunque su subgrupo no esté en los prefijos del prevalidador; se lee por saldo final.",
        aplica: porCuentas,
      },
      { etiqueta: "Fuera de la regla del prevalidador", significado: "Subgrupo que concilia aunque no esté bajo los prefijos.", aplica: porSubgrupos },
      { etiqueta: "N balance(s) con cuenta propia", significado: "Balances que usan otra cuenta del cliente para ese prefijo en su prevalidador." },
      { etiqueta: "1592 · Fijo", significado: "La depreciación acumulada siempre concilia, a 6 dígitos y con su activo.", aplica: esAfi },
    ],
    preguntas: [
      {
        pregunta: "¿Qué diferencia hay entre los prefijos y las cuentas del módulo?",
        respuesta:
          "Los prefijos solo arman el informe del prevalidador del balance. Las cuentas (o subgrupos) del módulo deciden qué entra a su cruce contable. Cambiar uno no cambia el otro.",
      },
    ],
    relacionadas: [
      { label: "Parámetros de alertas", href: "/config/parametros", permiso: "parametros:ver" },
      { label: d.label, href: `/modulos/${d.codigo.toLowerCase()}`, permiso: "modulos_datos:ver" },
    ],
  };
}

export const FICHA_PARAMETROS_ALERTAS: FichaAyuda = {
  id: "parametros.alertas",
  titulo: "Parámetros de alertas",
  proposito:
    "Los montos desde los que una diferencia deja de ser un aviso informativo y pasa a ser alerta, en el balance y en los cruces de los módulos. Valen para toda la plataforma y de inmediato, también sobre lo ya cargado.",
  antesDeEmpezar: [
    "Un cambio en los montos del balance cambia al instante las alertas de todos los borradores y balances, incluidos los cerrados.",
    "En los módulos rige para las conciliaciones abiertas; una en firme conserva la tolerancia de la cédula, la diferencia por tercero y el detalle de Activos fijos con que se cerró.",
  ],
  etapas: [
    {
      titulo: "Ajustar",
      acciones: [
        {
          nombre: "Guardar cambios",
          queHace: "Guarda el nuevo monto del umbral (entre $0 y $1.000.000.000).",
          regla: REGLAS.administrarParametros,
          fuente: { archivo: `${ACCIONES}/parametros.ts`, funcion: "actualizarUmbral" },
        },
        {
          nombre: "Restaurar predeterminado",
          queHace: "Vuelve el umbral a su valor predeterminado.",
          regla: REGLAS.administrarParametros,
          fuente: { archivo: `${ACCIONES}/parametros.ts`, funcion: "restaurarUmbral" },
        },
      ],
    },
  ],
  estados: [
    {
      etiqueta: "Diferencias y descuadres del balance",
      significado:
        "Desde el monto, una diferencia en la ecuación, la partida doble, una clase o una agrupadora vuelve «Descuadrado» el borrador y pide comentario para cargarlo; por debajo es «Diferencia informativa». De fábrica, $2.000.",
    },
    {
      etiqueta: "Naturaleza contraria",
      significado:
        "Por encima del monto, el saldo contrario de una cuenta del cliente es alerta: pide «Dar OK» para cerrar el balance. De fábrica, $50.000.",
    },
    {
      etiqueta: "Diferencia entre balances del mismo corte",
      significado: "Desde el monto, dos balances que terminan el mismo día no coinciden y no se pueden cerrar. De fábrica, $1.000.",
    },
    {
      etiqueta: "Tolerancia de la cédula contable",
      significado: "Desde el monto, una diferencia del cruce contable de los módulos necesita marca para cerrar. De fábrica, $2.000.",
    },
    {
      etiqueta: "Diferencia por tercero",
      significado: "Desde el monto, una diferencia del cruce por tercero (Cartera y CxP) necesita marca para cerrar. De fábrica, $2.000.",
    },
    {
      etiqueta: "Saldo contrario por tercero",
      significado: "Por encima del monto, el saldo contrario de un tercero aparece en Novedades de Cartera y CxP. De fábrica, $10.000.",
    },
    {
      etiqueta: "Detalle de Activos fijos",
      significado: "Si el neto cuadra pero el costo o la depreciación difieren desde el monto, el renglón necesita marca. De fábrica, $10.000.",
    },
    { etiqueta: "Predeterminado · Personalizado", significado: "Si el umbral está en su valor predeterminado o fue cambiado." },
  ],
  relacionadas: [{ label: "Filtros de cuentas", href: "/config/prevalidador", permiso: "parametros:ver" }],
};
