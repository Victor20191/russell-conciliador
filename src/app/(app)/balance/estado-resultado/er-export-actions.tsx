"use client";

import { Icon } from "@/components/icons";
import { fmtNum, fmtPct } from "@/lib/format";

export type ErLine = {
  concept: string;
  current: number;
  prior: number;
  budget: number;
  bold: boolean;
  sep: boolean;
};

function varPct(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$ ${fmtNum(Math.abs(n))} M`;
}

function safeFilenamePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function utf16Hex(value: string): string {
  let hex = "FEFF";
  for (let i = 0; i < value.length; i += 1) {
    hex += value.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${hex}>`;
}

function pdfText(x: number, y: number, text: string, size = 9, bold = false): string {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td ${utf16Hex(text)} Tj ET\n`;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function buildPdf(cliente: string, periodo: string, lines: ErLine[]): Blob {
  const chunks: ErLine[][] = [];
  for (let i = 0; i < lines.length; i += 22) chunks.push(lines.slice(i, i + 22));

  const objects: string[] = ["", ""];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds: number[] = [];

  chunks.forEach((chunk, index) => {
    let content = "";
    content += pdfText(36, 555, "Estado de Resultado", 16, true);
    content += pdfText(36, 532, `${cliente} - ${periodo}`, 11, false);
    content += pdfText(760, 532, `Pag. ${index + 1}/${chunks.length}`, 8, false);
    content += pdfText(36, 500, "Concepto", 8, true);
    content += pdfText(370, 500, "2025", 8, true);
    content += pdfText(490, 500, "2024", 8, true);
    content += pdfText(610, 500, "Var %", 8, true);
    content += pdfText(710, 500, "Presup.", 8, true);

    chunk.forEach((line, rowIndex) => {
      const y = 480 - rowIndex * 18;
      const pct = varPct(line.current, line.prior);
      content += pdfText(36, y, truncate(line.concept, 54), 8, line.bold);
      content += pdfText(370, y, money(line.current), 8, line.bold);
      content += pdfText(490, y, money(line.prior), 8, line.bold);
      content += pdfText(610, y, fmtPct(pct), 8, line.bold);
      content += pdfText(710, y, money(line.budget), 8, line.bold);
    });

    const contentId = addObject(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  });

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n");
  pdf += `\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

export default function ErExportActions({
  cliente,
  periodo,
  lines,
}: {
  cliente: string;
  periodo: string;
  lines: ErLine[];
}) {
  const baseName = `estado-resultado-${safeFilenamePart(cliente)}-${safeFilenamePart(periodo)}`;

  const downloadExcel = () => {
    const rows = lines
      .map((line) => {
        const pct = varPct(line.current, line.prior);
        return `
          <tr>
            <td>${escapeHtml(line.concept)}</td>
            <td>${line.current}</td>
            <td>${line.prior}</td>
            <td>${pct == null ? "" : pct.toFixed(1)}</td>
            <td>${line.budget}</td>
          </tr>`;
      })
      .join("");
    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
            th, td { border: 1px solid #d8dde8; padding: 6px 8px; }
            th { background: #eef2f7; font-weight: 700; }
            td:not(:first-child) { text-align: right; }
          </style>
        </head>
        <body>
          <h1>Estado de Resultado</h1>
          <p>${escapeHtml(cliente)} - ${escapeHtml(periodo)}</p>
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th>2025 (M)</th>
                <th>2024 (M)</th>
                <th>Var %</th>
                <th>Presup. (M)</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>`;

    downloadBlob(new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }), `${baseName}.xls`);
  };

  const downloadPdf = () => {
    downloadBlob(buildPdf(cliente, periodo, lines), `${baseName}.pdf`);
  };

  return (
    <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-4 py-2.5">
      <button
        type="button"
        onClick={downloadExcel}
        className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
      >
        <Icon name="download" size={13} /> Excel
      </button>
      <button
        type="button"
        onClick={downloadPdf}
        className="inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-navy-600"
      >
        <Icon name="download" size={13} /> PDF
      </button>
    </div>
  );
}
