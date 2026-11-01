// Manual de usuario — estilos de impresión (carta), con la paleta y la tipografía de la marca.
//
// Lato va incrustada (la declara el generador): sus archivos son de peso fijo y el PDF la lleva como
// texto. Una fuente variable Chrome la imprime como contornos (Type3), que algunos lectores de PDF
// dibujan mal —en Firefox «‹módulo›» salía ilegible— y que no se pueden buscar ni copiar bien.

import { COLOR, EARTH_ORANGE, FUENTE_PANTALLA, NEUTRO, SKY_BLUE, SPACE_BLUE } from "@/lib/marca/paleta";

export function estilosManual(version: string): string {
  const margen = `font-family: ${FUENTE_PANTALLA}; font-size: 7.5pt; color: ${COLOR.textoSecundario};`;
  return `
@page {
  size: Letter;
  margin: 20mm 17mm 18mm;
  @top-left { content: "Russell Conciliador · Manual de usuario"; ${margen} }
  @top-right { content: "Versión ${version}"; ${margen} }
  @bottom-right { content: "Página " counter(page) " de " counter(pages); ${margen} }
}
/* La portada va a sangre y sin encabezado ni pie. */
@page :first { margin: 0; @top-left { content: none; } @top-right { content: none; } @bottom-right { content: none; } }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: ${FUENTE_PANTALLA}; font-size: 9.6pt; line-height: 1.45; color: ${COLOR.texto}; margin: 0; }
.unidad + .unidad { break-before: page; }
p { margin: 0 0 2mm; }
ul { margin: 0; padding-left: 4.5mm; }
li { margin: 0.8mm 0; }
h1.cap { font-weight: 300; font-size: 24pt; line-height: 1.15; color: ${SPACE_BLUE[100]}; margin: 0 0 4mm; padding-bottom: 3mm; border-bottom: 2px solid ${SPACE_BLUE[100]}; }
.intro { font-size: 10.5pt; color: ${COLOR.textoFuerte}; }
h2 { font-size: 18pt; font-weight: 300; line-height: 1.2; color: ${SPACE_BLUE[100]}; margin: 0 0 2mm; break-after: avoid; }
h1.cap + .intro + section h2, h1.cap + section h2, .intro + section h2 { margin-top: 7mm; }
h3 { font-size: 10.8pt; font-weight: 700; color: ${SPACE_BLUE[100]}; margin: 5mm 0 2mm; break-after: avoid; break-inside: avoid; }
h4 { font-size: 8.4pt; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: ${COLOR.textoSecundario}; margin: 3.5mm 0 1.6mm; break-after: avoid; break-inside: avoid; display: flex; align-items: center; gap: 2mm; }
h4 .num { display: inline-flex; width: 4.8mm; height: 4.8mm; border-radius: 50%; background: ${SPACE_BLUE[100]}; color: ${NEUTRO.blanco}; font-size: 7.2pt; align-items: center; justify-content: center; letter-spacing: 0; }
.proposito { font-size: 10.4pt; color: ${COLOR.textoFuerte}; }
.antes { background: ${COLOR.infoFondo}; border-left: 3px solid ${COLOR.info}; padding: 2.5mm 4mm; border-radius: 0 2mm 2mm 0; margin: 3mm 0; break-inside: avoid; }
.antes h3 { margin-top: 0; }
.accion { border: 1px solid ${COLOR.bordeSuave}; border-radius: 2mm; padding: 2.4mm 3.5mm; margin: 0 0 2mm; break-inside: avoid; }
.accion-cab { display: flex; flex-wrap: wrap; align-items: center; gap: 2mm; }
.boton { font-weight: 700; color: ${SPACE_BLUE[100]}; font-size: 10pt; }
.que-hace { margin: 1mm 0 1.6mm; color: ${NEUTRO.k80}; }
.quien { display: flex; flex-wrap: wrap; align-items: center; gap: 1.2mm; }
.quien-etq { font-size: 6.8pt; text-transform: uppercase; letter-spacing: .08em; color: ${COLOR.textoSecundario}; font-weight: 700; margin-right: 1mm; }
.chip { display: inline-block; background: ${SPACE_BLUE[20]}; color: ${SPACE_BLUE[100]}; border-radius: 10px; padding: 0.3mm 2.4mm; font-size: 8.2pt; font-weight: 700; }
.chip-det { font-weight: 400; color: ${COLOR.textoSecundario}; }
.sin-rol { font-size: 8.2pt; color: ${COLOR.textoSecundario}; font-style: italic; }
.condiciones { list-style: none; padding-left: 0; margin-top: 1.5mm; }
.condiciones li { color: ${COLOR.texto}; font-size: 8.8pt; padding-left: 3.5mm; position: relative; }
.condiciones li::before { content: "•"; color: ${EARTH_ORANGE[100]}; font-weight: 700; position: absolute; left: 0.5mm; }
.solo { display: inline-block; border: 1px solid ${EARTH_ORANGE[60]}; color: ${COLOR.textoFuerte}; background: ${COLOR.advertenciaFondo}; border-radius: 1.2mm; font-size: 7.2pt; font-weight: 700; padding: 0 1.6mm; text-transform: none; letter-spacing: 0; line-height: 1.5; }
.mod { font-style: italic; color: ${SPACE_BLUE[100]}; font-weight: 700; }
.pestana { border-top: 1px solid ${COLOR.borde}; margin-top: 6mm; padding-top: 1mm; }
.pestana-tit { font-size: 12pt; }
.pestana-tit + .proposito { break-after: avoid; }
table.estados { border-collapse: collapse; width: 100%; margin: 1mm 0; }
table.estados tr { border-bottom: 1px solid ${NEUTRO.k10}; break-inside: avoid; }
table.estados th { text-align: left; vertical-align: top; width: 54mm; padding: 1.6mm 3mm 1.6mm 0; font-weight: normal; }
table.estados td { padding: 1.6mm 0; color: ${NEUTRO.k80}; vertical-align: top; }
.estado { display: inline-block; background: ${NEUTRO.k10}; color: ${COLOR.texto}; border-radius: 10px; padding: 0.3mm 2.4mm; font-size: 8.2pt; font-weight: 700; }
.pregunta { margin: 0 0 2.6mm; break-inside: avoid; }
.pregunta .p { font-weight: 700; color: ${COLOR.textoFuerte}; margin: 0; }
.pregunta .r { margin: 0.6mm 0 0; color: ${NEUTRO.k80}; }
.relacionado { break-before: avoid; margin-top: 5mm; padding-top: 2mm; border-top: 1px solid ${NEUTRO.k10}; font-size: 9pt; color: ${NEUTRO.k80}; }
.toc { list-style: none; padding: 0; margin: 0; }
.toc li { margin: 0; }
.toc a { display: flex; align-items: baseline; gap: 2mm; color: inherit; text-decoration: none; padding: 0.55mm 0; }
.toc-tit { flex: 1; border-bottom: 1px dotted ${NEUTRO.k40}; }
.toc-pag { min-width: 8mm; text-align: right; font-variant-numeric: tabular-nums; }
.toc-1 { font-weight: 700; color: ${SPACE_BLUE[100]}; font-size: 10.4pt; margin-top: 2.4mm !important; }
.toc-2 { padding-left: 6mm; font-size: 9.4pt; }
.ciclo { list-style: none; padding: 0; margin: 4mm 0 0; }
.ciclo li { display: flex; gap: 3.5mm; margin: 0 0 3.2mm; break-inside: avoid; }
.paso { flex: none; width: 7mm; height: 7mm; border-radius: 50%; background: ${SPACE_BLUE[100]}; color: ${NEUTRO.blanco}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 9pt; }
.paso-tit { font-weight: 700; color: ${SPACE_BLUE[100]}; font-size: 10.5pt; margin: 0.6mm 0 0; }
.donde { margin: 1.4mm 0 0; color: ${NEUTRO.k80}; }
.portada { height: 279mm; overflow: hidden; box-sizing: border-box; padding: 28mm 24mm 22mm; background: ${SPACE_BLUE[100]}; color: ${NEUTRO.blanco}; display: flex; flex-direction: column; }
.portada-cuerpo { margin: auto 0; }
.portada-sobre { text-transform: uppercase; letter-spacing: .25em; font-size: 10pt; color: ${SKY_BLUE[60]}; margin-bottom: 5mm; }
.portada h1 { font-weight: 300; font-size: 30pt; line-height: 1.15; margin: 0 0 8mm; max-width: 150mm; }
.portada-meta { font-size: 11pt; color: ${SPACE_BLUE[20]}; }
.portada-pie { font-size: 8.4pt; color: ${SPACE_BLUE[40]}; margin: 0; }
`;
}
