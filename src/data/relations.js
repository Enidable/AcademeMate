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

// One-time migration: sessions logged before the plan↔session link existed have
// no plan_id, so editing/deleting them can't reach the planner. Link each such
// session to the done planner row for the same course+day — when several rows
// exist, the task text (vs the session's note/project/lecture) disambiguates.
// Conservative: a session is only linked when the match is unambiguous.
// Idempotent — returns whether anything was linked.
export function backfillPlanLinks(data) {
  const byKey = new Map()
  for (const r of data.dailyPlan || []) {
    if (!r.date || !r.course || !r.done) continue
    const k = `${r.date}|${r.course}`
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(r)
  }
  let changed = false
  for (const s of data.studyLog || []) {
    if (s.planId || !s.date || !s.course) continue
    const candidates = byKey.get(`${s.date}|${s.course}`) || []
    if (candidates.length === 0) continue
    let pick = candidates.length === 1 ? candidates[0] : null
    if (!pick && candidates.length > 1) {
      const needle = String(s.notes || s.project || s.lectureId || '').trim().toLowerCase()
      const found = candidates.filter(r => {
        const t = String(r.task || '').trim().toLowerCase()
        return needle && (t.includes(needle) || needle.includes(t))
      })
      if (found.length === 1) pick = found[0]
    }
    if (pick) {
      s.planId = pick.id
      changed = true
    }
  }
  return changed
}

// All Study Log sessions referencing a lecture / component ID.
export function sessionsForLecture(lectureId, studyLog) {
  return (studyLog || []).filter(s => s.lectureId === lectureId)
}

// --- Session ↔ Content/component (milestone 6) ----------------------------
// A session's lecture reference is a real foreign key: STUDY_LOG.
// lecture_content_id points at CONTENT.id (backfilled from the lectureId string
// for legacy rows), so "which sessions referenced this lecture" is queryable.

// All sessions that referenced a content/component row (by its content_ id).
export function sessionsForLectureContent(contentId, studyLog) {
  return (studyLog || []).filter(s => s.lectureContentId === contentId)
}

// One-time backfill: link sessions to their content row by course + lectureId
// string. Idempotent — returns whether anything was linked.
export function backfillLectureLinks(data) {
  const byKey = new Map()
  for (const i of data.content || []) {
    if (i.contentId && i.course && i.id) byKey.set(`${i.course}|${i.contentId}`, i.id)
  }
  let changed = false
  for (const s of data.studyLog || []) {
    if (s.lectureContentId || !s.lectureId || !s.course) continue
    const id = byKey.get(`${s.course}|${s.lectureId}`)
    if (id) { s.lectureContentId = id; changed = true }
  }
  return changed
}

// All Study Log sessions for a course (matched by course name — the FK switch
// to COURSES.id is milestone 4; once studyLog.courseId exists, prefer that).
export function sessionsForCourse(course, studyLog) {
  return (studyLog || []).filter(s => s.course === course)
}

// --- Content ↔ Calendar (milestone 5) -------------------------------------
// A content item (lecture / deadline) and the calendar event row representing
// it are linked by stable row ids in both directions (content.calendarId ↔
// calendarEvent.contentId), backfilled on load from the shared Google calId.

// The calendar event row linked to a content item (by row id, then calId).
export function calendarForContent(content, calendarEvents) {
  if (!content) return null
  if (content.calendarId) {
    for (const ev of calendarEvents || []) if (ev.id === content.calendarId) return ev
  }
  if (content.calId) {
    for (const ev of calendarEvents || []) if (ev.calId && ev.calId === content.calId) return ev
  }
  return null
}

// The content item a calendar event represents (by row id, then calId).
export function contentForCalendar(ev, content) {
  if (!ev) return null
  if (ev.contentId) {
    for (const c of content || []) if (c.id === ev.contentId) return c
  }
  if (ev.calId) {
    for (const c of content || []) if (c.calId && c.calId === ev.calId) return c
  }
  return null
}

// Link a content item and a calendar row by stable id (both directions).
export function linkContentCalendar(content, ev) {
  if (!content || !ev) return
  if (content.id) ev.contentId = content.id
  if (ev.id) content.calendarId = ev.id
}

// One-time backfill: connect content items and calendar rows that share a
// Google calId but have no row-id link yet. Idempotent — returns whether any
// links were made.
export function relinkContentCalendar(data) {
  const calByCalId = new Map()
  for (const ev of data.calendarEvents || []) if (ev.calId) calByCalId.set(ev.calId, ev)
  let changed = false
  for (const c of data.content || []) {
    if (c.calendarId || !c.calId) continue
    const ev = calByCalId.get(c.calId)
    if (ev && !ev.contentId) {
      ev.contentId = c.id
      c.calendarId = ev.id
      changed = true
    }
  }
  return changed
}

// --- Content ↔ Calendar mirror (issue #46) --------------------------------
// A manually added "calendar element" (a scheduled class with a concrete date)
// must behave exactly like an imported timetable event: it has to show up on
// the Calendar tab, in the Weekly Overview menu, as a loggable entry in the
// Daily Planner and on the push to the AcademeMate Google Calendar. Every one
// of those surfaces reads the calendarEvents table, so scheduled content rows
// get a linked row there — linked back by the stable ids
// (content.calendarId ↔ calendarEvent.contentId), the same FK pair milestone 5
// uses for imported rows.

// uid prefix on the calendar rows this layer creates, so they can be recognised
// again after a Drive round-trip (the uid column persists) — e.g. to remove a
// manual class's calendar row when it is edited into a deadline, and to keep it
// across an .ics re-import.
export const CONTENT_MIRROR_UID = 'content:'

export function isContentMirrorEvent(ev) {
  return !!ev && typeof ev.uid === 'string' && ev.uid.startsWith(CONTENT_MIRROR_UID)
}

// A content row is a *scheduled* calendar element when it carries a class date
// (no due date). Deadline rows (a due date, no class date) are handled by the
// calendar views directly and never get a mirror row.
export function isScheduledContentRow(item) {
  return !!item && !!item.course && !!item.date && !item.deadline
}

// Ensure ONE scheduled content row has exactly one linked calendarEvents row
// and keep that row's date/time in step with the content row. Rows that already
// represent the item (row-id link, shared Google calId, or the course+lectureId
// pair imported timetable rows carry) are reused — never duplicated. Mirrors
// created here are tagged with the content: uid; a content row that stops being
// a scheduled calendar element (edited into a deadline) has its mirror dropped.
// Returns the (possibly new) calendarEvents array. Mutates the item to keep its
// calendarId link.
export function syncContentCalendarMirror(item, calendarEvents) {
  const events = Array.isArray(calendarEvents) ? [...calendarEvents] : []
  if (!item) return events

  if (!isScheduledContentRow(item)) {
    // A manual mirror must not survive a row that is no longer a scheduled
    // class. Imported/calendar rows are left alone (they own their lifecycle).
    const kept = events.filter(e => !(isContentMirrorEvent(e) && e.contentId === item.id))
    if (kept.length !== events.length) item.calendarId = null
    return kept
  }

  const ids = new Set(events.map(e => e && e.id).filter(Boolean))
  const adopt = ev => {
    if (item.id) ev.contentId = item.id
    if (ev.id) item.calendarId = ev.id
    return ev
  }

  let ev = null
  if (item.calendarId) ev = events.find(e => e.id === item.calendarId) || null
  if (!ev && item.calId) ev = events.find(e => e.calId === item.calId && (!e.contentId || e.contentId === item.id)) || null
  if (!ev) ev = events.find(e => e.contentId === item.id) || null
  if (!ev && item.contentId) {
    // Imported timetable events carry the generated lecture id as the content
    // row's contentId — link those instead of creating a duplicate row.
    ev = events.find(e => e.course === item.course && e.lectureId === item.contentId && !e.contentId) || null
  }

  if (!ev) {
    ev = {
      id: nextId('cal_', [...ids]),
      date: item.date,
      startTime: item.start || '',
      endTime: item.end || '',
      allDay: !(item.start || item.end),
      summary: item.description || item.topic || item.contentId || 'Class',
      course: item.course,
      courseId: item.courseId || null,
      location: item.location || null,
      description: item.description || item.topic || null,
      source: null,
      uid: `${CONTENT_MIRROR_UID}${item.id || ''}`,
      status: null,
      lectureId: item.contentId || null,
      calId: null,
      contentId: item.id || null,
    }
    events.push(ev)
    adopt(ev)
    return events
  }

  const allDay = !(item.start || item.end)
  ev.date = item.date
  ev.startTime = allDay ? '' : (item.start || '')
  ev.endTime = allDay ? '' : (item.end || '')
  ev.allDay = allDay
  ev.course = item.course
  if (item.location != null) ev.location = item.location
  if (item.contentId) ev.lectureId = item.contentId
  // Mirrors we created also track the summary/description the user typed;
  // imported events keep their original timetable summary.
  if (isContentMirrorEvent(ev)) {
    ev.summary = item.description || item.topic || item.contentId || 'Class'
    ev.description = item.description || item.topic || null
  }
  adopt(ev)
  return events
}

// --- Referential integrity (milestone 7) ----------------------------------
// Deleting an entity cleans up everything that references it, so no dangling
// foreign keys survive. Policies:
//   • Course delete — CASCADE: grade components, syllabus content, calendar
//     events, daily planner rows and study-log sessions of the course are all
//     removed (surfaced in the confirmation before the delete runs).
//   • Content delete — CASCADE its linked calendar row; NULL-OUT the session
//     lecture_content_id refs (history stays, the key goes).
// Returns the replacement arrays for the touched tables.

export function cascadeDeleteCourse(data, courseId, courseName) {
  const isRef = r => courseId ? (r.courseId === courseId || (!r.courseId && r.course === courseName)) : (r.course === courseName)
  return {
    courses: (data.courses || []).filter(c => c.course !== courseName),
    gradeComponents: (data.gradeComponents || []).filter(g => !isRef(g)),
    content: (data.content || []).filter(i => !isRef(i)),
    dailyPlan: (data.dailyPlan || []).filter(r => !isRef(r)),
    studyLog: (data.studyLog || []).filter(s => !isRef(s)),
    calendarEvents: (data.calendarEvents || []).filter(e => !isRef(e)),
  }
}

export function cascadeDeleteContent(data, contentId) {
  const item = byId(data.content, contentId)
  if (!item) return null
  const calendarId = item.calendarId
  return {
    content: (data.content || []).filter(i => i.id !== contentId),
    calendarEvents: (data.calendarEvents || []).filter(e => !(calendarId && e.id === calendarId)),
    studyLog: (data.studyLog || []).map(s => s.lectureContentId === contentId ? { ...s, lectureContentId: null } : s),
  }
}
