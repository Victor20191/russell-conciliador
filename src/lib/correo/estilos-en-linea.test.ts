import { describe, expect, it } from "vitest";
import {
  aplicarReglasEnLinea,
  combinarDeclaraciones,
  dividirSelectores,
  esSelectorInlineable,
  especificidad,
  parsearDeclaraciones,
  parsearHojaEstilos,
  resolverVariables,
  serializarDeclaraciones,
  type ElementoEstilizable,
} from "./estilos-en-linea";

/** Elemento de mentira: solo necesita leer y escribir el atributo `style`. */
function elemento(styleInicial = ""): ElementoEstilizable & { style: string } {
  return {
    style: styleInicial,
    getAttribute(nombre: string) {
      return nombre === "style" ? this.style || null : null;
    },
    setAttribute(nombre: string, valor: string) {
      if (nombre === "style") this.style = valor;
    },
  };
}

/** `consultar` de mentira a partir de un mapa selector → elementos. */
function consultaDe(mapa: Record<string, ElementoEstilizable[]>) {
  return (selector: string) => mapa[selector] ?? [];
}

describe("parsearDeclaraciones", () => {
  it("separa propiedad y valor, y detecta !important", () => {
    expect(parsearDeclaraciones("color:#fff; margin : 0 auto ; padding:4px!important")).toEqual([
      { propiedad: "color", valor: "#fff", importante: false },
      { propiedad: "margin", valor: "0 auto", importante: false },
      { propiedad: "padding", valor: "4px", importante: true },
    ]);
  });

  it("no parte por los separadores que van dentro de paréntesis o comillas", () => {
    const decls = parsearDeclaraciones(
      `font-family:Georgia,'Times New Roman',serif;background:linear-gradient(90deg,#fff 0%,#000 100%)`,
    );
    expect(decls).toHaveLength(2);
    expect(decls[0].valor).toBe("Georgia,'Times New Roman',serif");
    expect(decls[1].valor).toBe("linear-gradient(90deg,#fff 0%,#000 100%)");
  });

  it("ignora trozos sin valor o que son bloques anidados", () => {
    expect(parsearDeclaraciones("color:;;@media print{a{color:red}}")).toEqual([]);
  });
});

describe("dividirSelectores", () => {
  it("corta por comas de nivel superior sin romper las de :not() o :is()", () => {
    expect(dividirSelectores("h1, h2 , .titulo")).toEqual(["h1", "h2", ".titulo"]);
    expect(dividirSelectores("li:not(.a, .b), p")).toEqual(["li:not(.a, .b)", "p"]);
  });
});

describe("especificidad", () => {
  it("ordena id > clase > elemento", () => {
    expect(especificidad("#portada")).toBeGreaterThan(especificidad(".tarjeta"));
    expect(especificidad(".tarjeta")).toBeGreaterThan(especificidad("h2"));
    expect(especificidad(".tarjeta .titulo")).toBeGreaterThan(especificidad(".tarjeta"));
    expect(especificidad("section h2")).toBeGreaterThan(especificidad("h2"));
  });
});

describe("esSelectorInlineable", () => {
  it("acepta selectores estructurales", () => {
    for (const sel of ["h1", ".kpi", "#portada", "table thead tr", "li:first-child", ".a > .b"]) {
      expect(esSelectorInlineable(sel)).toBe(true);
    }
  });

  it("rechaza estados y pseudo-elementos que no existen en línea", () => {
    for (const sel of ["a:hover", ".kpi::before", "input:focus", "p::first-line"]) {
      expect(esSelectorInlineable(sel)).toBe(false);
    }
  });
});

describe("parsearHojaEstilos", () => {
  it("separa lo inlineable de lo que no lo es y conserva el resto", () => {
    const { reglas, cssRestante } = parsearHojaEstilos(`
      /* comentario */
      h1 { color: #0e1721; font-family: Georgia, serif }
      a:hover { color: red }
      @media print { .tarjeta { break-inside: avoid } }
    `);

    expect(reglas.map((r) => r.selector)).toEqual(["h1"]);
    expect(reglas[0].declaraciones).toHaveLength(2);
    expect(cssRestante).toContain("a:hover");
    expect(cssRestante).toContain("@media print");
    expect(cssRestante).not.toContain("h1{");
  });

  it("desdobla los selectores separados por coma en reglas independientes", () => {
    const { reglas } = parsearHojaEstilos("h1, h2, .titulo { margin: 0 }");
    expect(reglas.map((r) => r.selector)).toEqual(["h1", "h2", ".titulo"]);
    expect(reglas.map((r) => r.orden)).toEqual([0, 1, 2]);
  });

  it("recoge las variables CSS y no las emite como regla", () => {
    const { reglas, variables } = parsearHojaEstilos(":root { --navy: #142b4a }");
    expect(reglas).toHaveLength(0);
    expect(variables.get("--navy")).toBe("#142b4a");
  });

  it("no se confunde con las llaves anidadas de una at-rule", () => {
    const { reglas, cssRestante } = parsearHojaEstilos(
      "@media (max-width:600px){ .kpi{width:100%} } p{color:#333}",
    );
    expect(reglas.map((r) => r.selector)).toEqual(["p"]);
    expect(cssRestante).toContain("@media (max-width:600px)");
  });
});

describe("resolverVariables", () => {
  const vars = new Map([
    ["--navy", "#142b4a"],
    ["--acento", "var(--navy)"],
  ]);

  it("sustituye la variable por su valor, incluso encadenada", () => {
    expect(resolverVariables("color:var(--navy)".split(":")[1], vars)).toBe("#142b4a");
    expect(resolverVariables("var(--acento)", vars)).toBe("#142b4a");
    expect(resolverVariables("1px solid var(--navy)", vars)).toBe("1px solid #142b4a");
  });

  it("usa el valor alterno cuando la variable no existe", () => {
    expect(resolverVariables("var(--no-existe, #000)", vars)).toBe("#000");
  });

  it("devuelve null cuando no hay forma de resolverla", () => {
    expect(resolverVariables("var(--no-existe)", vars)).toBeNull();
  });
});

describe("combinarDeclaraciones", () => {
  const d = (propiedad: string, valor: string, importante = false) => ({ propiedad, valor, importante });

  it("gana la última declaración de la hoja", () => {
    expect(combinarDeclaraciones([d("color", "#111"), d("color", "#222")], [])).toEqual([
      d("color", "#222"),
    ]);
  });

  it("el style en línea vence a la hoja", () => {
    expect(combinarDeclaraciones([d("color", "#111")], [d("color", "#999")])).toEqual([
      d("color", "#999"),
    ]);
  });

  it("un !important de la hoja vence al style en línea normal", () => {
    expect(combinarDeclaraciones([d("color", "#111", true)], [d("color", "#999")])).toEqual([
      d("color", "#111", true),
    ]);
  });
});

describe("serializarDeclaraciones", () => {
  it("emite un style válido y descarta las variables", () => {
    const texto = serializarDeclaraciones([
      { propiedad: "--x", valor: "#fff", importante: false },
      { propiedad: "color", valor: "#142b4a", importante: false },
      { propiedad: "margin", valor: "0", importante: true },
    ]);
    expect(texto).toBe("color:#142b4a;margin:0 !important");
  });

  it("omite la declaración cuya var() no se puede resolver", () => {
    const texto = serializarDeclaraciones(
      [
        { propiedad: "color", valor: "var(--fantasma)", importante: false },
        { propiedad: "padding", valor: "8px", importante: false },
      ],
      new Map(),
    );
    expect(texto).toBe("padding:8px");
  });
});

describe("aplicarReglasEnLinea", () => {
  it("vuelca la cascada al atributo style respetando la especificidad", () => {
    const h1 = elemento();
    const { reglas } = parsearHojaEstilos(
      "h1 { color: #111; font-size: 20px } .titulo { color: #999 } #portada { color: #142b4a }",
    );

    aplicarReglasEnLinea(
      reglas,
      consultaDe({ h1: [h1], ".titulo": [h1], "#portada": [h1] }),
    );

    expect(h1.style).toContain("color:#142b4a");
    expect(h1.style).toContain("font-size:20px");
    expect(h1.style).not.toContain("#999");
  });

  it("conserva y prioriza el style que ya traía el elemento", () => {
    const celda = elemento("padding:0.62rem 0.7rem;color:#1a2330");
    const { reglas } = parsearHojaEstilos("td { color: #999; border-bottom: 1px solid #e7eaef }");

    aplicarReglasEnLinea(reglas, consultaDe({ td: [celda], "[style]": [celda] }));

    expect(celda.style).toContain("color:#1a2330");
    expect(celda.style).toContain("padding:0.62rem 0.7rem");
    expect(celda.style).toContain("border-bottom:1px solid #e7eaef");
  });

  it("resuelve las variables también en los elementos que ninguna regla toca", () => {
    const suelto = elemento("color:var(--navy)");
    const { reglas, variables } = parsearHojaEstilos(":root { --navy: #142b4a }");

    aplicarReglasEnLinea(reglas, consultaDe({ "[style]": [suelto] }), variables);

    expect(suelto.style).toBe("color:#142b4a");
  });

  it("ignora los selectores que el navegador rechaza sin perder los demás", () => {
    const p = elemento();
    const { reglas } = parsearHojaEstilos("p:invalido( { color: red } p { margin: 0 }");

    const consultar = (selector: string) => {
      if (selector === "p") return [p];
      throw new SyntaxError("selector inválido");
    };

    expect(() => aplicarReglasEnLinea(reglas, consultar)).not.toThrow();
    expect(p.style).toBe("margin:0");
  });
});
