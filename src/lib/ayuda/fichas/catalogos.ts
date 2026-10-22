// Ayuda en pantalla — fichas de los catálogos contables (Plan Estándar Russell, Mapeo cuentas
// cliente y Conceptos de nómina). Describen la pantalla tal como funciona hoy.

import { REGLAS } from "../reglas";
import type { FichaAyuda } from "../tipos";

const ACCIONES = "src/app/actions";

/** Conceptos de nómina: lo que impide cambiar la memoria de un cliente. */
const BLOQUEO_NOMINA_EN_FIRME =
  "No si el cliente tiene una conciliación de Nómina en firme que todavía lee esta memoria (sin copia congelada): el senior o el gerente la desbloquea antes.";

export const FICHA_PLAN_RUSSELL: FichaAyuda = {
  id: "catalogo.plan_russell",
  titulo: "Plan Estándar Russell",
  proposito:
    "El plan de cuentas estándar de Russell Bedford: el destino de toda homologación. Todos lo consultan; lo editan quienes administran el plan. La homologación de cada cliente se hace en «Mapeo cuentas cliente».",
  antesDeEmpezar: [
    "Un cambio en el plan vale para toda la plataforma: todos los clientes y todos sus balances.",
    "Una cuenta en uso no cambia de código ni se elimina: la de 4 dígitos, si tiene balances de clientes o la usan los módulos; la subcuenta de 6, si tiene balances.",
  ],
  etapas: [
    {
      titulo: "Descargar",
      acciones: [
        {
          nombre: "Descargar PUC completo",
          queHace: "Descarga en Excel el árbol (niveles 1, 2, 4 y 6) y el detalle de subcuentas, sin importar el filtro en pantalla.",
          regla: REGLAS.verPlanRussell,
        },
      ],
    },
  ],
  pestanas: [
    {
      id: "puc",
      titulo: "PUC Estándar Russell",
      proposito: "El árbol del plan: clases, grupos, cuentas de 4 dígitos y subcuentas de 6.",
      etapas: [
        {
          titulo: "Consultar",
          acciones: [
            {
              nombre: "Buscar",
              queHace: "Busca por código (prefijo, o «*» para cualquier dígito, como **05) o por nombre; conserva los niveles de arriba y de abajo de cada resultado.",
              regla: REGLAS.verPlanRussell,
            },
            {
              nombre: "Mostrar hasta · Expandir todo · Colapsar todo",
              queHace: "Elige hasta qué nivel se ve el árbol; «Expandir todo» abre hasta ese nivel.",
              regla: REGLAS.verPlanRussell,
            },
          ],
        },
        {
          titulo: "Editar",
          acciones: [
            {
              nombre: "Nueva Cuenta",
              queHace: "Crea una cuenta de 4 dígitos con su naturaleza, su nombre y el nombre de su grupo (el grupo sale de los dos primeros dígitos).",
              regla: REGLAS.administrarPlanRussell,
              fuente: { archivo: `${ACCIONES}/subgrupos.ts`, funcion: "crearSubgrupo" },
            },
            {
              nombre: "Editar una cuenta de 4 dígitos",
              queHace:
                "Al hacer clic en su fila se edita o se elimina. Si se elimina, sus subcuentas quedan y el balance las muestra solo por código.",
              regla: REGLAS.administrarPlanRussell,
              condiciones: [
                "Si está en uso —balances con subcuentas de ese grupo, la memoria del Consolidado o los filtros de cuentas de un módulo—, su código no cambia y no se elimina.",
              ],
              fuente: { archivo: `${ACCIONES}/subgrupos.ts`, funcion: "editarSubgrupo" },
            },
            {
              nombre: "Editar una subcuenta de 6 dígitos",
              queHace: "Al hacer clic en su fila se edita; para eliminarla se usa la pestaña «Detalle Subcuentas N6».",
              regla: REGLAS.administrarPlanRussell,
            },
          ],
        },
      ],
    },
    {
      id: "standard",
      titulo: "Detalle Subcuentas N6",
      proposito: "Cada subcuenta de 6 dígitos con su cuenta Russell, tipo de rubro, qué incluye, soportes y observaciones de homologación.",
      etapas: [
        {
          titulo: "Consultar",
          acciones: [
            {
              nombre: "Buscar",
              queHace: "Busca por código (prefijo o «*») o por texto en el nombre, la cuenta Russell, el tipo de rubro, qué incluye y las observaciones.",
              regla: REGLAS.verPlanRussell,
            },
          ],
        },
        {
          titulo: "Editar",
          acciones: [
            {
              nombre: "Nueva Subcuenta",
              queHace: "Crea una subcuenta con su naturaleza, cuenta Russell, tipo de rubro, cuenta padre, si es crítica, qué incluye y qué no, soportes y observaciones.",
              regla: REGLAS.administrarPlanRussell,
              fuente: { archivo: `${ACCIONES}/standard-accounts.ts`, funcion: "createStandardAccount" },
            },
            {
              nombre: "Editar cuenta estándar",
              queHace: "Al hacer clic en el código se edita la subcuenta; el cambio vale para todos los clientes.",
              regla: REGLAS.administrarPlanRussell,
              condiciones: ["Si la subcuenta ya tiene balances de clientes, su código no cambia; los demás datos sí."],
              fuente: { archivo: `${ACCIONES}/standard-accounts.ts`, funcion: "updateStandardAccount" },
            },
            {
              nombre: "Eliminar",
              queHace: "Dentro de la edición, elimina la subcuenta del plan.",
              regla: REGLAS.administrarPlanRussell,
              condiciones: ["No si la subcuenta ya tiene balances de clientes."],
              fuente: { archivo: `${ACCIONES}/standard-accounts.ts`, funcion: "deleteStandardAccount" },
            },
            {
              nombre: "Bitácora",
              queHace: "Quién creó, editó o eliminó cada cuenta de 4 dígitos y cada subcuenta, y cuándo (los últimos 1.000 movimientos).",
              regla: REGLAS.administrarPlanRussell,
            },
          ],
        },
      ],
    },
  ],
  estados: [
    { etiqueta: "Débito · Crédito", significado: "Naturaleza de la cuenta." },
    { etiqueta: "Sin ficha de cuenta", significado: "Cuenta de 4 dígitos que tiene subcuentas pero no su propia ficha: no se edita desde el árbol." },
  ],
  preguntas: [
    {
      pregunta: "¿Por qué no puedo cambiar el código de una subcuenta?",
      respuesta: "Porque ya tiene balances de clientes: moverla rompería la trazabilidad de esos balances. Los demás datos sí se editan.",
    },
    {
      pregunta: "¿Dónde homologo las cuentas de un cliente?",
      respuesta: "En «Mapeo cuentas cliente», o cuenta por cuenta desde el detalle de un balance abierto.",
    },
  ],
  relacionadas: [{ label: "Mapeo cuentas cliente", href: "/config/mapeo-cliente", permiso: "mapeo:ver" }],
};

export const FICHA_MAPEO_CLIENTE: FichaAyuda = {
  id: "catalogo.mapeo_cliente",
  titulo: "Mapeo cuentas cliente",
  proposito:
    "La homologación del PUC de cada cliente contra el Plan Estándar Russell. Reúne las cuentas de todos sus balances y las reglas guardadas; lo que se guarda aquí se usa en las próximas cargas del cliente.",
  antesDeEmpezar: [
    "La lista de clientes incluye a los que tienen al menos un balance cargado.",
    "Homologar se hace sobre los clientes donde puedes revisar balances; los demás roles consultan.",
  ],
  etapas: [
    {
      titulo: "Revisar",
      acciones: [
        { nombre: "Cliente", queHace: "Elige el cliente (busca por nombre o NIT).", regla: REGLAS.verPlanRussell },
        {
          nombre: "Buscar · Nivel · Origen",
          queHace: "Filtran por código o nombre, por nivel (N4, N6, N8…) y por origen (manual, automático, sin asignar).",
          regla: REGLAS.verPlanRussell,
        },
        {
          nombre: "Revisar · Por confirmar · Cruza de clase",
          queHace:
            "«Revisar»: cuentas homologadas distinto de la regla de su grupo. «Por confirmar»: sin cuenta estándar o con coincidencia menor al 100 %. «Cruza de clase»: homologadas a otra clase contable.",
          regla: REGLAS.verPlanRussell,
        },
        {
          nombre: "Procedencia",
          queHace:
            "Cada regla dice si vino de la configuración, de un balance o de una carga, con enlace al balance de origen cuando sigue disponible y está en tu cartera.",
          regla: REGLAS.verPlanRussell,
        },
      ],
    },
    {
      titulo: "Homologar",
      acciones: [
        {
          nombre: "Asignar · Corregir · Confirmar / editar",
          queHace:
            "Abre «Homologar»: eliges la cuenta estándar Russell (6 dígitos) y si aplica a «Solo esta cuenta» o a todo el grupo de 6 dígitos, que reemplaza sus excepciones.",
          regla: REGLAS.revisarBalance,
          condiciones: ["Solo cuentas de 4 dígitos o más."],
          fuente: { archivo: `${ACCIONES}/homologacion-cliente.ts`, funcion: "guardarHomologacionCliente" },
        },
        {
          nombre: "Aplicar también a balances existentes",
          queHace:
            "Además de guardar la regla, actualiza los balances abiertos del cliente que tienen esa cuenta, en todos sus períodos y versiones, sin tocar los importes. Antes muestra cuántos balances y filas cambian.",
          regla: REGLAS.revisarBalance,
          condiciones: [
            "Viene desmarcada cada vez.",
            "Los balances cerrados nunca se tocan.",
            "Si el cambio afectaría una cuenta que un módulo concilió en firme, no se guarda nada.",
          ],
        },
        { nombre: "Nueva regla", queHace: "Crea una regla para una cuenta que escribes a mano.", regla: REGLAS.revisarBalance },
        {
          nombre: "Quitar regla",
          queHace: "Retira la regla para las próximas cargas: la cuenta vuelve a la regla de su grupo. Los balances ya cargados no cambian.",
          regla: REGLAS.revisarBalance,
          fuente: { archivo: `${ACCIONES}/mapeo-cliente.ts`, funcion: "eliminarMapeoCliente" },
        },
      ],
    },
  ],
  estados: [
    { etiqueta: "Manual", significado: "Regla del grupo de 6 dígitos: vale para todas sus cuentas." },
    { etiqueta: "Solo esta cuenta", significado: "Excepción que aplica solo a ese código." },
    { etiqueta: "Automático", significado: "Homologación que dedujo el sistema." },
    { etiqueta: "Sin asignar", significado: "Cuenta sin cuenta estándar." },
    { etiqueta: "Último balance", significado: "Cuenta vista en el último balance que aún no tiene regla guardada." },
    { etiqueta: "Difiere de su grupo", significado: "La cuenta está homologada distinto de la regla de su grupo." },
  ],
  preguntas: [
    {
      pregunta: "¿Cambian los balances que ya cargué?",
      respuesta: "Solo si marcas «Aplicar también a balances existentes», y nunca los cerrados. Sin eso, la regla rige desde la próxima carga.",
    },
    {
      pregunta: "¿Por qué no se guardó la homologación?",
      respuesta:
        "Si el cambio afectaría una cuenta que un módulo concilió en firme, no se guarda nada. Pide al senior o al gerente del cliente que desbloquee la conciliación.",
    },
  ],
  relacionadas: [
    { label: "Plan Estándar Russell", href: "/config/mapeo", permiso: "mapeo:ver" },
    { label: "Balance de comprobación", href: "/balance", permiso: "balance:ver" },
  ],
};

export const FICHA_CONCEPTOS_NOMINA: FichaAyuda = {
  id: "catalogo.conceptos_nomina",
  titulo: "Conceptos de nómina",
  proposito:
    "Qué cuenta contable del cliente —y su cuenta Russell— corresponde a cada concepto de la nómina de cada cliente. El código del concepto es la llave con la que se homologa el archivo de nómina.",
  antesDeEmpezar: [
    "Se consultan los conceptos de todos los clientes; se cargan y eliminan en los clientes donde estás asignado como staff o senior.",
    "Para cambiar la cuenta de un solo concepto se usa el Consolidado de un cargue de Nómina.",
  ],
  etapas: [
    {
      titulo: "Consultar",
      acciones: [
        { nombre: "Cliente", queHace: "Elige de qué cliente ver los conceptos, o todos.", regla: REGLAS.verConceptosNomina },
        {
          nombre: "Buscar",
          queHace: "Filtra por cliente, código, concepto, grupo, centro de costo o cuenta.",
          regla: REGLAS.verConceptosNomina,
        },
      ],
    },
    {
      titulo: "Cargar en bloque",
      acciones: [
        {
          nombre: "Cargar plantilla Excel",
          queHace:
            "Importa la plantilla: cliente, grupo, código, nombre (opcional), cuenta del cliente o Russell (varias separadas con «;») y centro de costo. Una fila sin código pero con nombre se guarda por nombre.",
          regla: REGLAS.editarModulo,
          condiciones: [
            "Todo o nada: con un solo error no se importa nada.",
            "Cada concepto y centro reemplaza sus cuentas; lo que no viene en el archivo queda igual.",
            BLOQUEO_NOMINA_EN_FIRME,
          ],
          fuente: { archivo: `${ACCIONES}/import-conceptos-nomina.ts`, funcion: "importarConceptosNomina" },
        },
        {
          nombre: "Descargar plantilla Excel",
          queHace: "Descarga la plantilla, con las listas de tus clientes y de las cuentas de Nómina.",
          regla: REGLAS.descargarPlantillaConceptos,
        },
        {
          nombre: "Cargar catálogo del ERP",
          queHace: "Importa el catálogo de conceptos tal como lo saca el ERP del cliente; la hoja se reconoce sola o se indica.",
          regla: REGLAS.editarModulo,
          condiciones: ["Todo o nada, como la plantilla.", BLOQUEO_NOMINA_EN_FIRME],
          fuente: { archivo: `${ACCIONES}/import-conceptos-nomina.ts`, funcion: "importarCatalogoConceptosErp" },
        },
      ],
    },
    {
      titulo: "Eliminar",
      acciones: [
        {
          nombre: "Eliminar concepto (papelera)",
          queHace: "Elimina el concepto de ese centro de costo con todas sus cuentas. Los cargues ya hechos no cambian.",
          regla: REGLAS.editarModulo,
          condiciones: [BLOQUEO_NOMINA_EN_FIRME],
          fuente: { archivo: `${ACCIONES}/import-conceptos-nomina.ts`, funcion: "eliminarConceptoNomina" },
        },
      ],
    },
  ],
  estados: [
    { etiqueta: "por nombre · por cuenta", significado: "Concepto guardado por su nombre o por la cuenta del cliente: aplica a los cargues que agrupan así." },
    { etiqueta: "control", significado: "Cuenta de pasivo o activo (deducciones): no cruza contra el gasto." },
    { etiqueta: "sin Russell", significado: "La cuenta del cliente no tiene cuenta Russell; por ejemplo, la clase «00», que decide el centro de costo." },
    { etiqueta: "Carga masiva · Manual · Sugerido", significado: "De dónde salió la cuenta del concepto." },
  ],
  preguntas: [
    {
      pregunta: "¿Por qué la importación no cargó nada?",
      respuesta: "Es todo o nada: la lista de problemas dice qué fila corregir. Los avisos (sin bloquear) no impiden la carga.",
    },
    {
      pregunta: "¿Cómo cambio la cuenta de un solo concepto?",
      respuesta: "En el Consolidado de un cargue de Nómina: lo que se guarda allí queda en esta misma memoria.",
    },
  ],
  relacionadas: [{ label: "Nómina", href: "/modulos/nom", permiso: "modulos_datos:ver" }],
};
