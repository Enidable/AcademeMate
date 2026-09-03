// Routing of personal-calendar events (events with no course) into the
// "additional time" categories the Daily Planner, Weekly Overview and Calendar
// share: Work / Other Obligations / Commute / Exercise / Social Obligation.
//
// Two sources decide an event's category, in order of precedence:
//   1. a per-event override chosen by clicking the event in the Calendar tab,
//      persisted by the event's stable row id (survives re-imports);
//   2. built-in heuristics — a work-titled event is "Work", the "Gym Time"
//      calendar feeds "Exercise".
// Events that resolve to nothing stay informational: they appear on the
// Calendar but are not plannable and count nowhere, so the pages all agree.

import { isWorkEvent } from './helpers'

const KEY = 'am_event_categories'

export function loadEventCategoryOverrides() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    return raw && typeof raw === 'object' ? raw : {}
  } catch { return {} }
}

export function saveEventCategoryOverrides(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map || {})) } catch {}
}

// The additional-time category a personal event belongs to, or null when it
// stays informational. `overrides` is the per-event map (optional — reads
// localStorage when omitted).
export function categoryForEvent(e, overrides) {
  if (!e || e.course) return null
  const ov = overrides || loadEventCategoryOverrides()
  if (e.id && ov[e.id]) return ov[e.id]
  if (isWorkEvent(e)) return 'Work'
  if (String(e.source || '').trim() === 'Gym Time') return 'Exercise'
  return null
}
