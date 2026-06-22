import { redirect } from "next/navigation";

export default async function MapeoRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const sp = await searchParams;
  const query = sp.cliente ? `?cliente=${encodeURIComponent(sp.cliente)}` : "";
  redirect(`/config/mapeo${query}`);
}
