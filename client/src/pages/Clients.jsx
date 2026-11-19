import { useState } from 'react'
import { api, useLoad, money } from '../api.js'
import { Loading, ErrorBox, Empty, Section, Field, Btn, Modal, confirmAction, useNotify } from '../ui.jsx'

const waLink = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits.startsWith('52') ? digits : '52' + digits}`
}

const blank = { name: '', phone: '', notes: '' }

export default function Clients() {
  const notify = useNotify()
  const { data, loading, error, reload } = useLoad(() => api.get('/clients'), [])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />

  const clients = (data || []).filter((c) =>
    !search || `${c.name} ${c.phone || ''}`.toLowerCase().includes(search.toLowerCase()))

  async function save(e) {
    e.preventDefault()
    setSaving(true); setFormError('')
    try {
      if (editing.id) await api.patch('/clients/' + editing.id, form)
      else await api.post('/clients', form)
      setEditing(null); reload(); notify('Cliente guardado')
    } catch (err) { setFormError(err.message) } finally { setSaving(false) }
  }

  function remove(client) {
    confirmAction(`¿Eliminar a ${client.name}?`, async () => {
      await api.del('/clients/' + client.id); reload(); notify('Cliente eliminado')
    })
  }

  const form = editing || blank

  return (
    <div className="stack-lg">
      <Section title="Clientes" subtitle="Quiénes te contratan, con teléfono para WhatsApp o llamada"
        actions={<Btn onClick={() => { setEditing({ ...blank }); setFormError('') }}>+ Nuevo cliente</Btn>}>
        <div className="filters">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente o teléfono…" />
          <span className="muted small">{clients.length} cliente{clients.length === 1 ? '' : 's'}</span>
        </div>
        {clients.length === 0 ? <Empty>No hay clientes todavía.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Teléfono</th><th>Eventos</th><th>Total cobrado</th><th>Notas</th><th></th></tr></thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong></td>
                    <td>
                      {c.phone || '—'}
                      {c.phone && (
                        <div className="row gap small">
                          {waLink(c.phone) && <a href={waLink(c.phone)} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
                          <a href={'tel:' + String(c.phone).replace(/\s/g, '')}>📞 Llamar</a>
                        </div>
                      )}
                    </td>
                    <td>{c.event_count}</td>
                    <td>{money(c.total_charged)}</td>
                    <td className="muted small">{c.notes || '—'}</td>
                    <td>
                      <div className="row gap">
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditing({ ...c }); setFormError('') }}>Editar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => remove(c)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {editing && (
        <Modal title={editing.id ? 'Editar cliente' : 'Nuevo cliente'} onClose={() => setEditing(null)}>
          <form className="stack" onSubmit={save}>
            {formError && <ErrorBox message={formError} />}
            <Field label="Nombre"><input value={form.name} onChange={(e) => setEditing({ ...form, name: e.target.value })} required /></Field>
            <Field label="Teléfono" hint="Con él se generan los enlaces de WhatsApp y llamada.">
              <input value={form.phone} onChange={(e) => setEditing({ ...form, phone: e.target.value })} placeholder="55 1234 5678" />
            </Field>
            <Field label="Notas"><textarea rows="3" value={form.notes || ''} onChange={(e) => setEditing({ ...form, notes: e.target.value })} /></Field>
            <div className="row gap"><Btn type="submit" disabled={saving}>Guardar</Btn><Btn variant="ghost" onClick={() => setEditing(null)}>Cancelar</Btn></div>
          </form>
        </Modal>
      )}
    </div>
  )
}
