export default function Input({ label, hint, className = '', endAdornment, ...props }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</span>
      )}
      <span className="relative block">
        <input
          className={`h-10 w-full rounded-md bg-surface px-3 text-sm text-ink ring-1 ring-line transition-[box-shadow] duration-150 ease-out placeholder:text-ink-muted hover:ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand-500 ${endAdornment ? 'pl-9' : ''} ${className}`}
          {...props}
        />
        {endAdornment && (
          <span className="absolute inset-y-0 left-0 flex items-center pl-1">{endAdornment}</span>
        )}
      </span>
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  )
}
