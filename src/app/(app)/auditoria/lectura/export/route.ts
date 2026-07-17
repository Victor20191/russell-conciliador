import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import type { DiagnosticoLectura } from "@/lib/balance/diagnostico-lectura";
import { fechaColombiaISO, fechaHoraColombiaISO } from "@/lib/fecha-hora";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Huella = DiagnosticoLectura & { confianza?: number | null };

const COLS = [
  "creadoEn", "archivoNombre", "formato", "resultado", "filas", "movimientos", "agrupadoras", "totales",
  "cuadradoInicial", "cuadradoFinal", "porTercero", "terceros", "relistadoGuiones", "huerfanas",
  "repetidos", "subtotalesDuplicados", "descuadres", "codigoDigitos", "codigoGuiones", "codigoLetras",
  "partidaDobleDiff", "ecuacionDiff", "manualOmitidas", "manualReparentadas", "manualDesacopladas",
  "manualReclasificadas", "manualInvertidas", "diagnosticoIa", "confianza",
] as const;

const csv = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Exporta el dataset de medición de lectura a CSV. Mismo permiso que el tablero. */
export async function GET() {
  const authz = await authorizePermiso("auditoria:ia");
  if (!authz.ok) return NextResponse.json({ message: authz.message }, { status: 403 });

  const filas = await prisma.balanceLecturaDiagnostico.findMany({ orderBy: { creadoEn: "desc" }, take: 2000 });
  const lineas = [COLS.join(";")];
  for (const f of filas) {
    const h = f.heuristicas as unknown as Huella;
    const fila: Record<string, unknown> = {
      creadoEn: fechaHoraColombiaISO(f.creadoEn), archivoNombre: f.archivoNombre, formato: f.formato,
      resultado: f.resultado, filas: f.filas, movimientos: f.movimientos,
      agrupadoras: h.agrupadoras, totales: h.totales,
      cuadradoInicial: f.cuadradoInicial, cuadradoFinal: f.cuadradoFinal,
      porTercero: h.porTercero, terceros: h.terceros, relistadoGuiones: h.relistadoGuiones, huerfanas: h.huerfanas,
      repetidos: h.repetidos, subtotalesDuplicados: h.subtotalesDuplicados, descuadres: h.descuadres,
      codigoDigitos: h.codigoDigitos, codigoGuiones: h.codigoGuiones, codigoLetras: h.codigoLetras,
      partidaDobleDiff: h.partidaDobleDiff, ecuacionDiff: h.ecuacionDiff,
      manualOmitidas: f.manualOmitidas, manualReparentadas: f.manualReparentadas, manualDesacopladas: f.manualDesacopladas,
      manualReclasificadas: f.manualReclasificadas, manualInvertidas: f.manualInvertidas,
      diagnosticoIa: f.diagnosticoIa == null ? "" : JSON.stringify(f.diagnosticoIa),
      confianza: h.confianza,
    };
    lineas.push(COLS.map((c) => csv(fila[c])).join(";"));
  }
  const body = "﻿" + lineas.join("\r\n"); // BOM para que Excel lea UTF-8

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="diagnostico_lectura_${fechaColombiaISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
