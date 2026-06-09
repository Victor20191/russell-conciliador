// Chequeo temporal: ¿los clientName de las entidades de negocio resuelven
// a exactamente UN cliente? (requisito del puente clientIdPorNombre)
import { readFileSync } from "node:fs";
import { Pool } from "pg";

function leerDatabaseUrl(): string {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const linea = env.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!linea) throw new Error("DATABASE_URL no encontrada en .env");
  return linea.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
}

async function main() {
  const pool = new Pool({ connectionString: leerDatabaseUrl() });

  for (const [tabla, col] of [
    ["balances", "nombre_cliente"],
    ["cuentas_cliente", "nombre_cliente"],
    ["conciliaciones", "nombre_cliente"],
  ] as const) {
    const { rows } = await pool.query(`
      SELECT t.${col} AS nombre, COUNT(DISTINCT t.id) AS filas,
             (SELECT COUNT(*) FROM clientes c WHERE c.nombre = t.${col}) AS clientes
      FROM ${tabla} t GROUP BY t.${col} ORDER BY t.${col}
    `);
    console.log(`== ${tabla} ==`);
    for (const r of rows) {
      const flag = Number(r.clientes) === 1 ? "✓" : "⚠️ SIN RESOLUCIÓN ÚNICA";
      console.log(`  ${r.nombre}: ${r.filas} fila(s) → ${r.clientes} cliente(s) ${flag}`);
    }
  }

  const conc = await pool.query(
    `SELECT id, nombre_cliente, cliente_id FROM conciliaciones ORDER BY id`,
  );
  console.log("== conciliaciones.cliente_id ==");
  for (const r of conc.rows) console.log(`  #${r.id} ${r.nombre_cliente} → cliente_id=${r.cliente_id ?? "NULL"}`);

  const asg = await pool.query(`
    SELECT a.cliente_id, c.nombre, a.usuario_id, a.equipo_id, a.alcance_lectura, a.alcance_escritura, a.activo
    FROM asignaciones_cliente a LEFT JOIN clientes c ON c.id = a.cliente_id ORDER BY a.id
  `);
  console.log("== asignaciones_cliente actuales ==");
  if (!asg.rows.length) console.log("  (vacía)");
  for (const r of asg.rows)
    console.log(`  cliente=${r.nombre} user=${r.usuario_id ?? "-"} equipo=${r.equipo_id ?? "-"} R=${r.alcance_lectura} W=${r.alcance_escritura} activo=${r.activo}`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
