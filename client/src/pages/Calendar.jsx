import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, useLoad, money, timeShort, parseDate } from '../api.js'
import { Loading, ErrorBox, Section, Badge } from '../ui.jsx'

const pad = (n) => String(n).padStart(2, '0')
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthLabel = (d) => new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(d)
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export default function Calendar() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selected, setSelected] = useState(null)
  const from = stamp(cursor)
  const to = stamp(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0))
  const { data: events, loading, error } = useLoad(() => api.get(`/events?from=${from}&to=${to}`), [from, to])

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />

  const firstWeekday = (cursor.getDay() + 6) % 7
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: firstWeekday }, (_, i) => ({ empty: true, key: 'e' + i })),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, key: 'd' + (i + 1) }))
  ]
  const byDay = (dayStr) => (events || []).filter((e) => e.starts_at.slice(0, 10) === dayStr)
  const selectedEvents = selected ? byDay(selected) : []
  const move = (delta) => { setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1)); setSelected(null) }

  return (
    <div className="stack-lg">
      <Section title="Calendario" subtitle="Los días sin eventos aparecen como libres"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => move(-1)}>← Mes anterior</button>
            <button className="btn btn-ghost" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(null) }}>Hoy</button>
            <button className="btn btn-ghost" onClick={() => move(1)}>Mes siguiente →</button>
          </>
        }>
        <div className="calendar-card">
          <h3 className="calendar-title">{monthLabel(cursor)}</h3>
          <div className="calendar-grid">
            {DAYS.map((d) => <div key={d} className="calendar-weekday">{d}</div>)}
            {cells.map((cell) => {
              if (cell.empty) return <div key={cell.key} className="calendar-cell empty" />
              const dayStr = stamp(new Date(cursor.getFullYear(), cursor.getMonth(), cell.day))
              const items = byDay(dayStr)
              const isToday = dayStr === stamp(new Date())
              return (
                <button key={cell.key} className={'calendar-cell' + (items.length ? ' busy' : ' free') + (selected === dayStr ? ' selected' : '') + (isToday ? ' today' : '')}
                  onClick={() => setSelected(dayStr)}>
                  <span className="calendar-day">{cell.day}</span>
                  {items.length === 0 ? <small className="calendar-free">Libre</small> : (
                    <div className="calendar-events">
                      {items.slice(0, 3).map((e) => (
                        <span key={e.id} className="cal-pill"
                          style={{ '--event-color': e.event_color || (e.role === 'guest' ? '#e11d48' : e.band_color || '#7c3aed') }}
                          title={e.title}>
                          {timeShort(e.starts_at)} {e.title}
                        </span>
                      ))}
                      {items.length > 3 && <small>+{items.length - 3} más</small>}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          <div className="legend">
            <Badge tone="purple">Tu grupo (encargado)</Badge>
            <Badge tone="blue">Invitado / otro encargado</Badge>
            <span className="muted small">Toca un día para ver el detalle.</span>
          </div>
        </div>
      </Section>

      {selected && (
        <Section title={new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseDate(selected))}
          actions={<Link to={'/eventos/nuevo?date=' + selected} className="btn btn-primary">+ Agendar este día</Link>}>
          {selectedEvents.length === 0 ? <div className="empty">Día libre, puedes agendar 🎉</div> : (
            <div className="card-list">
              {selectedEvents.map((e) => (
                <Link key={e.id} to={'/eventos/' + e.id} className="event-row">
                  <div className="date-box"><strong>{timeShort(e.starts_at)}</strong></div>
                  <div className="event-row-main">
                    <strong>{e.title}</strong>
                    <div className="muted small">{e.client_name || 'Sin cliente'} · {e.band_name || 'Sin agrupación'} · {money(e.charged_amount)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  )
}
