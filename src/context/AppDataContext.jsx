import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { loadAllData, parseAll } from '../data/loadData'
import { parseDailyPlannerRows } from '../data/parseDaily'
import {
  serializeInputLog,
  serializeMasterCourses,
  serializeGradeComponents,
  serializeWeeklyHours,
  serializeDeadlines,
  serializeDailyPlanner,
} from '../data/serialize'
import {
  ensureSpreadsheet,
  ensureTabs,
  readAllTabs,
  writeAllTabs,
  writeTabRows,
} from '../drive/driveClient'
import { fetchTemplateRows } from '../drive/template'
import { getAccessToken, signOut, readToken, getTokenUser, isSignedIn, initGis } from '../drive/gis'
import {
  TAB_DAILY,
  TAB_INPUT_LOG,
  TAB_COURSES,
  TAB_GRADES,
  TAB_HOURS,
  TAB_DEADLINES,
} from '../config'

const STORAGE_KEY = 'am_state'

const AppDataContext = createContext(null)

export function useAppData() {
  return useContext(AppDataContext)
}

function loadJSON() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveJSON(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* quota exceeded */ }
}

function clearStorage() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

function ensureDefaultRows(planner) {
  for (const week of planner) {
    if (!week.rows.find(r => r.course === 'Travel')) {
      week.rows.splice(week.rows.length - 1, 0, makeTravelRow())
    }
    if (!week.rows.find(r => r.course === 'WORK')) {
      week.rows.splice(week.rows.length - 1, 0, makeWorkRow())
    }
  }
  return planner
}

function synthCourses(parsed) {
  const logCourses = new Set((parsed.inputLog || []).map(e => e.course))
  const existingNames = new Set((parsed.masterCourses || []).map(c => c.course))
  for (const name of logCourses) {
    if (name && !existingNames.has(name)) {
      parsed.masterCourses.push({
        course: name, year: null, quartile: null, abbrev: null,
        start: null, finish: null, timeMin: 0, timeHours: 0, grade: null,
        exam: null, assignment: null, laboratory: null, ec: null,
        comment: null, estTimeHours: null, assTimeHours: null, material: null,
      })
    }
  }
}

function buildState(rowsByTab) {
  const data = parseAll(rowsByTab)
  synthCourses(data)
  const plannerWeeks = ensureDefaultRows(parseDailyPlannerRows(rowsByTab[TAB_DAILY] || []))
  return { data, plannerWeeks }
}

const TITLE_BY_KEY = {
  inputLog: TAB_INPUT_LOG,
  masterCourses: TAB_COURSES,
  gradeComponents: TAB_GRADES,
  weeklyHours: TAB_HOURS,
  deadlines: TAB_DEADLINES,
  daily: TAB_DAILY,
}

function serializeTabByTitle(title, data, planner) {
  switch (title) {
    case TAB_INPUT_LOG: return serializeInputLog(data?.inputLog)
    case TAB_COURSES: return serializeMasterCourses(data?.masterCourses)
    case TAB_GRADES: return serializeGradeComponents(data?.gradeComponents)
    case TAB_HOURS: return serializeWeeklyHours(data?.weeklyHours)
    case TAB_DEADLINES: return serializeDeadlines(data?.deadlines)
    case TAB_DAILY: return serializeDailyPlanner(planner)
    default: return []
  }
}

function calcWeightedGrade(components) {
  const totalWeight = components.reduce((s, c) => s + (parseFloat(c.weight) || 0), 0)
  if (totalWeight === 0) return null
  const weighted = components.reduce((s, c) => {
    const w = parseFloat(c.weight) || 0
    const g = parseFloat(c.grade)
    return g ? s + w * g : s
  }, 0)
  return weighted / totalWeight
}

function makeTravelRow() {
  return {
    course: 'Travel',
    days: Array.from({ length: 7 }, () => ({ description: '', hours: 0 })),
    total: 0,
    isTotal: false,
  }
}

function makeWorkRow() {
  return {
    course: 'WORK',
    days: Array.from({ length: 7 }, () => ({ description: '', hours: 0 })),
    total: 0,
    isTotal: false,
  }
}

export function AppDataProvider({ children }) {
  const [data, setData] = useState(null)
  const [plannerWeeks, setPlannerWeeks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [drive, setDrive] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [driveError, setDriveError] = useState(null)

  const dataRef = useRef(null)
  const plannerRef = useRef([])
  const driveRef = useRef(null)
  const writeQueues = useRef({})

  function setAll(d, p) {
    dataRef.current = d
    plannerRef.current = p
    saveJSON({ data: d, plannerWeeks: p })
    setData(d)
    setPlannerWeeks(p)
  }

  function resolveUser() {
    const token = readToken()
    const u = getTokenUser(token)
    if (u?.email) return u
    return { email: '', name: 'Google user' }
  }

  function enqueueTabWrite(title, rows) {
    const info = driveRef.current
    if (!info) return
    const prev = writeQueues.current[title] || Promise.resolve()
    writeQueues.current[title] = prev
      .then(() => writeTabRows(info.fileId, title, rows))
      .catch(e => setDriveError(e.message))
  }

  function syncTabs(keys) {
    if (!driveRef.current) return
    setSyncing(true)
    const data = dataRef.current
    const planner = plannerRef.current
    const titles = keys.map(k => TITLE_BY_KEY[k])
    for (const title of titles) {
      enqueueTabWrite(title, serializeTabByTitle(title, data, planner))
    }
    Promise.all(titles.map(t => writeQueues.current[t])).then(() => setSyncing(false))
  }

  async function loadAndApplyFromDrive(file) {
    const info = { fileId: file.id, fileUrl: file.webViewLink, user: resolveUser() }
    setDrive(info)
    driveRef.current = info
    const rowsByTab = await readAllTabs(file.id)
    const { data: d, plannerWeeks: p } = buildState(rowsByTab)
    setAll(d, p)
    setError(null)
    return info
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const saved = loadJSON()
    if (saved?.data) {
      const planner = ensureDefaultRows(saved.plannerWeeks || [])
      dataRef.current = saved.data
      plannerRef.current = planner
      setData(saved.data)
      setPlannerWeeks(planner)
      setLoading(false)
    }

    async function bootstrap() {
      // Pre-warm the Google sign-in script at app start. Loading it lazily on the
      // first "Connect" click makes the consent popup open outside the click's
      // user-gesture window, so browsers can block it (endless sign-in hang).
      initGis().catch(() => {})
      if (isSignedIn()) {
        try {
          const file = await ensureSpreadsheet()
          if (cancelled) return
          await ensureTabs(file.id)
          if (cancelled) return
          await loadAndApplyFromDrive(file)
        } catch (e) {
          if (!cancelled) setDriveError(e.message)
          if (!saved?.data && !cancelled) {
            try {
              const { rowsByTab } = await loadAllData()
              if (cancelled) return
              const { data: d, plannerWeeks: p } = buildState(rowsByTab)
              dataRef.current = d
              plannerRef.current = p
              setData(d)
              setPlannerWeeks(p)
            } catch (e2) {
              if (!cancelled) setError(e2.message)
            }
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      } else if (!saved?.data) {
        try {
          const { rowsByTab } = await loadAllData()
          if (cancelled) return
          const { data: d, plannerWeeks: p } = buildState(rowsByTab)
          dataRef.current = d
          plannerRef.current = p
          setData(d)
          setPlannerWeeks(p)
        } catch (e) {
          if (!cancelled) setError(e.message)
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
    }

    bootstrap()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function connectToDrive() {
    setDriveError(null)
    try {
      await getAccessToken()
      const file = await ensureSpreadsheet()
      await ensureTabs(file.id)
      if (file.createdNew) {
        const template = await fetchTemplateRows()
        await writeAllTabs(file.id, template)
      }
      return await loadAndApplyFromDrive(file)
    } catch (e) {
      setDriveError(e.message)
      throw e
    }
  }

  function disconnectFromDrive() {
    signOut()
    driveRef.current = null
    setDrive(null)
    setDriveError(null)
  }

  async function refreshFromDrive() {
    const info = driveRef.current
    if (!info) return
    setSyncing(true)
    try {
      const rowsByTab = await readAllTabs(info.fileId)
      const { data: d, plannerWeeks: p } = buildState(rowsByTab)
      setAll(d, p)
      setError(null)
    } catch (e) {
      setDriveError(e.message)
      setError(e.message)
    } finally {
      setSyncing(false)
    }
  }

  async function refreshFromCSVs() {
    clearStorage()
    setLoading(true)
    setError(null)
    if (driveRef.current) {
      try {
        await refreshFromDrive()
      } catch { /* surfaced in driveError */ }
      setLoading(false)
    } else {
      try {
        const { rowsByTab } = await loadAllData()
        const { data: d, plannerWeeks: p } = buildState(rowsByTab)
        setAll(d, p)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
  }

  async function importCSVToTab(tabKey, rows) {
    const info = driveRef.current
    if (!info) throw new Error('Connect to Drive first')
    if (!TITLE_BY_KEY[tabKey]) throw new Error(`Unknown tab: ${tabKey}`)
    await writeTabRows(info.fileId, TITLE_BY_KEY[tabKey], rows)
    await refreshFromDrive()
  }

  function addSession(entry) {
    const prev = dataRef.current || {}
    const updated = { ...prev, inputLog: [{ ...entry, id: Date.now() }, ...(prev.inputLog || [])] }
    setAll(updated, plannerRef.current)
    syncTabs(['inputLog'])
  }

  function addCourse(course) {
    const { _gradeComponents, ...courseData } = course
    const prev = dataRef.current || {}
    const updated = { ...prev, masterCourses: [...(prev.masterCourses || []), { ...courseData, id: Date.now() }] }
    const keys = ['masterCourses']
    if (_gradeComponents && _gradeComponents.length > 0) {
      const gradeComps = [...(updated.gradeComponents || [])]
      gradeComps.push({
        course: courseData.course,
        components: _gradeComponents,
        totalGrade: calcWeightedGrade(_gradeComponents),
      })
      updated.gradeComponents = gradeComps
      keys.push('gradeComponents')
    }
    setAll(updated, plannerRef.current)
    syncTabs(keys)
  }

  function addDeadline(deadline) {
    const prev = dataRef.current || {}
    const updated = { ...prev, deadlines: [...(prev.deadlines || []), { ...deadline, id: Date.now() }] }
    setAll(updated, plannerRef.current)
    syncTabs(['deadlines'])
  }

  function deleteSession(id) {
    const prev = dataRef.current || {}
    const updated = { ...prev, inputLog: (prev.inputLog || []).filter(e => e.id !== id) }
    setAll(updated, plannerRef.current)
    syncTabs(['inputLog'])
  }

  function deleteCourse(id) {
    const prev = dataRef.current || {}
    const course = (prev.masterCourses || []).find(c => c.id === id)
    const updated = { ...prev, masterCourses: (prev.masterCourses || []).filter(c => c.id !== id) }
    const keys = ['masterCourses']
    if (course) {
      updated.gradeComponents = (updated.gradeComponents || []).filter(g => g.course !== course.course)
      keys.push('gradeComponents')
    }
    setAll(updated, plannerRef.current)
    syncTabs(keys)
  }

  function deleteDeadline(id) {
    const prev = dataRef.current || {}
    const updated = { ...prev, deadlines: (prev.deadlines || []).filter(d => d.id !== id) }
    setAll(updated, plannerRef.current)
    syncTabs(['deadlines'])
  }

  function updateGradeComponents(course, components) {
    const prev = dataRef.current || {}
    const gradeComponents = [...(prev.gradeComponents || [])]
    let idx = -1
    for (let i = 0; i < gradeComponents.length; i++) {
      if (gradeComponents[i].course === course) { idx = i; break }
    }
    const entry = { course, components, totalGrade: calcWeightedGrade(components) }
    if (idx >= 0) {
      gradeComponents[idx] = { ...gradeComponents[idx], ...entry }
    } else {
      gradeComponents.push(entry)
    }
    const updated = { ...prev, gradeComponents }
    setAll(updated, plannerRef.current)
    syncTabs(['gradeComponents'])
  }

  function updatePlannerWeek(weekIndex, rows) {
    const prev = [...plannerRef.current]
    prev[weekIndex] = { ...prev[weekIndex], rows }
    setAll(dataRef.current, prev)
    syncTabs(['daily'])
  }

  function updatePlannerCell(weekIndex, rowIndex, dayIndex, field, value) {
    const prev = [...plannerRef.current]
    const rows = [...prev[weekIndex].rows]
    const row = { ...rows[rowIndex] }
    const days = [...row.days]
    days[dayIndex] = { ...days[dayIndex], [field]: value }
    row.days = days
    row.total = days.reduce((s, d) => s + d.hours, 0)
    rows[rowIndex] = row
    prev[weekIndex] = { ...prev[weekIndex], rows }
    setAll(dataRef.current, prev)
    syncTabs(['daily'])
  }

  return (
    <AppDataContext.Provider value={{
      inputLog: data?.inputLog || [],
      masterCourses: data?.masterCourses || [],
      gradeComponents: data?.gradeComponents || [],
      weeklyHours: data?.weeklyHours || [],
      deadlines: data?.deadlines || [],
      plannerWeeks,
      loading,
      error,
      drive,
      syncing,
      driveError,
      hasDrive: !!drive,
      connectToDrive,
      disconnectFromDrive,
      refreshFromDrive,
      refreshFromCSVs,
      importCSVToTab,
      addSession,
      addCourse,
      addDeadline,
      deleteSession,
      deleteCourse,
      deleteDeadline,
      updateGradeComponents,
      updatePlannerWeek,
      updatePlannerCell,
    }}>
      {children}
    </AppDataContext.Provider>
  )
}