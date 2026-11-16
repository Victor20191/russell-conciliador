import { PageHeader } from "@/components/ui";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { cargarMapeoDian } from "@/lib/impuestos/configuracion-servidor";
import { alcanceCierreImpuesto, impuestoPorDeclaracion, RETENCION } from "@/lib/impuestos/impuestos-dian";
import MapeosDianClient from "./mapeos-dian-client";
import QuedanEnFirme from "../quedan-en-firme";

/**
 * Mapeo cuentas DIAN (`/config/mapeos-dian`; antes «Mapeos DIAN»): el «Filtros de cuentas» de los
 * impuestos DIAN. Una pestaña por formulario —350 (Retención en la fuente) y 300 (IVA)— con la cuenta
 * Russell de cada renglón y, al final, lo que deja en firme el cierre de una revisión de ese impuesto
 * (`alcanceCierreImpuesto`: sus grupos enteros y las demás cuentas del cruce).
 */
export default async function MapeosDianPage({ searchParams }: { searchParams: Promise<{ formulario?: string }> }) {
  // Global (sin cliente): todos consultan con `impuestos:ver`; editan Gerente, Socio y los
  // administradores con `impuestos:configurar`.
  await requirePermiso("impuestos:ver");
  const { formulario: pedido } = await searchParams;
  const formulario = pedido === "300" ? "300" : "350";
  const [vista, puedeEditar] = await Promise.all([
    cargarMapeoDian(formulario),
    authorizePermiso("impuestos:configurar").then((r) => r.ok),
  ]);
  const impuesto = impuestoPorDeclaracion(formulario) ?? RETENCION;
  const cuentasDelCruce = vista.filas.filter((f) => f.enCruce).flatMap((f) => f.cuentasRussell.map((c) => c.cuenta));
  const esRetencion = impuesto.clave === RETENCION.clave;

  return (
    <div>
      <PageHeader
        title="Mapeo cuentas DIAN"
        subtitle="Contra qué cuenta Russell se concilia cada renglón de los formularios de la DIAN y qué terceros son la DIAN. Vale para todos los clientes: lo declarado se compara con el saldo final de su cuenta en el balance del corte."
      />
      <div className="flex flex-col gap-6">
        <MapeosDianClient vista={vista} puedeEditar={puedeEditar} />
        <QuedanEnFirme
          sigla={impuesto.clave}
          codigos={alcanceCierreImpuesto(impuesto, cuentasDelCruce)}
          explicacion={
            <>
              Al cerrar en firme una revisión de {impuesto.nombre} quedan bloqueados, en el balance del corte, el saldo final y la
              homologación de las cuentas del cliente homologadas a estas cuentas Russell. Un balance nuevo que termine en el mismo
              mes no puede cambiarlas ni traer otra cuenta con saldo homologada a ellas.
            </>
          }
          nota={
            esRetencion
              ? "La 2365 y la 2367 quedan enteras, fijas en el sistema: también las cuentas que el cruce no concilia, como la de pagos de retención (236599)."
              : "La 2408 y la 135517 quedan enteras, fijas en el sistema; las cuentas de ingresos, una por una: las de los renglones de arriba."
          }
        />
      </div>
    </div>
  );
}
