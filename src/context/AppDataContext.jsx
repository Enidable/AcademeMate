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
import { renameIdBase, typeLetter } from '../utils/ids'
import {
  ensureSpreadsheet,
  ensureTabs,
  readAllTabs,
  writeAllTabs,
  writeTabRows,
  writeTabsBatch,
  listIcsFiles,
  fetchIcsFile,
  ensureCalendar,
  toGcalEvent,
  inferEventType,
  deriveAbbrev,
  courseColorId,
  batchCalendarEvents,
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
const CAL_FP_KEY = 'am_cal_fp'

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

// Track what was last written to Google Calendar so a re-push can skip events
// whose payload hasn't changed — the push only touches events that actually
// need an update. Keyed by "{calendarId}::{eventId}".
function loadCalFp() {
  try { return JSON.parse(localStorage.getItem(CAL_FP_KEY)) || {} } catch { return {} }
}

function saveCalFp(fp) {
  try { localStorage.setItem(CAL_FP_KEY, JSON.stringify(fp)) } catch { /* ignore */ }
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

// Re-create a course row whenever it is still referenced anywhere else (study
// log, grade components or syllabus) but its row is missing — a safeguard so a
// course that lost its Courses-tab row never silently disappears from the app.
function synthCourses(parsed) {
  const referenced = new Set()
  for (const e of parsed.studyLog || []) if (e.course) referenced.add(e.course)
  for (const g of parsed.gradeComponents || []) if (g.course) referenced.add(g.course)
  for (const i of parsed.content || []) if (i.course) referenced.add(i.course)
  const existingNames = new Set((parsed.courses || []).map(c => c.course))
  for (const name of referenced) {
    if (name && !existingNames.has(name)) {
      parsed.courses.push({
        id: name,
        course: name,
        code: null, abbrev: null, year: null, quartile: null,
        start: null, finish: null, ec: null, status: null,
        estHours: null, notes: null, grade: null,
        color: null, scope: null, order: null,
      })
    }
  }
}

function buildState(rowsByTab) {
  const data = parseAll(rowsByTab)
  synthCourses(data)
  linkGradeComponents(data)
  const weeklyHours = deriveWeeklyTotals(data.studyLog, data.weeklyOverrides)
  const plannerWeeks = ensureDefaultRows(buildPlannerWeeks(data.dailyPlan))
  return { data, weeklyHours, plannerWeeks }
}

// Link existing grade components to their syllabus items so old data gets the
// same behaviour as newly edited ones: match component id ⇄ contentId (same
// course) and mirror the type (exam/assignment) in both directions. This is
// display-only reconciliation; the next write to Drive persists it.
function linkGradeComponents(data) {
  const content = data.content || []
  const grades = data.gradeComponents || []
  const byId = new Map()
  for (const item of content) {
    if (!item.contentId) continue
    const key = `${item.course}||${item.contentId}`
    if (!byId.has(key)) byId.set(key, item)
  }
  for (const g of grades) {
    const components = g.components || []
    for (const comp of components) {
      const item = comp.id != null ? byId.get(`${g.course}||${comp.id}`) : null
      if (item) {
        if ((item.type === 'exam' || item.type === 'assignment') && comp.type !== item.type) {
          comp.type = item.type
        }
      } else if (comp.id != null && comp.name == null) {
        comp.name = comp.id
      }
    }
  }
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

// Give every calendar event (lectures, tutorials, practicals, exams, …) a
// stable incremental id in the form {abbrev}-{LETTER}-{NN} (e.g. ML1-L-01).
// One sequence per course across ALL scheduled types, so the number just keeps
// counting (ML1-L-01, ML1-T-02, ML1-P-03…) — the letter is the calendar type.
// Events that already carry a lecture id keep it, so re-imports never reshuffle
// the numbering; both the new (ABBR-L-01) and legacy (ABBR-L01) forms match.
function assignLectureIds(rows, courses) {
  const courseById = {}
  for (const c of courses || []) courseById[c.course] = c
  const groups = {}
  for (const r of rows) {
    if (!r.course) continue
    if (!groups[r.course]) groups[r.course] = []
    groups[r.course].push(r)
  }
  for (const [courseName, evs] of Object.entries(groups)) {
    const c = courseById[courseName]
    const abbrev = (c?.abbrev || c?.code || deriveAbbrev(courseName)).replace(/\s+/g, '-')
    // One incremental sequence per course across ALL scheduled types
    // (ML1-L-01, then a practical becomes ML1-P-02). Both the current
    // (ABBR-L-01) and legacy (ABBR-L01) formats are matched so a re-import
    // never reshuffles existing numbering. The letter is a label only.
    const pat = new RegExp(`^${escapeRe(abbrev)}[- ][A-Za-z]{1,2}[- ]?(\\d+)$`, 'i')
    const taken = new Set()
    let max = 0
    for (const r of evs) {
      const m = r.lectureId && pat.exec(String(r.lectureId))
      if (m) {
        const num = parseInt(m[1], 10)
        taken.add(num)
        max = Math.max(max, num)
      }
    }
    evs.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''))
    let next = max + 1
    for (const r of evs) {
      if (r.lectureId) continue
      while (taken.has(next)) next++
      taken.add(next)
      const letter = typeLetter(inferEventType(r.summary, r.description)) || ''
      r.lectureId = `${abbrev}-${letter}-${String(next).padStart(2, '0')}`
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
    const rowsByTab = {}
    for (const title of titles) rowsByTab[title] = serializeTabByTitle(title, data, planner)
    writeTabsBatch(driveRef.current.fileId, rowsByTab)
      .catch(e => setDriveError(e.message))
      .finally(() => setSyncing(false))
  }

  // Fields a course row can silently lose when its Drive tab gets overwritten.
  // Gaps are filled from the last-known-good localStorage snapshot and the
  // bundled template (the user's own course backbone), so code / dates / notes
  // / colours never stay missing after a bad write.
  const COURSE_GAP_FIELDS = ['code', 'abbrev', 'year', 'quartile', 'start', 'finish', 'ec', 'status', 'estHours', 'notes', 'comment', 'scope', 'color', 'order']

  // Fill empty fields on existing courses from a source list (same course name).
  function fillCourseGaps(d, source) {
    if (!Array.isArray(source) || source.length === 0) return
    const byName = new Map()
    for (const s of source) if (s.course) byName.set(s.course, s)
    for (const c of d.courses || []) {
      const s = byName.get(c.course)
      if (!s) continue
      for (const field of COURSE_GAP_FIELDS) {
        if ((c[field] == null || c[field] === '') && s[field] != null && s[field] !== '') {
          c[field] = s[field]
        }
      }
    }
  }

  // Drive is the source of truth, but a course that only exists in the last
  // known-good localStorage snapshot (its row was dropped from Drive at some
  // point) is re-added with its stored metadata, so nothing silently vanishes
  // and colours/abbreviations survive. Drive values always win on conflicts.
  function healCoursesFromLocal(d, savedLocal) {
    const local = savedLocal?.data?.courses
    if (!Array.isArray(local) || local.length === 0) return
    fillCourseGaps(d, local)
    const byName = new Map((d.courses || []).map(c => [c.course, c]))
    for (const c of local) {
      if (!c?.course || byName.has(c.course)) continue
      byName.set(c.course, c)
      d.courses.push({ ...c, id: c.course, course: c.course })
    }
  }

  // Fill any remaining gaps (localStorage may be equally damaged) from the
  // bundled course template. Only fills empty fields of existing courses —
  // never re-adds a course the user deleted, never overwrites a present value.
  async function fillCourseGapsFromTemplate(d) {
    try {
      const template = await fetchTemplateRows()
      fillCourseGaps(d, parseAll(template).courses)
    } catch { /* template unreachable — skip */ }
  }

  async function healCourses(d, savedLocal) {
    healCoursesFromLocal(d, savedLocal)
    await fillCourseGapsFromTemplate(d)
  }

  async function loadAndApplyFromDrive(file, savedLocal = null) {
    const info = { fileId: file.id, fileUrl: file.webViewLink, user: resolveUser() }
    setDrive(info)
    driveRef.current = info
    const rowsByTab = await readAllTabs(file.id)
    const { data: d, weeklyHours: wt, plannerWeeks: p } = buildState(rowsByTab)
    await healCourses(d, savedLocal)

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
          await loadAndApplyFromDrive(file, saved)
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
      return await loadAndApplyFromDrive(file, loadJSON())
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
      await healCourses(d, loadJSON())
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
    // Beyond an exact name/code match this also links events whose summary
    // mentions the full course name or its abbreviation ("Exam Systems
    // Engineering", "SE - Tutorial"), so exams and shorthand-titled events land
    // in the right course instead of being dropped from the syllabus.
    const courses = dataRef.current?.courses || []
    const codeToCourse = new Map()
    for (const c of courses) if (c.code) codeToCourse.set(c.code, c.course)
    const escapeRe2 = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    for (const r of rows) {
      if (!r.course) {
        const m = /\.?\s*(\d{6,9})\s*$/.exec(r.summary || '')
        if (m) r.course = codeToCourse.get(m[1]) || null
      }
      if (!r.course) {
        const summary = (r.summary || '').trim().toLowerCase()
        const exact = courses.find(c => String(c.course || '').toLowerCase() === summary)
        if (exact) { r.course = exact.course; continue }
        // Full course name appears inside the summary (longest name wins).
        let nameMatch = null
        for (const c of courses) {
          const name = String(c.course || '').toLowerCase()
          if (name.length > 4 && summary.includes(name) && (!nameMatch || name.length > nameMatch.course.length)) {
            nameMatch = c
          }
        }
        if (nameMatch) { r.course = nameMatch.course; continue }
        // Abbreviation appears as a standalone token (e.g. "SE - Lecture 1").
        const abbrMatch = courses.find(c => {
          const abbr = String(c.abbrev || '').toLowerCase()
          if (!abbr || abbr.length < 2) return false
          return new RegExp(`(^|[^a-z0-9])${escapeRe2(abbr)}([^a-z0-9]|$)`, 'i').test(r.summary || '')
        })
        if (abbrMatch) r.course = abbrMatch.course
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
    await writeTabsBatch(info.fileId, {
      [TAB_CALENDAR]: serializeCalendar(merged),
      [TAB_CONTENT]: serializeContent(content),
    })
    return { imported: merged.length, files: files.length }
  }

  // Export the Calendar tab into the user's dedicated "AcademeMate" Google
  // Calendar (never the primary calendar). Writes are batched (up to 50 events
  // per HTTP request) so the whole sync stays within the Calendar API rate
  // limit, and events whose payload didn't change since the last push are
  // skipped entirely. First-time events are inserted (their returned id is
  // stored in cal_id), already-exported events are updated in place, so running
  // it repeatedly is idempotent.
  async function pushCalendarToGoogle(colorOverrides = null) {
    const data = dataRef.current || {}
    const events = data.calendarEvents || []
    const deadlines = (data.content || []).filter(i => i.deadline && i.course)
    if (events.length === 0 && deadlines.length === 0) return { inserted: 0, updated: 0, deadlinesInserted: 0 }
    const calendarId = await ensureCalendar('AcademeMate')

    // Course colour: the pre-push dialog override wins; otherwise the stable
    // course hash. Google Calendar colours stay independent from the in-app
    // course colour (which can be any colour via the colour wheel). 11/Tomato
    // is reserved for exams, enforced in toGcalEvent.
    const ov = colorOverrides instanceof Map ? colorOverrides : new Map(Object.entries(colorOverrides || {}))
    const courseColorMap = new Map()
    ;(data.courses || []).forEach((c, i) => {
      if (!c?.course || courseColorMap.has(c.course)) return
      const override = ov.get(c.course)
      const fallback = courseColorId(c.course) || String((i % 10) + 1)
      courseColorMap.set(c.course, override && /^(10|[1-9])$/.test(override) ? override : /^(10|[1-9])$/.test(fallback) ? fallback : String((i % 10) + 1))
    })

    const fp = loadCalFp()
    const fpKey = id => `${calendarId}::${id}`
    const ops = []
    const plan = []

    for (const ev of events) {
      const gcal = toGcalEvent(ev, courseColorMap)
      if (ev.calId) {
        const f = JSON.stringify(gcal)
        if (fp[fpKey(ev.calId)] === f) continue
        plan.push({ kind: 'event', ref: ev, gcal })
        ops.push({ method: 'PUT', eventId: ev.calId, body: gcal })
      } else {
        plan.push({ kind: 'event', ref: ev, gcal })
        ops.push({ method: 'POST', body: gcal })
      }
    }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    for (const item of deadlines) {
      const summary = item.description || item.topic || item.contentId
      // Deadlines usually carry a due time (e.g. 17:00, 09:00) in the item's
      // start/end columns — push them as timed events, all-day only as fallback.
      const dueTime = (item.end || item.start || '').trim()
      const timed = /^\d{1,2}:\d{2}$/.test(dueTime)
      const start = timed ? { dateTime: `${item.deadline}T${dueTime}:00`, timeZone } : { date: item.deadline }
      const gcal = {
        summary: `Due: ${summary}`,
        location: item.location || '',
        description: summary,
        start,
        end: { ...start },
        colorId: '11',
      }
      if (item.calId) {
        const f = JSON.stringify(gcal)
        if (fp[fpKey(item.calId)] === f) continue
        plan.push({ kind: 'deadline', ref: item, gcal })
        ops.push({ method: 'PUT', eventId: item.calId, body: gcal })
      } else {
        plan.push({ kind: 'deadline', ref: item, gcal })
        ops.push({ method: 'POST', body: gcal })
      }
    }

    let inserted = 0
    let updated = 0
    const updatedEvents = []
    const updatedDeadlines = []
    const errors = []
    const retryList = []

    if (ops.length > 0) {
      const results = await batchCalendarEvents(ops, calendarId)
      results.forEach((res, i) => {
        const p = plan[i]
        if (!p) return
        const ok = res?.data?.id && res.status >= 200 && res.status < 300
        if (ok) {
          const id = res.data.id
          fp[fpKey(id)] = JSON.stringify(p.gcal)
          if (p.kind === 'event') {
            updatedEvents.push({ ...p.ref, calId: id })
            if (ops[i].method === 'POST') inserted += 1
            else updated += 1
          } else {
            updatedDeadlines.push({ ...p.ref, calId: id })
          }
        } else if (ops[i].method === 'PUT' && res?.status === 404) {
          // Event was deleted on the calendar since the last push — re-insert.
          retryList.push(p)
        } else {
          errors.push(`"${p.ref.summary || p.ref.description || '?'}" → ${res?.status || 'error'}`)
        }
      })
    }

    // Events that 404'd on update were deleted on the calendar — re-insert them.
    if (retryList.length > 0) {
      const retryOps = retryList.map(p => ({ method: 'POST', body: p.gcal }))
      const retryResults = await batchCalendarEvents(retryOps, calendarId)
      retryResults.forEach((res, i) => {
        const p = retryList[i]
        if (!p) return
        if (res?.data?.id) {
          const id = res.data.id
          fp[fpKey(id)] = JSON.stringify(p.gcal)
          if (p.kind === 'event') {
            updatedEvents.push({ ...p.ref, calId: id })
            updated += 1
          } else {
            updatedDeadlines.push({ ...p.ref, calId: id })
          }
        } else {
          errors.push(`"${p.ref.summary || p.ref.description || '?'}" → ${res?.status || 'error'}`)
        }
      })
    }

    saveCalFp(fp)

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
        await writeTabsBatch(info.fileId, {
          [TAB_CALENDAR]: serializeCalendar(merged),
          [TAB_CONTENT]: serializeContent(content),
        })
      }
    }

    if (errors.length > 0) {
      throw new Error(`Some events failed to push (${errors.length}): ${errors.slice(0, 3).join('; ')}`)
    }
    return { inserted, updated, deadlinesInserted: updatedDeadlines.length }
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
    // The year is always derived from the start (or finish) date.
    const s = String(courseData.start || '')
    const f = String(courseData.finish || '')
    const ym = (s || f).match(/^(\d{4})/)
    if (ym) courseData.year = ym[1]
    const updated = {
      ...prev,
      courses: [...(prev.courses || []), { ...courseData, id: courseData.course, course: courseData.course }],
    }
    const keys = ['courses']
    if (_gradeComponents && _gradeComponents.length > 0) {
      const gradeComps = [...(updated.gradeComponents || [])]
      gradeComps.push({
        course: courseData.course,
        components: _gradeComponents.map(c => ({ ...c, id: c.id || null, name: c.name || c.id || null })),
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

// Renames the prefix of an ID (e.g. "202400250-01" -> "ASDfR-L01") when the
// abbreviation (or code) used as its prefix changes. The letter + number suffix
// is preserved exactly via the shared helper.
function renameIdPrefix(contentId, oldBase, newBase) {
  return renameIdBase(contentId, oldBase, newBase)
}

  function updateCourse(id, course) {
    const { _gradeComponents, ...courseData } = course
    const prev = dataRef.current || {}
    const courses = [...(prev.courses || [])]
    const idx = courses.findIndex(c => c.id === id)
    if (idx < 0) return
    const current = courses[idx]
    const name = courseData.course || current.course || id
    const updated = { ...current, ...courseData, id: name, course: name }
    // The year is always derived from the start (or finish) date, so it is
    // never entered by hand.
    if (courseData.start != null || courseData.finish != null) {
      const s = String(courseData.start != null ? courseData.start : updated.start || '')
      const f = String(courseData.finish != null ? courseData.finish : updated.finish || '')
      const ym = (s || f).match(/^(\d{4})/)
      updated.year = ym ? ym[1] : null
    }
    courses[idx] = updated
    const updated2 = { ...prev, courses }
    const keys = ['courses']

    // When the abbreviation (or code) changes, re-derive every lecture/project
    // ID of this course so IDs switch from coursecode-** to abbreviation-**.
    const oldBase = (current.abbrev || current.code || deriveAbbrev(current.course)).replace(/\s+/g, '-')
    const newBase = (updated.abbrev || updated.code || deriveAbbrev(updated.course)).replace(/\s+/g, '-')
    if (newBase && oldBase && newBase !== oldBase) {
      let content = (prev.content || []).map(item => {
        if (item.course !== name) return item
        const renamed = renameIdPrefix(item.contentId, oldBase, newBase)
        if (renamed === item.contentId) return item
        return {
          ...item,
          contentId: renamed,
          id: `${item.course}|${item.course2 || ''}|${renamed}|${item.date || ''}|${item.deadline || ''}|${item.topic || ''}`,
        }
      })
      const gradeComponents = (prev.gradeComponents || []).map(g => {
        if (g.course !== name) return g
        return {
          ...g,
          components: g.components.map(c => ({
            ...c,
            id: renameIdPrefix(c.id, oldBase, newBase),
            name: renameIdPrefix(c.name, oldBase, newBase) || c.name,
          })),
        }
      })
      updated2.content = content
      updated2.gradeComponents = gradeComponents
      keys.push('content', 'gradeComponents')
    }

    if (_gradeComponents) {
      const gradeComps = [...(updated2.gradeComponents || [])]
      const gIdx = gradeComps.findIndex(g => g.course === id)
      const entry = {
        course: courseData.course,
        components: _gradeComponents.map(c => ({ ...c, id: c.id || null, name: c.name || c.id || null })),
        totalGrade: calcWeightedGrade(_gradeComponents),
      }
      if (gIdx >= 0) gradeComps[gIdx] = entry
      else gradeComps.push(entry)
      updated2.gradeComponents = gradeComps
      keys.push('gradeComponents')
    }
    setAll(updated2, plannerRef.current)
    syncTabs(keys)
  }

  function updateContentItem(id, payload) {
    let matched = null
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
      if (payload.contentId != null) updated.contentId = payload.contentId
      if (payload.type != null) updated.type = payload.type
      if (payload.start != null) updated.start = payload.start
      if (payload.end != null) updated.end = payload.end
      // calId uses an undefined check so passing null clears the link.
      if (payload.calId !== undefined) updated.calId = payload.calId
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
      matched = updated
      return updated
    })

    // Keep the grade component of the same course linked: when the syllabus
    // item's id or type changes, mirror it on the matching component (matched
    // by component id === contentId) so exams show as "Exam", not "Assignment".
    let gradeComponents = prev.gradeComponents || []
    if (matched && (payload.type != null || payload.contentId != null || payload.course != null)) {
      const compId = payload.contentId != null ? payload.contentId : matched.contentId
      gradeComponents = gradeComponents.map(g => {
        const isMatch = g.course === matched.course && g.id === compId
        if (!isMatch) return g
        const g2 = { ...g }
        if (payload.type != null && payload.type !== 'deadline') g2.type = payload.type === 'exam' ? 'exam' : payload.type === 'assignment' ? 'assignment' : g2.type
        if (payload.contentId != null) g2.id = payload.contentId
        return g2
      })
    }

    const updated = { ...prev, content, gradeComponents }
    setAll(updated, plannerRef.current)
    syncTabs(['content', 'gradeComponents'])
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

  // Delete a course by id or name. Everything referencing it is scrubbed —
// grade components, syllabus items, study-log rows and planner to-dos — so it
// never gets re-added from the log on the next load.
  function deleteCourse(id) {
    const prev = dataRef.current || {}
    const course = (prev.courses || []).find(c => c.id === id || c.course === id)
    const courseName = course?.course || id
    const updated = { ...prev, courses: (prev.courses || []).filter(c => c.course !== courseName) }
    const keys = ['courses']
    updated.gradeComponents = (updated.gradeComponents || []).filter(g => g.course !== courseName)
    keys.push('gradeComponents')
    const beforeContent = (prev.content || []).length
    updated.content = (prev.content || []).filter(i => i.course !== courseName)
    if (updated.content.length !== beforeContent) keys.push('content')
    const beforeLog = (prev.studyLog || []).length
    updated.studyLog = (prev.studyLog || []).filter(e => e.course !== courseName)
    if (updated.studyLog.length !== beforeLog) keys.push('studyLog')
    const beforePlan = (prev.dailyPlan || []).length
    updated.dailyPlan = (prev.dailyPlan || []).filter(r => r.course !== courseName)
    if (updated.dailyPlan.length !== beforePlan) keys.push('dailyPlan')
    setAll(updated, plannerRef.current)
    syncTabs(keys)
  }

  // Persist a manual course order (drag & drop). Each course gets an `order`
  // index so reordering one course doesn't touch the others' data.
  function reorderCourses(orderedCourses) {
    const prev = dataRef.current || {}
    const nameToCourse = new Map((prev.courses || []).map(c => [c.course, c]))
    const courses = orderedCourses
      .map((c, i) => {
        const existing = nameToCourse.get(c.course)
        if (!existing) return null
        return { ...existing, order: i }
      })
      .filter(Boolean)
    setAll({ ...prev, courses }, plannerRef.current)
    syncTabs(['courses'])
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

    // Reconcile the syllabus (Course Content) with the grade components:
    //  • mirror a component's type onto its linked syllabus item, and
    //  • when a component has a due date, automatically create/update a
    //    deadline item (contentId === component id, calId null) that the next
    //    calendar Sync will push to Google Calendar. Components that drop their
    //    due date (or are removed) lose their auto-deadline only if it has no
    //    logged hours, so manual work is never silently deleted.
    const existingContent = prev.content || []
    const contentIds = new Set(entry.components.filter(c => c.id != null).map(c => c.id))
    let content = existingContent.map(i => {
      if (i.course !== course) return i
      const comp = entry.components.find(c => c.id != null && c.id === i.contentId)
      if (!comp) return i
      const next = { ...i }
      const type = comp.type === 'exam' ? 'exam' : comp.type === 'assignment' ? 'assignment' : (i.type || comp.type)
      if (type) next.type = type
      if (comp.dueDate) {
        next.deadline = comp.dueDate
        next.date = null
        next.description = i.description || comp.name || comp.id
        next.topic = i.topic || comp.name || comp.id
      }
      return next
    })

    // Add a deadline item for every component that has a due date but no
    // matching syllabus entry yet.
    const seen = new Set(content.filter(i => i.course === course && i.contentId).map(i => i.contentId))
    for (const c of entry.components) {
      if (c.id == null || !c.dueDate || seen.has(c.id)) continue
      content.push({
        id: `${course}||${c.id}|${c.dueDate}||${c.name || c.id}`,
        course,
        course2: null,
        contentId: c.id,
        type: c.type || 'assignment',
        topic: c.name || c.id,
        description: c.name || c.id,
        date: null,
        deadline: c.dueDate,
        start: '',
        end: '',
        marker: c.urgency === 'High' ? 'Important' : '',
        location: null,
        hoursSpent: null,
        materialHours: null,
        content: null,
        calId: null,
        done: '',
        urgency: 'Medium',
        time: 0,
      })
    }

    // Drop auto-created deadlines whose component was removed (and that have no
    // logged hours), so removed assessments don't linger in the calendar.
    content = content.filter(i => {
      if (i.course !== course || !i.contentId || !i.deadline) return true
      if (contentIds.has(i.contentId)) return true
      return !(i.hoursSpent == null || i.hoursSpent === 0)
    })

    const updated = { ...prev, gradeComponents, content }
    setAll(updated, plannerRef.current)
    syncTabs(['gradeComponents', 'courses', 'content'])
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
      reorderCourses,
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