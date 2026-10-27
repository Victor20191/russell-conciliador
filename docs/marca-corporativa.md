# Cumplimiento del Manual de Marca Corporativa de Russell Bedford

Revisión del 27 de octubre de 2026. Fuente: la carpeta `01_Marca_Corporativa` que entrega el área de mercadeo, revisada completa:

| Archivo | Uso en la plataforma |
|---|---|
| `Manual de Marca Corporativa.pdf` (26 páginas) | Reglas de esta matriz, página por página. De la página 20 (§5.2) sale además la marca de esquina del cuerpo de la presentación: cinco barras que cuelgan del borde (Mind Magenta, Sky Blue, Sky Blue, Space Blue, Space Blue) |
| `Logo_Imagotipo Azul oscuro_Logo_PDF…pdf` (vectorial) | `public/marca/russell-bedford-azul.svg` y `-blanco.svg`: el mismo trazado del PDF, con el azul en el RGB que fija el manual (§3.1, `#001871`; el PDF viene en CMYK y, convertido tal cual, daría `#252E61`) y en blanco para los fondos de color (§1.2). Es el logotipo de la interfaz, el PDF, el HTML y las presentaciones |
| `Isotipo_Azul oscuro_Logo_PDF…pdf` (vectorial) | `public/marca/isotipo-azul.svg` y `-blanco.svg`: el globo como motivo decorativo del login (§4.1) |
| `Logos en PNG/Logo Azul Oscuro_Imagotipo…png` y `Logo Blanco_Imagotipo…png` | `russell-bedford-azul-600.png` y `-blanco-600.png` (solo se recortó el lienzo transparente): el correo, porque los clientes de correo no muestran SVG. Sirvieron además para comprobar que el SVG es el mismo arte (misma proporción; el isotipo coincide en un 98 % de su superficie) |
| `Logos en PNG/Isotipo Azul Oscuro…png` e `Isotipo Blanco…png` | Referencia del isotipo (el motivo usa el SVG vectorial) |

Errata del manual: en §3.2 la fila RGB de Sky Blue dice «R:152, G:29, B:206»; su hexadecimal oficial (`#00a9ce`, el que se usa) corresponde a R0 G169 B206.

## Alcance

Todo lo que dibuja la plataforma sigue el manual: las pantallas y lo que se abre sobre ellas (listas desplegables, calendarios, sugerencias, avisos, mensajes de validación, confirmaciones, menús y paneles), los documentos que genera (PDF, HTML para descargar o copiar en un correo), los correos, los Excel, el ícono de la pestaña y de la app, y las presentaciones del repositorio.

Lo que queda fuera de la guía está en la sección «Lo que queda fuera de la guía», al final.

## Matriz regla por regla

| § | Regla del manual | Dónde se aplica | Verificación |
|---|---|---|---|
| Intro | Casos dudosos se consultan con mercadeo | Las decisiones de interpretación van al final de este documento | — |
| 1.1 | El logotipo oficial es el único símbolo de afiliación; no se admiten versiones alternativas, personalizadas ni antiguas | `LogoRussellBedford` (`src/components/marca.tsx`) y `logoHtml` (`src/lib/marca/html.ts`) usan el arte oficial. Se eliminó el `BrandMark` redibujado, que estaba en otro azul | Recorridos en pantalla, PDF y correo |
| 1.1 | «taking you further» siempre con el logo, solo en inglés | El arte oficial lo incluye; el texto alternativo es «Russell Bedford · taking you further» | Ídem |
| 1.2 | Símbolo, nombre y eslogan en relación fija, sin modificar ni redibujar | El SVG es el trazado del PDF oficial, con proporción fija (412,6 × 89,5) | Comparación con el PNG oficial |
| 1.2 | Azul sobre blanco; blanco sobre fondo de color sólido; negro solo para impresión en blanco y negro | Blanco sobre Space Blue: menú, login, soporte y correos. Azul sobre fondo claro: login móvil, seguimiento, cambio de contraseña, 404, errores, PDF, HTML y presentaciones. La plataforma no imprime en blanco y negro | Capturas |
| 2.1 | Lato como tipografía principal (incluido el material impreso) | Interfaz (`src/app/fuente-lato.ts`; 300, 400, 400 itálica, 700, 700 itálica, 900), PDF (Lato incrustada), HTML generado y presentaciones | `css-compilado.test.ts`; recorridos: todo el texto en Lato; `pdffonts`: solo Lato |
| 2.2 | Arial como alternativa (documentos editables, correo), «para que el texto no use otras fuentes inapropiadas» | Excel (`escribirLibroMarca`), plantillas, informes de `scripts/`, correos y copia del reporte para un correo. En pantalla, Arial dibuja solo lo que Lato no trae (flechas, griego, ≈ ≠ ≥ ▲ ▼ ●). Un emoji o un símbolo que no tengan ni Lato ni Arial no llega a dibujarse: en el código se cambió por íconos SVG del sistema (`Icon`, `IconoEnTexto`) o por «×» y «…»; en lo que escriben las personas, la plataforma lo cambia por su equivalente o lo retira al mostrarlo (lo guardado no cambia) y no lo admite al escribir (`src/lib/marca/glifos.ts`, `controles-marca/glifos.tsx`). El PDF, que se arma en el servidor, usa solo glifos de Lato | `glifos.test.ts`, `glifos-texto.test.ts`; recorridos: ningún glifo fuera de Lato y Arial |
| 3.1 | Color principal PAN 2748 RBI Space Blue `#001871` y sus tintes al 80, 60, 40 y 20 % | Tema `src/app/globals.css` (`navy-*`, `space-blue-*`) y `src/lib/marca/paleta.ts` | `marca.test.ts` recalcula cada tinte |
| 3.2 | Complementarios Sea Green, Earth Orange, Sky Blue y Mind Magenta con sus tintes; para gráficos corporativos y áreas | Estados de la interfaz (éxito, advertencia, información, error), gráficos del reporte, franja y marca de esquina. Las transparencias solo van al 20, 40, 60 u 80 %, que sobre blanco son exactamente los tintes. Sin desenfoques ni filtros de color | `css-compilado.test.ts` (cada color, mezcla y transparencia del CSS publicado); recorridos y control por píxel |
| 3.3 | Positivo y negativo | Variante `azul` o `blanco` según el fondo; tinte de un complementario con texto Space Blue | Capturas |
| 4.1 | No modificar, tapar ni separar las partes; usar el color principal y la versión negativa cuando se pierda visibilidad | Componente único; espacio libre reservado | — |
| 4.1 | El globo solo como motivo decorativo, nunca como logo, ni distorsionado ni girado | `MotivoGlobo` (decorativo, sin texto alternativo) en el login, recortado y sin girar. Con el menú contraído no se muestra marca. El ícono de la pestaña y de la app es la marca de esquina de la presentación oficial (§5.2): las cinco barras | `src/app/favicon.ico`, `icon.png`, `apple-icon.png` |
| 4.2 | No agregar palabras para leerse con el nombre | «Conciliador» va aparte (chip de versión, rótulo) y fuera del espacio libre | Capturas |
| 4.2 | Espacio libre de al menos el 20 % del ancho del logo | `espacioLibreLogo()` (padding), `logoHtml` y las portadas | — |
| 4.2 | Ancho mínimo de 30 mm | `ANCHO_MINIMO_LOGO_PX = 114` (30 mm a 96 ppp); un ancho menor se lleva al mínimo | — |
| 4.2 | No usar versiones anteriores, no distorsionar, no encerrar en una forma distintiva | Archivo oficial con proporción fija y sin marco; los fondos son de color sólido (§1.2) | — |
| 5.1 | Membrete: tamaño carta, márgenes de 2,5 cm arriba y abajo y 3 cm a los lados, Arial 12 | El PDF del reporte para gerencia: tamaño carta y esos márgenes, con el logotipo y la franja al pie. Arial 12 es la letra de las cartas en Word, que la plataforma no redacta; sus documentos impresos van en Lato, como pide §2.1 para el material impreso | `pdfinfo`: carta (612 × 792 pt) |
| 5.2 | Presentaciones: solo el formato oficial (portada y cuerpo) | Los dos HTML de `presentacion/` tienen la portada del formato oficial (logotipo grande centrado, título en Lato Light y la franja) y su cuerpo lleva la marca de esquina arriba a la derecha, el logotipo abajo a la derecha y la franja al pie; en lugar de sus 39 emojis, círculos de los colores complementarios | Recorrido de los archivos: 0 colores ajenos, todo en Lato |

Las piezas de §4.3 (fondos de videollamada) y de §5.3 a §5.8 (tarjetas de presentación, uniforme, vestuario, carnet, oficina y objetos) son físicas o de otros programas: la plataforma no produce ninguna. Si algún día produce una, deberá seguir esas secciones.

## Elementos que el manual muestra y la plataforma reutiliza

- **Franja de cuatro colores** (portada, diapositivas y membrete): Space Blue, Mind Magenta, Sea Green y Earth Orange en partes iguales (`FRANJA_MARCA`). Va siempre sobre fondo claro, porque sobre el azul se pierde su primer tramo.
- **Marca de esquina** (cuerpo de la presentación, §5.2): las cinco barras. Es el ícono de la app y la marca de las presentaciones.
- **Neutros**: el manual compone su texto en negro de proceso al 90 % (`#3C3C3B`), su logotipo negro al 100 % (`#1D1D1B`) y sus páginas usan un gris claro (`#D9D9D9`). Los grises de la interfaz son tintes de ese mismo negro de proceso.
- **Composición de las páginas interiores del manual**: logotipo arriba a la izquierda, título en Lato Light Space Blue y círculos de los colores complementarios como motivo. Es la que siguen los documentos generados.

## Lo que el navegador dibujaría y la plataforma dibuja con la marca

Un sitio web deja, por defecto, que el navegador dibuje con los colores y la fuente del sistema operativo varias piezas de la página. En la plataforma, todas son de la marca:

- **Listas de los `<select>`** (91), **calendarios** de los campos de fecha y de mes (10), **sugerencias** de los `<datalist>` (7), **avisos** de `title` (555), **mensajes de validación** de los formularios (en español, sin depender del idioma del navegador) y **confirmaciones** (antes, 7 `confirm()` del navegador): `src/components/controles-marca/`, montado una vez en el layout raíz. El control nativo sigue siendo el dueño del valor, así que formularios, eventos y envíos no cambian; se abren con el mouse, el teclado (Espacio, Alt + ↓, F4, flechas) y el toque.
- En `globals.css`: casillas, radios y rangos (`accent-color`), la selección de texto, el foco, el texto guía de los campos (el preflight de Tailwind lo mezclaba al 50 %), el autocompletado (el navegador pinta el campo de celeste y el texto en negro puro), las barras de desplazamiento, el ícono del calendario y el tramo de la fecha que se edita, el corrector ortográfico y el texto resaltado desde un enlace.
- Una foto de perfil o un adjunto que no carga no muestra el ícono roto del navegador: el avatar vuelve a las iniciales y los adjuntos muestran un aviso en la paleta, también cuando la imagen falla antes de que la página termine de cargar (`src/components/imagen-con-respaldo.tsx`).
- `theme-color` en Space Blue y páginas 404 propias (la de Next usa la fuente del sistema, negro puro y el modo oscuro del equipo).

## Contenido de clientes y personas

- Las fotos de perfil (el manual también lleva la foto de la persona, en el carnet de §5.6), los adjuntos y los archivos de los clientes se muestran como son: son su contenido. La muestra de un patrón (`src/lib/modulos/patrones/muestra-recortada.ts`) copia a propósito el formato del archivo del cliente, porque sirve para reconocer ese formato.
- Lo que escriben las personas (tickets, comentarios, notas, nombres traídos de un archivo) se muestra con los glifos de la marca (fila 2.2 de la matriz).
- El HTML que redacta un modelo de IA (reporte de Novedades) y los reportes para gerencia ya guardados se llevan a la marca al mostrarse: colores, tipografía, logotipo, franja y glifos (`ajustarHtmlAMarca`, `conMarcaDocumento`, `ajustarMaquetacionReporte`; los ▲, ▼ y «A → B» de los reportes guardados pasan a triángulos SVG y a raya «A – B»).
- Los mensajes de consola de `scripts/` son de la terminal, no de la plataforma.

## Decisiones de interpretación

En todos los casos se usa algo del manual:

1. **Error en Mind Magenta**: el manual no tiene rojo; el error usa uno de sus cinco colores, el complementario de lectura más fuerte (7,5:1 sobre blanco).
2. **Texto de los complementarios claros**: Sea Green, Earth Orange y Sky Blue no alcanzan 3:1 sobre blanco, así que su texto va en Space Blue y sus fondos sólidos llevan texto Space Blue (el «positivo» del manual).
3. **Grises**: tintes del negro de proceso con que el manual compone su texto; las sombras son ese mismo negro con transparencia.
4. **Glifos que Lato no trae**: los dibuja Arial, como dispone §2.2.
5. **Ícono de la app**: la marca de esquina de §5.2, porque el imagotipo no cabe a 16 px (su mínimo es 30 mm) y el globo no puede usarse como logo (§4.1).


## Verificación

- **Pruebas permanentes** (`npx vitest run src/lib/marca src/lib/export/marca-excel.test.ts src/lib/auditoria/reporte-ejecutivo/signos.test.ts`):
  - `marca.test.ts`: valores y tintes de la paleta; tema de Tailwind; ningún hexadecimal, ARGB, `%23…` de un `data:` URI, `rgb()`/`hsl()`/`oklch()`/`color-mix()` literal ni color con nombre fuera de la paleta en `src/` y `scripts/`; ninguna clase de color ajena; transparencias solo al 20, 40, 60 u 80 %; sin desenfoques ni filtros de color; sin `confirm()`, `alert()` ni `prompt()`; sin serif, monoespaciada ni otras familias; ajuste del HTML generado (colores, comentarios y glifos) y del correo.
  - `clases-tailwind.test.ts`: cada clase de color del código genera CSS (con control negativo).
  - `css-compilado.test.ts` (**exhaustiva**): escanea todo `src/` con el mismo escáner del build (más de 16.000 clases candidatas: las de cualquier pantalla, pestaña, modal o estado), compila `globals.css` con todas y revisa cada color, transparencia, mezcla, color con nombre o del sistema y familia tipográfica del CSS resultante. `globals.css` escanea solo el código de la app (`source(none)` + `@source "../"`, sin las pruebas).
  - `glifos.test.ts` y `glifos-texto.test.ts`: cada carácter de los textos del código está en la Lato publicada (su tabla de caracteres, leída de los archivos) o en Arial; y el ajuste de lo que escriben las personas, al mostrar, al escribir y para el PDF.
  - `emergentes.test.ts`: posición de las ventanas, sugerencias, calendario y mensajes de validación.
  - `marca-excel.test.ts`, `recursos-pdf.test.ts` y `signos.test.ts`.
- **Recorridos con datos reales** (27 de octubre de 2026). La base de producción se leyó en una sesión de solo lectura (`default_transaction_read_only=on`) y se copió a una base PostgreSQL local, donde se dejaron inválidas las claves de servicios externos; se ingresó con un usuario creado solo en esa copia. La copia, las capturas y los PDF se borraron al terminar. Sobre el build de producción (`next build` + `next start`):
  - **2.248 pantallas**: todas las rutas de la app (57 tipos de página) y cada balance (235) con sus cinco pestañas, cada cargue de módulo (100) con todas sus pestañas, los 54 borradores de balance y los 22 de módulos, las 62 versiones de patrones, los 90 tickets, los períodos DIAN, las conciliaciones, los visores por tercero y las comparaciones de versiones. En cada una se revisaron todos los elementos visibles (1.625.745 en total), también `::before`, `::after`, el texto guía, las viñetas y el botón de archivo: color del texto, fondo, bordes, contorno, subrayado y relleno o trazo de SVG, convertidos a sRGB y comparados con la paleta; la familia tipográfica; y cada carácter del texto contra las tablas de caracteres de Lato y Arial.
  - **Control por píxel** de las 2.973 capturas (pantallas, modales y móvil): ningún color que no sea de la paleta o una mezcla óptica de sus colores (suavizado y el velo de los modales).
  - **Modales, menús y paneles**: en 149 pantallas reales (una o varias de cada tipo, con sus pestañas) se pulsó cada botón distinto y se auditó lo que se abrió: 576 en 123 pantallas (199 modales y 377 menús, desplegables o paneles, como la ayuda y las notificaciones), con 891.948 elementos revisados.
  - **Controles de la marca**: listas de `<select>` (con mouse y teclado), calendarios de fecha y de mes, sugerencias, avisos, validación, escritura y confirmaciones, comprobando que la ventana del sistema no se abre (`:open`) y que el valor cambia: 31 de 31.
  - **Móvil** (las mismas 149 pantallas a 390 px, con el menú abierto), **páginas públicas** (login, mesa de ayuda, seguimiento de un ticket, 404), los **40 reportes guardados** dentro de su `iframe`, uno nuevo generado con los datos reales y sus **PDF** (solo Lato, tamaño carta).
- Resultado: en lo que dibuja la plataforma, **0 colores fuera del manual, todo el texto en Lato (y Arial en los glifos que Lato no trae) y ninguna ventana ni glifo dibujado por el sistema operativo**. No es todo: queda lo de la sección siguiente.

## Lo que queda fuera de la guía

Tres cosas, y ninguna es parte del diseño de la plataforma:

1. **La interfaz del navegador y del sistema operativo**: su barra y sus pestañas, sus menús, el diálogo para elegir un archivo del equipo (el que abre «Elegir archivo» al subir un balance o un adjunto), el de imprimir y las sugerencias de contraseñas guardadas. Ninguna página web puede dibujarlas ni darles otros colores o letra. La plataforma no abre el de imprimir (descarga PDF) ni cambia los menús del navegador; reemplazarlos por menús propios quitaría funciones como copiar y pegar.
2. **La confirmación al salir con cambios sin guardar** (borrador de un módulo y Consolidado). Es del navegador y tampoco se puede dibujar. Se mantiene por decisión del 27 de octubre de 2026: protege el trabajo que aún no se guardó (la pérdida del TKT-76), y la alternativa —guardar esos cambios en el navegador y ofrecer recuperarlos— deja datos del cliente en el equipo.
3. **La plantilla editable de presentaciones de §5.2**: no viene en la carpeta y el manual pide solicitarla a mercadeo. Las dos presentaciones del repositorio usan el formato que el manual muestra en esa sección (portada y cuerpo), por decisión del 27 de octubre de 2026; si llega la plantilla, se rehacen con ella.
