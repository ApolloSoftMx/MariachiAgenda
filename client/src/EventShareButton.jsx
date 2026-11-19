import { useEffect, useState } from 'react'
import { api, useLoad, money } from './api.js'
import { Modal, Field, Btn, Loading, ErrorBox, useNotify } from './ui.jsx'
import { copyText } from './quote.js'
import { buildEventMessage, buildInviteMessage, buildMusicianMessage, buildConfirmationMessage, waLink, waNumber } from './eventShare.js'

// Genera una invitación pública: el encargado comparte el enlace por WhatsApp y
// cada músico confirma su asistencia identificándose con nombre y teléfono.
export default function EventShareButton({ event, label = 'Compartir', small = false }) {
  const notify = useNotify()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [inviteText, setInviteText] = useState('')
  const [rate, setRate] = useState('0')
  const [invite, setInvite] = useState(null)
  const [invites, setInvites] = useState([])
  const [creating, setCreating] = useState(false)
  const [actionError, setActionError] = useState('')
  const { data, loading, error } = useLoad(async () => {
    if (!open || !event?.id) return null
    const [detail, existing] = await Promise.all([
      api.get('/events/' + event.id),
      api.get('/events/' + event.id + '/invites')
    ])
    return { detail, existing }
  }, [open, event?.id])

  const detail = data?.detail || null

  useEffect(() => {
    if (!data) return
    setMessage(buildEventMessage(data.detail))
    setInvites(data.existing || [])
  }, [data])

  const responses = invites.flatMap((i) => i.responses || [])
  const latest = new Map()
  for (const r of responses) latest.set(r.phone, r)
  const confirmed = [...latest.values()].filter((r) => r.status === 'confirmed')
  const declined = [...latest.values()].filter((r) => r.status === 'declined')

  async function copy(text, what) {
    notify(await copyText(text) ? `${what} copiado` : 'No se pudo copiar')
  }

  async function createInvite() {
    setActionError('')
    setCreating(true)
    try {
      const created = await api.post('/events/' + event.id + '/invites', {
        rate_per_tanda: Number(rate) || 0
      })
      setInvite(created)
      setInviteText(buildInviteMessage(detail, created.publicUrl))
      setInvites(await api.get('/events/' + event.id + '/invites'))
      notify('Enlace de invitación creado')
    } catch (err) {
      setActionError(err.message || 'No se pudo crear la invitación.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <button type="button" className={'btn btn-ghost' + (small ? ' btn-sm' : '')} onClick={() => setOpen(true)}>
        📤 {label}
      </button>
      {open && <Modal title="Invitar músicos al evento" onClose={() => setOpen(false)} wide>
        <div className="stack">
          {loading && <Loading />}
          {error && <ErrorBox message={error} />}
          {actionError && <ErrorBox message={actionError} />}
          {detail && <>
            <Field label="Vista previa del evento" hint="Este texto no incluye nombres de músicos ni importes.">
              <textarea rows="6" value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
            <div className="row gap wrap">
              <Btn onClick={() => copy(message, 'Mensaje')}>Copiar mensaje</Btn>
              <a className="btn btn-primary" href={waLink('', message)} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
            </div>

            <div className="section-head"><h3>Invitación con confirmación</h3></div>
            <p className="muted small">
              Crea un enlace público, envíalo por WhatsApp y cada músico confirmará su asistencia con nombre y teléfono.
              Al confirmar se agrega al evento; si su teléfono ya está en el catálogo, se reutiliza ese músico.
            </p>
            <Field
              label="Pago por tanda para esta invitación"
              hint="Queda guardado en el enlace. No se muestra en la página pública ni en el mensaje."
            >
              <input type="number" min="0" max="100000" step="0.01" value={rate}
                onChange={(e) => setRate(e.target.value)} />
            </Field>
            <div className="row gap wrap">
              <Btn onClick={createInvite} disabled={creating}>
                {creating ? 'Creando…' : 'Generar enlace de invitación'}
              </Btn>
            </div>

            {invite && <>
              <Field label="Enlace para los músicos" hint="Cópialo y envíalo por WhatsApp a quienes quieras invitar.">
                <input readOnly value={invite.publicUrl} onFocus={(e) => e.target.select()} />
              </Field>
              <Field label="Mensaje con el enlace" hint="Puedes editarlo antes de copiarlo o abrir WhatsApp.">
                <textarea rows="7" value={inviteText} onChange={(e) => setInviteText(e.target.value)} />
              </Field>
              <div className="row gap wrap">
                <Btn onClick={() => copy(invite.publicUrl, 'Enlace')}>Copiar enlace</Btn>
                <Btn onClick={() => copy(inviteText, 'Mensaje')}>Copiar mensaje</Btn>
                <a className="btn btn-primary" href={waLink('', inviteText)} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
              </div>

            </>}

            {confirmed.length > 0 && <>
              <div className="section-head"><h3>Enviar a músicos confirmados</h3></div>
              <p className="muted small">
                Datos completos del evento con emojis, el nombre del músico y el pago capturado en el evento.
                Cada mensaje es solo para ese músico.
              </p>
              <div className="stack">
                {confirmed.map((r) => {
                  const text = buildMusicianMessage(detail, r)
                  const pago = Number(r.payment_amount)
                    || (Number(r.payment_per_tanda || r.invite_rate_per_tanda) || 0) * (Number(detail.tandas) || 0)
                  return (
                    <div key={r.phone} className="share-musician">
                      <div className="who">
                        <strong>{r.name}</strong>
                        <div className="muted small">📱 {r.phone}{pago > 0 ? ` · Pago ${money(pago)}` : ''}</div>
                      </div>
                      <div className="row gap wrap">
                        {waNumber(r.phone) && (
                          <a className="btn btn-ghost btn-sm" href={waLink(r.phone, text)} target="_blank" rel="noreferrer">
                            📱 WhatsApp
                          </a>
                        )}
                        <button type="button" className="btn btn-ghost btn-sm"
                          onClick={() => copy(text, `Mensaje de ${r.name}`)}>
                          Copiar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>}

            {invites.length > 0 && <>
              <div className="section-head"><h3>Respuestas</h3></div>
              <p className="muted small">
                {confirmed.length} confirmaron asistencia · {declined.length} no pueden asistir
              </p>
              <p className="muted small">
                En quienes confirmaron puedes abrir WhatsApp o copiar un mensaje individual con emojis y su pago.
              </p>
              {confirmed.length + declined.length > 0 && (
                <div className="stack">
                  {[...latest.values()].map((r) => {
                    const isConfirmed = r.status === 'confirmed'
                    const confirmationText = isConfirmed ? buildConfirmationMessage(detail, r) : ''
                    const pago = Number(r.payment_amount)
                      || (Number(r.payment_per_tanda || r.invite_rate_per_tanda) || 0) * (Number(detail.tandas) || 0)
                    return (
                      <div key={r.phone} className="share-musician">
                        <div className="who">
                          <strong>{r.name}</strong>
                          <div className="muted small">
                            📱 {r.phone}{pago > 0 ? ` · Pago ${money(pago)}` : ''}
                          </div>
                        </div>
                        <div className="row gap wrap">
                          <span className={'badge ' + (isConfirmed ? 'badge-green' : 'badge-red')}>
                            {isConfirmed ? 'Asiste' : 'No asiste'}
                          </span>
                          {isConfirmed && <>
                            {waNumber(r.phone) && (
                              <a className="btn btn-ghost btn-sm" href={waLink(r.phone, confirmationText)}
                                target="_blank" rel="noreferrer">
                                📱 WhatsApp
                              </a>
                            )}
                            <button type="button" className="btn btn-ghost btn-sm"
                              onClick={() => copy(confirmationText, `Mensaje de ${r.name}`)}>
                              Copiar
                            </button>
                          </>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>}
          </>}
        </div>
      </Modal>}
    </>
  )
}
