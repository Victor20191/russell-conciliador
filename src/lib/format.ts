// Helpers de formato (portados de components.jsx) — locale es-CO

export const fmt = (n: number | null | undefined): string => {
  if (n == null) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n).toLocaleString("es-CO");
  return `${sign}$ ${abs}`;
};

export const fmtNum = (n: number | null | undefined): string =>
  n == null ? "—" : n.toLocaleString("es-CO");

export const fmtCompact = (n: number | null | undefined): string => {
  if (n == null) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}$ ${(abs / 1e9).toFixed(2).replace(".", ",")} MM`;
  if (abs >= 1e6) return `${sign}$ ${(abs / 1e6).toFixed(2).replace(".", ",")} M`;
  if (abs >= 1e3) return `${sign}$ ${(abs / 1e3).toFixed(1).replace(".", ",")} K`;
  return `${sign}$ ${abs}`;
};

export const pct = (x: number): string => `${Math.round(x * 100)}%`;

export const confidenceClass = (c: number): "ok" | "warn" | "err" =>
  c >= 0.9 ? "ok" : c >= 0.7 ? "warn" : "err";

export const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

export const fmtDate = (input: Date | string | null | undefined): string => {
  if (input == null) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}/${MESES[d.getMonth()]}/${d.getFullYear()}`;
};

// Fecha + hora (dd/Mes/aaaa hh:mm), 24 h y locale es-CO. Misma forma que el
// `fmtTS` de los tableros de auditoría, expuesto aquí para reusarse.
export const fmtDateTime = (input: Date | string | null | undefined): string => {
  if (input == null) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(d.getDate())}/${MESES[d.getMonth()]}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

export const timeAgo = (input: Date | string, now: Date = new Date()): string => {
  const d = typeof input === "string" ? new Date(input) : input;
  const diff = Math.max(0, now.getTime() - d.getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
};

export const fmtPct = (n: number | null | undefined): string => {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${Math.abs(n).toFixed(1).replace(".", ",")}%`;
};

// Clases Tailwind para chips de estado
export const statusChip = (status: string): string => {
  switch (status.toUpperCase()) {
    case "OK":
      return "bg-ok-100 text-ok-700";
    case "DIFF":
      return "bg-err-100 text-err-700";
    case "REVIEW":
    case "PEND":
      return "bg-warn-100 text-warn-700";
    default:
      return "bg-ink-100 text-ink-600";
  }
};
