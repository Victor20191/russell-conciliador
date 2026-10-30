// Proceso de producción en el VPS (PM2).
//
// Next se arranca DIRECTAMENTE y no con `npm start`: con npm de por medio PM2 vigila
// el proceso de npm (unos MB) y no el servidor, así que ni la columna de memoria de
// `pm2 ls` ni `max_memory_restart` ven el proceso que de verdad crece.
//
// Memoria: el heap de V8 queda acotado y PM2 reinicia el proceso cuando la memoria
// residente pasa el umbral. Una solicitud que dispare el consumo termina así en un
// reinicio en segundos, en vez de dejar la plataforma colgada en recolección de basura
// (como ya ocurrió: 3,3 GB y la app sin responder). El servidor comparte la RAM con
// PostgreSQL: ajustar con HEAP_MAX_MB y REINICIO_MEMORIA_MB al arrancar.
//
//   pm2 delete russell-lfm            # solo la primera vez (antes corría con npm)
//   pm2 start ecosystem.config.js && pm2 save
//
// La variable de entorno de la terminal se hereda al arrancar (p. ej. NEXT_DEPLOYMENT_ID,
// que debe ser la misma del build); en un `pm2 reload` hay que pasar `--update-env`.
const heapMb = Number(process.env.HEAP_MAX_MB || 2048);
const reinicioMb = Number(process.env.REINICIO_MEMORIA_MB || heapMb + 768);

module.exports = {
  apps: [
    {
      name: "russell-lfm",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      node_args: `--max-old-space-size=${heapMb}`,
      max_memory_restart: `${reinicioMb}M`,
      // Margen para terminar las solicitudes en curso antes del SIGKILL (por defecto 1,6 s).
      kill_timeout: 10000,
      exp_backoff_restart_delay: 1000,
      // Sin hora en el log no se puede cruzar un incidente con la auditoría.
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || "3001",
      },
    },
  ],
};
