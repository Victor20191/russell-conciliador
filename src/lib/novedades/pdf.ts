const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 48;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

type PdfBlock = {
  text: string;
  kind: "title" | "heading" | "body" | "small";
  indent?: number;
};

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower in named) return named[lower];
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

function limpiarTexto(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extraerBloques(html: string): PdfBlock[] {
  const marcado = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<h1[^>]*>/gi, "\n[[H1]]")
    .replace(/<h[2-6][^>]*>/gi, "\n[[H]]")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n[[LI]]")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|tr|table|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const bloques: PdfBlock[] = [];
  for (const raw of marcado.split(/\n+/)) {
    let line = limpiarTexto(raw);
    if (!line) continue;

    let kind: PdfBlock["kind"] = "body";
    let indent = 0;
    if (line.startsWith("[[H1]]")) {
      kind = "title";
      line = limpiarTexto(line.replace("[[H1]]", ""));
    } else if (line.startsWith("[[H]]")) {
      kind = "heading";
      line = limpiarTexto(line.replace("[[H]]", ""));
    } else if (line.startsWith("[[LI]]")) {
      kind = "body";
      indent = 14;
      line = `- ${limpiarTexto(line.replace("[[LI]]", ""))}`;
    }

    if (line) bloques.push({ text: line, kind, indent });
  }

  return bloques;
}

function normalizarTextoPdf(value: string): string {
  const safe = value
    .replace(/[¿¡]/g, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/©/g, "(c)")
    .replace(/·/g, "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  return safe;
}

function pdfLiteral(value: string): string {
  const safe = normalizarTextoPdf(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
  return `(${safe})`;
}

function pdfText(x: number, y: number, text: string, size: number, bold = false): string {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td ${pdfLiteral(text)} Tj ET\n`;
}

function wrapText(text: string, fontSize: number, width: number): string[] {
  const maxChars = Math.max(18, Math.floor(width / (fontSize * 0.48)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars));
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function blockStyle(kind: PdfBlock["kind"]) {
  if (kind === "title") return { size: 15, lineHeight: 19, bold: true, gapBefore: 8, gapAfter: 8 };
  if (kind === "heading") return { size: 12, lineHeight: 16, bold: true, gapBefore: 10, gapAfter: 4 };
  if (kind === "small") return { size: 8, lineHeight: 11, bold: false, gapBefore: 2, gapAfter: 4 };
  return { size: 10, lineHeight: 14, bold: false, gapBefore: 2, gapAfter: 6 };
}

function generarContenidosPaginas(titulo: string, html: string): string[] {
  const pages: string[] = [];
  let content = "";
  let y = PAGE_HEIGHT - MARGIN_TOP;

  const nuevaPagina = () => {
    pages.push(content);
    content = "";
    y = PAGE_HEIGHT - MARGIN_TOP;
  };

  const escribirBloque = (block: PdfBlock) => {
    const style = blockStyle(block.kind);
    const indent = block.indent ?? 0;
    const width = CONTENT_WIDTH - indent;
    const lines = wrapText(block.text, style.size, width);
    const required = style.gapBefore + lines.length * style.lineHeight + style.gapAfter;

    if (y - required < MARGIN_BOTTOM) nuevaPagina();
    y -= style.gapBefore;
    for (const line of lines) {
      content += pdfText(MARGIN_X + indent, y, line, style.size, style.bold);
      y -= style.lineHeight;
    }
    y -= style.gapAfter;
  };

  content += "0.83 0.88 0.94 rg\n";
  content += `36 ${PAGE_HEIGHT - 92} 540 1.1 re f\n`;
  content += "0 0 0 rg\n";
  escribirBloque({ text: titulo, kind: "title" });
  escribirBloque({ text: "Reporte generado desde Novedades - Russell Diagnóstico", kind: "small" });

  for (const block of extraerBloques(html)) {
    if (block.text.toLowerCase() === titulo.toLowerCase()) continue;
    escribirBloque(block);
  }

  if (content) pages.push(content);
  return pages;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return arrayBuffer;
}

function crearPdf(pages: string[]): ArrayBuffer {
  const objects: string[] = ["", ""];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds: number[] = [];

  pages.forEach((pageContent, index) => {
    const footer = pdfText(
      MARGIN_X,
      30,
      `Reporte generado desde Novedades - Russell Diagnóstico · Página ${index + 1}/${pages.length}`,
      8,
      false,
    );
    const content = `${pageContent}${footer}`;
    const contentId = addObject(`<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}endstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  });

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n");
  pdf += `\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return toArrayBuffer(Buffer.from(pdf, "ascii"));
}

export function generarPdfReporteNovedades({
  titulo,
  html,
}: {
  titulo: string;
  html: string;
}): ArrayBuffer {
  return crearPdf(generarContenidosPaginas(titulo, html));
}
