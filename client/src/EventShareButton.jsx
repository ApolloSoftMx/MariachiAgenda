import { useEffect, useState } from 'react'
import { api, useLoad, money } from './api.js'
import { Modal, Field, Btn, Loading, ErrorBox, useNotify } from './ui.jsx'
import { copyText } from './quote.js'
import { buildEventMessage, personalMessage, waLink, waNumber } from './eventShare.js'

// Comparte la ficha guardada del evento por WhatsApp o como texto, con un mensaje
// distinto para cada músico que tenga teléfono (solo ve su propio pago).
export default function EventShareButton({ event, label = 'Compartir', small = false }) {
  const notify = useNotify()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const { data: detail, loading, error } = useLoad(
    () => (open && event?.id ? api.get('/events/' + event.id) : Promise.resolve(null)),
    [open, event?.id]
  )

  useEffect(() => {
    if (detail) setMessage(buildEventMessage(detail))
  }, [detail])

  const musicians = (detail?.musicians || []).filter((m) => String(m.name || '').trim())

  async function copy(text, what) {
    notify(await copyText(text) ? `${what} copiado` : 'No se pudo copiar')
  }

  return (
    <>
      <button type="button" className={'btn btn-ghost' + (small ? ' btn-sm' : '')} onClick={() => setOpen(true)}>
        📤 {label}
      </button>
      {open && <Modal title="Compartir evento" onClose={() => setOpen(false)} wide>
        <div className="stack">
          {loading && <Loading />}
          {error && <ErrorBox message={error} />}
          {detail && <>
            <Field label="Mensaje para los músicos" hint="Puedes editarlo antes de copiarlo o abrir WhatsApp. Se toma la información guardada del evento.">
              <textarea rows="7" value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
            <div className="row gap wrap">
              <Btn onClick={() => copy(message, 'Mensaje')}>Copiar mensaje</Btn>
              <a className="btn btn-primary" href={waLink('', message)} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
            </div>

            <div className="section-head"><h3>Enviar a los músicos</h3></div>
            {musicians.length === 0 ? (
              <p className="muted small">Este evento no tiene músicos en la lista. Copia el mensaje o abre WhatsApp para elegir un chat.</p>
            ) : (
              <div className="stack">
                {musicians.map((m, i) => {
                  const text = personalMessage(message, m)
                  return (
                    <div key={m.id || i} className="share-musician">
                      <div className="who">
                        <strong>{m.name}</strong>
                        <div className="muted small">
                          {m.phone ? `📱 ${m.phone}` : 'Sin teléfono'}
                          {Number(m.payment_amount) > 0 ? ` · Pago ${money(m.payment_amount)}` : ''}
                        </div>
                      </div>
                      <div className="row gap">
                        {waNumber(m.phone) && (
                          <a className="btn btn-ghost btn-sm" href={waLink(m.phone, text)} target="_blank" rel="noreferrer">
                            WhatsApp
                          </a>
                        )}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(text, `Mensaje de ${m.name}`)}>
                          Copiar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="muted small">
              Cada mensaje incluye únicamente el pago de ese músico. WhatsApp no adjunta archivos desde <code>wa.me</code>: aquí solo se comparte texto.
            </p>
          </>}
        </div>
      </Modal>}
    </>
  )
}
