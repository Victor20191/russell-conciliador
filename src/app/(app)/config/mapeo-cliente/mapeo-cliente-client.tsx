"use client";

import { useMemo, useState } from "react";
import { detectarAnomaliasMapeo } from "@/lib/balance/anomalias-mapeo";
import type { CuentaPucCliente } from "@/lib/balance/catalogo-puc-cliente";
import type { StdAccount } from "@/lib/balance/tipos-mapeo";
import { HomologacionClienteForm, MapeoClienteTab } from "./homologacion-client";

/**
 * Cascarón cliente de `/config/mapeo-cliente`: sostiene la cuenta que se está
 * editando (undefined = modal cerrado, null = regla nueva) y calcula las
 * anomalías de la memoria vigente.
 */
export default function MapeoClienteClient({
  clientNames, cliente, accounts, std, clienteId, clienteNit, puedeMapear,
}: {
  clientNames: string[]; cliente: string; accounts: CuentaPucCliente[]; std: StdAccount[];
  clienteId: number | null; clienteNit: string | null; puedeMapear: boolean;
}) {
  const [editTarget, setEditTarget] = useState<CuentaPucCliente | null | undefined>(undefined);
  const anomalias = useMemo(() => new Map(detectarAnomaliasMapeo(accounts.filter((a) => a.enMemoria)).map((a) => [a.code, a])), [accounts]);
  return (
    <div>
      <MapeoClienteTab accounts={accounts} std={std} anomalias={anomalias} clienteId={clienteId} clienteNit={clienteNit} puedeMapear={puedeMapear} cliente={cliente} clientNames={clientNames} onEditar={setEditTarget} />
      {puedeMapear && clienteId != null && editTarget !== undefined && (
        <HomologacionClienteForm cuenta={editTarget} clienteId={clienteId} std={std} accounts={accounts} onClose={() => setEditTarget(undefined)} />
      )}
    </div>
  );
}
