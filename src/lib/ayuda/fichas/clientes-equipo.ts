// Ayuda en pantalla — fichas de Clientes y equipo (Clientes, Usuarios, Estructura) y Mi perfil.

import { REGLAS } from "../reglas";
import type { FichaAyuda } from "../tipos";

const ACCIONES = "src/app/actions";

export const FICHA_CLIENTES: FichaAyuda = {
  id: "equipo.clientes",
  titulo: "Clientes",
  proposito:
    "Los clientes de la firma con su tipo, aplicativos, módulos y responsables. Todos los consultan; cada quien edita según su papel en el cliente.",
  antesDeEmpezar: [
    "Hay dos niveles de edición: los datos operativos (sector, aplicativos, módulos y DIAN) y la ficha completa (razón social, NIT, tipo, socio y responsables).",
    "Un cliente que no está en tu cartera se abre solo para consultar.",
  ],
  etapas: [
    {
      titulo: "Consultar",
      acciones: [
        {
          nombre: "Buscar cliente o NIT · ERP contable · Sector",
          queHace: "Filtran la lista por nombre o NIT, por el aplicativo de contabilidad y por sector.",
          regla: REGLAS.verClientes,
        },
        { nombre: "Abrir el cliente", queHace: "Al hacer clic en el nombre o el NIT se abre su información.", regla: REGLAS.verClientes },
        { nombre: "Exportar a Excel", queHace: "Descarga todos los clientes con su configuración.", regla: REGLAS.verClientes },
      ],
    },
    {
      titulo: "Editar",
      acciones: [
        {
          nombre: "Datos operativos",
          queHace:
            "Sector, aplicativos por proceso (Contabilidad, Nómina, Inventarios y Activos fijos; varios por proceso), módulos del cliente y DIAN con sus formatos. Se guarda con «Guardar».",
          regla: REGLAS.editarClienteOperativo,
          fuente: { archivo: `${ACCIONES}/clients.ts`, funcion: "updateClient" },
        },
        {
          nombre: "Ficha completa y responsables",
          queHace:
            "Razón social, NIT, tipo (A, B o C), socio de la firma y los responsables: un gerente (valida), un senior (revisa) y uno o varios staff (ejecutan), elegidos en cascada según la jerarquía.",
          regla: REGLAS.configurarCliente,
          condiciones: [
            "El senior debe reportar al gerente y cada staff al senior.",
            "El socio queda como dato de la ficha; su acceso sale de la jerarquía de sus gerentes.",
          ],
          fuente: { archivo: `${ACCIONES}/clients.ts`, funcion: "updateClient" },
        },
      ],
    },
    {
      titulo: "Crear o eliminar",
      acciones: [
        {
          nombre: "Nuevo cliente",
          queHace: "Crea un cliente con su ficha completa; el código se asigna solo.",
          regla: REGLAS.crearCliente,
          condiciones: [
            "El NIT no puede repetirse.",
            "Quien crea el cliente queda en su equipo: un gerente, como su gerente; un socio elige a uno de sus gerentes.",
          ],
          fuente: { archivo: `${ACCIONES}/clients.ts`, funcion: "createClient" },
        },
        {
          nombre: "Importar desde Excel",
          queHace: "Crea varios clientes con la plantilla («Descargar plantilla Excel»); el staff se separa con «;».",
          regla: REGLAS.crearCliente,
          condiciones: [
            "Todo o nada: con un solo error no se crea ninguno.",
            "Quien importa queda en el equipo de cada cliente, como al crearlo uno por uno.",
          ],
          fuente: { archivo: `${ACCIONES}/import-clientes.ts`, funcion: "importarClientes" },
        },
        {
          nombre: "Eliminar",
          queHace: "Elimina el cliente y sus responsables.",
          regla: REGLAS.eliminarCliente,
          condiciones: ["No si tiene balances, borradores, cargues de módulo o conciliaciones: se eliminan antes."],
          fuente: { archivo: `${ACCIONES}/clients.ts`, funcion: "deleteClient" },
        },
      ],
    },
  ],
  estados: [
    { etiqueta: "A · B · C", significado: "Tipo de cliente." },
    { etiqueta: "Sin ERP contable", significado: "El cliente no tiene aplicativo de contabilidad: su balance no se puede cargar hasta asignarlo." },
    { etiqueta: "Pendiente · N/A", significado: "Estado de cada módulo del cliente: activo y por parametrizar, o no aplica." },
  ],
  preguntas: [
    {
      pregunta: "¿Por qué no puedo cambiar los responsables?",
      respuesta: "Los cambian el gerente o el socio en su cartera, y la administración. Staff y senior editan los datos operativos.",
    },
    {
      pregunta: "¿Por qué el cliente se abre solo para consultar?",
      respuesta: "No está en tu cartera: no eres responsable de él (ni, si eres socio, lo atiende uno de tus gerentes).",
    },
  ],
  relacionadas: [
    { label: "Usuarios", href: "/config/usuarios", permiso: "usuarios:ver" },
    { label: "Estructura", href: "/estructura", permiso: "estructura:ver" },
  ],
};

export const FICHA_USUARIOS: FichaAyuda = {
  id: "equipo.usuarios",
  titulo: "Usuarios",
  proposito: "El directorio del equipo: rol, correo y a quién reporta cada persona. Las cuentas las administra la administración de la plataforma.",
  etapas: [
    {
      titulo: "Consultar",
      acciones: [{ nombre: "Buscar por nombre, correo o rol", queHace: "Filtra el directorio.", regla: REGLAS.verUsuarios }],
    },
    {
      titulo: "Administrar cuentas",
      acciones: [
        {
          nombre: "Nuevo usuario",
          queHace: "Crea la cuenta con una contraseña temporal, que se cambia al primer ingreso, y define a quién reporta.",
          regla: REGLAS.crearUsuario,
          fuente: { archivo: `${ACCIONES}/users.ts`, funcion: "createUser" },
        },
        {
          nombre: "Editar",
          queHace: "Cambia nombre, correo, rol, a quién reporta, foto y si la cuenta está activa; también restablece la contraseña.",
          regla: REGLAS.editarUsuario,
          condiciones: ["No se cambia el rol de quien es responsable de clientes hasta reasignarlos."],
          fuente: { archivo: `${ACCIONES}/users.ts`, funcion: "updateUser" },
        },
        {
          nombre: "Desbloquear",
          queHace: "Quita el bloqueo por intentos fallidos de ingreso.",
          regla: REGLAS.editarUsuario,
          fuente: { archivo: `${ACCIONES}/users.ts`, funcion: "unlockUser" },
        },
        {
          nombre: "Eliminar",
          queHace: "Elimina la cuenta de forma definitiva; para retirar a alguien sin borrarlo se desmarca «Usuario activo».",
          regla: REGLAS.eliminarUsuario,
          condiciones: ["No se elimina a quien es responsable de clientes hasta reasignarlos."],
          fuente: { archivo: `${ACCIONES}/users.ts`, funcion: "deleteUser" },
        },
        {
          nombre: "Importar maestros",
          queHace: "Crea a socios, gerentes, seniors y staff desde Excel, con su jerarquía.",
          regla: REGLAS.crearUsuario,
          fuente: { archivo: `${ACCIONES}/import-maestros.ts`, funcion: "importarMaestros" },
        },
        {
          nombre: "Cargar fotos (ZIP)",
          queHace: "Asigna fotos de perfil en bloque; cada imagen se llama con la cédula de la persona.",
          regla: REGLAS.editarUsuario,
          fuente: { archivo: `${ACCIONES}/cargar-fotos.ts`, funcion: "cargarFotosUsuarios" },
        },
      ],
    },
  ],
  estados: [
    { etiqueta: "Activo · Inactivo", significado: "Una cuenta inactiva no puede ingresar." },
    { etiqueta: "Bloqueado", significado: "Bloqueada por intentos fallidos hasta la hora indicada o hasta que la desbloqueen." },
  ],
  preguntas: [
    {
      pregunta: "¿Cómo cambio mi rol o a quién reporto?",
      respuesta: "Lo cambia la administración de la plataforma en esta pantalla.",
    },
    { pregunta: "¿Cómo cambio mi foto?", respuesta: "En «Mi perfil», desde tu nombre al pie del menú." },
  ],
  relacionadas: [
    { label: "Estructura", href: "/estructura", permiso: "estructura:ver" },
    { label: "Mi perfil", href: "/perfil" },
  ],
};

export const FICHA_ESTRUCTURA: FichaAyuda = {
  id: "equipo.estructura",
  titulo: "Estructura",
  proposito: "El mapa de la organización: socios, gerentes, seniors y staff, y los clientes que atiende cada uno. Es solo de consulta.",
  etapas: [
    {
      titulo: "Consultar",
      acciones: [
        {
          nombre: "Tarjeta de una persona",
          queHace: "Abre su equipo a cargo y sus clientes; las migas de arriba permiten volver.",
          regla: REGLAS.verEstructura,
        },
        {
          nombre: "Sin superior asignado",
          queHace: "Lista a quienes no tienen superior activo en la jerarquía; se enlazan desde Usuarios.",
          regla: REGLAS.verEstructura,
        },
      ],
    },
  ],
  estados: [{ etiqueta: "Derivados", significado: "Los clientes de un socio son los que atienden sus gerentes." }],
  preguntas: [
    {
      pregunta: "¿Por qué alguien aparece «Sin superior asignado»?",
      respuesta: "No tiene un superior activo en la jerarquía; la administración lo corrige en Usuarios.",
    },
  ],
  relacionadas: [{ label: "Usuarios", href: "/config/usuarios", permiso: "usuarios:ver" }],
};

export const FICHA_PERFIL: FichaAyuda = {
  id: "equipo.perfil",
  titulo: "Mi perfil",
  proposito: "Tu cuenta: nombre, correo y rol (solo consulta) y tu foto de perfil.",
  etapas: [
    {
      titulo: "Tu foto",
      acciones: [
        {
          nombre: "Guardar foto",
          queHace: "Sube tu foto de perfil: JPG, PNG o WEBP de hasta 4 MB.",
          regla: REGLAS.cualquierUsuario,
          fuente: { archivo: `${ACCIONES}/perfil.ts`, funcion: "actualizarMiFoto" },
        },
        {
          nombre: "Quitar foto",
          queHace: "Quita tu foto; se muestran tus iniciales.",
          regla: REGLAS.cualquierUsuario,
          fuente: { archivo: `${ACCIONES}/perfil.ts`, funcion: "eliminarMiFoto" },
        },
      ],
    },
  ],
  preguntas: [
    {
      pregunta: "¿Cómo cambio mi contraseña?",
      respuesta: "La plataforma la pide cuando tienes una contraseña temporal. Para cambiarla en otro momento, pide a la administración que la restablezca.",
    },
    { pregunta: "¿Cómo cambio mi nombre o mi correo?", respuesta: "Los cambia la administración en Usuarios." },
  ],
};
