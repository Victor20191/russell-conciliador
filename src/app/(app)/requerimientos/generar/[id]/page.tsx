import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { PageHeader, BackLink } from "@/components/ui";
import GenerarClient, { type GenFamily, type GenHeader, type Contact } from "./generar-client";

const CLIENTS: { name: string; nit: string; code: string }[] = [
  { name: "El Zarzal S.A", nit: "890.345.872-1", code: "ZZ" },
  { name: "Inversiones del Pacífico S.A.S", nit: "900.451.227-3", code: "IP" },
  { name: "Comercializadora Andina Ltda", nit: "800.234.115-7", code: "CA" },
];

export default async function GenerarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await prisma.reqTemplate.findUnique({
    where: { id },
    include: { header: true, familyList: { orderBy: { order: "asc" }, include: { itemList: { orderBy: { order: "asc" } } } } },
  });
  if (!t || !t.header) notFound();

  const families: GenFamily[] = t.familyList.map((f) => ({ name: f.name, items: f.itemList.map((it) => it.text) }));
  const header: GenHeader = { firmName: t.header.firmName, city: t.header.city, asunto: t.header.asunto, intro: t.header.intro, noteGeneric: t.header.noteGeneric, closing: t.header.closing, signatoryName: t.header.signatoryName, signatoryRole: t.header.signatoryRole, signatoryFooter: t.header.signatoryFooter, contactEmails: t.header.contactEmails };

  const allContacts = await prisma.clientContact.findMany({ orderBy: { order: "asc" } });
  const contactsByClient: Record<string, Contact[]> = {};
  for (const c of allContacts) (contactsByClient[c.clientName] ??= []).push({ name: c.name, role: c.role, email: c.email, primary: c.primary });

  return (
    <div>
      <div className="mb-3"><BackLink href={`/requerimientos/plantillas/${t.id}`} label="Volver a la plantilla" /></div>
      <PageHeader title={`Generar · ${t.name}`} subtitle={`${t.code} ${t.activeVersion}`} />
      <GenerarClient templateCode={t.code} templateVersion={t.activeVersion} header={header} families={families} clients={CLIENTS} contactsByClient={contactsByClient} />
    </div>
  );
}
