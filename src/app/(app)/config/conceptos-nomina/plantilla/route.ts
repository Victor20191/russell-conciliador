import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { alcanceLecturaUsuario } from "@/lib/rbac/contexto";
import { crearPlantillaConceptosNomina } from "@/lib/import/conceptos-nomina-template";
import { MODULO_CONCEPTOS_NOMINA } from "@/lib/import/conceptos-nomina";
import { cedulaModulo, opcionesCedula, prefijosCuentaModulo } from "@/lib/modulos/cuentas-modulo";
import { descriptorModulo } from "@/lib/modulos/descriptores";
import { cargarCuentasEstandarDeCedula } from "@/lib/modulos/cruce-contable-servidor";
import { getCatalogoPrevalidador } from "@/lib/parametros/prevalidador";
import { mensajeErrorBD } from "@/lib/errores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOMBRE_ARCHIVO = "Plantilla_Conceptos_Nomina.xlsx";

/**
 * Plantilla de la carga masiva de conceptos de nómina. Las referencias que trae
 * dentro (clientes y cuentas válidas) se limitan a la CARTERA del usuario: la
 * plantilla no puede servir para enumerar clientes ajenos.
 */
export async function GET() {
  const authz = await authorizePermiso("modulos_datos:editar");
  if (!authz.ok) return NextResponse.json({ message: authz.message }, { status: 403 });

  try {
    const alc = await alcanceLecturaUsuario();
    // Nómina cruza a 6 dígitos: las referencias son las cuentas Russell completas del módulo
    // (gasto de personal y los pasivos laborales que también concilia).
    const descriptor = descriptorModulo(MODULO_CONCEPTOS_NOMINA);
    const [clientes, cuentasEstandar, catalogo] = await Promise.all([
      prisma.client.findMany({
        where: alc.todos ? {} : { id: { in: alc.clientIds } },
        orderBy: { name: "asc" },
        select: { code: true, name: true, nit: true },
      }),
      cargarCuentasEstandarDeCedula(descriptor),
      getCatalogoPrevalidador(),
    ]);

    const cedula = cedulaModulo(descriptor, prefijosCuentaModulo(MODULO_CONCEPTOS_NOMINA, catalogo));
    const cuentas = opcionesCedula(cedula, [], cuentasEstandar);

    const buffer = await crearPlantillaConceptosNomina({ clientes, cuentas });
    const body = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${NOMBRE_ARCHIVO}"`,
        "Cache-Control": "no-store",
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (e) {
    return NextResponse.json({ message: mensajeErrorBD("plantillaConceptosNomina", e) }, { status: 500 });
  }
}
