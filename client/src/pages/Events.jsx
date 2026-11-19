import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, useLoad, money, dateLong, mapsFor, nowStamp } from '../api.js'
import { Loading, ErrorBox, Empty, Section, Badge, statusBadge, roleBadge, confirmAction, useNotify } from '../ui.jsx'
import EventShareButton from '../EventShareButton.jsx'

export default function Events() {
  const notify = useNotify()
  const [scope, setScope] = useState('upcoming')
  const [status, setStatus] = useState('')
  const [bandId, setBandId] = useState('')
  const { data: bands } = useLoad(() => api.get('/bands'), [])
  const { data, loading, error, reload } = useLoad(() => api.get('/events?limit=1000'), [])

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />

  const now = nowStamp()
  let events = (data || []).filter((e) => scope === 'all' || (scope === 'upcoming' ? e.starts_at >= now : e.starts_at < now))
  if (status) events = events.filter((e) => e.status === status)
  if (bandId) events = events.filter((e) => String(e.band_id) === bandId)
  if (scope === 'past') events = [...events].reverse()

  async function remove(event) {
    confirmAction(`¿Eliminar el evento «${event.title}»?`, async () => {
      await api.del('/events/' + event.id)
      notify('Evento eliminado'); reload()
    })
  }

  return (
    <div className="stack-lg">
      <Section title="Eventos" subtitle="Tu agenda ordenada por fecha"
        actions={<Link to="/eventos/nuevo" className="btn btn-primary">+ Nuevo evento</Link>}>
        <div className="filters">
          <div className="segmented">
            {[['upcoming', 'Próximos'], ['past', 'Pasados'], ['all', 'Todos']].map(([key, label]) => (
              <button key={key} className={scope === key ? 'active' : ''} onClick={() => setScope(key)}>{label}</button>
            ))}
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            <option value="confirmed">Confirmado</option>
            <option value="pending">Pendiente</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <select value={bandId} onChange={(e) => setBandId(e.target.value)} aria-label="Filtrar por agrupación">
            <option value="">Todas las agrupaciones</option>
            {(bands || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <span className="muted small">{events.length} evento{events.length === 1 ? '' : 's'}</span>
        </div>

        {events.length === 0 ? <Empty>No hay eventos con estos filtros.</Empty> : (
          <div className="card-list">
            {events.map((e) => {
              const maps = mapsFor(e)
              const shownMusicians = e.musicians_planned || e.musician_count
              return (
                <article key={e.id} className={'event-card' + (e.status === 'cancelled' ? ' cancelled' : '')}
                  style={{ '--event-color': e.event_color || (e.role === 'guest' ? '#e11d48' : '#7c3aed') }}>
                  <div className="event-card-head">
                    <div>
                      <div className="row gap wrap"><h3>{e.title}</h3>{roleBadge(e.role, e.band_kind, e.band_responsable)}{statusBadge(e.status)}</div>
                      <div className="muted small">🗓️ {dateLong(e.starts_at)}</div>
                    </div>
                    <div className="event-card-money"><strong>{money(e.charged_amount)}</strong><small>Cobrado</small></div>
                  </div>
                  <div className="event-meta">
                    {e.client_name && <span>👤 {e.client_name}{e.client_phone ? ` · ${e.client_phone}` : ''}</span>}
                    {e.band_name && <span>🎼 {e.band_name}</span>}
                    {e.location_name && <span>📍 {e.location_name}</span>}
                    <span>🎺 {shownMusicians} músico{shownMusicians === 1 ? '' : 's'}{e.musicians_planned > 0 && e.musician_count > 0 ? ` (${e.musician_count} en lista)` : ''}</span>
                    <Badge tone="amber">Anticipo {money(e.advance_amount)}{e.advance_account_name ? ` · ${e.advance_account_name}` : ''}</Badge>
                    <Badge tone="green">Pagado a músicos {money(e.musician_paid)} / {money(e.musician_total)}</Badge>
                  </div>
                  {maps && <a className="maps-link" href={maps} target="_blank" rel="noreferrer">🗺️ Abrir en Google Maps</a>}
                  {e.notes && <p className="notes">{e.notes}</p>}
                  <div className="event-actions">
                    <Link to={'/eventos/' + e.id} className="btn btn-ghost btn-sm">Ver / editar</Link>
                    <EventShareButton event={e} small />
                    <button className="btn btn-danger btn-sm" onClick={() => remove(e)}>Eliminar</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </Section>
    </div>
  )
}
