// Pool de LECTURA para los volúmenes grandes de los módulos — server-only.
//
// El motor de Prisma serializa cada fila con su `Decimal` y su JSON, y eso pesa: leer las
// 125.043 filas de un cargue de nómina tarda ~30-50 s por Prisma y ~9 s por el driver. Las
// consultas de lectura masiva (staging del borrador, detalle de un cargue y sus agregados)
// pasan por aquí; todo lo demás sigue por Prisma.
//
// Es un pool propio y mínimo —dos conexiones— para no competir con el de la aplicación.
//
// En `pg`, `connectionTimeoutMillis` limita también la ESPERA por una conexión libre del pool.
// Con dos conexiones y lecturas de decenas de segundos (el borrador de un cargue de nómina de
// 95.937 filas), recargar la página mientras la anterior seguía leyendo dejaba a la tercera
// petición sin conexión a los 15 s: «timeout exceeded when trying to connect» (30/Sep/2026).
// Conectar tarda menos de un segundo, así que aquí se espera más (`DB_LECTURA_ESPERA_MS`).
import "server-only";
import { Pool } from "pg";
import { ZONA_HORARIA_COLOMBIA } from "@/lib/fecha-hora";

const globalParaLectura = globalThis as unknown as { poolLecturaModulos?: Pool };

export function poolLectura(): Pool {
  if (!globalParaLectura.poolLecturaModulos) {
    globalParaLectura.poolLecturaModulos = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c timezone=${ZONA_HORARIA_COLOMBIA}`,
      keepAlive: true,
      max: 2,
      connectionTimeoutMillis: parseInt(process.env.DB_LECTURA_ESPERA_MS ?? "120000"),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS ?? "30000"),
    });
  }
  return globalParaLectura.poolLecturaModulos;
}
