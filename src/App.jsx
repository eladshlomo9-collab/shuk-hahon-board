import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import LoadingSpinner from './components/ui/LoadingSpinner'
import ResetPasswordPage from './pages/ResetPasswordPage'

// טעינה עצלה לעמודים הכבדים — מקטין את החבילה הראשונית
const MyTasksPage = lazy(() => import('./pages/MyTasksPage'))
const BoardPage = lazy(() => import('./pages/BoardPage'))
const MembersPage = lazy(() => import('./pages/MembersPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const TeamsPage = lazy(() => import('./pages/TeamsPage'))
const AiOverviewPage = lazy(() => import('./pages/AiOverviewPage'))
const PublicBoardPage = lazy(() => import('./pages/PublicBoardPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center py-20">
      <LoadingSpinner />
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/public/:token" element={<PublicBoardPage />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<MyTasksPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/board/:boardId" element={<BoardPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/ai-overview" element={<AiOverviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default App
