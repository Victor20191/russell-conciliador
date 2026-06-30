import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
