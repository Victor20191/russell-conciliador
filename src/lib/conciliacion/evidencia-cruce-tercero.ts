// EVIDENCIA del cruce por tercero que se congela al cerrar la conciliación en firme — pura.
//
// El cierre bloquea cuentas del balance, pero lo que el auditor concilió en Cartera y CxP fue
// un renglón por tercero. Sin una constancia de ese cruce, un cierre no permitiría saber
// después contra qué diferencias se firmó. Se guarda lo mínimo que lo identifica: totales,
// conteos por estado, cuántas diferencias exigían marca y una huella SHA-256 de
// «clave=diferencia» por tercero (misma huella = mismo cruce, centavo a centavo).
import { createHash } from "node:crypto";
import type { EstadoCruceTercero, ResumenCruceTerceroCartera } from "@/lib/modulos/cartera/cruce-tercero-cartera";
import type { ResumenMarcas } from "@/lib/modulos/marcas-cruce";

export type EvidenciaCruceTercero = {
  version: 1;
  terceros: number;
  totales: { contable: number; modulo: number; diferencia: number };
  conteo: Record<EstadoCruceTercero, number>;
  marcas: { conDiferencia: number; marcadas: number; bajoUmbral: number };
  huella: string;
};

export function evidenciaCruceTercero(
  resumen: Pick<ResumenCruceTerceroCartera, "filas" | "totales" | "conteo">,
  marcas: ResumenMarcas | null,
): EvidenciaCruceTercero {
  const lineas = resumen.filas.map((f) => `${f.clave}=${f.diferencia.toFixed(2)}`).sort();
  return {
    version: 1,
    terceros: resumen.filas.length,
    totales: { contable: resumen.totales.contable, modulo: resumen.totales.modulo, diferencia: resumen.totales.diferencia },
    conteo: { ...resumen.conteo },
    marcas: {
      conDiferencia: marcas?.conDiferencia ?? 0,
      marcadas: marcas?.marcadas ?? 0,
      bajoUmbral: marcas?.bajoUmbral ?? 0,
    },
    huella: createHash("sha256").update(lineas.join("\n")).digest("hex"),
  };
}
