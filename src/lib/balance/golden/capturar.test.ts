// Capturador de fixtures golden desde el STAGING real (dev-only). NO corre en CI normal:
// está guardado por `CAPTURAR_GOLDEN`. Con la variable puesta, lee las filas crudas de cada
// lote listado, computa la huella con `snapshotVista` y escribe/actualiza el fixture JSON
// auto-contenido en `__fixtures__/`. Así el runner (`golden.test.ts`) queda sin BD.
//
//   CAPTURAR_GOLDEN=1 npx vitest run src/lib/balance/golden/capturar.test.ts
import { it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { snapshotVista, type FilaGolden, type GoldenFixture } from "./snapshot";

// Casos reales conocidos (loteId del staging) → nombre/descr del fixture. Corpus diverso que
// cubre cada punto de fragilidad. Ampliar aquí; los lotes ausentes se saltan sin fallar.
const LOTES: { slug: string; nombre: string; descripcion: string; loteId: string }[] = [
  { slug: "funadamel_tercero_sufijo", nombre: "FUNADAMEL · tercero con NIT en sufijo", descripcion: "Consolida por cuenta (SAP/BO); códigos -0-00-NIT.", loteId: "b43d7fa0-5a85-4f9f-b6a7-802238f5d5b0" },
  { slug: "acerosmapa_sucursal_inac", nombre: "ACEROS MAPA · multi-sucursal 00X + INAC", descripcion: "Totales de sucursal 00X ocultos; variantes INAC no tachadas.", loteId: "0be33f14-afa8-48e1-a6ad-456220492f0e" },
  { slug: "koen_clase_89", nombre: "KOEN PACK · cuentas de orden clase 8/9", descripcion: "Clase 8/9 ocultas (fuera de balance).", loteId: "b895f733-8033-4d48-b89f-73f87b975dc4" },
  { slug: "replast_cuenta_nit", nombre: "REPLAST · SIIGO por cuenta (Cuenta+NIT)", descripcion: "Filas NIT que repiten su cuenta, tachadas (marcarCuentaNit).", loteId: "d35e1ff7-4acc-4c02-bb2c-2cc2d8ecef0e" },
  { slug: "naturfar_negrita", nombre: "NATURFAR · por tercero (negrita)", descripcion: "Cuentas en negrita; detalle por tercero descartado en la extracción.", loteId: "96c0be13-e0e1-47b0-ba22-bc07220d6e01" },
  { slug: "quifarma_relistado", nombre: "QUIFARMA · re-listado con guiones", descripcion: "Filas 1105-05-04 redundantes tachadas; huérfanas con código pleno.", loteId: "f1c44d6b-379c-4b5b-b446-074e1e44b333" },
  { slug: "kakaraka_por_tercero", nombre: "KAKARAKA · por tercero", descripcion: "Balance abierto por tercero (NIT como fila).", loteId: "8d7d648e-3dec-4f10-a5eb-4bd6cd309d5f" },
  { slug: "karibik_por_cuenta", nombre: "KARIBIK · por cuenta (baseline)", descripcion: "Balance por cuenta estándar, sin quirks especiales.", loteId: "1e73b543-75d5-42ed-815b-b792d5303415" },
  // Casos añadidos en la sesión de fixes (descuadre=hoja, código embebido, por tercero jerárquico).
  { slug: "movimientos_planos_descuadre", nombre: "Cliente plano · solo movimientos + «descuadre»=hoja", descripcion: "Lista plana de cuentas 8 díg (sin agrupadoras); una fila «descuadre» NO agrupa las siguientes (se trata como hoja).", loteId: "465f975f-b0d2-447b-ad3e-028148c0f5fc" },
  { slug: "delta_codigo_en_nombre", nombre: "LAB. DELTA · código embebido en el nombre", descripcion: "SIESA Auxiliar NIIF vs PCGA: agrupadoras con «1105 - CAJA» en el nombre.", loteId: "2dd506eb-af33-4746-bfe1-1d115c6b789f" },
  { slug: "lasallista_por_tercero_jerarquico", nombre: "LASALLISTA · export jerárquico por tercero", descripcion: "SIESA por tercero; subcuentas + auxiliares como filas (base sin «solo hojas»).", loteId: "3f188615-1b28-4439-bc6f-a0b84be60c11" },
];

const DIR = fileURLToPath(new URL("./__fixtures__", import.meta.url));

it.skipIf(!process.env.CAPTURAR_GOLDEN)("captura fixtures golden desde el staging", async () => {
  const url = (readFileSync(".env", "utf8").match(/^DATABASE_URL=(.*)$/m) ?? [])[1].trim().replace(/^["']|["']$/g, "");
  mkdirSync(DIR, { recursive: true });
  const c = new Client({ connectionString: url });
  await c.connect();
  let capturados = 0;
  for (const lote of LOTES) {
    const r = await c.query(
      `SELECT fila_num,codigo,codigo_crudo,nombre,nivel,tipo_fila,desacoplada,omitida,padre_manual,saldo_inicial,debitos,creditos,saldo_final
       FROM balance_importacion_staging WHERE lote_id=$1 ORDER BY fila_num`, [lote.loteId]);
    if (r.rows.length === 0) { console.log(`(saltado, sin staging) ${lote.slug} ${lote.loteId}`); continue; }
    const filas: FilaGolden[] = r.rows.map((f) => ({
      filaNum: f.fila_num, codigo: f.codigo, codigoCrudo: f.codigo_crudo, nombre: f.nombre, nivel: f.nivel,
      tipoFila: f.tipo_fila, desacoplada: f.desacoplada, omitida: f.omitida ?? undefined, padreManual: f.padre_manual,
      saldoInicial: Number(f.saldo_inicial), debitos: Number(f.debitos), creditos: Number(f.creditos), saldoFinal: Number(f.saldo_final),
    }));
    const fixture: GoldenFixture = { nombre: lote.nombre, descripcion: lote.descripcion, loteId: lote.loteId, filas, esperado: snapshotVista(filas) };
    writeFileSync(fileURLToPath(new URL(`./__fixtures__/${lote.slug}.json`, import.meta.url)), JSON.stringify(fixture, null, 2) + "\n", "utf8");
    console.log(`✓ ${lote.slug}: ${filas.length} filas`);
    capturados++;
  }
  await c.end();
  expect(capturados).toBeGreaterThan(0);
});
