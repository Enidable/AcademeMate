// User-defined "keyword -> course" rules for the calendar import (#43).
// A calendar event whose summary/description contains the keyword is sorted
// into the mapped course — even when the event doesn't carry a course code,
// name or abbreviation (e.g. "Honours" not present in the uni .ics files).
// Rules are persisted per-browser in localStorage, like course colors.

const KEY = 'am_course_keywords'

export function loadCourseKeywords() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(raw) ? raw.filter(r => r.keyword && r.course) : []
  } catch { return [] }
}

export function saveCourseKeywords(rules) {
  try { localStorage.setItem(KEY, JSON.stringify(rules || [])) } catch {}
}

// Course name whose keyword appears in an event's text, or null. Rules are
// evaluated in order; the first keyword that matches wins.
export function matchKeywordCourse(summary, description, rules) {
  const text = `${summary || ''} ${description || ''}`.toLowerCase()
  for (const r of rules || []) {
    const kw = String(r.keyword || '').trim().toLowerCase()
    if (kw && text.includes(kw)) return r.course || null
  }
  return null
}
