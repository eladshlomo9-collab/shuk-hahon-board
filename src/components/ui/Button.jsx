const variants = {
  primary:
    'bg-brand-500 text-white shadow-xs hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50 disabled:hover:bg-brand-500',
  secondary:
    'bg-surface text-ink ring-1 ring-line hover:bg-surface-2 hover:ring-line-strong active:bg-surface-2 disabled:opacity-50',
  danger:
    'bg-danger text-white shadow-xs hover:brightness-95 active:brightness-90 disabled:opacity-50',
  ghost:
    'bg-transparent text-ink-soft hover:bg-surface-2 hover:text-ink active:bg-surface-2 disabled:opacity-50',
}

const sizes = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex select-none items-center justify-center rounded-md font-medium transition-[background-color,box-shadow,color,filter] duration-150 ease-out cursor-pointer disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
