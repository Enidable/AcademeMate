import { useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import DailyPlanner from './pages/DailyPlanner'
import WeeklyOverview from './pages/WeeklyOverview'
import Analysis from './pages/Analysis'
import TimeLog from './pages/TimeLog'
import Courses from './pages/Courses'
import Calendar from './pages/Calendar'
import DriveSettings from './components/DriveSettings'
import { AppDataProvider, useAppData } from './context/AppDataContext'
import { AddSessionModal, AddDeadlineModal, AddCourseModal, PlannerMatchModal } from './components/forms/Modals'
import { durationBetween, nowTime } from './utils/helpers'

// Small live clock badge shown next to "Close session" while a session runs.
function LiveBadge({ since }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000)
    return () => clearInterval(t)
  }, [])
  const start = new Date(`${since.startDate}T${since.startTime}:00`)
  const mins = Math.max(0, Math.floor((Date.now() - start.getTime()) / 60000))
  return <span className="text-[10px] opacity-75">{mins >= 60 ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}` : `${mins}m`}</span>
}

const pages = {
  Dashboard: { component: Dashboard, title: 'Dashboard' },
  'Weekly Overview': { component: WeeklyOverview, title: 'Weekly Overview' },
  'Daily Planner': { component: DailyPlanner, title: 'Daily Planner' },
  Analysis: { component: Analysis, title: 'Analysis' },
  'Time Log': { component: TimeLog, title: 'Time Log' },
  Courses: { component: Courses, title: 'Courses' },
  Calendar: { component: Calendar, title: 'Calendar' },
}

function AppContent() {
  const [active, setActive] = useState('Dashboard')
  const { inputLog, masterCourses, deadlines, weeklyHours, gradeComponents, loading, error, refreshFromCSVs, hasDrive, syncing, saveMsg, driveError, pushCalendarToGoogle, liveSession, startLiveSession, stopLiveSession, dailyPlan } = useAppData()
  const [modal, setModal] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sessionPreset, setSessionPreset] = useState(null)
  const [plannerPickOpen, setPlannerPickOpen] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)

  // Today's planner items (not-done first, then alphabetical) offered in the
  // close-session picker (#25).
  const plannerTodayItems = useMemo(() => {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return (dailyPlan || [])
      .filter(r => r.date === today)
      .sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || String(a.task || '').localeCompare(String(b.task || '')))
  }, [dailyPlan])

  if (loading) {
    return <div className="flex h-screen bg-slate-50 items-center justify-center"><p className="text-slate-400 text-sm">Loading data…</p></div>
  }

  async function handleSync() {
    if (!hasDrive) {
      setSettingsOpen(true)
      return
    }
    setSyncMsg('Syncing…')
    try {
      const r = await pushCalendarToGoogle()
      setSyncMsg(`Synced (${r.inserted} added, ${r.updated} updated)`)
      setTimeout(() => setSyncMsg(null), 5000)
    } catch (e) {
      // Keep the error visible until dismissed — it shouldn't vanish in a
      // second. It's also logged to the console for inspection.
      console.error('Sync failed:', e)
      setSyncMsg('Sync failed: ' + e.message)
    }
  }

  if (error) {
    return <div className="flex h-screen bg-slate-50 items-center justify-center"><p className="text-slate-400 text-sm">Failed to load data. {error}</p></div>
  }

  const { component: Page, title } = pages[active]

  // Closing a running session (#25): when today's Daily Planner has items,
  // first ask which one this session was working on, so the logger can open
  // pre-filled with the item's course + note while keeping the session's own
  // start/end times. Without any planner items today it goes straight to the
  // logger with just the times. The session only stops once an item is picked
  // or skipped, so cancelling the picker leaves it running.
  function handleCloseSession() {
    if (!liveSession) return
    if (plannerTodayItems.length > 0) {
      setPlannerPickOpen(true)
      return
    }
    finishCloseSession({})
  }

  function finishCloseSession(extra) {
    setPlannerPickOpen(false)
    const s = stopLiveSession()
    if (!s) return
    const end = nowTime()
    setSessionPreset({
      date: s.startDate,
      startTime: s.startTime,
      endTime: end,
      durationHours: durationBetween(s.startTime, end) ?? '',
      ...extra,
    })
    setModal('session')
  }

  function pickPlannerItem(item) {
    finishCloseSession({ course: item.course, notes: item.task || item.notes || '' })
  }

  function skipPlannerItem() {
    finishCloseSession({})
  }

  const headerActions = {
    Dashboard: { onRefresh: refreshFromCSVs },
    'Weekly Overview': {},
    'Daily Planner': {},
    'Time Log': { onAddSession: () => { setSessionPreset(null); setModal('session') } },
    Courses: { onAddCourse: () => setModal('course') },
    Calendar: { onAddDeadline: () => setModal('deadline') },
    Analysis: {},
  }

  const pageProps = {
    Dashboard: { inputLog, courses: masterCourses, deadlines, weeklyHours, gradeComponents, onLogTask: t => { setSessionPreset(t); setModal('session') } },
    'Time Log': { entries: inputLog },
    Courses: { courses: masterCourses },
    Calendar: {},
    'Weekly Overview': {},
    Analysis: {},
    'Daily Planner': { onLogTask: t => { setSessionPreset(t); setModal('session') } },
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar active={active} onNavigate={setActive} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={title} onDrive={() => setSettingsOpen(true)} hasDrive={hasDrive} syncing={syncing} {...headerActions[active]} />
        <main className="flex-1 overflow-y-auto p-6">
          {driveError && (
            <button onClick={() => setSettingsOpen(true)}
              className="mb-4 w-full text-left text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 hover:bg-red-100 cursor-pointer"
              title="Open Drive settings">
              <span className="font-semibold">Drive error:</span> {driveError}
            </button>
          )}
          <Page {...pageProps[active]} />
        </main>
      </div>

      <AddSessionModal open={modal === 'session'} onClose={() => { setModal(null); setSessionPreset(null) }} preset={sessionPreset} />
      <PlannerMatchModal open={plannerPickOpen} items={plannerTodayItems}
        onClose={() => setPlannerPickOpen(false)}
        onPick={pickPlannerItem}
        onSkip={skipPlannerItem} />
      <AddDeadlineModal open={modal === 'deadline'} onClose={() => setModal(null)} />
      <AddCourseModal open={modal === 'course'} onClose={() => setModal(null)} />
      <DriveSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2">
        {saveMsg && (
          <span className={`text-xs rounded-full px-3 py-2 shadow-sm max-w-[22rem] ${saveMsg.startsWith('Save failed')
            ? 'text-red-700 bg-red-50 border border-red-200'
            : 'text-emerald-700 bg-emerald-50 border border-emerald-200'}`}>
            {saveMsg}
          </span>
        )}
        {syncMsg && (
          <span className={`text-xs rounded-full px-3 py-2 shadow-sm max-w-[20rem] ${syncMsg.startsWith('Sync failed')
            ? 'text-red-700 bg-red-50 border border-red-200'
            : 'text-slate-600 bg-white border border-slate-200'}`}>
            {syncMsg}
          </span>
        )}
        {liveSession ? (
          <button
            onClick={handleCloseSession}
            className="text-sm px-4 py-3 rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-500 active:scale-95 cursor-pointer flex items-center gap-2"
            title="Close the running session — start and end times are pre-filled in the logger">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            Close session <LiveBadge since={liveSession} />
          </button>
        ) : (
          <button
            onClick={() => startLiveSession()}
            className="text-sm px-4 py-3 rounded-full border border-slate-300 bg-white text-slate-700 shadow-lg hover:bg-slate-100 active:scale-95 cursor-pointer">
            Start session
          </button>
        )}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="text-sm px-4 py-3 rounded-full border border-slate-300 bg-white text-slate-700 shadow-lg hover:bg-slate-100 active:scale-95 cursor-pointer disabled:opacity-50">
          {syncing ? 'Syncing…' : 'Sync'}
        </button>
        <button
          onClick={() => { setSessionPreset(null); setModal('session') }}
          className="text-sm px-4 py-3 rounded-full bg-slate-800 text-white shadow-lg hover:bg-slate-700 active:scale-95 cursor-pointer">
          Add Session
        </button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AppDataProvider>
      <AppContent />
    </AppDataProvider>
  )
}