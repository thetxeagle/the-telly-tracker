import { useCallback, useEffect, useState } from "react"

import { AuthScreen } from "@/components/auth-screen"
import { Dashboard } from "@/components/dashboard"
import { FirstRunSetup } from "@/components/first-run-setup"
import { api, ApiError } from "@/lib/api"
import type { DashboardData, SetupStatus } from "@/lib/types"

async function fetchApplication() {
  return Promise.allSettled([
    api<SetupStatus>("/api/setup/status"),
    api<DashboardData>("/api/dashboard"),
  ])
}

export function App() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const applyApplication = useCallback(([setupResult, dashboardResult]: Awaited<ReturnType<typeof fetchApplication>>) => {
    if (setupResult.status === "fulfilled") setSetup(setupResult.value)
    else console.error(setupResult.reason)
    if (dashboardResult.status === "fulfilled") setDashboard(dashboardResult.value)
    else {
      const error = dashboardResult.reason
      if (!(error instanceof ApiError) || error.status !== 401) console.error(error)
      setDashboard(null)
    }
    setLoading(false)
  }, [])

  const loadApplication = useCallback(async () => {
    applyApplication(await fetchApplication())
  }, [applyApplication])

  useEffect(() => {
    let active = true
    fetchApplication().then((result) => { if (active) applyApplication(result) })
    return () => { active = false }
  }, [applyApplication])

  if (loading) {
    return <main className="app-loading"><div className="loading-mark" aria-label="Loading Telly Tracker">T</div></main>
  }

  if (setup?.requiresOwner) return <FirstRunSetup requiresOwner smtp={setup.smtp} onComplete={loadApplication} />

  if (!dashboard) return <AuthScreen onAuthenticated={loadApplication} />

  if (setup && !setup.setupComplete && dashboard.user.isAdmin) {
    return <FirstRunSetup requiresOwner={false} smtp={setup.smtp} onComplete={loadApplication} />
  }

  return <Dashboard data={dashboard} onRefresh={loadApplication} onLogout={() => setDashboard(null)} />
}

export default App
