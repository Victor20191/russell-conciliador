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
  /** El cierre en firme del módulo exige además que el cruce por tercero esté resuelto. */
  exigidoParaCierre?: boolean;
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
};

const col = (nombre: string, etiqueta: string, tipo: TipoColumna, requerido = false, sinonimos?: string[]): RolColumna => ({ nombre, etiqueta, tipo, requerido, sinonimos });

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
    crucePorTercero: { habilitado: false },
    verificaciones: [
      { id: "consignacion_recibida", texto: "Confirme si la compañía maneja mercancías recibidas en consignación." },
      { id: "consignacion_entregada", texto: "Verifique la existencia de bienes entregados en consignación." },
    ],
  },

  // ===== Activos Fijos (AFI) → cuentas 15xx =====
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
      exigidoParaCierre: true,
    },
    verificaciones: [
      { id: "car_anticipos", texto: "Confirme si la cartera incluye saldos a favor de clientes (anticipos)." },
      { id: "car_vencida", texto: "Verifique la existencia de cartera vencida mayor a 360 días." },
      { id: "car_vinculados", texto: "Confirme si existen cuentas por cobrar a vinculados económicos." },
    ],
  },

  // ===== Cuentas por Pagar (CXP) → cuentas 22xx/23xx =====
  CXP: {
    codigo: "CXP",
    label: "Cuentas por Pagar",
    columnas: [
      col("tipo", "Tipo de cuenta por pagar", "texto", true, ["tipo", "clase", "cuenta", "concepto"]),
      col("documento", "Documento / factura", "texto", true, ["factura", "documento", "comprobante", "referencia", "numero"]),
      col("tercero", "Tercero / proveedor", "texto", false, ["tercero", "proveedor", "nombre", "razon social", "nit"]),
      col("fecha", "Fecha", "fecha", false, ["fecha", "emision"]),
      col("vencimiento", "Vencimiento", "fecha", false, ["vencimiento", "vence", "fecha vencimiento"]),
      col("saldo", "Saldo", "moneda", true, ["saldo", "valor", "saldo pendiente", "monto", "total"]),
    ],
    clasificador: "tipo",
    valor: "saldo",
    noNegativos: ["saldo"],
    crucePorTercero: { habilitado: true },
    verificaciones: [
      { id: "cxp_vinculados", texto: "Confirme si existen cuentas por pagar a vinculados económicos." },
      { id: "cxp_exterior", texto: "Verifique la existencia de obligaciones en moneda extranjera y su reexpresión." },
      { id: "cxp_conciliatorias", texto: "Confirme si hay partidas conciliatorias sin identificar." },
    ],
  },

  // ===== Ingresos / Facturación (ING) → cuentas 41xx =====
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
    crucePorTercero: { habilitado: true },
    verificaciones: [
      { id: "ing_sin_impuestos", texto: "Confirme que el valor cargado corresponde al ingreso neto sin IVA ni otros impuestos y que las devoluciones o notas crédito conservan signo negativo." },
      { id: "ing_vinculados", texto: "Confirme si los ingresos incluyen operaciones con vinculados económicos." },
      { id: "ing_clasificacion", texto: "Verifique la clasificación entre ingresos operacionales y no operacionales." },
      { id: "ing_devoluciones", texto: "Confirme si las devoluciones y descuentos están correctamente registrados." },
    ],
    verificacionesCriticasSi: ["ing_sin_impuestos"],
  },

  // ===== Nómina (NOM) → cuentas 51xx/72xx (gastos de personal) =====
  // Clasifica por CÓDIGO del concepto, no por su texto: el código es lo estable entre
  // períodos y es la llave de la carga masiva de conceptos (/config/conceptos-nomina).
  // El archivo puede no traerlo (columna opcional): ahí manda `clasificadorAlterno`.
  NOM: {
    codigo: "NOM",
    label: "Nómina",
    columnas: [
      col("codigo", "Código del concepto", "texto", false, ["codigo", "cod", "codigo concepto", "cod concepto", "codigo nomina", "id concepto"]),
      col("concepto", "Concepto", "texto", true, ["concepto", "tipo", "rubro", "cuenta", "devengado", "descripcion"]),
      col("cedula", "Cédula / documento", "texto", true, ["cedula", "documento", "identificacion", "nit", "id"]),
      col("empleado", "Empleado", "texto", false, ["empleado", "nombre", "trabajador"]),
      col("area", "Área / centro de costo", "texto", false, ["area", "centro", "centro de costo", "dependencia"]),
      col("valor", "Valor", "moneda", true, ["valor", "monto", "total", "devengado", "pagado"]),
    ],
    clasificador: "codigo",
    clasificadorAlterno: "concepto",
    valor: "valor",
    noNegativos: ["valor"],
    // Si se reactiva, el cruce por tercero de nómina es contra la CÉDULA del empleado.
    crucePorTercero: {
      habilitado: false,
      rolClave: "cedula",
      rolNombre: "empleado",
    },
    verificaciones: [
      { id: "nom_contratistas", texto: "Confirme si la nómina incluye pagos a contratistas por prestación de servicios." },
      { id: "nom_prestaciones", texto: "Verifique la provisión de prestaciones sociales del período." },
      { id: "nom_seguridad", texto: "Confirme la conciliación de aportes a seguridad social y parafiscales." },
    ],
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
