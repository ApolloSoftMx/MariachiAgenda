import { useState } from 'react'
import { api, useLoad, money, todayStr } from '../api.js'
import { Loading, ErrorBox, Section, Stat, Field, Btn, Modal, confirmAction, useNotify } from '../ui.jsx'

function monthRange() {
  const d = new Date()
  const y = d.getFullYear(), m = d.getMonth()
  const p = (n) => String(n).padStart(2, '0')
  return { from: `${y}-${p(m + 1)}-01`, to: `${y}-${p(m + 1)}-${p(new Date(y, m + 1, 0).getDate())}` }
}

export default function Reports() {
  const notify = useNotify()
  const initial = monthRange()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const { data, loading, error, reload } = useLoad(() => api.get(`/reports?from=${from}&to=${to}`), [from, to])
  const eventsLoad = useLoad(() => api.get('/events?limit=1000'), [])
  const [expense, setExpense] = useState(null)
  const [formError, setFormError] = useState('')

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />

  const t = data.totals

  function exportCsv() {
    const rows = [['Fecha', 'Evento', 'Cliente', 'Agrupación', 'Cobrado', 'Pagado a músicos', 'Gastos']]
    for (const e of data.byEvent) {
      rows.push([e.starts_at, e.title, e.client_name || '', e.band_name || '', e.charged, e.paid, e.expenses])
    }
    rows.push([])
    rows.push(['TOTAL', '', '', '', t.charged, t.paidToMusicians, t.expenses])
    const csv = '\uFEFF' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `reporte-${from}-a-${to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  async function saveExpense(e) {
    e.preventDefault()
    setFormError('')
    try {
      await api.post('/expenses', { ...expense, amount: Number(expense.amount) })
      setExpense(null); reload(); notify('Gasto guardado')
    } catch (err) { setFormError(err.message) }
  }

  return (
    <div className="stack-lg">
      <Section title="Reporte financiero" subtitle="Cobrado, pagado a músicos y utilidad en el rango elegido"
        actions={<Btn variant="ghost" onClick={exportCsv}>⬇ Exportar CSV</Btn>}>
        <div className="filters">
          <Field label="Desde"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Hasta"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <span className="muted small">{t.eventCount} evento{t.eventCount === 1 ? '' : 's'} en el rango</span>
        </div>
        <div className="stat-grid">
          <Stat label="Cobrado" value={money(t.charged)} tone="green" />
          <Stat label="Anticipos" value={money(t.advance)} tone="blue" />
          <Stat label="Pagado a músicos" value={money(t.paidToMusicians)} tone="amber" />
          <Stat label="Otros gastos" value={money(t.expenses)} tone="red" />
          <Stat label="Utilidad" value={money(t.profit)} tone="purple" />
          <Stat label="Por cobrar" value={money(t.pending)} tone="blue" />
        </div>
      </Section>

      <Section title="Detalle por evento"
        actions={<Btn onClick={() => setExpense({ date: todayStr(), description: '', amount: 0, event_id: '' })}>+ Gasto</Btn>}>
        {data.byEvent.length === 0 ? <div className="empty">Sin eventos en este rango.</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Evento</th><th>Cliente</th><th>Agrupación</th><th>Cobrado</th><th>Pagado</th><th>Gastos</th></tr></thead>
              <tbody>
                {data.byEvent.map((e) => (
                  <tr key={e.id}>
                    <td>{e.starts_at.slice(0, 10)}</td>
                    <td><strong>{e.title}</strong></td>
                    <td>{e.client_name || '—'}</td>
                    <td>{e.band_name || '—'}</td>
                    <td>{money(e.charged)}</td>
                    <td>{money(e.paid)}</td>
                    <td>{money(e.expenses)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid-2">
        <Section title="Por cliente">
          <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Eventos</th><th>Cobrado</th></tr></thead><tbody>
            {data.byClient.map((c) => <tr key={c.name}><td>{c.name}</td><td>{c.count}</td><td>{money(c.charged)}</td></tr>)}
          </tbody></table></div>
        </Section>
        <Section title="Por agrupación">
          <div className="table-wrap"><table><thead><tr><th>Agrupación</th><th>Eventos</th><th>Cobrado</th></tr></thead><tbody>
            {data.byBand.map((b) => <tr key={b.name}><td>{b.name}</td><td>{b.count}</td><td>{money(b.charged)}</td></tr>)}
          </tbody></table></div>
        </Section>
      </div>

      <Section title="Otros gastos">
        {data.expenses.length === 0 ? <div className="empty">No registraste gastos en este rango.</div> : (
          <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Descripción</th><th>Evento</th><th>Monto</th><th></th></tr></thead><tbody>
            {data.expenses.map((x) => (
              <tr key={x.id}>
                <td>{x.date}</td><td>{x.description}</td><td>{x.event_title || '—'}</td><td>{money(x.amount)}</td>
                <td><button className="btn btn-danger btn-sm" onClick={() => confirmAction('¿Eliminar gasto?', async () => {
                  await api.del('/expenses/' + x.id); reload(); notify('Gasto eliminado')
                })}>✕</button></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </Section>

      {expense && (
        <Modal title="Registrar gasto" onClose={() => setExpense(null)}>
          <form className="stack" onSubmit={saveExpense}>
            {formError && <ErrorBox message={formError} />}
            <Field label="Fecha"><input type="date" value={expense.date} onChange={(e) => setExpense({ ...expense, date: e.target.value })} required /></Field>
            <Field label="Descripción"><input value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} required /></Field>
            <Field label="Monto"><input type="number" step="0.01" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} required /></Field>
            <Field label="Evento (opcional)">
              <select value={expense.event_id || ''} onChange={(e) => setExpense({ ...expense, event_id: e.target.value })}>
                <option value="">Sin evento</option>
                {(eventsLoad.data || []).map((e) => <option key={e.id} value={e.id}>{e.title} · {e.starts_at.slice(0, 10)}</option>)}
              </select>
            </Field>
            <div className="row gap"><Btn type="submit">Guardar</Btn><Btn variant="ghost" onClick={() => setExpense(null)}>Cancelar</Btn></div>
          </form>
        </Modal>
      )}
    </div>
  )
}
