// ALERTAS QUE EXIGEN COMENTARIO para cerrar la conciliación de un módulo (17/Oct/2026) — puro, sin BD.
//
// Algunas validaciones del archivo no bloquean la carga ni el cruce, pero alguien tiene que dejar
// constancia de que las miró: para cerrar la conciliación, cada TIPO de alerta presente en el cargue
// necesita un comentario (mínimo 10 caracteres). El comentario vive por (cliente, módulo, período,
// tipo) —como las marcas, sobrevive a las versiones nuevas— y congela cuántas referencias y qué
// valor tenía la alerta cuando se escribió: si una versión nueva o un archivo agregado los cambia,
// queda «por revisar» y vuelve a impedir el cierre hasta que alguien lo confirme o lo edite.
//
// Qué tipos exigen comentario lo declara cada descriptor (`alertasConComentario`); hoy, Inventarios.
import type { DescriptorModulo } from "./descriptores";
import { ALERTAS_COSTO, detectarAlertasCosto, detectarNegativos, type FilaValidable, type TipoAlertaCosto } from "./validaciones";

/** Tipos de alerta que pueden exigir comentario. */
export type TipoAlertaComentario = "valores_negativos" | TipoAlertaCosto;

const ETIQUETAS: Record<TipoAlertaComentario, string> = {
  valores_negativos: "Valores negativos",
  ...(Object.fromEntries(ALERTAS_COSTO.map((a) => [a.tipo, a.etiqueta])) as Record<TipoAlertaCosto, string>),
};

/** Orden de presentación. */
const ORDEN: TipoAlertaComentario[] = ["valores_negativos", ...ALERTAS_COSTO.map((a) => a.tipo)];

export const MIN_COMENTARIO_ALERTA = 10;
export const MAX_COMENTARIO_ALERTA = 2000;

export function esTipoAlertaComentario(valor: unknown): valor is TipoAlertaComentario {
  return typeof valor === "string" && Object.hasOwn(ETIQUETAS, valor);
}

export function etiquetaAlertaComentario(tipo: TipoAlertaComentario): string {
  return ETIQUETAS[tipo];
}

/** Una alerta presente en el cargue: cuántas referencias la tienen y su valor (la huella del cambio). */
export type AlertaComentable = {
  tipo: TipoAlertaComentario;
  etiqueta: string;
  /** Ítems que la tienen, contados como los lista Novedades. */
  referencias: number;
  /**
   * Costo: Σ del valor total de esas referencias. Negativos: Σ de los valores en negativo. Sirve
   * para saber si la alerta cambió desde el comentario.
   */
  valor: number;
};

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

/**
 * Las alertas del cargue que exigen comentario, solo las que tienen al menos una referencia, en el
 * orden de presentación. Sobre las mismas filas que pinta Novedades.
 */
export function alertasQueExigenComentario(descriptor: DescriptorModulo, filas: FilaValidable[]): AlertaComentable[] {
  const tipos = new Set(descriptor.alertasConComentario ?? []);
  if (tipos.size === 0) return [];
  const salida: AlertaComentable[] = [];
  if (tipos.has("valores_negativos")) {
    const negativos = detectarNegativos(descriptor, filas);
    if (negativos.length > 0) {
      salida.push({
        tipo: "valores_negativos",
        etiqueta: ETIQUETAS.valores_negativos,
        referencias: negativos.length,
        valor: redondear(negativos.reduce((s, n) => s + n.valor, 0)),
      });
    }
  }
  const costo = detectarAlertasCosto(descriptor, filas);
  for (const { tipo } of ALERTAS_COSTO) {
    if (!tipos.has(tipo)) continue;
    const propias = costo.filter((a) => a.tipo === tipo);
    if (propias.length === 0) continue;
    salida.push({
      tipo,
      etiqueta: ETIQUETAS[tipo],
      referencias: propias.length,
      valor: redondear(propias.reduce((s, a) => s + (a.total ?? 0), 0)),
    });
  }
  return salida.sort((a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo));
}

/** Valida el comentario escrito; devuelve el texto limpio o el motivo. */
export function validarComentarioAlerta(texto: unknown): { ok: true; texto: string } | { ok: false; message: string } {
  const limpio = String(texto ?? "").trim();
  if (limpio.length < MIN_COMENTARIO_ALERTA) {
    return { ok: false, message: `El comentario debe tener al menos ${MIN_COMENTARIO_ALERTA} caracteres.` };
  }
  if (limpio.length > MAX_COMENTARIO_ALERTA) {
    return { ok: false, message: `El comentario no puede superar ${MAX_COMENTARIO_ALERTA} caracteres.` };
  }
  return { ok: true, texto: limpio };
}

/** El comentario guardado de un tipo de alerta, con lo que tenía la alerta cuando se escribió. */
export type ComentarioAlerta = {
  tipo: TipoAlertaComentario;
  comentario: string;
  referencias: number;
  valor: number;
  comentadoPor: string | null;
  /** Fecha ya formateada para la UI. */
  comentadoEn: string;
};

export type EstadoComentarioAlerta = "pendiente" | "por_revisar" | "comentada";

export type AlertaConComentario = AlertaComentable & {
  estado: EstadoComentarioAlerta;
  comentario: ComentarioAlerta | null;
};

/** ¿La alerta cambió desde que se comentó? Otro número de referencias o otro valor (al centavo). */
export function alertaCambio(alerta: Pick<AlertaComentable, "referencias" | "valor">, comentario: Pick<ComentarioAlerta, "referencias" | "valor">): boolean {
  return alerta.referencias !== comentario.referencias || Math.abs(alerta.valor - comentario.valor) > 0.005;
}

/**
 * Pega a cada alerta del cargue su comentario y decide su estado. Los comentarios de tipos que ya no
 * aparecen en el cargue no se devuelven: sin alerta no hay nada que impida cerrar.
 */
export function anotarAlertasConComentarios(
  alertas: readonly AlertaComentable[],
  comentarios: readonly ComentarioAlerta[],
): AlertaConComentario[] {
  const porTipo = new Map(comentarios.map((c) => [c.tipo, c]));
  return alertas.map((alerta) => {
    const comentario = porTipo.get(alerta.tipo) ?? null;
    const estado: EstadoComentarioAlerta = !comentario ? "pendiente" : alertaCambio(alerta, comentario) ? "por_revisar" : "comentada";
    return { ...alerta, estado, comentario };
  });
}
