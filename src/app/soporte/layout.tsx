import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mesa de ayuda · Russell Bedford",
  description: "Reporte y seguimiento publico de solicitudes de soporte.",
};

export default function SoporteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
