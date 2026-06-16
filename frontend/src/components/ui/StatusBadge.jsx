const STATUS_CLASS = {
  ACTIVO: 'success',
  ACTIVA: 'success',
  CONNECTED: 'success',
  AUTHENTICATED: 'success',
  QR_READY: 'warning',
  INITIALIZING: 'warning',
  ENVIADA: 'success',
  NUEVO: 'info',
  CONTACTADO: 'info',
  COTIZADO: 'warning',
  EN_PROCESO: 'info',
  PENDIENTE: 'warning',
  OPEN: 'info',
  BOT_ACTIVE: 'success',
  REQUIRES_HUMAN: 'warning',
  HUMAN_ACTIVE: 'info',
  CLOSED: 'neutral',
  INACTIVO: 'danger',
  INACTIVA: 'danger',
  DISCONNECTED: 'danger',
  AUTH_FAILED: 'danger',
  ERROR: 'danger'
};

export function StatusBadge({ children, status }) {
  const value = String(status ?? children ?? '').toUpperCase();
  const tone = STATUS_CLASS[value] ?? 'neutral';
  const daisyTone = {
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-error',
    info: 'badge-info',
    neutral: 'badge-neutral'
  }[tone];

  return <span className={`status-badge badge badge-outline ${daisyTone} ${tone}`}>{children ?? status}</span>;
}
