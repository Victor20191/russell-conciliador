// Ayuda en pantalla — fichas de los módulos de conciliación. Se arman con el descriptor de cada
// módulo: el texto lleva su nombre y lo que solo aplica a algunos va con `aplica`.

import type { DescriptorModulo } from "@/lib/modulos/descriptores";
import { REGLAS } from "../reglas";
import type { AplicaModulo, FichaAyuda } from "../tipos";

const ACCIONES_MODULOS = "src/app/actions/modulos-datos.ts";

const esInv: AplicaModulo = (d) => d.codigo === "INV";
const noInv: AplicaModulo = (d) => d.codigo !== "INV";
const esIng: AplicaModulo = (d) => d.codigo === "ING";
const esAfi: AplicaModulo = (d) => d.codigo === "AFI";
const esNomina: AplicaModulo = (d) => !!d.nomina;
const noNomina: AplicaModulo = (d) => !d.nomina;
const porTercero: AplicaModulo = (d) => d.crucePorTercero.habilitado;
const conVerificaciones: AplicaModulo = (d) => (d.verificaciones?.length ?? 0) > 0;

function requisitoBalance(d: DescriptorModulo): string {
  return porTercero(d)
    ? "Para cruzar contra la contabilidad hace falta un balance «Por terceros» cerrado que termine en el mismo mes de corte, con el prevalidador aprobado."
    : "Para cruzar contra la contabilidad hace falta un balance cerrado que termine en el mismo mes de corte, con el prevalidador aprobado.";
}

function erroresDelReporte(d: DescriptorModulo): string[] {
  if (porTercero(d)) {
    return ["Sin errores del reporte (un documento repetido por el mismo valor en dos terceros o un vencimiento imposible): se corrigen en el ERP y se vuelve a cargar; omitir filas no los quita."];
  }
  if (esNomina(d)) {
    return ["Sin cédulas con varios nombres en el reporte: se corrige en el ERP y se vuelve a cargar; omitir filas no lo quita."];
  }
  return [];
}

function motivosNoCierre(d: DescriptorModulo): string {
  const extra = [
    porTercero(d) ? "el cruce por tercero no disponible o diferencias por tercero sin marca" : null,
    esNomina(d) ? "diferencias del control de deducciones sin marca" : null,
    esAfi(d) ? "depreciación sin emparejar con su activo (ninguna marca lo resuelve)" : null,
  ].filter(Boolean);
  return [
    "La ventana de cierre dice qué falta: diferencias sin marca o marcas desactualizadas, comentarios de alertas pendientes en Novedades",
    ...extra,
  ].join(", ") + ".";
}

export function fichaModuloCargados(d: DescriptorModulo): FichaAyuda {
  return {
    id: "modulo.cargados",
    titulo: d.label,
    proposito: `Los archivos de ${d.label} cargados por cliente y período. Desde aquí se carga un archivo nuevo, se agrega otro al mismo cargue o se elimina un cargue.`,
    antesDeEmpezar: [
      "La lista muestra los clientes de tu cartera.",
      "Al cargar se confirma el aplicativo del archivo; si no estaba en la ficha del cliente, se agrega.",
      requisitoBalance(d),
    ],
    etapas: [
      {
        titulo: "Cargar",
        acciones: [
          {
            nombre: `Cargar ${d.label}`,
            queHace:
              "Abre la carga: eliges cliente, aplicativo, archivo y período. Si el archivo coincide en un 80 % o más con un patrón del aplicativo se lee solo; si no, puedes configurar la lectura o elegir «Formato propio» y mapear las columnas a mano. Con «Formato propio», si el cliente tiene un formato guardado que coincida, se aplica su mapeo («No usar este formato» vuelve a la sugerencia automática).",
            regla: REGLAS.cargarModulo,
            condiciones: [
              "El período no puede ser futuro y se confirma con «Sí, es correcto».",
              "No se carga sobre un período con la conciliación en firme.",
            ],
            fuente: { archivo: ACCIONES_MODULOS, funcion: "leerDatosModulo" },
          },
          {
            nombre: "Preparar borrador",
            queHace:
              "La asistencia de lectura prepara el borrador del inventario. Si el formato cambió, muestra lo que entendió y pregunta solo lo que no está claro; también se puede enseñar con el «Diseñador de formato».",
            regla: REGLAS.cargarModulo,
            aplica: esInv,
          },
          {
            nombre: "¿El archivo trae el valor total?",
            queHace: "Con «Sí, confirmo su ubicación» ubicas la celda del total para comprobar que el archivo cuadra; con «No trae total» se lee sin ese control.",
            regla: REGLAS.cargarModulo,
            aplica: noInv,
          },
          {
            nombre: "¿Qué trae este archivo?",
            queHace:
              "«Facturas y notas crédito», «Solo facturas» o «Solo notas crédito», y con qué signo vienen las ventas y las notas crédito. Las notas crédito quedan en renglones propios «Notas crédito · …».",
            regla: REGLAS.cargarModulo,
            aplica: esIng,
          },
          {
            nombre: "¿Confirmas que excluye el IVA?",
            queHace: "Si la columna del valor dice «total», el mapeo pide confirmar que no incluye el IVA antes de leer.",
            regla: REGLAS.cargarModulo,
            aplica: esIng,
          },
          {
            nombre: "¿Qué trae este archivo?",
            queHace:
              "«Costo y depreciación acumulada», «Solo el costo de los activos» o «Solo la depreciación acumulada». Si trae un solo lado y el período ya tiene cargue, se ofrece agregarlo a esa versión.",
            regla: REGLAS.cargarModulo,
            aplica: esAfi,
          },
          {
            nombre: "¿Separar por centro de costo? · ¿Cómo agrupar los conceptos?",
            queHace:
              "Decides si cada concepto se separa por centro de costo y si los conceptos se agrupan por código, por nombre o por cuenta contable del cliente (llega marcada la última que usó el cliente).",
            regla: REGLAS.cargarModulo,
            aplica: esNomina,
          },
          {
            nombre: "TRM de cierre · Fecha de corte",
            queHace:
              "Si la hoja o los importes vienen en divisa se pide la TRM («Oficial» la trae); la fecha de corte es contra la que se miden los días vencidos y las edades.",
            regla: REGLAS.cargarModulo,
            aplica: porTercero,
          },
          {
            nombre: "Configurar la lectura aquí",
            queHace: "Si ningún patrón coincide, mapeas las columnas tú mismo y pruebas el mapeo antes de crear el borrador.",
            regla: REGLAS.cargarModulo,
            aplica: noInv,
          },
          {
            nombre: "Crear patrón",
            queHace: "Desde un archivo sin patrón, abre «Nuevo patrón» con ese archivo como muestra.",
            regla: REGLAS.administrarPatrones,
          },
        ],
      },
      {
        titulo: "Agregar o eliminar",
        acciones: [
          {
            nombre: "Agregar otro archivo al cargue (+)",
            queHace: "Suma otro archivo al mismo cargue del período, sin crear una versión nueva.",
            regla: REGLAS.cargarModulo,
            condiciones: ["Solo en la versión vigente y con el período sin conciliación en firme."],
          },
          {
            nombre: "Eliminar cargue",
            queHace: "Elimina «Solo esta versión» o «Todo este período» (incluye las marcas del cruce del período y sus soportes).",
            regla: REGLAS.eliminarModulo,
            condiciones: ["No con la conciliación del período en firme."],
            fuente: { archivo: ACCIONES_MODULOS, funcion: "eliminarDatosModulo" },
          },
          {
            nombre: `Todos los ${d.label} del cliente y sus perfiles de carga`,
            queHace: "Alcance de «Eliminar cargue» que borra todo el historial del cliente en el módulo junto con sus perfiles de formato.",
            regla: REGLAS.eliminarHistorialModulo,
            condiciones: ["No si hay conciliaciones del módulo en firme."],
            fuente: { archivo: ACCIONES_MODULOS, funcion: "eliminarDatosModulo" },
          },
        ],
      },
      {
        titulo: "Consultar",
        acciones: [
          { nombre: "Ver cargue", queHace: "Abre el cargue: Consolidado, cruce contable y novedades.", regla: REGLAS.verModulo },
          { nombre: "Estado: Todos · Vigente · Cerrado", queHace: "Filtra los períodos por conciliación en firme.", regla: REGLAS.verModulo },
        ],
      },
    ],
    estados: [
      { etiqueta: "vN vigente", significado: "La versión que cuenta en el período." },
      {
        etiqueta: "Vigente · Cerrado",
        significado: "«Cerrado» es un período con la conciliación en firme: queda de solo lectura hasta que el senior o el gerente asignado la desbloquee.",
      },
      { etiqueta: "N archivos · anexo", significado: "Cargue armado con varios archivos del mismo período." },
      {
        etiqueta: "Origen del mapeo",
        significado: "Cómo se leyó el archivo: patrón de archivo, perfil guardado, mapeo manual o sugerencia automática.",
      },
      { etiqueta: "Facturas · Notas crédito", significado: "Qué trae cada archivo del cargue.", aplica: esIng },
    ],
    preguntas: [
      {
        pregunta: "¿Por qué no veo las pestañas Borradores y Patrones?",
        respuesta: "Se ven con el permiso para cargar datos de módulos. Sin él, el módulo se consulta desde «Cargados».",
      },
      {
        pregunta: "No me deja cargar un período, ¿por qué?",
        respuesta:
          "Si la conciliación de ese período está en firme, no se carga otro archivo ni otra versión hasta que el senior o el gerente asignado la desbloquee.",
      },
    ],
    relacionadas: [
      { label: `Filtros de cuentas · ${d.label}`, href: `/config/prevalidador/${d.codigo.toLowerCase()}`, permiso: "parametros:ver" },
      { label: "Conceptos de nómina", href: "/config/conceptos-nomina", permiso: "modulos_datos:ver", aplica: esNomina },
      { label: "Balance de comprobación", href: "/balance", permiso: "balance:ver" },
    ],
  };
}

export function fichaModuloBorradores(d: DescriptorModulo): FichaAyuda {
  return {
    id: "modulo.borradores",
    titulo: `Borradores · ${d.label}`,
    proposito: "Lo que se leyó de cada archivo antes de confirmar la carga. Nada de esto es oficial hasta «Confirmar carga».",
    etapas: [
      {
        titulo: "Revisar o descartar",
        acciones: [
          { nombre: "Revisar borrador", queHace: "Abre el borrador para revisarlo y confirmar la carga.", regla: REGLAS.cargarModulo },
          {
            nombre: "Descartar borrador",
            queHace: "Elimina el borrador, su lectura y sus comentarios. El archivo original queda en la bitácora como descartado.",
            regla: REGLAS.cargarModulo,
            condiciones: ["Pide confirmación en la misma fila."],
            fuente: { archivo: ACCIONES_MODULOS, funcion: "descartarBorradorModulo" },
          },
          {
            nombre: "Continuar lectura",
            queHace: "En «Lecturas por completar», retoma una lectura del inventario sin volver a subir el archivo.",
            regla: REGLAS.cargarModulo,
            aplica: esInv,
          },
        ],
      },
    ],
    estados: [
      { etiqueta: "Por confirmar", significado: "Borrador listo para revisar y confirmar." },
      {
        etiqueta: "Anexo a vN",
        significado: "Al confirmar, se agrega a esa versión. «· ya no vigente»: esa versión ya no es la vigente y al confirmar se crea una versión nueva.",
      },
      { etiqueta: "N omitida(s)", significado: "Filas que quedaron fuera de la carga." },
      {
        etiqueta: "Lectura en curso · Lista para reintentar · Necesita una respuesta",
        significado: "Estado de una lectura del inventario que aún no llega a borrador.",
        aplica: esInv,
      },
    ],
  };
}

export function fichaModuloBorrador(d: DescriptorModulo): FichaAyuda {
  return {
    id: "modulo.borrador",
    titulo: `Borrador · ${d.label}`,
    proposito: "Revisa lo que se leyó del archivo, corrige filas y confirma la carga.",
    antesDeEmpezar: ["Las ediciones de filas quedan pendientes hasta «Guardar cambios»."],
    etapas: [
      {
        titulo: "Revisar la lectura",
        acciones: [
          {
            nombre: "Validación del archivo",
            queHace: "Compara la suma de las filas con el total del archivo: «Cuadra», «No cuadra», «Sin total en el archivo» o «No validado».",
            regla: REGLAS.cargarModulo,
          },
          {
            nombre: "Consolidado por grupo · toca para filtrar",
            queHace: "Los chips de arriba filtran la tabla por grupo o por novedades.",
            regla: REGLAS.cargarModulo,
          },
          { nombre: "Exportar a Excel", queHace: "Descarga lo guardado del borrador.", regla: REGLAS.cargarModulo },
          { nombre: "Versiones (N)", queHace: "Otros borradores del mismo cliente y período.", regla: REGLAS.cargarModulo },
          {
            nombre: "Corregir lectura",
            queHace: "Relee el original con la asistencia y compara: «Aplicar nueva lectura» o «Conservar lectura actual».",
            regla: REGLAS.cargarModulo,
            condiciones: ["Sin cambios sin guardar."],
            aplica: esInv,
          },
          {
            nombre: "Diseñador de formato",
            queHace: "Armas uno o dos productos de ejemplo sobre el archivo original para enseñar al sistema a leerlo.",
            regla: REGLAS.cargarModulo,
            aplica: esInv,
          },
        ],
      },
      {
        titulo: "Corregir",
        acciones: [
          {
            nombre: "Omitir · Incluir · Marcar total · Agrupador: Asignar",
            queHace: "Edición por fila o de varias filas seleccionadas; queda pendiente hasta «Guardar cambios».",
            regla: REGLAS.cargarModulo,
          },
          {
            nombre: "Poner nombre",
            queHace: "Nombra las filas «(sin clasificar)» o «GLOBAL» para que formen su propio renglón en el Consolidado.",
            regla: REGLAS.cargarModulo,
            aplica: noNomina,
          },
          {
            nombre: "Agrupar por",
            queHace: "Reagrupa el borrador por código, nombre o cuenta contable del cliente; el cargue queda agrupado así.",
            regla: REGLAS.cargarModulo,
            condiciones: ["No en un archivo agregado a otro cargue.", "Guarda o descarta los cambios antes."],
            aplica: esNomina,
          },
          {
            nombre: "Período (AAAA-MM)",
            queHace: "Cambia el período del borrador; se confirma con «Sí, es correcto» y se guarda.",
            regla: REGLAS.cargarModulo,
            condiciones: ["No un mes futuro.", "Fijo si el archivo se agrega a la versión vigente."],
          },
          {
            nombre: "Guardar cambios",
            queHace: "Guarda omisiones, totales, agrupadores y período.",
            regla: REGLAS.cargarModulo,
            fuente: { archivo: ACCIONES_MODULOS, funcion: "aplicarCambiosBorradorModulo" },
          },
          {
            nombre: "Descartar cambios",
            queHace: "Deshace las ediciones de filas y el cambio de período que aún no se han guardado. El borrador se conserva.",
            regla: REGLAS.cargarModulo,
            condiciones: ["Solo aparece con cambios sin guardar."],
          },
          {
            nombre: "Descartar borrador",
            queHace: "Elimina el borrador completo, su lectura y sus comentarios. Pide confirmar con «Confirmar descarte».",
            regla: REGLAS.cargarModulo,
            fuente: { archivo: ACCIONES_MODULOS, funcion: "descartarBorradorModulo" },
          },
          {
            nombre: "Comentario de la fila",
            queHace: "Conversación de una fila del borrador, con menciones.",
            regla: REGLAS.comentarBorradorModulo,
          },
        ],
      },
      {
        titulo: "Confirmar",
        acciones: [
          {
            nombre: "Verificaciones",
            queHace: "Consignación recibida, consignación entregada y mercancía en tránsito: «Sí», «No» o «No aplica», con observación opcional. Son obligatorias.",
            regla: REGLAS.cargarModulo,
            aplica: conVerificaciones,
          },
          {
            nombre: "Guardar este formato como patrón",
            queHace: "Al confirmar, guarda el formato como patrón del aplicativo que sirve solo para este cliente hasta que un administrador lo apruebe.",
            regla: REGLAS.cargarModulo,
          },
          {
            nombre: "Guardar como formato propio",
            queHace: "Con «Formato propio», guarda los títulos y el mapeo para reconocer el archivo del cliente la próxima vez.",
            regla: REGLAS.cargarModulo,
          },
          {
            nombre: "Confirmar carga",
            queHace: "Convierte el borrador en el cargue oficial: una versión nueva o un archivo agregado a la versión vigente.",
            regla: REGLAS.cargarModulo,
            condiciones: [
              "Sin cambios sin guardar y con un período válido.",
              ...(conVerificaciones(d) ? ["Verificaciones respondidas."] : []),
              ...(esInv(d) ? ["Sin una lectura pendiente de resolver."] : []),
              ...erroresDelReporte(d),
              "El período no tiene la conciliación en firme.",
            ],
            fuente: { archivo: ACCIONES_MODULOS, funcion: "cargarBorradorModulo" },
          },
        ],
      },
    ],
    estados: [
      { etiqueta: "en cero · no se carga", significado: "Fila con valor cero: no entra al cargue." },
      { etiqueta: "Anexo", significado: "El archivo se agregará a la versión indicada; se muestra el total combinado." },
    ],
    preguntas: [
      {
        pregunta: "¿Por qué no se habilita «Confirmar carga»?",
        respuesta: "Falta guardar los cambios, confirmar el período o resolver una novedad que bloquea la carga; el aviso en rojo dice cuál.",
      },
    ],
  };
}

export function fichaModuloPatrones(d: DescriptorModulo): FichaAyuda {
  return {
    id: "modulo.patrones",
    titulo: `Patrones de archivo · ${d.label}`,
    proposito:
      "Los formatos de archivo de cada aplicativo. Un archivo que coincide en un 80 % o más con un patrón se carga sin configurar columnas.",
    etapas: [
      {
        titulo: "Consultar",
        acciones: [
          { nombre: "Por revisar · En uso · Inactivos", queHace: "Filtra las versiones por estado.", regla: REGLAS.verPatrones },
          {
            nombre: "vN",
            queHace: "Despliega la versión: rótulos, totales, evidencia, diferencias, nota, aprobación y último uso.",
            regla: REGLAS.verPatrones,
          },
          { nombre: "Nombre de la muestra", queHace: "Descarga el archivo de muestra de la versión.", regla: REGLAS.verPatrones },
        ],
      },
      {
        titulo: "Administrar",
        acciones: [
          {
            nombre: "Nuevo patrón · Nueva versión · Nueva a partir de esta",
            queHace: "Crea una versión a partir de una muestra, con el mapeo de columnas y la prueba de lectura.",
            regla: REGLAS.administrarPatrones,
          },
          {
            nombre: "Probar el mapeo",
            queHace: "Muestra las primeras filas tal como las leería el sistema, antes de guardar.",
            regla: REGLAS.administrarPatrones,
          },
          {
            nombre: "Aprobar · Reactivar",
            queHace: "Deja la versión en uso para todos los clientes del aplicativo.",
            regla: REGLAS.administrarPatrones,
            condiciones: ["Necesita muestra.", ...(porTercero(d) ? ["Necesita el tipo de formato declarado."] : [])],
          },
          {
            nombre: "Declarar tipo · Cambiar tipo",
            queHace: "Fija el tipo de formato (por documento, por edades o ambos) sin tocar las columnas.",
            regla: REGLAS.administrarPatrones,
            aplica: porTercero,
          },
          {
            nombre: "Subir muestra · Generar muestra",
            queHace: "Sube una muestra o genera una copia recortada del original, con las personas reemplazadas por datos ficticios.",
            regla: REGLAS.administrarPatrones,
          },
          { nombre: "Editar", queHace: "Cambia una versión pendiente que tiene muestra.", regla: REGLAS.administrarPatrones },
          { nombre: "Indicar cliente", queHace: "Anota de qué cliente salió la muestra (solo de consulta).", regla: REGLAS.administrarPatrones },
          { nombre: "Desactivar", queHace: "Saca la versión de uso; los cargues hechos con ella no cambian.", regla: REGLAS.administrarPatrones },
          {
            nombre: "Borrar",
            queHace: "Borra la versión y su muestra; los cargues hechos con ella no cambian.",
            regla: REGLAS.administrarPatrones,
            condiciones: ["Solo una versión pendiente o inactiva: la aprobada se desactiva antes."],
          },
        ],
      },
    ],
    estados: [
      { etiqueta: "Pendiente", significado: "Versión en revisión: aún no se usa para todos." },
      {
        etiqueta: "Validada para el cliente",
        significado: "Guardada al confirmar una carga: sirve solo para ese cliente hasta que un administrador la apruebe.",
      },
      { etiqueta: "Aprobada", significado: "En uso para todos los clientes del aplicativo." },
      { etiqueta: "Inactiva", significado: "Fuera de uso." },
      { etiqueta: "Copia del original", significado: "Muestra generada desde el archivo original, con personas ficticias." },
      { etiqueta: "Sin muestra", significado: "La versión no tiene muestra: no se puede aprobar." },
    ],
  };
}

export function fichaModuloFormatosPropios(d: DescriptorModulo): FichaAyuda {
  return {
    id: "modulo.formatos_propios",
    titulo: `Formatos propios · ${d.label}`,
    proposito:
      "Los formatos propios de cada cliente, mapeados a mano al cargar con la opción «Formato propio»: los títulos con que se reconoce su archivo y el mapeo de columnas. Un archivo del mismo cliente con 80 % o más de coincidencia en los títulos se lee con ese mapeo. A diferencia de los patrones de archivo, no se comparten con otros clientes.",
    etapas: [
      {
        titulo: "Consultar y borrar",
        acciones: [
          { nombre: "N títulos", queHace: "Despliega los títulos con que se reconoce el archivo.", regla: REGLAS.verPatrones },
          { nombre: "Borrar", queHace: "Borra el formato propio del cliente.", regla: REGLAS.administrarPatrones },
        ],
      },
    ],
    estados: [{ etiqueta: "Formato anterior · solo coincidencia exacta", significado: "Formato sin títulos guardados: solo reconoce el mismo encabezado." }],
    preguntas: [
      {
        pregunta: "¿Cómo se crea un formato propio?",
        respuesta: "Al confirmar un cargue hecho con la opción «Formato propio», con la casilla «Guardar como formato propio» marcada.",
      },
    ],
  };
}

export function fichaModuloCargue(d: DescriptorModulo): FichaAyuda {
  return {
    id: "modulo.cargue",
    titulo: `Cargue de ${d.label}`,
    proposito:
      "Un cargue del módulo: a qué cuenta va cada grupo (Consolidado), el detalle del archivo, el cruce contra el balance y las novedades. Aquí se marca cada diferencia y se cierra la conciliación en firme.",
    antesDeEmpezar: [requisitoBalance(d), "Con la conciliación en firme, el cargue es de solo lectura."],
    etapas: [
      {
        titulo: "Consultar",
        acciones: [
          { nombre: "Exportar a Excel", queHace: "Descarga el detalle, el Consolidado y los cruces del cargue.", regla: REGLAS.verModulo },
          { nombre: "Conversación", queHace: "Comentarios del cargue al pie de la página, con menciones.", regla: REGLAS.comentarModulo },
        ],
      },
    ],
    pestanas: [
      {
        id: "consolidado",
        titulo: "Consolidado",
        proposito:
          "Un renglón por cada grupo del archivo con la cuenta del Plan Russell a la que va. Lo asignado se recuerda para los próximos meses del cliente; los cambios se guardan solos.",
        etapas: [
          {
            titulo: "Asignar cuentas",
            acciones: [
              {
                nombre: "+ cuenta · Buscar…",
                queHace:
                  "Asigna una o varias cuentas al renglón. Una cuenta fuera de las del módulo vale solo para este período (lleva la marca «Solo» con el período) y no queda en la memoria del cliente.",
                regla: REGLAS.editarModulo,
                condiciones: ["No con la conciliación en firme."],
              },
              { nombre: "Asignar cuentas (N)…", queHace: "Asigna cuentas a varios renglones seleccionados a la vez.", regla: REGLAS.editarModulo },
              {
                nombre: "Guardar propuestas (N)",
                queHace: "Graba las cuentas que propone el sistema; mientras no se guarden, no cruzan.",
                regla: REGLAS.editarModulo,
              },
              {
                nombre: "Usar",
                queHace: "Toma la cuenta que sugiere el archivo o la memoria del cliente para ese renglón.",
                regla: REGLAS.editarModulo,
                aplica: (m) => esAfi(m) || esNomina(m),
              },
              {
                nombre: "Agrupar por",
                queHace: "Cambia cómo se agrupan los conceptos del cargue: código, nombre o cuenta contable del cliente.",
                regla: REGLAS.editarModulo,
                aplica: esNomina,
              },
              {
                nombre: "Clases por centro de costo",
                queHace: "Indica a qué clase (51, 52, 72 o 73) va el gasto de cada centro de costo; se recuerda para el cliente.",
                regla: REGLAS.editarModulo,
                aplica: esNomina,
              },
              {
                nombre: "Mostrar: Todos · Cuentas del módulo · Propuesta sin guardar · Sin cuenta",
                queHace: "Filtra los renglones según lo que hacen en el cruce.",
                regla: REGLAS.verModulo,
              },
            ],
          },
        ],
      },
      {
        id: "detalle",
        titulo: "Detalle",
        proposito: "Las filas del archivo agrupadas, solo para consulta.",
        etapas: [
          {
            titulo: "Consultar",
            acciones: [
              { nombre: "Filtros por columna · Ver más filas", queHace: "Busca y recorre las filas del archivo.", regla: REGLAS.verModulo },
              { nombre: "Comentario de la fila", queHace: "Conversación de una fila del cargue.", regla: REGLAS.comentarModulo },
            ],
          },
        ],
      },
      {
        id: "cruce",
        titulo: "Cruce contable",
        proposito:
          "Compara lo que suma el módulo en cada cuenta contra el saldo final del balance cerrado. Cada diferencia desde la tolerancia necesita una marca para poder cerrar.",
        etapas: [
          {
            titulo: "Revisar",
            acciones: [
              {
                nombre: "Qué compone (›)",
                queHace: "Despliega las cuentas del cliente y los conceptos del archivo que forman el renglón.",
                regla: REGLAS.verModulo,
              },
              { nombre: "Ocultar las cuentas en cero", queHace: "Esconde los renglones en cero sin marca.", regla: REGLAS.verModulo },
              {
                nombre: "Costo · Depreciación · Neto",
                queHace: "Cada renglón compara las tres columnas; «Revisar columnas» indica una reclasificación entre costo y depreciación.",
                regla: REGLAS.verModulo,
                aplica: esAfi,
              },
              {
                nombre: "Cuentas solo visibles",
                queHace: "Se muestran al final, cerradas, y no cuentan para la conciliación.",
                regla: REGLAS.verModulo,
                aplica: esNomina,
              },
            ],
          },
          {
            titulo: "Marcar diferencias",
            acciones: [
              {
                nombre: "Poner una marca (+)",
                queHace:
                  "Documenta la diferencia: detalle obligatorio, referencia al anexo y hasta 5 soportes de 10 MB. Puede dejar fuera cuentas no modulares del balance o conceptos no contabilizados del archivo.",
                regla: REGLAS.editarModulo,
                condiciones: ["Por debajo de la tolerancia la marca es opcional.", "No con la conciliación en firme."],
                fuente: { archivo: ACCIONES_MODULOS, funcion: "guardarMarcaCruce" },
              },
              {
                nombre: "Editar la marca · Retirar la marca",
                queHace: "Cambia la marca o la retira junto con sus soportes. Una marca que perdió su renglón se puede pasar al renglón actual.",
                regla: REGLAS.editarModulo,
              },
              {
                nombre: "Control de deducciones",
                queHace:
                  "Los conceptos que van a cuentas de pasivo, activo o ingreso del cliente, comparados con su saldo; toda diferencia necesita marca para cerrar.",
                regla: REGLAS.editarModulo,
                aplica: esNomina,
              },
            ],
          },
          {
            titulo: "Cerrar la conciliación",
            acciones: [
              {
                nombre: "Cerrar conciliación",
                queHace:
                  "«Cerrar en firme» deja en firme el saldo final y la homologación de las cuentas del módulo en el balance, vuelve de solo lectura el cargue y guarda una copia de lo conciliado.",
                regla: REGLAS.cerrarConciliacion,
                condiciones: [
                  "Toda diferencia desde la tolerancia tiene marca vigente.",
                  "Cada alerta que lo exige tiene su comentario en Novedades.",
                  ...(porTercero(d) ? ["El cruce por tercero está disponible y sus diferencias tienen marca."] : []),
                  ...(esNomina(d) ? ["El control de deducciones está marcado."] : []),
                  ...(esAfi(d) ? ["Toda depreciación está emparejada con su activo."] : []),
                ],
                fuente: { archivo: ACCIONES_MODULOS, funcion: "cerrarConciliacionModulo" },
              },
              {
                nombre: "Desbloquear",
                queHace: "Libera las cuentas en firme y vuelve a permitir cambios, con una justificación de al menos 10 caracteres.",
                regla: REGLAS.desbloquearConciliacion,
                fuente: { archivo: ACCIONES_MODULOS, funcion: "desbloquearConciliacion" },
              },
            ],
          },
        ],
      },
      {
        id: "subcuenta",
        titulo: "Cruce por subcuenta - Cuentas cliente",
        proposito:
          "Compara por subcuenta PUC, sumando las clases 51, 52, 72 y 73, las cuentas del cliente contra los conceptos de nómina. Es solo de consulta y no decide el cierre.",
        aplica: esNomina,
        etapas: [
          {
            titulo: "Consultar",
            acciones: [
              {
                nombre: "Subcuenta (›)",
                queHace: "Despliega las cuentas del cliente y los conceptos de cada subcuenta. Estados: Cuadra, Diferencia, Solo contabilidad, Solo nómina.",
                regla: REGLAS.verModulo,
              },
            ],
          },
        ],
      },
      {
        id: "cruceTercero",
        titulo: "Cruce por tercero",
        proposito: "Compara el saldo de cada tercero en el balance contra el auxiliar del módulo. Es obligatorio para cerrar la conciliación.",
        aplica: porTercero,
        etapas: [
          {
            titulo: "Emparejar terceros",
            acciones: [
              {
                nombre: "Validar coherencia… (N)",
                queHace:
                  "Aplica en lote los emparejamientos que propone el sistema (dígito de verificación, núcleo del NIT, saldo o nombre parecido).",
                regla: REGLAS.editarModulo,
              },
              {
                nombre: "Emparejar…",
                queHace: "Une un tercero del auxiliar con uno del balance, para este período o para todos.",
                regla: REGLAS.editarModulo,
              },
              {
                nombre: "Separar · Volver a unir",
                queHace: "Deshace una unión automática por dígito de verificación o núcleo, o la recupera.",
                regla: REGLAS.editarModulo,
              },
              {
                nombre: "Cambiar fecha de corte",
                queHace: "Cambia la fecha contra la que se miden los días vencidos y las edades.",
                regla: REGLAS.editarModulo,
                condiciones: ["No una fecha futura."],
              },
            ],
          },
          {
            titulo: "Marcar diferencias",
            acciones: [
              {
                nombre: "Poner una marca (+)",
                queHace: "Documenta la diferencia de un tercero; desde el umbral de diferencia por tercero es obligatoria para cerrar.",
                regla: REGLAS.editarModulo,
              },
              {
                nombre: "Cuentas en este cruce",
                queHace: "Muestra qué cuentas entran al cruce y qué queda fuera.",
                regla: REGLAS.verModulo,
              },
            ],
          },
        ],
      },
      {
        id: "novedades",
        titulo: "Novedades",
        proposito: "Las alertas y validaciones del cargue. Algunas alertas exigen un comentario para cerrar la conciliación.",
        etapas: [
          {
            titulo: "Comentar alertas",
            acciones: [
              {
                nombre: "Comentar · Revisar · Editar",
                queHace:
                  "Un comentario por tipo de alerta, de 10 a 2.000 caracteres. Si la alerta cambia después, el comentario queda «Por revisar».",
                regla: REGLAS.comentarAlertaModulo,
                condiciones: ["No con la conciliación en firme."],
                fuente: { archivo: "src/lib/conciliacion/verificar-bloqueo.ts", funcion: "autorizarComentarioAlertaModulo" },
              },
            ],
          },
        ],
      },
      {
        id: "versiones",
        titulo: "Versiones",
        proposito: "El historial de versiones del período.",
        etapas: [
          {
            titulo: "Consultar",
            acciones: [{ nombre: "Abrir", queHace: "Abre una versión anterior, solo para consulta.", regla: REGLAS.verModulo }],
          },
        ],
      },
    ],
    estados: [
      { etiqueta: "Conciliación abierta", significado: "Se puede editar, marcar y cerrar." },
      { etiqueta: "Conciliación en firme", significado: "Cerrada: el cargue es de solo lectura hasta que se desbloquee." },
      { etiqueta: "propuesta · sin guardar", significado: "Cuenta sugerida que no cruza hasta guardarse." },
      { etiqueta: "Solo (período)", significado: "Cuenta asignada solo para este período; no queda en la memoria del cliente." },
      { etiqueta: "Revisar", significado: "La marca quedó desactualizada: el monto cambió desde que se escribió." },
      { etiqueta: "Dentro de la tolerancia · marca opcional", significado: "Diferencia por debajo de la tolerancia del módulo." },
      { etiqueta: "¿Signo contrario?", significado: "El módulo parece cargado con el signo invertido respecto a la contabilidad. Solo informa." },
    ],
    preguntas: [
      { pregunta: "¿Por qué no me deja cerrar la conciliación?", respuesta: motivosNoCierre(d) },
      {
        pregunta: "No aparece el cruce contable, ¿por qué?",
        respuesta: `${requisitoBalance(d)} La pestaña dice cuál de esas condiciones falta.`,
      },
      {
        pregunta: "¿Qué es una cuenta con la marca «Solo» y el período?",
        respuesta: "Una cuenta del Plan Russell fuera de las del módulo, asignada para este período; no queda en la memoria del cliente.",
      },
    ],
    relacionadas: [
      { label: `Filtros de cuentas · ${d.label}`, href: `/config/prevalidador/${d.codigo.toLowerCase()}`, permiso: "parametros:ver" },
      { label: "Balance de comprobación", href: "/balance", permiso: "balance:ver" },
    ],
  };
}
