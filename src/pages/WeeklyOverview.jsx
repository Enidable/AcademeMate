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

// Planner rows created from this page are tagged in their notes field so the
// dropdown can find (move / remove) them again after a reload.
const MENU_TAG_PREFIX = 'menu:'
const menuTagOf = menuId => `${MENU_TAG_PREFIX}${menuId}`

const KIND_STYLES = {
  deadline: 'bg-red-100 text-red-700',
  prep: 'bg-orange-100 text-orange-700',
}

function ItemCard({ item, assignedDate, dates, today, onAssign }) {
  const selected = assignedDate ? String(dates.indexOf(assignedDate)) : ''
  const isToday = item.fixedDow != null && dates[item.fixedDow] === today
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
            are plannable: sort them into a weekday freely. */}
        {item.fixedDow != null ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
            <span className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-white font-semibold">{DAYS[item.fixedDow]}</span>
            <span className="text-slate-400">on the calendar</span>
          </span>
        ) : (
          <>
            {assignedDate && (
              <span className="text-[10px] text-emerald-600 mr-1" title={`Planned on ${formatDateShort(assignedDate)}`}>
                → {DAYS[dates.indexOf(assignedDate)]}
              </span>
            )}
            <select value={selected} onChange={e => onAssign(item, e.target.value)}
              title="Sort this item into a weekday — it is added to that day (and its course) on the Daily Planner"
              className={`w-full text-[10px] border rounded px-1 py-0.5 bg-white cursor-pointer ${assignedDate ? 'border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
              <option value="">Sort to day…</option>
              {DAYS.map((d, i) => <option key={d} value={i}>{d} {formatDateShort(dates[i])}</option>)}
            </select>
          </>
        )}
      </div>
    </div>
  )
}

export default function WeeklyOverview() {
  const {
    calendarEvents, deadlines, content, dailyPlan,
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

  // The week "menu": every class/appointment, deadline and lecture prep of the
  // selected week. Calendar items (classes AND private appointments) sit
  // locked on their own weekday; prep and deadline work is sortable into any
  // day of the week.
  const items = useMemo(() => {
    const inWeek = d => d && dates.includes(d)
    const out = []
    for (const e of calendarEvents || []) {
      if (!inWeek(e.date)) continue
      const isCourseItem = !!e.course
      const type = inferEventType(e.summary, e.description)
      out.push({
        menuId: `evt|${e.calId || e.uid || ''}|${e.date}|${e.startTime || ''}`,
        kind: isCourseItem ? 'class' : 'other',
        kindLabel: isCourseItem ? (type ? type.replace(/\b\w/g, c => c.toUpperCase()) : 'Class') : 'Other',
        symbol: typeSymbol(type),
        course: e.course || '',
        title: e.summary,
        when: `${formatDateShort(e.date)}${e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}`,
        fixedDow: dowOf(e.date),
        taskText: e.summary,
        hours: durHours(e),
      })
    }
    for (const i of deadlines || []) {
      if (!inWeek(i.deadline)) continue
      out.push({
        menuId: `dl|${i.course || ''}|${i.contentId || i.topic || ''}|${i.deadline}`,
        kind: 'deadline',
        kindLabel: 'Deadline',
        symbol: typeSymbol(i.type || 'deadline'),
        course: i.course || '',
        title: i.description || i.topic || i.contentId || 'Deadline',
        when: `due ${formatDateShort(i.deadline)}${i.end ? ` ${i.end}` : ''}`,
        fixedDow: null,
        taskText: i.description || i.topic || i.contentId || 'Work on deadline',
        hours: 0,
      })
    }
    for (const i of content || []) {
      if (!i.prep || !inWeek(i.date)) continue
      if (String(i.done || '').trim().toLowerCase() === 'done') continue
      out.push({
        menuId: `prep|${i.course || ''}|${i.contentId || ''}|${i.date}`,
        kind: 'prep',
        kindLabel: 'Prep',
        symbol: '🧳',
        course: i.course || '',
        title: i.prep,
        when: `for ${i.description || i.topic || i.contentId || 'class'} (${formatDateShort(i.date)}${i.start ? ` ${i.start}` : ''})`,
        fixedDow: null,
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

  // Sorting an item into a weekday removes any previous placement of the same
  // item and writes one planner task on the chosen day under its course. An
  // empty selection un-plans the item again.
  function assign(item, dowStr) {
    const tag = menuTagOf(item.menuId)
    for (const r of (dailyPlan || []).filter(x => x.notes === tag)) deletePlannerTask(r.id)
    if (dowStr === '') return
    addPlannerTask({
      date: dates[parseInt(dowStr, 10)],
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
          Everything on the plate this week, one column per course. Classes and appointments already sit on their calendar day; prep work and deadline work can be sorted into a weekday with the dropdown — it is added automatically to that day (and its course) on the Daily Planner. Changing the day moves it; clearing it removes it again.
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
                        <ItemCard key={item.menuId} item={item} dates={dates} today={todayISO()}
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
    </div>
  )
}
