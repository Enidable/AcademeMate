import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { loadAllData, parseAll } from '../data/loadData'
import { buildPlannerWeeks, deriveWeeklyTotals } from '../data/parseDaily'
import {
  serializeStudyLog,
  serializeCourses,
  serializeGradeComponents,
  serializeContent,
  serializeDailyPlan,
  serializeWeeklyOverrides,
  serializeCalendar,
} from '../data/serialize'
import { parseIcs, dedupeCalendarRows } from '../data/ical'
import {
  ensureSpreadsheet,
  ensureTabs,
  readAllTabs,
  writeAllTabs,
  writeTabRows,
  listIcsFiles,
  fetchIcsFile,
  insertCalendarEvent,
  updateCalendarEvent,
  ensureCalendar,
  toGcalEvent,
  isExamEvent,
  inferEventType,
  deriveAbbrev,
} from '../drive/driveClient'
import { fetchTemplateRows } from '../drive/template'
import { getAccessToken, signOut, readToken, getTokenUser, isSignedIn, initGis } from '../drive/gis'
import {
  TAB_STUDY_LOG,
  TAB_COURSES,
  TAB_GRADES,
  TAB_CONTENT,
  TAB_DAILY,
  TAB_HOURS,
  TAB_CALENDAR,
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
      week.rows.splice(Math.max(0, week.rows.length - 1), 0, makeTravelRow())
    }
    if (!week.rows.find(r => r.course === 'WORK')) {
      week.rows.splice(Math.max(0, week.rows.length - 1), 0, makeWorkRow())
    }
  }
  return planner
}

function synthCourses(parsed) {
  const logCourses = new Set((parsed.studyLog || []).map(e => e.course))
  const existingNames = new Set((parsed.courses || []).map(c => c.course))
  for (const name of logCourses) {
    if (name && !existingNames.has(name)) {
      parsed.courses.push({
        id: name,
        course: name,
        code: null, abbrev: null, year: null, quartile: null,
        start: null, finish: null, ec: null, status: null,
        estHours: null, notes: null, grade: null,
      })
    }
  }
}

function buildState(rowsByTab) {
  const data = parseAll(rowsByTab)
  synthCourses(data)
  const weeklyHours = deriveWeeklyTotals(data.studyLog, data.weeklyOverrides)
  const plannerWeeks = ensureDefaultRows(buildPlannerWeeks(data.dailyPlan))
  return { data, weeklyHours, plannerWeeks }
}

const TITLE_BY_KEY = {
  studyLog: TAB_STUDY_LOG,
  courses: TAB_COURSES,
  gradeComponents: TAB_GRADES,
  content: TAB_CONTENT,
  dailyPlan: TAB_DAILY,
  weeklyTotals: TAB_HOURS,
  calendarEvents: TAB_CALENDAR,
}

function serializeTabByTitle(title, data, _planner) {
  switch (title) {
    case TAB_STUDY_LOG: return serializeStudyLog(data?.studyLog)
    case TAB_COURSES: return serializeCourses(data?.courses)
    case TAB_GRADES: return serializeGradeComponents(data?.gradeComponents)
    case TAB_CONTENT: return serializeContent(data?.content)
    case TAB_HOURS: return serializeWeeklyOverrides(data?.weeklyOverrides)
    case TAB_DAILY: return serializeDailyPlan(data?.dailyPlan)
    case TAB_CALENDAR: return serializeCalendar(data?.calendarEvents)
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

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Give every scheduled (non-exam) calendar event a stable incremental id in the
// form {course abbrev}-{NN}. Events that already carry a lecture id keep it, so
// re-imports never reshuffle the numbering.
function assignLectureIds(rows, courses) {
  const courseById = {}
  for (const c of courses || []) courseById[c.course] = c
  const groups = {}
  for (const r of rows) {
    if (!r.course || isExamEvent(r)) continue
    if (!groups[r.course]) groups[r.course] = []
    groups[r.course].push(r)
  }
  for (const [courseName, evs] of Object.entries(groups)) {
    const c = courseById[courseName]
    const abbrev = c?.abbrev || c?.code || deriveAbbrev(courseName)
    const pat = new RegExp(`^${escapeRe(abbrev)}[- ]?(\\d+)$`, 'i')
    const taken = new Set()
    let maxNum = 0
    for (const r of evs) {
      const m = r.lectureId && pat.exec(String(r.lectureId))
      if (m) {
        const num = parseInt(m[1], 10)
        taken.add(num)
        maxNum = Math.max(maxNum, num)
      }
    }
    evs.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''))
    let next = maxNum + 1
    for (const r of evs) {
      if (r.lectureId) continue
      while (taken.has(next)) next++
      taken.add(next)
      r.lectureId = `${abbrev}-${String(next).padStart(2, '0')}`
    }
  }
}

export function AppDataProvider({ children }) {
  const [data, setData] = useState(null)
  const [plannerWeeks, setPlannerWeeks] = useState([])
  const [weeklyHours, setWeeklyHours] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [drive, setDrive] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [driveError, setDriveError] = useState(null)

  const dataRef = useRef(null)
  const plannerRef = useRef([])
  const weeklyRef = useRef([])
  const driveRef = useRef(null)

  function setAll(d, p) {
    const wt = deriveWeeklyTotals(d.studyLog, d.weeklyOverrides)
    dataRef.current = d
    plannerRef.current = p
    weeklyRef.current = wt
    saveJSON({ data: d, plannerWeeks: p, weeklyHours: wt })
    setData(d)
    setPlannerWeeks(p)
    setWeeklyHours(wt)
  }

  function resolveUser() {
    const token = readToken()
    const u = getTokenUser(token)
    if (u?.email) return u
    return { email: '', name: 'Google user' }
  }

  function syncTabs(keys) {
    if (!driveRef.current) return
    setSyncing(true)
    const data = dataRef.current
    const planner = plannerRef.current
    const titles = keys.map(k => TITLE_BY_KEY[k]).filter(Boolean)
    for (const title of titles) {
      writeTabRows(driveRef.current.fileId, title, serializeTabByTitle(title, data, planner))
        .catch(e => setDriveError(e.message))
    }
    setSyncing(false)
  }

  async function loadAndApplyFromDrive(file) {
    const info = { fileId: file.id, fileUrl: file.webViewLink, user: resolveUser() }
    setDrive(info)
    driveRef.current = info
    const rowsByTab = await readAllTabs(file.id)
    const { data: d, weeklyHours: wt, plannerWeeks: p } = buildState(rowsByTab)
    dataRef.current = d
    plannerRef.current = p
    weeklyRef.current = wt
    saveJSON({ data: d, plannerWeeks: p, weeklyHours: wt })
    setData(d)
    setPlannerWeeks(p)
    setWeeklyHours(wt)
    setError(null)
    return info
  }

  // A spreadsheet created by the old schema (or one whose tabs were never
  // filled) comes with the six canonical tabs empty. Seed them from the
  // bundled template only when EVERY tab is empty, so a sheet already in use
  // is never overwritten.
  async function seedEmptyTabs(fileId) {
    const rowsByTab = await readAllTabs(fileId)
    const hasData = Object.values(rowsByTab).some(rows => rows.length > 1)
    if (hasData) return
    const template = await fetchTemplateRows()
    await writeAllTabs(fileId, template)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const saved = loadJSON()
    if (saved?.data) {
      const planner = ensureDefaultRows(saved.plannerWeeks || [])
      dataRef.current = saved.data
      plannerRef.current = planner
      weeklyRef.current = deriveWeeklyTotals(saved.data.studyLog, saved.data.weeklyOverrides)
      setData(saved.data)
      setPlannerWeeks(planner)
      setWeeklyHours(weeklyRef.current)
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
          await seedEmptyTabs(file.id)
          if (cancelled) return
          await loadAndApplyFromDrive(file)
        } catch (e) {
          if (!cancelled) setDriveError(e.message)
          if (!saved?.data && !cancelled) {
            try {
              const { rowsByTab } = await loadAllData()
              if (cancelled) return
              const { data: d, weeklyHours: wt, plannerWeeks: p } = buildState(rowsByTab)
              dataRef.current = d
              plannerRef.current = p
              weeklyRef.current = wt
              setData(d)
              setPlannerWeeks(p)
              setWeeklyHours(wt)
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
          const { data: d, weeklyHours: wt, plannerWeeks: p } = buildState(rowsByTab)
          dataRef.current = d
          plannerRef.current = p
          weeklyRef.current = wt
          setData(d)
          setPlannerWeeks(p)
          setWeeklyHours(wt)
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
      await seedEmptyTabs(file.id)
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
      const { data: d, weeklyHours: wt, plannerWeeks: p } = buildState(rowsByTab)
      dataRef.current = d
      plannerRef.current = p
      weeklyRef.current = wt
      saveJSON({ data: d, plannerWeeks: p, weeklyHours: wt })
      setData(d)
      setPlannerWeeks(p)
      setWeeklyHours(wt)
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
        const { data: d, weeklyHours: wt, plannerWeeks: p } = buildState(rowsByTab)
        dataRef.current = d
        plannerRef.current = p
        weeklyRef.current = wt
        saveJSON({ data: d, plannerWeeks: p, weeklyHours: wt })
        setData(d)
        setPlannerWeeks(p)
        setWeeklyHours(wt)
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

  // Read every .ics file in the "iCal" folder (kept inside the app's Drive
  // folder), expand recurrences, and (re)build the Calendar tab. Events already
  // exported to Google Calendar keep their cal_id so a re-import never creates
  // duplicates on the next push.
  async function importCalendarFromDrive() {
    const info = driveRef.current
    if (!info) throw new Error('Connect to Drive first')
    const { folder, files } = await listIcsFiles()
    if (!folder) throw new Error('No "iCal" folder found inside your "AcademeMate - Study Tracking" folder on Drive. Create it and drop your university .ics files there.')
    if (files.length === 0) throw new Error('The "iCal" folder is empty. Add your downloaded .ics files there first.')

    const parsed = []
    for (const f of files) {
      const text = await fetchIcsFile(f.id)
      parsed.push(...parseIcs(text, { source: f.name }))
    }
    const rows = dedupeCalendarRows(parsed)

    // Link events to courses so each course keeps its own colour everywhere.
    const courses = dataRef.current?.courses || []
    const codeToCourse = new Map()
    for (const c of courses) if (c.code) codeToCourse.set(c.code, c.course)
    for (const r of rows) {
      if (!r.course) {
        const m = /\.?\s*(\d{6,9})\s*$/.exec(r.summary || '')
        if (m) r.course = codeToCourse.get(m[1]) || null
      }
      if (!r.course) {
        const match = courses.find(c => (r.summary || '').trim().toLowerCase() === String(c.course || '').toLowerCase())
        if (match) r.course = match.course
      }
    }

    const existing = dataRef.current?.calendarEvents || []
    const calByKey = new Map()
    const lectureByKey = new Map()
    for (const e of existing) {
      const k = `${e.uid}|${e.date}|${e.startTime}`
      if (e.calId) calByKey.set(k, e.calId)
      if (e.lectureId) lectureByKey.set(k, e.lectureId)
    }
    const merged = rows.map(r => {
      const k = `${r.uid}|${r.date}|${r.startTime}`
      return { ...r, calId: calByKey.get(k) || null, lectureId: lectureByKey.get(k) || null }
    })

    assignLectureIds(merged, courses)

    // Log each scheduled lecture/tutorial/practical into the course's syllabus
    // (Course Content) so every class gets a numbered entry the user only has
    // to give a description to. Re-imports refresh dates/ids but keep the
    // manually written description.
    const existingContent = dataRef.current?.content || []
    const contentByLecture = new Map()
    for (const i of existingContent) {
      if (i.course && i.contentId) contentByLecture.set(`${i.course}|${i.contentId}`, i)
    }
    const content = [...existingContent]
    for (const r of merged) {
      if (!r.lectureId || !r.course) continue
      const item = contentByLecture.get(`${r.course}|${r.lectureId}`)
      if (item) {
        item.date = r.date
        item.start = r.startTime || ''
        item.end = r.endTime || ''
        item.calId = r.calId
      } else {
        const type = inferEventType(r.summary, r.description)
        const topic = r.summary || r.lectureId
        content.push({
          id: `${r.course}||${r.lectureId}|${r.date}||${topic}`,
          course: r.course,
          course2: null,
          contentId: r.lectureId,
          type,
          topic,
          description: topic,
          date: r.date,
          deadline: null,
          start: r.startTime || '',
          end: r.endTime || '',
          marker: null,
          location: r.location || null,
          hoursSpent: null,
          materialHours: null,
          content: null,
          calId: r.calId,
          done: '',
          urgency: 'Medium',
          time: 0,
        })
      }
    }

    const d = { ...(dataRef.current || {}), calendarEvents: merged, content }
    const planner = plannerRef.current || []
    setAll(d, planner)
    await writeTabRows(info.fileId, TAB_CALENDAR, serializeCalendar(merged))
    await writeTabRows(info.fileId, TAB_CONTENT, serializeContent(content))
    return { imported: merged.length, files: files.length }
  }

  // Export the Calendar tab into the user's dedicated "AcademeMate" Google
  // Calendar (never the primary calendar). First-time events are inserted
  // (their returned id is stored in cal_id), already-exported events are
  // updated in place, so running it repeatedly is idempotent.
  async function pushCalendarToGoogle(colorOverrides = null) {
    const data = dataRef.current || {}
    const events = data.calendarEvents || []
    if (events.length === 0) return { inserted: 0, updated: 0 }
    const calendarId = await ensureCalendar('AcademeMate')
    // Every course gets a distinct colour (cycled 1-10; 11/Tomato is reserved
    // for exams, enforced in toGcalEvent). Overrides from the pre-push colour
    // dialog win when present.
    const courseColorMap = new Map()
    ;(data.courses || []).forEach((c, i) => {
      if (!c?.course || courseColorMap.has(c.course)) return
      const override = colorOverrides?.get?.(c.course)
      courseColorMap.set(c.course, override && /^(10|[1-9])$/.test(override) ? override : String((i % 10) + 1))
    })
    let inserted = 0
    let updated = 0
    const updatedEvents = []
    for (const ev of events) {
      const gcal = toGcalEvent(ev, courseColorMap)
      if (ev.calId) {
        const id = await updateCalendarEvent(ev.calId, gcal, calendarId)
        if (id) {
          updated += 1
        } else {
          const newId = await insertCalendarEvent(gcal, calendarId)
          updatedEvents.push({ ...ev, calId: newId })
          inserted += 1
        }
      } else {
        const id = await insertCalendarEvent(gcal, calendarId)
        updatedEvents.push({ ...ev, calId: id })
        inserted += 1
      }
    }

    // Course deadlines (syllabus projects/assignments/exams) are pushed as
    // Tomato all-day events. Lectures logged to content are not re-pushed —
    // they're already exported from the Calendar tab.
    let deadlinesInserted = 0
    const updatedDeadlines = []
    const deadlines = (data.content || []).filter(i => i.deadline && i.course)
    for (const item of deadlines) {
      const summary = item.description || item.topic || item.contentId
      const gcal = {
        summary: `Due: ${summary}`,
        location: '',
        description: summary,
        start: { date: item.deadline },
        end: { date: item.deadline },
        colorId: '11',
      }
      if (item.calId) {
        const id = await updateCalendarEvent(item.calId, gcal, calendarId)
        if (!id) {
          const newId = await insertCalendarEvent(gcal, calendarId)
          updatedDeadlines.push({ ...item, calId: newId })
          deadlinesInserted += 1
        }
      } else {
        const id = await insertCalendarEvent(gcal, calendarId)
        updatedDeadlines.push({ ...item, calId: id })
        deadlinesInserted += 1
      }
    }

    if (updatedEvents.length > 0 || updatedDeadlines.length > 0) {
      const byKey = new Map(updatedEvents.map(e => [`${e.uid}|${e.date}|${e.startTime}`, e.calId]))
      const merged = events.map(e => {
        const id = byKey.get(`${e.uid}|${e.date}|${e.startTime}`)
        return id ? { ...e, calId: id } : e
      })
      const calById = new Map(updatedDeadlines.map(i => [i.id, i.calId]))
      const content = (data.content || []).map(i => (calById.has(i.id) ? { ...i, calId: calById.get(i.id) } : i))
      const d = { ...data, calendarEvents: merged, content }
      dataRef.current = d
      saveJSON({ data: d, plannerWeeks: plannerRef.current, weeklyHours: weeklyRef.current })
      setData(d)
      const info = driveRef.current
      if (info) {
        await writeTabRows(info.fileId, TAB_CALENDAR, serializeCalendar(merged))
        await writeTabRows(info.fileId, TAB_CONTENT, serializeContent(content))
      }
    }
    return { inserted, updated, deadlinesInserted }
  }

  function addSession(entry) {
    const prev = dataRef.current || {}
    const updated = { ...prev, studyLog: [{ ...entry, id: Date.now() }, ...(prev.studyLog || [])] }
    setAll(updated, plannerRef.current)
    syncTabs(['studyLog'])
  }

  function addCourse(course) {
    const { _gradeComponents, ...courseData } = course
    const prev = dataRef.current || {}
    const updated = {
      ...prev,
      courses: [...(prev.courses || []), { ...courseData, id: courseData.course, course: courseData.course }],
    }
    const keys = ['courses']
    if (_gradeComponents && _gradeComponents.length > 0) {
      const gradeComps = [...(updated.gradeComponents || [])]
      gradeComps.push({
        course: courseData.course,
        components: _gradeComponents.map(c => ({ ...c, id: c.id || null, name: c.id || null })),
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
    const item = {
      course: deadline.course || '',
      course2: null,
      contentId: deadline.contentId || deadline.id || null,
      type: deadline.type || 'assignment',
      topic: deadline.description || '',
      date: null,
      deadline: deadline.date || null,
      start: deadline.start || '',
      end: deadline.end || '',
      marker: deadline.urgency === 'High' ? 'Important' : '',
      location: deadline.location || null,
      hoursSpent: deadline.time ?? null,
      materialHours: null,
      content: deadline.notes || null,
      calId: null,
      description: deadline.description || 'Task',
      urgency: deadline.urgency || 'Medium',
      done: deadline.done || '',
      time: deadline.time ?? 0,
    }
    const updated = { ...prev, content: [...(prev.content || []), item] }
    setAll(updated, plannerRef.current)
    syncTabs(['content'])
  }

  function updateSession(id, entry) {
    const prev = dataRef.current || {}
    const studyLog = (prev.studyLog || []).map(e => e.id === id ? { ...e, ...entry, id } : e)
    setAll({ ...prev, studyLog }, plannerRef.current)
    syncTabs(['studyLog'])
  }

  function updateCourse(id, course) {
    const { _gradeComponents, ...courseData } = course
    const prev = dataRef.current || {}
    const courses = [...(prev.courses || [])]
    const idx = courses.findIndex(c => c.id === id)
    if (idx < 0) return
    const name = courseData.course || courses[idx].course || id
    courses[idx] = { ...courses[idx], ...courseData, id: name, course: name }
    const updated = { ...prev, courses }
    const keys = ['courses']
    if (_gradeComponents) {
      const gradeComps = [...(updated.gradeComponents || [])]
      const gIdx = gradeComps.findIndex(g => g.course === id)
      const entry = {
        course: courseData.course,
        components: _gradeComponents.map(c => ({ ...c, id: c.id || null, name: c.id || null })),
        totalGrade: calcWeightedGrade(_gradeComponents),
      }
      if (gIdx >= 0) gradeComps[gIdx] = entry
      else gradeComps.push(entry)
      updated.gradeComponents = gradeComps
      keys.push('gradeComponents')
    }
    setAll(updated, plannerRef.current)
    syncTabs(keys)
  }

  function updateContentItem(id, payload) {
    const prev = dataRef.current || {}
    const content = (prev.content || []).map(i => {
      if (i.id !== id) return i
      const updated = { ...i, id }
      if (payload.course != null) updated.course = payload.course
      if (payload.description != null) {
        updated.topic = payload.description
        updated.description = payload.description
      }
      if (payload.deadline != null) {
        updated.deadline = payload.deadline
        updated.date = null
      }
      if (payload.date != null) {
        updated.deadline = payload.date
        updated.date = null
      }
      if (payload.schedDate != null) {
        updated.date = payload.schedDate
        updated.deadline = null
      }
      if (payload.type != null) updated.type = payload.type
      if (payload.start != null) updated.start = payload.start
      if (payload.end != null) updated.end = payload.end
      if (payload.calId != null) updated.calId = payload.calId
      if (payload.location != null) updated.location = payload.location
      if (payload.time != null) {
        updated.hoursSpent = payload.time
        updated.time = payload.time
      }
      if (payload.urgency != null) {
        updated.urgency = payload.urgency
        updated.marker = (payload.urgency === 'High' || payload.urgency === 'Extremely High') ? 'important' : ''
      }
      if (payload.done != null) updated.done = payload.done
      return updated
    })
    setAll({ ...prev, content }, plannerRef.current)
    syncTabs(['content'])
  }

  // Generic Course Content item (lecture, project, deadline...). Used by the
  // course syllabus UI. A deadline item becomes a Tomato-red event in the
  // calendar on the next push.
  function addContentItem(item) {
    const prev = dataRef.current || {}
    const newItem = {
      course: item.course || '',
      course2: item.course2 || null,
      contentId: item.contentId || item.id || null,
      type: item.type || 'lecture',
      topic: item.description || item.topic || '',
      description: item.description || item.topic || '',
      date: item.date || null,
      deadline: item.deadline || null,
      start: item.start || '',
      end: item.end || '',
      marker: item.urgency === 'High' ? 'Important' : '',
      location: item.location || null,
      hoursSpent: item.time ?? null,
      materialHours: item.materialHours ?? null,
      content: item.notes || null,
      calId: item.calId || null,
      done: item.done || '',
      urgency: item.urgency || 'Medium',
      time: item.time ?? 0,
    }
    newItem.id = `${newItem.course}||${newItem.contentId || ''}|${newItem.date || ''}|${newItem.deadline || ''}|${newItem.topic}`
    const updated = { ...prev, content: [...(prev.content || []), newItem] }
    setAll(updated, plannerRef.current)
    syncTabs(['content'])
  }

  function deleteSession(id) {
    const prev = dataRef.current || {}
    const updated = { ...prev, studyLog: (prev.studyLog || []).filter(e => e.id !== id) }
    setAll(updated, plannerRef.current)
    syncTabs(['studyLog'])
  }

  function deleteCourse(id) {
    const prev = dataRef.current || {}
    const course = (prev.courses || []).find(c => c.id === id)
    const updated = { ...prev, courses: (prev.courses || []).filter(c => c.id !== id) }
    const keys = ['courses']
    if (course) {
      updated.gradeComponents = (updated.gradeComponents || []).filter(g => g.course !== course.course)
      keys.push('gradeComponents')
    }
    setAll(updated, plannerRef.current)
    syncTabs(keys)
  }

  function deleteDeadline(id) {
    const prev = dataRef.current || {}
    const updated = { ...prev, content: (prev.content || []).filter(d => d.id !== id) }
    setAll(updated, plannerRef.current)
    syncTabs(['content'])
  }

  function updateGradeComponents(course, components) {
    const prev = dataRef.current || {}
    const gradeComponents = [...(prev.gradeComponents || [])]
    let idx = -1
    for (let i = 0; i < gradeComponents.length; i++) {
      if (gradeComponents[i].course === course) { idx = i; break }
    }
    const entry = {
      course,
      components: components.map(c => ({ ...c, id: c.id || null, name: c.name || c.id || c.type || null })),
      totalGrade: calcWeightedGrade(components),
    }
    if (idx >= 0) {
      gradeComponents[idx] = { ...gradeComponents[idx], ...entry }
    } else {
      gradeComponents.push(entry)
    }
    const updated = { ...prev, gradeComponents }
    setAll(updated, plannerRef.current)
    syncTabs(['gradeComponents', 'courses'])
  }

  function updatePlannerWeek(weekIndex, rows) {
    const week = plannerRef.current[weekIndex]
    if (!week) return
    const prev = dataRef.current || {}
    const keep = (prev.dailyPlan || []).filter(r => !week.dates.includes(r.date))
    const flat = []
    for (const row of rows) {
      if (row.isTotal || !row.course) continue
      for (let d = 0; d < 7; d++) {
        const day = row.days?.[d]
        if (row.planned?.[d] || day?.description || day?.hours) {
          flat.push({
            date: week.dates[d],
            course: row.course,
            task: day?.description || '',
            plannedHours: row.planned?.[d] || 0,
            actualHours: row.days?.[d]?.hours || 0,
            done: null,
            notes: null,
          })
        }
      }
    }
    const updated = { ...prev, dailyPlan: [...keep, ...flat] }
    setAll(updated, plannerRef.current)
    syncTabs(['dailyPlan'])
  }

  function updatePlannerCell(weekIndex, rowIndex, dayIndex, field, value) {
    const week = plannerRef.current[weekIndex]
    if (!week) return
    const row = week.rows[rowIndex]
    if (!row || row.isTotal) return

    const prev = [...plannerRef.current]
    const rows = [...prev[weekIndex].rows]
    const current = { ...rows[rowIndex] }
    const days = [...current.days]
    days[dayIndex] = { ...days[dayIndex], [field]: value }
    current.days = days
    current.total = days.reduce((s, d) => s + d.hours, 0)
    rows[rowIndex] = current
    prev[weekIndex] = { ...prev[weekIndex], rows }

    const date = week.dates[dayIndex]
    const dataPrev = dataRef.current || {}
    const keep = (dataPrev.dailyPlan || []).filter(r => !(r.date === date && r.course === row.course))
    const existing = (dataPrev.dailyPlan || []).find(r => r.date === date && r.course === row.course)
    const flatRow = {
      date,
      course: row.course,
      task: days[dayIndex].description ?? existing?.task ?? '',
      plannedHours: existing?.plannedHours ?? row.planned?.[dayIndex] ?? 0,
      actualHours: days[dayIndex].hours ?? existing?.actualHours ?? 0,
      done: existing?.done ?? null,
      notes: existing?.notes ?? null,
    }
    const updated = { ...dataPrev, dailyPlan: [...keep, flatRow] }
    setAll(updated, prev)
    syncTabs(['dailyPlan'])
  }

  function addPlannerTask(task) {
    const prev = dataRef.current || {}
    const row = {
      id: `${task.date}|${task.course || ''}|${task.task || ''}`,
      date: task.date,
      course: task.course || '',
      task: task.task || '',
      plannedHours: task.plannedHours ?? 0,
      actualHours: task.actualHours ?? null,
      done: task.done || null,
      notes: task.notes || null,
    }
    const updated = { ...prev, dailyPlan: [...(prev.dailyPlan || []), row] }
    setAll(updated, plannerRef.current)
    syncTabs(['dailyPlan'])
  }

  function updatePlannerTask(id, updates) {
    const prev = dataRef.current || {}
    const dailyPlan = (prev.dailyPlan || []).map(r => r.id === id ? { ...r, ...updates } : r)
    setAll({ ...prev, dailyPlan }, plannerRef.current)
    syncTabs(['dailyPlan'])
  }

  function deletePlannerTask(id) {
    const prev = dataRef.current || {}
    const dailyPlan = (prev.dailyPlan || []).filter(r => r.id !== id)
    setAll({ ...prev, dailyPlan }, plannerRef.current)
    syncTabs(['dailyPlan'])
  }

  return (
    <AppDataContext.Provider value={{
      inputLog: data?.studyLog || [],
      masterCourses: data?.courses || [],
      gradeComponents: data?.gradeComponents || [],
      lectures: data?.content || [],
      content: data?.content || [],
      deadlines: (data?.content || []).filter(i => i.deadline),
      weeklyHours,
      plannerWeeks,
      dailyPlan: data?.dailyPlan || [],
      calendarEvents: data?.calendarEvents || [],
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
      importCalendarFromDrive,
      pushCalendarToGoogle,
      addSession,
      addCourse,
      addDeadline,
      addContentItem,
      deleteSession,
      deleteCourse,
      deleteDeadline,
      deleteContentItem: deleteDeadline,
      updateSession,
      updateCourse,
      updateDeadline: updateContentItem,
      updateGradeComponents,
      updatePlannerWeek,
      updatePlannerCell,
      addPlannerTask,
      updatePlannerTask,
      deletePlannerTask,
    }}>
      {children}
    </AppDataContext.Provider>
  )
}