import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import DailyPlanner from './pages/DailyPlanner'
import TimeLog from './pages/TimeLog'
import Courses from './pages/Courses'
import Calendar from './pages/Calendar'
import DriveSettings from './components/DriveSettings'
import { AppDataProvider, useAppData } from './context/AppDataContext'
import { AddSessionModal, AddDeadlineModal, AddCourseModal } from './components/forms/Modals'

const pages = {
  Dashboard: { component: Dashboard, title: 'Dashboard' },
  'Daily Planner': { component: DailyPlanner, title: 'Daily Planner' },
  'Time Log': { component: TimeLog, title: 'Time Log' },
  Courses: { component: Courses, title: 'Courses' },
  Calendar: { component: Calendar, title: 'Calendar' },
}

function AppContent() {
  const [active, setActive] = useState('Dashboard')
  const { inputLog, masterCourses, deadlines, weeklyHours, gradeComponents, loading, error, refreshFromCSVs, hasDrive, syncing, driveError } = useAppData()
  const [modal, setModal] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sessionPreset, setSessionPreset] = useState(null)

  if (loading) {
    return <div className="flex h-screen bg-slate-50 items-center justify-center"><p className="text-slate-400 text-sm">Loading data…</p></div>
  }

  if (error) {
    return <div className="flex h-screen bg-slate-50 items-center justify-center"><p className="text-slate-400 text-sm">Failed to load data. {error}</p></div>
  }

  const { component: Page, title } = pages[active]

  const headerActions = {
    Dashboard: { onRefresh: refreshFromCSVs },
    'Daily Planner': {},
    'Time Log': { onAddSession: () => { setSessionPreset(null); setModal('session') } },
    Courses: { onAddCourse: () => setModal('course') },
    Calendar: { onAddDeadline: () => setModal('deadline') },
  }

  const pageProps = {
    Dashboard: { inputLog, courses: masterCourses, deadlines, weeklyHours, gradeComponents },
    'Time Log': { entries: inputLog },
    Courses: { courses: masterCourses },
    Calendar: {},
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
      <AddDeadlineModal open={modal === 'deadline'} onClose={() => setModal(null)} />
      <AddCourseModal open={modal === 'course'} onClose={() => setModal(null)} />
      <DriveSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <button
        onClick={() => { setSessionPreset(null); setModal('session') }}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-slate-800 text-white text-2xl shadow-lg hover:bg-slate-700 active:scale-95 cursor-pointer flex items-center justify-center"
        title="Add study session">+</button>
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