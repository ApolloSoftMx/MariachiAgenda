import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, useLoad, mapsFor } from '../api.js'
import { Loading, ErrorBox, Field, Btn, Section, Modal, confirmAction, useNotify } from '../ui.jsx'
import EventShareButton from '../EventShareButton.jsx'

function defaultStart() {
  const d = new Date(Date.now() + 3600_000)
  d.setMinutes(0, 0, 0)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`
}

const blankForm = (date) => ({
  title: '', starts_at: date ? date + 'T10:00' : defaultStart(), ends_at: '', tandas: 1, rate_per_tanda: 0,
  band_id: '', role: 'leader', client_id: '', location_name: '', address: '', maps_url: '',
  status: 'confirmed', musicians_planned: 0, charged_amount: 0, advance_amount: 0,
  advance_account_id: '', notes: '', catalog_new_musicians: true, musicians: []
})

const pad = (n) => String(n).padStart(2, '0')
function endsFromTandas(start, tandas) {
  const n = Math.round(Number(tandas))
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(start || ''))
  if (!n || n < 1 || !match) return ''
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))
  d.setHours(d.getHours() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const emptyMusician = () => ({ musician_id: '', name: '', phone: '', payment_per_tanda: 0, payment_amount: 0, paid: false })

const amountFromRate = (rate, tandas) => {
  const r = Number(rate) || 0
  const t = Math.round(Number(tandas)) || 0
  return r > 0 && t > 0 ? Number((r * t).toFixed(2)) : 0
}

export default function EventForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const notify = useNotify()
  const [form, setForm] = useState(() => blankForm(params.get('date')))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [clientModal, setClientModal] = useState(false)
  const [newClient, setNewClient] = useState({ name: '', phone: '' })

  const refs = useLoad(() => Promise.all([
    api.get('/bands'), api.get('/clients'), api.get('/accounts'), api.get('/musicians')
  ]), [])
  const eventLoad = useLoad(() => id ? api.get('/events/' + id) : Promise.resolve(null), [id])

  useEffect(() => {
    if (!eventLoad.data) return
    const e = eventLoad.data
    setForm({
      ...e,
      ends_at: e.ends_at || '',
      tandas: e.tandas || 0,
      rate_per_tanda: e.rate_per_tanda || 0,
      band_id: e.band_id || '',
      client_id: e.client_id || '',
      advance_account_id: e.advance_account_id || '',
      catalog_new_musicians: true,
      musicians: (e.musicians || []).map((m) => ({
        musician_id: m.musician_id || '', name: m.name, phone: m.phone || '',
        payment_per_tanda: m.payment_per_tanda || 0,
        payment_amount: m.payment_amount, paid: Boolean(m.paid)
      }))
    })
  }, [eventLoad.data])

  if ((refs.loading && !refs.data) || (eventLoad.loading && id && !eventLoad.data)) return <Loading />
  if (refs.error || eventLoad.error) return <ErrorBox message={refs.error || eventLoad.error} />

  const [bands, clients, accounts, catalog] = refs.data || [[], [], [], []]
  const isGuest = form.role === 'guest'
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const setRole = (value) => setForm((f) => value === 'guest'
    ? { ...f, role: value, client_id: '', advance_amount: 0, advance_account_id: '', musicians: [] }
    : { ...f, role: value })
  const setTandas = (value) => setForm((f) => ({
    ...f,
    tandas: value,
    ends_at: endsFromTandas(f.starts_at, value) || f.ends_at,
    charged_amount: Number(f.rate_per_tanda) > 0 ? amountFromRate(f.rate_per_tanda, value) : f.charged_amount,
    musicians: f.musicians.map((m) => Number(m.payment_per_tanda) > 0
      ? { ...m, payment_amount: amountFromRate(m.payment_per_tanda, value) } : m)
  }))
  const setStart = (value) => setForm((f) => ({
    ...f, starts_at: value, ends_at: endsFromTandas(value, f.tandas) || f.ends_at
  }))
  const setRate = (value) => setForm((f) => ({
    ...f, rate_per_tanda: value,
    charged_amount: Number(value) > 0 ? amountFromRate(value, f.tandas) : f.charged_amount
  }))
  const setMusician = (index, key, value) =>
    setForm((f) => ({ ...f, musicians: f.musicians.map((m, i) => i === index ? { ...m, [key]: value } : m) }))
  const setMusicianRate = (index, value) => setForm((f) => ({
    ...f,
    musicians: f.musicians.map((m, i) => i === index ? {
      ...m,
      payment_per_tanda: value,
      payment_amount: Number(value) > 0 ? amountFromRate(value, f.tandas) : m.payment_amount
    } : m)
  }))

  function pickMusician(index, musicianId) {
    const found = (catalog || []).find((m) => String(m.id) === String(musicianId))
    setForm((f) => ({
      ...f,
      musicians: f.musicians.map((m, i) => i === index ? {
        ...m,
        musician_id: musicianId ? Number(musicianId) : '',
        name: found?.name || '',
        phone: found?.phone || '',
        payment_amount: Number(m.payment_per_tanda) > 0
          ? m.payment_amount : (m.payment_amount || found?.default_payment || 0)
      } : m)
    }))
  }

  function makeMaps() {
    const query = form.address || form.location_name
    if (!query) return notify('Escribe la dirección o el lugar primero')
    set('maps_url', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`)
    notify('Enlace de Maps generado')
  }

  async function addClient(e) {
    e.preventDefault()
    try {
      const created = await api.post('/clients', newClient)
      const fresh = await api.get('/clients')
      refs.reload()
      set('client_id', created.id)
      setNewClient({ name: '', phone: '' })
      setClientModal(false)
      notify('Cliente agregado')
    } catch (err) { setError(err.message) }
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = {
      ...form,
      ends_at: form.ends_at || null,
      band_id: form.band_id || null,
      client_id: form.client_id || null,
      advance_account_id: form.advance_account_id || null,
      rate_per_tanda: Number(form.rate_per_tanda) || 0,
      charged_amount: Number(form.charged_amount) || 0,
      advance_amount: Number(form.advance_amount) || 0,
      musicians: form.musicians.filter((m) => m.name.trim()).map((m) => ({
        musician_id: m.musician_id || null,
        name: m.name.trim(), phone: m.phone || '',
        payment_per_tanda: Number(m.payment_per_tanda) || 0,
        payment_amount: Number(m.payment_amount) || 0, paid: Boolean(m.paid)
      }))
    }
    try {
      if (id) await api.patch('/events/' + id, payload)
      else await api.post('/events', payload)
      notify(id ? 'Evento actualizado' : 'Evento agendado')
      navigate('/eventos')
    } catch (err) {
      setError(err.message)
    } finally { setSaving(false) }
  }

  function remove() {
    confirmAction('¿Eliminar este evento?', async () => {
      await api.del('/events/' + id)
      notify('Evento eliminado'); navigate('/eventos')
    })
  }

  return (
    <div className="stack-lg">
      <Section title={id ? 'Editar evento' : 'Nuevo evento'}
        subtitle={isGuest ? 'Agenda del evento y tu pago como invitado' : 'Agenda, lugar, clientes y finanzas de la presentación'}
        actions={<>
          <Link to="/eventos" className="btn btn-ghost">← Volver a eventos</Link>
          {id && <EventShareButton event={{ id }} />}
        </>}>
        <form onSubmit={save} className="stack-lg">
          {error && <ErrorBox message={error} />}

          <div className="form-card">
            <h3>Datos del evento</h3>
            <div className="grid-2">
              <Field label="Título del evento" className="span-2">
                <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ej. Boda en San Luis" required />
              </Field>
              <Field label="Fecha y hora de inicio">
                <input type="datetime-local" value={form.starts_at} onChange={(e) => setStart(e.target.value)} required />
              </Field>
              <Field label="Número de tandas (horas)" hint="Cada tanda dura 1 hora. La fecha de fin se calcula sola.">
                <input type="number" min="1" max="48" step="1" value={form.tandas}
                  onChange={(e) => setTandas(e.target.value)} />
              </Field>
              <Field label="Fecha y hora de fin" hint="Se calcula con las tandas; puedes ajustarla si necesitas.">
                <input type="datetime-local" value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} />
              </Field>
              <Field label="Agrupación / encargado">
                <select value={form.band_id} onChange={(e) => {
                  const band = (bands || []).find((b) => String(b.id) === e.target.value)
                  const nextRole = band?.kind === 'guest' ? 'guest' : 'leader'
                  setForm((f) => ({
                    ...f,
                    band_id: e.target.value,
                    role: nextRole,
                    ...(nextRole === 'guest' ? { client_id: '', advance_amount: 0, advance_account_id: '', musicians: [] } : {})
                  }))
                }}>
                  <option value="">Sin agrupación</option>
                  {(bands || []).map((b) => <option key={b.id} value={b.id}>{b.name}{b.kind === 'guest' ? ` (invitado de ${b.responsable || 'otro encargado'})` : ' (mi grupo)'}</option>)}
                </select>
              </Field>
              <Field label="Tu rol en este evento" hint="Es independiente del rol de tu cuenta (super administrador o usuario).">
                <select value={form.role} onChange={(e) => setRole(e.target.value)}>
                  <option value="leader">Encargado (mi grupo)</option>
                  <option value="guest">Invitado (otro encargado)</option>
                </select>
              </Field>
              <Field label="Estado">
                <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                  <option value="confirmed">Confirmado</option>
                  <option value="pending">Pendiente</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </Field>
              {!isGuest && <Field label="Cliente">
                <div className="row gap">
                  <select value={form.client_id} onChange={(e) => set('client_id', e.target.value)}>
                    <option value="">Sin cliente</option>
                    {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                  </select>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setClientModal(true)}>+ Cliente</button>
                </div>
              </Field>}
            </div>
          </div>

          <div className="form-card">
            <h3>Ubicación</h3>
            <div className="grid-2">
              <Field label="Lugar"><input value={form.location_name} onChange={(e) => set('location_name', e.target.value)} placeholder="Ej. Salón El Rancho" /></Field>
              <Field label="Dirección"><input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Calle, número, colonia, ciudad" /></Field>
              <Field label="Enlace de Google Maps" className="span-2" hint="Se genera automáticamente con la dirección o puedes pegar uno.">
                <div className="row gap">
                  <input value={form.maps_url} onChange={(e) => set('maps_url', e.target.value)} placeholder="https://maps.google.com/…" />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={makeMaps}>Generar</button>
                  {mapsFor(form) && <a className="btn btn-ghost btn-sm" href={mapsFor(form)} target="_blank" rel="noreferrer">Abrir</a>}
                </div>
              </Field>
            </div>
          </div>

          {isGuest ? (
            <div className="form-card">
              <h3>Tu pago</h3>
              <p className="muted small">
                Como invitado no necesitas cliente ni datos de cobranza. Solo captura cuánto te pagarán por tanda.
              </p>
              <div className="grid-2">
                <Field label="Pago por tanda (lo que te pagarán)"
                  hint={`Total estimado: tarifa × ${form.tandas || 0} tandas.`}>
                  <input type="number" min="0" step="0.01" value={form.rate_per_tanda}
                    onChange={(e) => setRate(e.target.value)} />
                </Field>
                <Field label="Total que te pagarán" hint="Puedes ajustarlo manualmente si hubo bonos o descuentos.">
                  <input type="number" step="0.01" value={form.charged_amount}
                    onChange={(e) => set('charged_amount', e.target.value)} />
                </Field>
              </div>
            </div>
          ) : (
            <div className="form-card">
              <h3>Finanzas del evento</h3>
              <div className="grid-2">
                <Field label="Pago por tanda (precio al cliente)"
                  hint={`Al cambiar la tarifa o las tandas se calcula el total (tarifa × ${form.tandas || 0} tandas).`}>
                  <input type="number" min="0" step="0.01" value={form.rate_per_tanda}
                    onChange={(e) => setRate(e.target.value)} />
                </Field>
                <Field label="Total que se cobró" hint="Puedes ajustarlo manualmente si hubo bonos o descuentos.">
                  <input type="number" step="0.01" value={form.charged_amount} onChange={(e) => set('charged_amount', e.target.value)} />
                </Field>
                <Field label="Anticipo recibido"><input type="number" step="0.01" value={form.advance_amount} onChange={(e) => set('advance_amount', e.target.value)} /></Field>
                <Field label="Cuenta del depósito">
                  <select value={form.advance_account_id} onChange={(e) => set('advance_account_id', e.target.value)}>
                    <option value="">Sin cuenta / efectivo</option>
                    {(accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}{a.details ? ` · ${a.details}` : ''}</option>)}
                  </select>
                </Field>
              </div>
            </div>
          )}

          {!isGuest && <div className="form-card">
            <div className="section-head">
              <h3>Músicos que van</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, musicians: [...f.musicians, emptyMusician()] }))}>+ Agregar músico</button>
            </div>
            <div className="grid-2">
              <Field label="Número de músicos que van" hint="Aunque no los listes por nombre.">
                <input type="number" min="0" max="200" value={form.musicians_planned}
                  onChange={(e) => set('musicians_planned', e.target.value)} />
              </Field>
            </div>
            <label className="check">
              <input type="checkbox" checked={form.catalog_new_musicians !== false}
                onChange={(e) => set('catalog_new_musicians', e.target.checked)} />
              Guardar los músicos nuevos en el catálogo para poder seleccionarlos en otros eventos
            </label>
            {form.musicians.length === 0 && <p className="muted small">Opcional: agrega nombres, teléfonos, pago por tanda y lo que se les pagará a cada uno.</p>}
            <div className="stack">
              {form.musicians.map((m, i) => (
                <div key={i} className="musician-row">
                  <select value={m.musician_id} onChange={(e) => pickMusician(i, e.target.value)} aria-label="Músico del catálogo">
                    <option value="">Nuevo…</option>
                    {(catalog || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <input value={m.name} onChange={(e) => setMusician(i, 'name', e.target.value)} placeholder="Nombre" />
                  <input value={m.phone} onChange={(e) => setMusician(i, 'phone', e.target.value)} placeholder="Teléfono" />
                  <input type="number" min="0" step="0.01" value={m.payment_per_tanda}
                    onChange={(e) => setMusicianRate(i, e.target.value)} placeholder="Pago x tanda" aria-label="Pago por tanda" title="Pago por tanda; el total se calcula con las tandas del evento" />
                  <input type="number" step="0.01" value={m.payment_amount} onChange={(e) => setMusician(i, 'payment_amount', e.target.value)} placeholder="Pago total" aria-label="Pago total" title="Puedes ajustarlo manualmente" />
                  <label className="check"><input type="checkbox" checked={m.paid} onChange={(e) => setMusician(i, 'paid', e.target.checked)} /> Pagado</label>
                  <button type="button" className="icon-btn" onClick={() => setForm((f) => ({ ...f, musicians: f.musicians.filter((_, j) => j !== i) }))} aria-label="Quitar músico">✕</button>
                </div>
              ))}
            </div>
          </div>}

          <div className="form-card">
            <Field label="Notas"><textarea rows="3" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Detalles, arreglos, quien más va…" /></Field>
          </div>

          <div className="row gap">
            <Btn type="submit" disabled={saving}>{saving ? 'Guardando…' : id ? 'Guardar cambios' : 'Agendar evento'}</Btn>
            {id && <Btn variant="danger" onClick={remove}>Eliminar evento</Btn>}
            <Link to="/eventos" className="btn btn-ghost">Cancelar</Link>
          </div>
        </form>
      </Section>

      {clientModal && (
        <Modal title="Nuevo cliente" onClose={() => setClientModal(false)}>
          <form className="stack" onSubmit={addClient}>
            <Field label="Nombre"><input value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} required /></Field>
            <Field label="Teléfono"><input value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} placeholder="55 1234 5678" /></Field>
            <Btn type="submit">Guardar cliente</Btn>
          </form>
        </Modal>
      )}
    </div>
  )
}
