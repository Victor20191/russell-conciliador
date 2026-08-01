import "server-only";

import { createHash } from "node:crypto";
import type { FilaCatalogoPrevalidador, OverridePrevalidador } from "./catalogo";
import type { PrevalidadorVM } from "./calcular";

export const VERSION_ALGORITMO_PREVALIDADOR = 2;

type MontoHuella = number | string | { toString(): string };

export type FilaHuellaPrevalidador = {
  cuenta8: string;
  nombreCuenta: string;
  cuenta6Russell: string | null;
  debitos: MontoHuella;
  creditos: MontoHuella;
  saldoFinal: MontoHuella;
};

export type IdentidadBalancePrevalidador = {
  id: number;
  clienteId: number;
  periodo: string;
  periodoInicio: Date | string;
  periodoFin: Date | string;
  version: string;
};

function fechaCanonica(valor: Date | string): string {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? valor : fecha.toISOString().slice(0, 10);
}

function centavos(valor: MontoHuella): string {
  const crudo = typeof valor === "number" ? valor.toFixed(2) : valor.toString().trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(crudo);
  if (!match) throw new Error(`Monto inválido para la huella del prevalidador: ${crudo}`);
  const signo = match[1] === "-" ? "-" : "";
  const entero = (match[2].replace(/^0+(?=\d)/, "") || "0");
  const fraccionCruda = match[3] ?? "";
  let absoluto = `${entero}${fraccionCruda.padEnd(2, "0").slice(0, 2)}`.replace(/^0+(?=\d)/, "");
  // Decimal(18,2) ya llega con dos decimales. Esta suma manual conserva también
  // exactitud si una prueba aporta un tercer decimal, sin depender de BigInt ni
  // convertir una parte entera de 16 dígitos a Number.
  if ((fraccionCruda[2] ?? "0") >= "5") {
    const digitos = absoluto.split("");
    let acarreo = 1;
    for (let i = digitos.length - 1; i >= 0 && acarreo; i -= 1) {
      const siguiente = Number(digitos[i]) + acarreo;
      digitos[i] = String(siguiente % 10);
      acarreo = siguiente >= 10 ? 1 : 0;
    }
    if (acarreo) digitos.unshift("1");
    absoluto = digitos.join("");
  }
  absoluto = absoluto.padStart(3, "0");
  if (/^0+$/.test(absoluto)) return "0.00";
  return `${signo}${absoluto.slice(0, -2)}.${absoluto.slice(-2)}`;
}

/**
 * Huella determinista de todo lo que puede cambiar el resultado. La aprobación no
 * confía en un booleano persistido: vuelve a calcular esta huella y solo permanece
 * vigente mientras balance, homologación, catálogo y cuentas alternativas coincidan.
 */
export function crearHuellaPrevalidador(input: {
  balance: IdentidadBalancePrevalidador;
  filas: FilaHuellaPrevalidador[];
  catalogo: FilaCatalogoPrevalidador[];
  overrides: OverridePrevalidador[];
  /** Resultado canónico actual: una corrección del algoritmo invalida revisiones viejas. */
  prevalidador: PrevalidadorVM;
}): string {
  const filas = input.filas
    .map((fila) => ({
      cuenta8: fila.cuenta8,
      nombreCuenta: fila.nombreCuenta,
      cuenta6Russell: fila.cuenta6Russell ?? null,
      debitos: centavos(fila.debitos),
      creditos: centavos(fila.creditos),
      saldoFinal: centavos(fila.saldoFinal),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const catalogo = input.catalogo
    .map((fila) => ({
      id: fila.id,
      moduloCodigo: fila.moduloCodigo,
      moduloNombre: fila.moduloNombre,
      moduloOrden: fila.moduloOrden,
      cuentaRussell: fila.cuentaRussell,
      etiqueta: fila.etiqueta,
      baseCalculo: fila.baseCalculo,
      orden: fila.orden,
      activa: fila.activa,
    }))
    .sort((a, b) => a.id - b.id || a.moduloCodigo.localeCompare(b.moduloCodigo) || a.cuentaRussell.localeCompare(b.cuentaRussell));
  const overrides = input.overrides
    .map((fila) => ({ catalogoId: fila.catalogoId, cuentaCliente: fila.cuentaCliente }))
    .sort((a, b) => a.catalogoId - b.catalogoId || a.cuentaCliente.localeCompare(b.cuentaCliente));

  const canonico = JSON.stringify({
    algoritmo: VERSION_ALGORITMO_PREVALIDADOR,
    balance: {
      id: input.balance.id,
      clienteId: input.balance.clienteId,
      periodo: input.balance.periodo,
      periodoInicio: fechaCanonica(input.balance.periodoInicio),
      periodoFin: fechaCanonica(input.balance.periodoFin),
      version: input.balance.version,
    },
    filas,
    catalogo,
    overrides,
    resultado: input.prevalidador,
  });
  return createHash("sha256").update(canonico).digest("hex");
}
