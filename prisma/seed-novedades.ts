// ============================================================
// Seed de NOVEDADES — precarga el changelog / control de versiones con las
// funcionalidades REALES de la plataforma (derivadas del historial de git:
// master + rama `santiago`), cada una con su guía de operación, ejemplo y
// deep-link a la ruta interna para "probar".
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
    summary: "Cimientos: control de acceso por roles, clientes y responsables, conciliaciones, impuestos DIAN y auditoría.",
    status: "publicada",
    releasedAt: new Date("2026-06-15"),
    order: 10,
    changes: [
      {
        type: "nueva",
        title: "Control de acceso por roles (RBAC) y alcance por cliente",
        description:
          "La autorización vive en una matriz rol×permiso. Hay 5 roles (Socio, Gerente, Senior, Staff, Administrador): Socio/Gerente/Senior consultan, el Staff es el único operativo. Además, el acceso a un cliente se filtra por la cartera de cada usuario.",
        moduleKey: "roles",
        route: "/config/permisos",
        howTo:
          "Abre Configuración › Permisos por rol\nElige el nivel (ver, comentar, operar, administrar) por módulo para cada rol\nGuarda los cambios",
        example: "El Staff es el único que ejecuta conciliaciones o carga balances; Socio, Gerente y Senior solo consultan y revisan sus clientes.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Clientes, responsables directos y jerarquía organizacional",
        description:
          "Cada cliente se configura con uno o varios Staff (ejecutan), un Senior (revisa) y un Gerente (valida); el Socio deriva su lectura por la jerarquía. Sustituye al antiguo modelo de equipos/carteras.",
        moduleKey: "clientes",
        route: "/config/clientes",
        howTo:
          "Abre Configuración › Clientes\nCrea o edita un cliente\nAsigna el gerente, el senior y uno o varios staff (en cascada)\nGuarda",
        example: "Al crear «El Zarzal S.A» asignas a María (gerente), Pedro (senior) y dos staff; solo ellos verán y operarán ese cliente.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Impuestos · DIAN por cliente",
        description: "Cruce de las declaraciones DIAN (IVA, retención, ICA…) contra la contabilidad, renglón por renglón. Los formatos DIAN se activan por cliente.",
        moduleKey: "dian",
        route: "/dian",
        howTo: "Abre Impuestos · DIAN\nSelecciona el formulario y el período\nRevisa las diferencias entre lo declarado y lo contable",
        example: "Comparas la casilla de IVA generado declarado contra el saldo contable y detectas un descuadre a explicar.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Conciliaciones",
        description: "Cruce entre la contabilidad y los módulos auxiliares (inventarios, cartera, nómina…) con detección de diferencias por materialidad.",
        moduleKey: "conciliaciones",
        route: "/conciliacion/nueva",
        howTo:
          "Abre Conciliaciones › Nueva conciliación\nElige cliente, módulo y período\nCarga la información y ejecuta el cruce\nDocumenta las diferencias",
        example: "Cruzas el saldo contable de cartera contra el módulo auxiliar y la plataforma resalta las cuentas con diferencias materiales.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Registro de auditoría",
        description: "Toda acción relevante (crear, editar, ejecutar, eliminar) queda registrada con usuario, fecha e IP para trazabilidad.",
        moduleKey: "auditoria",
        route: "/auditoria",
        howTo: "Abre Auditoría\nFiltra por usuario, entidad o fecha para revisar el rastro de actividad",
        example: "Consultas quién cargó el balance de un cliente y a qué hora se ejecutó una conciliación.",
        featureStatus: "disponible",
      },
    ],
  },
  {
    number: "1.1.0",
    title: "Balance de comprobación + IA",
    summary: "El balance pasa a un modelo relacional normalizado y se puede cargar con ayuda de inteligencia artificial. (Base del balance: aporte de Santiago Jaramillo.)",
    status: "publicada",
    releasedAt: new Date("2026-06-22"),
    order: 20,
    changes: [
      {
        type: "nueva",
        title: "Carga de balance asistida por IA",
        description:
          "Sube el balance en Excel, CSV, JSON o PDF y la IA (Claude) detecta la estructura y extrae cuentas y saldos. Tú revisas la vista previa y confirmas; el cálculo final es determinista. Requiere ANTHROPIC_API_KEY (sin ella, la app sigue funcionando sin la extracción asistida).",
        moduleKey: "balance",
        route: "/balance",
        howTo:
          "Entra a Balance de comprobación\nHaz clic en «Cargar balance»\nSelecciona el cliente y arrastra el archivo\nRevisa la vista previa que propone la IA y confirma",
        example: "Subes el balance en PDF de un cliente y la IA reconoce las columnas de código, nombre y saldo sin que las mapees a mano.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Modelo de balance normalizado y versionado",
        description:
          "El balance pasa a un modelo relacional (encabezado + detalle por cuenta, desagregado por nivel PUC). Soporta varias versiones por período, una marcada como oficial y la posibilidad de congelarla. Los agregados se recalculan al leer.",
        moduleKey: "balance",
        route: "/balance",
        howTo: "Carga una nueva versión del balance del período\nMárcala como oficial cuando esté lista\nCongélala para evitar ediciones posteriores",
        example: "Para enero cargas la v1, luego una v2 corregida y la marcas oficial; la v1 queda en el historial.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Estado de Resultado derivado",
        description: "El estado de resultado se calcula automáticamente desde el detalle del balance, sin captura manual.",
        moduleKey: "balance",
        route: "/balance/estado-resultado",
        howTo: "Abre Balance de comprobación › Estado de Resultado\nConsulta el P&L derivado del balance cargado",
        example: "Tras cargar el balance, el estado de resultado muestra ingresos, costos y gastos sin digitarlos.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Mapeo en cascada al plan estándar Russell",
        description: "Las cuentas del PUC del cliente se homologan contra el plan estándar Russell de forma encadenada por nivel, reduciendo el trabajo manual de mapeo.",
        moduleKey: "mapeo",
        route: "/config/mapeo",
        howTo: "Abre Configuración › Mapeo plan estándar\nSelecciona el cliente\nRevisa y ajusta la homologación propuesta contra el plan estándar",
        example: "Al cargar el balance, las cuentas de caja del cliente quedan mapeadas a la cuenta estándar correspondiente automáticamente.",
        featureStatus: "disponible",
      },
      {
        type: "mejora",
        title: "Extracción con Claude Sonnet 4.6 y prompt caching por umbral",
        description: "El modelo de extracción por defecto pasa a claude-sonnet-4-6 y se consolida el breakpoint de prompt caching con un umbral documentado por modelo, abaratando y acelerando la lectura de balances.",
        moduleKey: "balance",
        route: "/balance",
        howTo: "No requiere acción: aplica automáticamente al cargar un balance con IA. El modelo es configurable con la variable ANTHROPIC_MODEL.",
        example: "Cargar un balance grande reutiliza el contexto cacheado del prompt, reduciendo el costo y el tiempo de la extracción.",
        featureStatus: "disponible",
      },
      {
        type: "correccion",
        title: "Deduplicación de cuentas por código en el detalle",
        description: "Se corrige la duplicación de cuentas por código y una key duplicada en el detalle del balance que podía afectar el render y los totales.",
        moduleKey: "balance",
        route: "/balance",
        howTo: "No requiere acción: el detalle del balance ya no muestra cuentas repetidas.",
        example: "Un balance con la misma cuenta repetida en el origen ahora se consolida en una sola fila.",
        featureStatus: "disponible",
      },
    ],
  },
  {
    number: "1.2.0",
    title: "Parametrización y catálogos",
    summary: "Catálogos de ERP/Sector, administración del plan estándar Russell con bitácora, importación por Excel y mejoras transversales de usabilidad.",
    status: "publicada",
    releasedAt: new Date("2026-06-22"),
    order: 30,
    changes: [
      {
        type: "nueva",
        title: "Catálogos de ERP y Sector",
        description:
          "El ERP y el sector del cliente pasan a catálogos maestros. El ERP es opcional al crear el cliente, pero se exige para iniciar una operación (conciliación o carga de balance).",
        moduleKey: "clientes",
        route: "/config/clientes",
        howTo: "Abre Configuración › Clientes\nEdita un cliente y selecciona su ERP y sector del catálogo\nGuarda",
        example: "Un cliente sin ERP aparece etiquetado «Sin ERP»; al intentar cargar su balance, la plataforma te pide asignarlo primero.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Administración del plan estándar Russell con bitácora",
        description:
          "El Administrador puede crear, editar y eliminar las cuentas del plan estándar global. Cada movimiento queda en una bitácora dedicada además del registro de auditoría, y se bloquean los códigos con balances asociados.",
        moduleKey: "mapeo",
        route: "/config/mapeo",
        howTo:
          "Abre Configuración › Mapeo plan estándar\nVe a la pestaña del plan estándar\nCrea, edita o elimina cuentas estándar\nConsulta la bitácora de cambios",
        example: "Agregas una cuenta estándar y, al editar otra con balances asociados, la plataforma protege su código para no romper la trazabilidad.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Importación masiva por Excel",
        description: "Clientes y maestros (personas por rol) se cargan desde plantillas Excel, con activación de módulos y formatos DIAN y staff múltiple separado por «;».",
        moduleKey: "clientes",
        route: "/config/clientes",
        howTo: "Abre Configuración › Clientes\nDescarga la plantilla de importación\nComplétala y súbela\nRevisa el resultado de la importación",
        example: "Cargas 50 clientes de una sola vez desde Excel, cada uno con sus responsables y módulos activos.",
        featureStatus: "disponible",
      },
      {
        type: "mejora",
        title: "Paginación y filtrado de tablas",
        description: "Las tablas que crecen (clientes, usuarios, balance, conciliaciones, auditoría) se paginan (50/100/200) y se filtran para una navegación más rápida.",
        moduleKey: "clientes",
        route: "/config/clientes",
        howTo: "Abre cualquier listado grande\nUsa el control de paginación al pie y los filtros disponibles",
        example: "Con 300 clientes, el listado muestra 50 por página en lugar de cargarlos todos de golpe.",
        featureStatus: "disponible",
      },
      {
        type: "mejora",
        title: "Notificaciones de operaciones (toasts)",
        description: "Las acciones de crear, editar o eliminar confirman su resultado con una notificación que persiste incluso al cambiar de pantalla.",
        howTo: "Realiza cualquier acción (guardar un cliente, cargar un balance…)\nObserva la notificación de éxito o error en la esquina",
        example: "Al guardar un usuario ves «Usuario creado.»; si algo falla, el mensaje explica el motivo.",
        featureStatus: "disponible",
      },
    ],
  },
  {
    number: "1.3.0",
    title: "Árbol del balance, asignación manual y subgrupos",
    summary: "El detalle del balance se navega como árbol del plan estándar, permite mapear cuentas a mano y suma el catálogo de subgrupos (nivel 4). Aporte de Santiago Jaramillo.",
    status: "publicada",
    releasedAt: new Date("2026-06-23"),
    order: 40,
    changes: [
      {
        type: "nueva",
        title: "Detalle del balance como árbol 2/4/6/8",
        description:
          "El detalle del balance se navega jerárquicamente: clase (2) → subgrupo (4) → cuenta estándar Russell (6) → cuenta del cliente (8). Incluye expandir/contraer todo, filtros Todo / Balance / Estado de Resultado y columnas Saldo anterior · Débito · Crédito · Saldo · Var %.",
        moduleKey: "balance",
        route: "/balance",
        howTo: "Abre Balance de comprobación\nEntra a una versión del balance de un cliente\nNavega el árbol del plan estándar y usa los filtros y expandir/contraer",
        example: "Despliegas la clase 1 (Activo) y bajas hasta la cuenta del cliente, viendo el saldo agregado en cada nivel.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Asignación manual de cuentas al plan estándar",
        description:
          "Desde el detalle puedes mapear una cuenta del cliente a la cuenta estándar (nivel 6); la asignación arrastra todas las cuentas del mismo prefijo de 6 dígitos en ese balance y recalcula los contadores. Incluye un buscador de cuentas estándar prefiltrado por clase. Disponible para Staff y Administrador, con alcance por cliente.",
        moduleKey: "balance",
        route: "/balance",
        howTo:
          "Abre el detalle de un balance\nUbica una cuenta sin mapear\nUsa «asignar» y busca la cuenta estándar (nivel 6)\nConfirma: se mapean todas las del mismo prefijo de 6 dígitos",
        example: "Mapeas 1105 a su cuenta estándar y todas las subcuentas 1105xx del balance quedan homologadas de una vez.",
        featureStatus: "disponible",
      },
      {
        type: "nueva",
        title: "Catálogo de subgrupos del plan estándar (nivel 4)",
        description:
          "Tabla nueva de subgrupos (nivel 4) con su catálogo cargable, que aporta el NOMBRE de los niveles 4 y 2 del árbol del balance (antes eran un placeholder). Incluye una pestaña «Subgrupos (nivel 4)» en el mapeo con CRUD y auditoría.",
        moduleKey: "mapeo",
        route: "/config/mapeo",
        howTo: "Abre Configuración › Mapeo plan estándar\nVe a la pestaña «Subgrupos (nivel 4)»\nCrea, edita o elimina subgrupos (solo Administrador)",
        example: "El árbol del balance ya muestra «11 — Disponible» en lugar de solo el código, tomando el nombre del subgrupo.",
        featureStatus: "disponible",
      },
    ],
  },
  {
    number: "1.4.0",
    title: "En camino",
    summary: "Lo que estamos construyendo ahora. Esta versión está en borrador: su contenido puede cambiar.",
    status: "borrador",
    releasedAt: null,
    order: 50,
    changes: [
      {
        type: "nueva",
        title: "Módulo de Novedades",
        description:
          "Este mismo módulo: un changelog con control de versiones donde los administradores ven qué se construyó, cómo se opera cada funcionalidad y pueden probarla con un clic.",
        moduleKey: "novedades",
        route: "/novedades",
        howTo:
          "Abre Configuración › Novedades\nRecorre las versiones de arriba (la más reciente) hacia abajo\nEn cada cambio usa «Probar funcionalidad» para ir directo a la ruta",
        example: "Estás leyendo el resultado: cada tarjeta es una versión y cada ítem un cambio con su guía y ejemplo.",
        featureStatus: "disponible",
      },
      {
        type: "mejora",
        title: "Novedades visibles para todos los usuarios",
        description: "Abrir este módulo (hoy solo para administradores) al resto de roles, mostrando únicamente las versiones publicadas.",
        moduleKey: "novedades",
        howTo: "Pendiente de publicación.",
        example: "Cuando esté listo, cualquier usuario podrá ver las novedades publicadas desde su menú.",
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
