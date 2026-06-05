# -*- coding: utf-8 -*-
"""
Genera un PDF detallado con el esquema de la base de datos (en español)
de la plataforma Russell Bedford · Conciliador/Diagnóstico.

Fuente de verdad: prisma/schema.prisma (nombres físicos vía @@map/@map).
"""

from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.graphics.shapes import Drawing, Group, Line, PolyLine, Rect, String
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT = "docs/Esquema_BD_Russell.pdf"

# Paleta corporativa sobria
AZUL = colors.HexColor("#1F3A5F")
AZUL_CLARO = colors.HexColor("#E8EEF6")
GRIS = colors.HexColor("#6B7280")
GRIS_LINEA = colors.HexColor("#D1D5DB")
BLANCO = colors.white
VERDE = colors.HexColor("#0F766E")

# ---------------------------------------------------------------------------
# Definición del esquema (módulo -> tablas -> columnas)
# Cada columna: (columna_fisica, tipo, nulo, llave, descripcion)
#   llave: PK | FK | UQ | "" (combinables, p.ej. "PK")
# ---------------------------------------------------------------------------

ESQUEMA = [
    {
        "modulo": "1. Autenticación",
        "descripcion": "Gestión de usuarios, credenciales y control de intentos de acceso.",
        "tablas": [
            {
                "nombre": "usuarios",
                "modelo": "User",
                "desc": "Usuarios del sistema y sus credenciales (hash bcrypt).",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("correo", "text", "No", "UQ", "Correo electrónico (único)."),
                    ("contrasena", "text", "No", "", "Hash bcrypt de la contraseña."),
                    ("nombre", "text", "No", "", "Nombre completo del usuario."),
                    ("rol", "text", "No", "", "Rol del usuario (por defecto 'Consulta')."),
                    ("iniciales", "text", "No", "", "Iniciales para avatar."),
                    ("activo", "boolean", "No", "", "Indica si la cuenta está activa."),
                    ("version_sesion", "integer", "No", "", "Versión de sesión (invalida tokens)."),
                    ("debe_cambiar_contrasena", "boolean", "No", "", "Obliga a cambiar la contraseña al ingresar."),
                    ("ultimo_inicio_sesion", "timestamp", "Sí", "", "Fecha-hora del último acceso."),
                    ("creado_en", "timestamp", "No", "", "Fecha de creación."),
                    ("actualizado_en", "timestamp", "No", "", "Fecha de última actualización."),
                ],
            },
            {
                "nombre": "intentos_inicio_sesion",
                "modelo": "LoginAttempt",
                "desc": "Bitácora de intentos de inicio de sesión (rate limiting / seguridad).",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("correo", "text", "No", "IDX", "Correo usado en el intento."),
                    ("ip", "text", "No", "IDX", "Dirección IP de origen."),
                    ("exitoso", "boolean", "No", "", "Si el intento fue exitoso."),
                    ("creado_en", "timestamp", "No", "IDX", "Fecha-hora del intento."),
                ],
            },
        ],
    },
    {
        "modulo": "2. Clientes y módulos",
        "descripcion": "Clientes, catálogo de módulos y campos estándar configurables por módulo.",
        "tablas": [
            {
                "nombre": "clientes",
                "modelo": "Client",
                "desc": "Clientes atendidos por la firma.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador del cliente (p.ej. C-1042)."),
                    ("nombre", "text", "No", "", "Razón social."),
                    ("nit", "text", "No", "", "Número de identificación tributaria."),
                    ("erp", "text", "No", "", "Sistema ERP del cliente."),
                    ("sector", "text", "No", "", "Sector económico."),
                    ("creado_en", "timestamp", "No", "", "Fecha de creación."),
                ],
            },
            {
                "nombre": "modulos",
                "modelo": "Module",
                "desc": "Catálogo de módulos (INV, CAR, NOM...).",
                "cols": [
                    ("id", "text", "No", "PK", "Código del módulo."),
                    ("nombre", "text", "No", "", "Nombre del módulo."),
                    ("icono", "text", "No", "", "Ícono asociado."),
                ],
            },
            {
                "nombre": "campos_modulo",
                "modelo": "ModuleField",
                "desc": "Campos estándar definidos por cada módulo.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("modulo_id", "text", "No", "FK", "Módulo al que pertenece → modulos.id."),
                    ("clave", "text", "No", "UQ", "Clave técnica del campo."),
                    ("etiqueta", "text", "No", "", "Etiqueta visible."),
                    ("tipo", "text", "No", "", "Tipo de dato (string | number | date)."),
                    ("requerido", "boolean", "No", "", "Si el campo es obligatorio."),
                    ("ayuda", "text", "Sí", "", "Texto de ayuda."),
                    ("orden", "integer", "No", "", "Orden de presentación."),
                ],
            },
            {
                "nombre": "modulos_cliente",
                "modelo": "ClientModule",
                "desc": "Relación N:M entre clientes y módulos, con su estado de configuración.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("cliente_id", "text", "No", "FK/UQ", "Cliente → clientes.id."),
                    ("modulo_id", "text", "No", "FK/UQ", "Módulo → modulos.id."),
                    ("estado", "text", "No", "", "Estado (configured | pending)."),
                ],
            },
        ],
    },
    {
        "modulo": "3. Conciliaciones",
        "descripcion": "Conciliaciones contables, sus filas de detalle y comentarios.",
        "tablas": [
            {
                "nombre": "conciliaciones",
                "modelo": "Reconciliation",
                "desc": "Cabecera de cada conciliación (REC-2026-0418).",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador de la conciliación."),
                    ("cliente_id", "text", "Sí", "FK", "Cliente → clientes.id (set null)."),
                    ("nombre_cliente", "text", "No", "", "Nombre del cliente (denormalizado)."),
                    ("modulo", "text", "No", "", "Módulo conciliado."),
                    ("periodo", "text", "No", "", "Período contable."),
                    ("erp", "text", "No", "", "ERP de origen."),
                    ("estado", "text", "No", "", "Estado (OK | DIFF | REVIEW)."),
                    ("diferencia", "text", "No", "", "Diferencia total (display)."),
                    ("items", "integer", "No", "", "Cantidad de ítems."),
                    ("fecha", "text", "No", "", "Fecha de la conciliación."),
                    ("responsable", "text", "No", "", "Responsable asignado."),
                    ("corte", "text", "Sí", "", "Fecha de corte."),
                    ("ejecutado_en", "text", "Sí", "", "Fecha-hora de ejecución."),
                    ("ejecutado_por", "text", "Sí", "", "Usuario que ejecutó."),
                    ("ultima_actividad", "text", "Sí", "", "Última actividad registrada."),
                    ("materialidad", "integer", "No", "", "Umbral de materialidad."),
                    ("creado_en", "timestamp", "No", "", "Fecha de creación."),
                ],
            },
            {
                "nombre": "filas_conciliacion",
                "modelo": "ReconciliationRow",
                "desc": "Detalle por cuenta de cada conciliación.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("conciliacion_id", "text", "No", "FK", "Conciliación → conciliaciones.id."),
                    ("cuenta", "text", "No", "", "Código de cuenta."),
                    ("descripcion", "text", "No", "", "Descripción de la cuenta."),
                    ("saldo_contabilidad", "integer", "No", "", "Saldo según contabilidad."),
                    ("saldo_modulo", "integer", "No", "", "Saldo según el módulo."),
                    ("diferencia", "integer", "No", "", "Diferencia (contabilidad - módulo)."),
                    ("items", "integer", "No", "", "Ítems involucrados."),
                    ("estado_manual", "text", "Sí", "", "Override manual (conciliada | excepcion | ajuste)."),
                    ("orden", "integer", "No", "", "Orden de presentación."),
                ],
            },
            {
                "nombre": "comentarios_conciliacion",
                "modelo": "ReconciliationComment",
                "desc": "Comentarios asociados a una conciliación.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("conciliacion_id", "text", "No", "FK", "Conciliación → conciliaciones.id."),
                    ("cuenta", "text", "No", "", "Cuenta comentada."),
                    ("autor", "text", "No", "", "Autor del comentario."),
                    ("iniciales", "text", "No", "", "Iniciales del autor."),
                    ("texto", "text", "No", "", "Contenido del comentario."),
                    ("hora", "text", "No", "", "Marca de tiempo (display)."),
                    ("creado_en", "timestamp", "No", "", "Fecha de creación."),
                ],
            },
        ],
    },
    {
        "modulo": "4. Balance y plan de cuentas",
        "descripcion": "Balance de comprobación, plan de cuentas estándar y mapeo de cuentas del cliente hacia Russell.",
        "tablas": [
            {
                "nombre": "cuentas_estandar",
                "modelo": "StandardAccount",
                "desc": "Plan de cuentas estándar (jerárquico).",
                "cols": [
                    ("codigo", "text", "No", "PK", "Código de la cuenta."),
                    ("nombre", "text", "No", "", "Nombre de la cuenta."),
                    ("nivel", "integer", "No", "", "Nivel jerárquico."),
                    ("naturaleza", "text", "No", "", "Naturaleza (D | C)."),
                    ("padre", "text", "Sí", "", "Código de la cuenta padre."),
                    ("critica", "boolean", "No", "", "Marca de cuenta crítica."),
                ],
            },
            {
                "nombre": "balances",
                "modelo": "Balance",
                "desc": "Balance de comprobación por cliente, período y versión.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("nombre_cliente", "text", "No", "UQ", "Cliente (parte de la clave única)."),
                    ("nit_cliente", "text", "Sí", "", "NIT del cliente."),
                    ("periodo", "text", "No", "UQ", "Período (parte de la clave única)."),
                    ("version", "text", "No", "UQ", "Versión (parte de la clave única)."),
                    ("es_oficial", "boolean", "No", "", "Si es la versión oficial."),
                    ("esta_congelado", "boolean", "No", "", "Si está congelado."),
                    ("estado", "text", "No", "", "Estado (por defecto 'Única')."),
                    ("completitud", "integer", "No", "", "Porcentaje de completitud."),
                    ("sumas", "jsonb", "Sí", "", "Sumas por grupo (activo, pasivo...)."),
                    ("validaciones", "jsonb", "Sí", "", "Reglas de validación."),
                    ("desglose", "jsonb", "Sí", "", "Desglose por nivel 2 con ítems."),
                    ("metadatos", "jsonb", "Sí", "", "Metadatos del cargue."),
                    ("historial_versiones", "jsonb", "Sí", "", "Historial de versiones."),
                    ("comparativo", "jsonb", "Sí", "", "Comparativo oficial vs. anterior."),
                    ("bitacora", "jsonb", "Sí", "", "Bitácora de cargues/congelados."),
                    ("estado_resultado", "jsonb", "Sí", "", "Líneas del estado de resultado."),
                    ("ultima_carga", "text", "Sí", "", "Fecha-hora de la última carga."),
                    ("creado_en", "timestamp", "No", "", "Fecha de creación."),
                ],
            },
            {
                "nombre": "cuentas_cliente",
                "modelo": "ClientAccount",
                "desc": "Cuentas del cliente y su mapeo lógico hacia las opciones Russell.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("nombre_cliente", "text", "No", "UQ", "Cliente (parte de la clave única)."),
                    ("codigo", "text", "No", "UQ", "Código de cuenta (parte de la clave única)."),
                    ("nivel", "integer", "No", "", "Nivel (4 | 6 | 8)."),
                    ("nombre", "text", "No", "", "Nombre de la cuenta."),
                    ("codigo_russell", "text", "Sí", "FK*", "Mapeo lógico → opciones_russell.codigo."),
                    ("orden", "integer", "No", "", "Orden de presentación."),
                ],
            },
            {
                "nombre": "opciones_russell",
                "modelo": "RussellOption",
                "desc": "Catálogo de opciones (cuentas) Russell para el mapeo.",
                "cols": [
                    ("codigo", "text", "No", "PK", "Código Russell."),
                    ("nombre", "text", "No", "", "Nombre de la opción."),
                    ("modulo", "text", "Sí", "", "Módulo asociado (null = no concilia)."),
                ],
            },
        ],
    },
    {
        "modulo": "5. Impuestos · DIAN",
        "descripcion": "Formularios DIAN, sus períodos, secciones, renglones, mapeos contables y comentarios.",
        "tablas": [
            {
                "nombre": "formularios_dian",
                "modelo": "DianForm",
                "desc": "Formularios tributarios (IVA, RETEFUENTE...).",
                "cols": [
                    ("id", "text", "No", "PK", "Código del formulario."),
                    ("nombre", "text", "No", "", "Nombre del formulario."),
                    ("codigo", "text", "No", "", "Código oficial (F-300)."),
                    ("periodicidad", "text", "No", "", "Periodicidad de presentación."),
                    ("icono", "text", "No", "", "Ícono asociado."),
                    ("objetivo", "text", "Sí", "", "Objetivo del análisis."),
                    ("conclusion", "text", "Sí", "", "Conclusión del análisis."),
                ],
            },
            {
                "nombre": "periodos_dian",
                "modelo": "DianPeriod",
                "desc": "Períodos de cada formulario DIAN.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("clave_periodo", "text", "No", "UQ", "Clave del período (2026-B5)."),
                    ("etiqueta", "text", "No", "", "Etiqueta visible."),
                    ("estado", "text", "No", "", "Estado (OK | DIFF | PEND)."),
                    ("presentado", "text", "Sí", "", "Fecha de presentación."),
                    ("formulario_id", "text", "No", "FK/UQ", "Formulario → formularios_dian.id."),
                ],
            },
            {
                "nombre": "secciones_dian",
                "modelo": "DianSection",
                "desc": "Secciones visuales de un formulario.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("formulario_id", "text", "No", "FK", "Formulario → formularios_dian.id."),
                    ("titulo", "text", "No", "", "Título de la sección."),
                    ("lado", "text", "No", "", "Lado visual (L | R)."),
                    ("nota", "text", "Sí", "", "Nota aclaratoria."),
                    ("orden", "integer", "No", "", "Orden de presentación."),
                ],
            },
            {
                "nombre": "renglones_dian",
                "modelo": "DianLine",
                "desc": "Renglones (casillas) de cada sección.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("seccion_id", "text", "No", "FK", "Sección → secciones_dian.id."),
                    ("casilla", "text", "No", "", "Código de casilla (GEN-19...)."),
                    ("etiqueta", "text", "No", "", "Etiqueta del renglón."),
                    ("declarado", "double precision", "No", "", "Valor declarado."),
                    ("contabilidad", "double precision", "No", "", "Valor según contabilidad."),
                    ("diferencia", "double precision", "No", "", "Diferencia."),
                    ("orden", "integer", "No", "", "Orden de presentación."),
                ],
            },
            {
                "nombre": "mapeos_dian",
                "modelo": "DianMapping",
                "desc": "Mapeo de renglones DIAN a cuentas contables.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("formulario_id", "text", "No", "FK", "Formulario → formularios_dian.id."),
                    ("clave_renglon", "text", "No", "", "Clave del renglón (k)."),
                    ("cuenta", "text", "No", "", "Cuenta contable."),
                    ("descripcion", "text", "No", "", "Descripción de la cuenta."),
                    ("signo", "text", "No", "", "Signo (+ | -)."),
                    ("orden", "integer", "No", "", "Orden de presentación."),
                ],
            },
            {
                "nombre": "comentarios_dian",
                "modelo": "DianComment",
                "desc": "Comentarios sobre renglones de un formulario.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("formulario_id", "text", "No", "FK", "Formulario → formularios_dian.id."),
                    ("clave_renglon", "text", "No", "", "Renglón comentado."),
                    ("autor", "text", "No", "", "Autor del comentario."),
                    ("iniciales", "text", "No", "", "Iniciales del autor."),
                    ("texto", "text", "No", "", "Contenido del comentario."),
                    ("hora", "text", "No", "", "Marca de tiempo (display)."),
                    ("es_ia", "boolean", "No", "", "Si fue generado por IA."),
                    ("creado_en", "timestamp", "No", "", "Fecha de creación."),
                ],
            },
        ],
    },
    {
        "modulo": "6. Requerimientos de información",
        "descripcion": "Contactos, plantillas, envíos, repositorios documentales y presentaciones.",
        "tablas": [
            {
                "nombre": "contactos_cliente",
                "modelo": "ClientContact",
                "desc": "Contactos de cada cliente.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("nombre_cliente", "text", "No", "", "Cliente asociado."),
                    ("nombre", "text", "No", "", "Nombre del contacto."),
                    ("rol", "text", "No", "", "Cargo/rol."),
                    ("correo", "text", "No", "", "Correo electrónico."),
                    ("principal", "boolean", "No", "", "Si es el contacto principal."),
                    ("orden", "integer", "No", "", "Orden de presentación."),
                ],
            },
            {
                "nombre": "plantillas_requerimiento",
                "modelo": "ReqTemplate",
                "desc": "Plantillas de requerimientos de información.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador (TPL-CIERRE)."),
                    ("codigo", "text", "No", "", "Código (RFA-CIERRE)."),
                    ("nombre", "text", "No", "", "Nombre de la plantilla."),
                    ("descripcion", "text", "No", "", "Descripción."),
                    ("version_activa", "text", "No", "", "Versión activa."),
                    ("familias", "integer", "No", "", "Cantidad de familias."),
                    ("items", "integer", "No", "", "Cantidad de ítems."),
                    ("veces_usada", "integer", "No", "", "Veces utilizada."),
                    ("actualizado_en", "text", "No", "", "Última actualización (display)."),
                    ("actualizado_por", "text", "No", "", "Usuario que actualizó."),
                ],
            },
            {
                "nombre": "encabezados_plantilla_requerimiento",
                "modelo": "ReqTemplateHeader",
                "desc": "Encabezado/carta de una plantilla (relación 1:1).",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("plantilla_id", "text", "No", "FK/UQ", "Plantilla → plantillas_requerimiento.id (1:1)."),
                    ("nombre_firma", "text", "No", "", "Nombre de la firma."),
                    ("ciudad", "text", "No", "", "Ciudad."),
                    ("asunto", "text", "No", "", "Asunto de la carta."),
                    ("introduccion", "text", "No", "", "Texto introductorio."),
                    ("nota_generica", "text", "No", "", "Nota genérica."),
                    ("cierre", "text", "No", "", "Texto de cierre."),
                    ("nombre_firmante", "text", "No", "", "Nombre del firmante."),
                    ("rol_firmante", "text", "No", "", "Cargo del firmante."),
                    ("pie_firmante", "text", "No", "", "Pie de firma."),
                    ("prefijo_consecutivo", "text", "No", "", "Prefijo del consecutivo."),
                    ("correos_contacto", "text[]", "No", "", "Correos de contacto."),
                ],
            },
            {
                "nombre": "familias_requerimiento",
                "modelo": "ReqFamily",
                "desc": "Familias (agrupaciones) dentro de una plantilla.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("plantilla_id", "text", "No", "FK", "Plantilla → plantillas_requerimiento.id."),
                    ("nombre", "text", "No", "", "Nombre de la familia."),
                    ("orden", "integer", "No", "", "Orden de presentación."),
                ],
            },
            {
                "nombre": "items_requerimiento",
                "modelo": "ReqItem",
                "desc": "Ítems solicitados dentro de una familia.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("familia_id", "text", "No", "FK", "Familia → familias_requerimiento.id."),
                    ("texto", "text", "No", "", "Descripción del ítem."),
                    ("orden", "integer", "No", "", "Orden de presentación."),
                ],
            },
            {
                "nombre": "envios_requerimiento",
                "modelo": "ReqSubmission",
                "desc": "Envíos de requerimientos a clientes.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador (REQ-2026-014)."),
                    ("consecutivo", "text", "No", "", "Consecutivo."),
                    ("codigo_plantilla", "text", "No", "", "Código de la plantilla usada."),
                    ("version_plantilla", "text", "No", "", "Versión de la plantilla."),
                    ("nombre_cliente", "text", "No", "", "Cliente destinatario."),
                    ("periodo", "text", "No", "", "Período."),
                    ("destinatarios", "integer", "No", "", "Cantidad de destinatarios."),
                    ("estado", "text", "No", "", "Estado (Enviado | Borrador)."),
                    ("fecha", "text", "No", "", "Fecha de envío."),
                    ("enviado_por", "text", "No", "", "Usuario que envió."),
                    ("creado_en", "timestamp", "No", "", "Fecha de creación."),
                ],
            },
            {
                "nombre": "repositorios_requerimiento",
                "modelo": "ReqRepository",
                "desc": "Repositorios de recepción documental por requerimiento.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador (REPO-2026-014)."),
                    ("consecutivo", "text", "No", "", "Consecutivo."),
                    ("codigo_plantilla", "text", "No", "", "Código de plantilla."),
                    ("nombre_cliente", "text", "No", "", "Cliente."),
                    ("nit", "text", "No", "", "NIT del cliente."),
                    ("periodo", "text", "No", "", "Período."),
                    ("corte", "text", "No", "", "Fecha de corte."),
                    ("enviado_en", "text", "No", "", "Fecha de envío."),
                    ("enviado_por", "text", "No", "", "Usuario que envió."),
                    ("fecha_limite", "text", "No", "", "Fecha límite."),
                    ("dias_restantes", "integer", "No", "", "Días restantes."),
                    ("total", "integer", "No", "", "Total de documentos."),
                    ("recibidos", "integer", "No", "", "Documentos recibidos."),
                    ("pendientes", "integer", "No", "", "Documentos pendientes."),
                    ("vencidos", "integer", "No", "", "Documentos vencidos."),
                    ("progreso", "integer", "No", "", "Porcentaje de progreso."),
                    ("estado", "text", "No", "", "Estado (Completo | Vencido parcial | En recepción)."),
                ],
            },
            {
                "nombre": "familias_repositorio",
                "modelo": "ReqRepoFamily",
                "desc": "Familias dentro de un repositorio.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("repositorio_id", "text", "No", "FK", "Repositorio → repositorios_requerimiento.id."),
                    ("codigo", "text", "No", "", "Código (F1)."),
                    ("nombre", "text", "No", "", "Nombre de la familia."),
                    ("total", "integer", "No", "", "Total de ítems."),
                    ("recibidos", "integer", "No", "", "Ítems recibidos."),
                    ("pendientes", "integer", "No", "", "Ítems pendientes."),
                    ("orden", "integer", "No", "", "Orden de presentación."),
                ],
            },
            {
                "nombre": "items_repositorio",
                "modelo": "ReqRepoItem",
                "desc": "Documentos solicitados dentro de una familia del repositorio.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("familia_id", "text", "No", "FK", "Familia → familias_repositorio.id."),
                    ("indice", "integer", "No", "", "Índice del ítem."),
                    ("documento", "text", "No", "", "Documento solicitado."),
                    ("vencimiento", "text", "No", "", "Fecha de vencimiento."),
                    ("estado", "text", "No", "", "Estado (received | pending | overdue)."),
                    ("archivo", "text", "Sí", "", "Archivo adjunto."),
                    ("tamano", "text", "Sí", "", "Tamaño del archivo."),
                    ("por", "text", "Sí", "", "Cargado por."),
                    ("en", "text", "Sí", "", "Fecha de carga."),
                    ("orden", "integer", "No", "", "Orden de presentación."),
                ],
            },
            {
                "nombre": "actividades_repositorio",
                "modelo": "ReqRepoActivity",
                "desc": "Bitácora de actividad de un repositorio.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("repositorio_id", "text", "No", "FK", "Repositorio → repositorios_requerimiento.id."),
                    ("en", "text", "No", "", "Fecha-hora de la actividad."),
                    ("actor", "text", "No", "", "Quién realizó la acción."),
                    ("rol", "text", "No", "", "Rol (Cliente | Auditor | Auto)."),
                    ("accion", "text", "No", "", "Acción realizada."),
                    ("detalle", "text", "No", "", "Detalle de la acción."),
                    ("orden", "integer", "No", "", "Orden de presentación."),
                ],
            },
            {
                "nombre": "presentaciones_requerimiento",
                "modelo": "ReqPresentation",
                "desc": "Presentaciones/diagnósticos entregados al cliente.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador (PRES-2025-009)."),
                    ("nombre_cliente", "text", "No", "", "Cliente."),
                    ("nit", "text", "No", "", "NIT del cliente."),
                    ("titulo", "text", "No", "", "Título de la presentación."),
                    ("anio", "text", "No", "", "Año."),
                    ("presentado", "text", "No", "", "Fecha de presentación."),
                    ("preparado_por", "text", "No", "", "Quién la preparó."),
                    ("diapositivas", "integer", "No", "", "Número de diapositivas."),
                    ("autor", "text", "No", "", "Autor."),
                    ("fecha", "text", "No", "", "Fecha."),
                    ("estado", "text", "No", "", "Estado (Enviada | Borrador)."),
                    ("positivos", "text[]", "No", "", "Aspectos positivos."),
                    ("observado", "jsonb", "Sí", "", "Hallazgos observados."),
                    ("evaluado", "jsonb", "Sí", "", "Aspectos evaluados."),
                    ("creado_en", "timestamp", "No", "", "Fecha de creación."),
                ],
            },
        ],
    },
    {
        "modulo": "7. Sistema (notificaciones, auditoría, calendario)",
        "descripcion": "Tablas transversales de apoyo a la plataforma.",
        "tablas": [
            {
                "nombre": "notificaciones",
                "modelo": "Notification",
                "desc": "Notificaciones para los usuarios.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("tipo", "text", "No", "", "Tipo (assign | comment | system)."),
                    ("autor", "text", "No", "", "Quién la genera."),
                    ("texto", "text", "No", "", "Contenido."),
                    ("destino", "text", "No", "", "Objetivo/enlace."),
                    ("hora", "text", "No", "", "Marca de tiempo (display)."),
                    ("no_leida", "boolean", "No", "", "Si está sin leer."),
                    ("creado_en", "timestamp", "No", "", "Fecha de creación."),
                ],
            },
            {
                "nombre": "registros_auditoria",
                "modelo": "AuditEntry",
                "desc": "Bitácora de auditoría de acciones del sistema.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("marca_tiempo", "text", "No", "", "Marca de tiempo (display)."),
                    ("usuario", "text", "No", "", "Usuario que ejecutó la acción."),
                    ("accion", "text", "No", "", "Acción realizada."),
                    ("entidad", "text", "No", "", "Entidad afectada."),
                    ("detalle", "text", "No", "", "Detalle de la acción."),
                    ("ip", "text", "Sí", "", "Dirección IP."),
                    ("creado_en", "timestamp", "No", "", "Fecha de creación."),
                ],
            },
            {
                "nombre": "eventos_calendario",
                "modelo": "CalendarEvent",
                "desc": "Eventos del calendario tributario/operativo.",
                "cols": [
                    ("id", "text", "No", "PK", "Identificador único (cuid)."),
                    ("fecha", "timestamp", "No", "", "Fecha del evento."),
                    ("tipo", "text", "No", "", "Tipo (dian | ica | req)."),
                    ("titulo", "text", "No", "", "Título del evento."),
                    ("subtitulo", "text", "No", "", "Subtítulo."),
                    ("cliente_id", "text", "Sí", "", "Cliente de calendario (zarzal, pacif...)."),
                    ("orden", "integer", "No", "", "Orden de presentación."),
                ],
            },
        ],
    },
]

# Relaciones (FK físicas) -> (origen.columna, destino.columna, tipo, regla)
RELACIONES = [
    ("campos_modulo.modulo_id", "modulos.id", "N:1", "ON DELETE CASCADE"),
    ("modulos_cliente.cliente_id", "clientes.id", "N:1", "ON DELETE CASCADE"),
    ("modulos_cliente.modulo_id", "modulos.id", "N:1", "ON DELETE CASCADE"),
    ("conciliaciones.cliente_id", "clientes.id", "N:1", "ON DELETE SET NULL"),
    ("filas_conciliacion.conciliacion_id", "conciliaciones.id", "N:1", "ON DELETE CASCADE"),
    ("comentarios_conciliacion.conciliacion_id", "conciliaciones.id", "N:1", "ON DELETE CASCADE"),
    ("periodos_dian.formulario_id", "formularios_dian.id", "N:1", "ON DELETE CASCADE"),
    ("secciones_dian.formulario_id", "formularios_dian.id", "N:1", "ON DELETE CASCADE"),
    ("renglones_dian.seccion_id", "secciones_dian.id", "N:1", "ON DELETE CASCADE"),
    ("mapeos_dian.formulario_id", "formularios_dian.id", "N:1", "ON DELETE CASCADE"),
    ("comentarios_dian.formulario_id", "formularios_dian.id", "N:1", "ON DELETE CASCADE"),
    ("encabezados_plantilla_requerimiento.plantilla_id", "plantillas_requerimiento.id", "1:1", "ON DELETE CASCADE"),
    ("familias_requerimiento.plantilla_id", "plantillas_requerimiento.id", "N:1", "ON DELETE CASCADE"),
    ("items_requerimiento.familia_id", "familias_requerimiento.id", "N:1", "ON DELETE CASCADE"),
    ("familias_repositorio.repositorio_id", "repositorios_requerimiento.id", "N:1", "ON DELETE CASCADE"),
    ("items_repositorio.familia_id", "familias_repositorio.id", "N:1", "ON DELETE CASCADE"),
    ("actividades_repositorio.repositorio_id", "repositorios_requerimiento.id", "N:1", "ON DELETE CASCADE"),
    ("cuentas_cliente.codigo_russell", "opciones_russell.codigo", "N:1*", "Relación lógica (sin FK física)"),
]

# ---------------------------------------------------------------------------
# Estilos
# ---------------------------------------------------------------------------
styles = getSampleStyleSheet()

st_titulo = ParagraphStyle("TituloDoc", parent=styles["Title"], fontName="Helvetica-Bold",
                           fontSize=26, textColor=AZUL, leading=30, alignment=TA_CENTER)
st_subtitulo = ParagraphStyle("SubtituloDoc", parent=styles["Normal"], fontSize=13,
                              textColor=GRIS, alignment=TA_CENTER, leading=18)
st_modulo = ParagraphStyle("Modulo", parent=styles["Heading1"], fontName="Helvetica-Bold",
                          fontSize=16, textColor=BLANCO, leading=20, spaceBefore=6, spaceAfter=6,
                          leftIndent=6)
st_modulo_desc = ParagraphStyle("ModuloDesc", parent=styles["Normal"], fontSize=10,
                              textColor=GRIS, leading=14, spaceAfter=10)
st_tabla_nombre = ParagraphStyle("TablaNombre", parent=styles["Heading2"], fontName="Helvetica-Bold",
                               fontSize=12.5, textColor=AZUL, leading=15, spaceBefore=10, spaceAfter=2)
st_tabla_desc = ParagraphStyle("TablaDesc", parent=styles["Normal"], fontSize=9,
                             textColor=GRIS, leading=12, spaceAfter=4)
st_celda = ParagraphStyle("Celda", parent=styles["Normal"], fontSize=8, leading=10)
st_celda_mono = ParagraphStyle("CeldaMono", parent=styles["Normal"], fontName="Courier-Bold",
                             fontSize=8, leading=10, textColor=AZUL)
st_celda_head = ParagraphStyle("CeldaHead", parent=styles["Normal"], fontName="Helvetica-Bold",
                             fontSize=8, leading=10, textColor=BLANCO)
st_normal = ParagraphStyle("NormalDoc", parent=styles["Normal"], fontSize=10, leading=14)
st_leyenda = ParagraphStyle("Leyenda", parent=styles["Normal"], fontSize=8.5, textColor=GRIS, leading=12)


def encabezado_tabla(textos):
    return [Paragraph(t, st_celda_head) for t in textos]


def construir_tabla_columnas(cols):
    data = [encabezado_tabla(["Columna", "Tipo", "Nulo", "Llave", "Descripción"])]
    for (c, tipo, nulo, llave, desc) in cols:
        data.append([
            Paragraph(c, st_celda_mono),
            Paragraph(tipo, st_celda),
            Paragraph(nulo, st_celda),
            Paragraph(llave or "—", st_celda),
            Paragraph(desc, st_celda),
        ])
    t = Table(data, colWidths=[3.8 * cm, 2.6 * cm, 1.1 * cm, 1.6 * cm, 7.2 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), AZUL),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BLANCO, AZUL_CLARO]),
        ("GRID", (0, 0), (-1, -1), 0.4, GRIS_LINEA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def construir_tabla_relaciones():
    data = [encabezado_tabla(["Origen (tabla.columna)", "Destino (tabla.columna)", "Card.", "Regla"])]
    for (origen, destino, card, regla) in RELACIONES:
        data.append([
            Paragraph(origen, st_celda_mono),
            Paragraph(destino, st_celda_mono),
            Paragraph(card, st_celda),
            Paragraph(regla, st_celda),
        ])
    t = Table(data, colWidths=[6.0 * cm, 5.6 * cm, 1.4 * cm, 3.3 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), VERDE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BLANCO, colors.HexColor("#E6F2F0")]),
        ("GRID", (0, 0), (-1, -1), 0.4, GRIS_LINEA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def banda_modulo(texto, ancho=17.0):
    t = Table([[Paragraph(texto, st_modulo)]], colWidths=[ancho * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), AZUL),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


# ---------------------------------------------------------------------------
# Diagrama Entidad-Relación (clusters jerárquicos)
# ---------------------------------------------------------------------------
BOX_W = 5.0 * cm
BOX_H = 0.95 * cm
X_GAP = 1.7 * cm
Y_GAP = 0.45 * cm
ROW_H = BOX_H + Y_GAP

# Color por módulo para las cajas del diagrama
COLOR_CLUSTER = {
    "clientes": colors.HexColor("#1F3A5F"),
    "modulos": colors.HexColor("#1F3A5F"),
    "formularios_dian": colors.HexColor("#7C3AED"),
    "plantillas_requerimiento": colors.HexColor("#0F766E"),
    "repositorios_requerimiento": colors.HexColor("#B45309"),
    "default": colors.HexColor("#374151"),
}


def _fuente_ajustada(texto, ancho_max, base=8.2, fuente="Courier-Bold", minimo=5.5):
    """Reduce el tamaño de fuente hasta que el texto quepa en ancho_max."""
    size = base
    while size > minimo and stringWidth(texto, fuente, size) > ancho_max:
        size -= 0.3
    return size


def _caja_texto(d, x, y, nombre, txt_color):
    size = _fuente_ajustada(nombre, BOX_W - 8)
    d.add(String(x + BOX_W / 2.0, y + BOX_H / 2.0 - size / 2.7, nombre,
                 fontName="Courier-Bold", fontSize=size,
                 fillColor=txt_color, textAnchor="middle"))


def _layout_tree(node, depth, state, root_color):
    """Calcula posiciones (x, y_centro) de cada nodo del árbol.
    node = (nombre, etiqueta_rel, [hijos]). Devuelve y_centro del nodo."""
    nombre, rel, hijos = node
    if not hijos:
        y = state["leaf_y"][0]
        state["leaf_y"][0] -= ROW_H
    else:
        ys = [_layout_tree(h, depth + 1, state, root_color) for h in hijos]
        y = (ys[0] + ys[-1]) / 2.0
    x = depth * (BOX_W + X_GAP)
    state["nodos"].append((nombre, x, y, depth, root_color))
    for h in hijos:
        # registrar arista padre -> hijo con su etiqueta de cardinalidad
        cy = state["pos"][h[0]]
        state["aristas"].append((x, y, cy[0], cy[1], h[1]))
    state["pos"][nombre] = (x, y)
    return y


def _contar_hojas(node):
    nombre, rel, hijos = node
    if not hijos:
        return 1
    return sum(_contar_hojas(h) for h in hijos)


def dibujar_cluster(arbol, ancho_dibujo):
    """Genera un Drawing para un árbol de relaciones."""
    hojas = _contar_hojas(arbol)
    alto = hojas * ROW_H + 0.3 * cm
    state = {"nodos": [], "aristas": [], "pos": {}, "leaf_y": [alto - BOX_H]}
    _layout_tree(arbol, 0, state, COLOR_CLUSTER.get(arbol[0], COLOR_CLUSTER["default"]))

    d = Drawing(ancho_dibujo, alto)

    # Aristas (conectores tipo codo)
    for (px, py, cx, cy, rel) in state["aristas"]:
        x1 = px + BOX_W
        y1 = py + BOX_H / 2.0
        x2 = cx
        y2 = cy + BOX_H / 2.0
        xm = (x1 + x2) / 2.0
        d.add(PolyLine([x1, y1, xm, y1, xm, y2, x2, y2],
                       strokeColor=colors.HexColor("#9CA3AF"), strokeWidth=1))
        if rel:
            d.add(String(x2 - 14, y2 + 3, rel, fontName="Helvetica-Bold",
                         fontSize=6.5, fillColor=colors.HexColor("#6B7280")))

    # Cajas
    for (nombre, x, y, depth, color) in state["nodos"]:
        fill = color if depth == 0 else colors.HexColor("#FFFFFF")
        stroke = color
        d.add(Rect(x, y, BOX_W, BOX_H, rx=4, ry=4, fillColor=fill,
                   strokeColor=stroke, strokeWidth=1.2))
        txt_color = colors.white if depth == 0 else color
        _caja_texto(d, x, y, nombre, txt_color)
    return d


def grilla_independientes(tablas, ancho_dibujo, cols=3):
    """Dibuja en grilla las tablas sin relaciones (independientes)."""
    filas = (len(tablas) + cols - 1) // cols
    alto = filas * ROW_H + 0.2 * cm
    d = Drawing(ancho_dibujo, alto)
    cw = ancho_dibujo / cols
    for i, nombre in enumerate(tablas):
        r = i // cols
        c = i % cols
        x = c * cw
        y = alto - BOX_H - r * ROW_H
        d.add(Rect(x, y, BOX_W, BOX_H, rx=4, ry=4, fillColor=colors.HexColor("#F3F4F6"),
                   strokeColor=colors.HexColor("#6B7280"), strokeWidth=1))
        _caja_texto(d, x, y, nombre, colors.HexColor("#374151"))
    return d


# Árboles de relaciones: (tabla, etiqueta_cardinalidad_hacia_el_padre, [hijos])
CLUSTERS = [
    ("Clientes, módulos y conciliaciones", [
        ("modulos", "", [
            ("campos_modulo", "1:N", []),
            ("modulos_cliente", "1:N", []),
        ]),
        ("clientes", "", [
            ("conciliaciones", "1:N", [
                ("filas_conciliacion", "1:N", []),
                ("comentarios_conciliacion", "1:N", []),
            ]),
        ]),
    ]),
    ("Impuestos · DIAN", [
        ("formularios_dian", "", [
            ("periodos_dian", "1:N", []),
            ("secciones_dian", "1:N", [
                ("renglones_dian", "1:N", []),
            ]),
            ("mapeos_dian", "1:N", []),
            ("comentarios_dian", "1:N", []),
        ]),
    ]),
    ("Requerimientos · Plantillas y repositorios", [
        ("plantillas_requerimiento", "", [
            ("encabezados_plantilla_requerimiento", "1:1", []),
            ("familias_requerimiento", "1:N", [
                ("items_requerimiento", "1:N", []),
            ]),
        ]),
        ("repositorios_requerimiento", "", [
            ("familias_repositorio", "1:N", [
                ("items_repositorio", "1:N", []),
            ]),
            ("actividades_repositorio", "1:N", []),
        ]),
    ]),
]

# Tablas sin relaciones físicas
INDEPENDIENTES = [
    "usuarios", "intentos_inicio_sesion", "notificaciones", "registros_auditoria",
    "eventos_calendario", "balances", "cuentas_estandar", "contactos_cliente",
    "envios_requerimiento", "presentaciones_requerimiento",
    "cuentas_cliente", "opciones_russell",
]


# ---------------------------------------------------------------------------
# Pie de página y numeración
# ---------------------------------------------------------------------------
def _pie(canvas, doc, ancho):
    canvas.saveState()
    canvas.setStrokeColor(GRIS_LINEA)
    canvas.setLineWidth(0.4)
    canvas.line(2 * cm, 1.4 * cm, ancho - 2 * cm, 1.4 * cm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(GRIS)
    canvas.drawString(2 * cm, 1.0 * cm, "Russell Bedford · Conciliador/Diagnóstico — Esquema de base de datos")
    canvas.drawRightString(ancho - 2 * cm, 1.0 * cm, "Página %d" % doc.page)
    canvas.restoreState()


def pie_pagina(canvas, doc):
    _pie(canvas, doc, A4[0])


def pie_pagina_h(canvas, doc):
    _pie(canvas, doc, landscape(A4)[0])


# ---------------------------------------------------------------------------
# Construcción del documento
# ---------------------------------------------------------------------------
def build():
    doc = BaseDocTemplate(
        OUTPUT, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm,
        title="Esquema de base de datos — Russell Bedford",
        author="Russell Bedford",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    # Plantilla apaisada para el diagrama ER
    lw, lh = landscape(A4)
    frame_h = Frame(2 * cm, 2 * cm, lw - 4 * cm, lh - 4 * cm, id="main-h")
    doc.addPageTemplates([
        PageTemplate(id="con-pie", frames=[frame], onPage=pie_pagina, pagesize=A4),
        PageTemplate(id="con-pie-h", frames=[frame_h], onPage=pie_pagina_h, pagesize=landscape(A4)),
    ])
    ancho_dibujo = lw - 4 * cm

    story = []

    # Portada
    story.append(Spacer(1, 3.5 * cm))
    story.append(Paragraph("Esquema de la Base de Datos", st_titulo))
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph("Russell Bedford · Conciliador / Diagnóstico", st_subtitulo))
    story.append(Spacer(1, 1.2 * cm))
    fecha = datetime.now().strftime("%d/%m/%Y")
    resumen = (
        "Documento técnico detallado de todas las tablas y columnas de la base de datos "
        "(PostgreSQL), con sus tipos de dato y relaciones. Toda la nomenclatura física "
        "(tablas y columnas) está en <b>español</b>, según la convención del proyecto."
    )
    story.append(Paragraph(resumen, ParagraphStyle("res", parent=st_normal, alignment=TA_CENTER, textColor=GRIS)))
    story.append(Spacer(1, 0.8 * cm))
    total_tablas = sum(len(m["tablas"]) for m in ESQUEMA)
    total_cols = sum(len(t["cols"]) for m in ESQUEMA for t in m["tablas"])
    meta = Table(
        [
            ["Motor", "PostgreSQL"],
            ["ORM", "Prisma 7"],
            ["Total de tablas", str(total_tablas)],
            ["Total de columnas", str(total_cols)],
            ["Relaciones (FK)", str(len([r for r in RELACIONES if not r[2].endswith('*')]))],
            ["Fecha de generación", fecha],
        ],
        colWidths=[5 * cm, 6 * cm],
    )
    meta.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), AZUL_CLARO),
        ("TEXTCOLOR", (0, 0), (0, -1), AZUL),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.4, GRIS_LINEA),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(Table([[meta]], colWidths=[11 * cm],
                       style=TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")])))
    story.append(PageBreak())

    # Convención y leyenda
    story.append(banda_modulo("Convención y leyenda"))
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(
        "La base de datos sigue la convención de nombres en <b>español</b> con estilo "
        "<i>snake_case</i>. En Prisma se implementa con los atributos <b>@@map</b> (tablas) y "
        "<b>@map</b> (columnas); el identificador del modelo Prisma se conserva para el código, "
        "pero el objeto real en PostgreSQL siempre está en español.", st_normal))
    story.append(Spacer(1, 0.4 * cm))
    leyenda = [
        "<b>Llave:</b> PK = clave primaria · FK = clave foránea · UQ = parte de índice único · "
        "IDX = parte de índice · FK* = relación lógica (sin restricción física).",
        "<b>Nulo:</b> indica si la columna admite valores nulos (Sí/No).",
        "<b>Tipo:</b> tipo de dato físico en PostgreSQL.",
    ]
    for l in leyenda:
        story.append(Paragraph("• " + l, st_leyenda))
        story.append(Spacer(1, 2))
    story.append(PageBreak())

    # Módulos y tablas
    for modulo in ESQUEMA:
        story.append(banda_modulo(modulo["modulo"]))
        story.append(Spacer(1, 0.2 * cm))
        story.append(Paragraph(modulo["descripcion"], st_modulo_desc))
        for tabla in modulo["tablas"]:
            titulo = '%s  <font size="8" color="#6B7280">(modelo Prisma: %s)</font>' % (tabla["nombre"], tabla["modelo"])
            story.append(Paragraph(titulo, st_tabla_nombre))
            story.append(Paragraph(tabla["desc"], st_tabla_desc))
            story.append(construir_tabla_columnas(tabla["cols"]))
            story.append(Spacer(1, 0.35 * cm))
        story.append(PageBreak())

    # Diagrama Entidad-Relación (página apaisada)
    story.append(NextPageTemplate("con-pie-h"))
    story.append(PageBreak())
    st_diag_titulo = ParagraphStyle("DiagT", parent=st_tabla_nombre, fontSize=13, spaceBefore=4, spaceAfter=8)
    story.append(banda_modulo("Diagrama Entidad-Relación", ancho=ancho_dibujo / cm))
    story.append(Spacer(1, 0.25 * cm))
    story.append(Paragraph(
        "Cada caja es una tabla; las líneas representan las claves foráneas (relaciones). "
        "La etiqueta indica la cardinalidad. La tabla raíz de cada grupo se muestra resaltada.",
        st_modulo_desc))
    story.append(Spacer(1, 0.2 * cm))
    for titulo, arbol_hijos in CLUSTERS:
        story.append(Paragraph(titulo, st_diag_titulo))
        # Cada raíz como árbol independiente
        for raiz in arbol_hijos:
            story.append(dibujar_cluster(raiz, ancho_dibujo))
            story.append(Spacer(1, 0.35 * cm))
        story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph("Tablas independientes (sin claves foráneas físicas)", st_diag_titulo))
    story.append(Paragraph(
        "La relación cuentas_cliente → opciones_russell existe a nivel lógico de aplicación.",
        st_modulo_desc))
    story.append(grilla_independientes(INDEPENDIENTES, ancho_dibujo, cols=4))

    # Relaciones (vuelta a vertical)
    story.append(NextPageTemplate("con-pie"))
    story.append(PageBreak())
    story.append(banda_modulo("Relaciones entre tablas"))
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(
        "Resumen de todas las relaciones (claves foráneas) entre las tablas, con su "
        "cardinalidad y regla de borrado.", st_normal))
    story.append(Spacer(1, 0.4 * cm))
    story.append(construir_tabla_relaciones())
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(
        "* La relación <b>cuentas_cliente.codigo_russell → opciones_russell.codigo</b> es lógica "
        "a nivel de aplicación y no está forzada por una restricción física en la base de datos.",
        st_leyenda))

    doc.build(story)
    print("PDF generado en:", OUTPUT)


if __name__ == "__main__":
    build()
