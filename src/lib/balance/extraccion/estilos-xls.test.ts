import { describe, expect, it } from "vitest";
import { extraerEstilosBiffXls } from "./estilos-xls";

function registro(tipo: number, datos: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + datos.length);
  out[0] = tipo & 0xff;
  out[1] = tipo >>> 8;
  out[2] = datos.length & 0xff;
  out[3] = datos.length >>> 8;
  out.set(datos, 4);
  return out;
}
const unir = (...partes: Uint8Array[]) => {
  const out = new Uint8Array(partes.reduce((t, p) => t + p.length, 0));
  let o = 0;
  for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
};
const le16 = (d: Uint8Array, o: number, v: number) => { d[o] = v & 0xff; d[o + 1] = (v >>> 8) & 0xff; };
const le32 = (d: Uint8Array, o: number, v: number) => { le16(d, o, v & 0xffff); le16(d, o + 2, (v >>> 16) & 0xffff); };

/** FONT: tamaño en puntos, negrita, cursiva, subrayado, índice de color y nombre. */
function fuente(opciones: { puntos: number; negrita?: boolean; cursiva?: boolean; subrayado?: number; icv: number; nombre: string }): Uint8Array {
  const d = new Uint8Array(16 + opciones.nombre.length);
  le16(d, 0, opciones.puntos * 20);
  le16(d, 2, opciones.cursiva ? 0x02 : 0);
  le16(d, 4, opciones.icv);
  le16(d, 6, opciones.negrita ? 700 : 400);
  d[10] = opciones.subrayado ?? 0;
  d[14] = opciones.nombre.length;
  d[15] = 0;
  for (let i = 0; i < opciones.nombre.length; i++) d[16 + i] = opciones.nombre.charCodeAt(i);
  return registro(0x0031, d);
}

/** XF (20 bytes): fuente, alineación, bordes arriba/abajo finos con color y relleno sólido. */
function xf(opciones: { fuente: number; horizontal?: number; ajustar?: boolean; bordeColor?: number; relleno?: number }): Uint8Array {
  const d = new Uint8Array(20);
  le16(d, 0, opciones.fuente);
  d[6] = (opciones.horizontal ?? 0) | (opciones.ajustar ? 0x08 : 0) | (2 << 4); // vertical abajo
  if (opciones.bordeColor != null) {
    le32(d, 10, (1 << 8) | (1 << 12)); // arriba y abajo finos
    le32(d, 14, opciones.bordeColor | (opciones.bordeColor << 7) | ((opciones.relleno != null ? 1 : 0) << 26));
  } else if (opciones.relleno != null) {
    le32(d, 14, 1 << 26);
  }
  if (opciones.relleno != null) le16(d, 18, opciones.relleno | (65 << 7));
  return registro(0x00e0, d);
}

const celda = (tipo: number, fila: number, columna: number, indiceXf: number) => {
  const d = new Uint8Array(tipo === 0x0201 ? 6 : 10);
  le16(d, 0, fila);
  le16(d, 2, columna);
  le16(d, 4, indiceXf);
  return registro(tipo, d);
};

describe("estilos de un .xls (BIFF8)", () => {
  it("resuelve fuente, relleno, bordes, alineación y la paleta del libro por celda", () => {
    const paleta = new Uint8Array(2 + 4);
    le16(paleta, 0, 1);
    paleta.set([0x12, 0x34, 0x56, 0], 2); // el color 8 del libro
    const workbook = unir(
      fuente({ puntos: 8, negrita: true, icv: 8, nombre: "Arial" }),
      fuente({ puntos: 10, cursiva: true, subrayado: 1, icv: 10, nombre: "Tahoma" }),
      registro(0x0092, paleta),
      xf({ fuente: 0, horizontal: 1, relleno: 22, bordeColor: 8 }),
      xf({ fuente: 1, horizontal: 3, ajustar: true }),
      registro(0x0809, new Uint8Array([0x00, 0x06, 0x10, 0x00])),
      celda(0x00fd, 5, 0, 0), // texto con el XF 0
      celda(0x0201, 5, 2, 0), // vacía con formato (la franja gris)
      celda(0x0203, 7, 5, 1), // número con el XF 1
      registro(0x000a, new Uint8Array()),
    );
    const e = extraerEstilosBiffXls(workbook);
    expect(e.hojas[0].get(5)?.get(0)).toBe(0);
    expect(e.hojas[0].get(5)?.get(2)).toBe(0);
    expect(e.xf[0]).toEqual({
      fuente: { nombre: "Arial", tamano: 8, negrita: true, color: "123456" },
      relleno: { patron: "solid", color: "C0C0C0" },
      bordes: { top: { estilo: "thin", color: "123456" }, bottom: { estilo: "thin", color: "123456" } },
      alineacion: { horizontal: "left" },
    });
    expect(e.xf[e.hojas[0].get(7)!.get(5)!]).toEqual({
      fuente: { nombre: "Tahoma", tamano: 10, cursiva: true, subrayado: "single", color: "FF0000" },
      alineacion: { horizontal: "right", ajustar: true },
    });
  });
});
