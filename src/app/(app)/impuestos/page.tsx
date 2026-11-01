import { redirect } from "next/navigation";

// «Impuestos · DIAN» de la miga de pan: hoy el único submódulo es Retención en la fuente.
export default function ImpuestosPage() {
  redirect("/impuestos/retencion");
}
