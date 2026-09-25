// Pool de LECTURA para los volúmenes grandes de los módulos — server-only.
//
// El motor de Prisma serializa cada fila con su `Decimal` y su JSON, y eso pesa: leer las
// 125.043 filas de un cargue de nómina tarda ~30-50 s por Prisma y ~9 s por el driver. Las
// consultas de lectura masiva (staging del borrador, detalle de un cargue y sus agregados)
// pasan por aquí; todo lo demás sigue por Prisma.
//
// Es un pool propio y mínimo —dos conexiones— para no competir con el de la aplicación.
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
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS ?? "15000"),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS ?? "30000"),
    });
  }
  return globalParaLectura.poolLecturaModulos;
}
