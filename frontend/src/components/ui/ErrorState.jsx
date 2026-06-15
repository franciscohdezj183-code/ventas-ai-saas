import { AlertCircle } from 'lucide-react';

export function ErrorState({ message = 'No se pudo completar la operacion.', onRetry }) {
  return (
    <div className="state-card error-state-card alert alert-warning" role="alert">
      <AlertCircle size={22} aria-hidden="true" />
      <div>
        <strong>Algo no salio bien</strong>
        <p>{message}</p>
      </div>
      {onRetry ? (
        <button className="secondary-button btn btn-ghost" onClick={onRetry} type="button">
          Reintentar
        </button>
      ) : null}
    </div>
  );
}
