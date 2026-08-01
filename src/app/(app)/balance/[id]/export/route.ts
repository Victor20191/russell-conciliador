import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { parseId } from "@/lib/ids";
import { agruparPorRussell, agruparJerarquia } from "@/lib/balance/calcular";
import { getCuentasEstandar } from "@/lib/balance/cuentas-estandar";
import { crearExportacionBalance, type TipoExportBalance } from "@/lib/export/balance";
import { mensajeErrorBD } from "@/lib/errores";
import { fechaColombiaISO } from "@/lib/fecha-hora";
import { cargarContextoPrevalidadorBalance } from "@/lib/balance/prevalidador/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Descarga el balance a Excel. El prevalidador usa el mismo VM estricto de la
 * pantalla y la compuerta; si no es calculable, falla cerrado. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ message: "Balance inexistente." }, { status: 404 });
  try {
    const balance = await prisma.balancePruebaEncabezado.findUnique({
      where: { id },
      include: {
        detalles: { select: { cuenta8: true, nombreCuenta: true, cuenta6Russell: true, coincidencia: true, saldoInicial: true, debitos: true, creditos: true, saldoFinal: true } },
      },
    });
    if (!balance) return NextResponse.json({ message: "El balance no existe." }, { status: 404 });
    // Alcance por cartera, igual que la página del balance.
    const authz = await authorizePermiso("balance:ver", { clientId: balance.clienteId });
    if (!authz.ok) return NextResponse.json({ message: authz.message }, { status: 403 });

    const solicitado = new URL(req.url).searchParams.get("tipo");
    const tipo: TipoExportBalance = solicitado === "comparativo" || solicitado === "prevalidador" ? solicitado : "homologado";
    const generadoEn = new Date();

    if (tipo === "prevalidador") {
      const contexto = await cargarContextoPrevalidadorBalance(id);
      if (contexto.prevalidador.estado !== "listo") {
        const mensaje =
          contexto.prevalidador.estado === "bloqueado"
            ? `El prevalidador está bloqueado por ${contexto.prevalidador.sinHomologar.cuentas} cuenta(s) sin homologar.`
            : contexto.prevalidador.estado === "sin_catalogo"
              ? "No hay cuentas activas configuradas para el prevalidador."
              : contexto.prevalidador.mensaje;
        return NextResponse.json({ message: mensaje }, { status: 409 });
      }
      const buffer = await crearExportacionBalance(
        {
          arbol: [],
          grupos: [],
          prevalidador: contexto.prevalidador,
          revisionPrevalidador: contexto.revision,
        },
        { cliente: balance.nombreCliente, periodo: balance.periodo, version: balance.version, generadoEn },
        tipo,
      );
      const base = balance.nombreCliente.replace(/[^\w.-]+/g, "_").slice(0, 40);
      const nombreArchivo = `Balance_Prevalidador_${base}_v${balance.version}_${fechaColombiaISO(generadoEn)}.xlsx`;
      const body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      return new Response(body, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
          "Cache-Control": "no-store",
          "Content-Length": String(buffer.byteLength),
        },
      });
    }

    const [cuentasEstandar, subgrupos] = await Promise.all([
      getCuentasEstandar(),
      prisma.subgrupoEstandar.findMany({ select: { codigo: true, nombre: true, grupo: true, nombreGrupo: true } }),
    ]);
    const nombresRussell = new Map(cuentasEstandar.map((s) => [s.code, s.name]));
    const nombre4 = new Map(subgrupos.map((s) => [s.codigo, s.nombre]));
    const nombre2 = new Map(subgrupos.map((s) => [s.grupo, s.nombreGrupo]));
    const filas = balance.detalles.map((f) => ({
      cuenta8: f.cuenta8, nombreCuenta: f.nombreCuenta, cuenta6Russell: f.cuenta6Russell,
      coincidencia: f.coincidencia != null ? Number(f.coincidencia) : null,
      saldoInicial: Number(f.saldoInicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldoFinal),
    }));
    // Homologado → árbol jerárquico (subtotales por nivel); comparativo → grupos Russell.
    const grupos = tipo === "comparativo" ? agruparPorRussell(filas, cuentasEstandar, nombresRussell) : [];
    const arbol = tipo === "homologado" ? agruparJerarquia(filas, cuentasEstandar, nombresRussell, { nombre4, nombre2 }) : [];

    const buffer = await crearExportacionBalance({ arbol, grupos }, { cliente: balance.nombreCliente, periodo: balance.periodo, version: balance.version, generadoEn }, tipo);
    const base = balance.nombreCliente.replace(/[^\w.-]+/g, "_").slice(0, 40);
    const suf = tipo === "comparativo" ? "Comparativo" : "Homologado";
    const nombreArchivo = `Balance_${suf}_${base}_v${balance.version}_${fechaColombiaISO(generadoEn)}.xlsx`;
    const body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
        "Cache-Control": "no-store",
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (e) {
    return NextResponse.json({ message: mensajeErrorBD("exportarBalance", e) }, { status: 500 });
  }
}
