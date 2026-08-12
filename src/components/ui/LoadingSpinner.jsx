export default function LoadingSpinner({ label = 'טוען...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-ink-muted">
      <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-line border-t-brand-500" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
