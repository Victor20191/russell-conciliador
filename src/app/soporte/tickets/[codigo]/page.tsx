import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { fmtDateTime } from "@/lib/format";
import { ESTADO_TICKET_RESUELTO, etiquetaEstadoTicket, huellaTokenAcceso, tonoEstadoTicket } from "@/lib/soporte";

/**
 * Insignia del estado en el portal público. No usa `Chip` (este layout no
 * comparte los componentes de la app) pero sí el MISMO tono, así que agregar
 * un estado solo pide una entrada aquí.
 */
const TONO_INSIGNIA: Record<string, string> = {
  ok: "bg-ok-100 text-ok-700",
  blue: "bg-blue-100 text-navy-700",
  ink: "bg-ink-100 text-ink-600",
  ai: "bg-ai-100 text-ai-700",
  err: "bg-err-100 text-err-700",
  warn: "bg-warn-100 text-warn-700",
};

export default async function SeguimientoTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<{ acceso?: string }>;
}) {
  const [{ codigo }, query] = await Promise.all([params, searchParams]);
  const token = query.acceso;
  if (!/^TKT-\d{8}-[A-Z0-9]{8}$/.test(codigo) || !token || token.length < 32 || token.length > 100) notFound();

  const ticket = await prisma.supportTicket.findFirst({
    where: { code: codigo, publicAccessTokenHash: huellaTokenAcceso(token) },
    select: {
      code: true,
      reporterFirstName: true,
      reporterLastName: true,
      subject: true,
      description: true,
      status: true,
      solution: true,
      resolvedByName: true,
      resolvedAt: true,
      createdAt: true,
    },
  });
  if (!ticket) notFound();

  const resuelto = ticket.status === ESTADO_TICKET_RESUELTO && Boolean(ticket.solution);
  return (
    <main className="min-h-screen bg-ink-50 px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/soporte" className="text-xs font-semibold text-blue-500 hover:text-navy-700">← Reportar otro ticket</Link>
        <div className="mt-5 overflow-hidden rounded-xl border border-ink-150 bg-paper shadow-lg">
          <div className="border-b border-ink-150 bg-navy-800 px-6 py-6 text-white sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CADC0]">Seguimiento privado</p>
                <h1 className="mt-1 font-mono text-xl font-semibold">{ticket.code}</h1>
              </div>
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                TONO_INSIGNIA[tonoEstadoTicket(ticket.status)] ?? TONO_INSIGNIA.warn
              }`}>
                {etiquetaEstadoTicket(ticket.status)}
              </span>
            </div>
          </div>

          <div className="space-y-7 p-6 sm:p-8">
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Solicitud de {ticket.reporterFirstName} {ticket.reporterLastName}</p>
              <h2 className="mt-2 font-serif text-2xl text-ink-900">{ticket.subject}</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-700">{ticket.description}</p>
              <p className="mt-3 text-xs text-ink-500">Reportado el {fmtDateTime(ticket.createdAt)}</p>
            </section>

            <section className={`rounded-lg border p-5 ${resuelto ? "border-ok-100 bg-ok-100" : "border-warn-100 bg-warn-100"}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider ${resuelto ? "text-ok-700" : "text-warn-700"}`}>
                {resuelto ? "Cómo se solucionó" : "Respuesta del técnico"}
              </p>
              {resuelto ? (
                <>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-800">{ticket.solution}</p>
                  <p className="mt-4 text-xs text-ink-600">
                    Solucionado por {ticket.resolvedByName ?? "el equipo de soporte"}{ticket.resolvedAt ? ` · ${fmtDateTime(ticket.resolvedAt)}` : ""}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-ink-700">Tu solicitud fue recibida. Vuelve a este mismo enlace para consultar la solución cuando el equipo la documente.</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
