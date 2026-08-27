import type { NextConfig } from "next";

// Next/Vercel suele ejecutar Node en UTC. La lógica de negocio usa helpers con
// zona explícita, y este valor protege además cualquier dependencia que consulte
// la zona local del proceso.
process.env.TZ = "America/Bogota";

const isDev = process.env.NODE_ENV !== "production";
// TLS real del despliegue: mismo interruptor que la cookie de sesión
// (ver src/lib/session.ts → cookieSecure). Sin HTTPS NO se emiten los headers
// que fuerzan/asumen TLS (upgrade-insecure-requests, HSTS), porque sobre HTTP
// plano romperían la carga de TODOS los assets (el navegador los pediría por
// https://, que no existe en el puerto). Con COOKIE_SECURE=true reaparecen.
const httpsEnabled = process.env.COOKIE_SECURE === "true";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(httpsEnabled ? ["upgrade-insecure-requests"] : []),
    ].join("; "),
  },
  ...(httpsEnabled
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

// Identificador del despliegue (protección de «version skew»). Sin él, una
// pestaña abierta con el build ANTERIOR que invoca una Server Action mientras
// el servidor ya sirve el build NUEVO se queda colgada: la acción se ejecuta,
// pero la respuesta nunca vuelve al navegador (botón en «Guardando…» eterno,
// sin error en consola). Con el identificador puesto, Next detecta el desajuste
// por la cabecera `x-nextjs-deployment-id` y fuerza una recarga completa.
//
// El valor se EMBEBE en el build, así que la MISMA variable debe estar
// definida al construir y al arrancar el proceso (p. ej. el SHA del commit
// desplegado). Si no se define, el comportamiento es el de siempre.
const deploymentId = process.env.NEXT_DEPLOYMENT_ID?.trim() || undefined;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(deploymentId ? { deploymentId } : {}),
  // La UI de balance usa fragmentos pequeños, pero se conserva la entrada directa
  // para pruebas/VPS y otros flujos de PDFs o fotos que usan Server Actions.
  experimental: {
    // Next 16 clona el cuerpo al pasar por `proxy.ts` y, por defecto, solo
    // conserva 10 MB. Debe acompañar el límite de Server Actions para las
    // entradas directas de compatibilidad y los demás archivos grandes.
    proxyClientMaxBodySize: "64mb",
    serverActions: {
      // Las acciones conservan sus propios límites por formato. Este margen
      // cubre además el envoltorio multipart de la petición.
      bodySizeLimit: "64mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
