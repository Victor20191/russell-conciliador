import prisma from "@/lib/prisma";
import { PageHeader, Card, StatCard, Chip } from "@/components/ui";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { requirePermiso } from "@/lib/rbac";
import type { DiagnosticoLectura } from "@/lib/balance/diagnostico-lectura";

type Huella = DiagnosticoLectura & { confianza?: number | null };

const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : 0);

// Etiqueta legible de cada señal heurística.
const HEUR_LABEL: Record<string, string> = {
  terceros: "Detalle por tercero",
  "relistado-guiones": "Re-listado con guiones",
  huerfanas: "Agrupadoras huérfanas",
  "subtotales-dup": "Subtotales duplicados",
  "codigos-repetidos": "Códigos repetidos",
  descuadres: "Descuadres de árbol",
};

/** Conjunto de señales heurísticas DISPARADAS en un reporte (para la huella/combo). */
function disparadas(h: Huella): string[] {
  const s: string[] = [];
  if (h.porTercero || (h.terceros ?? 0) > 0) s.push("terceros");
  if ((h.relistadoGuiones ?? 0) > 0) s.push("relistado-guiones");
  if ((h.huerfanas ?? 0) > 0) s.push("huerfanas");
  if ((h.subtotalesDuplicados ?? 0) > 0) s.push("subtotales-dup");
  if ((h.repetidos ?? 0) > 0) s.push("codigos-repetidos");
  if ((h.descuadres ?? 0) > 0) s.push("descuadres");
  return s;
}

const RESULTADOS = ["borrador", "cargado", "descartado"] as const;
const FORMATOS = ["xlsx", "csv", "txt", "json", "pdf"] as const;

// Intervención manual TOTAL del reporte (los 5 tipos de corrección).
const manoDe = (f: { manualOmitidas: number; manualReparentadas: number; manualDesacopladas: number; manualReclasificadas: number; manualInvertidas: number }) =>
  f.manualOmitidas + f.manualReparentadas + f.manualDesacopladas + f.manualReclasificadas + f.manualInvertidas;

export default async function LecturaBalanceDiagPage({ searchParams }: { searchParams: Promise<{ resultado?: string; formato?: string }> }) {
  // SOLO Superadministrador (se reutiliza el permiso de auditoría de IA).
  await requirePermiso("auditoria:ia");

  const sp = await searchParams;
  const resultadoSel = RESULTADOS.find((r) => r === sp.resultado) ?? null;
  const formatoSel = FORMATOS.find((f) => f === sp.formato) ?? null;

  const filas = await prisma.balanceLecturaDiagnostico.findMany({
    where: {
      ...(resultadoSel ? { resultado: resultadoSel } : {}),
      ...(formatoSel ? { formato: formatoSel } : {}),
    },
    orderBy: { creadoEn: "desc" },
    take: 300,
  });
  const total = filas.length;

  const cuadroSolo = filas.filter((f) => f.cuadradoInicial).length;
  const conMano = filas.filter((f) => manoDe(f) > 0).length;
  const cargados = filas.filter((f) => f.resultado === "cargado").length;
  const descartados = filas.filter((f) => f.resultado === "descartado").length;

  // Enlaces de filtro (server-rendered): alterna el valor y conserva el otro filtro.
  const hrefCon = (cambios: { resultado?: string | null; formato?: string | null }): string => {
    const q = new URLSearchParams();
    const r = cambios.resultado === undefined ? resultadoSel : cambios.resultado;
    const fm = cambios.formato === undefined ? formatoSel : cambios.formato;
    if (r) q.set("resultado", r);
    if (fm) q.set("formato", fm);
    const s = q.toString();
    return s ? `/auditoria/lectura?${s}` : "/auditoria/lectura";
  };

  // Disparo por heurística: en cuántos reportes se activó cada señal.
  const conteoHeur = new Map<string, number>();
  // Combos: conjunto de señales por reporte (para ver convergencia).
  const combos: { fecha: Date; archivo: string; sig: string; nuevo: boolean }[] = [];
  const vistos = new Set<string>();
  // Recorrer en orden CRONOLÓGICO (asc) para marcar el «primer avistamiento» de un combo.
  for (const f of [...filas].reverse()) {
    const h = f.heuristicas as unknown as Huella;
    const disp = disparadas(h);
    for (const k of disp) conteoHeur.set(k, (conteoHeur.get(k) ?? 0) + 1);
    const sig = disp.length ? disp.slice().sort().join(" + ") : "(ninguna)";
    const nuevo = !vistos.has(sig);
    vistos.add(sig);
    combos.push({ fecha: f.creadoEn, archivo: f.archivoNombre, sig, nuevo });
  }
  const combosDistintos = vistos.size;
  const maxHeur = Math.max(1, ...conteoHeur.values());
  const heurOrdenadas = [...conteoHeur.entries()].sort((a, b) => b[1] - a[1]);
  // Últimos combos nuevos (la señal de divergencia): si siguen apareciendo, la cola no cierra.
  const nuevosRecientes = combos.filter((c) => c.nuevo).slice(-8).reverse();

  return (
    <div>
      <PageHeader
        title="Diagnóstico de lectura de balances"
        subtitle="Medición observacional del modelo de lectura: qué heurística se disparó por reporte, si cuadró solo y cuánta intervención manual necesitó. Sirve para decidir con datos si la cola de heurísticas converge o hay que rediseñar."
        actions={
          <a
            href="/auditoria/lectura/export"
            className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-ink-50"
          >
            Exportar CSV
          </a>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Reportes medidos" value={fmtNum(total)} tone="ink" hint="últimos 300" />
        <StatCard label="Cuadró solo" value={`${pct(cuadroSolo, total)}%`} tone={pct(cuadroSolo, total) >= 70 ? "ok" : "warn"} hint={`${cuadroSolo} de ${total} sin editar`} />
        <StatCard label="Necesitó mano" value={`${pct(conMano, total)}%`} tone={conMano === 0 ? "ok" : "warn"} hint={`${conMano} con override manual`} />
        <StatCard label="Combinaciones" value={fmtNum(combosDistintos)} tone="blue" hint="huellas heurísticas distintas" />
      </div>

      <p className="mb-3 text-[12px] text-ink-500">
        Resultado de los cargues medidos: <span className="font-semibold text-ink-700">{fmtNum(cargados)}</span> cargado(s),{" "}
        <span className="font-semibold text-ink-700">{fmtNum(descartados)}</span> descartado(s), el resto en borrador.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink-400">Resultado:</span>
          <a href={hrefCon({ resultado: null })} className={`rounded-full px-2.5 py-0.5 ${!resultadoSel ? "bg-navy-700 font-semibold text-white" : "border border-ink-200 text-ink-600 hover:bg-ink-50"}`}>todos</a>
          {RESULTADOS.map((r) => (
            <a key={r} href={hrefCon({ resultado: resultadoSel === r ? null : r })} className={`rounded-full px-2.5 py-0.5 ${resultadoSel === r ? "bg-navy-700 font-semibold text-white" : "border border-ink-200 text-ink-600 hover:bg-ink-50"}`}>{r}</a>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink-400">Formato:</span>
          <a href={hrefCon({ formato: null })} className={`rounded-full px-2.5 py-0.5 ${!formatoSel ? "bg-navy-700 font-semibold text-white" : "border border-ink-200 text-ink-600 hover:bg-ink-50"}`}>todos</a>
          {FORMATOS.map((fm) => (
            <a key={fm} href={hrefCon({ formato: formatoSel === fm ? null : fm })} className={`rounded-full px-2.5 py-0.5 ${formatoSel === fm ? "bg-navy-700 font-semibold text-white" : "border border-ink-200 text-ink-600 hover:bg-ink-50"}`}>{fm}</a>
          ))}
        </div>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-ink-800">Disparo por heurística</h2>
          {heurOrdenadas.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-400">Aún no hay reportes medidos.</p>
          ) : (
            <ul className="space-y-2.5">
              {heurOrdenadas.map(([k, n]) => (
                <li key={k}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[12.5px] text-ink-800">{HEUR_LABEL[k] ?? k}</span>
                    <span className="shrink-0 font-mono text-[12px] font-semibold text-ink-700">{fmtNum(n)} rep.</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.round((n / maxHeur) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-1 text-[13px] font-semibold text-ink-800">Convergencia — combinaciones nuevas</h2>
          <p className="mb-3 text-[11.5px] text-ink-500">
            Cada vez que aparece una combinación de heurísticas nunca vista, la cola aún no cierra. Si dejan de aparecer al acumular reportes → converge (seguir parchando); si siguen saliendo → diverge (rediseñar).
          </p>
          {nuevosRecientes.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-400">Sin datos.</p>
          ) : (
            <ul className="space-y-2">
              {nuevosRecientes.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px]">
                  <span className="shrink-0 text-ai-600">★</span>
                  <span className="min-w-0">
                    <span className="font-medium text-ink-800">{c.sig}</span>
                    <span className="ml-1.5 text-[11px] text-ink-400">{fmtDateTime(c.fecha)} · {c.archivo}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Archivo</th>
                <th className="px-3 py-2 text-right font-medium">Filas</th>
                <th className="px-3 py-2 font-medium">Fmt</th>
                <th className="px-3 py-2 font-medium">Cuadró</th>
                <th className="px-3 py-2 font-medium">Final</th>
                <th className="px-3 py-2 text-right font-medium" title="Δ partida doble / Δ ecuación de la lectura automática">Δ P.doble / Δ Ecuación</th>
                <th className="px-3 py-2 font-medium">Heurísticas disparadas</th>
                <th className="px-3 py-2 font-medium">Manual</th>
                <th className="px-3 py-2 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const h = f.heuristicas as unknown as Huella;
                const disp = disparadas(h);
                const mano = manoDe(f);
                return (
                  <tr key={f.id} className="border-t border-ink-100 hover:bg-ink-50/60">
                    <td className="whitespace-nowrap px-3 py-1.5 text-ink-500">{fmtDateTime(f.creadoEn)}</td>
                    <td className="max-w-[220px] truncate px-3 py-1.5 text-ink-800" title={f.archivoNombre}>
                      {f.diagnosticoIa != null && <span className="mr-1 text-ai-600" title="Se pidió diagnóstico asistido con IA">✦</span>}
                      {f.archivoNombre}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-ink-600">{fmtNum(f.filas)}</td>
                    <td className="px-3 py-1.5 text-ink-500">{f.formato ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <Chip label={f.cuadradoInicial ? "Sí" : "No"} tone={f.cuadradoInicial ? "ok" : "warn"} />
                    </td>
                    <td className="px-3 py-1.5">
                      {f.cuadradoFinal == null ? <span className="text-ink-400">—</span> : <Chip label={f.cuadradoFinal ? "Sí" : "No"} tone={f.cuadradoFinal ? "ok" : "err"} />}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-[11px] text-ink-600">
                      {(h.partidaDobleDiff ?? 0) === 0 && (h.ecuacionDiff ?? 0) === 0
                        ? <span className="text-ink-400">—</span>
                        : `${fmtNum(Math.round(h.partidaDobleDiff ?? 0))} / ${fmtNum(Math.round(h.ecuacionDiff ?? 0))}`}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {disp.length === 0 ? <span className="text-ink-400">—</span> : disp.map((k) => <Chip key={k} label={HEUR_LABEL[k] ?? k} tone="blue" />)}
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      {mano === 0 ? <span className="text-ink-400">—</span> : (
                        <span className="font-mono text-[11px] text-warn-700" title={`${f.manualOmitidas} omitidas · ${f.manualReparentadas} reparentadas · ${f.manualDesacopladas} desacopladas · ${f.manualReclasificadas} reclasificadas · ${f.manualInvertidas} invertidas`}>
                          {mano}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <Chip
                        label={f.resultado}
                        tone={f.resultado === "cargado" ? "ok" : f.resultado === "descartado" ? "ink" : "blue"}
                      />
                    </td>
                  </tr>
                );
              })}
              {filas.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-[12.5px] text-ink-400">Aún no hay reportes medidos. Lee un balance para empezar a acumular datos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
