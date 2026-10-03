import { describe, expect, it } from "vitest";
import { MODULOS_IMPORT, type DescriptorModulo } from "@/lib/modulos/descriptores";
import type { SpecModulo } from "@/lib/modulos/extraccion/esquema";
import { validarSpecModulo } from "@/lib/modulos/perfil-modulo";
import { MENSAJE_SIN_FILAS, MENSAJE_TIPO_FORMATO } from "@/lib/modulos/patrones/revision-mapeo";
import {
  campoDeErrorMapeo,
  errorMapeoVigente,
  idCampoMapeo,
  idMensajeCampoMapeo,
  MENSAJE_TIPO_FORMATO_EDITOR,
  mensajeRolObligatorio,
  rolDerivado,
  type CampoErrorMapeo,
  type ContextoVigencia,
  type RolMapeo,
} from "./campo-error-mapeo";

const INV = MODULOS_IMPORT.INV;
const NOM = MODULOS_IMPORT.NOM;

/** Los roles tal como los arman las páginas del editor (`derivaDe` solo en el rol del valor). */
const rolesDe = (descriptor: DescriptorModulo): RolMapeo[] =>
  descriptor.columnas.map((c) => ({
    nombre: c.nombre,
    etiqueta: c.etiqueta,
    requerido: c.requerido,
    ...(c.nombre === descriptor.valor ? { derivaDe: descriptor.valorAlterno ?? [] } : {}),
  }));

const specInv = (extra: Partial<SpecModulo> = {}, columnas: Record<string, number> = {}): SpecModulo => ({
  hoja: "Inventario",
  filaEncabezado: 1,
  primeraFilaDatos: 2,
  columnas: { tipo: 1, referencia: 2, descripcion: 3, cantidad: 4, valorUnitario: 5, ...columnas },
  ...extra,
});

const contexto = (descriptor: DescriptorModulo, spec: SpecModulo): ContextoVigencia => ({
  spec,
  roles: rolesDe(descriptor),
  clasificadorRol: descriptor.clasificador,
  rolValor: descriptor.valor,
});

const campoValor: CampoErrorMapeo = { tipo: "rol", rol: "valorTotal" };
const campoTipo: CampoErrorMapeo = { tipo: "rol", rol: "tipo" };

describe("campoDeErrorMapeo", () => {
  const roles = rolesDe(INV);

  it("reconoce el mensaje REAL del servidor para un rol obligatorio sin mapear", () => {
    const error = validarSpecModulo(INV, specInv()); // sin «Valor total»
    expect(error).toBe("Falta la columna obligatoria «Valor total».");
    expect(campoDeErrorMapeo(error ?? "", roles)).toEqual(campoValor);
  });

  it("distingue entre varios roles obligatorios por su etiqueta", () => {
    const error = validarSpecModulo(INV, specInv({}, { tipo: 0, valorTotal: 6 }));
    expect(error).toBe("Falta la columna obligatoria «Tipo de inventario».");
    expect(campoDeErrorMapeo(error ?? "", roles)).toEqual(campoTipo);
  });

  it("reconoce el tipo de formato con el literal del servidor, también con su sufijo de aprobación", () => {
    expect(MENSAJE_TIPO_FORMATO_EDITOR).toBe(MENSAJE_TIPO_FORMATO);
    expect(campoDeErrorMapeo(MENSAJE_TIPO_FORMATO, roles)).toEqual({ tipo: "tipoFormato" });
    expect(campoDeErrorMapeo(`${MENSAJE_TIPO_FORMATO} Edita la versión antes de aprobarla.`, roles)).toEqual({ tipo: "tipoFormato" });
  });

  it("no mueve el foco con impedimentos que no son de un campo", () => {
    expect(campoDeErrorMapeo(MENSAJE_SIN_FILAS, roles)).toBeNull();
    expect(campoDeErrorMapeo("Indica el nombre exacto de la hoja del archivo.", roles)).toBeNull();
    expect(campoDeErrorMapeo("La fórmula del valor tiene una columna sin elegir.", roles)).toBeNull();
    expect(campoDeErrorMapeo("", roles)).toBeNull();
  });

  it("no reconoce roles opcionales ni etiquetas de otro módulo", () => {
    expect(campoDeErrorMapeo(mensajeRolObligatorio("Descripción"), roles)).toBeNull(); // opcional en INV
    expect(campoDeErrorMapeo(mensajeRolObligatorio("Concepto"), roles)).toBeNull(); // no es un rol de INV
    expect(campoDeErrorMapeo("Falta la columna obligatoria «Valor total»", roles)).toBeNull(); // sin el punto final
  });
});

describe("errorMapeoVigente · rol obligatorio", () => {
  it("sigue vigente mientras el rol no tenga columna", () => {
    expect(errorMapeoVigente(campoValor, contexto(INV, specInv()))).toBe(true);
  });

  it("se resuelve al elegir una columna para ESE rol, no para otro", () => {
    expect(errorMapeoVigente(campoValor, contexto(INV, specInv({}, { valorTotal: 6 })))).toBe(false);
    expect(errorMapeoVigente(campoValor, contexto(INV, specInv({}, { tipo: 0, valorTotal: 0, cantidad: 4 })))).toBe(true);
  });

  it("un rol distinto del reclamado no se ve afectado por la corrección de otro", () => {
    const spec = specInv({}, { tipo: 0, valorTotal: 6 }); // se corrigió el valor, falta el tipo
    expect(errorMapeoVigente(campoValor, contexto(INV, spec))).toBe(false);
    expect(errorMapeoVigente(campoTipo, contexto(INV, spec))).toBe(true);
  });

  it("un rol que ya no existe en el descriptor no deja un resaltado fantasma", () => {
    expect(errorMapeoVigente({ tipo: "rol", rol: "inexistente" }, contexto(INV, specInv()))).toBe(false);
  });
});

describe("errorMapeoVigente · clasificador global", () => {
  it("el modo «un único clasificador» resuelve la falta de la columna del clasificador", () => {
    const sinColumna = specInv({}, { tipo: 0, valorTotal: 6 });
    expect(errorMapeoVigente(campoTipo, contexto(INV, sinColumna))).toBe(true);
    expect(errorMapeoVigente(campoTipo, contexto(INV, { ...sinColumna, clasificadorModo: "global" }))).toBe(false);
  });

  it("los otros modos del clasificador no lo resuelven sin columna", () => {
    const sinColumna = specInv({}, { tipo: 0, valorTotal: 6 });
    for (const clasificadorModo of ["columna", "arrastrar", "seccion"] as const) {
      expect(errorMapeoVigente(campoTipo, contexto(INV, { ...sinColumna, clasificadorModo }))).toBe(true);
    }
  });

  it("el modo global solo exime al clasificador: el valor sigue exigiendo su columna", () => {
    const spec = specInv({ clasificadorModo: "global" });
    expect(errorMapeoVigente(campoValor, contexto(INV, spec))).toBe(true);
  });
});

describe("errorMapeoVigente · valor derivado", () => {
  const roles = rolesDe(NOM);
  const spec = (columnas: Record<string, number>): SpecModulo => ({ hoja: "Nómina", filaEncabezado: 1, primeraFilaDatos: 2, columnas });
  const campo: CampoErrorMapeo = { tipo: "rol", rol: NOM.valor };

  it("Nómina: el valor sale de devengo/deducción, así que mapear una de ellas lo resuelve", () => {
    expect(roles.find((r) => r.nombre === NOM.valor)?.derivaDe?.length).toBeGreaterThan(0);
    expect(errorMapeoVigente(campo, contexto(NOM, spec({})))).toBe(true);
    expect(errorMapeoVigente(campo, contexto(NOM, spec({ devengo: 5 })))).toBe(false);
    expect(errorMapeoVigente(campo, contexto(NOM, spec({ debito: 7 })))).toBe(false);
  });

  it("mapear columnas que no son de las que se deriva no lo resuelve", () => {
    expect(errorMapeoVigente(campo, contexto(NOM, spec({ cantidad: 3 })))).toBe(true);
  });

  it("rolDerivado respeta el cero como «sin mapear»", () => {
    const valor = roles.find((r) => r.nombre === NOM.valor);
    expect(valor && rolDerivado(valor, { devengo: 0, deduccion: 0 })).toBe(false);
    expect(valor && rolDerivado(valor, { deduccion: 4 })).toBe(true);
  });
});

describe("errorMapeoVigente · fórmula del valor", () => {
  it("una fórmula válida resuelve la falta de la columna del valor", () => {
    const spec = specInv({ valorFormula: [{ columna: 6, signo: "+" }, { columna: 7, signo: "-" }] });
    expect(errorMapeoVigente(campoValor, contexto(INV, spec))).toBe(false);
  });

  it("una fórmula inválida NO la resuelve (columna repetida o sin elegir)", () => {
    const repetida = specInv({ valorFormula: [{ columna: 6, signo: "+" }, { columna: 6, signo: "+" }] });
    const sinElegir = specInv({ valorFormula: [{ columna: 6, signo: "+" }, { columna: 0, signo: "+" }] });
    expect(errorMapeoVigente(campoValor, contexto(INV, repetida))).toBe(true);
    expect(errorMapeoVigente(campoValor, contexto(INV, sinElegir))).toBe(true);
  });

  it("con un solo término no es fórmula: el valor sigue sin columna", () => {
    expect(errorMapeoVigente(campoValor, contexto(INV, specInv({ valorFormula: [{ columna: 6, signo: "+" }] })))).toBe(true);
  });

  it("la fórmula solo exime al rol del valor", () => {
    const spec = specInv({ valorFormula: [{ columna: 6, signo: "+" }, { columna: 7, signo: "+" }] }, { tipo: 0 });
    expect(errorMapeoVigente(campoTipo, contexto(INV, spec))).toBe(true);
  });
});

describe("errorMapeoVigente · tipo de formato", () => {
  const campo: CampoErrorMapeo = { tipo: "tipoFormato" };
  const CAR = MODULOS_IMPORT.CAR;

  it("vigente hasta que se declara un tipo", () => {
    expect(errorMapeoVigente(campo, contexto(CAR, specInv()))).toBe(true);
    expect(errorMapeoVigente(campo, contexto(CAR, specInv({ tipoFormato: "documento" })))).toBe(false);
    expect(errorMapeoVigente(campo, contexto(CAR, specInv({ tipoFormato: "edades" })))).toBe(false);
  });
});

describe("ids por instancia", () => {
  it("son únicos por instancia, por campo y distintos para control y mensaje", () => {
    const a = idCampoMapeo("_r_1_", campoValor);
    expect(a).not.toBe(idCampoMapeo("_r_2_", campoValor));
    expect(a).not.toBe(idCampoMapeo("_r_1_", campoTipo));
    expect(a).not.toBe(idCampoMapeo("_r_1_", { tipo: "tipoFormato" }));
    expect(idMensajeCampoMapeo("_r_1_", campoValor)).not.toBe(a);
    expect(idMensajeCampoMapeo("_r_1_", campoValor).startsWith(a)).toBe(true);
  });
});
