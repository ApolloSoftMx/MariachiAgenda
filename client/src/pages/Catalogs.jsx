import { useState } from 'react'
import { api, useLoad, money } from '../api.js'
import { Loading, ErrorBox, Section, Field, Btn, Modal, confirmAction, useNotify } from '../ui.jsx'

const CONFIG = {
  bands: {
    title: 'Agrupaciones',
    subtitle: 'Tu grupo (tú encargado) y los grupos donde vas invitado',
    blank: { name: '', kind: 'own', responsable: '', color: '#7c3aed' },
    fields: [
      { key: 'name', label: 'Nombre de la agrupación', type: 'text' },
      { key: 'kind', label: 'Tipo', type: 'select', options: [['own', 'Mi grupo (yo encargado)'], ['guest', 'Otro grupo (yo invitado)']] },
      { key: 'responsable', label: 'Encargado del otro grupo', type: 'text' },
      { key: 'color', label: 'Color en el calendario', type: 'color' }
    ],
    columns: [
      ['name', 'Agrupación'],
      ['kind', 'Tipo', (v, row) => v === 'guest' ? `Invitado · ${row.responsable || 'otro encargado'}` : 'Mi grupo'],
      ['color', 'Color', (v) => <span className="color-dot" style={{ background: v }} />]
    ]
  },
  musicians: {
    title: 'Músicos',
    subtitle: 'Catálogo para rellenar rápidamente los músicos de cada evento',
    blank: { name: '', phone: '', default_payment: 0 },
    fields: [
      { key: 'name', label: 'Nombre', type: 'text' },
      { key: 'phone', label: 'Teléfono', type: 'text' },
      { key: 'default_payment', label: 'Pago habitual', type: 'number' }
    ],
    columns: [
      ['name', 'Músico'],
      ['phone', 'Teléfono'],
      ['default_payment', 'Pago habitual', (v) => money(v)],
      ['event_count', 'Eventos']
    ]
  },
  accounts: {
    title: 'Cuentas',
    subtitle: 'Dónde te depositaron los anticipos',
    blank: { name: '', type: 'bank', details: '' },
    fields: [
      { key: 'name', label: 'Nombre de la cuenta', type: 'text', placeholder: 'Ej. BBVA Mariachi' },
      { key: 'type', label: 'Tipo', type: 'select', options: [['bank', 'Banco'], ['cash', 'Efectivo'], ['other', 'Otro']] },
      { key: 'details', label: 'Detalles (CLABE, cuenta, etc.)', type: 'text' }
    ],
    columns: [['name', 'Cuenta'], ['type', 'Tipo'], ['details', 'Detalles']]
  }
}

function Manager({ name }) {
  const notify = useNotify()
  const cfg = CONFIG[name]
  const { data, loading, error, reload } = useLoad(() => api.get('/' + name), [])
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />

  async function save(e) {
    e.preventDefault()
    setSaving(true); setFormError('')
    try {
      const body = { ...editing }
      delete body.id
      delete body.event_count
      if (editing.id) await api.patch(`/${name}/${editing.id}`, body)
      else await api.post('/' + name, body)
      setEditing(null); reload(); notify('Guardado')
    } catch (err) { setFormError(err.message) } finally { setSaving(false) }
  }

  function remove(row) {
    confirmAction(`¿Eliminar «${row.name}»?`, async () => {
      await api.del(`/${name}/${row.id}`); reload(); notify('Eliminado')
    })
  }

  const form = editing || cfg.blank

  return (
    <Section title={cfg.title} subtitle={cfg.subtitle}
      actions={<Btn onClick={() => { setEditing({ ...cfg.blank }); setFormError('') }}>+ Nuevo</Btn>}>
      {(data || []).length === 0 ? <div className="empty">Sin registros todavía.</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr>{cfg.columns.map(([, label]) => <th key={label}>{label}</th>)}<th></th></tr></thead>
            <tbody>
              {(data || []).map((row) => (
                <tr key={row.id}>
                  {cfg.columns.map(([key, , render]) => (
                    <td key={key}>{render ? render(row[key], row) : (row[key] ?? '—')}</td>
                  ))}
                  <td>
                    <div className="row gap">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditing({ ...row }); setFormError('') }}>Editar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(row)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal title={editing.id ? 'Editar' : 'Nuevo'} onClose={() => setEditing(null)}>
          <form className="stack" onSubmit={save}>
            {formError && <ErrorBox message={formError} />}
            {cfg.fields.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.type === 'select' ? (
                  <select value={form[f.key] ?? ''} onChange={(e) => setEditing({ ...form, [f.key]: e.target.value })}>
                    {f.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                ) : (
                  <input type={f.type} value={form[f.key] ?? ''} placeholder={f.placeholder || ''}
                    onChange={(e) => setEditing({ ...form, [f.key]: e.target.value })} />
                )}
              </Field>
            ))}
            <div className="row gap"><Btn type="submit" disabled={saving}>Guardar</Btn><Btn variant="ghost" onClick={() => setEditing(null)}>Cancelar</Btn></div>
          </form>
        </Modal>
      )}
    </Section>
  )
}

export default function Catalogs() {
  const [tab, setTab] = useState('bands')
  return (
    <div className="stack-lg">
      <div className="segmented wide">
        {Object.entries(CONFIG).map(([key, cfg]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{cfg.title}</button>
        ))}
      </div>
      <Manager key={tab} name={tab} />
    </div>
  )
}
