import { Icon } from "@/components/icons";
import { fmtContable } from "@/lib/format";
import type { ResumenMarcas } from "@/lib/modulos/marcas-cruce";

/**
 * Señales de diferencia comunes a todos los cruces —los de los módulos de conciliación y los de
 * Impuestos · DIAN—: el mismo «!» en cada renglón con diferencia y el mismo aviso arriba con las
 * diferencias que exigen marca para cerrar. El renglón no repite «Exige marca»: lo dice el aviso.
 */

/**
 * El «!» de un renglón con diferencia. Magenta —el color de error de la marca; la paleta no tiene
 * rojo— si exige marca para cerrar; gris si queda por debajo del umbral y la marca es opcional.
 */
export function IconoDiferencia({ exigeMarca = true, titulo }: { exigeMarca?: boolean; titulo?: string }) {
  const texto = titulo ?? (exigeMarca ? "Diferencia: exige marca para cerrar" : "Diferencia por debajo del umbral: la marca es opcional");
  return (
    <span role="img" title={texto} aria-label={texto} className={`inline-flex shrink-0 align-middle ${exigeMarca ? "text-err-700" : "text-ink-400"}`}>
      <Icon name="alerta" size={20} />
    </span>
  );
}

/**
 * El lugar del «!» a la DERECHA de la cifra, del mismo ancho con o sin ícono: así las cifras de la
 * columna, su título y su total quedan alineados, y los «!» también. Sin `visible` es solo el espacio
 * (para el título y el total de la columna).
 */
export function RanuraDiferencia({ visible = false, exigeMarca = true, titulo }: { visible?: boolean; exigeMarca?: boolean; titulo?: string }) {
  return (
    <span className="inline-flex w-5 shrink-0 justify-center" aria-hidden={visible ? undefined : true}>
      {visible && <IconoDiferencia exigeMarca={exigeMarca} titulo={titulo} />}
    </span>
  );
}

/** Lo que cuenta el aviso de marcas de un cruce. */
export type ResumenAvisoMarcas = {
  /** Diferencias que exigen marca para cerrar. */
  exigen: number;
  /** De ellas, las que tienen marca (también las que no alcanzan a explicarla). */
  marcadas: number;
  /** De ellas, las que no tienen ninguna marca, y la suma de sus diferencias. */
  sinMarcar: number;
  montoSinMarcar?: number | null;
  /** Con marcas que no alcanzan a explicar la diferencia (falta monto o la diferencia cambió). */
  porExplicar?: number;
  montoPorExplicar?: number | null;
  /** Diferencias por debajo del umbral: la marca es opcional y no impiden cerrar. */
  opcionales?: number;
};

/** El resumen de marcas de los cruces de los módulos, en los términos del aviso. */
export function avisoDesdeResumenMarcas(r: ResumenMarcas): ResumenAvisoMarcas {
  return {
    exigen: r.conDiferencia,
    marcadas: r.marcadas,
    sinMarcar: r.pendientes,
    montoSinMarcar: r.montoPendiente,
    porExplicar: r.desactualizadas,
    montoPorExplicar: r.montoPorExplicar ?? null,
    opcionales: r.bajoUmbral ?? 0,
  };
}

/**
 * Renglones con la marca que exigen (o la tienen), en los términos del aviso: sirve para los cruces
 * de impuestos, cuyas filas traen `requiereMarca` y su marca con `vigente`.
 */
export function avisoDesdeFilas<F extends { requiereMarca: boolean; diferencia: number; marca: { vigente: boolean } | null }>(
  filas: readonly F[],
  opcional: (f: F) => boolean = () => false,
): ResumenAvisoMarcas {
  const exigen = filas.filter((f) => f.requiereMarca);
  const sinMarcar = exigen.filter((f) => !f.marca);
  const porExplicar = exigen.filter((f) => f.marca && !f.marca.vigente);
  const suma = (lista: readonly F[]) => Math.round(lista.reduce((s, f) => s + f.diferencia, 0) * 100) / 100 + 0;
  return {
    exigen: exigen.length,
    // Como en los módulos, «con marca» cuenta también las desactualizadas: se nombran aparte.
    marcadas: exigen.filter((f) => f.marca).length,
    sinMarcar: sinMarcar.length,
    montoSinMarcar: suma(sinMarcar),
    porExplicar: porExplicar.length,
    montoPorExplicar: null,
    opcionales: filas.filter((f) => !f.requiereMarca && opcional(f)).length,
  };
}

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-CO")} ${n === 1 ? uno : varios}`;

/**
 * El aviso de marcas de un cruce, arriba de su tabla: cuántas diferencias exigen marca para cerrar,
 * cuántas tienen marca y lo que falta. Naranja mientras falte alguna; verde cuando no falta ninguna.
 * Con `siempre`, también se muestra cuando ninguna diferencia exige marca.
 */
export function AvisoMarcas({ resumen, desde = null, siempre = false }: { resumen: ResumenAvisoMarcas; desde?: number | null; siempre?: boolean }) {
  const { exigen, marcadas, sinMarcar } = resumen;
  const porExplicar = resumen.porExplicar ?? 0;
  const opcionales = resumen.opcionales ?? 0;
  if (!siempre && exigen === 0 && opcionales === 0) return null;
  const pendientes = sinMarcar + porExplicar;
  // Con umbral en cero toda diferencia exige marca: no hace falta nombrar el monto.
  const textoDesde = desde != null && desde > 0 ? ` desde ${fmtContable(desde)}` : "";
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2.5 text-[12.5px] ${
        pendientes > 0 ? "border-warn-500 bg-warn-100 text-warn-700" : "border-ok-500 bg-ok-100 text-ok-700"
      }`}
    >
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
        <Icon name={pendientes > 0 ? "alerta" : "check"} size={18} stroke={pendientes > 0 ? 1.6 : 2.4} />
        {exigen === 0
          ? "Ninguna diferencia exige marca"
          : pendientes > 0
            ? `${plural(exigen, "diferencia", "diferencias")}${textoDesde} ${exigen === 1 ? "exige" : "exigen"} marca para cerrar`
            : exigen === 1
              ? `La diferencia${textoDesde} que exige marca ya la tiene`
              : `Las ${exigen.toLocaleString("es-CO")} diferencias${textoDesde} que exigen marca ya la tienen`}
      </span>
      {pendientes > 0 && (
        <>
          <span>Con marca: <b>{marcadas.toLocaleString("es-CO")}</b></span>
          {sinMarcar > 0 && (
            <span>
              Sin marcar: <b>{sinMarcar.toLocaleString("es-CO")}</b>
              {resumen.montoSinMarcar != null && ` (${fmtContable(resumen.montoSinMarcar)})`}
            </span>
          )}
          {porExplicar > 0 && (
            <span title="Renglones cuyas marcas no alcanzan a explicar la diferencia: falta monto o la diferencia cambió después de marcar.">
              Con saldo por explicar: <b>{porExplicar.toLocaleString("es-CO")}</b>
              {resumen.montoPorExplicar ? ` (${fmtContable(resumen.montoPorExplicar)})` : ""}
            </span>
          )}
        </>
      )}
      {opcionales > 0 && (
        <span className="text-ink-500">
          {plural(opcionales, "diferencia", "diferencias")}
          {desde != null && desde > 0 ? ` por debajo de ${fmtContable(desde)}` : " dentro de la tolerancia"}: la marca es opcional y no impide cerrar.
        </span>
      )}
    </div>
  );
}
