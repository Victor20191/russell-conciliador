// ============================================================
// Seed de NOVEDADES — precarga el changelog / control de versiones con las
// funcionalidades REALES de la plataforma (derivadas del historial de git:
// master + rama `santiago`), cada una con su guía de operación, ejemplo y
// deep-link a la ruta interna para "probar".
//
// Las descripciones son DELIBERADAMENTE extensas: cada cambio explica QUÉ es,
// CÓMO funciona por dentro y POR QUÉ se construyó (el problema que resuelve),
// porque este módulo es la memoria viva de la plataforma para los socios y
// administradores. El "por qué" va integrado como un párrafo dentro de la
// descripción (el render respeta los saltos de línea con whitespace-pre-line).
//
// Ejecutar:  npm run db:seed:novedades
//
// IDEMPOTENTE con RESET ACOTADO: este seed es la fuente autoritativa de las
// versiones cuyo `number` aparece en VERSIONES. En cada corrida BORRA esas
// versiones (cascade → sus cambios) y las RECREA con el contenido de abajo, de
// modo que reejecutarlo deja el changelog exactamente como aquí se define.
// Las versiones que un administrador cree con OTRO número (desde la UI) NO se
// tocan. Requiere que las tablas existan: ejecutar DESPUÉS de migrar.
// ============================================================

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { inicioDiaColombiaDesdeISO } from "../src/lib/fecha-hora";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type CambioSeed = {
  type: "nueva" | "mejora" | "correccion" | "seguridad";
  title: string;
  description: string;
  moduleKey?: string;
  route?: string;
  howTo?: string;
  example?: string;
  featureStatus?: "disponible" | "en_desarrollo" | "planeada";
};

type VersionSeed = {
  number: string;
  title: string;
  summary: string;
  status: "borrador" | "publicada";
  releasedAt: Date | null;
  order: number;
  changes: CambioSeed[];
};

const VERSIONES: VersionSeed[] = [
  {
    number: "1.0.0",
    title: "Plataforma base",
    summary:
      "Los cimientos sobre los que se construye todo lo demás: control de acceso por roles con alcance por cliente, gestión de clientes y responsables, conciliaciones, cruce de impuestos DIAN y un registro de auditoría que deja rastro de cada acción.",
    status: "publicada",
    releasedAt: inicioDiaColombiaDesdeISO("2026-06-15"),
    order: 10,
    changes: [
      {
        type: "nueva",
        title: "Control de acceso por roles (RBAC) y alcance por cartera",
        description:
          "La autorización de la plataforma no depende del rango de la persona, sino de una matriz rol×permiso que es la única autoridad: para cada módulo y cada rol se define qué puede hacer (ver, comentar, operar o administrar). Hay 5 roles —Socio, Gerente, Senior, Staff y Administrador— y un principio clave de revisoría: Socio, Gerente y Senior son de CONSULTA (revisan y validan), mientras que el Staff es el ÚNICO rol operativo, el único que ejecuta conciliaciones, carga balances o parametriza.\n\n" +
          "Además del permiso del rol, cada acción sobre un cliente exige ALCANCE sobre ese cliente concreto: la plataforma cruza el permiso con la cartera del usuario (sus clientes asignados). Si no hay cliente o no está en su cartera, deniega (fail-closed: ante la duda, no abre acceso). El Administrador tiene alcance global; el Socio deriva lectura por la jerarquía de sus gerentes.\n\n" +
          "Se construyó así porque en una firma de revisoría la segregación de funciones es un requisito de control, no un lujo: quien ejecuta no debería ser quien valida, y nadie debería ver clientes que no son suyos. Una matriz editable —en vez de reglas escritas en el código— permite ajustar esos permisos sin tocar el sistema y deja la política de acceso a la vista de todos.",
        moduleKey: "roles",
        route: "/config/permisos",
        howTo:
          "Abre Configuración › Permisos por rol\n" +
          "Ubica el módulo que quieres ajustar (Balance, Conciliaciones, Clientes…)\n" +
          "Elige el nivel de acceso (Ver, Comentar, Operar, Administrar) para cada rol\n" +
          "Guarda: el cambio aplica de inmediato a todos los usuarios de ese rol",
        example:
          "Le quitas a Senior el nivel «Operar» en Balance y se lo dejas solo en «Ver»: desde ese momento ningún Senior podrá cargar balances, solo consultarlos en sus clientes.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Clientes, responsables directos y jerarquía organizacional",
        description:
          "Cada cliente se configura con sus responsables directos: uno o varios Staff (ejecutan el trabajo), exactamente un Senior (revisa) y exactamente un Gerente (valida). El Socio no se asigna a mano: deriva su lectura por la jerarquía, viendo automáticamente los clientes de sus gerentes. El formulario filtra en cascada —eliges el gerente y la lista de seniors se reduce a los suyos; eliges el senior y los staff se reducen a los suyos— para que las asignaciones siempre sean coherentes con el organigrama.\n\n" +
          "La jerarquía organizacional (Socio → Gerente → Senior → Staff) se gestiona desde la ficha de cada usuario con relaciones muchos-a-muchos entre roles adyacentes. La plataforma protege esa estructura: no deja cambiar el rol ni borrar a alguien que sea responsable activo de clientes hasta que primero lo reasignes.\n\n" +
          "Sustituye al antiguo modelo de «equipos/carteras» genéricos. El problema de aquel modelo era que diluía la responsabilidad: no quedaba claro quién ejecutaba, quién revisaba y quién validaba cada cliente. Con asignación directa cada cliente tiene nombre y apellido en cada eslabón, que es justo lo que exige el control de calidad de la revisoría.",
        moduleKey: "clientes",
        route: "/config/clientes",
        howTo:
          "Abre Configuración › Clientes\n" +
          "Crea un cliente nuevo o edita uno existente\n" +
          "Selecciona el Gerente; luego el Senior (ya filtrado a los de ese gerente)\n" +
          "Agrega uno o varios Staff (filtrados a los de ese senior)\n" +
          "Completa el resto de datos del cliente y guarda",
        example:
          "Al dar de alta «El Zarzal S.A» asignas a María (gerente), a Pedro (senior) y a dos staff. Desde ese momento solo ellos —y el socio de María por jerarquía— ven y operan ese cliente.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Impuestos · DIAN por cliente",
        description:
          "Cruza las declaraciones tributarias presentadas a la DIAN (IVA, retención en la fuente, ICA…) contra la contabilidad del cliente, renglón por renglón, para encontrar diferencias entre lo declarado y lo registrado. Los formatos DIAN se activan por cliente, porque no todos declaran lo mismo: cada cliente tiene su propio conjunto de formularios habilitados en «Módulos del cliente».\n\n" +
          "Existe porque el descuadre entre la declaración y la contabilidad es uno de los hallazgos más frecuentes —y más delicados— de una revisoría. Detectarlo a tiempo, casilla por casilla, evita sanciones y correcciones tardías; hacerlo a mano sobre PDFs de la DIAN es lento y arriesgado.",
        moduleKey: "dian",
        route: "/dian",
        howTo:
          "Abre Impuestos · DIAN\n" +
          "Selecciona el cliente, el formulario y el período\n" +
          "Revisa renglón por renglón las diferencias entre lo declarado y lo contable\n" +
          "Documenta y explica cada descuadre encontrado",
        example:
          "Comparas la casilla de IVA generado declarado contra el saldo contable de la cuenta correspondiente y la plataforma resalta una diferencia que toca explicar antes de cerrar el período.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Conciliaciones contables",
        description:
          "Cruza la contabilidad del cliente contra sus módulos auxiliares (inventarios, cartera, nómina, activos fijos…) y resalta las diferencias usando un criterio de materialidad, de modo que el esfuerzo se concentre donde el descuadre es relevante y no en céntimos. Para iniciar una conciliación el cliente debe tener ERP asignado, porque el ERP determina cómo llega la información de los auxiliares.\n\n" +
          "Es el corazón del trabajo de revisoría: verificar que los saldos contables están respaldados por los auxiliares que los soportan. Automatizar el cruce y filtrar por materialidad convierte una tarea de horas en minutos y dirige la atención del revisor a lo que de verdad importa.",
        moduleKey: "conciliaciones",
        route: "/conciliacion/nueva",
        howTo:
          "Abre Conciliaciones › Nueva conciliación\n" +
          "Elige el cliente, el módulo auxiliar y el período\n" +
          "Carga la información y ejecuta el cruce\n" +
          "Revisa las diferencias materiales y documéntalas\n" +
          "Envía la conciliación a revisión cuando esté lista",
        example:
          "Cruzas el saldo contable de cartera contra el módulo auxiliar de cartera: la plataforma ignora las diferencias de céntimos y resalta las tres cuentas con descuadres materiales que hay que justificar.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Registro de auditoría",
        description:
          "Toda acción relevante —crear, editar, ejecutar o eliminar— queda registrada con el usuario que la hizo, la fecha y la hora, para una trazabilidad completa de la actividad en la plataforma. El registro nunca interrumpe la operación: si por algo fallara al escribirse, la acción del usuario igual se completa.\n\n" +
          "Se incluyó desde el primer día porque en revisoría el control interno exige poder responder «quién hizo qué y cuándo». Tener esa bitácora central elimina las discusiones sobre responsabilidades y es soporte directo ante una auditoría externa o un requerimiento.",
        moduleKey: "auditoria",
        route: "/auditoria",
        howTo:
          "Abre Auditoría\n" +
          "Filtra por usuario, entidad o rango de fechas\n" +
          "Revisa el detalle de cada movimiento para reconstruir el rastro de actividad",
        example:
          "Necesitas saber quién cargó el balance de un cliente y a qué hora se ejecutó una conciliación: filtras por ese cliente y la auditoría te muestra la secuencia exacta con autor y marca de tiempo.",
        featureStatus: "disponible",
      },
    ],
  },
  {
    number: "1.1.0",
    title: "Balance de comprobación + Inteligencia Artificial",
    summary:
      "El balance de comprobación da un salto: deja atrás el almacenamiento en JSON, pasa a un modelo relacional normalizado y versionado, y estrena la primera integración de IA de la plataforma para cargarlo desde casi cualquier formato. (Base del balance: aporte de Santiago Jaramillo.)",
    status: "publicada",
    releasedAt: inicioDiaColombiaDesdeISO("2026-06-22"),
    order: 20,
    changes: [
      {
        type: "nueva",
        title: "Carga de balance asistida por Inteligencia Artificial (Claude)",
        description:
          "Es la primera funcionalidad de IA de la plataforma. Subes el balance de comprobación tal como lo entrega el cliente —Excel (xlsx/xlsm), CSV, JSON o incluso un PDF, hasta 20 MB— y la IA (Claude) lee el archivo, detecta su estructura y extrae las cuentas con sus saldos. Además lee el encabezado: reconoce el NIT, el período y el estándar contable, y con el NIT te PROPONE el cliente al que pertenece. Tú revisas esa vista previa, confirmas o ajustas el cliente y el período, y solo entonces se guarda: nada queda registrado sin tu visto bueno.\n\n" +
          "Por dentro hay una distinción importante para que los números sean confiables: con archivos tabulares (Excel/CSV) la IA trabaja en modo ESTRUCTURA, es decir, NO transcribe cifras —solo dice qué columna es el código, cuál el nombre y cuál el saldo—, y el cálculo lo hace después el sistema de forma determinista. Con un PDF o documento usa EXTRACCIÓN DIRECTA y devuelve las filas ya normalizadas. En ambos casos los totales finales los calcula código, no el modelo, así que la IA acelera la lectura pero no «inventa» saldos.\n\n" +
          "Se construyó porque cada cliente entrega el balance en un formato distinto y mapear a mano qué columna es cuál —período tras período, cliente tras cliente— era de lo más lento y propenso a error de todo el proceso. Requiere configurar ANTHROPIC_API_KEY; si no está, la plataforma sigue funcionando con normalidad y solo se desactiva la extracción asistida (puedes cargar el balance con la plantilla).",
        moduleKey: "balance",
        route: "/balance",
        howTo:
          "Entra a Balance de comprobación y haz clic en «Cargar balance»\n" +
          "Arrastra el archivo (Excel, CSV, JSON o PDF; hasta 20 MB) y deja que la IA lo lea\n" +
          "Revisa la vista previa: la IA detecta el NIT, el período y la estructura, y propone el cliente\n" +
          "Confirma o ajusta el cliente, el período y el estándar contable\n" +
          "Confirma el cargue para guardar el balance",
        example:
          "Subes el balance en PDF de un cliente nuevo: la IA reconoce sola las columnas de código, nombre y saldo, y tú solo verificas la vista previa antes de confirmar, sin mapear ni digitar nada a mano.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Modelo de balance normalizado y versionado",
        description:
          "El balance deja de guardarse como un bloque de JSON y pasa a un modelo relacional de dos tablas: un ENCABEZADO por cada cargue (cliente + período + versión) y un DETALLE con una fila por cuenta, desagregada por los niveles del PUC (clase 2, subgrupo 4, cuenta 6 y auxiliar 8) y con los montos firmados (débito +, crédito −). Soporta varias versiones por período: cargas una v1, luego una v2 corregida, y cuando una está lista la CONGELAS desde su detalle, con lo que queda como la versión OFICIAL del período y en firme (ya nadie la edita).\n\n" +
          "Un detalle de diseño: los agregados (sumas, totales por grupo, validaciones) NO se guardan, se RECALCULAN cada vez que se lee el balance a partir del detalle. Así nunca quedan totales «pegados» que se desactualicen respecto a las cuentas.\n\n" +
          "El JSON anterior era cómodo para escribir pero malo para todo lo demás: no permitía versionar con orden, ni congelar la versión oficial, ni consultar «qué cuentas usan tal estándar» sin recorrer todo el bloque. Normalizar habilita el versionado serio, la trazabilidad y consultas directas, que son la base de las funcionalidades de balance que vinieron después.",
        moduleKey: "balance",
        route: "/balance",
        howTo:
          "Carga una nueva versión del balance para el mismo cliente y período (queda como v2, v3…)\n" +
          "Compárala con la versión anterior si necesitas validar los cambios\n" +
          "Cuando esté lista, congélala desde su detalle: queda como la versión OFICIAL del período y en firme\n" +
          "A partir de ahí esa versión no se puede editar; las anteriores quedan en el historial consultable",
        example:
          "Para enero cargas la v1, detectas un ajuste y subes la v2; congelas la v2 y queda como la oficial en firme. La v1 sigue en el historial, consultable, pero ya no es la versión vigente.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Estado de Resultado derivado del balance",
        description:
          "El Estado de Resultado (P&L) se calcula automáticamente a partir del detalle del balance oficial: ingresos, costos y gastos salen de las cuentas ya cargadas, sin captura manual y sin una segunda digitación. Eliges el cliente y el período, y la pantalla muestra el P&L con sus márgenes ya consolidados.\n\n" +
          "Se hizo derivado —y no como un formulario aparte— porque cualquier dato que se captura dos veces termina descuadrando: si el balance cambia, el estado de resultado debe cambiar con él. Al derivarlo del mismo detalle, siempre es consistente con el balance del que proviene.",
        moduleKey: "balance",
        route: "/balance/estado-resultado",
        howTo:
          "Carga y oficializa (congela) el balance del período\n" +
          "Abre Balance de comprobación › Estado de Resultado\n" +
          "Elige el cliente y el período\n" +
          "Consulta el P&L ya calculado desde el detalle del balance oficial",
        example:
          "Tras cargar el balance de marzo, abres el Estado de Resultado y ya ves ingresos, costos y gastos del período sin haber digitado una sola cifra adicional.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Mapeo en cascada al plan estándar Russell",
        description:
          "Las cuentas del PUC de cada cliente se homologan contra el plan estándar Russell de forma encadenada por nivel: a partir de la cuenta del cliente la plataforma propone la cuenta estándar que le corresponde, reduciendo el mapeo manual cuenta por cuenta.\n\n" +
          "El plan estándar es lo que permite comparar entre clientes y consolidar: aunque cada empresa numere sus cuentas distinto, todas terminan habladas en el mismo «idioma» Russell. Sin un mapeo asistido, homologar cientos de cuentas a mano era inviable; la cascada hace el grueso del trabajo y deja al revisor solo los casos dudosos.",
        moduleKey: "mapeo",
        route: "/config/mapeo",
        howTo:
          "Abre Configuración › Mapeo\n" +
          "Selecciona el cliente en la pestaña «Mapeo por cliente»\n" +
          "Revisa la homologación propuesta contra el plan estándar Russell\n" +
          "Ajusta las cuentas que la cascada no haya resuelto y guarda",
        example:
          "Al cargar el balance, las cuentas de caja y bancos del cliente quedan mapeadas solas a sus cuentas estándar Russell; tú solo revisas un par de cuentas atípicas que la cascada dejó pendientes.",
        featureStatus: "disponible",
      },
      {
        type: "mejora",
        title: "Prompt caching en la extracción de balances con IA",
        description:
          "Se consolida el punto de caché del prompt (prompt caching) en la extracción asistida de balances. En la práctica, la parte fija y larga de las instrucciones que se le dan a la IA se reutiliza entre cargues en lugar de reenviarse y reprocesarse cada vez, siempre que supere el umbral mínimo que exige el modelo en uso.\n\n" +
          "El objetivo es puramente de costo y velocidad: leer balances con IA debe ser barato y rápido para que se use a diario sin pensarlo. Cachear el prompt reduce el costo por cargue y acorta el tiempo de respuesta, sobre todo en balances grandes.",
        moduleKey: "balance",
        route: "/balance",
        howTo:
          "No requiere ninguna acción: aplica automáticamente al cargar un balance con IA",
        example:
          "Cargar un balance extenso reutiliza el contexto ya cacheado de las instrucciones, de modo que la extracción cuesta menos y termina antes que la primera vez.",
        featureStatus: "disponible",
      },
      {
        type: "correccion",
        title: "Deduplicación de cuentas por código en el detalle",
        description:
          "Se corrige un caso en el que una misma cuenta podía aparecer repetida por código en el detalle del balance, generando además una «key» duplicada en el render. Esto podía ensuciar la tabla y, peor, distorsionar los totales al sumar dos veces la misma cuenta.\n\n" +
          "Cuando el archivo de origen trae la misma cuenta en más de una fila, la plataforma ahora la consolida en una sola, dejando el detalle limpio y los agregados correctos.",
        moduleKey: "balance",
        route: "/balance",
        howTo:
          "No requiere acción: el detalle del balance ya no muestra cuentas repetidas\n" +
          "Si vuelves a cargar un balance afectado, las filas duplicadas se consolidan solas",
        example:
          "Un balance que en el origen traía la cuenta 110505 dos veces ahora se muestra como una única fila con el saldo correcto, sin duplicar el total del grupo.",
        featureStatus: "disponible",
      },
    ],
  },
  {
    number: "1.2.0",
    title: "Parametrización y catálogos",
    summary:
      "Menos trabajo manual y más datos maestros: catálogos de ERP y Sector, administración del plan estándar Russell con su propia bitácora, importación masiva por Excel y mejoras transversales de usabilidad (paginación, filtros y notificaciones).",
    status: "publicada",
    releasedAt: inicioDiaColombiaDesdeISO("2026-06-22"),
    order: 30,
    changes: [
      {
        type: "nueva",
        title: "Catálogos de ERP y Sector",
        description:
          "El ERP (el sistema contable que usa el cliente) y su Sector económico pasan a ser catálogos maestros en lugar de texto libre. Ambos son OPCIONALES al crear o importar el cliente —los que no tienen ERP quedan etiquetados «Sin ERP» en el listado—, pero el ERP es BLOQUEANTE para iniciar una operación: tanto ejecutar una conciliación como confirmar la carga de un balance exigen que el cliente tenga ERP asignado y avisan si falta.\n\n" +
          "Se modeló así por dos razones. Primero, el texto libre genera duplicados y errores de dedo («SAP», «sap», «S.A.P.») que impiden agrupar y reportar; un catálogo normaliza. Segundo, el ERP condiciona cómo llega la información de los auxiliares y del balance, así que tiene sentido permitir registrar el cliente sin él, pero exigirlo justo en el momento de operar, no antes.",
        moduleKey: "clientes",
        route: "/config/clientes",
        howTo:
          "Abre Configuración › Clientes\n" +
          "Edita un cliente\n" +
          "Selecciona su ERP y su Sector del catálogo (o déjalos en blanco)\n" +
          "Guarda; recuerda que sin ERP no podrás iniciar conciliaciones ni cargar su balance",
        example:
          "Un cliente recién creado aparece como «Sin ERP». Al intentar cargar su balance, la plataforma te detiene y te pide asignarle primero el ERP; lo eliges del catálogo y ya puedes continuar.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Administración del plan estándar Russell con bitácora",
        description:
          "El Administrador puede crear, editar y eliminar las cuentas del plan estándar Russell, que es GLOBAL: una sola tabla compartida por todos los clientes de la plataforma. Cada movimiento queda registrado en una bitácora dedicada del plan estándar, además del registro general de auditoría, y la plataforma BLOQUEA tocar el código de una cuenta que ya tenga balances asociados.\n\n" +
          "Es una operación admin-only a propósito (permiso de administración, no el de operación del Staff), porque el plan estándar es la columna vertebral de la comparación entre clientes: un cambio mal hecho afecta a toda la firma. La bitácora dedicada y el bloqueo de códigos en uso existen precisamente para que la estandarización pueda evolucionar sin romper la trazabilidad de los balances ya cargados.",
        moduleKey: "mapeo",
        route: "/config/mapeo",
        howTo:
          "Abre Configuración › Mapeo\n" +
          "Ve a la pestaña «Plan estándar Russell»\n" +
          "Crea, edita o elimina cuentas estándar (solo Administrador)\n" +
          "Consulta la bitácora para ver el historial de cambios del plan",
        example:
          "Agregas una cuenta estándar nueva y, al intentar cambiarle el código a otra que ya tiene balances asociados, la plataforma te lo impide para no romper los mapeos existentes; el alta y el intento quedan en la bitácora.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Importación masiva por Excel (clientes y personas)",
        description:
          "Los clientes y los maestros de personas (por rol: Socio, Gerente, Senior, Staff) se cargan desde plantillas de Excel en lugar de capturarse uno por uno. La plantilla de clientes admite varios staff en una misma celda separados por «;», marca los módulos y formatos DIAN a activar, y aplica una regla cómoda: un bloque de módulos/DIAN dejado totalmente en blanco se interpreta como «activar todos».\n\n" +
          "La validación es estricta y vive en el servidor: existencia y unicidad de las personas, coherencia de la jerarquía y de los formatos DIAN. Se construyó para los arranques y las altas en lote: dar de alta decenas de clientes con sus responsables y módulos a mano era horas de trabajo repetitivo y una fuente de errores; con la plantilla es un solo archivo.",
        moduleKey: "clientes",
        route: "/config/clientes",
        howTo:
          "Abre Configuración › Clientes (o › Maestros para personas)\n" +
          "Descarga la plantilla de importación\n" +
          "Complétala (varios staff con «;»; módulos/DIAN en blanco = todos)\n" +
          "Súbela y revisa el resultado fila por fila antes de confirmar",
        example:
          "Cargas 50 clientes de un solo Excel, cada uno con su gerente, su senior, sus staff y sus módulos activos; la plataforma valida la jerarquía y te marca las filas con algún problema para corregirlas.",
        featureStatus: "disponible",
      },
      {
        type: "mejora",
        title: "Paginación y filtrado de tablas",
        description:
          "Los listados que crecen con el uso (clientes, usuarios, balance, conciliaciones, auditoría, mapeo) se paginan —50, 100 o 200 filas por página— y se pueden filtrar para encontrar lo que buscas sin recorrer toda la tabla.\n\n" +
          "Se agregó porque cargar cientos o miles de filas de golpe hace lenta la pantalla y vuelve imposible encontrar un registro concreto. La paginación se aplicó a las tablas que de verdad crecen; las de estructura fija se dejaron sin paginar a propósito.",
        moduleKey: "clientes",
        route: "/config/clientes",
        howTo:
          "Abre cualquier listado grande\n" +
          "Usa el campo de filtro para acotar por texto\n" +
          "Cambia el tamaño de página (50/100/200) y navega con el control al pie de la tabla",
        example:
          "Con 300 clientes el listado muestra 50 por página; escribes parte del nombre en el filtro y la tabla se reduce al instante a las coincidencias.",
        featureStatus: "disponible",
      },
      {
        type: "mejora",
        title: "Notificaciones de operaciones (toasts)",
        description:
          "Las acciones de crear, editar o eliminar confirman su resultado con una notificación emergente (toast). La confirmación PERSISTE aunque la operación termine cambiando de pantalla, así que ves el «listo» incluso cuando guardar te lleva a otra página.\n\n" +
          "Antes no siempre quedaba claro si una acción había funcionado, sobre todo cuando había una redirección de por medio. Una señal explícita de éxito o error —con el motivo cuando falla— le da certeza al usuario de que su cambio quedó guardado.",
        howTo:
          "Realiza cualquier acción (guardar un cliente, cargar un balance, editar un usuario…)\n" +
          "Observa la notificación de éxito o de error que aparece en la esquina",
        example:
          "Guardas un usuario y, ya en el listado, ves el toast «Usuario creado.»; si algo falla, el mensaje te explica el motivo en lugar de dejarte con la duda.",
        featureStatus: "disponible",
      },
    ],
  },
  {
    number: "1.3.0",
    title: "Árbol del balance, asignación manual y subgrupos",
    summary:
      "El detalle del balance se vuelve navegable como un árbol del plan estándar (clase → subgrupo → cuenta estándar → cuenta del cliente), se puede mapear cuentas a mano cuando la automatización no acierta, y se suma el catálogo de subgrupos (nivel 4) que da nombre a los niveles del árbol. Aporte de Santiago Jaramillo.",
    status: "publicada",
    releasedAt: inicioDiaColombiaDesdeISO("2026-06-23"),
    order: 40,
    changes: [
      {
        type: "nueva",
        title: "Detalle del balance como árbol 2/4/6/8",
        description:
          "El detalle del balance se navega jerárquicamente, siguiendo la estructura del plan estándar: CLASE (nivel 2) → SUBGRUPO (nivel 4) → CUENTA ESTÁNDAR Russell (nivel 6) → CUENTA DEL CLIENTE (nivel 8). Cada nodo muestra su saldo agregado y trae las columnas Saldo anterior · Débito · Crédito · Saldo · Var %, de modo que ves la composición y la variación en cada nivel sin perder el detalle.\n\n" +
          "Incluye botones de «Expandir todo» y «Contraer todo» y tres vistas con un clic: «Todo», «Balance» (clases 1, 2 y 3) y «Estado de Resultado» (clases de ingresos, costos y gastos).\n\n" +
          "Un balance real tiene cientos de cuentas; una lista plana es imposible de leer y de cuadrar. El árbol deja revisar de lo general a lo particular —ver primero el total del Activo y bajar hasta la cuenta del cliente solo cuando algo no cuadra— que es exactamente como trabaja un revisor.",
        moduleKey: "balance",
        route: "/balance",
        howTo:
          "Abre Balance de comprobación y entra a una versión del balance de un cliente\n" +
          "Usa los filtros «Todo», «Balance» y «Estado de Resultado» según lo que quieras ver\n" +
          "Despliega los nodos o usa «Expandir todo» / «Contraer todo»\n" +
          "Lee el saldo y la variación (Var %) en cada nivel de la jerarquía",
        example:
          "Despliegas la clase 1 (Activo), bajas por el subgrupo y la cuenta estándar hasta la cuenta del cliente, y ves el saldo agregándose en cada nivel hasta cuadrar con el total del Activo.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Asignación manual de cuentas al plan estándar",
        description:
          "Desde el propio detalle del balance puedes mapear a mano una cuenta del cliente a su cuenta estándar Russell (nivel 6). La asignación es inteligente: arrastra TODAS las cuentas del mismo prefijo de 6 dígitos dentro de ese balance y recalcula al instante los contadores de cobertura. Incluye un buscador de cuentas estándar prefiltrado por la clase de la cuenta, para no perderte entre miles de opciones. Está disponible para Staff y Administrador, siempre con alcance sobre el cliente.\n\n" +
          "La cascada y la IA resuelven la mayoría de los casos, pero no todos: siempre hay cuentas atípicas o nuevas que ninguna automatización acierta. Antes esas cuentas quedaban en el limbo; ahora el revisor las resuelve en el sitio, una vez, y el sistema propaga esa decisión a todas las subcuentas hermanas.",
        moduleKey: "balance",
        route: "/balance",
        howTo:
          "Abre el detalle de un balance y localiza una cuenta sin mapear\n" +
          "Usa la acción «asignar» sobre esa cuenta\n" +
          "Busca la cuenta estándar de nivel 6 (el buscador ya viene filtrado por la clase)\n" +
          "Confirma: se mapean de una vez todas las cuentas con el mismo prefijo de 6 dígitos",
        example:
          "Mapeas la cuenta 1105 a su cuenta estándar Russell y, en el acto, todas las subcuentas 1105xx de ese balance quedan homologadas y los contadores de cobertura suben.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Catálogo de subgrupos del plan estándar (nivel 4)",
        description:
          "Se incorpora una tabla de subgrupos (nivel 4) con su catálogo cargable, que aporta el NOMBRE de los niveles 4 y 2 del árbol del balance. Antes esos niveles se mostraban con un placeholder —solo el código—; ahora el árbol los rotula con su nombre real. Trae una pestaña «Subgrupos (nivel 4)» dentro del mapeo con CRUD completo y auditoría (alta/edición/baja solo para Administrador).\n\n" +
          "Es la pieza que faltaba para que el árbol fuera legible: un código «11» no dice nada a primera vista, pero «11 — Disponible» sí. Con el catálogo de subgrupos, la navegación jerárquica del balance pasa de ser técnica a ser autoexplicativa.",
        moduleKey: "mapeo",
        route: "/config/mapeo",
        howTo:
          "Abre Configuración › Mapeo\n" +
          "Ve a la pestaña «Subgrupos (nivel 4)»\n" +
          "Crea, edita o elimina subgrupos (solo Administrador)\n" +
          "Vuelve al detalle del balance para ver el árbol ya rotulado con los nombres",
        example:
          "Tras cargar el catálogo, el árbol del balance muestra «11 — Disponible» en lugar de solo «11», y lo mismo en el nivel de clase, haciendo la lectura mucho más clara.",
        featureStatus: "disponible",
      },
    ],
  },
  {
    number: "1.4.0",
    title: "Memoria de mapeo por cliente y alertas del balance",
    summary:
      "La parametrización del mapeo deja de repetirse período a período: se guarda por cliente y se reaplica sola en los siguientes cargues. Y el detalle del balance estrena alertas que llevan directo a lo que falta revisar (cuentas sin mapear o con saldo de naturaleza contraria). Aporte de Santiago Jaramillo.",
    status: "publicada",
    releasedAt: inicioDiaColombiaDesdeISO("2026-06-23"),
    order: 50,
    changes: [
      {
        type: "nueva",
        title: "Memoria de mapeo por cliente (parametrizar una sola vez)",
        description:
          "La forma en que se mapean las cuentas de un cliente a sus cuentas estándar Russell ahora se RECUERDA. La plataforma guarda, por cada cliente y cada cuenta de nivel 6, la cuenta estándar a la que corresponde, su porcentaje y el origen de la regla (manual o automático). En los siguientes cargues de balance de ESE mismo cliente —otros períodos— esa parametrización se reaplica sola, sin volver a configurarla.\n\n" +
          "La memoria tiene PRIORIDAD sobre el resto: cuando se importa un balance, la plataforma resuelve cada cuenta en este orden —regla guardada del cliente → coincidencia exacta → por descripción → IA—. Lo que marcaste como «manual» nunca se recalcula ni se pisa por la automatización; y como las cuentas ya conocidas se resuelven desde la memoria, no se vuelve a gastar tiempo ni costo de IA en ellas. Lo administras en una pestaña propia, «Mapeo balance/cliente», donde puedes ver, crear, editar y eliminar reglas, filtrar por origen (manual/automático) y elegir el cliente; editar una regla la marca como manual. Esa memoria también se alimenta sola desde el balance: cada asignación manual que haces en el detalle (al mapear una cuenta al plan estándar) queda guardada aquí como regla manual del cliente.\n\n" +
          "Se construyó porque reconfigurar el mapeo del mismo cliente en cada período era trabajo repetido, lento y propenso a inconsistencias (la misma cuenta mapeada distinto en enero y en febrero). Parametrizar una sola vez y reutilizar la decisión hace que cada cierre mensual sea más rápido, más barato y, sobre todo, consistente con el anterior.",
        moduleKey: "mapeo",
        route: "/config/mapeo",
        howTo:
          "Abre Configuración › Mapeo\n" +
          "Entra a la pestaña «Mapeo balance/cliente»\n" +
          "Selecciona el cliente para ver sus reglas guardadas\n" +
          "Crea o edita una regla (cuenta de 6 dígitos → cuenta estándar Russell); editar la marca como manual\n" +
          "Filtra por origen (manual/automático) para revisar qué resolvió la automatización y qué fijaste tú",
        example:
          "En enero parametrizas el mapeo de «Comercial XYZ». En febrero subes su nuevo balance y llega ya mapeado solo: la plataforma reaplica las reglas guardadas y solo te deja revisar las cuentas nuevas del período.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Alertas en el detalle del balance",
        description:
          "El detalle del balance estrena un filtro «Alertas» que poda el árbol y lo deja, ya expandido, solo en las ramas que requieren atención. Hay dos tipos de alerta: cuentas SIN MAPEO (todavía no homologadas al plan estándar) y cuentas con NATURALEZA contraria (su saldo va en sentido opuesto al esperado para esa cuenta). Además, cada nodo muestra en la columna de código un contador de cuántas alertas de cada tipo cuelgan de él, así que ves desde arriba dónde está el problema.\n\n" +
          "En un balance con cientos de cuentas, encontrar «lo que falta» a ojo es justo lo que consume el tiempo del revisor. Las alertas convierten esa búsqueda en un clic: el filtro te lleva directo a las cuentas sin mapear o con saldo sospechoso, y los contadores por nodo te dicen por qué rama empezar.",
        moduleKey: "balance",
        route: "/balance",
        howTo:
          "Abre el detalle de un balance de un cliente\n" +
          "Activa el filtro «Alertas» (muestra su total al lado)\n" +
          "Revisa el árbol podado y ya expandido en las ramas con problemas\n" +
          "Apóyate en los contadores por nodo: «mapeo» (sin homologar) y «naturaleza» (saldo contrario)\n" +
          "Resuelve cada alerta —por ejemplo, asignando la cuenta al plan estándar desde el mismo detalle",
        example:
          "Abres un balance recién cargado, activas «Alertas» y el árbol se reduce a 12 cuentas: 9 sin mapear y 3 con saldo de naturaleza contraria. Las resuelves una a una sin haber recorrido las otras 400 cuentas que estaban bien.",
        featureStatus: "disponible",
      },
    ],
  },
  {
    number: "1.5.0",
    title: "En camino",
    summary:
      "Lo que estamos construyendo ahora. Esta versión está en borrador: su contenido puede cambiar antes de publicarse.",
    status: "borrador",
    releasedAt: null,
    order: 60,
    changes: [
      {
        type: "nueva",
        title: "Módulo de Novedades (este mismo)",
        description:
          "Este módulo: un changelog con control de versiones donde los administradores ven qué se ha construido en la plataforma, organizado por versión, con la explicación de cada funcionalidad —qué es, cómo se opera y por qué se hizo—, un ejemplo y, cuando aplica, un botón para ir directo a la ruta y probarla.\n\n" +
          "Se creó para que el trabajo deje de perderse en los mensajes de commit: socios y administradores tienen un único lugar, en lenguaje de negocio, donde entender qué cambió y cómo usarlo, sin depender de quien lo programó.",
        moduleKey: "novedades",
        route: "/novedades",
        howTo:
          "Abre Novedades\n" +
          "Recorre las versiones de arriba (la más reciente) hacia abajo\n" +
          "Lee en cada cambio la descripción, los pasos de «Cómo se opera» y el ejemplo\n" +
          "Usa «Probar funcionalidad» para ir directo a la ruta y usarla",
        example:
          "Estás leyendo el resultado: cada tarjeta es una versión y cada ítem un cambio con su descripción extensa, su guía paso a paso y su ejemplo.",
        featureStatus: "disponible",
      },
      {
        type: "mejora",
        title: "Novedades visibles para todos los usuarios",
        description:
          "Hoy este módulo es solo para administradores. La idea es abrirlo al resto de roles mostrando únicamente las versiones PUBLICADAS (no los borradores), para que cualquier usuario pueda enterarse de las novedades de la plataforma desde su propio menú.\n\n" +
          "Se separa el «qué se está cocinando» (borradores, solo para admins) de «qué ya está disponible» (publicado, para todos), de modo que comunicar cada lanzamiento al equipo no exija ningún trabajo extra.",
        moduleKey: "novedades",
        howTo: "Pendiente de publicación.",
        example:
          "Cuando esté listo, un Staff verá en su menú las novedades publicadas y podrá leer cómo usar una función nueva sin que un administrador se la tenga que explicar.",
        featureStatus: "planeada",
      },
    ],
  },
];

async function main() {
  console.log("🌱 Seed de Novedades (changelog + control de versiones)…");
  const numeros = VERSIONES.map((v) => v.number);

  // Reset ACOTADO: borra solo las versiones que este seed administra (cascade
  // elimina sus cambios) y las recrea. No toca versiones con OTRO número.
  const borradas = await prisma.platformVersion.deleteMany({ where: { number: { in: numeros } } });
  if (borradas.count > 0) console.log(`↻ Reemplazando ${borradas.count} versión(es) sembrada(s) previamente.`);

  let cambios = 0;
  for (const v of VERSIONES) {
    await prisma.platformVersion.create({
      data: {
        number: v.number,
        title: v.title,
        summary: v.summary,
        status: v.status,
        releasedAt: v.releasedAt,
        order: v.order,
        changes: {
          create: v.changes.map((c, i) => ({
            type: c.type,
            title: c.title,
            description: c.description,
            moduleKey: c.moduleKey ?? null,
            route: c.route ?? null,
            howTo: c.howTo ?? null,
            example: c.example ?? null,
            featureStatus: c.featureStatus ?? "disponible",
            order: i,
          })),
        },
      },
    });
    cambios += v.changes.length;
    console.log(`+ v${v.number} · ${v.title} (${v.changes.length} cambios)`);
  }

  console.log(`✅ Novedades: ${VERSIONES.length} versiones · ${cambios} cambios sembrados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
