// «¿Confirmas que esta columna excluye el IVA?» — puro, sin BD.
//
// Ingresos concilia contra la 41, que no lleva IVA. Cuando el valor se lee de una columna (o de
// una fórmula) cuyo rótulo dice «Total…», puede ser el total del documento con impuestos… o el
// neto, como «Total sin Descuento» de SAP Business One. El sistema no lo decide: pregunta UNA vez
// al mapear, y guarda la FIRMA de lo confirmado (los rótulos normalizados) en el spec, para que
// esa confirmación acompañe al formato —patrón o perfil del cliente— y nunca valide otro mapeo.
// Hasta el 28/Sep/2026 esta regla bloqueaba la columna; la confirmación real vivía en el
// borrador como «verificación obligatoria», que se retiró.
import type { DescriptorModulo } from "../descriptores";
import type { SpecModulo } from "./esquema";
import { encabezadoValorIngresoAmbiguo, norm } from "./sugerir";
import { tieneValorFormula } from "./valor-formula";

type Modulo = Pick<DescriptorModulo, "valor" | "confirmarValorSinImpuestos">;
type Mapeo = Pick<SpecModulo, "columnas" | "valorFormula" | "valorSinImpuestosConfirmado">;

const rotuloDe = (encabezado: readonly unknown[], columna: number): string =>
  String(encabezado[columna - 1] ?? "").replace(/\s+/g, " ").trim();

/** Rótulos de las columnas de las que sale el valor (una, o los términos de la fórmula). Vacío = sin mapear. */
export function rotulosDelValor(modulo: Modulo, spec: Mapeo, encabezado: readonly unknown[]): string[] {
  if (tieneValorFormula(spec)) return spec.valorFormula.map((t) => rotuloDe(encabezado, t.columna));
  const columna = spec.columnas[modulo.valor] ?? 0;
  return columna >= 1 ? [rotuloDe(encabezado, columna)] : [];
}

/**
 * Lo que habría que confirmar: el rótulo legible («Total sin Descuento», o «Total sin Descuento +
 * Total Fletes + …») y su firma normalizada. `rotulo` es `null` cuando no hay nada que confirmar:
 * el módulo no lo pide, el valor no está mapeado, o ningún rótulo lleva «total».
 */
export function firmaValor(modulo: Modulo, spec: Mapeo, encabezado: readonly unknown[]): { rotulo: string | null; firma: string } {
  if (!modulo.confirmarValorSinImpuestos) return { rotulo: null, firma: "" };
  const rotulos = rotulosDelValor(modulo, spec, encabezado);
  if (rotulos.length === 0 || !rotulos.some(encabezadoValorIngresoAmbiguo)) return { rotulo: null, firma: "" };
  if (!tieneValorFormula(spec)) return { rotulo: rotulos[0] || "(sin rótulo)", firma: norm(rotulos[0]) };
  // En una fórmula el SIGNO es parte de lo confirmado: «Total Documento − Total Impuestos» excluye
  // el IVA; con «+ Total Impuestos» lo sumaría. Cambiar un signo invalida la confirmación.
  const legible = spec.valorFormula
    .map((t, i) => {
      const nombre = rotulos[i] || "(sin rótulo)";
      if (i === 0) return t.signo === "-" ? `−${nombre}` : nombre;
      return `${t.signo === "-" ? "−" : "+"} ${nombre}`;
    })
    .join(" ");
  const firma = spec.valorFormula.map((t, i) => `${t.signo}${norm(rotulos[i])}`).join(" ");
  return { rotulo: legible, firma };
}

export function confirmacionValor(modulo: Modulo, spec: Mapeo, encabezado: readonly unknown[]): { rotulo: string | null; confirmado: boolean } {
  const { rotulo, firma } = firmaValor(modulo, spec, encabezado);
  return { rotulo, confirmado: rotulo != null && spec.valorSinImpuestosConfirmado === firma };
}

/** Lo que impide guardar o cargar: hay una columna de total como valor y nadie confirmó que excluya el IVA. */
export function impedimentoValorSinConfirmar(modulo: Modulo, spec: Mapeo, encabezado: readonly unknown[]): string | null {
  const { rotulo, confirmado } = confirmacionValor(modulo, spec, encabezado);
  if (rotulo == null || confirmado) return null;
  return `Confirma que «${rotulo}» excluye el IVA: es una columna de total.`;
}

export function confirmarValorSinImpuestos<S extends Mapeo>(spec: S, firma: string): S {
  return { ...spec, valorSinImpuestosConfirmado: firma };
}

export function retirarConfirmacionValor<S extends Mapeo>(spec: S): S {
  const { valorSinImpuestosConfirmado: _fuera, ...resto } = spec;
  void _fuera;
  return resto as S;
}

/**
 * El sugeridor no propone columnas «Total…» como valor (podrían llevar IVA). Cuando por eso el
 * valor quedó sin mapear, se explica: si no, parece que el archivo no trae valor.
 */
export function avisoValorSinProponer(modulo: Modulo, spec: Mapeo, encabezado: readonly unknown[]): string | null {
  if (!modulo.confirmarValorSinImpuestos) return null;
  if (rotulosDelValor(modulo, spec, encabezado).length > 0) return null;
  const candidatas = encabezado.map((c) => String(c ?? "").trim()).filter((c) => c && encabezadoValorIngresoAmbiguo(c));
  if (candidatas.length === 0) return null;
  return `No se propuso columna de valor: las candidatas se llaman «${candidatas.slice(0, 3).join("», «")}»${candidatas.length > 3 ? "…" : ""} y un total puede incluir IVA. Elige la del ingreso neto sin impuestos (o ármala como fórmula) y confirma.`;
}

/** Rastro para la auditoría del cargue y del patrón. */
export function detalleAuditoriaValor(rotulo: string | null, confirmado: boolean): string {
  if (rotulo == null) return "";
  return confirmado ? ` · valor de «${rotulo}» confirmado sin IVA` : ` · valor de «${rotulo}» sin confirmar`;
}
