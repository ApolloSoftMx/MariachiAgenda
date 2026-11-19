# 🎺 Agenda Mariachi

Sistema de agenda, clientes y finanzas para un músico de mariachi. Funciona como PWA instalable en el celular, guarda todo en SQLite y se conecta con un bot de Telegram. Pensado para correr en tu servidor local y publicarse con Cloudflare Tunnel.

## Funciones

- **Eventos** con fecha/hora, lugar, dirección y enlace de Google Maps.
- **Lista ordenada por fecha** y **vista de calendario** que marca los días libres.
- **Tu grupo vs. invitado**: en cada evento indicas si eres el encargado o si otro encargado te invitó.
- **Clientes** con nombre y teléfono (botones de WhatsApp y llamada), notas y total cobrado.
- **Músicos por evento**: número planeado de músicos y, opcionalmente, nombre, teléfono, pago y marca de pagado por cada uno. Catálogo reutilizable.
- **Finanzas**: total cobrado, anticipo, cuenta del depósito, pagos a músicos, otros gastos y **utilidad por rango de fechas** (reporte + exportación CSV).
- **Cotizaciones**: registra propuestas con clientes, músicos, total, vigencia y datos de depósito. Genera **PDF**, **imagen PNG** y un enlace público para el cliente.
- **Envío por WhatsApp sin API externa**: la app construye el mensaje y el enlace `wa.me/...`; tú eliges cuándo enviarlo. El mensaje incluye el enlace a la cotización y al PDF.
- **Dos roles de sistema**: **super administrador** (usuarios, Telegram, respaldos) y **usuario final** (agenda, clientes y finanzas). No se confunden con el rol por evento.
- **Acceso con Google** (opcional): los usuarios entran con su cuenta de Gmail sin escribir contraseña.
- **Bot de Telegram**: recordatorios 24 h / 1 h antes, consulta de agenda y **alta de eventos desde Telegram**.
- **Respaldos** desde la web (solo super administrador) y con `respaldar.bat`.
- **Suscripciones preparadas** para cobrar a otros usuarios en el futuro (desactivadas por defecto).

## Roles: no confundir los dos niveles

Hay dos cosas distintas:

| Nivel | Valores | Para qué sirve |
| --- | --- | --- |
| **Rol de la cuenta** | `admin` (super administrador) / `user` (usuario final) | El admin administra usuarios, configura el bot y crea/descarga respaldos. Los usuarios usan toda la agenda. |
| **Rol por evento** | `leader` (encargado de mi grupo) / `guest` (invitado de otro encargado) | Indica quién lidera *esa presentación*. Un mismo usuario puede ser encargado en un evento e invitado en otro. |

El rol por evento se guarda en `events.role`; el rol de la cuenta se guarda en `users.role`. No dependen entre sí.

**Visibilidad de datos:** el super administrador ve todos los eventos, cotizaciones y gastos. Los usuarios finales solo ven lo que ellos crearon (`created_by = su id`); no pueden ver, editar ni borrar eventos o cotizaciones de otra cuenta, aunque la otra cuenta sea administrador. Los recordatorios de Telegram también van solo al creador del evento.

**El super administrador no es un correo fijo.** Es un rol: el primer arranque crea una cuenta admin (`owner@agenda.local` por defecto), y desde **Configuración → Usuarios** puedes nombrar a otra persona como super administrador. Siempre debe quedar al menos un admin activo.

## Registro y aprobación de usuarios

El registro está abierto por defecto: en el login aparece **«¿No tienes cuenta? Solicita acceso»**.

1. La persona llena nombre, correo y contraseña.
2. La cuenta queda **pendiente** (`pending_approval = 1`) y no puede entrar todavía.
3. El super administrador recibe la solicitud de dos formas:
   - En la web: **Configuración → Usuarios → Solicitudes pendientes**.
   - En Telegram: si el admin vinculó su chat, llega un mensaje con botones **✅ Aprobar** / **⛔ Rechazar**.
4. Al aprobar, la cuenta se activa y ya puede iniciar sesión. Al rechazar, se elimina la solicitud.

Puedes cerrar el registro en **Configuración → Configuración del sistema** o con `ALLOW_REGISTRATION=false` en `.env`. Aunque el registro esté abierto, nadie entra sin aprobación.

## Requisitos

- Node.js **24 o superior**. Usa el módulo nativo `node:sqlite`, sin compilación.
- No necesitas instalar SQLite aparte.

## Instalación y desarrollo

```bash
npm install
npm run dev
```

- Web de desarrollo: http://localhost:5173
- API: http://localhost:3000 (Vite hace proxy de `/api`)

### Cambiar los puertos

Si otro programa ya usa esos puertos, crea o edita `.env` en la raíz:

```env
PORT=3100
VITE_PORT=5174
```

- `PORT` es el puerto de la **API** y de la **app compilada** (`npm start`, `iniciar.bat` y Cloudflare Tunnel). Default: `3000`.
- `VITE_PORT` es solo el puerto de la **web de desarrollo** (`npm run dev`). Default: `5173`.

Vite lee `PORT` automáticamente para el proxy de `/api`, así que el frontend sigue llamando a `/api` sin saber el puerto real. No hace falta cambiar código.

Si solo quieres cambiar el puerto de producción, basta con `PORT=3100`. `iniciar.bat` también lo lee de `.env` y abre el navegador en el puerto correcto.

Temporalmente, sin editar `.env`:

```powershell
$env:PORT=3100; $env:VITE_PORT=5174; & 'C:\Program Files\nodejs\npm.cmd' run dev
```

En Windows, si PowerShell bloquea `npm.ps1`, usa `npm.cmd`:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' install
```

## Primer arranque

La primera vez se crea `data/agenda.db` y un usuario **super administrador**. Si no defines `SEED_ADMIN_PASSWORD`, se genera una contraseña temporal y se imprime en la consola:

```
[agenda] Super administrador creado: owner@agenda.local
[agenda] Contraseña temporal (cámbiala en Configuración): ...
```

Entra y cámbiala en **Configuración → Cambiar contraseña**.

## Producción (servidor local)

```bash
npm run build
npm start
```

`npm start` sirve la API y la interfaz compilada en `dist/` desde el mismo puerto (3000 por defecto). Abre `http://localhost:3000`.

### Arranque con doble clic (Windows)

Ejecuta **`iniciar.bat`**. El archivo:

1. Verifica que Node.js esté instalado.
2. Instala dependencias si falta `node_modules`.
3. Compila la interfaz si falta `dist/`.
4. Arranca el servidor y abre `http://localhost:3000`.

Deja la ventana abierta; para detenerlo usa `Ctrl+C`. No necesitas exponer nada más: la interfaz y la API viven en el mismo puerto, y Cloudflare Tunnel publica solo ese puerto.

### Instalar en el celular

1. Abre la URL en Chrome (Android) o Safari (iPhone).
2. Menú del navegador → **Agregar a pantalla de inicio**.
3. Se abre a pantalla completa y queda precargada por el service worker.

## Bot de Telegram

1. En Telegram, habla con **@BotFather** → `/newbot` y copia el token.
2. Entra como super administrador a **Configuración → Configuración del sistema → Bot de Telegram** y pega el token.
   También puedes ponerlo en `.env`:
   ```env
   BOT_TOKEN=123456:ABC...
   BOT_USERNAME=tu_bot_sin_arroba
   ```
3. Guarda. El bot se reinicia solo y verás `[bot] @tu_bot activo` en la consola. El nombre de usuario se llena automáticamente.
4. En la web: **Configuración → Vincular Telegram**, copia el código y envía al bot:
   ```
   /start ABC123
   ```
5. Listo: recibirás recordatorios de los eventos próximos y las solicitudes de registro con botones para aprobar o rechazar.

**Cualquier usuario puede vincular su Telegram** en **Configuración → Vincular Telegram** y recibir los recordatorios en su celular. Al generar el código se abre Telegram con el enlace `https://t.me/<bot>?start=<código>`: al pulsar **Iniciar/Enviar**, Telegram manda `/start <código>` automáticamente. El navegador no puede enviar mensajes por Telegram directamente, por eso también se copia el mensaje y queda un botón **Abrir Telegram** por si el enlace no se abre solo.

Comandos del bot:

| Comando | Qué hace |
| --- | --- |
| `/start CÓDIGO` | Vincula tu cuenta de la web con tu chat. |
| `/nuevo` | Asistente paso a paso para agendar un evento. |
| `/evento Título \| AAAA-MM-DD HH:mm \| Lugar \| Cliente \| Músicos \| Cobro` | Alta rápida de un evento. |
| `/agenda`, `/hoy`, `/proximo` | Consulta los eventos de la agenda. |
| `/pendientes` | Registros por aprobar (solo super administrador). |
| `/ayuda` | Muestra esta ayuda. |

Ejemplo de alta rápida:

```
/evento Boda Ana | 2026-12-12 19:00 | Salón El Rancho | Ana López | 6 | 12000
```

Escribe `-` en cualquier dato opcional para dejarlo vacío. Los eventos creados desde Telegram aparecen en la web con la nota «Agendado desde Telegram».

El token y el nombre del bot los configura el **super administrador** desde la pantalla (o en `.env`). Cualquier usuario puede vincular su propio chat para recibir recordatorios. El bot es opcional: si no hay token, la web funciona igual.

## Cotizaciones y envío al cliente

1. Registra tus cuentas en **Catálogos → Cuentas** (nombre, banco y CLABE/cuenta). Esos datos aparecerán automáticamente en la cotización.
2. Ve a **Cotizaciones → + Nueva cotización**. Llena título, cliente, fecha, **hora**, **lugar, dirección o enlace de Maps**, músicos, total, **monto del depósito**, vigencia y, si quieres, datos extra de depósito, descripción y notas. Si dejas el enlace de Maps vacío, se genera una búsqueda automática con el lugar y la dirección. La hora y el depósito se usarán para agendar el evento si el cliente acepta.
3. En la lista, pulsa **Enviar**. Verás:
   - el mensaje listo para WhatsApp, editable;
   - **Abrir WhatsApp**: abre `wa.me/<teléfono>?text=...` con el mensaje cargado;
   - **Ver PDF** y **Ver página del cliente**: enlaces públicos con token, sin que el cliente inicie sesión;
   - **Descargar imagen**: genera un PNG con los datos de la cotización;
   - **Marcar como enviada** para cambiar el estatus.
4. Si el cliente no tiene teléfono registrado, WhatsApp te pedirá elegir el contacto.
5. En la página pública del cliente aparece **Aceptar cotización**: el cliente adjunta su comprobante de depósito (PNG, JPG, WebP o PDF, máximo 10 MB) y pulsa **Adjuntar comprobante y aceptar**.
6. Al enviarlo, la cotización pasa a **Aceptada**, se guarda el comprobante y se crea automáticamente un **evento confirmado** con la fecha, hora, lugar, cliente, músicos, total y depósito de la cotización. El evento queda asociado a la cuenta que creó la cotización.
7. Tú ves el comprobante desde la lista de cotizaciones (**🧾 Comprobante**) o desde **Enviar → Ver comprobante**. El cliente también puede volver a abrir su comprobante desde la página pública.

No se usa ninguna API de WhatsApp ni se envía nada automáticamente: la app solo construye el mensaje y los enlaces. `wa.me` no puede adjuntar archivos, por eso el PDF y la imagen se entregan por enlace o se descargan para adjuntarlos manualmente.

El enlace público tiene este aspecto: `https://tu-dominio.com/q/<token>` y su PDF: `https://tu-dominio.com/q/<token>.pdf`. El service worker excluye `/q/` para que esos enlaces no se confundan con la PWA.

Los comprobantes se guardan en `data/agenda-receipts/` (o `data/<nombre-de-tu-db>-receipts/`). No se envían por correo ni se comparten con nadie que no tenga el enlace con token. Una cotización aceptada no se puede aceptar dos veces.

## Acceso con Google (opcional)

Sirve para que tus usuarios entren con su cuenta de Gmail sin escribir contraseña. Si no lo configuras, el botón no aparece y todo sigue funcionando con correo y contraseña.

1. Entra a <https://console.cloud.google.com/apis/credentials>.
2. Crea un proyecto (o usa uno existente) → **Crear credenciales → ID de cliente de OAuth 2.0**.
3. Tipo de aplicación: **Aplicación web**.
4. En **URI de redirección autorizados** agrega exactamente:
   - Local: `http://localhost:3000/api/auth/google/callback`
   - Producción: `https://tu-dominio.com/api/auth/google/callback`
5. Entra como super administrador a **Configuración → Configuración del sistema → Acceso con Google** y pega el **Client ID** y el **Client Secret**. Ahí mismo ves la URI exacta que debes registrar.
   También puedes ponerlos en `.env`:
   ```env
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   ```
6. Guarda. En la pantalla de login aparecerá **Continuar con Google**.

Comportamiento:

- Si el correo ya existe y está aprobado, se vincula la cuenta de Google con ese usuario.
- Si no existe, se crea una **solicitud pendiente** de usuario final y el super administrador la aprueba igual que un registro normal (se puede desactivar con `ALLOW_GOOGLE_SIGNUP=false`).
- Las cuentas creadas solo con Google no tienen contraseña utilizable; entran siempre con Google.
- El super administrador puede desactivar usuarios desde **Configuración → Usuarios**.

> Si usas Cloudflare Tunnel, `APP_URL` debe ser la URL pública HTTPS y esa misma URL debe estar registrada en Google. Si la redirección no coincide, Google muestra `redirect_uri_mismatch`.

## Publicar con Cloudflare Tunnel

### Túnel rápido (para probar)

```bash
cloudflared tunnel --url http://localhost:3000
```

Si cambiaste `PORT` en `.env`, usa ese número: `cloudflared tunnel --url http://localhost:3100`.

Te da una URL `https://algo.trycloudflare.com`. Cámbiala en `.env`:

```env
APP_URL=https://algo.trycloudflare.com
```

Reinicia el servidor. Con `APP_URL` en `https://`, la cookie de sesión se marca `Secure` automáticamente.

### Túnel con dominio propio

```bash
cloudflared tunnel login
cloudflared tunnel create agenda
cloudflared tunnel route dns agenda agenda.tudominio.com
cloudflared tunnel run --url http://localhost:3000 agenda
```

Si pusiste `PORT=3100` en `.env`, cambia el `3000` de ese comando por `3100`.

Configura `APP_URL=https://agenda.tudominio.com`. Para que arranque solo, instala `cloudflared` como servicio (en Windows: `cloudflared service install`).

> El túnel solo publica el puerto que indiques en el comando (3000 por defecto). No abras el puerto en el router.

## Datos y respaldo

- Base de datos: `data/agenda.db` (más `-wal` y `-shm`).
- **Desde la web**: entra como super administrador → **Configuración → Respaldos** → **Crear respaldo**. Puedes descargarlo o eliminarlo.
- **Con doble clic**: ejecuta `respaldar.bat` (funciona con el servidor encendido).
- **Por consola**:
  ```bash
  npm run backup
  ```
- Los respaldos se guardan en `data/backups/` con nombre `agenda-AAAAMMDD-HHMMSS.db`. Se crean con `VACUUM INTO`, así que son consistentes aunque haya gente usando el sistema.
- También puedes detener el servidor y copiar toda la carpeta `data/`.
- `data/` y `.env` están en `.gitignore`: no los subas a git.

## Seguridad

- Cambia la contraseña del super administrador después del primer arranque.
- El registro está abierto por defecto, pero **toda cuenta nueva queda pendiente** hasta que un super administrador la apruebe. Puedes cerrarlo en la pantalla o con `ALLOW_REGISTRATION=false`.
- El acceso con Google también crea solicitudes pendientes; si no quieres que exista esa opción, usa `ALLOW_GOOGLE_SIGNUP=false`.
- Hay límite de intentos de login (10 por 10 minutos por IP/correo).
- Si expones el sistema, usa siempre HTTPS (Cloudflare Tunnel lo da).

## Suscripciones (preparado, apagado)

La base ya incluye `plans` y `subscriptions`, y la API tiene un guard por suscripción. Para activarlo:

```env
ENABLE_SUBSCRIPTIONS=true
```

- El rol `admin` (super administrador) siempre tiene acceso.
- Los demás necesitan una suscripción `trialing` o `active` vigente.
- Los endpoints de catálogos, eventos, clientes y reportes quedan protegidos; el flujo de cobro (Stripe/Mercado Pago) aún no está implementado.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | API con recarga + Vite en paralelo |
| `npm run build` | Compila la PWA a `dist/` |
| `npm start` | Sirve API + PWA compilada |
| `npm test` | Prueba de humo de la API (56 comprobaciones) |
| `npm run backup` | Crea un respaldo en `data/backups/` |
| `npm run icons` | Regenera los íconos PNG del PWA |

## Estructura

```
server/
  index.js      arranque HTTP + estáticos + bot
  app.js        todas las rutas /api (Express + Zod)
  db.js         esquema SQLite y helpers (node:sqlite)
  auth.js       sesiones, scrypt, permisos, Google, suscripción
  backup.js     respaldos con VACUUM INTO
  settings.js   configuración guardada desde la pantalla (bot, Google, registro)
  events.js     helpers compartidos de eventos (web + Telegram)
  pdf.js        generador de PDF de cotizaciones sin dependencias
  bot.js        bot de Telegram, recordatorios, aprobaciones y alta de eventos
client/src/
  App.jsx       sesión, layout y rutas
  api.js        cliente HTTP, helpers de fecha/dinero
  ui.jsx        componentes compartidos
  quote.js      mensaje compartible y descarga de imagen PNG
  pages/        Dashboard, Calendar, Events, EventForm, Clients, Quotes, Catalogs, Reports, Settings
scripts/
  smoke.mjs     prueba de humo de la API
  backup.mjs    respaldo por consola
  gen-icons.js  generador de íconos PNG
iniciar.bat     arranque con doble clic (Windows)
respaldar.bat   respaldo con doble clic (Windows)
```

## Notas

- Las fechas se guardan como texto local `YYYY-MM-DDTHH:mm` (sin zona horaria). Así se comparan y ordenan de forma natural y coinciden con la hora del servidor.
- Los pagos a músicos cuentan como gasto cuando están marcados como **Pagado**.
- La utilidad del reporte = cobrado − pagado a músicos (marcados pagados) − otros gastos, sin contar eventos cancelados.
