import { describe, expect, it } from "vitest";
import { claveSinNit, esClaveSinNit, normalizarTerceroCartera } from "./tercero-cartera";

describe("normalizarTerceroCartera: decoraciones reales de cada ERP", () => {
  it("SAP antepone el tipo de socio de negocio al número", () => {
    expect(normalizarTerceroCartera({ nit: "C900123456" })).toMatchObject({
      claveCanonica: "900123456", digitos: "900123456", original: "C900123456",
    });
    // La minúscula aparece en 6 códigos reales del archivo de IGB.
    expect(normalizarTerceroCartera({ nit: "c900123456" }).claveCanonica).toBe("900123456");
  });

  it("SIESA rellena el identificador con espacios hasta 20 caracteres", () => {
    expect(normalizarTerceroCartera({ nit: "         900352314        " })).toMatchObject({
      claveCanonica: "900352314",
    });
  });

  it("SIESA Plasmar pega la sucursal al identificador", () => {
    const r = normalizarTerceroCartera({ nit: "900123456-1 S2" });
    expect(r).toMatchObject({ claveCanonica: "900123456", dv: "1", sucursal: "2" });
  });

  it("la sucursal también viene SIN separador, pegada al número", () => {
    // Es la forma mayoritaria en el archivo real: 24 de 87 clientes. Sin esto, la clave
    // quedaba en «9002769627» —un NIT que no existe— y el tercero nunca cruzaba.
    expect(normalizarTerceroCartera({ nit: "900276962S7" })).toMatchObject({
      claveCanonica: "900276962", sucursal: "7",
    });
    expect(normalizarTerceroCartera({ nit: "811022981S20" })).toMatchObject({
      claveCanonica: "811022981", sucursal: "20",
    });
  });

  it("no recorta una S final si lo que queda no es un identificador plausible", () => {
    // Un código corto que termine en S+número conserva su forma: quitar el sufijo aquí
    // inventaría un tercero.
    expect(normalizarTerceroCartera({ nit: "AB12S3" }).sucursal).toBeNull();
  });

  it("World Office trae etiqueta y DV separado por espacios", () => {
    expect(normalizarTerceroCartera({ nit: "NIT 900404987 - 3" })).toMatchObject({
      claveCanonica: "900404987", dv: "3",
    });
  });

  it("World Office deja un guion colgante cuando la cédula no tiene DV", () => {
    expect(normalizarTerceroCartera({ nit: "CC 43169753 -" })).toMatchObject({
      claveCanonica: "43169753", dv: null,
    });
  });

  it("SIIGO trae el dígito de verificación en columna aparte", () => {
    expect(normalizarTerceroCartera({ nit: "811045607", dv: "1" })).toMatchObject({
      claveCanonica: "811045607", dv: "1",
    });
  });

  it("SIEVENSOFT marca la cartera del exterior en el propio identificador", () => {
    expect(normalizarTerceroCartera({ nit: "EXT000123456" })).toMatchObject({
      claveCanonica: "000123456", origenSugerido: "exterior",
    });
  });

  it("el EIN estadounidense conserva sus nueve dígitos y propone exterior", () => {
    // ILIMITADA lo trae con un espacio inicial; el guion NO es separador de DV.
    expect(normalizarTerceroCartera({ nit: " 99-3929293" })).toMatchObject({
      claveCanonica: "993929293", dv: null, origenSugerido: "exterior",
    });
  });

  it("el RUC ecuatoriano de 13 dígitos se conserva íntegro y propone exterior", () => {
    expect(normalizarTerceroCartera({ nit: "0992796928001" })).toMatchObject({
      claveCanonica: "0992796928001", origenSugerido: "exterior",
    });
  });
});

describe("normalizarTerceroCartera: la clave no pierde dígitos", () => {
  it("una cédula de 10 dígitos NO se trunca cuando el último no es un DV válido", () => {
    // 1128385972: el DV de 112838597 no es 2, así que los 10 dígitos son la cédula.
    expect(normalizarTerceroCartera({ nit: "1128385972" }).claveCanonica).toBe("1128385972");
  });

  it("dos cédulas vecinas de 10 dígitos NO colisionan", () => {
    const a = normalizarTerceroCartera({ nit: "1000653497" }).claveCanonica;
    const b = normalizarTerceroCartera({ nit: "1000653498" }).claveCanonica;
    expect(a).not.toBe(b);
  });

  it("un NIT de 9 dígitos con su DV pegado sí pierde el DV", () => {
    // 890904478-8 es un NIT real (Colanta); el 8 final es el DV.
    const r = normalizarTerceroCartera({ nit: "890904478-8" });
    expect(r).toMatchObject({ claveCanonica: "890904478", dv: "8" });
  });

  it("el núcleo de 9 queda disponible para la segunda pasada del cruce", () => {
    expect(normalizarTerceroCartera({ nit: "1128385972" }).nucleo).toBe("112838597");
  });
});

describe("normalizarTerceroCartera: filas sin identificador", () => {
  it("celda vacía no inventa clave", () => {
    expect(normalizarTerceroCartera({ nit: null, nombre: "CONSUMIDOR FINAL" })).toMatchObject({
      claveCanonica: null, nombre: "CONSUMIDOR FINAL",
    });
  });

  it("texto sin dígitos utilizables se trata como nombre", () => {
    expect(normalizarTerceroCartera({ nit: "Genérico" })).toMatchObject({
      claveCanonica: null, nombre: "Genérico",
    });
  });

  it("una celda con «NIT nombre» mezclados se separa con el normalizador genérico", () => {
    const r = normalizarTerceroCartera({ nit: "COMERCIALIZADORA S.A.S" });
    expect(r.claveCanonica).toBeNull();
    expect(r.nombre).toBe("COMERCIALIZADORA S.A.S");
  });

  it("la notación científica NO fabrica una clave con los dígitos del exponente", () => {
    // «9.001e+8» tiene los dígitos 90018: convertirlos en clave junta terceros que no
    // tienen nada que ver. Mejor sin tercero y reportado, para que el cargue lo detenga.
    const r = normalizarTerceroCartera({ nit: "9.001e+8" });
    expect(r.claveCanonica).toBeNull();
    expect(r.observaciones[0]).toContain("notación científica");
  });

  it("dos valores científicos distintos no colapsan en la misma clave", () => {
    const a = normalizarTerceroCartera({ nit: "9.001e+8" }).claveCanonica;
    const b = normalizarTerceroCartera({ nit: "8.001e+8" }).claveCanonica;
    expect(a).toBeNull();
    expect(b).toBeNull();
  });

  it("el nombre de su propia columna manda sobre el deducido", () => {
    expect(normalizarTerceroCartera({ nit: "900123456", nombre: "COLANTA" }).nombre).toBe("COLANTA");
  });
});

describe("claveSinNit", () => {
  it("agrupa por nombre normalizado, sin chocar con una clave de dígitos", () => {
    expect(claveSinNit("Consumidor Final")).toBe("~CONSUMIDOR FINAL");
    expect(claveSinNit("  genérico  ")).toBe("~GENERICO");
    expect(claveSinNit("")).toBeNull();
  });

  it("esClaveSinNit distingue las dos familias de clave", () => {
    expect(esClaveSinNit("~GENERICO")).toBe(true);
    expect(esClaveSinNit("900123456")).toBe(false);
  });
});
