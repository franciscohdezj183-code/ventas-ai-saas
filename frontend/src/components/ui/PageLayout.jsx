export function PageLayout({ children, className = '' }) {
  return (
    <div className={['page-layout', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
