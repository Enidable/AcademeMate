import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { formatDateShort, getCourseStyle } from '../utils/helpers'
import { inferEventType, typeSymbol } from '../drive/driveClient'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function pad(n) {
  return String(n).padStart(2, '0')
}

function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function mondayOf(dateISO) {
  const d = new Date(dateISO + 'T12:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return toISO(d)
}

function weekDates(mondayISO) {
  const monday = new Date(mondayISO + 'T12:00:00')
  return Array.from({ length: 7 }, (_, i) => toISO(new Date(monday.getTime() + i * 86400000)))
}

function todayISO() {
  return toISO(new Date())
}

function addDaysISO(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return toISO(d)
}

// How many days before its anchor date (class date / due date) an item's work
// can be planned — the "start prepping early" window.
const PLAN_LEAD_DAYS = 5

// Planner rows created from this page are tagged in their notes field so the
// dropdown can find (move / remove) them again after a reload.
const MENU_TAG_PREFIX = 'menu:'
const menuTagOf = menuId => `${MENU_TAG_PREFIX}${menuId}`

const KIND_STYLES = {
  deadline: 'bg-red-100 text-red-700',
  prep: 'bg-orange-100 text-orange-700',
}

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayLabel = iso => `${DOW_SHORT[new Date(iso + 'T12:00:00').getDay()]} ${formatDateShort(iso)}`

// Planning options for one sortable item: every day from PLAN_LEAD_DAYS days
// before its anchor date (class date / due date) up to and including the
// anchor itself — so prep can be sorted into the days *before* the busy day,
// across week boundaries.
function planOptions(anchorISO) {
  const out = []
  for (let i = -PLAN_LEAD_DAYS; i <= 0; i++) out.push(addDaysISO(anchorISO, i))
  return out
}

function ItemCard({ item, assignedDate, today, onAssign }) {
  const isToday = item.fixedDow != null && item.dateISO === today
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${isToday ? 'border-indigo-200 bg-indigo-50/50' : assignedDate ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] shrink-0">{item.symbol}</span>
        <span className={`text-[11px] font-medium truncate flex-1 ${item.kind === 'prep' ? 'text-slate-600' : 'text-slate-700'}`} title={item.title}>{item.title}</span>
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        <span className={`text-[9px] px-1.5 py-px rounded-full font-medium shrink-0 ${KIND_STYLES[item.kind] || 'bg-slate-100 text-slate-500'}`}>{item.kindLabel}</span>
        <span className="text-[10px] text-slate-400 truncate" title={item.when}>{item.when}</span>
      </div>
      <div className="mt-1">
        {/* Classes and appointments are already on their calendar day — show
            the fixed day instead of a dropdown. Prep work and deadline work
            are plannable: sort them into any day from five days before their
            deadline/class date up to that date itself. */}
        {item.fixedDow != null ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
            <span className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-white font-semibold">{DAYS[item.fixedDow]}</span>
            <span className="text-slate-400">on the calendar</span>
          </span>
        ) : (
          <>
            {assignedDate && (
              <span className="text-[10px] text-emerald-600 mr-1" title={`Planned on ${dayLabel(assignedDate)}`}>
                → {dayLabel(assignedDate).split(' ')[0]}
              </span>
            )}
            <select value={assignedDate || ''} onChange={e => onAssign(item, e.target.value)}
              title="Sort this item into a weekday — it is added to that day (and its course) on the Daily Planner"
              className={`w-full text-[10px] border rounded px-1 py-0.5 bg-white cursor-pointer ${assignedDate ? 'border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
              <option value="">Sort to day…</option>
              {(item.options || []).map(iso => (
                <option key={iso} value={iso}>{dayLabel(iso)}</option>
              ))}
            </select>
          </>
        )}
      </div>
    </div>
  )
}

export default function WeeklyOverview() {
  const {
    calendarEvents, deadlines, content, dailyPlan, additionalLog,
    addPlannerTask, deletePlannerTask,
  } = useAppData()

  const [weekKey, setWeekKey] = useState(() => mondayOf(todayISO()))

  const dates = useMemo(() => weekDates(weekKey), [weekKey])
  const currentIsoWeek = useMemo(() => {
    const d = new Date(weekKey + 'T12:00:00')
    const target = new Date(d.getFullYear(), 0, 4)
    target.setDate(target.getDate() - ((target.getDay() + 6) % 7) + 3)
    return 1 + Math.round((d - target) / (7 * 86400000))
  }, [weekKey])

  function moveWeek(delta) {
    const d = new Date(weekKey + 'T12:00:00')
    d.setDate(d.getDate() + delta * 7)
    setWeekKey(toISO(d))
  }

  const toMin = t => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim())
    return m ? +m[1] * 60 + +m[2] : null
  }
  const durHours = e => {
    const s = toMin(e.startTime)
    const en = toMin(e.endTime)
    return s == null || en == null || en <= s ? 0 : Math.round(((en - s) / 60) * 100) / 100
  }
  const dowOf = iso => (new Date(iso + 'T12:00:00').getDay() + 6) % 7

  // The week "menu": every class/appointment, deadline and lecture prep
  // related to this week. Calendar items (classes AND private appointments)
  // sit locked on their own weekday. Prep and deadline work is sortable, and
  // its planning window reaches PLAN_LEAD_DAYS days before the class/due date
  // — so an item whose anchor falls early next week already shows up here.
  const items = useMemo(() => {
    const weekStart = dates[0]
    const weekEnd = dates[6]
    const overlapsWeek = iso => {
      if (!iso) return false
      const from = addDaysISO(iso, -PLAN_LEAD_DAYS)
      return from <= weekEnd && iso >= weekStart
    }
    const out = []
    for (const e of calendarEvents || []) {
      if (!e.date || e.date < weekStart || e.date > weekEnd) continue
      const isCourseItem = !!e.course
      const type = inferEventType(e.summary, e.description)
      out.push({
        menuId: `evt|${e.calId || e.uid || ''}|${e.date}|${e.startTime || ''}`,
        kind: isCourseItem ? 'class' : 'other',
        kindLabel: isCourseItem ? (type ? type.replace(/\b\w/g, c => c.toUpperCase()) : 'Class') : 'Other',
        // Private calendar items (work, gym, …) are not lectures — no type icon.
        symbol: isCourseItem ? typeSymbol(type) : '',
        course: e.course || '',
        title: e.summary,
        when: `${DOW_SHORT[new Date(e.date + 'T12:00:00').getDay()]} ${formatDateShort(e.date)}${e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}`,
        fixedDow: dowOf(e.date),
        dateISO: e.date,
        taskText: e.summary,
        hours: durHours(e),
      })
    }
    for (const i of deadlines || []) {
      // Deadline work can start up to five days before the due date — include
      // it in any week that window touches.
      if (!overlapsWeek(i.deadline)) continue
      out.push({
        menuId: `dl|${i.course || ''}|${i.contentId || i.topic || ''}|${i.deadline}`,
        kind: 'deadline',
        kindLabel: 'Deadline',
        symbol: typeSymbol(i.type || 'deadline'),
        course: i.course || '',
        title: i.description || i.topic || i.contentId || 'Deadline',
        when: `due ${dayLabel(i.deadline)}${i.end ? ` ${i.end}` : ''}`,
        fixedDow: null,
        dateISO: i.deadline,
        options: planOptions(i.deadline),
        taskText: i.description || i.topic || i.contentId || 'Work on deadline',
        hours: 0,
      })
    }
    for (const i of content || []) {
      if (!i.prep || !overlapsWeek(i.date)) continue
      if (String(i.done || '').trim().toLowerCase() === 'done') continue
      out.push({
        menuId: `prep|${i.course || ''}|${i.contentId || ''}|${i.date}`,
        kind: 'prep',
        kindLabel: 'Prep',
        symbol: '🧳',
        course: i.course || '',
        title: i.prep,
        when: `for ${i.description || i.topic || i.contentId || 'class'} (${dayLabel(i.date)}${i.start ? ` ${i.start}` : ''})`,
        fixedDow: null,
        dateISO: i.date,
        options: planOptions(i.date),
        taskText: `Prep: ${i.prep}`,
        hours: 0,
      })
    }
    return out.sort((a, b) =>
      String(a.fixedDow ?? 9).localeCompare(String(b.fixedDow ?? 9), undefined, { numeric: true }) ||
      (a.when || '').localeCompare(b.when || ''))
  }, [calendarEvents, deadlines, content, dates])

  // Current day assignment per menu item, read back from the planner rows.
  const assignedByMenuId = useMemo(() => {
    const m = new Map()
    for (const r of dailyPlan || []) {
      if (!r.notes || !r.notes.startsWith(MENU_TAG_PREFIX)) continue
      m.set(r.notes.slice(MENU_TAG_PREFIX.length), r)
    }
    return m
  }, [dailyPlan])

  // Sorting an item into a day removes any previous placement of the same
  // item and writes one planner task on the chosen date under its course. An
  // empty selection un-plans the item again. The chosen day may lie outside
  // the viewed week (prep windows reach back five days before the class).
  function assign(item, isoDate) {
    const tag = menuTagOf(item.menuId)
    for (const r of (dailyPlan || []).filter(x => x.notes === tag)) deletePlannerTask(r.id)
    if (!isoDate) return
    addPlannerTask({
      date: isoDate,
      course: item.course || 'Other University Stuff',
      task: item.taskText,
      plannedHours: item.hours || 0,
      notes: tag,
    })
  }

  // Table columns: one per course that has items this week; private items
  // without a course land in a trailing "Other" column.
  const columns = useMemo(() => {
    const byCourse = new Map()
    for (const item of items) {
      const col = item.course || '__other'
      if (!byCourse.has(col)) byCourse.set(col, [])
      byCourse.get(col).push(item)
    }
    const cols = [...byCourse.entries()]
    cols.sort((a, b) => {
      if (a[0] === '__other') return 1
      if (b[0] === '__other') return -1
      return a[0].localeCompare(b[0])
    })
    return cols.map(([course, list]) => ({
      course,
      label: course === '__other' ? 'Other' : course,
      style: getCourseStyle(course === '__other' ? '' : course),
      items: list,
    }))
  }, [items])

  const plannedCount = items.filter(i => i.fixedDow == null && assignedByMenuId.has(i.menuId)).length

  // Compact mirror of the Daily Planner for this week: planned hours per
  // course per day (study AND additional combined), so free capacity is
  // visible while sorting the menu. Read-only — editing stays in the planner.
  const plannerMatrix = useMemo(() => {
    const byCourse = new Map()
    const rowOf = course => {
      if (!byCourse.has(course)) {
        byCourse.set(course, {
          hours: Array.from({ length: 7 }, () => 0),
          tasks: Array.from({ length: 7 }, () => []),
        })
      }
      return byCourse.get(course)
    }
    for (const r of dailyPlan || []) {
      const dow = dates.indexOf(r.date)
      if (dow < 0) continue
      const row = rowOf(r.course || 'Other University Stuff')
      row.hours[dow] += r.plannedHours || r.actualHours || 0
      if (r.task) row.tasks[dow].push(r.task)
    }
    for (const a of additionalLog || []) {
      const dow = dates.indexOf(a.date)
      if (dow < 0) continue
      const row = rowOf(a.category || 'Other Obligations')
      row.hours[dow] += a.hours || 0
      if (a.task) row.tasks[dow].push(a.task)
    }
    // Timetable / imported calendar events carry their own duration: course
    // classes land on their course row, private imports (Gym Time, work, …)
    // on a row named after their source calendar.
    for (const e of calendarEvents || []) {
      const dow = dates.indexOf(e.date)
      if (dow < 0) continue
      const h = durHours(e)
      if (h <= 0) continue
      const course = e.course || ((e.source || '').trim() === 'Gym Time' ? 'Exercise' : (e.source || '').trim())
      if (!course) continue
      const row = rowOf(course)
      row.hours[dow] += h
      row.tasks[dow].push(e.summary || course)
    }
    const rows = [...byCourse.entries()]
      .map(([course, data]) => ({ course, ...data, total: data.hours.reduce((s, h) => s + h, 0) }))
      .sort((a, b) => b.total - a.total)
    const dayTotals = Array.from({ length: 7 }, (_, d) => rows.reduce((s, r) => s + r.hours[d], 0))
    return { rows, dayTotals, weekTotal: dayTotals.reduce((s, h) => s + h, 0) }
  }, [dailyPlan, additionalLog, calendarEvents, dates])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => moveWeek(-1)}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">← Prev</button>
          <span className="text-sm font-medium text-slate-700">
            Week {currentIsoWeek} — {formatDateShort(dates[0])} – {formatDateShort(dates[6])}
          </span>
          <button onClick={() => moveWeek(1)}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">Next →</button>
          <button onClick={() => setWeekKey(mondayOf(todayISO()))}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">Today</button>
        </div>
        <div className="text-sm px-3 py-1.5 rounded-full bg-slate-100 text-slate-600">
          {items.length} item{items.length === 1 ? '' : 's'} on the menu · {plannedCount} sorted
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
        <p className="text-xs text-slate-500 mb-3">
          Everything on the plate this week, one column per course. Classes and appointments already sit on their calendar day; prep and deadline work can be sorted into any day from five days before its class/due date up to that date — even across week boundaries. Sorting adds the item to that day (and its course) on the Daily Planner; changing the day moves it, clearing it removes it again.
        </p>
        {items.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">Nothing scheduled this week yet.</div>
        ) : (
          <table className="w-full table-fixed border-collapse min-w-[720px]">
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col.course} className="border-b border-slate-200 pb-2 pr-3 last:pr-0 align-bottom">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${col.style.dot}`} style={col.style.dotCss} />
                      <span className="text-xs font-semibold text-slate-700 truncate" title={col.label}>{col.label}</span>
                      <span className="text-[9px] text-slate-300 shrink-0">{col.items.length}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {columns.map(col => (
                  <td key={col.course} className="align-top pt-2 pr-3 last:pr-0">
                    <div className="space-y-1.5">
                      {col.items.map(item => (
                        <ItemCard key={item.menuId} item={item} today={todayISO()}
                          assignedDate={assignedByMenuId.get(item.menuId)?.date || null}
                          onAssign={assign} />
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Planned hours this week</h3>
          <span className="text-xs text-slate-400">
            Mirror of the Daily Planner — study + additional combined · week total{' '}
            <span className="font-semibold text-slate-600 tabular-nums">{plannerMatrix.weekTotal.toFixed(2)}h</span>
          </span>
        </div>
        {plannerMatrix.rows.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-sm">Nothing planned yet — sort items above or plan directly in the Daily Planner.</div>
        ) : (
          <table className="w-full table-fixed text-xs border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-2 py-1.5 font-medium text-slate-500 w-52">Course</th>
                {DAYS.map((day, i) => (
                  <th key={day} className={`px-1 py-1.5 font-medium text-center ${dates[i] === todayISO() ? 'text-indigo-700' : 'text-slate-500'}`}>{day}</th>
                ))}
                <th className="text-right px-2 py-1.5 font-medium text-slate-500 w-16">Total</th>
              </tr>
            </thead>
            <tbody>
              {plannerMatrix.rows.map(r => {
                const style = getCourseStyle(r.course)
                return (
                  <tr key={r.course} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1.5 pr-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} style={style.dotCss} />
                        <span className="truncate text-slate-600" title={r.course}>{r.course}</span>
                      </div>
                    </td>
                    {r.hours.map((h, d) => (
                      <td key={d} className={`px-1 py-1 text-center tabular-nums text-slate-600 ${dates[d] === todayISO() ? 'bg-indigo-50/60' : ''}`}
                        title={r.tasks[d].length ? r.tasks[d].join('\n') : undefined}>
                        {h > 0 ? h.toFixed(2).replace(/\.?0+$/, '') : ''}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right tabular-nums font-medium text-slate-700">{r.total > 0 ? `${r.total.toFixed(2)}h` : ''}</td>
                  </tr>
                )
              })}
              <tr className="border-t border-slate-200 bg-slate-50 font-medium text-slate-700">
                <td className="px-2 py-1.5">Day total</td>
                {plannerMatrix.dayTotals.map((h, d) => (
                  <td key={d} className={`px-1 py-1.5 text-center tabular-nums ${dates[d] === todayISO() ? 'bg-indigo-100/60' : ''}`}>
                    {h > 0 ? h.toFixed(2) : ''}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right tabular-nums">{plannerMatrix.weekTotal.toFixed(2)}h</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
