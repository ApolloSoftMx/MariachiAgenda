# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React PWA (Vite) en `client/`, API Express + SQLite (`node:sqlite`) en `server/`. Un solo proceso sirve la API y el build estático con SPA fallback.

## Users

- **Líderes de grupo y músicos invitados:** usan la agenda para administrar presentaciones. Un mismo usuario puede ser `leader` en sus eventos y `guest` en los de otro encargado.
- **Super administrador:** aprueba registros, configura bot/Google, respaldos y ajustes globales.
- **Usuario final:** agenda, clientes, cotizaciones y finanzas; ve únicamente sus propios registros.

Situación de uso: en escritorio y, sobre todo, en el celular como PWA instalable; comparten cotizaciones por WhatsApp y reciben recordatorios por Telegram.

## Product Purpose

MariachiTotal es una agenda integral para mariachis: eventos con tandas (horas), calendario de días libres/ocupados, clientes, cotizaciones compartibles con comprobante, finanzas y reportes. El éxito es que el músico o líder pueda agendar y cobrar sin hojas de cálculoni mensajes dispersos.

## Positioning

Cada tanda equivale a una hora y el pago se captura por tanda (del evento y de cada músico), con total calculado y editable. La app combina agenda, cobranza y cotización pública (PDF/PNG/WhatsApp) con aprobación de accesos y bot de Telegram en un solo lugar, sin dependencias nativas.

## Operating Context

- Registro abierto con aprobación de un super administrador; acceso con Google opcional.
- Roles de sistema (`admin`/`user`) distintos de los roles por evento (`leader`/`guest`).
- Cotizaciones públicas en `/q/:token`, con envío de comprobante y creación automática del evento al aceptar.
- Bot de Telegram opcional para vincular cuenta, `/nuevo`, `/evento`, `/pendientes` y recordatorios.
- Despliegue local bajo Cloudflare Tunnel; misma URL para la app y el redirect de Google.

## Capabilities and Constraints

- UI y errores de API **siempre en español**.
- Fechas se guardan como cadenas locales `YYYY-MM-DDTHH:mm`; nunca usar UTC para filtros.
- Los datos de usuario (eventos, cotizaciones, gastos, reportes) se filtran por `created_by`; los catálogos son compartidos.
- Un músico capturado por nombre dentro del evento se da de alta automáticamente en el catálogo compartido, reutilizando nombres existentes para no duplicarlo; el formulario permite desactivar esta opción.
- Cada evento se puede compartir como texto por WhatsApp o portapapeles; los músicos con teléfono reciben un mensaje personalizado que solo muestra su pago. No se usa API de WhatsApp: se abren enlaces `wa.me`.
- Eventos ordenados por fecha; calendario muestra días libres y ocupados con colores por agrupación (color propio para eventos como invitado, configurable).
- `dist/` es gitignored: hay que correr `npm run build` antes de servir.
- **Tema visual (decidido 2026-11-19):** modo claro/oscuro, controlado por preferencia del usuario guardada localmente, con respeto a la preferencia del sistema operativo como valor inicial.
- Sin dependencias nativas: SQLite vía `node:sqlite`.

## Brand Commitments

- Nombre **MariachiTotal** e iconografía de trompeta (🎺) en PWA, cabecera, PDFs y PNGs.
- Color de marca violeta `#6d28d9` (fallback de eventos propios `#7c3aed`, invitados `#e11d48`).
- Voz en español neutral y directa, centrada en la acción («Agendar evento», «+ Cliente»).

## Accessibility & Inclusion

- La interfaz debe ser legible en celular y escritorio; el modo oscuro es una preferencia explícita del usuario.
- El contraste de texto sobre superficies (incluidas las coloreadas) debe cumplir 4.5:1 para texto normal y 3:1 para texto grande.
