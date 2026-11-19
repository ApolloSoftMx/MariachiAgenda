---
name: MariachiTotal
description: Agenda y finanzas para mariachis: eventos por tandas, cotizaciones y cobros en un solo lugar.
colors:
  primary: "#6d28d9"
  on-primary: "#ffffff"
  primary-tint: "#f4edff"
  canvas: "#f7f6fb"
  surface: "#ffffff"
  ink: "#1f2430"
  muted: "#6b7280"
  line: "#e8e5f0"
  sidebar: "#1d1533"
  sidebar-ink: "#f4f0ff"
  guest: "#e11d48"
  own-event: "#7c3aed"
  danger: "#b52038"
  success: "#12663c"
  warning: "#7a5200"
  blue-bg: "#e6f0ff"
  blue-ink: "#1d4ed8"
  blue-line: "#d9e7ff"
  dark-canvas: "#14121d"
  dark-surface: "#1e1b2b"
  dark-ink: "#f2eff8"
  dark-primary: "#a98cf0"
  dark-on-primary: "#14121d"
typography:
  micro:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.6rem"
  bottom-label:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.66rem"
  calendar:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.68rem"
  label:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    letterSpacing: "0.03em"
  fine-print:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.8rem"
  hint:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.82rem"
  caption:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.84rem"
  note:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.85rem"
  toc:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.86rem"
  table:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.88rem"
  form:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.9rem"
  compact:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.95rem"
  body:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  subtitle:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.2
  brand:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
  icon:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.1rem"
  title:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.15rem"
    fontWeight: 700
    lineHeight: 1.2
  card-title:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.3rem"
  metric:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.35rem"
    fontWeight: 600
  page-title:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.5rem"
  manual-title:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.6rem"
  splash:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "2rem"
  manual-logo:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "2.4rem"
  login-logo:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "2.8rem"
rounded:
  xs: "4px"
  sm: "6px"
  chip: "8px"
  md: "10px"
  field: "12px"
  metric: "13px"
  event: "14px"
  lg: "16px"
  xl: "18px"
  login: "22px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "{colors.primary-tint}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 11px"
  badge:
    backgroundColor: "{colors.primary-tint}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  share-row:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "12px"
    padding: "10px 12px"
---

# Design System: MariachiTotal

## Overview

**Creative North Star: "El Escenario Iluminado"**

La agenda es un escenario ordenado: un fondo apagado, un reflector violeta sobre la acción y cada evento con su propio lugar y color. La app se usa sobre todo en el celular, entre presentaciones y con prisa, así que la jerarquía es inmediata: qué sigue, cuándo, con quién y cuánto se cobra. No hay espacio para la decoración que no ayude a decidir.

El sistema es lifted y expresivo dentro de una herramienta de trabajo: las tarjetas se separan del fondo con sombras suaves y desplazadas, y los estados (activo, pagado, cancelado, invitado) se comunican con color semántico antes que con texto. Los controles son familiares y precisos — botones, campos y pestañas reconocibles — para que la interfaz desaparezca en la tarea. El violeta aparece donde hay que actuar; el rojo de invitado y el color de cada agrupación identifican los eventos sin competir con él.

Claro y oscuro son el mismo escenario con distinta iluminación: no se rediseña la jerarquía, se invierten las superficies y se ajusta el acento para conservar contraste. La elección del usuario gana sobre la del dispositivo, y «Sistema» sigue la preferencia del dispositivo en vivo.

**Key Characteristics:**
- Reflector violeta sobre fondo apagado: acento escaso y decisivo.
- Tarjetas elevadas con sombra desplazada y desenfoque suave, no halos.
- Un solo tipo de letra (Inter) y una escala corta y legible en pantallas pequeñas.
- Color semántico para eventos propios, invitados, estados y finanzas.
- Dos temas, una sola jerarquía; superficies claras y oscuras con contraste verificado.

## Colors

La paleta es violeta de escenario sobre neutros fríos, con acentos semánticos para invitados, dinero y estados.

### Primary
- **Violeta de reflector** (#6d28d9): acciones principales, enlaces, navegación activa y el foco de los campos. En oscuro se aclara a `#a98cf0` para no perder contraste; sobre ese relleno más claro el texto pasa a `#14121d` para mantener 4.5:1.

### Neutral
- **Lienzo apagado** (#f7f6fb): fondo de la app; en oscuro, `#14121d`.
- **Superficie de tarjeta** (#ffffff): tarjetas, campos y modales; en oscuro, `#1e1b2b`.
- **Tinta de trabajo** (#1f2430): texto principal; en oscuro, `#f2eff8`.
- **Gris de apoyo** (#6b7280): etiquetas y texto secundario; en oscuro, `#a39db4`. Sobre superficies coloreadas se matiza desde el color de la superficie, nunca gris neutro.
- **Línea suave** (#e8e5f0): bordes y divisores; en oscuro, `#353047`.
- **Bastidor de escenario** (#1d1533): barra lateral y toast; su texto es `#f4f0ff`.

### Semantic
- **Rojo de invitado** (#e11d48): eventos donde otro líder invitó al usuario; es configurable por el administrador.
- **Violeta de grupo propio** (#7c3aed): color por defecto de las agrupaciones propias; cada banda puede tener el suyo.
- **Verde de cobro** (#12663c): pagos marcados, resultados positivos y confirmaciones.
- **Ámbar de aviso** (#7a5200): pendientes de aprobación y advertencias.
- **Azul de información** (#1d4ed8): badges y métricas de Google o acciones informativas, sobre `#e6f0ff`; en oscuro, texto `#a8c7ff` sobre `#1b2e4a`.
- **Rojo de error** (#b52038): errores de validación y acciones destructivas.

**The One Spotlight Rule.** El violeta de reflector se reserva para la acción y el estado activo; si todo es violeta, nada guía. El color de evento es identidad, no adorno.

## Typography

**Display Font:** Inter (con `system-ui, -apple-system, 'Segoe UI', sans-serif`)
**Body Font:** Inter
**Label/Mono Font:** Inter; el código usa el monoespacio del navegador.

**Character:** Una sola familia en toda la app, con pesos 400/500/600/700 para marcar jerarquía sin cambiar de voz. Es una fuente de producto sobria, no una display: la personalidad está en el ritmo y en el color, no en la forma de las letras.

### Hierarchy
- **Body** (400, 15px, 1.45): texto de trabajo, tablas y descripciones.
- **Title** (700, 1.15rem, 1.2): encabezados de sección (h2) y tarjetas.
- **Subtitle** (600, 1rem, 1.2): h3 dentro de tarjetas y modales.
- **Metric** (600, 1.35rem): cifras de resumen y totales.
- **Label** (700, .75rem, 0.03em, mayúsculas): cabeceras de tabla y rótulos cortos.
- **Fine print** (400, .8rem): notas, ayudas y metadatos.
- **Micro escala** (.6rem–.95rem): fechas del calendario, navegación inferior, tablas, cabeceras y texto de formularios. Cada paso tiene un uso asignado; no se inventan tamaños intermedios.
- **Escala amplia** (1.3rem–2.8rem): títulos de manual y acceso, logotipos y pantalla de carga. Ningún texto supera 2.8rem.

**The One Voice Rule.** No se introduce una segunda familia para enfatizar: el peso y el tamaño hacen el trabajo. Las cifras de dinero conservan su alineación y no se transforman en displays.

## Layout

Escritorio: barra lateral fija de 238px con navegación y cuenta, más una columna principal con barra superior pegajosa y un contenido centrado de hasta 1160px con 24px de padding. Secciones apiladas con 22px de separación; dentro de cada sección, grupos de 12px.

Celular (≤720px): la barra lateral desaparece, la navegación baja a una barra inferior fija con safe-area, el contenido usa 14–16px de padding y reserva 90px abajo. Las rejillas de dos columnas pasan a una; las filas de músicos pasan a dos columnas; las tablas desbordan horizontalmente en su propio contenedor.

**The Breathing Rule.** Grupos compactos (8–12px), secciones generosas (20–24px). El espacio arriba de un encabezado supera al de abajo para que el texto pertenezca a quien lo encabeza.

## Elevation & Depth

Sistema lifted: las tarjetas flotan sobre el lienzo con sombra desplazada y desenfoque suave; la jerarquía se refuerza con superficies de distintos tonos y bordes finos. No se usan halos de color sin desplazamiento ni sombras duras de offset cero.

### Shadow Vocabulary
- **Ambient card** (`box-shadow: 0 12px 32px rgba(55, 30, 100, .14)`): tarjetas, secciones y formularios; en oscuro `rgba(0,0,0,.5)`.
- **Control lift** (`box-shadow: 0 1px 4px rgba(0,0,0,.08)`): segmentos activos y controles pequeños; en oscuro `rgba(0,0,0,.4)`.
- **Dialog** (`box-shadow: 0 20px 60px rgba(0,0,0,.2)`): modales y tarjeta de acceso; en oscuro `rgba(0,0,0,.55)`.

**The Lifted Stage Rule.** Toda sombra lleva offset y desenfoque. Una tarjeta en reposo ya está elevada; el hover la acerca al usuario, no la inventa.

## Shapes

Esquinas redondeadas y consistentes: 4–6px en códigos y marcas internas, 8px en controles pequeños, 10px en botones y campos, 12px en cajas y pastillas de calendario, 13px en métricas, 14px en tarjetas de evento y listas, 16px en tarjetas y secciones, 18px en modales, 22px en la tarjeta de acceso y 999px en badges. Los bordes son completos y finos (1px); los eventos usan un borde completo de 2px con su color semántico. No se usan barras de un solo lado para marcar color: eso ya se corrigió en favor del borde completo.

## Components

### Buttons
- **Shape:** esquinas moderadamente redondeadas (10px); compactas (8px) en la variante pequeña.
- **Primary:** fondo violeta de reflector, texto blanco, padding 10px 16px, peso 600. Hover baja apenas el brillo; el foco añade un anillo de 2px con offset.
- **Ghost:** fondo violeta claro (`#f4edff`), texto violeta. Se usa para acciones secundarias y el enlace al manual.
- **Danger:** fondo rojo claro, texto `#b52038`.
- **Disabled:** opacidad .6 y cursor de espera; no cambia de color.

### Inputs / Fields
- **Style:** borde de 1px (`#e8e5f0`), fondo de superficie, radio 10px, padding 10px 11px.
- **Focus:** borde violeta y halo de 3px del tinte violeta; el placeholder usa el gris de apoyo con opacidad 1.
- **Checkbox:** 18px, alineado al texto de la etiqueta.

### Cards / Containers
- **Corner Style:** 16px; 14px en tarjetas de evento y 13px en métricas.
- **Background:** superficie blanca (u oscura) sobre el lienzo; variantes tonales para métricas.
- **Border:** 1px de línea suave; el evento lleva 2px del color de la agrupación.
- **Internal Padding:** 20px en secciones, 16px en móvil, 12–15px en tarjetas compactas.
- **Shadow Strategy:** ver *Ambient card* y *Dialog*.
- **Share Row:** fila compacta del modal de compartir: fondo de tarjeta, borde de 1px, radio 12px y padding 10px 12px; nombre y pago a la izquierda, acciones «WhatsApp» y «Copiar» a la derecha. En móvil se envuelve sin recortar el texto.

### Chips / Badges
- **Style:** pastilla (999px), 3px 9px, .72rem, peso 600; tinte del color semántico con texto del mismo tono.
- **State:** los tonos purple/blue/green/amber/red/gray comunican estado de suscripción, pago y role sin cambiar de forma.

### Navigation
- **Desktop:** barra lateral oscura con items de 11px 12px, radio 10px, icono emoji de 20px y texto a 500; activo en violeta, hover en violeta oscuro.
- **Mobile:** barra inferior con el icono sobre la etiqueta, .66rem, activo en violeta sobre tinte violeta.
- **Topbar:** pegajosa, fondo translúcido con blur de 8px, botón de tema, manual y cuenta.

### Signature: Event Card
- Tarjeta con borde completo de 2px en el color del evento, fecha en una caja violeta clara, título y montos a la derecha, metadatos en `.84rem` y acciones separadas por una línea suave. Los eventos cancelados bajan la opacidad a .6.

### Signature: Calendar Pill
- Pastilla pequeña dentro de cada celda del calendario, con borde de 1px en el color del evento y texto de la tinta; la celda libre usa un fondo apenas distinto del lienzo y la de hoy marca el número con un círculo violeta.

## Do's and Don'ts

### Do:
- **Do** mantener la interfaz y los errores en español; los controles nombran la acción («Agendar evento», «+ Cliente»).
- **Do** usar el borde completo de 2px con `--event-color` para identificar eventos propios e invitados.
- **Do** verificar contraste 4.5:1 en texto normal y 3:1 en texto grande, en ambos temas y sobre superficies coloreadas.
- **Do** templar selección, caret, scrollbar y foco desde la paleta: también son parte del sistema.
- **Do** que el cambio de tema sea inmediato y persista en `mariachitotal-theme`, con «Sistema» reaccionando en vivo.

### Don't:
- **Don't** usar barras de color de un solo lado en tarjetas ni pastillas: ya no pertenecen al sistema.
- **Don't** introducir una segunda familia tipográfica ni fuentes display para los números.
- **Don't** poner texto gris neutro sobre superficies coloreadas: se matiza desde el tono de la superficie.
- **Don't** usar halos de color sin desplazamiento como sombra, ni sombras duras de offset cero.
- **Don't** añadir acentos nuevos para decorar: el violeta guía y el resto de colores significan estado.
