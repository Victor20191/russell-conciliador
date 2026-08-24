import { Metadata } from "next";
import { Suspense } from "react";
import prisma from "@/lib/prisma";
import { authorizePermiso } from "@/lib/rbac";
import { redirect } from "next/navigation";
import EntornoClient from "./entorno-client";
import { Icon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Variables de Entorno e Integraciones",
};

export default async function EntornoPage() {
  const authz = await authorizePermiso("entorno:administrar");
  if (!authz.ok) redirect("/(app)/dashboard");

  const variables = await prisma.environmentVariable.findMany({
    orderBy: [
      { category: "asc" },
      { key: "asc" },
    ],
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-end justify-between border-b border-ink-100 pb-4">
        <div>
          <div className="flex items-center gap-2 text-ink-500">
            <Icon name="settings" size={16} />
            <span className="text-[13px] font-medium tracking-wide">CONFIGURACIÓN</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy-800">
            Variables de Entorno e Integraciones
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-600">
            Administra las conexiones operativas hacia otras plataformas y APIs. Los valores marcados
            como secretos están cifrados en la base de datos para tu seguridad.
          </p>
        </div>
      </header>

      <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-ink-50" />}>
        <EntornoClient initialVariables={variables} />
      </Suspense>
    </div>
  );
}
