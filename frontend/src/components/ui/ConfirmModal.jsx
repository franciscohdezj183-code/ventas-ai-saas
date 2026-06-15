import { AlertTriangle, X } from 'lucide-react';

export function ConfirmModal({
  open,
  title = 'Confirmar accion',
  description = 'Esta accion no se puede deshacer.',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onCancel,
  onConfirm
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop modal modal-open" role="presentation">
      <div className="confirm-modal modal-box" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <button className="icon-button modal-close btn btn-ghost btn-circle" aria-label="Cerrar" onClick={onCancel} type="button">
          <X size={18} aria-hidden="true" />
        </button>
        <div className={destructive ? 'modal-icon danger' : 'modal-icon'}>
          <AlertTriangle size={22} aria-hidden="true" />
        </div>
        <h2 id="confirm-title">{title}</h2>
        <p>{description}</p>
        <div className="modal-actions modal-action">
          <button className="secondary-button btn btn-ghost" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button
            className={destructive ? 'danger-button btn btn-error' : 'primary-button btn btn-primary'}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
