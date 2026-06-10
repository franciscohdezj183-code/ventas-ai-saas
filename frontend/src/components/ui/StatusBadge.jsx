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
  INACTIVO: 'danger',
  INACTIVA: 'danger',
  DISCONNECTED: 'danger',
  AUTH_FAILED: 'danger',
  ERROR: 'danger'
};

export function StatusBadge({ children, status }) {
  const value = String(status ?? children ?? '').toUpperCase();
  const tone = STATUS_CLASS[value] ?? 'neutral';

  return <span className={`status-badge ${tone}`}>{children ?? status}</span>;
}
