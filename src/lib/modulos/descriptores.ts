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
      col("descripcion", "Descripción", "texto", false, ["descripcion", "detalle", "nombre"]),
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
    verificaciones: [
      { id: "afi_leasing", texto: "Confirme si existen activos adquiridos mediante leasing financiero." },
      { id: "afi_depreciados", texto: "Verifique el tratamiento de los activos totalmente depreciados que siguen en uso." },
      { id: "afi_baja", texto: "Confirme si hubo bajas o ventas de activos en el período." },
    ],
  },

  // ===== Cartera / Cuentas por cobrar (CAR) → cuentas 13xx =====
  CAR: {
    codigo: "CAR",
    label: "Cartera",
    columnas: [
      col("tipo", "Tipo de cartera", "texto", true, ["tipo", "clase", "cartera", "cuenta", "concepto"]),
      col("documento", "Documento / factura", "texto", true, ["factura", "documento", "comprobante", "referencia", "numero"]),
      col("tercero", "Tercero / cliente", "texto", false, ["tercero", "cliente", "nombre", "razon social", "nit"]),
      col("fecha", "Fecha", "fecha", false, ["fecha", "emision"]),
      col("vencimiento", "Vencimiento", "fecha", false, ["vencimiento", "vence", "fecha vencimiento"]),
      col("saldo", "Saldo", "moneda", true, ["saldo", "valor", "saldo pendiente", "monto", "total"]),
    ],
    clasificador: "tipo",
    valor: "saldo",
    noNegativos: ["saldo"],
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
    verificaciones: [
      { id: "cxp_vinculados", texto: "Confirme si existen cuentas por pagar a vinculados económicos." },
      { id: "cxp_exterior", texto: "Verifique la existencia de obligaciones en moneda extranjera y su reexpresión." },
      { id: "cxp_conciliatorias", texto: "Confirme si hay partidas conciliatorias sin identificar." },
    ],
  },

  // ===== Ingresos (ING) → cuentas 41xx/42xx =====
  ING: {
    codigo: "ING",
    label: "Ingresos",
    columnas: [
      col("concepto", "Concepto / línea", "texto", true, ["concepto", "linea", "tipo", "cuenta", "rubro"]),
      col("documento", "Documento", "texto", false, ["factura", "documento", "comprobante", "numero", "referencia"]),
      col("tercero", "Tercero / cliente", "texto", false, ["tercero", "cliente", "nombre", "nit"]),
      col("fecha", "Fecha", "fecha", false, ["fecha", "emision"]),
      col("valor", "Valor", "moneda", true, ["valor", "monto", "total", "ingreso", "venta"]),
    ],
    clasificador: "concepto",
    valor: "valor",
    // Sin noNegativos: las devoluciones/notas crédito (valores negativos) son normales en ingresos.
    verificaciones: [
      { id: "ing_vinculados", texto: "Confirme si los ingresos incluyen operaciones con vinculados económicos." },
      { id: "ing_clasificacion", texto: "Verifique la clasificación entre ingresos operacionales y no operacionales." },
      { id: "ing_devoluciones", texto: "Confirme si las devoluciones y descuentos están correctamente registrados." },
    ],
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
