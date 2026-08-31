// Relations / data-model layer (issue #27, milestones 1-2).
//
// The app's source of truth is the Google Spreadsheet (flat tabs), but every
// entity table now carries a stable, persisted primary key (an `id` column in
// the sheet, backfilled for legacy rows on load) and relations between entities
// are resolved HERE — by key, not by string-matching or prop-threading in the
// UI. Components should query these helpers instead of hand-wiring ids.
//
// Id scheme: per-table prefix + zero-padded sequential number (plan_000123,
// session_000456, course_000007, content_000321, cal_000019, addtl_000005).
// Grade components keep their natural key (course + component id) for now.

// Highest numeric suffix already used by a prefix, so ids are never reissued.
function maxSeq(existing, prefix) {
  const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$')
  let max = 0
  for (const id of existing || []) {
    const m = re.exec(String(id))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max
}

// Next sequential id for a table (existing = the table's current ids).
export function nextId(prefix, existing) {
  return prefix + String(maxSeq(existing, prefix) + 1).padStart(6, '0')
}

// Fill any row missing an `id` with the next sequential id for the table.
// Rows that already carry an id (persisted or imported) are left untouched.
export function assignIds(rows, prefix) {
  let n = maxSeq((rows || []).map(r => r && r.id).filter(Boolean), prefix)
  for (const r of rows || []) {
    if (!r || r.id) continue
    n += 1
    r.id = prefix + String(n).padStart(6, '0')
  }
  return rows
}

// Assign stable ids to every entity table of a parsed dataset. Grade
// components are excluded — they are identified by (course + component id).
export function assignEntityIds(data) {
  assignIds(data.courses, 'course_')
  assignIds(data.dailyPlan, 'plan_')
  assignIds(data.studyLog, 'session_')
  assignIds(data.content, 'content_')
  assignIds(data.calendarEvents, 'cal_')
  assignIds(data.additionalLog, 'addtl_')
  return data
}

// --- Index / join helpers -------------------------------------------------

export function indexById(rows) {
  const m = new Map()
  for (const r of rows || []) if (r && r.id) m.set(r.id, r)
  return m
}

export function byId(rows, id) {
  for (const r of rows || []) if (r && r.id === id) return r
  return null
}

// All Study Log sessions that fulfilled a Daily Planner item (plan_id).
export function sessionsForPlan(planId, studyLog) {
  return (studyLog || []).filter(s => s.planId === planId)
}

// Total hours logged against a Daily Planner item.
export function hoursForPlan(planId, studyLog) {
  return sessionsForPlan(planId, studyLog).reduce((sum, s) => sum + (s.durationHours || 0), 0)
}

// Drive a Daily Planner row's state from its linked Study Log sessions
// (milestone 3): actual hours = sum of the linked sessions' durations; the item
// is done while it has sessions and reopens (done + actual hours cleared) once
// the last one is deleted. Auto-logged boxes (notes === "auto-logged") exist
// only for their session, so they are removed entirely when it's gone. This is
// the canonical plan↔session write-back — no component reaches across tables ad
// hoc anymore.
export function syncPlannerFromSessions(planId, studyLog, dailyPlan) {
  if (!planId) return dailyPlan || []
  const sessions = sessionsForPlan(planId, studyLog)
  const hours = sessions.reduce((sum, s) => sum + (s.durationHours || 0), 0)
  const isAuto = r => String(r.notes || '').trim() === 'auto-logged'
  return (dailyPlan || [])
    .filter(r => r.id !== planId || sessions.length > 0 || !isAuto(r))
    .map(r => {
      if (r.id !== planId) return r
      if (sessions.length === 0) return { ...r, done: null, actualHours: null }
      return { ...r, done: 'done', actualHours: Math.round(hours * 100) / 100 }
    })
}

// All Study Log sessions referencing a lecture / component ID.
export function sessionsForLecture(lectureId, studyLog) {
  return (studyLog || []).filter(s => s.lectureId === lectureId)
}

// All Study Log sessions for a course (matched by course name — the FK switch
// to COURSES.id is milestone 4; once studyLog.courseId exists, prefer that).
export function sessionsForCourse(course, studyLog) {
  return (studyLog || []).filter(s => s.course === course)
}
