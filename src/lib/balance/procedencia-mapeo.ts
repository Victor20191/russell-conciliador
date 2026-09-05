export type ProcedenciaMapeo = {
  fuente: "balance" | "carga" | "configuracion" | "historico";
  balance_id?: number;
  lote_id?: string;
  periodo?: string;
  version?: string;
};

export const procedenciaConfiguracion = (): ProcedenciaMapeo => ({ fuente: "configuracion" });
export const procedenciaBalance = (balance: { id: number; periodo: string }): ProcedenciaMapeo => ({
  fuente: "balance", balance_id: balance.id, periodo: balance.periodo,
});

/** JSON histórico o incompleto no debe romper la consulta ni crear enlaces. */
export function leerProcedenciaMapeo(valor: unknown): ProcedenciaMapeo | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const p = valor as Record<string, unknown>;
  if (!["balance", "carga", "configuracion", "historico"].includes(String(p.fuente))) return null;
  return {
    fuente: p.fuente as ProcedenciaMapeo["fuente"],
    ...(Number.isSafeInteger(p.balance_id) && Number(p.balance_id) > 0 ? { balance_id: Number(p.balance_id) } : {}),
    ...(typeof p.lote_id === "string" ? { lote_id: p.lote_id } : {}),
    ...(typeof p.periodo === "string" ? { periodo: p.periodo } : {}),
    ...(typeof p.version === "string" ? { version: p.version } : {}),
  };
}
