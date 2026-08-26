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
  class: 'bg-indigo-100 text-indigo-700',
  deadline: 'bg-red-100 text-red-700',
  prep: 'bg-orange-100 text-orange-700',
}

function MenuRow({ item, assignedDate, dates, today, onAssign }) {
  const style = getCourseStyle(item.course)
  const selected = assignedDate ? String(dates.indexOf(assignedDate)) : ''
  const doneToday = assignedDate === today
  return (
    <div className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg border ${doneToday ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-100 hover:bg-slate-50'}`}>
      <span className="text-[11px] shrink-0">{item.symbol}</span>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} style={style.dotCss} title={item.course || 'No course'} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-medium truncate ${item.kind === 'prep' ? 'text-slate-600' : 'text-slate-700'}`} title={item.title}>{item.title}</span>
          <span className={`text-[9px] px-1.5 py-px rounded-full shrink-0 font-medium ${KIND_STYLES[item.kind]}`}>{item.kindLabel}</span>
        </div>
        <div className="text-[10px] text-slate-400 truncate">{item.when}</div>
      </div>
      {assignedDate && (
        <span className="text-[10px] text-emerald-600 shrink-0" title={`Planned on ${formatDateShort(assignedDate)}`}>
          → {DAYS[dates.indexOf(assignedDate)]}
        </span>
      )}
      <select value={selected} onChange={e => onAssign(item, e.target.value)}
        title="Sort this item into a weekday — it is added to that day (and its course) on the Daily Planner"
        className={`shrink-0 text-[10px] border rounded px-1.5 py-1 bg-white cursor-pointer ${assignedDate ? 'border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
        <option value="">Sort to day…</option>
        {DAYS.map((d, i) => <option key={d} value={i}>{d} {formatDateShort(dates[i])}</option>)}
      </select>
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

  // The week "menu": every class, deadline and lecture prep of the selected
  // week — what it is, when it takes place / is due, and when its work has to
  // be finished.
  const items = useMemo(() => {
    const inWeek = d => d && dates.includes(d)
    const out = []
    for (const e of calendarEvents || []) {
      if (!inWeek(e.date)) continue
      const type = inferEventType(e.summary, e.description)
      out.push({
        menuId: `evt|${e.calId || e.uid || ''}|${e.date}|${e.startTime || ''}`,
        kind: 'class',
        kindLabel: type ? type.replace(/\b\w/g, c => c.toUpperCase()) : 'Class',
        symbol: typeSymbol(type),
        course: e.course || '',
        title: e.summary,
        when: `${formatDateShort(e.date)}${e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}`,
        sortKey: `${dowOf(e.date)}|${e.startTime || '99'}`,
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
        sortKey: `${dowOf(i.deadline)}|${i.end || i.start || '99'}`,
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
        sortKey: `${dowOf(i.date)}|${i.start || '99'}|p`,
        taskText: `Prep: ${i.prep}`,
        hours: 0,
      })
    }
    return out.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
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

  const plannedCount = items.filter(i => assignedByMenuId.has(i.menuId)).length

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

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-xs text-slate-500 mb-3">
          Everything on the plate this week: classes, deadlines and lecture preps. Use each dropdown to sort an item into a weekday — it is added automatically to that day (and its course) on the Daily Planner. Changing the day moves it; picking “Sort to day…” again with no day removes it.
        </p>
        {items.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">Nothing scheduled this week yet.</div>
        ) : (
          <div className="space-y-1">
            {items.map(item => (
              <MenuRow key={item.menuId} item={item} dates={dates} today={todayISO()}
                assignedDate={assignedByMenuId.get(item.menuId)?.date || null}
                onAssign={assign} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
