export function ActionBar({ children, align = 'end', className = '' }) {
  return (
    <div
      className={['action-bar', `action-bar-${align}`, className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
