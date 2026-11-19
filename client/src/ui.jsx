import { useApp } from './App.jsx'

export function useNotify() {
  return useApp().notify
}

export function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={'modal' + (wide ? ' modal-wide' : '')} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children, hint, className = '' }) {
  return (
    <label className={'field ' + className}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  )
}

export function Btn({ children, variant = 'primary', type = 'button', className = '', ...props }) {
  return <button type={type} className={`btn btn-${variant} ${className}`.trim()} {...props}>{children}</button>
}

export function Badge({ children, tone = 'gray' }) {
  return <span className={'badge badge-' + tone}>{children}</span>
}

export function Section({ title, subtitle, actions, children, ...rest }) {
  return (
    <section className="section" {...rest}>
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions && <div className="row gap">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

export function Loading() {
  return <div className="empty">Cargando…</div>
}

export function ErrorBox({ message }) {
  return <div className="alert alert-error">{message}</div>
}

export function Stat({ label, value, tone = '' }) {
  return (
    <div className={'stat ' + tone}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </div>
  )
}

export function confirmAction(message, action) {
  if (window.confirm(message)) action()
}

export function roleBadge(role, bandKind, responsable) {
  if (role === 'guest' || bandKind === 'guest') {
    return <Badge tone="blue">Invitado{responsable ? ` · ${responsable}` : ''}</Badge>
  }
  return <Badge tone="purple">Mi grupo · encargado</Badge>
}

export function statusBadge(status) {
  const map = { confirmed: ['Confirmado', 'green'], pending: ['Pendiente', 'amber'], cancelled: ['Cancelado', 'red'] }
  const [label, tone] = map[status] || [status, 'gray']
  return <Badge tone={tone}>{label}</Badge>
}
