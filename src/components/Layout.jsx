import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import OnboardingOrg from './OnboardingOrg'
import { useApp } from '../context/AppContext'
import LoadingSpinner from './ui/LoadingSpinner'

export default function Layout() {
  const { orgs, dataLoading, currentOrgId } = useApp()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // סגירת המגירה במעבר בין עמודים (מובייל)
  useEffect(() => {
    setOpen(false)
  }, [location.pathname, location.search])

  if (dataLoading && orgs.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center app-bg">
        <LoadingSpinner />
      </div>
    )
  }

  if (orgs.length === 0) {
    return (
      <div className="h-screen app-bg">
        <OnboardingOrg />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden app-bg">
      {/* כפתור המבורגר — מובייל בלבד */}
      <button
        onClick={() => setOpen(true)}
        className="fixed right-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-ink shadow-md ring-1 ring-line lg:hidden cursor-pointer"
        title="תפריט"
        aria-label="פתיחת תפריט"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>

      {/* רקע כהה מאחורי המגירה */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity duration-200 lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* סרגל צד — סטטי בדסקטופ, מגירה נשלפת במובייל */}
      <div
        className={`fixed inset-y-0 right-0 z-40 transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
          open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <Sidebar onMobileClose={() => setOpen(false)} />
      </div>

      <main key={currentOrgId} className="flex-1 overflow-auto pt-12 lg:pt-0">
        <Outlet />
      </main>
    </div>
  )
}
