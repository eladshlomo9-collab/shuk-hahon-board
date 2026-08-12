import { Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import LoadingSpinner from './ui/LoadingSpinner'

export default function ProtectedRoute({ children }) {
  const { session, authLoading } = useApp()

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  return children
}
