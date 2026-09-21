// DESCRIPTORES por módulo de conciliación (Inventarios, Cartera, CxP, Ingresos,
// Activos Fijos, Nómina). Fuente ÚNICA de la forma de cada módulo: sus columnas, cuál
// es el CLASIFICADOR (la dimensión por la que se consolida → cuenta de 4 díg) y cuál es
// el VALOR monetario (lo que se suma). El motor genérico de importación
// (`src/lib/modulos/extraccion/*`) se parametriza con esto — NO hay tablas por módulo ni
// pipelines duplicados; agregar un módulo = agregar un descriptor.
//
// Es «esquema fijo por módulo»: las columnas están fijas en código, pero el MOTOR que las
// procesa es genérico. `moduloCodigo` reutiliza los `Module.code` de `/config/modulos`
// (INV, CAR, CXP, ING, AFI, NOM) para alinear con los «campos mínimos» y `ClientModule`.

import { esRotuloEdad } from "./cartera/edades";

// "numero" = cantidad/conteo (miles, sin $); "moneda" = monto en pesos (con $).
export type TipoColumna = "texto" | "numero" | "moneda" | "fecha";

/** Una columna esperada del archivo del módulo (rol interno + cómo se mapea/valida). */
export type RolColumna = {
  /** Clave interna estable, p. ej. "valorTotal". Se usa en el spec y en `datos`. */
  nombre: string;
  /** Etiqueta legible para el editor de columnas del wizard. */
  etiqueta: string;
  tipo: TipoColumna;
  /** Si es obligatoria en el archivo (bloquea la confirmación si falta). */
  requerido: boolean;
  /** Palabras clave del encabezado para el auto-mapeo heurístico (además de la etiqueta). */
  sinonimos?: string[];
};

/**
 * Regla de derivación de una columna faltante:
 *  - `producto`  = multiplica dos columnas (valorTotal = cantidad × valorUnitario).
 *  - `cociente`  = divide dos columnas (valorUnitario = valorTotal ÷ cantidad).
 * Si el archivo trae la columna destino, el transform la respeta (no la pisa) y, en el
 * caso `producto`, avisa si no concuerda con el cálculo.
 */
export type Derivacion = { producto: [string, string] } | { cociente: [string, string] };

/** Punto de verificación MANUAL al cargar (checklist de novedades, estilo balance). */
export type Verificacion = { id: string; texto: string };

/**
 * Configuración del cruce entre el auxiliar del módulo y el balance por tercero.
 * La activación es explícita por módulo para que habilitarlo o retirarlo no requiera
 * cambiar la página, las consultas ni la pestaña que presentan el resultado.
 */
export interface ConfiguracionCrucePorTercero {
  habilitado: boolean;
  /** Rol que identifica al tercero (default `"tercero"`). */
  rolClave?: string;
  /** Rol con el nombre del tercero cuando viene en una columna aparte. */
  rolNombre?: string;
  /** Rol con el dígito de verificación, cuando el reporte lo trae en columna aparte. */
  rolDv?: string;
  /** Rol con la sucursal/agencia del tercero. */
  rolSucursal?: string;
  /**
   * Cuentas Russell de SEIS dígitos contra las que se concilia el módulo. Acota el lado
   * contable dentro de las cuentas de 4 díg. del prevalidador: Cartera concilia
   * 130505/130510/280505, no todo el grupo 13 (RF-CXC-04/05). Lo que el tercero tenga en
   * las demás cuentas del grupo se informa aparte, sin entrar al renglón.
   * Vacío/ausente = sin acotar (comportamiento actual).
   */
  cuentasRussell6?: readonly string[];
  /**
   * El módulo concilia por tercero con DETALLE: guarda el nivel de cada fila (tercero o
   * documento), su imputabilidad, la clave canónica del NIT, la cuenta y el origen del
   * archivo; materializa los saldos por tercero y exige que todo el saldo quede atribuido.
   * Es lo que comparten Cartera y Cuentas por Pagar. Ausente = cruce por tercero simple.
   */
  detalleTercero?: boolean;
  /**
   * Cuentas Russell de 6 dígitos que dicen el ORIGEN de una fila por su cuenta: la del exterior
   * (se factura en divisa) y la nacional. El resto de cuentas del módulo no deciden el origen.
   */
  cuentasExterior?: string[];
  cuentasNacional?: string[];
  /** El cierre en firme del módulo exige además que el cruce por tercero esté resuelto. */
  exigidoParaCierre?: boolean;
  /**
   * Entre las versiones del balance que terminan en el mes del cargue, cruzar contra la que
   * conserva el detalle por tercero aunque la oficial sea «Por cuenta» (Cartera y CxP). El cruce
   * contable y el por tercero usan ese mismo balance. Ausente = la oficial y, si no hay, la más
   * reciente.
   */
  preferirBalanceConTerceros?: boolean;
  /**
   * Naturaleza del MÓDULO para el lado contable del cruce por tercero: «D» (cartera) lee
   * todas sus cuentas con el signo del balance (débito +, crédito −) y «C» (cuentas por
   * pagar) con el signo invertido. El factor por cuenta del prevalidador muestra positiva
   * cada cuenta según su clase, y así un anticipo (280505 en cartera) SUMABA al saldo del
   * tercero en vez de restarlo, como sí lo resta el auxiliar: una diferencia falsa del doble
   * del anticipo. Ausente = factor por cuenta (comportamiento anterior).
   */
  naturaleza?: "D" | "C";
}

/**
 * FAMILIA de columnas dinámicas: un grupo de columnas cuyo NÚMERO y cuyos RÓTULOS los pone
 * el archivo, no el descriptor. Nace con los rangos de vencimiento de cartera, donde cada
 * ERP publica entre 4 y 9 baldes («1 - 30 DIAS», «De 1 a 90», «<== 90-») y ninguno coincide
 * con otro: declararlos como columnas fijas era imposible.
 *
 * El sugeridor detecta las columnas con `detector`, las retira del reparto de roles y las
 * guarda en `SpecModulo.familias[nombre]`; el transform las lee a `datos[nombre]` como un
 * objeto `rótulo → valor`.
 */
export type FamiliaDinamica = {
  /** Clave interna, p. ej. "edades". Es la llave en el spec y en `datos`. */
  nombre: string;
  etiqueta: string;
  tipo: TipoColumna;
  /** ¿El encabezado de esta columna pertenece a la familia? (puro, sin estado). */
  detector: (encabezado: unknown) => boolean;
};

/**
 * Deriva el VALOR monetario de la fila a partir de una familia cuando el archivo no trae
 * la columna de total, o cuando la trae vacía. `prevalece: "familia"` implementa la regla
 * acordada con la firma para cartera (RF-CXC-09): si la suma de las edades y el total
 * reportado difieren, manda la suma de las edades.
 */
export type ValorDerivadoFamilia = {
  deFamilia: string;
  prevalece: "familia" | "columna";
};

/**
 * Cuenta Russell de 6 dígitos que la cédula contable concilia aunque su subgrupo NO esté en los
 * prefijos del prevalidador del módulo (Nómina 251010, Ingresos 422005). El prevalidador no se
 * toca (su huella y sus aprobaciones siguen igual): la cuenta se lee por su saldo final, como toda
 * la cédula, y el signo sale de su clase (crédito positivo).
 */
export type CuentaAdicionalCedula = { cuenta: string };

/**
 * Subgrupo de 4 dígitos que, en una cédula a 4, se ABRE a sus cuentas de 6 (Activos fijos 1592:
 * cada depreciación acumulada es su propio renglón). `naturaleza` fija el signo de presentación de
 * esas cuentas: la 1592 es correctora del activo (crédito) aunque su clase sea débito.
 */
export type SubgrupoAbiertoCedula = { subgrupo: string; naturaleza: "D" | "C" };

/**
 * Segundo valor del archivo que cruza contra una cuenta RELACIONADA con la del clasificador:
 * en Activos fijos, la depreciación acumulada de un activo de 1520 cruza contra la 159210.
 */
export type ValorRelacionadoCedula = {
  /** Rol monetario del archivo (p. ej. `depreciacion`). Se suma en valor absoluto. */
  rol: string;
  /** Subgrupo del activo → cuenta de 6 donde cruza su valor relacionado. */
  pares: readonly { subgrupo: string; cuenta6: string }[];
};

/** Lo que la cédula contable concilia además de los prefijos del prevalidador. */
export interface ConfiguracionCedula {
  /**
   * Cuentas de 6 que acotan una cédula a 6 SOLO en la cédula (Ingresos: las siete de la 41). Manda
   * sobre `crucePorTercero.cuentasRussell6` para la cédula y deja intacto el cruce por tercero.
   */
  cuentas6?: readonly string[];
  cuentasAdicionales?: readonly CuentaAdicionalCedula[];
  subgruposAbiertos?: readonly SubgrupoAbiertoCedula[];
  valorRelacionado?: ValorRelacionadoCedula;
}

export type DescriptorModulo = {
  /** Código del módulo (= `Module.code`). */
  codigo: string;
  label: string;
  columnas: RolColumna[];
  /** Columna que clasifica cada fila (→ consolidación `clasificador → cuenta4`). */
  clasificador: string;
  /**
   * Columna de respaldo cuando la del clasificador viene VACÍA en el archivo.
   * Nómina clasifica por CÓDIGO del concepto (estable entre períodos, es lo que se
   * carga masivamente en `/config/conceptos-nomina`), pero los archivos que no traen
   * la columna de código siguen clasificándose por el texto del concepto.
   */
  clasificadorAlterno?: string;
  /** Columna monetaria que se suma en la consolidación. */
  valor: string;
  /** Derivaciones de columnas faltantes (clave = columna destino). */
  derivar?: Record<string, Derivacion>;
  /** Columnas que NO deberían ser negativas (existencias/costos): generan alerta automática. */
  noNegativos?: string[];
  /**
   * Qué hacer con las filas en NEGRITA (subtotales del ERP) al importar:
   *  - sin bandera → se marcan `agrupadora` (no imputan, no se pueden rescatar por fila).
   *  - `true` → entran como `movimiento` OMITIDAS: tampoco imputan, pero el borrador las
   *    muestra tachadas con «Incluir», así que un falso positivo de la negrita se rescata
   *    a mano en vez de quedar invisible. Inventarios lo usa porque sus archivos marcan en
   *    negrita tanto el gran total como ítems corrientes.
   */
  negritaComoOmitida?: boolean;
  /**
   * Con un patrón de archivo, la carga pide SIEMPRE confirmar la columna del clasificador
   * (Inventarios: «Tipo de inventario»), igual que la fila del total. La respuesta vale solo
   * para ese cargue: la versión del patrón no cambia (`aplicarClasificadorDeCarga`).
   */
  confirmarClasificadorEnCarga?: boolean;
  /**
   * Con un patrón de archivo, la carga pregunta SIEMPRE «¿El archivo trae el valor total?»: Sí
   * con su ubicación (columna y fila) o No. Vale solo para ese cargue (`aplicarTotalDeCarga`).
   */
  confirmarTotalEnCarga?: boolean;
  /** Preguntas de verificación manual que el usuario responde al confirmar la carga. */
  verificaciones?: Verificacion[];
  /** Verificaciones que obligatoriamente deben responderse «Sí» para promover. */
  verificacionesCriticasSi?: string[];
  /** Compuerta única del cruce por tercero y sus roles de columna. */
  crucePorTercero: ConfiguracionCrucePorTercero;
  /**
   * Columnas cuyo número y rótulos los pone el ARCHIVO (ver `FamiliaDinamica`). Un módulo
   * que no las declara se comporta exactamente como antes: el spec descarta cualquier
   * familia guardada y el transform no lee ninguna.
   */
  familiasDinamicas?: FamiliaDinamica[];
  /** De dónde sale `valor` cuando la columna del descriptor no basta. */
  valorDerivado?: ValorDerivadoFamilia;
  /**
   * Roles que admiten FORWARD-FILL: el archivo los imprime una vez (en una cabecera o en
   * la primera fila del bloque) y las filas siguientes los heredan. Hasta ahora solo el
   * clasificador podía arrastrarse; los reportes jerárquicos de cartera necesitan arrastrar
   * también el tercero y su nombre.
   */
  arrastrables?: string[];
  /**
   * Roles que identifican un ÍTEM para el fraccionamiento (`fraccionamiento.ts`). Sin esto
   * la llave se deduce por el nombre del rol (`/ref/i`), que en cartera no existe y deja la
   * llave en solo el clasificador: dos facturas distintas del mismo tercero se leían como
   * el mismo ítem.
   */
  rolesLlaveItem?: string[];
  /**
   * La NEGRITA del archivo marca estructura (encabezados de cuenta, subtotales por
   * tercero) y no solo decoración. Habilita la compuerta que verifica esa correlación
   * antes de usarla; sin ella la negrita nunca reclasifica una fila.
   */
  usarNegritaComoEstructura?: boolean;
  /**
   * Roles de texto que están LLENOS en una fila de detalle y VACÍOS en un subtotal (señal
   * `sin_detalle` de `subtotales.ts`). Por defecto se deducen: todo texto que no sea el
   * clasificador. Cartera lo declara porque su descriptor tiene nueve columnas de texto y
   * la mayoría (moneda, rango de edad, marca de sección) también viene vacía en las filas
   * de detalle: deducirlas apagaría la señal o la volvería un falso positivo.
   */
  rolesDetalle?: string[];
  /**
   * Roles que cambiaron de nombre: `{ nombreViejo: nombreNuevo }`. Los perfiles guardados
   * y el `datos` de los cargues anteriores se leen a través de este mapa, así que renombrar
   * un rol no deja huérfana la memoria del cliente.
   */
  aliasLegado?: Record<string, string>;
  /**
   * Nivel de la cuenta Russell contra la que cruza la cédula contable: 4 dígitos (el de
   * siempre: la fila del cruce es un subgrupo, 1435) o 6 (Nómina, RF-NOM-05: 510506 y
   * 720505 son renglones distintos aunque compartan la 5105/7205; Cartera y CxP, que concilian
   * contra sus `cuentasRussell6`: 130505 y 130510 no son la misma cartera). A 6 la homologación del
   * cliente guarda la cuenta completa (`consolidacion_modulo_cliente.cuenta_6`), las marcas
   * y el cierre en firme se llavean por ella y el lado contable se agrega por
   * `cuenta_6_russell`. Ausente = 4.
   */
  nivelCruce?: 4 | 6;
  /**
   * Ampliaciones de la cédula contable que no dependen del prevalidador: cuentas de 6 adicionales,
   * subgrupos abiertos a 6 y el valor relacionado del archivo (ver `ConfiguracionCedula`).
   * Ausente = la cédula es exactamente la de `nivelCruce` y los prefijos del prevalidador.
   */
  cedula?: ConfiguracionCedula;
  /**
   * Roles que hacen las veces de la columna de VALOR cuando el archivo no la trae: Nómina
   * separa devengos y deducciones (o débito y crédito) y el valor de la fila se deriva de
   * ellos (`valor-nomina.ts`). Con alguno mapeado, `valor` deja de contar como faltante.
   */
  valorAlterno?: string[];
  /** Capacidades propias de Nómina (ver `ConfiguracionNomina`). Ausente en los demás módulos. */
  nomina?: ConfiguracionNomina;
};

/**
 * Lo que el motor hace de más cuando el descriptor es de NÓMINA. Cada capacidad es explícita
 * para que ningún otro módulo cambie de comportamiento por accidente.
 */
export interface ConfiguracionNomina {
  /**
   * Cada fila recibe su período (`datos.periodoDesde`/`periodoHasta`, «YYYY-MM») a partir de
   * la fecha de liquidación, el período impreso o el rango del acumulado (`nomina/periodo.ts`).
   * Como el cruce compara contra el SALDO FINAL del balance al corte, entran las filas del año del
   * corte hasta su mes (`spec.periodoHasta`); las posteriores y las de años anteriores quedan
   * como agrupadora con motivo `fuera_de_periodo`.
   */
  periodoPorFila: boolean;
  /**
   * El valor de la fila sale de devengo/deducción, débito/crédito o valor+tipo (devengo +,
   * deducción −) y se anota `datos.naturaleza`; el neto de Novasoft, los pies repetidos del
   * ERP y las filas sin concepto no imputan (`nomina/valor-nomina.ts`).
   */
  valorPorNaturaleza: boolean;
  /** Los roles `tipo: "fecha"` se guardan en ISO («YYYY-MM-DD»), también los seriales de Excel. */
  normalizarFechas: boolean;
}

const col =(nombre: string, etiqueta: string, tipo: TipoColumna, requerido = false, sinonimos?: string[]): RolColumna => ({ nombre, etiqueta, tipo, requerido, sinonimos });

/**
 * Cuentas Russell de 6 dígitos del módulo de Nómina (RF-NOM-05, sin los pasivos laborales):
 * las ocho subcuentas de gasto de personal de administración (5105) y de ventas (5205), las
 * ocho de mano de obra directa (7205, que numera distinto: 720505 es «Salarios») y la mano
 * de obra indirecta (730505). Son las del PUC maestro Russell (`prisma/data`).
 */
export const CUENTAS_RUSSELL_NOMINA: readonly string[] = [
  "510506", "510530", "510536", "510539", "510568", "510569", "510570", "510595",
  "520506", "520530", "520536", "520539", "520568", "520569", "520570", "520595",
  "720505", "720510", "720515", "720520", "720525", "720530", "720535", "720540",
  "730505",
];

/**
 * Pasivos laborales que Nómina concilia en la cédula por su saldo final (16/Sep/2026):
 * cesantías consolidadas, intereses sobre cesantías, prima de servicios y vacaciones consolidadas.
 * Están fuera de los prefijos del prevalidador (5105/5205/7205/7305), que no cambia.
 */
export const CUENTAS_PASIVO_NOMINA: readonly string[] = ["251010", "251505", "252005", "252505"];

/**
 * Cuentas Russell de 6 dígitos de la 41 que concilia Ingresos (16/Sep/2026): los ingresos por
 * tarifa, exentos, excluidos y las devoluciones. Son todas las de la 41 en el plan estándar.
 */
export const CUENTAS_RUSSELL_INGRESOS: readonly string[] = ["410505", "410510", "410515", "410520", "410525", "410530", "417505"];

/**
 * Activos fijos: cada subgrupo depreciable y la cuenta de depreciación acumulada contra la que
 * cruza la depreciación del archivo. 1504, 1508 y 1512 no se deprecian.
 */
export const RELACION_DEPRECIACION_AFI: readonly { subgrupo: string; cuenta6: string }[] = [
  { subgrupo: "1516", cuenta6: "159205" },
  { subgrupo: "1520", cuenta6: "159210" },
  { subgrupo: "1524", cuenta6: "159215" },
  { subgrupo: "1528", cuenta6: "159220" },
  { subgrupo: "1540", cuenta6: "159235" },
  { subgrupo: "1584", cuenta6: "159280" },
];

/** Nivel de la cuenta Russell de la cédula contable del módulo (4 salvo que el descriptor diga 6). */
export function nivelCruceModulo(descriptor: Pick<DescriptorModulo, "nivelCruce"> | null | undefined): 4 | 6 {
  return descriptor?.nivelCruce === 6 ? 6 : 4;
}

/**
 * Catálogo de descriptores. Se pilotea con Inventarios (INV); los demás módulos se
 * agregan aquí con sus columnas + clasificador/valor y reusan TODO el motor.
 */
export const MODULOS_IMPORT: Record<string, DescriptorModulo> = {
  INV: {
    codigo: "INV",
    label: "Inventarios",
    columnas: [
      col("tipo", "Tipo de inventario", "texto", true, ["tipo", "clase", "categoria", "grupo inventario", "cuenta", "cuenta lm"]),
      col("referencia", "Referencia", "texto", false, ["referencia", "ref", "codigo", "sku", "item", "articulo", "producto", "id de pieza", "id pieza", "pieza", "id"]),
      col("descripcion", "Descripción", "texto", false, ["descripcion", "detalle", "nombre", "desc item", "desc articulo", "desc producto", "nombre item"]),
      col("cantidad", "Cantidad", "numero", false, ["cantidad", "cant", "unidades", "existencia", "qty"]),
      col("valorUnitario", "Valor unitario", "moneda", false, ["valor unitario", "vr unitario", "costo unitario", "precio unitario", "unitario"]),
      col("valorTotal", "Valor total", "moneda", true, ["valor total", "vr total", "costo total", "valor", "total", "valor liquidable", "liquidable"]),
    ],
    clasificador: "tipo",
    valor: "valorTotal",
    // valorTotal = cantidad × unitario; si falta el unitario, se deriva = valorTotal ÷ cantidad.
    derivar: {
      valorTotal: { producto: ["cantidad", "valorUnitario"] },
      valorUnitario: { cociente: ["valorTotal", "cantidad"] },
    },
    noNegativos: ["cantidad", "valorUnitario", "valorTotal"],
    // La negrita en los inventarios NO es confiable como «es un subtotal»: se omite por
    // defecto (excluida del total) pero queda rescatable desde el borrador.
    negritaComoOmitida: true,
    // Con patrón, el analista confirma el tipo de inventario en cada cargue (otra columna o uno
    // global) sin tocar la versión.
    confirmarClasificadorEnCarga: true,
    // Y si el archivo trae el valor total (Sí con su celda, o No), sin tocar la versión.
    confirmarTotalEnCarga: true,
    crucePorTercero: { habilitado: false },
    verificaciones: [
      { id: "consignacion_recibida", texto: "Confirme si la compañía maneja mercancías recibidas en consignación." },
      { id: "consignacion_entregada", texto: "Verifique la existencia de bienes entregados en consignación." },
    ],
  },

  // ===== Activos Fijos (AFI) → toda la 15 a 4 dígitos, la 1592 a 6 =====
  // El costo de cada activo cruza contra su subgrupo (1520) y su depreciación acumulada contra la
  // 1592xx relacionada (`RELACION_DEPRECIACION_AFI`). La 1592 no es renglón de 4: se abre a 6.
  AFI: {
    codigo: "AFI",
    label: "Activos Fijos",
    columnas: [
      col("grupo", "Grupo de activo", "texto", true, ["grupo", "tipo", "clase", "cuenta", "categoria"]),
      col("placa", "Placa / código", "texto", true, ["placa", "codigo", "activo", "id", "referencia"]),
      col("descripcion", "Descripción", "texto", false, ["descripcion", "detalle", "nombre"]),
      col("fechaAdquisicion", "Fecha de adquisición", "fecha", false, ["fecha", "adquisicion", "compra", "ingreso"]),
      col("costo", "Costo histórico", "moneda", true, ["costo", "valor", "costo historico", "valor adquisicion", "valor compra"]),
      col("depreciacion", "Depreciación acumulada", "moneda", false, ["depreciacion", "dep acumulada", "depreciacion acumulada"]),
      col("valorNeto", "Valor neto en libros", "moneda", false, ["neto", "valor neto", "valor en libros", "saldo"]),
    ],
    clasificador: "grupo",
    valor: "costo",
    noNegativos: ["costo"],
    cedula: {
      subgruposAbiertos: [{ subgrupo: "1592", naturaleza: "C" }],
      valorRelacionado: { rol: "depreciacion", pares: RELACION_DEPRECIACION_AFI },
    },
    crucePorTercero: { habilitado: false },
    verificaciones: [
      { id: "afi_leasing", texto: "Confirme si existen activos adquiridos mediante leasing financiero." },
      { id: "afi_depreciados", texto: "Verifique el tratamiento de los activos totalmente depreciados que siguen en uso." },
      { id: "afi_baja", texto: "Confirme si hubo bajas o ventas de activos en el período." },
    ],
  },

  // ===== Cartera / Cuentas por cobrar (CAR) → 130505, 130510 y 280505 =====
  // Se concilia POR TERCERO (NIT), no por agrupador: cada NIT es un renglón (RF-CXC-02).
  // Los catorce reportes reales de clientes analizados se reparten en cinco formas —resumen
  // por tercero, documentos planos (con la edad en columna o como etiqueta), jerárquico
  // tercero→documentos, y documentos con subtotales rotulados—, así que casi ninguna
  // columna puede exigirse salvo el identificador del tercero.
  CAR: {
    codigo: "CAR",
    label: "Cartera",
    columnas: [
      // «Código» a secas NO es una cuenta contable: en la mitad de los reportes es el
      // identificador del tercero. La cuenta se reconoce por su propio nombre.
      col("cuenta", "Cuenta contable del archivo", "texto", false, ["cuenta", "cta", "cuenta contable", "codigo contable", "codigo cuenta"]),
      col("nit", "NIT / cédula del tercero", "texto", true, ["nit", "identificacion", "tercero", "cliente", "codigo", "codigo de cliente", "cedula", "documento identidad"]),
      // Sin «descripcion»: en SIIGO rotula la descripción de la CUENTA y le ganaba a la
      // columna que se llama «NOMBRE». Donde el nombre del tercero vive bajo «Descripción»
      // (SIESA jerárquico) lo resuelve el modo de identificador compartido, que lo toma de
      // la columna contigua a la del identificador.
      col("nombre", "Nombre / razón social", "texto", false, ["nombre", "nombres", "razon social", "nombre del cliente", "nombre tercero", "proveedor acreedor", "deudor"]),
      col("dv", "Dígito de verificación", "texto", false, ["dig ver", "digito verificacion", "digito de verificacion"]),
      col("sucursal", "Sucursal / agencia", "texto", false, ["sucursal", "sucurs", "agencia"]),
      // Sin «doc» ni «justificante»: el primero rotula el TIPO en World Office y el segundo
      // es una columna paralela de LIBRA que le ganaba a la que se llama «DOCUMENTO».
      col("documento", "Documento / factura", "texto", false, ["documento", "factura", "comprobante", "n documento", "num", "numero documento"]),
      col("tipoDocumento", "Tipo de documento", "texto", false, ["tipo documento", "t dcto", "t op", "doc", "serie"]),
      col("fecha", "Fecha del documento", "fecha", false, ["fecha", "fecha factura", "f expedic", "fecha de contabilizacion", "f doc", "emision"]),
      col("vencimiento", "Fecha de vencimiento", "fecha", false, ["vencimiento", "vence", "f vcto", "fec vence", "fecha vencimiento", "f venc", "f vencim"]),
      col("diasVencidos", "Días vencidos", "numero", false, ["dias vencidos", "diasvc", "numdias", "dias de mora", "dias"]),
      col("total", "Saldo / total", "moneda", false, ["saldo", "total", "valor total", "total cartera", "importe", "saldo pendiente", "monto"]),
      col("edadEtiqueta", "Rango de edad (etiqueta)", "texto", false, ["edad", "edades", "rango", "estado cartera"]),
      col("moneda", "Moneda", "texto", false, ["moneda", "divisa"]),
      col("tasaCambio", "Tasa de cambio", "numero", false, ["tc", "trm", "tasa de cambio", "tasa cambio"]),
      col("marcaSeccion", "Marca de renglón de cuenta", "texto", false, ["ter", "no terceros", "cantidad terceros"]),
    ],
    // Las columnas de vencimiento las pone el archivo: entre 4 y 9, con rótulos distintos
    // en cada ERP. Ver `src/lib/modulos/cartera/edades.ts`.
    familiasDinamicas: [
      {
        nombre: "edades",
        etiqueta: "Rangos de vencimiento",
        tipo: "moneda",
        detector: (encabezado: unknown) => esRotuloEdad(encabezado) != null,
      },
    ],
    clasificador: "cuenta",
    valor: "total",
    // RF-CXC-06/09: si el archivo no trae total, el saldo es la suma de las edades; si trae
    // ambos y difieren, manda la suma de las edades y la diferencia se alerta.
    valorDerivado: { deFamilia: "edades", prevalece: "familia" },
    // Se concilia por cuenta Russell de 6 dígitos (130505 nacional, 130510 exterior, 280505
    // anticipos), no por subgrupo: el resto del grupo 13/28 se informa «fuera del módulo».
    nivelCruce: 6,
    // Sin `noNegativos`: un saldo negativo es un anticipo o una nota crédito sin cruzar —se
    // alerta como «naturaleza contraria», nunca se rechaza el cargue.
    arrastrables: ["nit", "nombre", "cuenta"],
    rolesLlaveItem: ["nit", "documento"],
    // Un renglón de cartera es un DOCUMENTO; los subtotales por tercero o por cuenta lo
    // traen vacío. El NIT no sirve de señal: los reportes jerárquicos lo repiten en la
    // fila de subtotal del propio tercero.
    rolesDetalle: ["documento", "tipoDocumento"],
    usarNegritaComoEstructura: true,
    aliasLegado: { saldo: "total", tercero: "nit", tipo: "cuenta" },
    crucePorTercero: {
      habilitado: true,
      rolClave: "nit",
      rolNombre: "nombre",
      rolDv: "dv",
      rolSucursal: "sucursal",
      cuentasRussell6: ["130505", "130510", "280505"],
      cuentasNacional: ["130505"],
      cuentasExterior: ["130510"],
      exigidoParaCierre: true,
      naturaleza: "D",
      detalleTercero: true,
      preferirBalanceConTerceros: true,
    },
    // Sin verificaciones manuales al cargar: el borrador no pide confirmar anticipos, cartera
    // vencida ni vinculados (los cargues anteriores conservan las respuestas que guardaron).
  },

  // ===== Cuentas por Pagar (CXP) → 2205/2210/2335 y anticipos 1330 =====
  // Estructura análoga a Cartera, contra el pasivo (RF-CXP-01…14): comparte su motor de
  // detalle por tercero. Lo propio de CxP sale de los 16 auxiliares reales analizados: el
  // saldo de la columna manda sobre las edades (SAP deja sin edad los documentos por
  // vencer), varios ERP imprimen la deuda en negativo y SIIGO pone el saldo del proveedor
  // solo en la primera fila de su bloque.
  CXP: {
    codigo: "CXP",
    label: "Cuentas por Pagar",
    columnas: [
      col("cuenta", "Cuenta contable del archivo", "texto", false, ["cuenta", "cta", "cuenta contable", "codigo contable", "codigo cuenta", "cuenta asociada"]),
      col("nit", "NIT / cédula del proveedor", "texto", true, ["nit", "identificacion", "tercero", "proveedor", "codigo", "codigo de proveedor", "cod provedor", "cod proveedor", "cedula", "documento identidad"]),
      col("nombre", "Nombre / razón social", "texto", false, ["nombre", "nombres", "razon social", "nombre tercero", "nombre proveedor", "nombre de acreedor", "nombre del acreedor", "nombre acreedor", "proveedor acreedor"]),
      col("dv", "Dígito de verificación", "texto", false, ["dig ver", "digito verificacion", "digito de verificacion"]),
      col("sucursal", "Sucursal / agencia", "texto", false, ["sucursal", "sucurs", "agencia"]),
      col("documento", "Documento / factura", "texto", false, ["documento", "factura", "comprobante", "n documento", "no documento", "num", "numero documento", "nro dcto", "nro fact", "nro factura"]),
      col("tipoDocumento", "Tipo de documento", "texto", false, ["tipo documento", "tipo dcto", "tipo", "t dcto", "t op", "doc", "serie"]),
      // Sin «fecha de contabilización»: en SAP convive con «Fecha de documento» y le ganaba.
      col("fecha", "Fecha del documento", "fecha", false, ["fecha", "fecha factura", "fecha de documento", "fecha dcto", "fech exp", "f expedic", "fecha asiento", "f doc", "emision"]),
      col("vencimiento", "Fecha de vencimiento", "fecha", false, ["vencimiento", "vence", "f vcto", "fec vence", "fecha vence", "fecha vencimiento", "fecha de vencimiento", "fech ven", "f venc", "f vencim"]),
      col("diasVencidos", "Días vencidos", "numero", false, ["dias vencidos", "dias vcto", "dias ven", "d m", "numdias", "dias de mora", "dias"]),
      // «Saldo vencido» es, en SAP, el saldo ABIERTO del documento, no solo lo vencido.
      col("total", "Saldo del documento o del proveedor", "moneda", false, ["saldo", "total", "valor total", "importe", "saldo pendiente", "monto", "saldo vencido", "total proveedor", "total cxp", "deuda pesos", "saldo cop"]),
      // Sin sinónimos: lo propone el sugeridor cuando la columna de saldo solo trae dato en la
      // primera fila de cada bloque (SIIGO). Es el control del proveedor; nunca imputa.
      col("saldoTercero", "Saldo del proveedor (1.ª fila del bloque)", "moneda", false, []),
      col("edadEtiqueta", "Rango de edad (etiqueta)", "texto", false, ["edad", "edades", "rango"]),
      col("moneda", "Moneda", "texto", false, ["moneda", "divisa"]),
      col("tasaCambio", "Tasa de cambio", "numero", false, ["tc", "trm", "tasa de cambio", "tasa cambio", "t cambio"]),
      col("marcaSeccion", "Marca de renglón de cuenta", "texto", false, ["ter", "no terceros", "cantidad terceros"]),
    ],
    familiasDinamicas: [
      {
        nombre: "edades",
        etiqueta: "Rangos de vencimiento",
        tipo: "moneda",
        detector: (encabezado: unknown) => esRotuloEdad(encabezado) != null,
      },
    ],
    clasificador: "cuenta",
    valor: "total",
    // D2 (12/Sep/2026): manda el saldo de la columna. Las edades dan el valor solo cuando la
    // columna no viene o viene en cero (SIESA Zarzal); si ambas vienen y difieren, se alerta.
    valorDerivado: { deFamilia: "edades", prevalece: "columna" },
    // Se concilia por cuenta Russell de 6 dígitos (las 13 de `cuentasRussell6`), no por subgrupo.
    nivelCruce: 6,
    // Sin «noNegativos»: un anticipo o una nota a favor es un saldo negativo legítimo.
    arrastrables: ["nit", "nombre", "cuenta"],
    rolesLlaveItem: ["nit", "documento"],
    rolesDetalle: ["documento", "tipoDocumento"],
    usarNegritaComoEstructura: true,
    // Perfiles guardados con el descriptor anterior (tipo/tercero/saldo).
    aliasLegado: { saldo: "total", tercero: "nit", tipo: "cuenta" },
    crucePorTercero: {
      habilitado: true,
      rolClave: "nit",
      rolNombre: "nombre",
      rolDv: "dv",
      rolSucursal: "sucursal",
      // D1 (12/Sep/2026): RF-CXP-06 depurado contra el PUC Russell.
      cuentasRussell6: ["220505", "221005", "233505", "233510", "233520", "233525", "233530", "233540", "233555", "233595", "133005", "133010", "133095"],
      cuentasNacional: ["220505"],
      cuentasExterior: ["221005"],
      exigidoParaCierre: true,
      naturaleza: "C",
      detalleTercero: true,
      preferirBalanceConTerceros: true,
    },
    // Sin verificaciones manuales al cargar: el borrador no pide confirmar vinculados, moneda
    // extranjera ni partidas conciliatorias (los cargues anteriores conservan sus respuestas).
  },

  // ===== Ingresos / Facturación (ING) → la 41 a 6 dígitos + 422005 =====
  ING: {
    codigo: "ING",
    label: "Ingresos",
    columnas: [
      col("concepto", "Concepto / línea", "texto", true, ["concepto", "linea", "tipo", "cuenta", "rubro"]),
      col("documento", "Documento", "texto", false, ["factura", "documento", "comprobante", "numero", "referencia"]),
      col("tercero", "Tercero / cliente", "texto", false, ["tercero", "cliente", "nombre", "nit"]),
      col("fecha", "Fecha", "fecha", false, ["fecha", "emision"]),
      col("valor", "Ingreso neto sin impuestos", "moneda", true, ["ingreso neto", "venta neta", "subtotal", "base gravable", "valor sin iva", "valor sin impuestos", "total sin iva", "total sin impuestos", "ingreso", "venta"]),
    ],
    clasificador: "concepto",
    valor: "valor",
    // Sin noNegativos: las devoluciones/notas crédito (valores negativos) son normales en ingresos.
    // La cédula concilia por cuenta Russell de 6 dígitos (16/Sep/2026): las siete de la 41
    // (`CUENTAS_RUSSELL_INGRESOS`) y los arrendamientos no operacionales (422005); el resto de la
    // 4220 no es del módulo. La lista vive en `cedula.cuentas6`, no en `crucePorTercero`, para que
    // el cruce por tercero siga como estaba (sobre toda la 41, sin asignación por cuenta).
    nivelCruce: 6,
    cedula: {
      cuentas6: CUENTAS_RUSSELL_INGRESOS,
      cuentasAdicionales: [{ cuenta: "422005" }],
    },
    crucePorTercero: { habilitado: true },
    verificaciones: [
      { id: "ing_sin_impuestos", texto: "Confirme que el valor cargado corresponde al ingreso neto sin IVA ni otros impuestos y que las devoluciones o notas crédito conservan signo negativo." },
      { id: "ing_vinculados", texto: "Confirme si los ingresos incluyen operaciones con vinculados económicos." },
      { id: "ing_clasificacion", texto: "Verifique la clasificación entre ingresos operacionales y no operacionales." },
      { id: "ing_devoluciones", texto: "Confirme si las devoluciones y descuentos están correctamente registrados." },
    ],
    verificacionesCriticasSi: ["ing_sin_impuestos"],
  },

  // ===== Nómina (NOM) → gasto y costo de personal a SEIS dígitos =====
  // Requisitos (Levantamiento Requisitos Módulos V3 §4.7):
  //  - RF-NOM-01 campos mínimos: grupo de cuenta contable, código y nombre del concepto,
  //    cantidad y total. RF-NOM-02 los grupos son sueldos, horas extras, comisiones,
  //    incapacidades, auxilio de transporte, cesantías, intereses, prima, vacaciones,
  //    auxilios y bonificaciones.
  //  - RF-NOM-03 la conciliación es POR CONCEPTO, no por tercero (el cruce por cédula queda
  //    apagado). RF-NOM-04 requiere el balance por cuenta.
  //  - RF-NOM-05 el módulo se maneja a 6 dígitos: las ocho 5105xx, las ocho 5205xx, las ocho
  //    7205xx y la 730505 (`CUENTAS_RUSSELL_NOMINA`). De los pasivos laborales 25xx entran,
  //    por saldo final, 251010, 251505, 252005 y 252505 (`CUENTAS_PASIVO_NOMINA`, 16/Sep/2026); los
  //    demás conceptos de pasivo (libranzas, retenciones) siguen en el control de deducciones.
  //  - RF-NOM-06/07 el cliente trabaja con códigos de concepto propios y cada concepto tiene
  //    una cuenta contable del cliente; el cuadro de homologación lo entrega TI del cliente.
  //  - RF-NOM-08/09 carga masiva de la homologación (/config/conceptos-nomina), persistente,
  //    con mantenimiento cuando un concepto nace o cambia de cuenta.
  //  - RF-NOM-10 la cuenta Russell se deriva de la cuenta del cliente ya homologada en el
  //    balance (`cuentas_cliente`). RF-NOM-11 varios conceptos pueden ir a una cuenta.
  //  - RF-NOM-12 cuando una cuenta aparece en varias clases (51/52/72/73) la porción de cada
  //    lado la define el auditor en la conciliación, no el sistema.
  //  - RF-NOM-13 hay reportes con detalle por empleado y reportes con solo el total por
  //    concepto: la cédula no es requerida.
  // Clasifica por CÓDIGO del concepto, no por su texto: el código es lo estable entre
  // períodos y es la llave de la carga masiva de conceptos (/config/conceptos-nomina).
  // El archivo puede no traerlo (columna opcional): ahí manda `clasificadorAlterno`.
  // Los sinónimos salen de los encabezados reales de 16 archivos de 14 clientes (LIBRA,
  // NOMINAI, Heinsohn, Ofimática, Novasoft/SAP, SIESA, SIEVENSOFT, SIIGO, Buk, World Office):
  // fixture `nomina/__fixtures__/encabezados-nom.json`. Varios encabezados son ambiguos por
  // texto («Concepto» es el código en Novasoft y el nombre en Buk; «Empleado» es la cédula en
  // Ofimática y el nombre en SIIGO): `ajustarRolesNomina` (sugerir.ts) los decide por CONTENIDO.
  NOM: {
    codigo: "NOM",
    label: "Nómina",
    columnas: [
      col("codigo", "Código del concepto", "texto", false, ["codigo concepto", "cod concepto", "codigo del concepto", "codigo nomina", "id concepto", "codigo interno buk", "codigo concepto mm", "concepto codigo"]),
      col("concepto", "Concepto", "texto", true, ["concepto", "nombre concepto", "descripcion concepto", "nombre del concepto", "novedad", "conceptos", "rubro", "dmc refe"]),
      col("cedula", "Cédula / documento", "texto", false, ["cedula", "documento", "identificacion", "nit", "codigo empleado", "tercero", "numero de documento", "no identificacion", "codigo sn", "ter coda"]),
      col("empleado", "Empleado", "texto", false, ["empleado", "nombre", "nombres", "trabajador", "nombre empleado", "nombres empleado", "nombre completo", "nombre sn"]),
      col("agrupador", "Centro de costo / grupo", "texto", false, ["centro de costos", "centro de costo", "centro costo", "centro", "c cos", "grupo", "area", "dependencia", "division", "centro contable", "grupo de ccostos", "arb coda"]),
      col("cuenta", "Cuenta contable del cliente", "texto", false, ["cuenta contable", "cuenta", "cta", "cuenta asociada", "cue codi"]),
      col("cuentaAdmin", "Cuenta · administración", "texto", false, ["administrativo", "administracion", "cuenta administracion"]),
      col("cuentaVentas", "Cuenta · ventas", "texto", false, ["ventas", "cuenta ventas"]),
      col("cuentaMOD", "Cuenta · mano de obra directa", "texto", false, ["mano de obra directa", "mod"]),
      col("cuentaMOI", "Cuenta · mano de obra indirecta", "texto", false, ["mano de obra indirecta", "moi"]),
      col("devengo", "Devengo", "moneda", false, ["devengo", "devengos", "devengado", "percepcion", "ingreso", "ingresos", "valor devengado"]),
      col("deduccion", "Deducción", "moneda", false, ["deduccion", "deducciones", "descuento", "descuentos", "valor deducido"]),
      col("debito", "Débito", "moneda", false, ["debito", "debitos", "debe", "dmc vadb"]),
      col("credito", "Crédito", "moneda", false, ["credito", "creditos", "haber", "dmc vacr"]),
      col("valor", "Valor", "moneda", true, ["valor", "monto", "total", "suma de valor", "valor total", "importe", "vlr"]),
      col("neto", "Neto pagado", "moneda", false, ["neto pagado", "neto a pagar", "neto", "total neto"]),
      col("cantidad", "Cantidad / horas / días", "numero", false, ["cantidad", "horas", "cantidad horas", "dias", "horas dias", "horas movto", "unidades", "tiempo"]),
      col("tipo", "Tipo (devengo / deducción)", "texto", false, ["tipo", "clasificacion", "categoria", "naturaleza", "tipo concepto", "tipo de concepto"]),
      col("fecha", "Fecha de liquidación / pago", "fecha", false, ["fecha de liquidacion", "fecha liquidacion", "fecha de paga", "fecha pago", "fecha de pago", "fecha final", "fecha", "mco fech"]),
      col("fechaCorte", "Fecha de corte", "fecha", false, ["fecha de corte", "fecha corte", "fecha inicial"]),
      col("periodo", "Período", "texto", false, ["periodo", "aaaamm", "ano mes", "periodo nomina", "mes periodo"]),
      col("mes", "Mes", "texto", false, ["mes"]),
      col("anio", "Año", "texto", false, ["ano", "anio", "ejercicio", "year"]),
      // «De» y «A» de SIIGO no van como sinónimos: dos letras coinciden con cualquier encabezado.
      // Los asigna `ajustarRolesNomina` por rótulo exacto y contenido AAAAMM.
      col("periodoDesde", "Período desde", "texto", false, ["desde", "periodo desde", "periodo inicial", "fecha desde"]),
      col("periodoHasta", "Período hasta", "texto", false, ["hasta", "periodo hasta", "periodo final", "fecha hasta"]),
      col("tipoDocumento", "Tipo de liquidación / documento", "texto", false, ["tipo de liquidacion", "tipo liquidacion", "tipo dcto", "tipo docto", "tipo doc", "tipo de documento", "no documento", "documento no"]),
    ],
    clasificador: "codigo",
    clasificadorAlterno: "concepto",
    valor: "valor",
    valorAlterno: ["devengo", "deduccion", "debito", "credito"],
    // Sin `noNegativos`: una deducción es un valor negativo legítimo.
    aliasLegado: { area: "agrupador" },
    // Un subtotal no trae cédula ni empleado (Santiago Corazón imprime «Total <concepto>» y
    // «Total <empleado>» en las mismas columnas del detalle).
    rolesDetalle: ["cedula", "empleado"],
    // Una fila sin cédula, código ni período no es un ítem (pie del ERP). Sin empleado (RF-NOM-13)
    // basta el código o el concepto.
    rolesLlaveItem: ["cedula", "codigo", "concepto", "periodo"],
    // Heinsohn imprime el mes y el concepto solo en la 1.ª fila del bloque; Santiago repite el nombre.
    arrastrables: ["periodo", "mes", "anio", "cedula", "empleado", "codigo", "concepto"],
    // Novasoft cierra cada empleado con «TOTALES» en negrita: es un subtotal, no un ítem.
    usarNegritaComoEstructura: true,
    nivelCruce: 6,
    cedula: { cuentasAdicionales: CUENTAS_PASIVO_NOMINA.map((cuenta) => ({ cuenta })) },
    nomina: { periodoPorFila: true, valorPorNaturaleza: true, normalizarFechas: true },
    // El cruce por tercero queda apagado (RF-NOM-03); si se reactiva es contra la CÉDULA del
    // empleado. `cuentasRussell6` acota el lado contable a las cuentas de RF-NOM-05 aunque el
    // cruce por tercero no exista: es lo que decide «fuera del módulo» y el cierre en firme.
    crucePorTercero: {
      habilitado: false,
      rolClave: "cedula",
      rolNombre: "empleado",
      cuentasRussell6: CUENTAS_RUSSELL_NOMINA,
    },
    // Sin verificaciones manuales al cargar (21/Sep/2026): el borrador ya no pregunta por aportes,
    // contratistas, provisiones ni seguridad social (los cargues anteriores conservan las
    // respuestas que guardaron). Los aportes no traídos se siguen marcando no modulares en el cruce.
  },
};

/** Descriptor del módulo por su código, o `null` si no está registrado. */
export function descriptorModulo(codigo: string): DescriptorModulo | null {
  return MODULOS_IMPORT[codigo] ?? null;
}

/** ¿El código corresponde a un módulo con importación soportada? */
export function esModuloSoportado(codigo: string): boolean {
  return codigo in MODULOS_IMPORT;
}

/** Códigos de módulos con importación soportada, en orden de declaración. */
export function modulosSoportados(): string[] {
  return Object.keys(MODULOS_IMPORT);
}

export function bloqueoVerificacionesCriticasModulo(
  descriptor: DescriptorModulo,
  respuestas: Record<string, { respuesta: "si" | "no" | "na" } | undefined>,
): string | null {
  for (const id of descriptor.verificacionesCriticasSi ?? []) {
    if (respuestas[id]?.respuesta === "si") continue;
    const texto = descriptor.verificaciones?.find((item) => item.id === id)?.texto ?? id;
    return `Para cargar ${descriptor.label}, la verificación «${texto}» debe responderse Sí.`;
  }
  return null;
}

/**
 * Impide presentar como confiable un cruce histórico que no dejó evidencia de las
 * confirmaciones críticas hoy exigidas por el módulo.
 */
export function bloqueoCrucePorVerificacionesCriticasModulo(
  descriptor: DescriptorModulo,
  respuestas: Record<string, { respuesta: "si" | "no" | "na" } | undefined>,
): string | null {
  for (const id of descriptor.verificacionesCriticasSi ?? []) {
    if (respuestas[id]?.respuesta === "si") continue;
    const texto = descriptor.verificaciones?.find((item) => item.id === id)?.texto ?? id;
    return `El cargue histórico de ${descriptor.label} no acredita la verificación «${texto}» con respuesta Sí. Revisa el archivo y vuelve a cargarlo antes de usar el cruce contable.`;
  }
  return null;
}

/** Un anexo nunca puede certificar retroactivamente filas históricas no verificadas. */
export function bloqueoAnexoPorVerificacionesCriticasModulo(
  descriptor: DescriptorModulo,
  respuestasVigentes: Record<string, { respuesta: "si" | "no" | "na" } | undefined>,
): string | null {
  for (const id of descriptor.verificacionesCriticasSi ?? []) {
    if (respuestasVigentes[id]?.respuesta === "si") continue;
    return `No se puede agregar un archivo al cargue vigente de ${descriptor.label} porque no acredita el valor neto sin impuestos. Se requiere una recarga completa como nueva versión, no un anexo parcial.`;
  }
  return null;
}
