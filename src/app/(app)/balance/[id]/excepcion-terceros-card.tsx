import Link from "next/link";
import { Icon } from "@/components/icons";
import { fmtNum } from "@/lib/format";

/**
 * Tarjeta del balance de un cliente con la excepción «No maneja balance por terceros»: lo dice a la
 * vista, cuenta si ya tiene los terceros agregados (el archivo de movimientos del ERP) y recuerda que
 * esos terceros son solo para los impuestos.
 */
export function ExcepcionTercerosCard({ href, renglones }: { href: string; renglones: number | null }) {
  const agregados = renglones != null;
  return (
    // Sin `Card`: su fondo blanco y su borde gris taparían el naranja de la excepción.
    <section aria-label="Cliente con excepción de balance por terceros" className="col-span-2 rounded-lg border border-warn-200 bg-warn-50 p-4 shadow-sm md:col-span-3">
      <div className="flex items-start gap-2.5">
        <Icon name="warn" size={16} className="mt-0.5 shrink-0 text-warn-600" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-warn-700">Cliente con excepción de balance por terceros</div>
          <p className="mt-1 text-[12.5px] font-semibold text-ink-800">
            {agregados ? `Balance por cuenta con terceros agregados · ${fmtNum(renglones)} renglones cuenta–tercero` : "Balance por cuenta, sin terceros agregados"}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-600">
            Los terceros agregados salen del archivo de movimientos del ERP y sirven <b>solo para los impuestos</b> (Retención en la fuente, IVA y RST). Cartera y Cuentas por pagar se concilian por cuenta.
          </p>
        </div>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-warn-500 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-warn-700 transition hover:bg-warn-100"
        >
          <Icon name={agregados ? "users" : "upload"} size={13} /> {agregados ? "Ver terceros agregados" : "Adjuntar terceros"}
        </Link>
      </div>
    </section>
  );
}
