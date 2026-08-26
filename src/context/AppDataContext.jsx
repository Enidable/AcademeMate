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
  serializeAdditionalLog,
} from '../data/serialize'
import { parseIcs, dedupeCalendarRows } from '../data/ical'
import { renameIdBase, typeLetter, nextDeadlineId } from '../utils/ids'
import { parseCSVRaw } from '../utils/csv'
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
  typeSymbol,
  deriveAbbrev,
  courseColorId,
  batchCalendarEvents,
  listCalendarEvents,
  listUserCalendars,
  fetchCalendarEvents,
  deleteCalendarEvent,
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
  TAB_ADDITIONAL,
  ASSET_BASE,
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

// Save a lightweight snapshot to localStorage (a cache, not the source of
// truth). calendarEvents is excluded — it's the largest table, fully
// regenerable from Drive / the .ics import, and dropping it keeps the snapshot
// well under the browser's ~5 MB quota so saves never silently fail.
function saveJSON(state) {
  try {
    const d = state?.data ? { ...state.data } : state?.data
    if (d) delete d.calendarEvents
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, data: d }))
  } catch (e) {
    // Quota exceeded — surface it instead of silently dropping saves.
    console.error('localStorage save failed (quota?):', e)
  }
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
// References that are unresolved course CODES (all digits) are skipped: they'd
// only spawn garbage rows named after the code.
function synthCourses(parsed) {
  const referenced = new Set()
  for (const e of parsed.studyLog || []) if (e.course) referenced.add(e.course)
  for (const g of parsed.gradeComponents || []) if (g.course) referenced.add(g.course)
  for (const i of parsed.content || []) if (i.course) referenced.add(i.course)
  const existingNames = new Set((parsed.courses || []).map(c => c.course))
  for (const name of referenced) {
    if (!name || /^\d{5,9}$/.test(name)) continue
    if (existingNames.has(name)) continue
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

// Remove exact-duplicate syllabus rows (same course + component ID + date/
// deadline) — earlier bugs wrote the same deadline twice. The row with more
// user content (description/hours/done) wins.
function dedupeContent(items) {
  const seen = new Map()
  const out = []
  // Deliberately NOT scoring the done flag: when two copies of the same row
  // disagree, the user's most recent action (checked OR unchecked) lives on
  // the row they edited — the stale copy must never win back.
  const score = it => ((it.description && it.description.trim()) ? 2 : 0) + (it.hoursSpent ? 1 : 0)
  for (const i of items || []) {
    const k = `${i.course || ''}|${i.contentId || ''}|${i.date || ''}|${i.deadline || ''}`
    const existing = seen.get(k)
    if (!existing) { seen.set(k, i); out.push(i); continue }
    if (score(i) > score(existing)) {
      out[out.indexOf(existing)] = i
      seen.set(k, i)
    }
  }
  return out
}

// Run the full content clean-up (course normalisation + duplicate collapse).
// Used after loading from Drive AND after healing from the localStorage
// snapshot, so stale copies resurrected by the heal pass are merged away too.
function cleanContent(data) {
  normalizeContentCourses(data)
  data.content = dedupeContent(data.content)
}

// Content rows created through some paths carry the raw course CODE (or
// abbreviation) as their course instead of the canonical name. Normalise them
// so such duplicates collapse into their name-keyed twin in dedupeContent
// below — otherwise an old copy with done='done' survives unchecking forever.
function normalizeContentCourses(data) {
  const lookup = new Map()
  const put = (key, name) => {
    const k = String(key || '').trim().toLowerCase()
    if (k && name && !lookup.has(k)) lookup.set(k, name)
  }
  for (const c of data.courses || []) {
    if (!c?.course) continue
    put(c.course, c.course)
    put(c.code, c.course)
    put(c.abbrev, c.course)
  }
  if (lookup.size === 0) return
  for (const i of data.content || []) {
    const name = lookup.get(String(i.course || '').trim().toLowerCase())
    if (name && name !== i.course) i.course = name
  }
}

function buildState(rowsByTab) {
  const data = parseAll(rowsByTab)
  const weeklyHours = deriveWeeklyTotals(data.studyLog, data.weeklyOverrides, data.additionalLog)
  // Drop garbage rows created by earlier bugs: a "course" whose name is purely
  // the numeric course code (e.g. "191211110" next to the real "Modelling and
  // Simulation"). The next Courses write removes them from Drive for good.
  data.courses = (data.courses || []).filter(c => !/^\d{5,9}$/.test(String(c.course || '')))
  cleanContent(data)
  synthCourses(data)
  linkGradeComponents(data)
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
  additionalLog: TAB_ADDITIONAL,
}

function serializeTabByTitle(title, data, _planner) {
  // course_id columns store the course code; map each course name to its code.
  const codeMap = new Map((data?.courses || []).map(c => [c.course, c.code || null]))
  switch (title) {
    case TAB_STUDY_LOG: return serializeStudyLog(data?.studyLog, codeMap)
    case TAB_COURSES: return serializeCourses(data?.courses)
    case TAB_GRADES: return serializeGradeComponents(data?.gradeComponents, codeMap)
    case TAB_CONTENT: return serializeContent(data?.content, codeMap)
    case TAB_HOURS: return serializeWeeklyOverrides(data?.weeklyOverrides)
    case TAB_DAILY: return serializeDailyPlan(data?.dailyPlan, codeMap)
    case TAB_CALENDAR: return serializeCalendar(data?.calendarEvents, codeMap)
    case TAB_ADDITIONAL: return serializeAdditionalLog(data?.additionalLog)
    default: return []
  }
}

function calcWeightedGrade(components) {
  // Weighted average over the components that HAVE a grade — an ungraded part
  // shouldn't drag the average down.
  let totalWeight = 0
  let weighted = 0
  for (const c of components || []) {
    const g = parseFloat(c.grade)
    if (isNaN(g)) continue
    const w = parseFloat(c.weight) || 0
    totalWeight += w
    weighted += w * g
  }
  return totalWeight > 0 ? weighted / totalWeight : null
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
// Exam-family events (exam / exam review / resit) are deliberately skipped:
// they belong to the exam GRADE component (e.g. NLPE1), never to a scheduled
// lecture ID, so lectures always start at 01.
const EXAM_FAMILY = new Set(['exam', 'exam review', 'resit'])

function assignLectureIds(rows, courses) {
  const courseById = {}
  for (const c of courses || []) courseById[c.course] = c
  const groups = {}
  for (const r of rows) {
    if (!r.course) continue
    if (EXAM_FAMILY.has(inferEventType(r.summary, r.description))) continue
    if (!groups[r.course]) groups[r.course] = []
    groups[r.course].push(r)
  }
  for (const [courseName, evs] of Object.entries(groups)) {
    const c = courseById[courseName] || {}
    // Readable abbreviation (stored or derived) over the numeric code.
    const abbrev = (c.abbrev || deriveAbbrev(courseName) || c.code).replace(/\s+/g, '-')
    // One incremental sequence per course across ALL scheduled types
    // (ML1-L-01, then a practical becomes ML1-P-02). Only a lectureId that
    // already matches the current base + letter format (ABBR-L-01 or legacy
    // ABBR-L01) is kept — anything else (e.g. old code-based IDs like
    // 202200109-01) is re-numbered against the current base, so re-imports
    // converge on the readable abbreviation IDs instead of keeping the old ones.
    const pat = new RegExp(`^${escapeRe(abbrev)}[- ][A-Za-z]{1,2}[- ]?(\\d+)$`, 'i')
    // If the sequence doesn't start at 01 (e.g. an exam previously consumed 01
    // before it was moved to a component ID), renumber from scratch so lectures
    // always start at 01. Once it starts at 01 the numbering stays stable.
    const existingNums = evs
      .map(r => r.lectureId && pat.exec(String(r.lectureId)))
      .filter(Boolean)
      .map(m => parseInt(m[1], 10))
    if (existingNums.length > 0 && Math.min(...existingNums) > 1) {
      for (const r of evs) r.lectureId = null
    }
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
      if (r.lectureId && pat.exec(String(r.lectureId))) continue
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
  const [saveMsg, setSaveMsg] = useState(null)
  let saveTimer = null
  const flashSaveMsg = (msg, ms) => {
    setSaveMsg(msg)
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => setSaveMsg(null), ms)
  }

  const dataRef = useRef(null)
  const plannerRef = useRef([])
  const weeklyRef = useRef([])
  const driveRef = useRef(null)

  // Debounce Drive writes so rapid edits coalesce into ONE spreadsheet request
  // instead of one per keystroke. Google Sheets rate-limits at ~60 writes/min
  // per user; a burst of auto-saving edits used to trip 429 (Too Many Requests)
  // and fail saves.
  const syncTimers = useRef({})
  async function performWrite(keys) {
    if (!driveRef.current) return
    setSyncing(true)
    const data = dataRef.current
    const planner = plannerRef.current
    const titles = keys.map(k => TITLE_BY_KEY[k]).filter(Boolean)
    const rowsByTab = {}
    for (const title of titles) rowsByTab[title] = serializeTabByTitle(title, data, planner)
    try {
      await writeTabsBatch(driveRef.current.fileId, rowsByTab)
    } catch (e) {
      console.error(`Failed to save ${keys.join(', ')} to Drive:`, e)
      setDriveError(`Could not save: ${e.message}`)
      flashSaveMsg(`Save failed: ${e.message}`, 8000)
    } finally {
      setSyncing(false)
    }
  }

  function syncTabs(keys) {
    if (!driveRef.current) return
    const sig = keys.slice().sort().join('|')
    if (syncTimers.current[sig]) clearTimeout(syncTimers.current[sig])
    syncTimers.current[sig] = setTimeout(() => {
      delete syncTimers.current[sig]
      performWrite(keys)
    }, 500)
  }

  function setAll(d, p) {
    const wt = deriveWeeklyTotals(d.studyLog, d.weeklyOverrides, d.additionalLog)
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
  // point) is re-added with its stored metadata. Drive values win on conflicts.
  // Numeric-named "courses" (unresolved codes) are never re-added — they are
  // corruption, not real courses.
  function healCoursesFromLocal(d, savedLocal) {
    const local = savedLocal?.data?.courses
    if (!Array.isArray(local) || local.length === 0) return
    fillCourseGaps(d, local.filter(c => c && !/^\d{5,9}$/.test(String(c.course || ''))))
    const byName = new Map((d.courses || []).map(c => [c.course, c]))
    for (const c of local) {
      if (!c?.course || byName.has(c.course) || /^\d{5,9}$/.test(String(c.course))) continue
      byName.set(c.course, c)
      d.courses.push({ ...c, id: c.code || c.course, course: c.course })
    }
  }

  // Fill any remaining gaps (localStorage may be equally damaged) from the
  // bundled course template. Only fills empty fields of existing courses —
  // never re-adds a course the user deleted, never overwrites a present value.
  async function fillCourseGapsFromTemplate(d) {
    try {
      const text = await fetch(`${ASSET_BASE}data/AcademeMate - Courses.csv`).then(r => r.text())
      fillCourseGaps(d, parseAll({ [TAB_COURSES]: parseCSVRaw(text) }).courses)
    } catch { /* template unreachable — skip */ }
  }

  async function healCourses(d, savedLocal) {
    healCoursesFromLocal(d, savedLocal)
    healContentFromLocal(d, savedLocal)
    await fillCourseGapsFromTemplate(d)
  }

  // Recover syllabus content from the last-known-good localStorage snapshot:
  //  • if Drive already has the course+component ID, merge any newer notes /
  //    hours / done onto it;
  //  • if Drive is missing the row entirely (e.g. a bad write emptied the tab),
  //    re-add it — matched by course + component ID so this never re-creates
  //    the duplicates of the past.
  function healContentFromLocal(d, savedLocal) {
    const local = savedLocal?.data?.content
    if (!Array.isArray(local) || local.length === 0) return
    const driveById = new Map()
    for (const i of d.content || []) {
      if (!i.course) continue
      const k = `${i.course}|${i.contentId || ''}`
      if (!driveById.has(k)) driveById.set(k, i)
    }
    for (const l of local) {
      if (!l.course) continue
      const k = `${l.course}|${l.contentId || ''}`
      const existing = driveById.get(k)
      if (existing) {
        // calId is included so an event that was pushed to Google Calendar but
        // whose Drive write failed isn't re-inserted as a duplicate on reload.
        for (const f of ['description', 'topic', 'notes', 'content', 'hoursSpent', 'time', 'done', 'calId', 'prep']) {
          if ((existing[f] == null || existing[f] === '') && l[f] != null && l[f] !== '') existing[f] = l[f]
        }
      } else {
        d.content.push({ ...l })
        driveById.set(k, l)
      }
    }
  }

  async function loadAndApplyFromDrive(file, savedLocal = null) {
    const info = { fileId: file.id, fileUrl: file.webViewLink, user: resolveUser() }
    setDrive(info)
    driveRef.current = info
    const rowsByTab = await readAllTabs(file.id)
    const { data: d, weeklyHours: wt, plannerWeeks: p } = buildState(rowsByTab)
    await healCourses(d, savedLocal)
    cleanContent(d)

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
      weeklyRef.current = deriveWeeklyTotals(saved.data.studyLog, saved.data.weeklyOverrides, saved.data.additionalLog)
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
          // Seed the template ONLY into a brand-new spreadsheet. Seeding an
          // existing one whenever its tabs looked empty has wiped real data.
          if (file.createdNew) await seedEmptyTabs(file.id)
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
      // Only a brand-new spreadsheet gets seeded — never overwrite existing data.
      if (file.createdNew) await seedEmptyTabs(file.id)
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
      cleanContent(d)
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
    //
    // Reconciliation rules (so re-imports converge instead of piling up):
    //   • an existing entry is matched by lecture ID, then by its calendar
    //     element (cal_id), then by occurrence (date+start) — duplicates of the
    //     same element/occurrence are dropped and the survivor is re-keyed to
    //     the generated lecture ID;
    //   • exam / exam review / resit events of a course collapse into ONE exam
    //     deadline that uses the exam grade-component ID (e.g. NLPE1) — they are
    //     the same exam and never take a scheduled lecture ID.
    const existingContent = dataRef.current?.content || []
    const contentByLecture = new Map()
    const contentByCal = new Map()
    const contentByOccurrence = new Map()
    const addTo = (map, key, item) => {
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(item)
    }
    for (const i of existingContent) {
      if (!i.course) continue
      if (i.contentId) contentByLecture.set(`${i.course}|${i.contentId}`, i)
      if (i.calId) addTo(contentByCal, `${i.course}|${i.calId}`, i)
      if (i.date) addTo(contentByOccurrence, `${i.course}|${i.date}|${i.start || ''}`, i)
    }
    const content = [...existingContent]
    const consumed = new Set()

    const makeItem = (r, type) => {
      const topic = r.summary || r.lectureId
      return {
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
        prep: null,
        calId: r.calId,
        done: '',
        urgency: 'Medium',
        time: 0,
      }
    }

    const makeExamItem = (r, id) => {
      const topic = r.summary || id
      return {
        id: `${r.course}||${id}|${r.date}||${topic}`,
        course: r.course,
        course2: null,
        contentId: id,
        type: 'exam',
        topic,
        description: topic,
        date: null,
        deadline: r.date,
        start: '',
        end: r.endTime || '',
        marker: null,
        location: r.location || null,
        hoursSpent: null,
        materialHours: null,
        content: null,
        prep: null,
        calId: r.calId,
        done: '',
        urgency: 'Medium',
        time: 0,
      }
    }

    // Reuse (or create) the syllabus entry for one calendar event, deduplicating
    // against every existing entry that points at the same element/occurrence.
    // Returns the kept entry (the re-keyed existing one or the freshly created
    // one) so callers can exclude it from later clean-up.
    const reconcile = (r, type) => {
      if (!r.lectureId || !r.course) return null
      const candidates = []
      const seen = new Set()
      const consider = i => { if (i && !seen.has(i.id)) { seen.add(i.id); candidates.push(i) } }
      consider(contentByLecture.get(`${r.course}|${r.lectureId}`))
      if (r.calId) for (const i of contentByCal.get(`${r.course}|${r.calId}`) || []) consider(i)
      for (const i of contentByOccurrence.get(`${r.course}|${r.date}|${r.startTime}`) || []) consider(i)
      const chosen = candidates.find(i => !consumed.has(i.id))
      for (const c of candidates) if (c !== chosen) consumed.add(c.id)
      if (chosen) {
        if (chosen.contentId !== r.lectureId) {
          chosen.contentId = r.lectureId
          chosen.id = `${r.course}||${r.lectureId}|${r.date}||${chosen.topic || r.lectureId}`
          contentByLecture.set(`${r.course}|${r.lectureId}`, chosen)
        }
        chosen.date = r.date
        chosen.start = r.startTime || ''
        chosen.end = r.endTime || ''
        chosen.calId = r.calId
        chosen.type = type
        return chosen
      }
      const fresh = makeItem(r, type)
      content.push(fresh)
      return fresh
    }

    // Reconcile one exam/review/resit occurrence. Every occurrence keeps its
    // own syllabus row (own date), but they all share the course's single exam
    // component ID (e.g. NLPE1). A row matches when it already points at the
    // same component ID and date, or at the same calendar element.
    const reconcileExamOccurrence = (r, examId) => {
      const sameOccurrence = i =>
        i.course === r.course &&
        i.contentId === examId &&
        (i.date === r.date || i.deadline === r.date || (r.calId && i.calId === r.calId))
      const chosen = content.find(i => !consumed.has(i.id) && sameOccurrence(i))
      if (chosen) {
        chosen.contentId = examId
        chosen.deadline = r.date
        chosen.date = null
        chosen.type = 'exam'
        chosen.calId = r.calId
        return chosen
      }
      return content.push(makeExamItem(r, examId))
    }

    const courseById = new Map(courses.map(c => [c.course, c]))
    const gradeCompIds = (dataRef.current?.gradeComponents || [])
      .flatMap(g => (g.components || []).map(x => ({ course: g.course, contentId: x.id, type: x.type })))

    // Resolve the course's single exam component ID once per course, then give
    // every exam/review/resit occurrence its own syllabus row under that ID.
    const examIdByCourse = new Map()
    const resolveExamId = r => {
      if (!examIdByCourse.has(r.course)) {
        const c = courseById.get(r.course) || {}
        // Reuse the exam component the user already entered (e.g. NLPE1) so
        // the calendar events match it instead of spawning a second exam.
        const existingExamComp = (gradeCompIds || []).find(x => x.course === r.course && x.type === 'exam')
        examIdByCourse.set(r.course, existingExamComp?.contentId || nextDeadlineId(r.course, c.abbrev, c.code, [...existingContent, ...gradeCompIds], 'exam'))
      }
      return examIdByCourse.get(r.course)
    }

    for (const r of merged) {
      if (!r.course) continue
      const type = inferEventType(r.summary, r.description)
      if (EXAM_FAMILY.has(type)) {
        r.lectureId = null
        reconcileExamOccurrence(r, resolveExamId(r))
        continue
      }
      if (!r.lectureId) continue
      reconcile(r, type)
    }

    // Exam-family syllabus rows are deadline-shaped (date: null); any row of
    // that family still carrying a scheduled date is a stale leftover.
    for (const i of existingContent) {
      if (EXAM_FAMILY.has(i.type) && i.date && !i.deadline) consumed.add(i.id)
    }

    const contentFinal = content.filter(i => !consumed.has(i.id))

    const d = { ...(dataRef.current || {}), calendarEvents: merged, content: contentFinal }
    const planner = plannerRef.current || []
    setAll(d, planner)
    const codeMap = new Map((dataRef.current?.courses || []).map(c => [c.course, c.code || null]))
    await writeTabsBatch(info.fileId, {
      [TAB_CALENDAR]: serializeCalendar(merged, codeMap),
      [TAB_CONTENT]: serializeContent(contentFinal, codeMap),
    })
    return { imported: merged.length, files: files.length }
  }

  // Import the events of one of the user's own Google calendars (work, personal,
  // …) into the AcademeMate Calendar tab, so planned non-study hours show up in
  // the week grid and get pushed to the AcademeMate calendar too. Re-importing
  // is idempotent: rows are keyed by the source event id + date + start time.
  async function importGoogleCalendar(calendarId, calendarSummary) {
    const info = driveRef.current
    if (!info) throw new Error('Connect to Drive first')
    const now = new Date()
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const timeMin = iso(new Date(now.getFullYear(), now.getMonth() - 3, 1))
    const timeMax = iso(new Date(now.getFullYear(), now.getMonth() + 12, 1))
    const items = await fetchCalendarEvents(calendarId, timeMin, timeMax)
    if (items.length === 0) throw new Error('That calendar has no events in the import window.')

    const toLocalTime = isoDateTime => {
      const d = new Date(isoDateTime)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }

    const courses = dataRef.current?.courses || []
    const codeToCourse = new Map()
    for (const c of courses) if (c.code) codeToCourse.set(c.code, c.course)
    const escapeRe2 = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const rows = items.map(ev => {
      const allDay = !!(ev.start && ev.start.date)
      const date = allDay ? ev.start.date : (ev.start?.dateTime ? ev.start.dateTime.slice(0, 10) : null)
      if (!date) return null
      const startTime = allDay ? '' : toLocalTime(ev.start.dateTime)
      const endTime = allDay ? '' : (ev.end?.dateTime ? toLocalTime(ev.end.dateTime) : '')
      const summary = ev.summary || 'Busy'
      let course = null
      const cm = /\.?\s*(\d{6,9})\s*$/.exec(summary)
      if (cm) course = codeToCourse.get(cm[1]) || null
      if (!course) {
        const s = summary.trim().toLowerCase()
        const exact = courses.find(c => String(c.course || '').toLowerCase() === s)
        if (exact) course = exact.course
        if (!course) {
          let nameMatch = null
          for (const c of courses) {
            const name = String(c.course || '').toLowerCase()
            if (name.length > 4 && s.includes(name) && (!nameMatch || name.length > nameMatch.course.length)) nameMatch = c
          }
          if (nameMatch) course = nameMatch.course
        }
        if (!course) {
          const abbrMatch = courses.find(c => {
            const abbr = String(c.abbrev || '').toLowerCase()
            if (!abbr || abbr.length < 2) return false
            return new RegExp(`(^|[^a-z0-9])${escapeRe2(abbr)}([^a-z0-9]|$)`, 'i').test(summary || '')
          })
          if (abbrMatch) course = abbrMatch.course
        }
      }
      return {
        id: `${ev.id}|${date}|${startTime}`,
        date,
        startTime,
        endTime,
        allDay,
        summary,
        course,
        location: (ev.location || '').trim() || null,
        description: (ev.description || '').trim() || null,
        source: calendarSummary || calendarId,
        uid: ev.id,
        status: null,
        lectureId: null,
        calId: null,
      }
    }).filter(Boolean)

    const existing = dataRef.current?.calendarEvents || []
    const existingKeys = new Set(existing.map(e => `${e.uid}|${e.date}|${e.startTime}`))
    const seen = new Set()
    let added = 0
    for (const r of rows) {
      const k = `${r.uid}|${r.date}|${r.startTime}`
      if (existingKeys.has(k) || seen.has(k)) continue
      seen.add(k)
      existing.push(r)
      added += 1
    }

    const d = { ...(dataRef.current || {}), calendarEvents: existing }
    setAll(d, plannerRef.current)
    const codeMap = new Map((dataRef.current?.courses || []).map(c => [c.course, c.code || null]))
    await writeTabsBatch(info.fileId, {
      [TAB_CALENDAR]: serializeCalendar(existing, codeMap),
    })
    return { imported: rows.length, added, source: calendarSummary || calendarId }
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
    const opGroups = []
    const failReason = (res) => {
      const status = res?.status
      const msg = res?.data?.error?.message || res?.data?.error?.errors?.[0]?.message
      return status ? (msg ? `${status} ${msg}` : String(status)) : (msg || 'no response')
    }
    const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '')
    // Unique key for an event payload: summary + start (date or date-time).
    // Used to spot events that already exist on the calendar. Leading type
    // symbols (emoji) are stripped so a symbol-less event pushed by an older
    // version still matches its newly-symbol-prefixed counterpart.
    const gcalKey = g => {
      const s = g.start.date || g.start.dateTime || ''
      const summary = String(g.summary || '').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim()
      return `${summary}::${s.slice(0, 16)}`
    }

    // Existing events that already live on the AcademeMate calendar. An event
    // about to be inserted whose exact match already exists adopts the existing
    // id (update instead of a fresh insert), and surplus exact duplicates a past
    // bug left behind get removed — so re-pushes converge instead of piling up.
    const unlinked = [
      ...events.filter(e => isDate(e.date) && !e.calId),
      ...deadlines.filter(i => isDate(i.deadline) && !i.calId),
    ]
    const existingByKey = new Map()
    const adopted = new Set()
    if (unlinked.length > 0) {
      try {
        const dates = unlinked.map(i => i.date || i.deadline).filter(isDate).sort()
        const shift = (iso, days) => {
          const [y, m, d] = iso.split('-')
          const dt = new Date(Date.UTC(+y, +m - 1, +d))
          dt.setUTCDate(dt.getUTCDate() + days)
          return dt.toISOString().slice(0, 10)
        }
        const timeMin = dates.length ? shift(dates[0], -1) : null
        const timeMax = dates.length ? shift(dates[dates.length - 1], 1) : null
        const listed = await listCalendarEvents(calendarId, timeMin, timeMax)
        for (const ex of listed) {
          const k = gcalKey(ex)
          if (!existingByKey.has(k)) existingByKey.set(k, [])
          existingByKey.get(k).push(ex)
        }
      } catch (e) {
        // Best-effort: without the list the push simply inserts as before.
        console.warn('Could not list existing calendar events; skipping duplicate adoption:', e.message)
      }
    }
    // Reuse an existing event for an item about to be inserted. Returns the id
    // of the first not-yet-adopted exact match, else null.
    const adoptFor = (gcal) => {
      const matches = (existingByKey.get(gcalKey(gcal)) || []).filter(ex => !adopted.has(ex.id))
      if (matches.length === 0) return null
      adopted.add(matches[0].id)
      return matches[0].id
    }

    // Exam days are already on Google Calendar via their timetable events
    // (pushed Tomato-red). Mirrored exam syllabus rows (one per occurrence,
    // sharing the exam component ID) must not create a second copy — skip any
    // exam-type content row that falls on a day the timetable already covers.
    const examEventDays = new Set(
      events.filter(e => isDate(e.date)).map(e => `${e.course || ''}|${e.date}`),
    )
    // Leftover safety net: a content row that shares an event's Google id
    // would PUT the same resource twice in one batch (400).
    const deadlineCalIds = new Set(
      deadlines.filter(i => isDate(i.deadline) && i.calId).map(i => i.calId),
    )

    // Never insert more than one fresh copy of the same payload per push:
    // extra local rows that match an already-planned insert are internal
    // duplicates — they get dropped locally instead of multiplying on Google.
    const plannedPosts = new Map()
    const dupRefs = new Set()

    const queueOp = (kind, ref, gcal) => {
      if (ref.calId) {
        const f = JSON.stringify(gcal)
        if (fp[fpKey(ref.calId)] === f) return
        opGroups.push([{ kind, ref, gcal }])
        ops.push({ method: 'PUT', eventId: ref.calId, body: gcal })
        return
      }
      const adoptedId = adoptFor(gcal)
      if (!adoptedId) {
        const k = gcalKey(gcal)
        const n = plannedPosts.get(k) || 0
        if (n >= 1) { dupRefs.add(ref); return }
        plannedPosts.set(k, n + 1)
      }
      opGroups.push([{ kind, ref, gcal }])
      ops.push(adoptedId ? { method: 'PUT', eventId: adoptedId, body: gcal } : { method: 'POST', body: gcal })
    }

    for (const ev of events) {
      if (!isDate(ev.date)) continue
      if (ev.calId && deadlineCalIds.has(ev.calId)) continue
      queueOp('event', ev, toGcalEvent(ev, courseColorMap))
    }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    for (const item of deadlines) {
      if (!isDate(item.deadline)) continue
      if (item.type === 'exam' && examEventDays.has(`${item.course || ''}|${item.deadline}`)) continue
      if (item.calId && deadlineCalIds.has(item.calId) && events.some(e => e.calId === item.calId)) continue
      const summary = item.description || item.topic || item.contentId
      // Deadlines usually carry a due time (e.g. 17:00, 09:00) in the item's
      // start/end columns — push them as timed events, all-day only as fallback.
      const dueTime = (item.end || item.start || '').trim()
      const timed = /^\d{1,2}:\d{2}$/.test(dueTime)
      const start = timed ? { dateTime: `${item.deadline}T${dueTime}:00`, timeZone } : { date: item.deadline }
      const gcal = {
        summary: `Due: ${typeSymbol(item.type || 'deadline')} ${summary}`.trim(),
        location: item.location || '',
        description: summary,
        start,
        end: { ...start },
        colorId: '11',
      }
      queueOp('deadline', item, gcal)
    }

    // Safety net: Google rejects a batch that touches the same event id twice.
    // Merge any ops that still share a target (e.g. two local rows pointing at
    // one cal_id) — the survivors piggyback on the single operation's result.
    const targetClaims = new Map()
    const dedupOps = []
    const dedupGroups = []
    opGroups.forEach((group, i) => {
      const op = ops[i]
      if (!op.eventId) { dedupOps.push(op); dedupGroups.push(group); return }
      const key = `put:${op.eventId}`
      if (!targetClaims.has(key)) {
        targetClaims.set(key, group)
        dedupOps.push(op)
        dedupGroups.push(group)
      } else {
        targetClaims.get(key).push(...group)
      }
    })

    let inserted = 0
    let updated = 0
    let deadlinesApplied = 0
    const applied = new Set()
    const errors = []
    const retryList = []

    // Write a successful result's cal_id straight back onto the source object.
    // Referencing the object itself (never re-matching by id) means every
    // deadline/event keeps its own link, even when rows share or lack an `id`.
    const record = (p, id, method) => {
      fp[fpKey(id)] = JSON.stringify(p.gcal)
      p.ref.calId = id
      applied.add(p.ref)
      if (p.kind === 'deadline') deadlinesApplied += 1
      else if (method === 'POST') inserted += 1
      else updated += 1
    }

    if (dedupOps.length > 0) {
      const results = await batchCalendarEvents(dedupOps, calendarId)
      results.forEach((res, i) => {
        const group = dedupGroups[i]
        if (!group || group.length === 0) return
        const ok = res?.data?.id && res.status >= 200 && res.status < 300
        if (ok) group.forEach(p => record(p, res.data.id, dedupOps[i].method))
        else if (dedupOps[i].method === 'PUT' && res?.status === 404) {
          // Event was deleted on the calendar since the last push — re-insert.
          retryList.push(...group)
        } else {
          for (const p of group) {
            errors.push(`"${p.ref.summary || p.ref.description || '?'}" → ${failReason(res)}`)
          }
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
        if (res?.data?.id) record(p, res.data.id, 'POST')
        else errors.push(`"${p.ref.summary || p.ref.description || '?'}" → ${failReason(res)}`)
      })
    }

    // Remove surplus exact duplicates — leftovers of the earlier duplicate-insert
    // bug. A key is kept when at least one of its events maps to a real app item
    // (freshly adopted OR already linked); the rest are exact duplicates and get
    // deleted. Keys with no mapping are never touched.
    const linkedIds = new Set([
      ...events.filter(e => e.calId).map(e => e.calId),
      ...deadlines.filter(i => i.calId).map(i => i.calId),
    ])
    for (const matches of existingByKey.values()) {
      const keepIds = new Set(matches.filter(ex => adopted.has(ex.id) || linkedIds.has(ex.id)).map(ex => ex.id))
      if (keepIds.size === 0) continue
      for (const ex of matches) {
        if (!keepIds.has(ex.id)) deleteCalendarEvent(ex.id, calendarId)
      }
    }

    // Internal duplicates spotted before insert are dropped from the local
    // data too, so the next load/push doesn't resurrect them.
    const eventsFinal = dupRefs.size > 0 ? events.filter(e => !dupRefs.has(e)) : events
    const contentFinal = dupRefs.size > 0 ? (data.content || []).filter(i => !dupRefs.has(i)) : data.content

    saveCalFp(fp)

    if (applied.size > 0 || dupRefs.size > 0) {
      // cal_ids were written onto the source objects above, so the in-memory
      // data already carries them — no re-keying by id needed.
      const d = { ...data, calendarEvents: eventsFinal, content: contentFinal }
      dataRef.current = d
      saveJSON({ data: d, plannerWeeks: plannerRef.current, weeklyHours: weeklyRef.current })
      setData(d)
      const info = driveRef.current
      if (info) {
        const codeMap = new Map((dataRef.current?.courses || []).map(c => [c.course, c.code || null]))
        await writeTabsBatch(info.fileId, {
          [TAB_CALENDAR]: serializeCalendar(eventsFinal, codeMap),
          [TAB_CONTENT]: serializeContent(contentFinal, codeMap),
        })
      }
    }

    if (errors.length > 0) {
      throw new Error(`Some events failed to push (${errors.length}): ${errors.slice(0, 3).join('; ')}`)
    }
    return { inserted, updated, deadlinesInserted: deadlinesApplied }
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
      courses: [...(prev.courses || []), { ...courseData, id: courseData.code || courseData.course, course: courseData.course }],
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
    // Stable id (same shape addContentItem builds) so the row can be matched
    // reliably for dedupe, React keys and calendar cal_id write-back.
    item.id = `${item.course}||${item.contentId || ''}|${item.date || ''}|${item.deadline || ''}|${item.topic}`
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
    // Match by the stored id (course code) or by name — callers pass both.
    const idx = courses.findIndex(c => c.id === id || c.course === id)
    if (idx < 0) {
      console.warn('updateCourse: no course matched for', id)
      return
    }
    const current = courses[idx]
    const name = courseData.course || current.course || id
    const updated = { ...current, ...courseData, course: name }
    updated.id = updated.code || name
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

  function updateContentItem(id, payload, fallback = null) {
    let matched = null
    const prev = dataRef.current || {}
    const apply = (i) => {
      const updated = { ...i }
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
      // Same for prep: null clears it, a string sets the prep requirement.
      if (payload.prep !== undefined) updated.prep = payload.prep
      if (payload.location != null) updated.location = payload.location
      if (payload.time != null) {
        updated.hoursSpent = payload.time
        updated.time = payload.time
      }
      if (payload.urgency != null) {
        updated.urgency = payload.urgency
        updated.marker = (payload.urgency === 'High' || payload.urgency === 'Extremely High') ? 'important' : ''
      }
      if ('done' in payload) updated.done = payload.done
      return updated
    }
    let content = (prev.content || []).map(i => {
      if (i.id !== id) return i
      matched = apply(i)
      return matched
    })
    // Fallback: match by (course + contentId) — robust against the compound id
    // drifting after an import. Applies to every matching row.
    if (!matched && fallback?.course) {
      content = (prev.content || []).map(i => {
        if (i.course !== fallback.course || i.contentId !== fallback.contentId) return i
        matched = apply(i)
        return matched
      })
    }

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

    if (!matched) {
      console.warn('updateContentItem: no content row matched', { id, fallback })
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
      prep: item.prep || null,
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
      if (comp.done) next.done = comp.done
      if (comp.dueDate) {
        next.deadline = comp.dueDate
        next.date = null
        const label = comp.notes ? `${comp.name || comp.id} · ${comp.notes}` : (comp.name || comp.id)
        next.description = i.description || label
        next.topic = i.topic || label
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
        topic: c.notes ? `${c.name || c.id} · ${c.notes}` : (c.name || c.id),
        description: c.notes ? `${c.name || c.id} · ${c.notes}` : (c.name || c.id),
        done: c.done || '',
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

  // Past-day reconciliation (#2): planner entries from before `todayISO` that
  // were never ticked off lose their planned hours (set to 0) — the plan is
  // corrected to reality and written back to the sheet like any edit. Ticked
  // entries keep their hours; notes are never touched.
  function reconcilePastDays(todayISOValue) {
    const prev = dataRef.current || {}
    let changed = false
    const dailyPlan = (prev.dailyPlan || []).map(r => {
      if (r.date && r.date < todayISOValue && !r.done && (r.plannedHours || 0) > 0) {
        changed = true
        return { ...r, plannedHours: 0 }
      }
      return r
    })
    if (!changed) return
    setAll({ ...prev, dailyPlan }, plannerRef.current)
    syncTabs(['dailyPlan'])
  }

  // --- Additional Time Log (work / other / commute / exercise) -----------

  function addAdditionalEntry(entry) {
    const prev = dataRef.current || {}
    const row = {
      id: `${entry.date}|${String(entry.category || '').toLowerCase()}|${entry.task || ''}|${Date.now()}`,
      date: entry.date,
      course: entry.category || 'Other Obligations',
      category: entry.category || 'Other Obligations',
      task: entry.task || '',
      hours: parseFloat(entry.hours) || 0,
      notes: entry.notes || null,
      done: entry.done || '',
      isAdditional: true,
    }
    const updated = { ...prev, additionalLog: [...(prev.additionalLog || []), row] }
    setAll(updated, plannerRef.current)
    syncTabs(['additionalLog'])
  }

  function updateAdditionalEntry(id, updates) {
    const prev = dataRef.current || {}
    const additionalLog = (prev.additionalLog || []).map(r => r.id === id ? { ...r, ...updates } : r)
    setAll({ ...prev, additionalLog }, plannerRef.current)
    syncTabs(['additionalLog'])
  }

  function deleteAdditionalEntry(id) {
    const prev = dataRef.current || {}
    const additionalLog = (prev.additionalLog || []).filter(r => r.id !== id)
    setAll({ ...prev, additionalLog }, plannerRef.current)
    syncTabs(['additionalLog'])
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
      additionalLog: data?.additionalLog || [],
      loading,
      error,
      drive,
      syncing,
      saveMsg,
      driveError,
      hasDrive: !!drive,
      connectToDrive,
      disconnectFromDrive,
      refreshFromDrive,
      refreshFromCSVs,
      importCSVToTab,
      importCalendarFromDrive,
      importGoogleCalendar,
      listUserCalendars,
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
      updateContentItem,
      updateDeadline: updateContentItem,
      updateGradeComponents,
      updatePlannerWeek,
      updatePlannerCell,
      addPlannerTask,
      updatePlannerTask,
      deletePlannerTask,
      reconcilePastDays,
      addAdditionalEntry,
      updateAdditionalEntry,
      deleteAdditionalEntry,
    }}>
      {children}
    </AppDataContext.Provider>
  )
}