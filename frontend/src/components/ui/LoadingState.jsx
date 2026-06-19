export function LoadingState({ message = 'Cargando informacion...' }) {
  return (
    <div className="state-card loading-state-card card bg-base-100 border border-base-300 shadow-sm" role="status" aria-live="polite">
      <span className="state-loading-spinner" aria-hidden="true" />
      <strong>{message}</strong>
    </div>
  );
}
