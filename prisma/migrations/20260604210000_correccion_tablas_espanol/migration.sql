-- Correccion: traducir al espanol todas las tablas y columnas de la base de datos.
-- Se usa ALTER ... RENAME para preservar los datos existentes (no se borra nada).

-- ===========================================================================
-- 1) RENOMBRAR TABLAS
-- ===========================================================================
ALTER TABLE "User" RENAME TO "usuarios";
ALTER TABLE "LoginAttempt" RENAME TO "intentos_inicio_sesion";
ALTER TABLE "Client" RENAME TO "clientes";
ALTER TABLE "Module" RENAME TO "modulos";
ALTER TABLE "ModuleField" RENAME TO "campos_modulo";
ALTER TABLE "ClientModule" RENAME TO "modulos_cliente";
ALTER TABLE "Reconciliation" RENAME TO "conciliaciones";
ALTER TABLE "ReconciliationRow" RENAME TO "filas_conciliacion";
ALTER TABLE "ReconciliationComment" RENAME TO "comentarios_conciliacion";
ALTER TABLE "Notification" RENAME TO "notificaciones";
ALTER TABLE "AuditEntry" RENAME TO "registros_auditoria";
ALTER TABLE "StandardAccount" RENAME TO "cuentas_estandar";
ALTER TABLE "Balance" RENAME TO "balances";
ALTER TABLE "DianForm" RENAME TO "formularios_dian";
ALTER TABLE "DianPeriod" RENAME TO "periodos_dian";
ALTER TABLE "DianSection" RENAME TO "secciones_dian";
ALTER TABLE "DianLine" RENAME TO "renglones_dian";
ALTER TABLE "DianMapping" RENAME TO "mapeos_dian";
ALTER TABLE "DianComment" RENAME TO "comentarios_dian";
ALTER TABLE "ClientAccount" RENAME TO "cuentas_cliente";
ALTER TABLE "RussellOption" RENAME TO "opciones_russell";
ALTER TABLE "ClientContact" RENAME TO "contactos_cliente";
ALTER TABLE "ReqTemplate" RENAME TO "plantillas_requerimiento";
ALTER TABLE "ReqTemplateHeader" RENAME TO "encabezados_plantilla_requerimiento";
ALTER TABLE "ReqFamily" RENAME TO "familias_requerimiento";
ALTER TABLE "ReqItem" RENAME TO "items_requerimiento";
ALTER TABLE "ReqSubmission" RENAME TO "envios_requerimiento";
ALTER TABLE "ReqRepository" RENAME TO "repositorios_requerimiento";
ALTER TABLE "ReqRepoFamily" RENAME TO "familias_repositorio";
ALTER TABLE "ReqRepoItem" RENAME TO "items_repositorio";
ALTER TABLE "ReqRepoActivity" RENAME TO "actividades_repositorio";
ALTER TABLE "ReqPresentation" RENAME TO "presentaciones_requerimiento";
ALTER TABLE "CalendarEvent" RENAME TO "eventos_calendario";

-- ===========================================================================
-- 2) RENOMBRAR COLUMNAS
-- ===========================================================================

-- usuarios
ALTER TABLE "usuarios" RENAME COLUMN "email" TO "correo";
ALTER TABLE "usuarios" RENAME COLUMN "password" TO "contrasena";
ALTER TABLE "usuarios" RENAME COLUMN "name" TO "nombre";
ALTER TABLE "usuarios" RENAME COLUMN "role" TO "rol";
ALTER TABLE "usuarios" RENAME COLUMN "initials" TO "iniciales";
ALTER TABLE "usuarios" RENAME COLUMN "active" TO "activo";
ALTER TABLE "usuarios" RENAME COLUMN "sessionVersion" TO "version_sesion";
ALTER TABLE "usuarios" RENAME COLUMN "mustChangePassword" TO "debe_cambiar_contrasena";
ALTER TABLE "usuarios" RENAME COLUMN "lastLoginAt" TO "ultimo_inicio_sesion";
ALTER TABLE "usuarios" RENAME COLUMN "createdAt" TO "creado_en";
ALTER TABLE "usuarios" RENAME COLUMN "updatedAt" TO "actualizado_en";

-- intentos_inicio_sesion
ALTER TABLE "intentos_inicio_sesion" RENAME COLUMN "email" TO "correo";
ALTER TABLE "intentos_inicio_sesion" RENAME COLUMN "success" TO "exitoso";
ALTER TABLE "intentos_inicio_sesion" RENAME COLUMN "createdAt" TO "creado_en";

-- clientes
ALTER TABLE "clientes" RENAME COLUMN "name" TO "nombre";
ALTER TABLE "clientes" RENAME COLUMN "createdAt" TO "creado_en";

-- modulos
ALTER TABLE "modulos" RENAME COLUMN "name" TO "nombre";
ALTER TABLE "modulos" RENAME COLUMN "icon" TO "icono";

-- campos_modulo
ALTER TABLE "campos_modulo" RENAME COLUMN "moduleId" TO "modulo_id";
ALTER TABLE "campos_modulo" RENAME COLUMN "key" TO "clave";
ALTER TABLE "campos_modulo" RENAME COLUMN "label" TO "etiqueta";
ALTER TABLE "campos_modulo" RENAME COLUMN "type" TO "tipo";
ALTER TABLE "campos_modulo" RENAME COLUMN "required" TO "requerido";
ALTER TABLE "campos_modulo" RENAME COLUMN "hint" TO "ayuda";
ALTER TABLE "campos_modulo" RENAME COLUMN "order" TO "orden";

-- modulos_cliente
ALTER TABLE "modulos_cliente" RENAME COLUMN "clientId" TO "cliente_id";
ALTER TABLE "modulos_cliente" RENAME COLUMN "moduleId" TO "modulo_id";
ALTER TABLE "modulos_cliente" RENAME COLUMN "status" TO "estado";

-- conciliaciones
ALTER TABLE "conciliaciones" RENAME COLUMN "clientId" TO "cliente_id";
ALTER TABLE "conciliaciones" RENAME COLUMN "clientName" TO "nombre_cliente";
ALTER TABLE "conciliaciones" RENAME COLUMN "module" TO "modulo";
ALTER TABLE "conciliaciones" RENAME COLUMN "period" TO "periodo";
ALTER TABLE "conciliaciones" RENAME COLUMN "status" TO "estado";
ALTER TABLE "conciliaciones" RENAME COLUMN "diff" TO "diferencia";
ALTER TABLE "conciliaciones" RENAME COLUMN "date" TO "fecha";
ALTER TABLE "conciliaciones" RENAME COLUMN "owner" TO "responsable";
ALTER TABLE "conciliaciones" RENAME COLUMN "cutoff" TO "corte";
ALTER TABLE "conciliaciones" RENAME COLUMN "runAt" TO "ejecutado_en";
ALTER TABLE "conciliaciones" RENAME COLUMN "runBy" TO "ejecutado_por";
ALTER TABLE "conciliaciones" RENAME COLUMN "lastActivity" TO "ultima_actividad";
ALTER TABLE "conciliaciones" RENAME COLUMN "materiality" TO "materialidad";
ALTER TABLE "conciliaciones" RENAME COLUMN "createdAt" TO "creado_en";

-- filas_conciliacion
ALTER TABLE "filas_conciliacion" RENAME COLUMN "reconciliationId" TO "conciliacion_id";
ALTER TABLE "filas_conciliacion" RENAME COLUMN "desc" TO "descripcion";
ALTER TABLE "filas_conciliacion" RENAME COLUMN "cont" TO "saldo_contabilidad";
ALTER TABLE "filas_conciliacion" RENAME COLUMN "mod" TO "saldo_modulo";
ALTER TABLE "filas_conciliacion" RENAME COLUMN "diff" TO "diferencia";
ALTER TABLE "filas_conciliacion" RENAME COLUMN "manualStatus" TO "estado_manual";
ALTER TABLE "filas_conciliacion" RENAME COLUMN "order" TO "orden";

-- comentarios_conciliacion
ALTER TABLE "comentarios_conciliacion" RENAME COLUMN "reconciliationId" TO "conciliacion_id";
ALTER TABLE "comentarios_conciliacion" RENAME COLUMN "who" TO "autor";
ALTER TABLE "comentarios_conciliacion" RENAME COLUMN "initials" TO "iniciales";
ALTER TABLE "comentarios_conciliacion" RENAME COLUMN "text" TO "texto";
ALTER TABLE "comentarios_conciliacion" RENAME COLUMN "time" TO "hora";
ALTER TABLE "comentarios_conciliacion" RENAME COLUMN "createdAt" TO "creado_en";

-- notificaciones
ALTER TABLE "notificaciones" RENAME COLUMN "kind" TO "tipo";
ALTER TABLE "notificaciones" RENAME COLUMN "who" TO "autor";
ALTER TABLE "notificaciones" RENAME COLUMN "text" TO "texto";
ALTER TABLE "notificaciones" RENAME COLUMN "target" TO "destino";
ALTER TABLE "notificaciones" RENAME COLUMN "time" TO "hora";
ALTER TABLE "notificaciones" RENAME COLUMN "unread" TO "no_leida";
ALTER TABLE "notificaciones" RENAME COLUMN "createdAt" TO "creado_en";

-- registros_auditoria
ALTER TABLE "registros_auditoria" RENAME COLUMN "ts" TO "marca_tiempo";
ALTER TABLE "registros_auditoria" RENAME COLUMN "user" TO "usuario";
ALTER TABLE "registros_auditoria" RENAME COLUMN "action" TO "accion";
ALTER TABLE "registros_auditoria" RENAME COLUMN "entity" TO "entidad";
ALTER TABLE "registros_auditoria" RENAME COLUMN "detail" TO "detalle";
ALTER TABLE "registros_auditoria" RENAME COLUMN "createdAt" TO "creado_en";

-- cuentas_estandar
ALTER TABLE "cuentas_estandar" RENAME COLUMN "code" TO "codigo";
ALTER TABLE "cuentas_estandar" RENAME COLUMN "name" TO "nombre";
ALTER TABLE "cuentas_estandar" RENAME COLUMN "level" TO "nivel";
ALTER TABLE "cuentas_estandar" RENAME COLUMN "nature" TO "naturaleza";
ALTER TABLE "cuentas_estandar" RENAME COLUMN "parent" TO "padre";
ALTER TABLE "cuentas_estandar" RENAME COLUMN "critical" TO "critica";

-- balances
ALTER TABLE "balances" RENAME COLUMN "clientName" TO "nombre_cliente";
ALTER TABLE "balances" RENAME COLUMN "clientNit" TO "nit_cliente";
ALTER TABLE "balances" RENAME COLUMN "period" TO "periodo";
ALTER TABLE "balances" RENAME COLUMN "isOfficial" TO "es_oficial";
ALTER TABLE "balances" RENAME COLUMN "isFrozen" TO "esta_congelado";
ALTER TABLE "balances" RENAME COLUMN "status" TO "estado";
ALTER TABLE "balances" RENAME COLUMN "complete" TO "completitud";
ALTER TABLE "balances" RENAME COLUMN "sums" TO "sumas";
ALTER TABLE "balances" RENAME COLUMN "validations" TO "validaciones";
ALTER TABLE "balances" RENAME COLUMN "breakdown" TO "desglose";
ALTER TABLE "balances" RENAME COLUMN "meta" TO "metadatos";
ALTER TABLE "balances" RENAME COLUMN "versionHistory" TO "historial_versiones";
ALTER TABLE "balances" RENAME COLUMN "diff" TO "comparativo";
ALTER TABLE "balances" RENAME COLUMN "auditLog" TO "bitacora";
ALTER TABLE "balances" RENAME COLUMN "incomeStatement" TO "estado_resultado";
ALTER TABLE "balances" RENAME COLUMN "lastUpload" TO "ultima_carga";
ALTER TABLE "balances" RENAME COLUMN "createdAt" TO "creado_en";

-- formularios_dian
ALTER TABLE "formularios_dian" RENAME COLUMN "name" TO "nombre";
ALTER TABLE "formularios_dian" RENAME COLUMN "code" TO "codigo";
ALTER TABLE "formularios_dian" RENAME COLUMN "periodicity" TO "periodicidad";
ALTER TABLE "formularios_dian" RENAME COLUMN "icon" TO "icono";
ALTER TABLE "formularios_dian" RENAME COLUMN "objective" TO "objetivo";

-- periodos_dian
ALTER TABLE "periodos_dian" RENAME COLUMN "periodKey" TO "clave_periodo";
ALTER TABLE "periodos_dian" RENAME COLUMN "label" TO "etiqueta";
ALTER TABLE "periodos_dian" RENAME COLUMN "status" TO "estado";
ALTER TABLE "periodos_dian" RENAME COLUMN "filed" TO "presentado";
ALTER TABLE "periodos_dian" RENAME COLUMN "formId" TO "formulario_id";

-- secciones_dian
ALTER TABLE "secciones_dian" RENAME COLUMN "formId" TO "formulario_id";
ALTER TABLE "secciones_dian" RENAME COLUMN "title" TO "titulo";
ALTER TABLE "secciones_dian" RENAME COLUMN "side" TO "lado";
ALTER TABLE "secciones_dian" RENAME COLUMN "note" TO "nota";
ALTER TABLE "secciones_dian" RENAME COLUMN "order" TO "orden";

-- renglones_dian
ALTER TABLE "renglones_dian" RENAME COLUMN "sectionId" TO "seccion_id";
ALTER TABLE "renglones_dian" RENAME COLUMN "k" TO "casilla";
ALTER TABLE "renglones_dian" RENAME COLUMN "label" TO "etiqueta";
ALTER TABLE "renglones_dian" RENAME COLUMN "decl" TO "declarado";
ALTER TABLE "renglones_dian" RENAME COLUMN "cont" TO "contabilidad";
ALTER TABLE "renglones_dian" RENAME COLUMN "diff" TO "diferencia";
ALTER TABLE "renglones_dian" RENAME COLUMN "order" TO "orden";

-- mapeos_dian
ALTER TABLE "mapeos_dian" RENAME COLUMN "formId" TO "formulario_id";
ALTER TABLE "mapeos_dian" RENAME COLUMN "lineKey" TO "clave_renglon";
ALTER TABLE "mapeos_dian" RENAME COLUMN "account" TO "cuenta";
ALTER TABLE "mapeos_dian" RENAME COLUMN "desc" TO "descripcion";
ALTER TABLE "mapeos_dian" RENAME COLUMN "sign" TO "signo";
ALTER TABLE "mapeos_dian" RENAME COLUMN "order" TO "orden";

-- comentarios_dian
ALTER TABLE "comentarios_dian" RENAME COLUMN "formId" TO "formulario_id";
ALTER TABLE "comentarios_dian" RENAME COLUMN "lineKey" TO "clave_renglon";
ALTER TABLE "comentarios_dian" RENAME COLUMN "who" TO "autor";
ALTER TABLE "comentarios_dian" RENAME COLUMN "initials" TO "iniciales";
ALTER TABLE "comentarios_dian" RENAME COLUMN "text" TO "texto";
ALTER TABLE "comentarios_dian" RENAME COLUMN "time" TO "hora";
ALTER TABLE "comentarios_dian" RENAME COLUMN "isAI" TO "es_ia";
ALTER TABLE "comentarios_dian" RENAME COLUMN "createdAt" TO "creado_en";

-- cuentas_cliente
ALTER TABLE "cuentas_cliente" RENAME COLUMN "clientName" TO "nombre_cliente";
ALTER TABLE "cuentas_cliente" RENAME COLUMN "code" TO "codigo";
ALTER TABLE "cuentas_cliente" RENAME COLUMN "level" TO "nivel";
ALTER TABLE "cuentas_cliente" RENAME COLUMN "name" TO "nombre";
ALTER TABLE "cuentas_cliente" RENAME COLUMN "russellCode" TO "codigo_russell";
ALTER TABLE "cuentas_cliente" RENAME COLUMN "order" TO "orden";

-- opciones_russell
ALTER TABLE "opciones_russell" RENAME COLUMN "code" TO "codigo";
ALTER TABLE "opciones_russell" RENAME COLUMN "name" TO "nombre";
ALTER TABLE "opciones_russell" RENAME COLUMN "module" TO "modulo";

-- contactos_cliente
ALTER TABLE "contactos_cliente" RENAME COLUMN "clientName" TO "nombre_cliente";
ALTER TABLE "contactos_cliente" RENAME COLUMN "name" TO "nombre";
ALTER TABLE "contactos_cliente" RENAME COLUMN "role" TO "rol";
ALTER TABLE "contactos_cliente" RENAME COLUMN "email" TO "correo";
ALTER TABLE "contactos_cliente" RENAME COLUMN "primary" TO "principal";
ALTER TABLE "contactos_cliente" RENAME COLUMN "order" TO "orden";

-- plantillas_requerimiento
ALTER TABLE "plantillas_requerimiento" RENAME COLUMN "code" TO "codigo";
ALTER TABLE "plantillas_requerimiento" RENAME COLUMN "name" TO "nombre";
ALTER TABLE "plantillas_requerimiento" RENAME COLUMN "description" TO "descripcion";
ALTER TABLE "plantillas_requerimiento" RENAME COLUMN "activeVersion" TO "version_activa";
ALTER TABLE "plantillas_requerimiento" RENAME COLUMN "families" TO "familias";
ALTER TABLE "plantillas_requerimiento" RENAME COLUMN "timesUsed" TO "veces_usada";
ALTER TABLE "plantillas_requerimiento" RENAME COLUMN "lastUpdated" TO "actualizado_en";
ALTER TABLE "plantillas_requerimiento" RENAME COLUMN "lastUpdatedBy" TO "actualizado_por";

-- encabezados_plantilla_requerimiento
ALTER TABLE "encabezados_plantilla_requerimiento" RENAME COLUMN "templateId" TO "plantilla_id";
ALTER TABLE "encabezados_plantilla_requerimiento" RENAME COLUMN "firmName" TO "nombre_firma";
ALTER TABLE "encabezados_plantilla_requerimiento" RENAME COLUMN "city" TO "ciudad";
ALTER TABLE "encabezados_plantilla_requerimiento" RENAME COLUMN "intro" TO "introduccion";
ALTER TABLE "encabezados_plantilla_requerimiento" RENAME COLUMN "noteGeneric" TO "nota_generica";
ALTER TABLE "encabezados_plantilla_requerimiento" RENAME COLUMN "closing" TO "cierre";
ALTER TABLE "encabezados_plantilla_requerimiento" RENAME COLUMN "signatoryName" TO "nombre_firmante";
ALTER TABLE "encabezados_plantilla_requerimiento" RENAME COLUMN "signatoryRole" TO "rol_firmante";
ALTER TABLE "encabezados_plantilla_requerimiento" RENAME COLUMN "signatoryFooter" TO "pie_firmante";
ALTER TABLE "encabezados_plantilla_requerimiento" RENAME COLUMN "consecutivePrefix" TO "prefijo_consecutivo";
ALTER TABLE "encabezados_plantilla_requerimiento" RENAME COLUMN "contactEmails" TO "correos_contacto";

-- familias_requerimiento
ALTER TABLE "familias_requerimiento" RENAME COLUMN "templateId" TO "plantilla_id";
ALTER TABLE "familias_requerimiento" RENAME COLUMN "name" TO "nombre";
ALTER TABLE "familias_requerimiento" RENAME COLUMN "order" TO "orden";

-- items_requerimiento
ALTER TABLE "items_requerimiento" RENAME COLUMN "familyId" TO "familia_id";
ALTER TABLE "items_requerimiento" RENAME COLUMN "text" TO "texto";
ALTER TABLE "items_requerimiento" RENAME COLUMN "order" TO "orden";

-- envios_requerimiento
ALTER TABLE "envios_requerimiento" RENAME COLUMN "consec" TO "consecutivo";
ALTER TABLE "envios_requerimiento" RENAME COLUMN "templateCode" TO "codigo_plantilla";
ALTER TABLE "envios_requerimiento" RENAME COLUMN "templateVersion" TO "version_plantilla";
ALTER TABLE "envios_requerimiento" RENAME COLUMN "clientName" TO "nombre_cliente";
ALTER TABLE "envios_requerimiento" RENAME COLUMN "period" TO "periodo";
ALTER TABLE "envios_requerimiento" RENAME COLUMN "recipients" TO "destinatarios";
ALTER TABLE "envios_requerimiento" RENAME COLUMN "status" TO "estado";
ALTER TABLE "envios_requerimiento" RENAME COLUMN "date" TO "fecha";
ALTER TABLE "envios_requerimiento" RENAME COLUMN "sentBy" TO "enviado_por";
ALTER TABLE "envios_requerimiento" RENAME COLUMN "createdAt" TO "creado_en";

-- repositorios_requerimiento
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "consec" TO "consecutivo";
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "templateCode" TO "codigo_plantilla";
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "clientName" TO "nombre_cliente";
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "period" TO "periodo";
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "cutoff" TO "corte";
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "sentAt" TO "enviado_en";
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "sentBy" TO "enviado_por";
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "deadline" TO "fecha_limite";
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "daysLeft" TO "dias_restantes";
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "received" TO "recibidos";
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "pending" TO "pendientes";
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "overdue" TO "vencidos";
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "progress" TO "progreso";
ALTER TABLE "repositorios_requerimiento" RENAME COLUMN "status" TO "estado";

-- familias_repositorio
ALTER TABLE "familias_repositorio" RENAME COLUMN "repositoryId" TO "repositorio_id";
ALTER TABLE "familias_repositorio" RENAME COLUMN "code" TO "codigo";
ALTER TABLE "familias_repositorio" RENAME COLUMN "name" TO "nombre";
ALTER TABLE "familias_repositorio" RENAME COLUMN "received" TO "recibidos";
ALTER TABLE "familias_repositorio" RENAME COLUMN "pending" TO "pendientes";
ALTER TABLE "familias_repositorio" RENAME COLUMN "order" TO "orden";

-- items_repositorio
ALTER TABLE "items_repositorio" RENAME COLUMN "familyId" TO "familia_id";
ALTER TABLE "items_repositorio" RENAME COLUMN "idx" TO "indice";
ALTER TABLE "items_repositorio" RENAME COLUMN "doc" TO "documento";
ALTER TABLE "items_repositorio" RENAME COLUMN "due" TO "vencimiento";
ALTER TABLE "items_repositorio" RENAME COLUMN "status" TO "estado";
ALTER TABLE "items_repositorio" RENAME COLUMN "file" TO "archivo";
ALTER TABLE "items_repositorio" RENAME COLUMN "size" TO "tamano";
ALTER TABLE "items_repositorio" RENAME COLUMN "by" TO "por";
ALTER TABLE "items_repositorio" RENAME COLUMN "at" TO "en";
ALTER TABLE "items_repositorio" RENAME COLUMN "order" TO "orden";

-- actividades_repositorio
ALTER TABLE "actividades_repositorio" RENAME COLUMN "repositoryId" TO "repositorio_id";
ALTER TABLE "actividades_repositorio" RENAME COLUMN "at" TO "en";
ALTER TABLE "actividades_repositorio" RENAME COLUMN "role" TO "rol";
ALTER TABLE "actividades_repositorio" RENAME COLUMN "action" TO "accion";
ALTER TABLE "actividades_repositorio" RENAME COLUMN "detail" TO "detalle";
ALTER TABLE "actividades_repositorio" RENAME COLUMN "order" TO "orden";

-- presentaciones_requerimiento
ALTER TABLE "presentaciones_requerimiento" RENAME COLUMN "clientName" TO "nombre_cliente";
ALTER TABLE "presentaciones_requerimiento" RENAME COLUMN "title" TO "titulo";
ALTER TABLE "presentaciones_requerimiento" RENAME COLUMN "year" TO "anio";
ALTER TABLE "presentaciones_requerimiento" RENAME COLUMN "presented" TO "presentado";
ALTER TABLE "presentaciones_requerimiento" RENAME COLUMN "preparedBy" TO "preparado_por";
ALTER TABLE "presentaciones_requerimiento" RENAME COLUMN "slides" TO "diapositivas";
ALTER TABLE "presentaciones_requerimiento" RENAME COLUMN "author" TO "autor";
ALTER TABLE "presentaciones_requerimiento" RENAME COLUMN "date" TO "fecha";
ALTER TABLE "presentaciones_requerimiento" RENAME COLUMN "status" TO "estado";
ALTER TABLE "presentaciones_requerimiento" RENAME COLUMN "positives" TO "positivos";
ALTER TABLE "presentaciones_requerimiento" RENAME COLUMN "observed" TO "observado";
ALTER TABLE "presentaciones_requerimiento" RENAME COLUMN "evaluated" TO "evaluado";
ALTER TABLE "presentaciones_requerimiento" RENAME COLUMN "createdAt" TO "creado_en";

-- eventos_calendario
ALTER TABLE "eventos_calendario" RENAME COLUMN "date" TO "fecha";
ALTER TABLE "eventos_calendario" RENAME COLUMN "type" TO "tipo";
ALTER TABLE "eventos_calendario" RENAME COLUMN "title" TO "titulo";
ALTER TABLE "eventos_calendario" RENAME COLUMN "subtitle" TO "subtitulo";
ALTER TABLE "eventos_calendario" RENAME COLUMN "clientId" TO "cliente_id";
ALTER TABLE "eventos_calendario" RENAME COLUMN "order" TO "orden";

-- ===========================================================================
-- 3) RENOMBRAR LLAVES PRIMARIAS (PK)
-- ===========================================================================
ALTER TABLE "usuarios" RENAME CONSTRAINT "User_pkey" TO "usuarios_pkey";
ALTER TABLE "intentos_inicio_sesion" RENAME CONSTRAINT "LoginAttempt_pkey" TO "intentos_inicio_sesion_pkey";
ALTER TABLE "clientes" RENAME CONSTRAINT "Client_pkey" TO "clientes_pkey";
ALTER TABLE "modulos" RENAME CONSTRAINT "Module_pkey" TO "modulos_pkey";
ALTER TABLE "campos_modulo" RENAME CONSTRAINT "ModuleField_pkey" TO "campos_modulo_pkey";
ALTER TABLE "modulos_cliente" RENAME CONSTRAINT "ClientModule_pkey" TO "modulos_cliente_pkey";
ALTER TABLE "conciliaciones" RENAME CONSTRAINT "Reconciliation_pkey" TO "conciliaciones_pkey";
ALTER TABLE "filas_conciliacion" RENAME CONSTRAINT "ReconciliationRow_pkey" TO "filas_conciliacion_pkey";
ALTER TABLE "comentarios_conciliacion" RENAME CONSTRAINT "ReconciliationComment_pkey" TO "comentarios_conciliacion_pkey";
ALTER TABLE "notificaciones" RENAME CONSTRAINT "Notification_pkey" TO "notificaciones_pkey";
ALTER TABLE "registros_auditoria" RENAME CONSTRAINT "AuditEntry_pkey" TO "registros_auditoria_pkey";
ALTER TABLE "cuentas_estandar" RENAME CONSTRAINT "StandardAccount_pkey" TO "cuentas_estandar_pkey";
ALTER TABLE "balances" RENAME CONSTRAINT "Balance_pkey" TO "balances_pkey";
ALTER TABLE "formularios_dian" RENAME CONSTRAINT "DianForm_pkey" TO "formularios_dian_pkey";
ALTER TABLE "periodos_dian" RENAME CONSTRAINT "DianPeriod_pkey" TO "periodos_dian_pkey";
ALTER TABLE "secciones_dian" RENAME CONSTRAINT "DianSection_pkey" TO "secciones_dian_pkey";
ALTER TABLE "renglones_dian" RENAME CONSTRAINT "DianLine_pkey" TO "renglones_dian_pkey";
ALTER TABLE "mapeos_dian" RENAME CONSTRAINT "DianMapping_pkey" TO "mapeos_dian_pkey";
ALTER TABLE "comentarios_dian" RENAME CONSTRAINT "DianComment_pkey" TO "comentarios_dian_pkey";
ALTER TABLE "cuentas_cliente" RENAME CONSTRAINT "ClientAccount_pkey" TO "cuentas_cliente_pkey";
ALTER TABLE "opciones_russell" RENAME CONSTRAINT "RussellOption_pkey" TO "opciones_russell_pkey";
ALTER TABLE "contactos_cliente" RENAME CONSTRAINT "ClientContact_pkey" TO "contactos_cliente_pkey";
ALTER TABLE "plantillas_requerimiento" RENAME CONSTRAINT "ReqTemplate_pkey" TO "plantillas_requerimiento_pkey";
ALTER TABLE "encabezados_plantilla_requerimiento" RENAME CONSTRAINT "ReqTemplateHeader_pkey" TO "encabezados_plantilla_requerimiento_pkey";
ALTER TABLE "familias_requerimiento" RENAME CONSTRAINT "ReqFamily_pkey" TO "familias_requerimiento_pkey";
ALTER TABLE "items_requerimiento" RENAME CONSTRAINT "ReqItem_pkey" TO "items_requerimiento_pkey";
ALTER TABLE "envios_requerimiento" RENAME CONSTRAINT "ReqSubmission_pkey" TO "envios_requerimiento_pkey";
ALTER TABLE "repositorios_requerimiento" RENAME CONSTRAINT "ReqRepository_pkey" TO "repositorios_requerimiento_pkey";
ALTER TABLE "familias_repositorio" RENAME CONSTRAINT "ReqRepoFamily_pkey" TO "familias_repositorio_pkey";
ALTER TABLE "items_repositorio" RENAME CONSTRAINT "ReqRepoItem_pkey" TO "items_repositorio_pkey";
ALTER TABLE "actividades_repositorio" RENAME CONSTRAINT "ReqRepoActivity_pkey" TO "actividades_repositorio_pkey";
ALTER TABLE "presentaciones_requerimiento" RENAME CONSTRAINT "ReqPresentation_pkey" TO "presentaciones_requerimiento_pkey";
ALTER TABLE "eventos_calendario" RENAME CONSTRAINT "CalendarEvent_pkey" TO "eventos_calendario_pkey";

-- ===========================================================================
-- 4) RENOMBRAR LLAVES FORANEAS (FK)
-- ===========================================================================
ALTER TABLE "campos_modulo" RENAME CONSTRAINT "ModuleField_moduleId_fkey" TO "campos_modulo_modulo_id_fkey";
ALTER TABLE "modulos_cliente" RENAME CONSTRAINT "ClientModule_clientId_fkey" TO "modulos_cliente_cliente_id_fkey";
ALTER TABLE "modulos_cliente" RENAME CONSTRAINT "ClientModule_moduleId_fkey" TO "modulos_cliente_modulo_id_fkey";
ALTER TABLE "conciliaciones" RENAME CONSTRAINT "Reconciliation_clientId_fkey" TO "conciliaciones_cliente_id_fkey";
ALTER TABLE "filas_conciliacion" RENAME CONSTRAINT "ReconciliationRow_reconciliationId_fkey" TO "filas_conciliacion_conciliacion_id_fkey";
ALTER TABLE "comentarios_conciliacion" RENAME CONSTRAINT "ReconciliationComment_reconciliationId_fkey" TO "comentarios_conciliacion_conciliacion_id_fkey";
ALTER TABLE "periodos_dian" RENAME CONSTRAINT "DianPeriod_formId_fkey" TO "periodos_dian_formulario_id_fkey";
ALTER TABLE "secciones_dian" RENAME CONSTRAINT "DianSection_formId_fkey" TO "secciones_dian_formulario_id_fkey";
ALTER TABLE "renglones_dian" RENAME CONSTRAINT "DianLine_sectionId_fkey" TO "renglones_dian_seccion_id_fkey";
ALTER TABLE "mapeos_dian" RENAME CONSTRAINT "DianMapping_formId_fkey" TO "mapeos_dian_formulario_id_fkey";
ALTER TABLE "comentarios_dian" RENAME CONSTRAINT "DianComment_formId_fkey" TO "comentarios_dian_formulario_id_fkey";
ALTER TABLE "encabezados_plantilla_requerimiento" RENAME CONSTRAINT "ReqTemplateHeader_templateId_fkey" TO "encabezados_plantilla_requerimiento_plantilla_id_fkey";
ALTER TABLE "familias_requerimiento" RENAME CONSTRAINT "ReqFamily_templateId_fkey" TO "familias_requerimiento_plantilla_id_fkey";
ALTER TABLE "items_requerimiento" RENAME CONSTRAINT "ReqItem_familyId_fkey" TO "items_requerimiento_familia_id_fkey";
ALTER TABLE "familias_repositorio" RENAME CONSTRAINT "ReqRepoFamily_repositoryId_fkey" TO "familias_repositorio_repositorio_id_fkey";
ALTER TABLE "items_repositorio" RENAME CONSTRAINT "ReqRepoItem_familyId_fkey" TO "items_repositorio_familia_id_fkey";
ALTER TABLE "actividades_repositorio" RENAME CONSTRAINT "ReqRepoActivity_repositoryId_fkey" TO "actividades_repositorio_repositorio_id_fkey";

-- ===========================================================================
-- 5) RENOMBRAR INDICES UNICOS Y SECUNDARIOS
-- ===========================================================================
ALTER INDEX "User_email_key" RENAME TO "usuarios_correo_key";
ALTER INDEX "LoginAttempt_email_createdAt_idx" RENAME TO "intentos_inicio_sesion_correo_creado_en_idx";
ALTER INDEX "LoginAttempt_ip_createdAt_idx" RENAME TO "intentos_inicio_sesion_ip_creado_en_idx";
ALTER INDEX "ModuleField_moduleId_key_key" RENAME TO "campos_modulo_modulo_id_clave_key";
ALTER INDEX "ClientModule_clientId_moduleId_key" RENAME TO "modulos_cliente_cliente_id_modulo_id_key";
ALTER INDEX "Balance_clientName_period_version_key" RENAME TO "balances_nombre_cliente_periodo_version_key";
ALTER INDEX "DianPeriod_formId_periodKey_key" RENAME TO "periodos_dian_formulario_id_clave_periodo_key";
ALTER INDEX "ClientAccount_clientName_code_key" RENAME TO "cuentas_cliente_nombre_cliente_codigo_key";
ALTER INDEX "ReqTemplateHeader_templateId_key" RENAME TO "encabezados_plantilla_requerimiento_plantilla_id_key";
