import { esUrlHttp } from "@/lib/soporte-estados";

/**
 * La URL exacta de la pantalla donde ocurrió la novedad, tal como la pegó quien
 * reporta. Abre en otra pestaña y sin `opener`: es texto del usuario, no un
 * destino de confianza. Los tickets anteriores al campo no la tienen.
 */
export default function TicketUrlPagina({ url, className = "" }: { url: string | null; className?: string }) {
  if (!url) return null;
  return (
    <p className={`break-all text-[12px] text-ink-600 ${className}`}>
      <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">URL:</span>
      {esUrlHttp(url) ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-500 hover:underline">
          {url}
        </a>
      ) : (
        url
      )}
    </p>
  );
}
