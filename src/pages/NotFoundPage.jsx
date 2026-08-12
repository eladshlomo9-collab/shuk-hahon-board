import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-canvas p-8 text-center">
      <div className="font-display text-6xl text-brand-500">404</div>
      <p className="text-ink-soft">העמוד לא נמצא.</p>
      <Link to="/" className="font-medium text-brand-600 transition-colors hover:text-brand-700">
        חזרה למסך הראשי
      </Link>
    </div>
  )
}
