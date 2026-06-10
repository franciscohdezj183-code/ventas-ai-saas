export function LoadingState({ message = 'Cargando informacion...' }) {
  return (
    <div className="state-card loading-state-card" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <strong>{message}</strong>
    </div>
  );
}
