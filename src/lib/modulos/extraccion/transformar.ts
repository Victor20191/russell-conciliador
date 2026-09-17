// Transformación DETERMINISTA y PURA (sin BD/IA) de un archivo de módulo: aplica el
// `SpecModulo` (mapeo de columnas) a la grilla y produce las filas listas para el staging.
// Genérico: la forma sale del descriptor. Reutiliza los helpers numéricos del balance.
//
// Reglas:
//  - Lee cada columna mapeada del rol → `datos[rol]` (número o texto según el descriptor).
//  - DERIVA columnas faltantes (`descriptor.derivar`, p. ej. valorTotal = cantidad×valorUnit)
//    y AVISA (excepción) si el archivo trae ambas y no concuerdan (no las pisa).
//  - PROMUEVE `clasificador` y `valor` (las columnas que el descriptor marca) a campos
//    propios, para consolidar sin abrir el JSON.
//  - Marca AGRUPADOR las filas en NEGRITA/subrayado (subtotales); no cuentan en el valor.
//  - Marca `total` las filas de SUBTOTAL por grupo y el gran total (`../subtotales.ts`:
//    rótulo, sin detalle, negrita, aritmética); no cuentan en el valor y sirven de CONTROL.
//    En el modo `manual`, una coordenada ubicada en el archivo actual manda como gran total;
//    los perfiles legados sin coordenada conservan el patrón columna+texto.
import { normalizarMonto } from "@/lib/balance/extraccion/transformar";
import type { CeldaCruda, GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { DescriptorModulo } from "../descriptores";
import type { SpecModulo } from "./esquema";
import { norm, puntajeRol } from "./sugerir";
import { coincideMarcaSubtotal, columnasDetalle, detectarSubtotales, esRotuloTotal, motivoDe } from "../subtotales";
import { archivoConDocumentos, esIdentificadorVacio, esNumeroDocumento, rolDeCeldaCompartida } from "../cartera/identificador-compartido";
import { esPieDeReporte } from "./pie-reporte";
import { aPesos, esMonedaExtranjera, montoConDivisa } from "../cartera/moneda";
import { nivelCarteraDeSpec } from "../cartera/tipo-formato";
import { totalesPorTercero } from "../cartera/total-tercero";
import { evaluarFilaNomina, nombreSinCedula, normalizarCedula } from "../nomina/valor-nomina";
import { codigoConceptoCanonico } from "../nomina/homologacion";
import { parsearAnio, parsearFechaCelda, rangoDeFila, rangoDentroDelCargue, type RangoMeses } from "../nomina/periodo";

export type TipoFilaModulo = "movimiento" | "agrupadora" | "total";
export type ValorCelda = string | number | null;

// Etiqueta del clasificador cuando el inventario es GLOBAL (un solo valor para todo el archivo).
export const CLASIFICADOR_GLOBAL = "GLOBAL";

export type FilaModulo = {
  filaNum: number; // 1-based en la hoja origen
  clasificador: string | null;
  valor: number;
  datos: Record<string, ValorCelda>; // rol → valor (todas las columnas mapeadas)
  tipoFila: TipoFilaModulo;
  /** Tri-estado del staging: `true` entra omitida (negrita en módulos con
   *  `negritaComoOmitida`), `undefined` la deja sin tocar. */
  omitida?: boolean;
  /** Por qué el motor clasificó la fila como `total` (`motivoDe`), p. ej. «subtotal:rotulo,aritmetica». */
  motivo?: string;
  // ===== Columnas de FAMILIA (rótulo del ERP → importe). Solo los módulos que las declaran.
  /** Importe de cada balde, llaveado por su rótulo LITERAL («De 1 a 90», «POR VENCER»). */
  familias?: Record<string, Record<string, number>>;
  /** Σ de los baldes que suman (excluye los de clase `excluir`, p. ej. «Deuda dudosa»). */
  sumaFamilia?: number;
  /** El valor que declaraba la columna del descriptor, cuando existe y se derivó otro. */
  valorReportado?: number | null;
  /** De dónde salió `valor`: la columna, la familia, o ambas coincidiendo. */
  origenValor?: "columna" | "familia" | "columna_y_familia";
  /** Saldo que la CABECERA de un tercero declara para todo su bloque (`terceroModo`). */
  saldoDeclarado?: number;
  /** Importe en divisa del que salió `valor` (hoja en USD o celda «USD (54,323.40)»), su moneda y la TRM. */
  saldoDivisa?: number;
  moneda?: string;
  trm?: number;
};

export type ExcepcionModulo = { filaNum: number; mensaje: string };

/** Fila con valor real que quedó por ENCIMA del inicio efectivo y no se cargó (ver `filasOmitidasArriba`). */
export type FilaOmitidaModulo = { filaNum: number; valor: number };

export type ResultadoTransformModulo = {
  filas: FilaModulo[];
  filasLeidas: number; // filas de datos no vacías
  filasExcluidas: number; // agrupadoras/totales/negritas omitidas (no cuentan en el valor)
  excepciones: ExcepcionModulo[];
  // Red de seguridad de integridad: filas con VALOR real que quedaron por encima del
  // inicio efectivo (fuera del bloque contiguo que recuperó la Parte A) y por lo tanto
  // NO se cargaron. Debe ser 0 en el caso típico; > 0 es una señal de que el spec/perfil
  // sigue perdiendo datos y hay que avisarlo (no descartarlo en silencio).
  filasOmitidasArriba: number;
  omitidasMuestra: FilaOmitidaModulo[]; // hasta 8 referencias (filaNum + valor) para el mensaje
};

/**
 * Forma persistida de la reconciliación (Parte B) para sobrevivir a la navegación entre la
 * lectura del archivo y el borrador: se guarda como un campo adicional dentro del JSON del
 * spec del lote (`ModuloImportacionLote.specJson`, columna libre, sin tocar el esquema
 * Prisma) SOLO cuando hubo algo que avisar. `resultadoAReconciliacion` arma este objeto.
 */
export type ReconciliacionModulo = { filasOmitidasArriba: number; muestra: FilaOmitidaModulo[] };

/** Arma la reconciliación a partir del resultado del transform, o `null` si no hay nada que avisar. */
export function resultadoAReconciliacion(resultado: ResultadoTransformModulo): ReconciliacionModulo | null {
  return resultado.filasOmitidasArriba > 0
    ? { filasOmitidasArriba: resultado.filasOmitidasArriba, muestra: resultado.omitidasMuestra }
    : null;
}

/** Redondea a 2 decimales (Decimal 18,2) y normaliza el −0. */
function redondear(v: number): number {
  return Math.round(v * 100) / 100 + 0 || 0;
}

const celda = (fila: CeldaCruda[], col1: number): CeldaCruda => (col1 >= 1 ? (fila[col1 - 1] ?? null) : null);
/** Importe con código de divisa escrito como texto: «USD (54,323.40)», «EUR 1.200,00». */
const MONTO_EN_DIVISA = /^[A-Z]{3}\s*\(?-?[\d.,]+\)?$/;
const aTexto = (c: CeldaCruda): string | null => (c == null ? null : String(c).replace(/\s+/g, " ").trim() || null);
const aNumero = (c: CeldaCruda): number | null =>
  typeof c === "number" ? c : typeof c === "boolean" ? (c ? 1 : 0) : c == null ? null : normalizarMonto(String(c));

/**
 * ¿La fila es AGRUPADORA (subtotal/encabezado en negrita)? Se decide por la señal de
 * negrita de las columnas CLAVE (clasificador + valor): un renglón donde esas celdas van
 * en negrita es un subtotal del ERP, no un ítem. Si el archivo no trae negrita (xls/csv),
 * nunca marca agrupadora aquí (el usuario lo hace a mano en el borrador).
 */
function esAgrupadoraPorNegrita(negritaFila: boolean[] | undefined, spec: SpecModulo, descriptor: DescriptorModulo): boolean {
  if (!negritaFila) return false;
  const cols = [descriptor.clasificador, descriptor.valor]
    .map((rol) => spec.columnas[rol] ?? 0)
    .filter((c) => c >= 1);
  if (cols.length === 0) return false;
  return cols.some((c) => negritaFila[c - 1] === true);
}

/**
 * Aplica un spec a una hoja y devuelve las filas del módulo. Puro y determinista.
 */
export function transformarModulo(descriptor: DescriptorModulo, spec: SpecModulo, hoja: GridHoja): ResultadoTransformModulo {
  const filas: FilaModulo[] = [];
  const excepciones: ExcepcionModulo[] = [];
  let filasLeidas = 0;
  let filasExcluidas = 0;
  const esNumerica = new Map(descriptor.columnas.map((c) => [c.nombre, c.tipo === "numero" || c.tipo === "moneda"]));
  const filaFisicaDe = (indice: number): number => hoja.filasFisicas?.[indice] ?? indice + 1;

  // Modo del clasificador. `arrastrarClasificador` legado ≡ "arrastrar".
  const modo = spec.clasificadorModo ?? (spec.arrastrarClasificador ? "arrastrar" : "columna");
  const clasCol = spec.columnas[descriptor.clasificador] ?? 0;
  const esTotal = (s: string) => esRotuloTotal(s.trim());
  let ultimoClasificador: string | null = null; // modo "arrastrar" (forward-fill)
  const rolClasificador = descriptor.columnas.find((rc) => rc.nombre === descriptor.clasificador);
  // ¿La fila trae, en la columna del clasificador, la ETIQUETA del encabezado (sinónimo del
  // rol)? Señal de que es el título de la columna, no una fila de datos real. Misma
  // salvaguarda que usaban el seed del arrastre y ahora también el inicio efectivo (Parte A).
  const esEncabezadoClasificador = (filaR: CeldaCruda[]): boolean => {
    if (clasCol < 1 || !rolClasificador) return false;
    const txt = aTexto(celda(filaR, clasCol));
    return txt != null && puntajeRol(norm(txt), rolClasificador) > 0;
  };

  /**
   * ¿La fila ES la de encabezado? Se reconoce por su CONTENIDO, no por su número: el spec
   * puede venir de un perfil memorizado y el ERP mover el encabezado una fila arriba o abajo
   * de un mes a otro (una línea de banner de más o de menos) sin cambiar su huella.
   *
   * Hace falta porque la señal de «esto no es un dato» que usaban las redes de seguridad era
   * «la celda de valor no es numérica», y eso deja de servir en cuanto la columna de valor es
   * un rango de vencimiento: `normalizarMonto("1 - 30 DIAS")` da 130. Sin esta comprobación,
   * la Parte A se traga la propia fila de encabezado y la Parte B la denuncia como perdida.
   */
  const esFilaDeEncabezado = (filaR: CeldaCruda[]): boolean => {
    if (esEncabezadoClasificador(filaR)) return true;
    // Una columna de familia cuyo contenido es su propio rótulo: es el encabezado, literal.
    for (const f of familiasSpec) {
      for (const c of f.columnas) {
        const txt = aTexto(celda(filaR, c.columna));
        if (txt != null && norm(txt) === norm(c.etiqueta)) return true;
      }
    }
    // O dos o más columnas mapeadas que contienen el nombre de su propio rol.
    let coincidencias = 0;
    for (const rc of descriptor.columnas) {
      const col = spec.columnas[rc.nombre] ?? 0;
      if (col < 1) continue;
      const txt = aTexto(celda(filaR, col));
      if (txt != null && puntajeRol(norm(txt), rc) > 0 && ++coincidencias >= 2) return true;
    }
    return false;
  };

  // PARTE A — INICIO EFECTIVO: `primeraFilaDatos` (a veces heredado de un perfil guardado)
  // puede haber quedado fijado DEMASIADO ABAJO, dejando filas de datos reales entre el
  // encabezado y el inicio declarado. Sube desde `primeraFilaDatos` mientras encuentre filas
  // de DATOS contiguas (celda de valor numérica y que no sea el encabezado); se detiene en
  // la primera fila en blanco/título (valor no numérico) o de encabezado. Si `primeraFilaDatos`
  // ya era correcto, la fila anterior es justo el encabezado o está en blanco → no sube nada.
  // Columnas de cada FAMILIA declarada por el descriptor y presentes en el spec.
  const familiasSpec = (descriptor.familiasDinamicas ?? [])
    .map((f) => ({ nombre: f.nombre, columnas: spec.familias?.[f.nombre] ?? [] }))
    .filter((f) => f.columnas.length > 0);
  const hayFamilias = familiasSpec.length > 0;
  // Convención de signo del archivo (CxP): la deuda que el ERP imprime en negativo se guarda
  // en positivo. Se aplica a los importes al leerlos, así el valor, las edades, el saldo
  // declarado y los controles quedan todos en la misma convención.
  const conDetalleTercero = descriptor.crucePorTercero.detalleTercero === true;
  const factorSigno = spec.invertirSigno === true && conDetalleTercero ? -1 : 1;
  const conSigno = (v: number | null): number | null => (v == null || v === 0 ? v : v * factorSigno);

  // Cuando el archivo NO trae la columna del descriptor (ILIMITADA no publica total) pero sí
  // los baldes, el primero hace de columna de valor para las redes de seguridad (inicio
  // efectivo y reconciliación). Sin esto se apagan en silencio justo donde más se necesitan.
  const valCol = (spec.columnas[descriptor.valor] ?? 0) || (familiasSpec[0]?.columnas[0]?.columna ?? 0);
  // Tope duro: NADA por encima del encabezado es dato. Antes bastaba con que la celda de
  // valor no fuera numérica para detenerse, pero un rótulo como «1 - 30 DIAS» sí parsea
  // como número y la red se tragaba la propia fila de encabezado.
  let inicio = spec.primeraFilaDatos - 1; // 0-based, como antes
  if (valCol >= 1) {
    for (let r = inicio - 1; r >= 0; r--) {
      const filaR = hoja.filas[r] ?? [];
      const val = aNumero(celda(filaR, valCol));
      if (val == null || esFilaDeEncabezado(filaR)) break; // frontera: detente
      inicio = r; // fila de datos real: se recupera
    }
  }

  // Modo "arrastrar": SEMBRAR el forward-fill cuando el clasificador del PRIMER bloque está
  // declarado una sola vez, por ENCIMA del inicio efectivo. Sin esto, el bucle principal
  // arranca con `ultimoClasificador = null` y las primeras filas del bloque quedan
  // "(sin clasificar)" hasta la siguiente celda con dato. Sube desde la fila anterior al
  // inicio buscando el primer valor no vacío de esa columna; si ese valor es la ETIQUETA del
  // encabezado, NO se usa como semilla —sería el título de la columna, no una cuenta real— y
  // se detiene sin sembrar.
  if (modo === "arrastrar" && clasCol >= 1) {
    for (let r = inicio - 1; r >= 0; r--) {
      const valor = aTexto(celda(hoja.filas[r] ?? [], clasCol));
      if (valor == null) continue; // fila en blanco: sigue subiendo
      if (rolClasificador && puntajeRol(norm(valor), rolClasificador) > 0) break; // es el encabezado: no sembrar
      ultimoClasificador = valor;
      break;
    }
  }

  let seccionActual: string | null = null; // modo "seccion" (encabezados de grupo)
  // Forward-fill de roles que el archivo imprime UNA vez: en la cabecera del tercero
  // (`terceroModo: "cabecera"`) o en la primera fila de su bloque. Solo se arrastran los
  // roles que el descriptor autoriza y el spec declara.
  const rolesArrastrados = (spec.arrastrarRoles ?? []).filter(
    (rol) => (descriptor.arrastrables ?? []).includes(rol) && (spec.columnas[rol] ?? 0) >= 1,
  );
  const ultimoPorRol = new Map<string, string>();
  // Reporte jerárquico: una fila trae el tercero y sus documentos van debajo sin él.
  const rolClave = descriptor.crucePorTercero.rolClave;
  const modoCabecera = spec.terceroModo === "cabecera"
    && !!rolClave
    && (spec.columnas[rolClave] ?? 0) >= 1
    && (spec.columnas.documento ?? 0) >= 1;

  // Roles que IDENTIFICAN una fila (a quién y a qué documento corresponde). Una fila con
  // importe pero sin ninguno de ellos no es un ítem: es un pie de página del ERP («SBS
  // 1.25.0»), una fila de porcentajes o un resto de formato. Sumarla mete plata de nadie
  // en la conciliación. Solo aplica a los módulos que declaran su llave de ítem.
  const rolesIdentidad = [
    ...(descriptor.rolesLlaveItem ?? []),
    ...(descriptor.crucePorTercero.rolNombre ? [descriptor.crucePorTercero.rolNombre] : []),
  ].filter((rol) => (spec.columnas[rol] ?? 0) >= 1);
  const exigeIdentidad = (descriptor.rolesLlaveItem?.length ?? 0) > 0 && rolesIdentidad.length > 0;

  // ===== SIESA: secciones de cuenta e identificador compartido =====
  // SIESA imprime en la columna del identificador, según la fila, la CUENTA contable (con
  // «#Ter.», la cantidad de terceros de la sección), el TERCERO y —en Zarzal, que no le da
  // columna propia— el número del DOCUMENTO. El motor asigna un rol por columna: sin esto la
  // cuenta se leía como un tercero y en Zarzal ningún documento tenía dueño.
  // Solo en los módulos con detalle por tercero (Cartera, CxP) y cuando el archivo trae
  // «#Ter.»: es la firma del formato, y fuera de él
  // la negrita no significa lo mismo.
  const rolIdentificador = rolClave ?? "";
  const colIdentidad = rolIdentificador ? (spec.columnas[rolIdentificador] ?? 0) : 0;
  const colMarcaSeccion = spec.columnas.marcaSeccion ?? 0;
  const colDocumento = spec.columnas.documento ?? 0;
  const rolNombre = descriptor.crucePorTercero.rolNombre ?? "";
  const formatoSiesa = descriptor.crucePorTercero.detalleTercero === true
    && colIdentidad >= 1
    && colMarcaSeccion >= 1;
  const columnaCompartida = formatoSiesa && colIdentidad === colDocumento;
  // La negrita significa cosas OPUESTAS según el archivo traiga o no documentos (ver
  // «identificador-compartido.ts»): se decide una vez, mirando la columna del documento.
  const hayDocumentos = formatoSiesa && colDocumento >= 1
    && archivoConDocumentos(hoja.filas.slice(inicio).map((f) => celda(f ?? [], colDocumento)));
  // Lo que la sección y la cabecera del tercero declaran una vez y sus filas heredan.
  let ultimaCuentaSeccion: string | null = null;
  let ultimoNombreTercero: string | null = null;
  /** Primer texto con letras a la derecha del identificador que no es un documento: el nombre. */
  const nombreJuntoAlIdentificador = (filaR: CeldaCruda[]): { nombre: string; columna: number } | null => {
    for (let c = colIdentidad + 1; c <= colIdentidad + 3; c++) {
      const v = aTexto(celda(filaR, c));
      if (v != null && /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(v) && !esNumeroDocumento(v)) return { nombre: v, columna: c };
    }
    return null;
  };
  // Filas que esperan a la detección de subtotales y, si no resultan subtotal, vuelven a
  // agrupadora con este motivo.
  const motivoAlDegradar = new Map<number, string>();
  // Fila rotulada de proveedor (SEVEN): el identificador solo existe en esas filas.
  const filaTercero = conDetalleTercero && rolIdentificador ? spec.filaTercero ?? null : null;
  // Señales crudas por fila (paralelas a `filas`) para la detección de subtotales: no van a `datos`.
  const crudo: { negrita: boolean; rotuloClasificador: string | null; marcaManual: boolean; marcaManualExacta: boolean }[] = [];
  // Filas en negrita cuya clasificación se decide DESPUÉS de detectar subtotales (ver
  // «negrita diferida» más abajo). Solo en módulos con `usarNegritaComoEstructura`.
  const negritaDiferida = new Set<number>();
  // Modo "manual" de subtotales: columna (1-based del ARCHIVO, no necesariamente mapeada a
  // un rol) cuyo contenido marca las filas de subtotal.
  const colMarcaSubtotal = spec.subtotales === "manual" ? (spec.subtotalesColumna ?? 0) : 0;
  // ¿La fila es un ENCABEZADO DE SECCIÓN? (modo "seccion"): su clasificador tiene texto y,
  // o bien la columna marcada viene vacía (título, no ítem), o el clasificador va en negrita.
  const rolVacioSeccion = spec.seccionColumnaVaciaRol;
  // La señal por "columna vacía" SOLO vale si esa columna está mapeada (col ≥ 1); si no,
  // datos[rol] sería siempre null y TODAS las filas se verían como sección (footgun).
  const seccionPorVacia = !!rolVacioSeccion && (spec.columnas[rolVacioSeccion] ?? 0) >= 1;
  const esRenglonSeccion = (datos: Record<string, ValorCelda>, negritaFila: boolean[] | undefined): boolean => {
    const etiqueta = aTexto(datos[descriptor.clasificador]);
    if (etiqueta == null) return false;
    const marcaVacia = seccionPorVacia ? datos[rolVacioSeccion!] == null || datos[rolVacioSeccion!] === "" : false;
    const negrita = negritaFila && clasCol >= 1 ? negritaFila[clasCol - 1] === true : false;
    return marcaVacia || negrita;
  };

  // Importes en DIVISA, de toda la hoja (`spec.monedaArchivo`) o de una celda con su código: se
  // convierten a pesos con la TRM de cierre del cargue (D3 de Cartera). Sin TRM no se inventa.
  const trmCierre = conDetalleTercero && spec.trmCierre != null && spec.trmCierre > 0 ? spec.trmCierre : null;
  const monedaArchivo = conDetalleTercero && esMonedaExtranjera(spec.monedaArchivo) ? (spec.monedaArchivo as string) : null;
  if (monedaArchivo && !trmCierre) {
    excepciones.push({
      filaNum: spec.primeraFilaDatos,
      mensaje: `Los importes están en ${monedaArchivo} y falta la TRM de cierre: se leyeron sin convertir a pesos.`,
    });
  }

  // ===== NÓMINA (ver `ConfiguracionNomina`) =====
  const nomina = descriptor.nomina ?? null;
  // Roles mapeados en el spec (los que el archivo trae) y, de ellos, los de texto: la regla
  // del valor mira los primeros y el pie repetido del ERP los segundos.
  const rolesMapeados = new Set(descriptor.columnas.filter((rc) => (spec.columnas[rc.nombre] ?? 0) >= 1).map((rc) => rc.nombre));
  const rolesTextoMapeados = descriptor.columnas.filter((rc) => rc.tipo === "texto" && rolesMapeados.has(rc.nombre)).map((rc) => rc.nombre);
  // Rango de meses del cargue y año de contexto para los períodos que no lo traen («PERIODO 3»).
  const rangoCargue: RangoMeses | null = nomina?.periodoPorFila && (spec.periodoDesde || spec.periodoHasta)
    ? { desde: spec.periodoDesde ?? spec.periodoHasta!, hasta: spec.periodoHasta ?? spec.periodoDesde! }
    : null;
  const anioCargue = rangoCargue ? parsearAnio(rangoCargue.hasta.slice(0, 4)) : null;

  for (let r = inicio; r < hoja.filas.length; r++) {
    const fila = hoja.filas[r] ?? [];
    const filaNum = filaFisicaDe(r);
    // Pie de página del ERP («Siesa Enterprise Net 1.25.0 · Pág. 1 / 1»): nunca es un ítem, aunque su
    // texto caiga en la columna del identificador y el número de página en la del saldo.
    const esPieErp = esPieDeReporte(fila);
    const marcaManualExacta = colMarcaSubtotal >= 1 && spec.subtotalesFila === filaNum;

    // Nómina: el ERP repite el encabezado al cambiar de página (o el auditor pegó dos reportes
    // uno debajo del otro). Se reconoce por contenido y no entra como dato.
    if (nomina && r !== spec.filaEncabezado - 1 && esFilaDeEncabezado(fila)) continue;

    // 1) Leer cada columna mapeada según su tipo.
    const datos: Record<string, ValorCelda> = {};
    let divisaFila: { moneda: string; valor: number } | null = null;
    for (const rc of descriptor.columnas) {
      const col = spec.columnas[rc.nombre] ?? 0;
      if (col < 1) { datos[rc.nombre] = null; continue; }
      const raw = celda(fila, col);
      if (!esNumerica.get(rc.nombre)) {
        // Las fechas en ISO (también las que llegan como serial de Excel sin estilo): el
        // período de la fila (Nómina) y las validaciones contra la fecha de corte (Cartera, CxP)
        // las comparan como texto.
        datos[rc.nombre] = rc.tipo === "fecha" && (nomina?.normalizarFechas || conDetalleTercero) ? parsearFechaCelda(raw) ?? aTexto(raw) : aTexto(raw);
        continue;
      }
      // Importe en moneda extranjera escrito como texto («USD (54,323.40)», SAP): con la TRM de
      // cierre se convierte a pesos y la divisa queda como constancia; sin ella no se lee como
      // pesos, pero se avisa para que no desaparezca en silencio.
      if (conDetalleTercero && rc.tipo === "moneda" && typeof raw === "string" && MONTO_EN_DIVISA.test(raw.trim())) {
        const enDivisa = montoConDivisa(raw);
        if (enDivisa && trmCierre) {
          const divisa = conSigno(enDivisa.valor) ?? 0;
          datos[rc.nombre] = aPesos(divisa, trmCierre);
          if (rc.nombre === descriptor.valor || !divisaFila) divisaFila = { moneda: enDivisa.moneda, valor: divisa };
          continue;
        }
        datos[rc.nombre] = null;
        excepciones.push({ filaNum, mensaje: "Importe en moneda extranjera sin convertir en «" + rc.etiqueta + "»: " + raw.trim() + ". Indica la TRM de cierre para convertirlo a pesos." });
        continue;
      }
      datos[rc.nombre] = rc.tipo === "moneda" ? conSigno(aNumero(raw)) : aNumero(raw);
    }

    // 1.2) SIESA · marcas de relleno en los roles de identidad («*» en la columna del NIT de
    //      los documentos de Mineralin): no identifican a nadie, y dejarlas impediría que el
    //      documento heredara el tercero de su cabecera.
    if (formatoSiesa) {
      for (const rol of rolesIdentidad) if (esIdentificadorVacio(datos[rol])) datos[rol] = null;
    }

    // 1.3) SIESA · la celda del identificador deja UN solo rol —cuenta, tercero o documento—
    //      antes del arrastre y de la cabecera, que así trabajan igual que con columnas
    //      separadas. «Total» se deja tal cual: lo resuelve la detección de totales.
    let esSeccionCuenta = false;
    const identificador = formatoSiesa ? aTexto(celda(fila, colIdentidad)) : null;
    if (formatoSiesa && !(identificador != null && esTotal(identificador))) {
      const negritaIdentificador = hoja.negrita?.[r]?.[colIdentidad - 1] === true;
      let rolCelda = rolDeCeldaCompartida({
        valor: identificador,
        negrita: negritaIdentificador,
        marcaSeccion: celda(fila, colMarcaSeccion),
        hayDocumentos,
      });
      // Con documentos, la negrita sin «#Ter.» marca al tercero aunque su identificador no sea
      // solo dígitos (pasaportes, códigos del exterior): perderlo haría que sus documentos
      // heredaran el tercero anterior.
      if (rolCelda === "otro" && hayDocumentos && negritaIdentificador) rolCelda = "tercero";

      if (rolCelda === "cuenta") {
        // Encabezado de sección: fija la cuenta de lo que sigue y no es de ningún tercero.
        esSeccionCuenta = true;
        ultimaCuentaSeccion = identificador;
        ultimoNombreTercero = null;
        ultimoPorRol.delete(rolIdentificador);
        ultimoPorRol.delete(rolNombre);
        datos[rolIdentificador] = null;
        if (colDocumento >= 1) datos.documento = null;
        datos[descriptor.clasificador] = identificador;
      } else {
        // Con documentos, la columna solo identifica al tercero en su cabecera; en el resumen
        // (sin documentos) el tercero va en letra normal y cualquier texto puede serlo.
        if (rolCelda === "vacia" || (hayDocumentos && rolCelda !== "tercero")) datos[rolIdentificador] = null;
        if (columnaCompartida && rolCelda !== "documento") datos.documento = null;

        // Nombre del tercero cuando su rol no tiene columna: SIESA lo imprime junto al
        // identificador, en la columna que el encabezado rotula «Fecha» (en las filas de
        // documento ahí va la fecha). Lo toma la fila del tercero y lo heredan sus documentos.
        if (rolNombre && (spec.columnas[rolNombre] ?? 0) < 1) {
          if (rolCelda === "tercero") {
            const hallado = nombreJuntoAlIdentificador(fila);
            ultimoNombreTercero = hallado?.nombre ?? null;
            if (hallado) {
              datos[rolNombre] = hallado.nombre;
              // La columna prestada no trae su propio dato en la fila del tercero.
              for (const rc of descriptor.columnas) {
                if (rc.nombre !== rolNombre && (spec.columnas[rc.nombre] ?? 0) === hallado.columna) datos[rc.nombre] = null;
              }
            }
          } else if (hayDocumentos && aTexto(datos.documento) != null && ultimoNombreTercero != null) {
            datos[rolNombre] = ultimoNombreTercero;
          }
        }

        // La cuenta de la sección vigente clasifica a sus terceros y documentos: cada fila sabe
        // a qué cuenta pertenece y los bloques de control no cruzan de una cuenta a otra.
        const conIdentidad = aTexto(datos[rolIdentificador]) != null || aTexto(datos.documento) != null;
        if (conIdentidad && ultimaCuentaSeccion != null && aTexto(datos[descriptor.clasificador]) == null) {
          datos[descriptor.clasificador] = ultimaCuentaSeccion;
        }
      }
    }

    // 1.4) Fila rotulada de proveedor (SEVEN): solo ella identifica al proveedor. En las demás
    //      la columna del NIT trae otro dato (el consecutivo del documento, o el nombre en
    //      «TOTAL PROVEEDOR»), así que se vacía y el documento hereda el de su cabecera.
    let esFilaRotuladaTercero = false;
    if (filaTercero) {
      const rotuloFila = aTexto(celda(fila, filaTercero.columnaRotulo));
      if (rotuloFila != null && norm(rotuloFila) === norm(filaTercero.texto)) {
        esFilaRotuladaTercero = true;
        const nombreFila = filaTercero.columnaNombre ? aTexto(celda(fila, filaTercero.columnaNombre)) : null;
        datos[rolIdentificador] = aTexto(celda(fila, filaTercero.columnaClave));
        if (rolNombre) datos[rolNombre] = nombreFila;
        ultimoNombreTercero = nombreFila;
        for (const rol of descriptor.rolesDetalle ?? []) datos[rol] = null;
      } else {
        datos[rolIdentificador] = null;
        if (rolNombre && (spec.columnas[rolNombre] ?? 0) < 1 && aTexto(datos.documento) != null) datos[rolNombre] = ultimoNombreTercero;
      }
    }

    // 1.5) Modo "seccion": los ENCABEZADOS de grupo fijan el clasificador de los ítems que
    //      siguen y NO se cargan como ítems. Un renglón «Total …» NO fija sección: sigue
    //      adelante como candidato a subtotal (se marca `total` abajo y sirve de control).
    const rotuloClasificadorCrudo = clasCol >= 1 ? aTexto(celda(fila, clasCol)) : null;
    if (modo === "seccion" && !marcaManualExacta && esRenglonSeccion(datos, hoja.negrita?.[r])) {
      const etiqueta = aTexto(datos[descriptor.clasificador]);
      if (!(etiqueta && esTotal(etiqueta))) {
        if (etiqueta) seccionActual = etiqueta;
        filasExcluidas++;
        continue;
      }
    }

    // 1.6) Columnas de FAMILIA: `{ rótulo del ERP → importe }` por familia, más la Σ de los
    //      baldes que suman. Un balde de clase `excluir` («Deuda dudosa» de SAP) se guarda
    //      —el auditor tiene que verlo— pero no entra en la suma: ya está contado en los otros.
    let familias: Record<string, Record<string, number>> | undefined;
    let sumaFamilia: number | undefined;
    if (hayFamilias) {
      familias = {};
      let suma = 0;
      for (const f of familiasSpec) {
        const baldes: Record<string, number> = {};
        for (const c of f.columnas) {
          const v = conSigno(aNumero(celda(fila, c.columna)));
          baldes[c.etiqueta] = v == null ? 0 : v;
          if (v != null && c.clase !== "excluir") suma += v;
        }
        familias[f.nombre] = baldes;
      }
      sumaFamilia = redondear(suma);
    }

    // 2) Fila vacía (nada útil en ninguna columna) → se salta. Los baldes cuentan: en
    //    SIESA Zarzal el importe del documento vive SOLO en su balde y la columna «Total»
    //    viene en cero, así que sin esto se perderían miles de documentos.
    const vaciaEnRoles = descriptor.columnas.every((rc) => {
      const v = datos[rc.nombre];
      return v == null || v === "" || v === 0;
    });
    const vaciaEnFamilias = !familias
      || Object.values(familias).every((baldes) => Object.values(baldes).every((v) => v === 0));
    if (vaciaEnRoles && vaciaEnFamilias) continue;

    // 3) Derivaciones: producto (a×b) o cociente (a÷b). Solo rellenan la columna
    //    destino cuando falta; el producto además avisa si el archivo la trae y no cuadra.
    for (const [destino, regla] of Object.entries(descriptor.derivar ?? {})) {
      const actual = aNumero(datos[destino]);
      const yaEsta = actual != null && actual !== 0;
      if ("producto" in regla) {
        const a = aNumero(datos[regla.producto[0]]);
        const b = aNumero(datos[regla.producto[1]]);
        if (a == null || b == null) continue;
        const producto = redondear(a * b);
        if (!yaEsta) datos[destino] = producto;
        else if (Math.abs(actual - producto) > 1) {
          excepciones.push({ filaNum, mensaje: `${destino} (${actual}) ≠ ${regla.producto[0]}×${regla.producto[1]} (${producto})` });
        }
      } else {
        // cociente: valorUnitario = valorTotal ÷ cantidad (respeta el existente, evita ÷0).
        if (yaEsta) continue;
        const num = aNumero(datos[regla.cociente[0]]);
        const den = aNumero(datos[regla.cociente[1]]);
        if (num == null || den == null || den === 0) continue;
        datos[destino] = redondear(num / den);
      }
    }

    // 4) Promover clasificador + valor (los campos que consolida el descriptor), según el modo.
    // Si la columna llave viene vacía y el descriptor declara una alterna, se clasifica por
    // ella (Nómina: sin código de concepto, clasifica por el texto del concepto).
    let clasificador = aTexto(datos[descriptor.clasificador]);
    if (clasificador == null && descriptor.clasificadorAlterno) {
      clasificador = aTexto(datos[descriptor.clasificadorAlterno]);
    }
    if (modo === "global") {
      // Inventario GLOBAL: todo el archivo cae en un único clasificador.
      clasificador = CLASIFICADOR_GLOBAL;
      datos[descriptor.clasificador] = CLASIFICADOR_GLOBAL;
    } else if (modo === "seccion") {
      // El tipo del ítem es la sección vigente (la columna del clasificador trae otro dato,
      // p. ej. el código, que se conserva en su rol propio —referencia—).
      clasificador = seccionActual;
      datos[descriptor.clasificador] = seccionActual;
    } else if (modo === "arrastrar") {
      if (clasificador != null) ultimoClasificador = clasificador;
      else { clasificador = ultimoClasificador; datos[descriptor.clasificador] = clasificador; }
    }

    // 4.5) Forward-fill de los roles arrastrables: la fila que los trae los fija; las de
    //      abajo que vengan en blanco los heredan. Nunca se siembra desde una fila
    //      rotulada «Total …»: sería sembrar con el subtotal, no con el dato.
    // Los valores PROPIOS de la fila, antes de heredar nada: son los que distinguen una
    // cabecera de tercero (identificador sí, documento no) de uno de sus documentos.
    const claveEnLaFila = rolClave ? aTexto(datos[rolClave]) : null;
    const documentoEnLaFila = aTexto(datos.documento);
    // Identidad PROPIA: la que la fila trae antes de heredar nada. Un pie de página del ERP
    // que quede debajo del último tercero heredaría su NIT y pasaría por cartera; lo que lo
    // delata es que no trae identidad suya.
    const tieneIdentidadPropia = rolesIdentidad.some((rol) => aTexto(datos[rol]) != null);
    // Fila sin identidad propia que dice «Total» en una columna sin rol (Zarzal lo imprime en
    // la tercera, lejos del identificador): es el total del archivo, no un pie sin dueño. Solo
    // se busca en filas sin identidad (en las demás, «TOTAL ENERGIES» es un cliente) y solo en
    // SIESA: en SIIGO y World Office esas filas son subtotales por tercero y, como candidatas,
    // llenaban el panel «Validación del archivo» de descuadres falsos.
    const rotuloTotalSuelto = formatoSiesa && exigeIdentidad && !tieneIdentidadPropia && rotuloClasificadorCrudo == null && claveEnLaFila == null
      ? (fila.map((c) => aTexto(c)).find((t): t is string => t != null && esTotal(t)) ?? null)
      : null;
    const rotuloDeFila = rotuloClasificadorCrudo ?? claveEnLaFila ?? rotuloTotalSuelto;
    const esFilaDeTotal = rotuloDeFila != null && esTotal(rotuloDeFila);
    const esCabeceraTercero = modoCabecera && !esFilaDeTotal && !esPieErp && claveEnLaFila != null && documentoEnLaFila == null;
    for (const rol of rolesArrastrados) {
      const propio = aTexto(datos[rol]);
      if (propio != null) {
        if (!esFilaDeTotal && !esPieErp) ultimoPorRol.set(rol, propio);
      } else {
        const heredado = ultimoPorRol.get(rol);
        if (heredado != null) datos[rol] = heredado;
      }
    }

    // 4.6) Valor de la fila. Con familias declaradas, la Σ de los baldes MANDA sobre la
    //      columna de total (regla acordada con la firma: si difieren, la verdad es la
    //      suma de las edades). La columna se conserva para poder alertar la diferencia.
    const valorColumna = aNumero(datos[descriptor.valor]);
    let valor = redondear(valorColumna ?? 0);
    let valorReportado: number | null | undefined;
    let origenValor: FilaModulo["origenValor"];
    if (hayFamilias && descriptor.valorDerivado) {
      const desdeFamilia = redondear(sumaFamilia ?? 0);
      const hayColumna = valorColumna != null && redondear(valorColumna) !== 0;
      const hayFamilia = desdeFamilia !== 0;
      if (descriptor.valorDerivado.prevalece === "familia" && hayFamilia) {
        valor = desdeFamilia;
        origenValor = hayColumna ? "columna_y_familia" : "familia";
      } else if (!hayColumna && hayFamilia) {
        valor = desdeFamilia;
        origenValor = "familia";
      } else {
        origenValor = "columna";
      }
      valorReportado = valorColumna;
    }

    // 4.7) Hoja en DIVISA: todo se leyó en la divisa y se convierte a pesos con la TRM de cierre
    //      —baldes, su suma, el valor y el total reportado—, dejando la divisa como constancia.
    let saldoDivisa: number | undefined = divisaFila?.valor;
    let monedaFila: string | undefined = divisaFila?.moneda;
    if (monedaArchivo && trmCierre) {
      saldoDivisa = valor;
      monedaFila = monedaArchivo;
      if (familias) {
        let suma = 0;
        for (const f of familiasSpec) {
          const baldes = familias[f.nombre];
          for (const c of f.columnas) {
            baldes[c.etiqueta] = aPesos(baldes[c.etiqueta] ?? 0, trmCierre);
            if (c.clase !== "excluir") suma += baldes[c.etiqueta];
          }
        }
        sumaFamilia = redondear(suma);
      }
      valor = origenValor === "familia" || origenValor === "columna_y_familia" ? (sumaFamilia ?? 0) : aPesos(valor, trmCierre);
      if (valorReportado != null) valorReportado = aPesos(valorReportado, trmCierre);
    }

    // 4.8) NÓMINA: valor con signo por naturaleza, cédula normalizada, período de la fila y
    //      exclusiones propias (neto de Novasoft, pie repetido, sin concepto, fuera del rango
    //      del cargue). Las excluidas quedan como agrupadora, visibles y rescatables.
    let exclusionNomina: string | null = null;
    if (nomina) {
      // NOMINAI imprime «001 - BASICO» y «8032318 - GALLEGO GUZMAN»: código y nombre juntos.
      const conceptoCrudo = aTexto(datos.concepto);
      if (conceptoCrudo && aTexto(datos.codigo) == null && !rolesMapeados.has("codigo")) {
        const m = /^([A-Za-z]?\d{1,6})\s*-\s*(.+)$/.exec(conceptoCrudo);
        if (m) { datos.codigo = m[1]; datos.concepto = m[2].trim(); clasificador = m[1]; }
      }
      // El código de concepto se guarda CANÓNICO (« 01 », «001» y «1» son el mismo concepto):
      // así llavea igual en la memoria de homologación, en el catálogo del ERP y en el cruce.
      const codigoCrudo = aTexto(datos.codigo);
      if (codigoCrudo != null) {
        const canonico = codigoConceptoCanonico(codigoCrudo);
        if (canonico) { datos.codigo = canonico; if (clasificador === codigoCrudo) clasificador = canonico; }
      }
      const cedula = normalizarCedula(datos.cedula ?? datos.empleado);
      if (cedula) datos.cedula = cedula;
      const empleadoCrudo = aTexto(datos.empleado);
      if (empleadoCrudo) datos.empleado = nombreSinCedula(empleadoCrudo.replace(/^\s*\d{2,12}\s*-?\s*/, "")) ?? empleadoCrudo;
      if (nomina.valorPorNaturaleza) {
        const ev = evaluarFilaNomina(datos, rolesMapeados, rolesTextoMapeados);
        valor = ev.valor;
        if (ev.naturaleza) datos.naturaleza = ev.naturaleza;
        if (ev.excluir) exclusionNomina = ev.excluir;
      }
      if (nomina.periodoPorFila) {
        const rango = rangoDeFila(
          { fecha: datos.fecha, fechaCorte: datos.fechaCorte, periodo: datos.periodo, mes: datos.mes, anio: datos.anio, periodoDesde: datos.periodoDesde, periodoHasta: datos.periodoHasta },
          anioCargue,
        );
        if (rango) {
          datos.periodoDesde = rango.desde;
          datos.periodoHasta = rango.hasta;
          if (rangoCargue && !rangoDentroDelCargue(rango, rangoCargue)) exclusionNomina ??= "fuera_de_periodo";
        } else {
          datos.periodoDesde = rangoCargue?.desde ?? null;
          datos.periodoHasta = rangoCargue?.hasta ?? null;
        }
      }
    }
    // Un rótulo «Total …» en cualquier columna de texto de nómina es un SUBTOTAL del archivo:
    // «TOTALES» por empleado (Novasoft), «Total <concepto>» y «Total <empleado>» (Santiago
    // Corazón, en la columna del nombre), «Total general» (Ofimática, en la del grupo). No
    // imputa y se conserva con su cifra como control; sin esto el total por empleado, que
    // ninguna aritmética por concepto reconoce, entraba como movimiento y duplicaba el archivo.
    const rotuloTotalNomina = nomina
      ? rolesTextoMapeados.map((rol) => aTexto(datos[rol])).find((t): t is string => t != null && esTotal(t)) ?? null
      : null;
    if (rotuloTotalNomina != null) {
      filasExcluidas++;
      filas.push({ filaNum, clasificador, valor, datos, tipoFila: "total", motivo: "subtotal:rotulo" });
      crudo.push({ negrita: hoja.negrita?.[r]?.some(Boolean) === true, rotuloClasificador: rotuloClasificadorCrudo ?? rotuloTotalNomina, marcaManual: false, marcaManualExacta: false });
      continue;
    }
    if (exclusionNomina) {
      filasExcluidas++;
      filas.push({ filaNum, clasificador, valor: 0, datos, tipoFila: "agrupadora", motivo: exclusionNomina });
      crudo.push({ negrita: hoja.negrita?.[r]?.some(Boolean) === true, rotuloClasificador: rotuloClasificadorCrudo, marcaManual: false, marcaManualExacta: false });
      continue;
    }

    // 5) Negrita = subtotal del ERP → no cuenta en el valor. Según el descriptor, se
    //    marca `agrupadora` (rígido) o entra como movimiento OMITIDO (rescatable en el
    //    borrador). En ambos casos queda fuera del total.
    // La coordenada validada es autoridad incluso si el ERP pinta el total en negrita.
    // 5.a) CABECERA DE TERCERO (reporte jerárquico): trae el identificador y el saldo del
    //      bloque, y sus documentos van debajo. NO imputa —sumaría dos veces lo mismo— pero
    //      su saldo se conserva como DECLARADO para contrastarlo contra la Σ de sus
    //      documentos: en SAP y SIESA ese control cuadra al centavo y certifica la lectura.
    if (esCabeceraTercero) {
      filasExcluidas++;
      filas.push({
        filaNum,
        clasificador,
        valor: 0,
        datos,
        tipoFila: "agrupadora",
        motivo: "subtotal_tercero:cabecera",
        // La fila rotulada de SEVEN solo nombra al proveedor: no declara su saldo.
        ...(esFilaRotuladaTercero ? {} : { saldoDeclarado: valor }),
        ...(familias ? { familias, sumaFamilia } : {}),
      });
      crudo.push({
        negrita: hoja.negrita?.[r]?.some(Boolean) === true,
        rotuloClasificador: rotuloClasificadorCrudo,
        marcaManual: false,
        marcaManualExacta: false,
      });
      continue;
    }

    // 5.b) Fila SIN IDENTIDAD: trae importe pero no dice de quién ni de qué documento es.
    //      Son los pies del ERP y las filas de porcentaje. Quedan como agrupadora (fuera
    //      del total) pero visibles en el borrador, para que se puedan rescatar si la
    //      detección se equivoca.
    // Una SECCIÓN de cuenta de SIESA entra por la misma puerta: tampoco es de ningún tercero.
    if (esSeccionCuenta || esPieErp || (exigeIdentidad && !esFilaDeTotal && !tieneIdentidadPropia)) {
      filasExcluidas++;
      filas.push({
        filaNum,
        clasificador,
        valor: 0,
        datos,
        tipoFila: "agrupadora",
        motivo: esSeccionCuenta ? "seccion_cuenta" : "sin_identificador",
        ...(familias ? { familias, sumaFamilia } : {}),
      });
      crudo.push({
        negrita: hoja.negrita?.[r]?.some(Boolean) === true,
        rotuloClasificador: rotuloClasificadorCrudo,
        marcaManual: false,
        marcaManualExacta: false,
      });
      continue;
    }

    const enNegrita = !marcaManualExacta && esAgrupadoraPorNegrita(hoja.negrita?.[r], spec, descriptor);
    const omitidaPorNegrita = enNegrita && descriptor.negritaComoOmitida === true;
    // Con `usarNegritaComoEstructura` la negrita NO decide aquí. La fila entra como
    // CANDIDATA —movimiento con la señal de negrita— para que la detección de subtotales
    // pueda reconocer el gran total que el ERP imprime en negrita al pie. Si no resulta
    // subtotal, recupera su clasificación de siempre justo después de detectar.
    const diferir = (enNegrita && !omitidaPorNegrita && descriptor.usarNegritaComoEstructura === true)
      // El «Total» suelto también espera a la detección; si no resulta subtotal, vuelve a ser
      // lo que era —una fila sin dueño— y nunca imputa.
      || rotuloTotalSuelto != null;
    const tipoFila: TipoFilaModulo = enNegrita && !omitidaPorNegrita && !diferir ? "agrupadora" : "movimiento";
    // La diferida cuenta como leída por ahora: la detección de subtotales y la degradación
    // posterior hacen el traspaso a excluidas con la misma contabilidad que ya usan.
    if (enNegrita && !diferir) filasExcluidas++;
    else filasLeidas++;
    if (diferir) negritaDiferida.add(filas.length);
    if (rotuloTotalSuelto != null) motivoAlDegradar.set(filas.length, "sin_identificador");
    // Saldo del proveedor impreso en la 1.ª fila de su bloque (SIIGO): control, nunca imputa.
    const saldoBloqueLeido = aNumero(datos.saldoTercero);
    const saldoDelBloque = saldoBloqueLeido != null && monedaArchivo && trmCierre ? aPesos(saldoBloqueLeido, trmCierre) : saldoBloqueLeido;

    filas.push({
      filaNum,
      clasificador,
      valor,
      datos,
      tipoFila,
      ...(omitidaPorNegrita ? { omitida: true } : {}),
      ...(familias ? { familias, sumaFamilia } : {}),
      ...(valorReportado !== undefined ? { valorReportado } : {}),
      ...(origenValor ? { origenValor } : {}),
      ...(saldoDivisa != null && monedaFila && trmCierre ? { saldoDivisa, moneda: monedaFila, trm: trmCierre } : {}),
      ...(saldoDelBloque != null && saldoDelBloque !== 0 ? { saldoDeclarado: redondear(saldoDelBloque) } : {}),
    });
    crudo.push({
      negrita: enNegrita,
      rotuloClasificador: rotuloClasificadorCrudo ?? rotuloTotalSuelto,
      marcaManual: marcaManualExacta || (
        spec.subtotalesFila == null
        && colMarcaSubtotal >= 1
        && coincideMarcaSubtotal(celda(fila, colMarcaSubtotal), spec.subtotalesTexto)
      ),
      marcaManualExacta,
    });
  }

  // 6) SUBTOTALES por grupo y gran total (`spec.subtotales`: auto | rotulo | nunca | manual). Las filas
  //    detectadas pasan a `total`: no imputan, no se pueden «omitir» (ya están fuera) y el
  //    borrador las usa como CONTROL contra la Σ de los movimientos de su bloque. Una fila
  //    en negrita que además es subtotal queda `total` (no `omitida`) para entrar al control.
  const detecciones = detectarSubtotales(
    filas.map((f, i) => ({
      ...f,
      negrita: crudo[i]?.negrita,
      rotuloClasificador: crudo[i]?.rotuloClasificador ?? null,
      marcaManual: crudo[i]?.marcaManual === true,
      marcaManualExacta: crudo[i]?.marcaManualExacta === true,
    })),
    descriptor,
    { modo: spec.subtotales ?? "auto", columnasDetalle: columnasDetalle(descriptor, spec) },
  );
  for (const d of detecciones) {
    const f = filas[d.indice];
    if (f.tipoFila !== "movimiento") continue;
    if (f.omitida === true) filasExcluidas--; else filasLeidas--;
    filasExcluidas++;
    const grupo = d.clase === "gran_total" ? d.grupo : (d.grupo ?? f.clasificador);
    // Un total del archivo no declara el saldo de ningún proveedor: si trajera el del bloque
    // (el «Total <proveedor>» de SIIGO), se contaría dos veces en el control.
    const { omitida: _omitida, saldoDeclarado: _saldoDeclarado, ...resto } = f;
    void _omitida;
    void _saldoDeclarado;
    // El resto del bloque de control al pie (cifras de referencia del cliente y sus
    // diferencias) sale del consolidado como AGRUPADORA: no imputa y tampoco entra al
    // control, porque no es un subtotal del detalle y compararlo daría descuadres falsos.
    // Conserva su rótulo original para que el borrador siga mostrando de qué cifra se trata.
    if (d.clase === "cola_control") {
      filas[d.indice] = { ...resto, tipoFila: "agrupadora", motivo: motivoDe(d) };
      continue;
    }
    filas[d.indice] = {
      ...resto,
      clasificador: grupo,
      datos: modo === "global" ? f.datos : { ...f.datos, [descriptor.clasificador]: grupo },
      tipoFila: "total",
      motivo: motivoDe(d),
    };
  }

  // TOTAL POR CLIENTE («Total <cliente>» debajo de sus documentos): el subtotal de un bloque que
  // es de UN solo tercero declara su saldo, igual que una cabecera, y entra al control «Σ de los
  // documentos contra el total del cliente». Sigue siendo total: no imputa.
  if (conDetalleTercero && nivelCarteraDeSpec(spec) === "documento") {
    for (const [indice, identidad] of totalesPorTercero(filas, detecciones)) {
      const f = filas[indice];
      if (f.tipoFila !== "total") continue;
      // La identidad sale de `datos` de otra fila del mismo archivo: ya tiene el tipo de una celda.
      const completar = Object.fromEntries(
        Object.entries(identidad).filter(([, v]) => v != null && String(v).trim() !== ""),
      ) as typeof f.datos;
      filas[indice] = { ...f, datos: { ...f.datos, ...completar }, saldoDeclarado: redondear(f.valor) };
    }
  }

  // NEGRITA DIFERIDA: la fila en negrita que la detección NO reconoció como subtotal
  // recupera su clasificación de siempre —agrupadora, fuera del consolidado—. Diferir solo
  // sirvió para que el gran total en negrita pudiera entrar al control del archivo.
  for (const i of negritaDiferida) {
    const f = filas[i];
    if (!f || f.tipoFila !== "movimiento") continue;
    // Una fila con su propio documento es un documento aunque venga en negrita (PLASMAR marca
    // así tres facturas): la negrita estructura cabeceras y totales, no el detalle.
    if (conDetalleTercero && (descriptor.rolesDetalle ?? []).some((rol) => aTexto(f.datos[rol] ?? null) != null)) continue;
    filasLeidas--;
    filasExcluidas++;
    const motivo = motivoAlDegradar.get(i);
    const { saldoDeclarado: _saldoDeclarado, ...sinDeclarado } = f;
    void _saldoDeclarado;
    filas[i] = { ...sinDeclarado, tipoFila: "agrupadora", ...(motivo ? { motivo } : {}) };
  }

  // PARTE B — RECONCILIACIÓN (red de seguridad): ¿queda alguna fila con valor real por
  // ENCIMA del inicio efectivo que la Parte A no arrastró (p. ej. separada del bloque por
  // un blanco/encabezado intermedio)? Con la Parte A el caso típico ya no pierde nada, pero
  // esto garantiza que cualquier exclusión futura sea VISIBLE y no silenciosa.
  let filasOmitidasArriba = 0;
  const omitidasMuestra: FilaOmitidaModulo[] = [];
  if (valCol >= 1) {
    let porEncimaDelEncabezado = false;
    for (let r = inicio - 1; r >= 0; r--) {
      const filaR = hoja.filas[r] ?? [];
      if (esFilaDeEncabezado(filaR)) { porEncimaDelEncabezado = true; continue; }
      if (porEncimaDelEncabezado) continue; // banner y metadatos del ERP: no son datos perdidos
      const val = aNumero(celda(filaR, valCol));
      if (val == null) continue;
      filasOmitidasArriba++;
      if (omitidasMuestra.length < 8) omitidasMuestra.push({ filaNum: filaFisicaDe(r), valor: val });
    }
  }

  return { filas, filasLeidas, filasExcluidas, excepciones, filasOmitidasArriba, omitidasMuestra };
}
