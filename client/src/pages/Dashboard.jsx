import { Link } from 'react-router-dom'
import { api, money, dateShort, timeShort, nowStamp, todayStr, useLoad } from '../api.js'
import { Loading, ErrorBox, Stat, Section, Empty, roleBadge, statusBadge } from '../ui.jsx'

export default function Dashboard() {
  const { data, loading, error } = useLoad(
    () => Promise.all([api.get('/events?limit=500'), api.get('/reports')]), []
  )

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />

  const [events, report] = data
  const now = nowStamp()
  const upcoming = events.filter((e) => e.starts_at >= now && e.status !== 'cancelled').slice(0, 6)
  const monthEvents = events.filter((e) => e.starts_at.slice(0, 7) === todayStr().slice(0, 7))

  return (
    <div className="stack-lg">
      <Section title="Hola, ¿qué hay para hoy?" subtitle="Un vistazo rápido a tu agenda y tus finanzas"
        actions={<Link to="/eventos/nuevo" className="btn btn-primary">+ Nuevo evento</Link>}>
        <div className="stat-grid">
          <Stat label="Próximos eventos" value={events.filter((e) => e.starts_at >= now && e.status !== 'cancelled').length} tone="purple" />
          <Stat label="Eventos este mes" value={monthEvents.length} tone="blue" />
          <Stat label="Cobrado este mes" value={money(report.totals.charged)} tone="green" />
          <Stat label="Utilidad este mes" value={money(report.totals.profit)} tone="amber" />
        </div>
      </Section>

      <Section title="Próximos eventos" subtitle="Ordenados por fecha"
        actions={<Link to="/eventos" className="btn btn-ghost">Ver todos →</Link>}>
        {upcoming.length === 0 ? (
          <Empty>No hay eventos próximos. ¿Agendas uno?</Empty>
        ) : (
          <div className="card-list">
            {upcoming.map((e) => (
              <Link key={e.id} to={'/eventos/' + e.id} className="event-row"
                style={{ border: '2px solid ' + (e.event_color || (e.role === 'guest' ? '#e11d48' : '#7c3aed')) }}>
                <div className="date-box"><strong>{dateShort(e.starts_at).split(' ')[0]}</strong><small>{dateShort(e.starts_at).split(' ')[1]}</small></div>
                <div className="event-row-main">
                  <div className="row gap wrap"><strong>{e.title}</strong>{roleBadge(e.role, e.band_kind, e.band_responsable)}{statusBadge(e.status)}</div>
                  <div className="muted small">
                    🕐 {timeShort(e.starts_at)}{e.client_name ? ` · 👤 ${e.client_name}` : ''}
                    {e.location_name ? ` · 📍 ${e.location_name}` : ''}
                  </div>
                </div>
                <div className="event-row-side"><strong>{money(e.charged_amount)}</strong></div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="Accesos rápidos">
        <div className="quick-grid">
          <Link to="/calendario" className="quick-card"><span>📅</span><strong>Calendario</strong><small>Ver tus espacios libres</small></Link>
          <Link to="/clientes" className="quick-card"><span>👥</span><strong>Clientes</strong><small>Llamar o WhatsApp</small></Link>
          <Link to="/reportes" className="quick-card"><span>💰</span><strong>Reporte</strong><small>Utilidad por rango</small></Link>
          <Link to="/configuracion" className="quick-card"><span>🤖</span><strong>Telegram</strong><small>Recibir recordatorios</small></Link>
        </div>
      </Section>
    </div>
  )
}
