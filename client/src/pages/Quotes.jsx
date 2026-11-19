import { useEffect, useState } from 'react'
import { api, useLoad, money, dateShort } from '../api.js'
import { Loading, ErrorBox, Section, Field, Btn, Modal, Badge, confirmAction, useNotify } from '../ui.jsx'
import { copyText, downloadQuotePng } from '../quote.js'

const blank = {
  title: '', client_id: '', event_date: '', event_time: '19:00', location_name: '',
  address: '', maps_url: '', description: '', musicians_planned: 0,
  amount: 0, deposit_amount: 0, valid_until: '', status: 'draft',
  deposit_account_id: '', deposit_details: '', notes: ''
}

const NEW_CLIENT = '__new__'
const blankNewClient = { name: '', phone: '', notes: '' }

const STATUS = {
  draft: ['Borrador', 'gray'], sent: ['Enviada', 'blue'],
  accepted: ['Aceptada', 'green'], rejected: ['Rechazada', 'red']
}

const statusBadge = (status) => {
  const [label, tone] = STATUS[status] || STATUS.draft
  return <Badge tone={tone}>{label}</Badge>
}

function ShareModal({ quote, onChanged, onClose }) {
  const notify = useNotify()
  const [share, setShare] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/quotes/${quote.id}/share`)
      .then((data) => { setShare(data); setMessage(data.message) })
      .catch((err) => setError(err.message))
  }, [quote.id])

  async function markSent() {
    try {
      await api.patch(`/quotes/${quote.id}`, { status: 'sent' })
      onChanged(); notify('Cotización marcada como enviada')
    } catch (err) { notify(err.message) }
  }

  if (error) return <ErrorBox message={error} />
  if (!share) return <Loading />

  const waUrl = share.whatsappUrl || `https://wa.me/?text=${encodeURIComponent(message)}`

  return (
    <Modal title={`Enviar cotización · ${quote.title}`} onClose={onClose} wide>
      <div className="stack">
        <div className="row gap wrap">
          <a className="btn btn-primary" href={waUrl} target="_blank" rel="noreferrer">💬 Abrir WhatsApp</a>
          <a className="btn btn-ghost" href={share.pdfUrl} target="_blank" rel="noreferrer">📄 Ver PDF</a>
          {share.mapsUrl && <a className="btn btn-ghost" href={share.mapsUrl} target="_blank" rel="noreferrer">📍 Ver ubicación</a>}
          <a className="btn btn-ghost" href={share.publicUrl} target="_blank" rel="noreferrer">🔗 Ver página del cliente</a>
          {share.receiptUrl && <a className="btn btn-ghost" href={share.receiptUrl} target="_blank" rel="noreferrer">🧾 Ver comprobante</a>}
          <Btn variant="ghost" onClick={() => downloadQuotePng(quote)}>🖼️ Descargar imagen</Btn>
          <Btn variant="ghost" onClick={markSent}>Marcar como enviada</Btn>
        </div>

        <Field label="Mensaje listo para WhatsApp" hint="Puedes editarlo antes de copiarlo o abrir WhatsApp.">
          <textarea rows={9} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>

        <div className="row gap wrap">
          <Btn onClick={async () => notify(await copyText(message) ? 'Mensaje copiado' : 'No se pudo copiar')}>
            Copiar mensaje
          </Btn>
          <Btn variant="ghost" onClick={async () => notify(await copyText(share.publicUrl) ? 'Enlace copiado' : 'No se pudo copiar')}>
            Copiar enlace público
          </Btn>
          <Btn variant="ghost" onClick={async () => notify(await copyText(share.pdfUrl) ? 'Enlace del PDF copiado' : 'No se pudo copiar')}>
            Copiar enlace del PDF
          </Btn>
        </div>

        <p className="muted small">
          {share.clientPhone
            ? `El mensaje se abre con el teléfono registrado: ${share.clientPhone}.`
            : 'Este cliente no tiene teléfono registrado. WhatsApp te pedirá elegir el contacto.'}
          {' '}La cotización y el PDF se comparten por enlace; WhatsApp no adjunta archivos desde un enlace wa.me.
        </p>
      </div>
    </Modal>
  )
}

export default function Quotes() {
  const notify = useNotify()
  const { data, loading, error, reload } = useLoad(() => api.get('/quotes'), [])
  const clientsLoad = useLoad(() => api.get('/clients'), [])
  const accountsLoad = useLoad(() => api.get('/accounts'), [])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [sharing, setSharing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  if (loading || clientsLoad.loading || accountsLoad.loading) return <Loading />
  if (error || clientsLoad.error || accountsLoad.error) {
    return <ErrorBox message={error || clientsLoad.error || accountsLoad.error} />
  }

  const quotes = (data || []).filter((q) =>
    !search || `${q.title} ${q.client_name || ''}`.toLowerCase().includes(search.toLowerCase()))

  async function save(e) {
    e.preventDefault()
    setSaving(true); setFormError('')
    try {
      const body = { ...editing }
      delete body.id
      delete body.created_at
      delete body.updated_at
      delete body.share_token
      delete body.client_name
      delete body.client_phone
      delete body.account_name
      delete body.account_details
      delete body._newClient
      let createdClient = false
      if (body.client_id === NEW_CLIENT) {
        const client = await api.post('/clients', {
          name: String(editing._newClient?.name || '').trim(),
          phone: String(editing._newClient?.phone || '').trim(),
          notes: String(editing._newClient?.notes || '').trim()
        })
        body.client_id = client.id
        createdClient = true
        clientsLoad.reload()
      }
      if (editing.id) await api.patch(`/quotes/${editing.id}`, body)
      else await api.post('/quotes', body)
      setEditing(null); reload()
      notify(createdClient ? 'Cliente dado de alta y cotización guardada' : 'Cotización guardada')
    } catch (err) { setFormError(err.message) } finally { setSaving(false) }
  }

  function remove(quote) {
    confirmAction(`¿Eliminar la cotización «${quote.title}»?`, async () => {
      try {
        await api.del(`/quotes/${quote.id}`); reload(); notify('Cotización eliminada')
      } catch (err) { notify(err.message) }
    })
  }

  return (
    <div className="stack-lg">
      <Section title="Cotizaciones" subtitle="Registra propuestas, comparte el PDF o una imagen y envía los datos de depósito"
        actions={<Btn onClick={() => { setEditing({ ...blank, _newClient: { ...blankNewClient } }); setFormError('') }}>+ Nueva cotización</Btn>}>
        <div className="filters">
          <Field label="Buscar">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Título o cliente" />
          </Field>
          <span className="muted small">{quotes.length} cotización(es)</span>
        </div>

        {quotes.length === 0 ? <div className="empty">Aún no hay cotizaciones. Crea la primera con el botón de arriba.</div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Cotización</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Estatus</th><th></th></tr></thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td><strong>{q.title}</strong></td>
                  <td>{q.client_name || '—'}</td>
                  <td>{q.event_date ? dateShort(q.event_date) : '—'}</td>
                  <td><strong>{money(q.amount)}</strong></td>
                  <td>{statusBadge(q.status)}</td>
                  <td>
                    <div className="row gap wrap">
                      <button className="btn btn-primary btn-sm" onClick={() => setSharing(q)}>Enviar</button>
                      {q.receipt_path && <a className="btn btn-ghost btn-sm" href={`/q/${q.share_token}/receipt`} target="_blank" rel="noreferrer">🧾 Comprobante</a>}
                      <a className="btn btn-ghost btn-sm" href={`/api/quotes/${q.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditing({ ...q }); setFormError('') }}>Editar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(q)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Section>

      {editing && (
        <Modal title={editing.id ? 'Editar cotización' : 'Nueva cotización'} onClose={() => setEditing(null)} wide>
          <form className="stack" onSubmit={save}>
            {formError && <ErrorBox message={formError} />}
            <div className="grid-2">
              <Field label="Título" className="span-2">
                <input value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required />
              </Field>
              <Field label="Cliente" hint="Si aún no está registrado, elige «Crear nuevo cliente».">
                <select value={editing.client_id ?? ''} onChange={(e) => {
                  const value = e.target.value
                  setEditing((prev) => ({
                    ...prev,
                    client_id: value,
                    _newClient: value === NEW_CLIENT && !prev._newClient ? { ...blankNewClient } : prev._newClient
                  }))
                }}>
                  <option value="">Sin cliente</option>
                  {(clientsLoad.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value={NEW_CLIENT}>➕ Crear nuevo cliente…</option>
                </select>
              </Field>
              {editing.client_id === NEW_CLIENT && (
                <>
                  <Field label="Nombre del nuevo cliente" className="span-2" hint="Se dará de alta en Clientes al guardar la cotización.">
                    <input value={editing._newClient?.name || ''} required placeholder="Nombre completo"
                      onChange={(e) => setEditing({ ...editing, _newClient: { ...editing._newClient, name: e.target.value } })} />
                  </Field>
                  <Field label="Teléfono del nuevo cliente" hint="Con él se generan los enlaces de WhatsApp y llamada.">
                    <input value={editing._newClient?.phone || ''} placeholder="55 1234 5678"
                      onChange={(e) => setEditing({ ...editing, _newClient: { ...editing._newClient, phone: e.target.value } })} />
                  </Field>
                  <Field label="Notas del cliente" className="span-2">
                    <textarea rows={2} value={editing._newClient?.notes || ''}
                      onChange={(e) => setEditing({ ...editing, _newClient: { ...editing._newClient, notes: e.target.value } })} />
                  </Field>
                </>
              )}
              <Field label="Fecha del evento">
                <input type="date" value={editing.event_date || ''} onChange={(e) => setEditing({ ...editing, event_date: e.target.value })} />
              </Field>
              <Field label="Hora" hint="Se usará para agendar el evento cuando el cliente acepte.">
                <input type="time" value={editing.event_time || '19:00'}
                  onChange={(e) => setEditing({ ...editing, event_time: e.target.value })} />
              </Field>
              <Field label="Lugar">
                <input value={editing.location_name || ''} placeholder="Ej. Salón El Rancho"
                  onChange={(e) => setEditing({ ...editing, location_name: e.target.value })} />
              </Field>
              <Field label="Dirección">
                <input value={editing.address || ''} placeholder="Calle, número, colonia"
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
              </Field>
              <Field label="Enlace de Google Maps" className="span-2" hint="Si lo dejas vacío, se genera una búsqueda con el lugar y la dirección.">
                <input value={editing.maps_url || ''} placeholder="https://maps.google.com/..."
                  onChange={(e) => setEditing({ ...editing, maps_url: e.target.value })} />
              </Field>
              <Field label="Músicos planeados">
                <input type="number" min="0" value={editing.musicians_planned ?? 0}
                  onChange={(e) => setEditing({ ...editing, musicians_planned: e.target.value })} />
              </Field>
              <Field label="Total a cobrar">
                <input type="number" min="0" step="0.01" value={editing.amount ?? 0}
                  onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
              </Field>
              <Field label="Monto del depósito" hint="Opcional. Pasa como anticipo al evento cuando el cliente acepte.">
                <input type="number" min="0" step="0.01" value={editing.deposit_amount ?? 0}
                  onChange={(e) => setEditing({ ...editing, deposit_amount: e.target.value })} />
              </Field>
              <Field label="Vigencia">
                <input type="date" value={editing.valid_until || ''} onChange={(e) => setEditing({ ...editing, valid_until: e.target.value })} />
              </Field>
              <Field label="Estatus">
                <select value={editing.status || 'draft'} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                  {Object.entries(STATUS).map(([value, [label]]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="Cuenta para depósito" className="span-2">
                <select value={editing.deposit_account_id ?? ''} onChange={(e) => setEditing({ ...editing, deposit_account_id: e.target.value })}>
                  <option value="">Sin cuenta registrada</option>
                  {(accountsLoad.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}{a.details ? ` · ${a.details}` : ''}</option>)}
                </select>
              </Field>
              <Field label="Datos extra de depósito" className="span-2" hint="Ej. nombre del titular, CLABE, referencia. La cuenta elegida ya se incluye sola.">
                <textarea rows={2} value={editing.deposit_details || ''}
                  onChange={(e) => setEditing({ ...editing, deposit_details: e.target.value })} />
              </Field>
              <Field label="Descripción" className="span-2">
                <textarea rows={3} value={editing.description || ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </Field>
              <Field label="Notas" className="span-2">
                <textarea rows={2} value={editing.notes || ''}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </Field>
            </div>
            <div className="row gap">
              <Btn type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Btn>
              <Btn variant="ghost" onClick={() => setEditing(null)}>Cancelar</Btn>
            </div>
          </form>
        </Modal>
      )}

      {sharing && <ShareModal quote={sharing} onChanged={reload} onClose={() => setSharing(null)} />}
    </div>
  )
}
