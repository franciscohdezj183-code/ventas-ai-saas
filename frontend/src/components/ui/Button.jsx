const VARIANT_CLASSES = {
  primary: 'primary-button',
  secondary: 'secondary-button',
  danger: 'danger-button',
  ghost: 'ghost-button'
};

const SIZE_CLASSES = {
  sm: 'ui-button-sm',
  md: 'ui-button-md',
  lg: 'ui-button-lg'
};

export function Button({
  children,
  className = '',
  isLoading = false,
  size = 'md',
  type = 'button',
  variant = 'secondary',
  ...props
}) {
  const variantClass = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.secondary;
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;

  return (
    <button
      className={['ui-button', variantClass, sizeClass, className].filter(Boolean).join(' ')}
      type={type}
      {...props}
      disabled={isLoading || props.disabled}
    >
      {isLoading ? <span className="ui-button-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
