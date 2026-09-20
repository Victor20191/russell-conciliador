// Comprobación de MISMO ORIGEN para los route handlers que mutan o disparan
// trabajo costoso (protección CSRF básica).
//
// Por qué no se compara contra `new URL(request.url).origin`: en un despliegue
// detrás de proxy —o simplemente fuera de localhost— Next construye esa URL con
// el host por el que escucha el proceso, no con el que escribió el usuario. En
// el VPS eso da `http://localhost:3001` y CUALQUIER navegador queda bloqueado
// con 403, aunque la petición sea del propio sitio. En local no se notaba
// porque ahí ambos valores coinciden.
//
// Lo correcto es comparar contra el host que el cliente REALMENTE pidió, que es
// lo que hace Next para sus Server Actions: `x-forwarded-host` (lo pone el
// proxy) y, si no está, `host`. El esquema no se compara: con TLS terminado en
// el proxy, el navegador manda `https://…` y el proceso sigue hablando HTTP.

/** Hosts extra autorizados, separados por coma (p. ej. un dominio nuevo tras un proxy que reescribe `Host`). */
function hostsExtra(): string[] {
  return (process.env.ORIGENES_PERMITIDOS ?? "")
    .split(",")
    .map((valor) => valor.trim().toLowerCase())
    .filter(Boolean)
    .map((valor) => {
      // Se acepta tanto «https://app.russell.co» como «app.russell.co».
      try {
        return new URL(valor).host;
      } catch {
        return valor;
      }
    });
}

/**
 * ¿La petición viene del mismo sitio? Sin cabecera `Origin` (peticiones que no
 * son del navegador) devuelve `true`: el handler igual autoriza por sesión.
 */
export function esMismoOrigen(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  // El host pedido, por orden de confianza. El de `request.url` queda de último
  // recurso, para peticiones sin cabecera `Host` (no vienen de un navegador).
  const propios = [
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
    (() => {
      try {
        return new URL(request.url).host;
      } catch {
        return null;
      }
    })(),
  ]
    .map((valor) => (valor ?? "").split(",")[0].trim().toLowerCase())
    .filter(Boolean);

  let hostDelOrigen: string;
  try {
    hostDelOrigen = new URL(origin).host.toLowerCase();
  } catch {
    return false; // Un `Origin` que no es URL no se acepta.
  }
  if (!hostDelOrigen) return false;
  if (propios.includes(hostDelOrigen)) return true;
  return hostsExtra().includes(hostDelOrigen);
}
