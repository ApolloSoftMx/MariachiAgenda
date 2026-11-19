import { Link } from 'react-router-dom'
import { Section, Badge } from '../ui.jsx'

const TOC = [
  ['que-es', 'Qué es MariachiTotal'],
  ['alta', 'Solicitar acceso y aprobación'],
  ['inicio', 'Primeros pasos al entrar'],
  ['telegram', 'Configurar Telegram'],
  ['agenda', 'Eventos y calendario'],
  ['clientes', 'Clientes y cotizaciones'],
  ['finanzas', 'Finanzas y reportes'],
  ['permisos', 'Permisos y roles'],
  ['instalar', 'Instalar la app'],
  ['problemas', 'Problemas comunes']
]

const Pasos = ({ children }) => <ol className="manual-steps">{children}</ol>
const Paso = ({ children }) => <li className="manual-step"><span>{children}</span></li>

export default function Manual({ standalone = false }) {
  const content = (
    <div className="stack-lg manual">
      <div className="manual-hero">
        <div className="row gap wrap">
          <span className="login-logo">🎺</span>
          <div>
            <h1>Manual de usuario</h1>
            <p className="muted">Guía completa para usar MariachiTotal, desde la solicitud de acceso hasta el uso diario.</p>
          </div>
        </div>
        <div className="row gap wrap manual-hero-badges">
          <Badge tone="purple">Consulta disponible antes de registrarte</Badge>
          <Badge tone="green">También disponible después de entrar</Badge>
        </div>
      </div>

      <Section title="Índice" subtitle="Toca un tema para ir directo a esa sección">
        <div className="manual-toc">
          {TOC.map(([id, label], i) => <a key={id} href={'#' + id}>{String(i + 1).padStart(2, '0')} · {label}</a>)}
        </div>
      </Section>

      <Section title="1. Qué es MariachiTotal" id="que-es">
        <div className="stack">
          <p>Es la agenda de tu mariachi: en un solo lugar registras <strong>eventos, clientes, músicos, cobros, cotizaciones y gastos</strong>. Funciona en la computadora y en el celular, y se puede instalar como una aplicación.</p>
          <p className="muted small">Toda la interfaz está en español. Los datos se guardan en el servidor de tu grupo, así que necesitas una cuenta para entrar.</p>
        </div>
      </Section>

      <Section title="2. Solicitar acceso y aprobación" id="alta">
        <Pasos>
          <Paso>En la pantalla de entrada toca <strong>«¿No tienes cuenta? Solicita acceso»</strong>. Si aparece la opción, también puedes usar <strong>«Continuar con Google»</strong> con tu Gmail.</Paso>
          <Paso>Escribe tu <strong>nombre</strong>, <strong>correo</strong> y <strong>contraseña</strong> (mínimo 6 caracteres) y envía la solicitud.</Paso>
          <Paso>Verás el aviso: <em>«Solicitud enviada. El super administrador debe aprobarla antes de que puedas entrar.»</em> Tu cuenta queda en estatus <Badge tone="amber">Pendiente</Badge>.</Paso>
          <Paso>Mientras esté pendiente no puedes entrar. Si lo intentas, la app te dirá que tu cuenta está pendiente de aprobación. <strong>Eso es normal, no es un error.</strong></Paso>
          <Paso>El super administrador recibe tu solicitud en <strong>Configuración → Usuarios</strong>. Si el bot de Telegram está activo y tiene su chat vinculado, también recibe un mensaje con los botones <strong>Aprobar / Rechazar</strong>. Puede revisar las solicitudes con el comando <code>/pendientes</code>.</Paso>
          <Paso>Cuando apruebe tu solicitud, regresa a la pantalla de entrada y accede con tu correo y contraseña (o con el mismo Gmail).</Paso>
          <Paso>Si te dieron una <strong>contraseña temporal</strong>, cámbiala de inmediato en <strong>Configuración → Cambiar contraseña</strong>.</Paso>
        </Pasos>
        <div className="manual-note">
          <strong>Si te rechazan:</strong> el usuario se elimina. Puedes enviar una solicitud nueva con otro correo. Si tardan en aprobarte, contacta directamente al super administrador de tu grupo.
        </div>
        <p className="muted small">Si viniste desde este manual, puedes <Link to="/?registro=1">solicitar acceso aquí</Link> o <Link to="/">iniciar sesión</Link>.</p>
      </Section>

      <Section title="3. Primeros pasos al entrar" id="inicio">
        <Pasos>
          <Paso><strong>Inicio:</strong> resumen del mes y accesos rápidos para agendar eventos.</Paso>
          <Paso><strong>Configuración → Cambiar contraseña:</strong> pon una contraseña propia.</Paso>
          <Paso><strong>Configuración → Bot de Telegram → Vincular mi Telegram:</strong> recibe recordatorios y agenda desde el celular.</Paso>
          <Paso><strong>Catálogos:</strong> da de alta tus agrupaciones, músicos y cuentas bancarias. Así podrás seleccionarlos al crear eventos y cotizaciones.</Paso>
          <Paso><strong>Clientes:</strong> registra quién te contrata y su teléfono para WhatsApp o llamadas.</Paso>
        </Pasos>
      </Section>

      <Section title="4. Configurar Telegram" id="telegram">
        <p className="manual-lead">Es opcional, pero muy útil: permite recibir recordatorios y crear eventos sin abrir la app.</p>
        <Pasos>
          <Paso>El <strong>super administrador</strong> activa el bot en <strong>Configuración → Configuración del sistema → Bot de Telegram</strong>: crea el bot con <strong>@BotFather</strong>, pega el token y escribe el nombre de usuario, luego guarda.</Paso>
          <Paso>En <strong>Configuración → Bot de Telegram</strong> toca <strong>«Vincular mi Telegram»</strong>. Se genera un código y se abre <code>https://t.me/&lt;bot&gt;?start=CODE</code>.</Paso>
          <Paso>En Telegram pulsa <strong>Iniciar / Enviar</strong>. Si no se abre automáticamente, envía manualmente el comando <code>/start CODE</code> que aparece en pantalla (también se copia al portapapeles).</Paso>
          <Paso>La etiqueta debe cambiar a <Badge tone="green">Telegram vinculado</Badge>. Si usas otro teléfono, toca <strong>«Desvincular chat»</strong> y repite el proceso.</Paso>
        </Pasos>
        <h3>Comandos disponibles</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>Comando</th><th>Qué hace</th></tr></thead>
          <tbody>
            <tr><td><code>/nuevo</code></td><td>Asistente paso a paso para agendar un evento.</td></tr>
            <tr><td><code>/evento Título | AAAA-MM-DD HH:mm | Tandas | Lugar | Cliente | Músicos | Cobro</code></td><td>Crea un evento en una sola línea. Las tandas son horas.</td></tr>
            <tr><td><code>/pendientes</code></td><td>Solo super administrador: lista solicitudes de acceso y permite aprobar o rechazar.</td></tr>
          </tbody>
        </table></div>
        <div className="manual-note">
          Los recordatorios se envían a los chats vinculados. Si no llegan, revisa que el bot esté activo y que tu chat aparezca como vinculado.
        </div>
      </Section>

      <Section title="5. Eventos y calendario" id="agenda">
        <Pasos>
          <Paso><strong>Calendario:</strong> los días con eventos se marcan como ocupados y los demás como libres. Toca un día para ver su detalle o <strong>«Agendar este día»</strong>.</Paso>
          <Paso><strong>Eventos → + Evento:</strong> captura título, fecha y hora de inicio, <strong>número de tandas</strong>, cliente, lugar, estatus (confirmado, pendiente o cancelado), músicos planeados y la lista de músicos con su pago individual.</Paso>
          <Paso><strong>Tandas = horas:</strong> cada tanda dura una hora. Al escribir, por ejemplo, <code>3</code> tandas con inicio a las 19:00, el sistema calcula automáticamente la fecha y hora de fin (22:00). Puedes ajustar el fin manualmente si lo necesitas.</Paso>
          <Paso>Registra el <strong>cobro total</strong> y el <strong>anticipo</strong>. En el detalle del evento puedes ver el total pagado a músicos y tus notas.</Paso>
          <Paso>El rol del evento puede ser <Badge tone="purple">Mi grupo (encargado)</Badge> o <Badge tone="blue">Invitado / otro encargado</Badge>. Un mismo usuario puede ser encargado en unos eventos e invitado en otros.</Paso>
        </Pasos>
      </Section>

      <Section title="6. Clientes y cotizaciones" id="clientes">
        <h3>Clientes</h3>
        <p>Guarda nombre, teléfono y notas. Con el teléfono se generan los enlaces de WhatsApp y llamada directamente desde la lista.</p>
        <h3>Cotizaciones</h3>
        <Pasos>
          <Paso><strong>Cotizaciones → + Nueva cotización:</strong> llena título, cliente, fecha, hora de inicio, <strong>tandas</strong>, lugar, dirección (o enlace de Google Maps), músicos planeados, total, depósito, vigencia y cuenta para depósito. El campo <strong>Fin estimado</strong> se calcula solo al sumar las tandas a la hora de inicio.</Paso>
          <Paso>Si el cliente aún no existe, elige <strong>«➕ Crear nuevo cliente…»</strong>: capturas nombre, teléfono y notas, y al guardar se da de alta en Clientes y queda ligado a la cotización.</Paso>
          <Paso>Con <strong>«Enviar»</strong> obtienes un mensaje listo para WhatsApp, el PDF, una imagen PNG y un enlace público para el cliente. WhatsApp no adjunta archivos desde un enlace <code>wa.me</code>: el PDF y la imagen se comparten por enlace o se descargan.</Paso>
          <Paso>En la página pública del cliente puede subir su <strong>comprobante de depósito</strong> (PNG, JPG, WebP o PDF, hasta 10 MB). Al aceptarlo, la cotización pasa a <Badge tone="green">Aceptada</Badge> y se crea un evento confirmado usando la fecha, la hora, las tandas (con su fin calculado) y el depósito como anticipo.</Paso>
        </Pasos>
      </Section>

      <Section title="7. Finanzas y reportes" id="finanzas">
        <Pasos>
          <Paso><strong>Finanzas:</strong> elige un rango de fechas para ver el resumen del periodo.</Paso>
          <Paso>El reporte muestra lo <strong>cobrado</strong>, lo <strong>pagado a músicos</strong> (solo pagos marcados como pagados), los <strong>gastos</strong> y la <strong>ganancia</strong>.</Paso>
          <Paso>La ganancia es: <em>cobrado − pagos a músicos − gastos</em>. Los eventos cancelados no se cuentan y el anticipo no se resta dos veces.</Paso>
        </Pasos>
      </Section>

      <Section title="8. Permisos y roles" id="permisos">
        <div className="table-wrap"><table>
          <thead><tr><th>Perfil</th><th>Qué ve y puede hacer</th></tr></thead>
          <tbody>
            <tr><td><Badge tone="purple">Super administrador</Badge></td><td>Ve todos los eventos, cotizaciones, gastos y reportes. Administra usuarios, aprobaciones, bot de Telegram, Google, respaldos y configuración.</td></tr>
            <tr><td><Badge tone="gray">Usuario</Badge></td><td>Ve y administra únicamente lo que él creó. Los catálogos (clientes, músicos, agrupaciones y cuentas) son compartidos.</td></tr>
          </tbody>
        </table></div>
        <p className="muted small">Los dos perfiles son distintos al rol del evento: <em>leader</em> (mi grupo) y <em>guest</em> (invitado). Un usuario puede tener roles distintos en eventos diferentes.</p>
      </Section>

      <Section title="9. Instalar la app en tu celular" id="instalar">
        <Pasos>
          <Paso><strong>Android (Chrome):</strong> menú del navegador → «Agregar a pantalla de inicio» o «Instalar aplicación».</Paso>
          <Paso><strong>iPhone (Safari):</strong> botón Compartir → «Agregar a pantalla de inicio».</Paso>
          <Paso>Se abre a pantalla completa y funciona como una app. Si ves información antigua, ciérrala y vuelve a abrirla (o reinstálala).</Paso>
        </Pasos>
      </Section>

      <Section title="10. Problemas comunes" id="problemas">
        <div className="table-wrap"><table>
          <thead><tr><th>Situación</th><th>Qué hacer</th></tr></thead>
          <tbody>
            <tr><td>«Tu cuenta está pendiente de aprobación»</td><td>Espera a que el super administrador apruebe tu solicitud desde Configuración → Usuarios o con <code>/pendientes</code>.</td></tr>
            <tr><td>No puedo entrar con Google</td><td>Usa el mismo correo con el que enviaste la solicitud y que ya fue aprobado.</td></tr>
            <tr><td>No llegan recordatorios</td><td>Verifica que el bot esté activo y que tu chat aparezca como «Telegram vinculado» en Configuración.</td></tr>
            <tr><td>La página se ve sin estilo o con datos viejos</td><td>Actualiza con Ctrl+F5, cierra y vuelve a abrir la app. Si persistes, pide al administrador que limpie la caché.</td></tr>
            <tr><td>Olvidé mi contraseña</td><td>Pide al super administrador que te cree una cuenta nueva con contraseña temporal, o que te ayude desde Configuración → Usuarios.</td></tr>
            <tr><td>No veo un evento creado por otro compañero</td><td>Es normal: los usuarios solo ven lo que ellos crearon. Pide al creador que lo comparta o al administrador que lo revise.</td></tr>
          </tbody>
        </table></div>
      </Section>

      <div className="manual-footer">
        <Link to="/" className="btn btn-primary">Volver a MariachiTotal</Link>
        <Link to="/?registro=1" className="btn btn-ghost">Solicitar acceso</Link>
      </div>
    </div>
  )

  if (!standalone) return content

  return (
    <div className="manual-public">
      <header className="manual-topbar">
        <Link to="/" className="manual-brand"><span>🎺</span><strong>MariachiTotal</strong></Link>
        <div className="row gap">
          <Link to="/?registro=1" className="btn btn-ghost btn-sm">Solicitar acceso</Link>
          <Link to="/" className="btn btn-primary btn-sm">Iniciar sesión</Link>
        </div>
      </header>
      <main className="manual-public-content">{content}</main>
    </div>
  )
}
