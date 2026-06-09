# -*- coding: utf-8 -*-
"""
Genera la guía PDF: "Flujo de configuración: Clientes, Equipos, Cartera,
Usuarios y Permisos por rol" para la plataforma Russell Bedford (russell-lfm).
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    KeepTogether, FrameBreak, NextPageTemplate, PageBreak, Flowable, ListFlowable,
    ListItem, Image as RLImage,
)
from reportlab.lib.utils import ImageReader
import os

SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_screenshots")

# ----------------------------------------------------------------------------
# Paleta
# ----------------------------------------------------------------------------
NAVY   = colors.HexColor("#16243A")   # barra lateral oscura
NAVY2  = colors.HexColor("#22344E")
BLUE   = colors.HexColor("#2F6DB5")   # azul Russell
ACCENT = colors.HexColor("#DD5A33")   # naranja de los recuadros del menú
INK    = colors.HexColor("#1E2A38")
MUTED  = colors.HexColor("#5C6B7A")
FAINT  = colors.HexColor("#8A97A5")
LIGHT  = colors.HexColor("#F3F6FA")
PANEL  = colors.HexColor("#EAF0F7")
BORDER = colors.HexColor("#D5DDE6")
OK     = colors.HexColor("#2E7D52")
WARN   = colors.HexColor("#B5670B")
WHITE  = colors.white

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm

# ----------------------------------------------------------------------------
# Estilos
# ----------------------------------------------------------------------------
ss = getSampleStyleSheet()

def style(name, **kw):
    return ParagraphStyle(name, **kw)

H1 = style("H1", fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=NAVY, spaceBefore=2, spaceAfter=6)
H2 = style("H2", fontName="Helvetica-Bold", fontSize=13.5, leading=17, textColor=NAVY, spaceBefore=14, spaceAfter=4)
H3 = style("H3", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=BLUE, spaceBefore=8, spaceAfter=3)
BODY = style("BODY", fontName="Helvetica", fontSize=9.6, leading=14.5, textColor=INK, alignment=TA_JUSTIFY, spaceAfter=5)
BODYL = style("BODYL", parent=BODY, alignment=TA_LEFT)
SMALL = style("SMALL", fontName="Helvetica", fontSize=8.4, leading=11.5, textColor=MUTED)
TINY = style("TINY", fontName="Helvetica", fontSize=7.6, leading=9.5, textColor=FAINT)
KICKER = style("KICKER", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=ACCENT, spaceAfter=2)
LEAD = style("LEAD", fontName="Helvetica", fontSize=10.5, leading=15.5, textColor=MUTED, alignment=TA_LEFT, spaceAfter=4)

# Estilos para tablas (texto dentro de celdas)
CELL = style("CELL", fontName="Helvetica", fontSize=8.6, leading=11.2, textColor=INK)
CELLB = style("CELLB", fontName="Helvetica-Bold", fontSize=8.6, leading=11.2, textColor=INK)
CELLW = style("CELLW", fontName="Helvetica-Bold", fontSize=8.8, leading=11.5, textColor=WHITE)
CODE = style("CODE", fontName="Courier-Bold", fontSize=8.3, leading=11, textColor=ACCENT)
CELLMUT = style("CELLMUT", fontName="Helvetica", fontSize=8.2, leading=10.8, textColor=MUTED)

# Cover
COVER_KICK = style("CK", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=ACCENT, alignment=TA_LEFT)
COVER_TITLE = style("CT", fontName="Helvetica-Bold", fontSize=30, leading=34, textColor=WHITE, alignment=TA_LEFT)
COVER_SUB = style("CSB", fontName="Helvetica", fontSize=12.5, leading=18, textColor=colors.HexColor("#C7D3E0"), alignment=TA_LEFT)
COVER_META = style("CM", fontName="Helvetica", fontSize=9, leading=14, textColor=colors.HexColor("#9FB0C2"), alignment=TA_LEFT)


# ----------------------------------------------------------------------------
# Flowables a medida
# ----------------------------------------------------------------------------
class HRule(Flowable):
    def __init__(self, width, color=BORDER, thickness=0.8, pad=0):
        super().__init__()
        self.width = width; self.color = color; self.thickness = thickness; self.pad = pad
    def wrap(self, *a):
        return (self.width, self.thickness + 2 * self.pad)
    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.pad, self.width, self.pad)


def callout(title, body, tone="info", width=None):
    """Recuadro destacado con franja de color a la izquierda."""
    tones = {
        "info": (PANEL, BLUE, BLUE),
        "key":  (colors.HexColor("#FBEFE9"), ACCENT, ACCENT),
        "ok":   (colors.HexColor("#E9F4EE"), OK, OK),
        "warn": (colors.HexColor("#FBF3E4"), WARN, WARN),
    }
    bg, bar, tc = tones[tone]
    w = width or (PAGE_W - 2 * MARGIN)
    t_style = style("co_t", fontName="Helvetica-Bold", fontSize=9.4, leading=12.5, textColor=tc, spaceAfter=2)
    b_style = style("co_b", fontName="Helvetica", fontSize=9, leading=13, textColor=INK)
    inner = [Paragraph(title, t_style)]
    if body:
        inner.append(Paragraph(body, b_style))
    cell = Table([[inner]], colWidths=[w - 6])
    cell.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    outer = Table([[cell]], colWidths=[w])
    outer.setStyle(TableStyle([
        ("LINEBEFORE", (0, 0), (0, -1), 3.2, bar),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return outer


def figure(filename, caption, width=None):
    """Captura de pantalla enmarcada con leyenda debajo."""
    w = width or (PAGE_W - 2 * MARGIN)
    path = os.path.join(SHOTS, filename)
    ir = ImageReader(path)
    iw, ih = ir.getSize()
    inner_w = w - 8
    disp_h = inner_w * ih / iw
    img = RLImage(path, width=inner_w, height=disp_h)
    framed = Table([[img]], colWidths=[w])
    framed.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
    ]))
    cap = Paragraph(
        f'<font color="#DD5A33">▸</font> {caption}',
        style("figcap", fontName="Helvetica-Oblique", fontSize=8, leading=11,
              textColor=MUTED, spaceBefore=4, spaceAfter=10))
    return KeepTogether([framed, cap])


def arrow(width, label=None):
    """Flecha vertical hacia abajo entre tarjetas del diagrama."""
    txt = "▼"
    p = Paragraph(f'<font color="#DD5A33" size="11">{txt}</font>', style("ar", alignment=TA_CENTER))
    lbl = Paragraph(label, style("arl", fontName="Helvetica-Oblique", fontSize=7.6, textColor=MUTED, alignment=TA_CENTER)) if label else ""
    t = Table([[p], [lbl]] if label else [[p]], colWidths=[width])
    t.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    return t


def step_card(num, route, title, who, perm, body, width):
    """Tarjeta de paso del flujo recomendado."""
    numcell = Paragraph(f'<font color="white" size="15"><b>{num}</b></font>', style("num", alignment=TA_CENTER))
    head = Paragraph(f'<b>{title}</b>', style("sc_t", fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=NAVY))
    route_p = Paragraph(f'<font color="#DD5A33"><b>{route}</b></font>', style("sc_r", fontSize=8.2, leading=10))
    meta = Paragraph(
        f'<font color="#5C6B7A">Quién:</font> <b>{who}</b>'
        f'<br/><font color="#5C6B7A">Permiso:</font> <font face="Courier-Bold" color="#2F6DB5">{perm}</font>',
        style("sc_m", fontSize=8, leading=11, textColor=INK))
    body_p = Paragraph(body, style("sc_b", fontSize=8.8, leading=12.4, textColor=INK))

    right = Table([[head], [route_p], [Spacer(1, 3)], [body_p], [Spacer(1, 3)], [meta]],
                  colWidths=[width - 16 * mm - 22])
    right.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    card = Table([[numcell, right]], colWidths=[16 * mm, width - 16 * mm])
    card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), NAVY),
        ("BACKGROUND", (1, 0), (1, -1), WHITE),
        ("VALIGN", (0, 0), (0, -1), "MIDDLE"),
        ("VALIGN", (1, 0), (1, -1), "TOP"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("LEFTPADDING", (1, 0), (1, -1), 11),
        ("RIGHTPADDING", (1, 0), (1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("BOX", (0, 0), (-1, -1), 0.8, BORDER),
        ("LINEAFTER", (0, 0), (0, -1), 0, NAVY),
    ]))
    return card


# ----------------------------------------------------------------------------
# Documento con plantillas de página (cover + contenido)
# ----------------------------------------------------------------------------
def on_content(canvas, doc):
    canvas.saveState()
    # encabezado
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H - 12 * mm, PAGE_W, 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(ACCENT)
    canvas.rect(0, PAGE_H - 12 * mm, 6 * mm, 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.drawString(MARGIN, PAGE_H - 7.8 * mm, "RUSSELL BEDFORD · russell-lfm")
    canvas.setFont("Helvetica", 7.6)
    canvas.setFillColor(colors.HexColor("#B9C6D6"))
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 7.8 * mm, "Flujo de configuración · Control de acceso (RBAC)")
    # pie
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, 12 * mm, PAGE_W - MARGIN, 12 * mm)
    canvas.setFillColor(FAINT)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(MARGIN, 8 * mm, "Guía interna · generada el 9-jun-2026")
    canvas.drawRightString(PAGE_W - MARGIN, 8 * mm, "Página %d" % doc.page)
    canvas.restoreState()


def on_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # banda lateral acento
    canvas.setFillColor(ACCENT)
    canvas.rect(0, 0, 8 * mm, PAGE_H, fill=1, stroke=0)
    # bloque diagonal sutil
    canvas.setFillColor(NAVY2)
    canvas.rect(0, PAGE_H * 0.62, PAGE_W, PAGE_H * 0.012, fill=1, stroke=0)
    # logo circular
    cx, cy = MARGIN + 7 * mm, PAGE_H - 30 * mm
    canvas.setFillColor(BLUE)
    canvas.circle(cx, cy, 7 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawCentredString(cx, cy - 4, "RB")
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawString(cx + 12 * mm, cy + 1, "Russell Bedford")
    canvas.setFillColor(colors.HexColor("#9FB0C2"))
    canvas.setFont("Helvetica", 8.5)
    canvas.drawString(cx + 12 * mm, cy - 9, "Plataforma de Revisoría Fiscal · russell-lfm")
    canvas.restoreState()


frame_content = Frame(MARGIN, 14 * mm, PAGE_W - 2 * MARGIN, PAGE_H - 14 * mm - 16 * mm, id="content")
frame_cover = Frame(MARGIN, 30 * mm, PAGE_W - 2 * MARGIN, PAGE_H - 95 * mm, id="cover")

doc = BaseDocTemplate(
    "/Users/vicbook/Documents/Xentria-apps/Russell Diagnostico/russell-lfm/Flujo-Configuracion-RBAC.pdf",
    pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=16 * mm, bottomMargin=16 * mm,
    title="Flujo de configuración RBAC — russell-lfm",
    author="Russell Bedford · russell-lfm",
    subject="Clientes, Equipos, Cartera, Usuarios y Permisos por rol",
)
doc.addPageTemplates([
    PageTemplate(id="cover", frames=[frame_cover], onPage=on_cover),
    PageTemplate(id="content", frames=[frame_content], onPage=on_content),
])

CW = PAGE_W - 2 * MARGIN  # ancho útil
story = []

# =========================================================================
# PORTADA
# =========================================================================
story.append(Spacer(1, 6 * mm))
story.append(Paragraph("GUÍA DE CONFIGURACIÓN", COVER_KICK))
story.append(Spacer(1, 3 * mm))
story.append(Paragraph("Flujo correcto para<br/>configurar accesos", COVER_TITLE))
story.append(Spacer(1, 5 * mm))
story.append(Paragraph(
    "Cómo crear un cliente y dejarlo operativo: del permiso por rol "
    "al equipo y la cartera, paso a paso.", COVER_SUB))
story.append(Spacer(1, 10 * mm))
story.append(Paragraph(
    "Cubre las cinco rutas de <b>Configuración</b>:<br/>"
    "Clientes · Equipos · Cartera clientes · Usuarios · Permisos por rol", COVER_META))
story.append(Spacer(1, 6 * mm))
story.append(Paragraph(
    "Modelo de autorización basado en la <b>matriz rol×permiso</b> + "
    "<b>alcance por cartera</b>.", COVER_META))

story.append(NextPageTemplate("content"))
story.append(PageBreak())

# =========================================================================
# 1. IDEA CLAVE
# =========================================================================
story.append(Paragraph("La idea clave (léela primero)", H1))
story.append(Paragraph(
    "Antes del paso a paso, conviene entender el modelo mental. En esta plataforma "
    "el acceso se decide en <b>dos capas independientes</b> que se combinan. Confundirlas "
    "es el error más común al configurar.", LEAD))
story.append(Spacer(1, 4))

two = [[
    callout(
        "Capa 1 — Permiso por ROL (qué puede hacer)",
        "Es global, no depende del cliente. La <b>matriz rol×permiso</b> dice qué tipo de "
        "acción puede ejecutar cada rol: ver, comentar, operar o administrar, módulo por "
        "módulo. Se gobierna desde <b>Permisos por rol</b>.", tone="info", width=(CW - 6 * mm) / 2),
    callout(
        "Capa 2 — Alcance por CLIENTE (sobre quién)",
        "Es por dato. La <b>cartera</b> (asignación cliente↔equipo) dice sobre qué clientes "
        "actúa el usuario, con alcance de <b>consulta</b> y/u <b>operación</b>. Se gobierna desde "
        "<b>Equipos</b> y <b>Cartera clientes</b>.", tone="key", width=(CW - 6 * mm) / 2),
]]
t = Table(two, colWidths=[(CW - 6 * mm) / 2, (CW - 6 * mm) / 2], hAlign="LEFT")
t.setStyle(TableStyle([("LEFTPADDING", (0,0),(-1,-1),0), ("RIGHTPADDING",(0,0),(0,0),6*mm),
                       ("RIGHTPADDING",(1,0),(1,0),0), ("VALIGN",(0,0),(-1,-1),"TOP"),
                       ("TOPPADDING",(0,0),(-1,-1),0), ("BOTTOMPADDING",(0,0),(-1,-1),0)]))
story.append(t)
story.append(Spacer(1, 8))
story.append(callout(
    "Una acción sobre un cliente solo se permite si se cumplen LAS DOS capas",
    "Para crear/editar/ejecutar sobre un cliente, el sistema exige <b>permiso de rol</b> "
    "(p. ej. <font face=\"Courier-Bold\">conciliaciones:ejecutar</font>) <b>Y</b> "
    "<b>alcance de operación</b> sobre ese cliente vía cartera. Si falta cualquiera de las dos, "
    "se deniega (regla <i>fail-closed</i>: ante la duda, no abre acceso).", tone="ok"))
story.append(Spacer(1, 8))
story.append(callout(
    "No se asigna un cliente «a un rol»",
    "El cliente NO se conecta a un rol. El cliente se asigna a un <b>equipo</b> (su cartera); "
    "los usuarios pertenecen a equipos y cada usuario tiene su rol. La cadena real es: "
    "<b>cliente → cartera (equipo) → integrantes (usuarios con su rol)</b>. El rol define el "
    "<i>tipo</i> de acción; la cartera define <i>sobre qué clientes</i>.", tone="warn"))

# Quién opera de verdad
story.append(Paragraph("Quién opera y quién consulta", H3))
story.append(Paragraph(
    "El modelo NO es jerárquico por rango. Aunque Socio y Gerente tengan rango alto, son roles "
    "de <b>consulta</b>. El único rol <b>operativo</b> (el único que carga datos, ejecuta "
    "conciliaciones y elabora papeles de trabajo) es el <b>Staff</b>. Por eso, aunque una cartera "
    "tenga marcado «operación», ese alcance solo surte efecto para el Staff: los demás roles, "
    "aun teniéndolo, no tienen el permiso de escritura.", BODY))

story.append(PageBreak())

# =========================================================================
# 2. LAS CINCO RUTAS
# =========================================================================
story.append(Paragraph("Las cinco rutas de Configuración", H1))
story.append(Paragraph(
    "Cada recuadro del menú lateral cumple un papel distinto en el flujo. Esta tabla las resume; "
    "el resto del documento las desarrolla en orden de uso.", LEAD))
story.append(Spacer(1, 4))

def cellp(txt, st=CELL):
    return Paragraph(txt, st)

rows = [
    [cellp("Ruta", CELLW), cellp("Para qué sirve", CELLW), cellp("Tabla / dato", CELLW), cellp("Permiso", CELLW)],
    [cellp("<b>Permisos por rol</b><br/><font size=7 color='#5C6B7A'>/config/permisos</font>"),
     cellp("Define <b>qué puede hacer cada rol</b> por módulo (Ninguno / Ver / Comentar / Operar / Administrar). Es la matriz."),
     cellp("roles_permisos<br/>(rol×permiso)"),
     cellp("roles:configurar", CODE)],
    [cellp("<b>Usuarios</b><br/><font size=7 color='#5C6B7A'>/config/usuarios</font>"),
     cellp("Crea las personas y les asigna <b>un rol</b> (Socio, Gerente, Senior, Staff, Administrador)."),
     cellp("usuarios"),
     cellp("usuarios:crear", CODE)],
    [cellp("<b>Clientes</b><br/><font size=7 color='#5C6B7A'>/config/clientes</font>"),
     cellp("Crea el cliente (código automático, NIT, ERP, sector) y <b>parametriza sus módulos</b>."),
     cellp("clientes<br/>clientes_modulos"),
     cellp("clientes:crear / configurar", CODE)],
    [cellp("<b>Equipos</b><br/><font size=7 color='#5C6B7A'>/config/equipos</font>"),
     cellp("Crea el equipo y <b>agrega sus integrantes</b> (qué usuarios lo forman, con vigencia)."),
     cellp("equipos<br/>equipos_integrantes"),
     cellp("equipos:crear / asignar", CODE)],
    [cellp("<b>Cartera clientes</b><br/><font size=7 color='#5C6B7A'>/config/carteras</font>"),
     cellp("Asigna <b>qué clientes atiende cada equipo</b> y con qué alcance (consulta / operación) y vigencia."),
     cellp("asignaciones_cliente"),
     cellp("equipos:asignar", CODE)],
]
tbl = Table(rows, colWidths=[34*mm, CW-34*mm-30*mm-30*mm, 30*mm, 30*mm])
tbl.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), NAVY),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT]),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 7),
    ("RIGHTPADDING", (0,0), (-1,-1), 7),
    ("TOPPADDING", (0,0), (-1,-1), 6),
    ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ("LINEBELOW", (0,0), (-1,-1), 0.5, BORDER),
    ("BOX", (0,0), (-1,-1), 0.8, BORDER),
    ("LINEAFTER", (0,0), (-2,-1), 0.5, BORDER),
]))
story.append(tbl)
story.append(Spacer(1, 6))
story.append(Paragraph(
    "<font color='#8A97A5' size='8'>Nota: «Cartera clientes» y «Equipos» trabajan sobre la MISMA entidad "
    "(un equipo). Equipos gestiona <i>quién</i> está dentro; Cartera gestiona <i>qué clientes</i> atiende. "
    "Crear una cartera, internamente, crea un equipo.</font>", SMALL))

story.append(PageBreak())

# =========================================================================
# 3. EL FLUJO RECOMENDADO (corazón del documento)
# =========================================================================
story.append(Paragraph("El flujo recomendado, paso a paso", H1))
story.append(Paragraph(
    "Este es el orden correcto para dejar un cliente operativo desde cero. Los pasos 1 y 2 "
    "suelen hacerse una sola vez (al montar la plataforma); los pasos 3 a 6 se repiten por cada "
    "cliente nuevo.", LEAD))
story.append(Spacer(1, 6))

steps = [
    ("1", "/config/permisos · Permisos por rol",
     "Definir qué puede hacer cada rol",
     "Administrador / Superadministrador", "roles:configurar",
     "Una sola vez (setup). Ajusta la <b>matriz rol×módulo</b> con un nivel por celda. Normalmente ya viene "
     "sembrada por defecto (Staff = Operar; Senior = Administrar configuración + Revisar; "
     "Gerente/Socio = Ver/Comentar). Solo entras aquí para afinar."),
    ("2", "/config/usuarios · Usuarios",
     "Crear los usuarios y darles su rol",
     "Administrador", "usuarios:crear",
     "Crea cada persona con correo, nombre, iniciales y <b>un rol</b>. El rol determina el <i>tipo</i> de "
     "acción que podrá hacer en cualquier cliente al que luego tenga alcance. El usuario nace con "
     "«cambiar contraseña» activado."),
    ("3", "/config/clientes · Clientes",
     "Crear el cliente y parametrizar sus módulos",
     "Senior / Administrador", "clientes:crear",
     "Registra el cliente: el <b>código se asigna solo</b> (C-1042, C-1043…); tú capturas NIT, ERP y sector. "
     "Luego marca el estado de cada módulo (configurado / pendiente) en la misma pantalla."),
    ("4", "/config/equipos · Equipos",
     "Crear el equipo y agregar integrantes",
     "Senior / Administrador", "equipos:crear · equipos:asignar",
     "Crea el equipo con un <b>líder</b> (el Senior responsable, opcional) y agrega a sus integrantes "
     "(los usuarios del paso 2): el Staff que operará, el Senior que revisa, etc. Cada integrante puede "
     "llevar <b>vigencia</b> (vigente hasta…) para asignaciones temporales."),
    ("5", "/config/carteras · Cartera clientes",
     "Asignar el cliente a la cartera del equipo",
     "Senior / Administrador", "equipos:asignar",
     "Elige el equipo, selecciona uno o varios <b>clientes</b> (los del paso 3) y marca el <b>alcance</b>: "
     "«Consulta» (ver) y/o «Operación» (cargar/ejecutar). Aquí el equipo ADQUIERE alcance sobre esos "
     "clientes. Puedes fijar vigencia y motivo."),
]
for i, (n, route, title, who, perm, body) in enumerate(steps):
    story.append(step_card(n, route, title, who, perm, body, CW))
    story.append(arrow(CW))

# Paso final / resultado
story.append(step_card(
    "✓", "Resultado — listo para trabajar", "El cliente queda operativo según cada rol",
    "Toda la plataforma", "(combinación automática)",
    "Al abrir el cliente: el <b>Staff</b> del equipo (permiso Operar + alcance de Operación) puede cargar "
    "balances, ejecutar conciliaciones y enviar requerimientos SOLO en ese cliente. El "
    "<b>Senior/Gerente/Socio</b> del equipo (permiso Ver/Comentar + alcance de Consulta) consulta y "
    "comenta, pero no opera.", CW))

story.append(Spacer(1, 12))

# =========================================================================
# 4. DIAGRAMA DE RELACIONES
# =========================================================================
story.append(Paragraph("Cómo se conectan los datos", H1))
story.append(Paragraph(
    "Visto desde las tablas, así es como una acción sobre un cliente termina autorizada (o no):", LEAD))
story.append(Spacer(1, 6))

# Bloques del diagrama de entidades
def ebox(title, sub, bg, tc=WHITE, w=42*mm):
    p = [Paragraph(f'<b>{title}</b>', style("eb_t", fontName="Helvetica-Bold", fontSize=9, leading=11, textColor=tc, alignment=TA_CENTER))]
    if sub:
        p.append(Paragraph(sub, style("eb_s", fontSize=7, leading=8.5, textColor=tc, alignment=TA_CENTER)))
    t = Table([[x] for x in p], colWidths=[w])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("BOX", (0,0), (-1,-1), 0.8, bg),
        ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING", (0,0), (-1,-1), 4), ("RIGHTPADDING", (0,0), (-1,-1), 4),
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
    ]))
    return t

# fila superior: Usuario(rol) — pertenece a — Equipo — atiende — Cliente
hgap = 14 * mm
ew = (CW - 2 * hgap) / 3
diag = [[
    ebox("USUARIO", "tiene un ROL<br/>(Staff, Senior…)", NAVY, w=ew),
    Paragraph('<font color="#DD5A33" size="13"><b>&rarr;</b></font><br/><font size="6.5" color="#5C6B7A">miembro</font>', style("a1", alignment=TA_CENTER)),
    ebox("EQUIPO", "equipos_integrantes", BLUE, w=ew),
    Paragraph('<font color="#DD5A33" size="13"><b>&rarr;</b></font><br/><font size="6.5" color="#5C6B7A">cartera</font>', style("a2", alignment=TA_CENTER)),
    ebox("CLIENTE", "asignaciones_cliente<br/>(consulta / operación)", ACCENT, w=ew),
]]
dt = Table(diag, colWidths=[ew, hgap, ew, hgap, ew])
dt.setStyle(TableStyle([
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("ALIGN", (1,0), (1,0), "CENTER"), ("ALIGN", (3,0), (3,0), "CENTER"),
    ("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),
    ("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),0),
]))
story.append(dt)
story.append(Spacer(1, 9))

# decisión final
story.append(callout(
    "La decisión final (función puedeSobreCliente)",
    "<font face=\"Courier-Bold\" color=\"#2F6DB5\">permitido = tienePermiso(rol, acción) Y alcanzaCliente(cartera, modo)</font><br/>"
    "El <b>modo</b> lo deduce la acción: crear / editar / eliminar / ejecutar exigen alcance de "
    "<b>operación</b> (writeScope); ver / comentar exigen alcance de <b>consulta</b> (readScope).", tone="info"))
story.append(Spacer(1, 8))

# Tabla: combinación rol x alcance
story.append(Paragraph("Qué pasa según el rol y el alcance de la cartera", H3))
m = [
    [cellp("Rol del usuario", CELLW), cellp("Permiso de rol", CELLW), cellp("Con alcance «Consulta»", CELLW), cellp("Con alcance «Operación»", CELLW)],
    [cellp("<b>Staff</b>"), cellp("Operar (único operativo)"), cellp("Ve el cliente"), cellp("<font color='#2E7D52'><b>Carga, ejecuta y edita</b></font>")],
    [cellp("<b>Senior</b>"), cellp("Administrar config. + Revisar"), cellp("Ve y revisa"), cellp("Ve y revisa <font size=7 color='#8A97A5'>(no opera datos)</font>")],
    [cellp("<b>Gerente / Socio</b>"), cellp("Ver / Comentar"), cellp("Consulta y comenta"), cellp("Consulta y comenta <font size=7 color='#8A97A5'>(igual)</font>")],
    [cellp("<b>Administrador</b>"), cellp("Administra la herramienta"), cellp("— configura plataforma —"), cellp("— configura plataforma —")],
]
mt = Table(m, colWidths=[28*mm, 44*mm, (CW-28*mm-44*mm)/2, (CW-28*mm-44*mm)/2])
mt.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), NAVY),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT]),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7),
    ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ("BOX", (0,0), (-1,-1), 0.8, BORDER), ("INNERGRID", (0,0), (-1,-1), 0.4, BORDER),
]))
story.append(mt)
story.append(Spacer(1, 6))
story.append(Paragraph(
    "<font color='#8A97A5' size='8'>Por eso marcar «Operación» en la cartera para un equipo donde solo hay "
    "consultores no concede nada: la escritura la habilita el permiso de rol, que solo tiene el Staff.</font>", SMALL))

story.append(PageBreak())

# =========================================================================
# 5. DETALLE POR RUTA
# =========================================================================
story.append(Paragraph("Detalle de cada ruta", H1))
story.append(Paragraph(
    "Cada ruta se acompaña de una captura real de la plataforma (datos de demostración).", LEAD))

# --- Permisos por rol ---
story.append(Paragraph("Permisos por rol — la matriz", H2))
story.append(Paragraph(
    "Es la autoridad de la Capa 1. Cada celda cruza un <b>rol</b> con un <b>módulo</b> y se fija con un "
    "<b>nivel</b> acumulativo (cada nivel incluye los inferiores):", BODY))
niv = [
    [cellp("Nivel", CELLW), cellp("Incluye las acciones", CELLW), cellp("Para qué", CELLW)],
    [cellp("<b>Ninguno</b>"), cellp("—"), cellp("Sin acceso al módulo.")],
    [cellp("<b>Ver</b>"), cellp("ver"), cellp("Solo lectura y consulta.")],
    [cellp("<b>Comentar</b>"), cellp("ver + comentar"), cellp("Participa en las conversaciones del módulo.")],
    [cellp("<b>Operar</b>"), cellp("+ crear, editar, ejecutar, revisar"), cellp("Trabajo operativo (típico del Staff).")],
    [cellp("<b>Administrar</b>"), cellp("+ configurar, asignar, supervisar, eliminar"), cellp("Configuración y administración.")],
]
nt = Table(niv, colWidths=[26*mm, 64*mm, CW-26*mm-64*mm])
nt.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), BLUE),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT]),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7),
    ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ("BOX", (0,0), (-1,-1), 0.8, BORDER), ("INNERGRID", (0,0), (-1,-1), 0.4, BORDER),
]))
story.append(nt)
story.append(Spacer(1, 5))
story.append(callout(
    "Cómo se asigna / crea un permiso por rol (tu pregunta directa)",
    "1) Abre <b>Permisos por rol</b>. 2) Ubica la fila del <b>módulo</b> y la columna del <b>rol</b>. "
    "3) Elige el <b>nivel</b> en el desplegable de esa celda. 4) <b>Guarda</b>: el sistema traduce el nivel a "
    "su paquete de permisos <font face=\"Courier-Bold\">modulo:accion</font> y sincroniza la tabla "
    "<font face=\"Courier-Bold\">roles_permisos</font>. El cambio surte efecto en la siguiente petición "
    "(la matriz cacheada se invalida sola).", tone="ok"))
story.append(Spacer(1, 4))
story.append(callout(
    "Salvaguarda anti-bloqueo",
    "No podrás dejar la plataforma sin ningún rol que tenga <font face=\"Courier-Bold\">roles:configurar</font> "
    "ni la gestión de usuarios (<font face=\"Courier-Bold\">usuarios:crear/editar/eliminar</font>): la operación "
    "se cancela para evitar un auto-bloqueo. Los roles legado (Consulta, Auditor, Líder) no se editan desde esta "
    "pantalla.", tone="warn"))
story.append(Spacer(1, 6))
story.append(figure("permisos.png",
    "Permisos por rol — la matriz rol×módulo. Cada celda fija el nivel (Ninguno / Ver / Comentar / Operar / "
    "Administrar); la marca «Parcial» avisa que la concesión aún no cubre todo el nivel."))

# --- Clientes ---
story.append(Paragraph("Clientes", H2))
story.append(Paragraph(
    "Punto de partida de cada cliente nuevo. El botón de crear pide nombre, NIT, ERP y sector; el "
    "<b>código se genera automáticamente</b> en el servidor (no lo escribes, y no se puede editar después). "
    "Tras crearlo, en la misma tabla marcas el <b>estado de parametrización</b> de cada módulo "
    "(configurado / pendiente / sin habilitar).", BODY))
story.append(Paragraph(
    "<b>Crear/editar</b> requiere <font face='Courier-Bold' color='#2F6DB5'>clientes:crear</font> / "
    "<font face='Courier-Bold' color='#2F6DB5'>clientes:editar</font>; "
    "<b>parametrizar módulos y eliminar</b> requiere "
    "<font face='Courier-Bold' color='#2F6DB5'>clientes:configurar</font> (Senior / Administrador).", SMALL))
story.append(Spacer(1, 6))
story.append(figure("clientes.png",
    "Clientes y parametrizaciones — listado con NIT, ERP y sector, y el estado de cada módulo por cliente. "
    "El botón «Nuevo cliente» asigna el código automáticamente."))

# --- Equipos ---
story.append(Paragraph("Equipos", H2))
story.append(Paragraph(
    "Define la composición humana del equipo. <b>Crear equipo</b> pide nombre, descripción y un líder "
    "opcional (el Senior responsable). <b>Agregar integrante</b> añade un usuario al equipo, opcionalmente "
    "con un rol interno y una <b>vigencia</b> (vigente hasta…). Reasignar al mismo equipo actualiza la "
    "vigencia; para un refuerzo temporal en otro equipo, se crea una fila con fecha de fin.", BODY))
story.append(Paragraph(
    "Requiere <font face='Courier-Bold' color='#2F6DB5'>equipos:crear</font> y "
    "<font face='Courier-Bold' color='#2F6DB5'>equipos:asignar</font>.", SMALL))
story.append(Spacer(1, 6))
story.append(figure("equipos.png",
    "Equipos de trabajo — cada equipo con su líder e integrantes; cada integrante muestra su rol, vigencia "
    "y estado (Vigente / Programado / Expirado)."))

# --- Cartera ---
story.append(Paragraph("Cartera clientes", H2))
story.append(Paragraph(
    "Define qué clientes atiende el equipo. Eliges el equipo, buscas y marcas uno o varios clientes y "
    "fijas el <b>alcance sobre los clientes</b> con dos casillas:", BODY))
story.append(ListFlowable([
    ListItem(Paragraph("<b>Consulta</b> (ver los clientes de la cartera) → alcance de lectura "
                       "(<font face='Courier-Bold'>readScope</font>).", BODYL), leftIndent=6),
    ListItem(Paragraph("<b>Operación</b> (cargar/ejecutar — solo surte efecto para el Staff) → alcance de "
                       "escritura (<font face='Courier-Bold'>writeScope</font>).", BODYL), leftIndent=6),
], bulletType="bullet", start="•", leftIndent=10))
story.append(Paragraph(
    "Opcionalmente fijas <b>vigencia</b> y <b>motivo</b>. La asignación de cartera se guarda para "
    "<b>todo el equipo</b> (sus integrantes la heredan). Requiere "
    "<font face='Courier-Bold' color='#2F6DB5'>equipos:asignar</font>.", BODY))
story.append(Spacer(1, 6))
story.append(figure("carteras.png",
    "Cartera clientes — qué clientes atiende cada equipo, con su alcance (Consulta / Operación), vigencia y estado."))
story.append(figure("carteras-modal.png",
    "Modal «Asignar clientes»: se eligen uno o varios clientes y se marcan las casillas de Alcance — "
    "Consulta (lectura) y Operación (escritura, que solo surte efecto para el Staff)."))

# --- Usuarios ---
story.append(Paragraph("Usuarios", H2))
story.append(Paragraph(
    "Alta y gestión de personas. Al crear, asignas <b>un rol</b> de la lista; ese rol es el que la matriz "
    "evalúa. Solo un Superadministrador puede asignar el rol Superadministrador. El nuevo usuario nace "
    "con contraseña temporal (<font face='Courier-Bold'>mustChangePassword</font>) y debe cambiarla al "
    "primer ingreso. Requiere "
    "<font face='Courier-Bold' color='#2F6DB5'>usuarios:crear / editar / eliminar</font> (Administrador).", BODY))
story.append(Spacer(1, 6))
story.append(figure("usuarios.png",
    "Usuarios — alta y gestión de cuentas; cada usuario con su rol y estado. El rol asignado aquí es el que "
    "evalúa la matriz de permisos."))

story.append(Spacer(1, 12))

# =========================================================================
# 6. VIGENCIA + ERRORES FRECUENTES
# =========================================================================
story.append(Paragraph("Vigencia temporal y errores frecuentes", H1))

story.append(Paragraph("Vigencia: las asignaciones expiran solas", H3))
story.append(Paragraph(
    "Tanto la pertenencia a un equipo como la cartera tienen <b>vigente desde / vigente hasta</b>. No hay "
    "procesos programados: al leer, el sistema descarta lo que aún no inició o ya expiró. Así un refuerzo "
    "temporal deja de autorizar automáticamente al llegar su fecha de fin. Los estados que verás: "
    "<b>Vigente</b>, <b>Programado</b> (futuro), <b>Expirado</b> e <b>Inactivo</b>.", BODY))

story.append(Spacer(1, 6))
story.append(Paragraph("Errores frecuentes (y cómo evitarlos)", H3))

err = [
    [cellp("Síntoma", CELLW), cellp("Causa probable", CELLW), cellp("Solución", CELLW)],
    [cellp("«No tienes alcance sobre este cliente»"),
     cellp("El usuario tiene el permiso de rol, pero su equipo no tiene el cliente en cartera (o sin el alcance correcto)."),
     cellp("En <b>Cartera clientes</b>, asigna el cliente al equipo del usuario con «Consulta» y/o «Operación».")],
    [cellp("El Staff ve el cliente pero no puede cargar/ejecutar"),
     cellp("La cartera tiene «Consulta» pero no «Operación»."),
     cellp("Edita el alcance de la asignación y marca también <b>Operación</b>.")],
    [cellp("Marqué «Operación» a un Senior y sigue sin operar"),
     cellp("Correcto: Senior es de consulta. La escritura solo la concede el permiso de rol del Staff."),
     cellp("Para operar el dato, debe hacerlo un <b>Staff</b> del equipo. El Senior revisa.")],
    [cellp("El módulo no aparece en el menú del usuario"),
     cellp("Falta el permiso de rol para ese módulo, o el módulo no está publicado para su rol."),
     cellp("Revisa <b>Permisos por rol</b> y la <b>publicación de módulos</b> (Superadministrador).")],
    [cellp("Asigné acceso temporal y dejó de funcionar"),
     cellp("Expiró la vigencia (vigente hasta…) de la membresía o la cartera."),
     cellp("Edita la vigencia o vuelve a asignar con nueva fecha.")],
]
et = Table(err, colWidths=[(CW)*0.30, (CW)*0.36, (CW)*0.34])
et.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), NAVY),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT]),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7),
    ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ("BOX", (0,0), (-1,-1), 0.8, BORDER), ("INNERGRID", (0,0), (-1,-1), 0.4, BORDER),
]))
story.append(et)

story.append(Spacer(1, 10))
story.append(callout(
    "Resumen en una frase",
    "<b>Permisos por rol</b> dice qué puede hacer cada rol; <b>Usuarios</b> reparte los roles; "
    "<b>Clientes</b> da de alta el cliente; <b>Equipos</b> arma el grupo de personas; y "
    "<b>Cartera clientes</b> conecta el cliente con ese equipo y su alcance. El acceso real es la "
    "intersección de las dos capas.", tone="key"))

story.append(Spacer(1, 8))
story.append(HRule(CW, color=BORDER))
story.append(Spacer(1, 3))
story.append(Paragraph(
    "Documento de referencia interna basado en la implementación de russell-lfm "
    "(src/lib/rbac, src/app/actions y src/app/(app)/config). El comportamiento descrito refleja el "
    "código vigente; ante cambios en el catálogo de permisos, vuelve a sembrar la matriz.", TINY))

doc.build(story)
print("OK")
