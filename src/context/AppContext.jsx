import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [orgs, setOrgs] = useState([])
  const [currentOrgId, setCurrentOrgId] = useState(null)
  const [members, setMembers] = useState([])
  const [myTeams, setMyTeams] = useState([])
  const [dataLoading, setDataLoading] = useState(false)

  // מונה לרענון הסיידבר (וורקספייסים/בורדים) מכל מקום באפליקציה
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  // מעקב אחרי מצב ההתחברות
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // טעינת הארגונים של המשתמש (וקבלת הזמנות ממתינות) אחרי התחברות
  const loadOrgs = useCallback(async () => {
    if (!session?.user) {
      setOrgs([])
      setCurrentOrgId(null)
      return
    }
    setDataLoading(true)
    try {
      await supabase.rpc('accept_pending_invitations')
      const { data: mem } = await supabase
        .from('members')
        .select('org_id, role, organizations(id, name)')
        .eq('user_id', session.user.id)
      const list = (mem || [])
        .filter((m) => m.organizations)
        .map((m) => ({ id: m.organizations.id, name: m.organizations.name, role: m.role }))
      setOrgs(list)
      setCurrentOrgId((prev) => prev || list[0]?.id || null)
    } finally {
      setDataLoading(false)
    }
  }, [session])

  useEffect(() => {
    loadOrgs()
  }, [loadOrgs])

  // טעינת חברי הארגון הנוכחי
  const loadMembers = useCallback(async () => {
    if (!currentOrgId) {
      setMembers([])
      return
    }
    // is_ai_overseer עשוי עדיין לא להתקיים (לפני הרצת מיגרציית add-teams.sql) — ניפול חזרה לסלקט בלי העמודה
    let membersRes = await supabase
      .from('members')
      .select('user_id, email, full_name, role, is_ai_overseer')
      .eq('org_id', currentOrgId)
    if (membersRes.error) {
      membersRes = await supabase.from('members').select('user_id, email, full_name, role').eq('org_id', currentOrgId)
    }
    const real = membersRes.data || []
    // חברים וירטואליים (לשיוך בלבד) — ממוזגים לרשימת החברים
    let virtual = []
    try {
      const { data: vm } = await supabase
        .from('virtual_members')
        .select('id, full_name, color')
        .eq('org_id', currentOrgId)
      virtual = (vm || []).map((v) => ({ user_id: v.id, full_name: v.full_name, email: null, role: 'member', is_virtual: true, color: v.color }))
    } catch {
      /* table may not exist yet */
    }
    setMembers([...real, ...virtual])
  }, [currentOrgId])

  useEffect(() => {
    loadMembers()
  }, [loadMembers, refreshKey])

  // צוותים שהמשתמש הנוכחי חבר בהם, בהיקף הארגון הנוכחי (לזיהוי "ראש צוות")
  const loadMyTeams = useCallback(async () => {
    if (!currentOrgId || !session?.user) {
      setMyTeams([])
      return
    }
    const { data } = await supabase
      .from('team_members')
      .select('team_id, role, teams!inner(id, name, color, org_id)')
      .eq('user_id', session.user.id)
      .eq('teams.org_id', currentOrgId)
    setMyTeams((data || []).map((tm) => ({ team_id: tm.team_id, role: tm.role, name: tm.teams?.name, color: tm.teams?.color })))
  }, [currentOrgId, session])

  useEffect(() => {
    loadMyTeams()
  }, [loadMyTeams, refreshKey])

  const currentOrg = orgs.find((o) => o.id === currentOrgId) || null
  const isAiOverseer = !!members.find((m) => m.user_id === session?.user?.id)?.is_ai_overseer
  const leadTeamIds = myTeams.filter((t) => t.role === 'lead').map((t) => t.team_id)
  const isTeamLead = leadTeamIds.length > 0

  const value = {
    session,
    user: session?.user || null,
    authLoading,
    orgs,
    currentOrg,
    currentOrgId,
    setCurrentOrgId,
    members,
    myTeams,
    leadTeamIds,
    isTeamLead,
    isAiOverseer,
    dataLoading,
    refreshKey,
    bump,
    reloadOrgs: loadOrgs,
    reloadMembers: loadMembers,
    reloadMyTeams: loadMyTeams,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
