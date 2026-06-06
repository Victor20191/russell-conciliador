import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { PageHeader, BackLink, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";
import PlantillaClient, { type Family, type Header } from "./plantilla-client";
import { parseId } from "@/lib/ids";

export default async function PlantillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) notFound();
  const t = await prisma.reqTemplate.findUnique({
    where: { id },
    include: { header: true, familyList: { orderBy: { order: "asc" }, include: { itemList: { orderBy: { order: "asc" } } } } },
  });
  if (!t) notFound();

  const families: Family[] = t.familyList.map((f) => ({ id: f.id, name: f.name, items: f.itemList.map((it) => it.text) }));
  const header: Header | null = t.header ? {
    firmName: t.header.firmName, city: t.header.city, asunto: t.header.asunto, intro: t.header.intro, noteGeneric: t.header.noteGeneric, closing: t.header.closing,
    signatoryName: t.header.signatoryName, signatoryRole: t.header.signatoryRole, signatoryFooter: t.header.signatoryFooter, consecutivePrefix: t.header.consecutivePrefix, contactEmails: t.header.contactEmails,
  } : null;

  return (
    <div>
      <div className="mb-3"><BackLink href="/requerimientos" label="Requerimientos" /></div>
      <PageHeader
        title={t.name}
        subtitle={`Plantilla ${t.code} · ${t.families} familias · ${t.items} ítems · ${t.timesUsed} usos`}
        actions={
          <div className="flex items-center gap-2">
            <Chip label={`${t.activeVersion} activa`} tone="ok" />
            {t.header && <Link href={`/requerimientos/generar/${t.id}`} className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-600"><Icon name="send" size={14} /> Generar requerimiento</Link>}
          </div>
        }
      />
      <PlantillaClient families={families} header={header} />
    </div>
  );
}
