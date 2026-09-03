import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { getAverageWeeklyHours } from '../data/parseDaily'
import { isoWeekOf } from '../data/normalize'
import { getCourseStyle, formatDateShort, isCourseActive, sessionCategoryForType, durationBetween, nowTime, displayNotes, mergeNotesWithTag, lectureIdFromNotes, isWorkEvent, slotIndexOfContent } from '../utils/helpers'
import { inferEventType } from '../drive/driveClient'
import WeekGrid from '../components/WeekGrid'
import CourseSelect from '../components/CourseSelect'
import HoverCard from '../components/HoverCard'
import { ADDITIONAL_CATEGORIES } from '../config'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ADDITIONAL_SET = new Set(ADDITIONAL_CATEGORIES)

// The "Work" recogniser lives in utils/helpers so the Weekly Overview and the
// Daily Planner route identical work events to the same additional-time row.

// Label/value rows used inside the hover detail cards.
function DetailList({ items }) {
  return (
    <div className="space-y-0.5">
      {items.map(([label, value]) =>
        value === null || value === undefined || value === '' ? null : (
          <div key={label} className="flex gap-2 text-[11px] leading-snug">
            <span className="w-20 shrink-0 text-slate-400">{label}</span>
            <span className="min-w-0 flex-1 break-words text-slate-700">{value}</span>
          </div>
        )
      )}
    </div>
  )
}

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
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getTime() + i * 86400000)
    return toISO(d)
  })
}

function todayISO() {
  return toISO(new Date())
}

function TaskRow({ row, hoursOf, onToggle, onEdit, onDelete, overdue, planSessions }) {
  const planned = row.plannedHours != null ? row.plannedHours : row.hours
  const actual = row.actualHours != null && row.actualHours > 0 ? row.actualHours : null
  const status = row.done ? 'Done' : overdue ? 'Overdue' : 'Open'
  const linked = planSessions ? planSessions[row.id] : null
  return (
    <HoverCard card={
      <div className="space-y-1.5">
        <div className="font-medium leading-snug break-words text-slate-800">{row.task || '—'}</div>
        <DetailList items={[
          ['Course', row.course],
          ['Date', formatDateShort(row.date)],
          ['Planned', planned ? `${planned}h` : null],
          ['Actual', actual != null ? `${actual}h` : null],
          ['Logged', linked?.length ? `${linked.reduce((t, s) => t + (s.durationHours || 0), 0).toFixed(2)}h · ${linked.length} session${linked.length === 1 ? '' : 's'}` : null],
          ['Status', status],
          ['Notes', displayNotes(row.notes)],
        ]} />
      </div>
    }>
      <div className={`group flex items-center gap-1 rounded px-0.5 py-0.5 hover:bg-slate-100/70 ${overdue ? 'bg-orange-50/70' : ''}`}>
        <input type="checkbox" checked={!!row.done} onChange={() => onToggle(row)}
          className="h-3 w-3 accent-indigo-600 cursor-pointer shrink-0" />
        <span className={`text-[10px] leading-tight flex-1 min-w-0 truncate ${row.done ? 'line-through text-slate-400' : overdue ? 'text-orange-700 font-medium' : 'text-slate-700'}`}>
          {row.task || '—'}
        </span>
        <span className={`text-[10px] shrink-0 tabular-nums ${overdue ? 'text-orange-500' : 'text-slate-500'}`}>{hoursOf(row).toFixed(2)}h</span>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
          <button onClick={() => onEdit(row)} className="text-[9px] px-1 text-slate-400 hover:text-slate-700 cursor-pointer" title="Edit">✎</button>
          <button onClick={onDelete} className="text-[10px] text-red-400 hover:text-red-600 cursor-pointer" title="Delete">×</button>
        </div>
      </div>
    </HoverCard>
  )
}

// Read-only entry derived from a calendar event (lecture, tutorial, imported
// personal calendar item). Course classes get a checkbox that opens the
// session logger pre-filled with the class's known data. Shows the syllabus
// note under the summary.
function AutoTask({ entry, onLog, onLogAdditional }) {
  return (
    <HoverCard card={
      <div className="space-y-1.5">
        <div className="font-medium leading-snug break-words text-slate-800">{entry.task}</div>
        <DetailList items={[
          ['Course', entry.course],
          ['Date', formatDateShort(entry.date)],
          ['Time', (entry.startTime || entry.endTime) ? `${entry.startTime || '?'} – ${entry.endTime || '?'}` : null],
          ['Duration', entry.hours > 0 ? `${entry.hours}h` : null],
          ['Lecture ID', entry.lectureId || null],
          ['Note', entry.note],
        ]} />
      </div>
    }>
      <div className={`flex items-start gap-1 px-0.5 py-0.5 ${entry.logged ? 'opacity-60' : ''} ${entry.attend === false ? 'opacity-40' : ''}`}>
        {entry.loggable ? (
          entry.isAdditional ? (
            <input type="checkbox" checked={!!entry.logged} onChange={() => onLogAdditional(entry)}
              title="Log this as additional time (work / exercise / obligations) with its own logging window"
              className="h-3 w-3 accent-amber-600 cursor-pointer shrink-0 mt-0.5" />
          ) : (
            <input type="checkbox" checked={!!entry.logged} onChange={() => onLog(entry)}
              title="Log this class as a study session (pre-filled with its course, times, location and lecture ID)"
              className="h-3 w-3 accent-indigo-600 cursor-pointer shrink-0 mt-0.5" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className={`text-[10px] leading-tight truncate ${entry.logged ? 'line-through text-slate-400' : entry.isDeadline ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
            {entry.task}
            {entry.prep && (
              <span className="ml-1 inline-block px-1 rounded bg-red-600 text-white text-[8px] font-semibold align-middle" title={`Prep required: ${entry.prep}`}>Prep</span>
            )}
          </div>
          {entry.note && <div className="text-[9px] leading-tight text-slate-400 truncate">{entry.note}</div>}
        </div>
        <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
          {entry.isDeadline ? (entry.startTime ? `due ${entry.startTime}` : '') : (entry.hours > 0 ? `${entry.hours.toFixed(2)}h` : '')}
        </span>
      </div>
    </HoverCard>
  )
}

function EditForm({ row, form, setForm, onSave, onCancel }) {
  return (
    <div className="flex flex-col gap-1 border border-slate-300 rounded bg-white p-1">
      <input value={form.task} onChange={e => setForm(f => ({ ...f, task: e.target.value }))}
        onKeyDown={e => { if (e.key === 'Enter') onSave(row.id); if (e.key === 'Escape') onCancel() }}
        autoFocus className="w-full text-[10px] px-1 py-0.5 border border-slate-200 rounded" placeholder="Task" />
      <div className="flex items-center gap-1">
        <input value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') onSave(row.id) }}
          className="w-12 text-[10px] px-1 py-0.5 border border-slate-200 rounded text-center" placeholder="0" inputMode="decimal" />
        <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') onSave(row.id) }}
          className="flex-1 text-[10px] px-1 py-0.5 border border-slate-200 rounded" placeholder="Note" />
        <button onClick={() => onSave(row.id)} className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-white rounded cursor-pointer">✓</button>
        <button onClick={onCancel} className="text-[10px] px-1.5 py-0.5 border border-slate-200 text-slate-500 rounded cursor-pointer">×</button>
      </div>
    </div>
  )
}

function AddCellForm({ form, setForm, onSave, onCancel }) {
  return (
    <div className="flex flex-col gap-1 border border-slate-300 rounded bg-white p-1">
      <input value={form.task} onChange={e => setForm(f => ({ ...f, task: e.target.value }))}
        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
        autoFocus className="w-full text-[10px] px-1 py-0.5 border border-slate-200 rounded" placeholder="Task" />
      <div className="flex items-center gap-1">
        <input value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') onSave() }}
          className="w-12 text-[10px] px-1 py-0.5 border border-slate-200 rounded text-center" placeholder="0" inputMode="decimal" />
        <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') onSave() }}
          className="flex-1 text-[10px] px-1 py-0.5 border border-slate-200 rounded" placeholder="Note" />
        <button onClick={onSave} className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-white rounded cursor-pointer">✓</button>
        <button onClick={onCancel} className="text-[10px] px-1.5 py-0.5 border border-slate-200 text-slate-500 rounded cursor-pointer">×</button>
      </div>
    </div>
  )
}

// Always-visible quick-add field for a course/day cell: type a task (and an
// hour estimate), press Enter — or simply click away — and it saves, no click
// needed first. Like the syllabus inline fields, blurring commits the value.
function QuickAddCell({ onSave }) {
  const [task, setTask] = useState('')
  const [hours, setHours] = useState('')
  const wrapRef = useRef(null)
  const submit = () => {
    if (!task.trim()) return
    onSave(task.trim(), parseFloat(hours) || 0)
    setTask('')
    setHours('')
  }
  // Blurring the cell saves what was typed — unless focus moved to the
  // neighbouring field of the same cell (task ⇄ hours), which must not
  // commit half an entry.
  const onBlurCapture = e => {
    if (wrapRef.current && wrapRef.current.contains(e.relatedTarget)) return
    submit()
  }
  return (
    <div ref={wrapRef} onBlurCapture={onBlurCapture} className="flex items-center gap-0.5">
      <input value={task} onChange={e => setTask(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        className="flex-1 min-w-0 text-[10px] px-1 py-0.5 bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-400 focus:bg-white rounded outline-none placeholder:text-slate-300"
        placeholder="Type to plan…" />
      <input value={hours} onChange={e => setHours(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        className="w-7 shrink-0 text-[10px] px-0.5 py-0.5 bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-400 focus:bg-white rounded text-center outline-none placeholder:text-slate-300"
        placeholder="h" inputMode="decimal" title="Estimated hours (optional)" />
    </div>
  )
}

function CourseRow({
  course, style, isActive, total, isEmptyExtra, dates, today,
  cellTasks, autoTasks, hoursOf, editId, editForm, setEditForm, addCell, cellForm, setCellForm,
  onEdit, onSaveEdit, onCancelEdit, onToggle, onDelete, onOpenAdd, onSaveAdd, onCancelAdd, onRemoveExtraRow,
  onQuickAdd, onLogAuto, onLogAdditional, readOnly, draggable, dragging, onRowDragStart, onRowDragOver, onRowDrop,
  planSessions,
}) {
  return (
    <tr
      onDragOver={onRowDragOver}
      onDrop={onRowDrop}
      className={`border-b border-slate-100 ${style.soft} ${dragging ? 'opacity-40' : ''}`}
      style={style.softCss}>
      <td className="px-3 py-2">
        <HoverCard card={
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} style={style.dotCss} />
              <span className="font-medium leading-snug break-words text-slate-800">{course}</span>
            </div>
            <DetailList items={[
              ['Status', isActive ? 'Active' : 'Inactive'],
              ['Week total', total > 0 ? `${total.toFixed(2)}h` : null],
            ]} />
          </div>
        }>
          <div className="flex items-center gap-2 pr-11">
            <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} style={style.dotCss} />
            <span className="truncate font-medium text-slate-700">{course}</span>
            {isActive && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">active</span>
            )}
            {isEmptyExtra && (
              <button onClick={() => onRemoveExtraRow(course)}
                className="text-[10px] text-slate-300 hover:text-red-400 cursor-pointer shrink-0" title="Remove empty row">×</button>
            )}
          </div>
        </HoverCard>
      </td>
      {dates.map(date => (
        <td key={date} className={`px-1.5 py-1 align-top ${date === today ? 'bg-indigo-50/60' : ''}`}>
          <div className="flex flex-col gap-0.5 min-h-[24px]">
            {cellTasks(course, date).map(row => (
              editId === row.id
                ? <EditForm key={row.id} row={row} form={editForm} setForm={setEditForm} onSave={onSaveEdit} onCancel={onCancelEdit} />
                : <TaskRow key={row.id} row={row} hoursOf={hoursOf} onToggle={onToggle} onEdit={onEdit}
                    onDelete={() => onDelete(row.id)} overdue={!row.done && date < today} planSessions={planSessions} />
            ))}
            {(autoTasks ? autoTasks(course, date) : []).filter(entry => !(entry.isAdditional && entry.logged)).map(entry => (
              <AutoTask key={entry.id} entry={entry} onLog={onLogAuto} onLogAdditional={onLogAdditional} />
            ))}
            {addCell?.course === course && addCell?.date === date ? (
              <AddCellForm form={cellForm} setForm={setCellForm} onSave={onSaveAdd} onCancel={onCancelAdd} />
            ) : readOnly ? null : (
              <div className="flex items-center gap-0.5 group/add">
                <button onClick={() => onOpenAdd(course, date)}
                  className="text-[10px] text-slate-300 hover:text-slate-500 cursor-pointer leading-none shrink-0 w-3"
                  title="Add with note…">+</button>
                <QuickAddCell onSave={(task, h) => onQuickAdd(course, date, task, h)} />
              </div>
            )}
          </div>
        </td>
      ))}
      <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-700">{total > 0 ? `${total.toFixed(2)}h` : ''}</td>
      <td className="w-6">
        {draggable && (
          <span
            draggable
            onDragStart={onRowDragStart}
            onDragEnd={onRowDrop}
            title="Drag to reorder courses"
            className="inline-flex items-center justify-center p-1.5 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500">
            <span className="grid grid-cols-2 gap-[2px]">
              <span className="h-[3px] w-[3px] rounded-full bg-current" />
              <span className="h-[3px] w-[3px] rounded-full bg-current" />
              <span className="h-[3px] w-[3px] rounded-full bg-current" />
              <span className="h-[3px] w-[3px] rounded-full bg-current" />
            </span>
          </span>
        )}
      </td>
    </tr>
  )
}

function RescheduleRow({ row, options, onReschedule, onSkip }) {
  const [day, setDay] = useState(options[0]?.iso || '')
  return (
    <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
      <span className={`w-2 h-2 rounded-full shrink-0 ${getCourseStyle(row.course).dot}`} style={getCourseStyle(row.course).dotCss} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-700 truncate" title={row.task}>{row.task}</p>
        <p className="text-[10px] text-slate-400">{row.course} · was planned {formatDateShort(row.date)}</p>
      </div>
      <select value={day} onChange={e => setDay(e.target.value)}
        className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white cursor-pointer">
        {options.map(o => <option key={o.iso} value={o.iso}>{o.label}</option>)}
      </select>
      <button onClick={() => { onReschedule(day); onSkip() }}
        className="text-xs px-2.5 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer shrink-0">Reschedule</button>
      <button onClick={onSkip} title="Skip this item"
        className="text-sm text-slate-300 hover:text-red-500 cursor-pointer shrink-0">×</button>
    </div>
  )
}

export default function DailyPlanner({ onLogTask, onLogAdditional }) {
  const {
    dailyPlan, weeklyHours, masterCourses, calendarEvents, deadlines, additionalLog, content, inputLog,
    addPlannerTask, updatePlannerTask, deletePlannerItem, reconcilePastDays,
    addAdditionalEntry, updateAdditionalEntry, deleteAdditionalEntry,
    liveSession, stopLiveSession,
  } = useAppData()
  const [weekKey, setWeekKey] = useState(() => mondayOf(todayISO()))
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({ task: '', hours: '', notes: '' })
  const [addCell, setAddCell] = useState(null)
  const [cellForm, setCellForm] = useState({ task: '', hours: '', notes: '' })
  const [extraRows, setExtraRows] = useState([])
  const [rowCourse, setRowCourse] = useState('')

  // --- Course row ordering (#22): drag course rows into the sequence you
  // want. Persisted in localStorage so it applies across weeks and reloads.
  // Courses never arranged fall back to alphabetical below the arranged ones.
  const COURSE_ORDER_KEY = 'am_planner_course_order'
  const [courseOrder, setCourseOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem(COURSE_ORDER_KEY)) || [] } catch { return [] }
  })
  const [dragCourse, setDragCourse] = useState(null)
  function persistCourseOrder(list) {
    setCourseOrder(list)
    try { localStorage.setItem(COURSE_ORDER_KEY, JSON.stringify(list)) } catch {}
  }

  const today = todayISO()
  const dates = weekDates(weekKey)
  const weekDatesObj = useMemo(() => dates.map(ds => new Date(ds + 'T12:00:00')), [dates])
  const currentIsoWeek = isoWeekOf(weekKey)?.week

  // Past-day reconciliation (#2): unticked entries from before today lose
  // their planned hours (written back to the sheet). Runs whenever the day
  // changes / the page mounts.
  useEffect(() => {
    reconcilePastDays(today)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])

  // --- Reschedule popup (#2): unticked items from past days are offered for
  // rescheduling on the next visit. Dismissed items are remembered so the
  // popup only nags about NEW stale items.
  const DISMISS_KEY = 'am_resched_dismissed'
  const loadDismissed = () => {
    try { return JSON.parse(localStorage.getItem(DISMISS_KEY)) || [] } catch { return [] }
  }
  const [dismissed, setDismissed] = useState(loadDismissed)
  const [reschedOpen, setReschedOpen] = useState(false)

  const staleItems = useMemo(() => {
    // Only the past WEEK is offered for rescheduling — older entries stay as
    // they are. Calendar-sorted class rows (menu:evt) are excluded entirely:
    // a lecture you missed cannot be "rescheduled", it just loses its hours.
    const cutoff = toISO(new Date(new Date(today + 'T12:00:00').getTime() - 7 * 86400000))
    return (dailyPlan || [])
      .filter(r =>
        r.date && r.date < today && r.date >= cutoff &&
        !r.done && (r.task || '').trim() &&
        !(r.notes || '').startsWith('menu:evt') &&
        !dismissed.includes(r.id))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [dailyPlan, today, dismissed])

  useEffect(() => {
    if (staleItems.length > 0 && !reschedOpen) setReschedOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staleItems.length])

  function persistDismissed(ids) {
    setDismissed(prev => {
      const next = [...prev, ...ids]
      try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-500))) } catch {}
      return next
    })
  }

  function rescheduleItem(row, newDate) {
    if (!newDate || newDate === row.date) return
    updatePlannerTask(row.id, { date: newDate })
  }

  const rescheduleOptions = useMemo(() => {
    const out = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(new Date(today + 'T12:00:00').getTime() + i * 86400000)
      const iso = toISO(d)
      out.push({ iso, label: `${DAYS[(d.getDay() + 6) % 7]} ${formatDateShort(iso)}` })
    }
    return out
  }, [today])

  const byDate = useMemo(() => {
    const map = {}
    for (const r of dailyPlan) {
      if (!r.date) continue
      if (!map[r.date]) map[r.date] = []
      map[r.date].push(r)
    }
    return map
  }, [dailyPlan])

  // Additional Time Log rows (work / other obligations / commute / exercise).
  const addByDate = useMemo(() => {
    const map = {}
    for (const a of additionalLog) {
      if (!a.date) continue
      if (!map[a.date]) map[a.date] = []
      map[a.date].push(a)
    }
    return map
  }, [additionalLog])

  // Study sessions linked to planner items (plan_id), for the hover detail.
  const planSessions = useMemo(() => {
    const map = {}
    for (const s of inputLog || []) {
      if (!s.planId) continue
      if (!map[s.planId]) map[s.planId] = []
      map[s.planId].push(s)
    }
    return map
  }, [inputLog])

  // Which calendar events have already been logged (so their scheduled auto
  // entry doesn't double-count once a session/additional entry exists for it).
  // A session is indexed under BOTH keys when it has both: its content-row FK
  // (content:…) and its lecture string (course|lectureId). Calendar rows only
  // ever carry one of the two (content_id may be missing until a relink), so
  // the lookup below matches whichever key the session actually landed on.
  const loggedEvents = useMemo(() => {
    const study = new Set()
    for (const s of inputLog || []) {
      if (!s.date) continue
      if (s.lectureContentId) study.add('content:' + s.lectureContentId)
      if (s.course && s.lectureId) study.add(`course:${s.course}|${s.lectureId}`)
    }
    const addl = new Set()
    for (const a of additionalLog || []) {
      if (a.date && a.category && a.task) addl.add(`${a.date}|${a.category}|${a.task}`)
    }
    return { study, addl }
  }, [inputLog, additionalLog])

  // Logs indexed by their calendar-event FK (issue #49): a session / additional
  // entry created by ticking an auto entry carries the event's row id, so "has
  // this event actually happened?" resolves exactly — and the logged times can
  // override the event's scheduled times.
  const sessionsByEvent = useMemo(() => {
    const m = new Map()
    for (const s of inputLog || []) {
      if (!s.eventId) continue
      if (!m.has(s.eventId)) m.set(s.eventId, [])
      m.get(s.eventId).push(s)
    }
    return m
  }, [inputLog])

  const addlByEvent = useMemo(() => {
    const m = new Map()
    for (const a of additionalLog || []) {
      if (!a.eventId) continue
      if (!m.has(a.eventId)) m.set(a.eventId, [])
      m.get(a.eventId).push(a)
    }
    return m
  }, [additionalLog])

  const avgWeeklyHours = useMemo(() => getAverageWeeklyHours(weeklyHours), [weeklyHours])

  // Timetable events + deadlines for the week grid shown below the plan.
  const calByDay = useMemo(() => {
    const map = {}
    for (const e of calendarEvents) {
      if (!e.date) continue
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    }
    for (const d of deadlines) {
      const date = d.date || d.deadline
      if (!date) continue
      if (!map[date]) map[date] = []
      map[date].push({ ...d, isDeadline: true })
    }
    return map
  }, [calendarEvents, deadlines])

  const colorByCourse = useMemo(() => {
    const m = {}
    for (const c of masterCourses || []) m[c.course] = c.color
    return m
  }, [masterCourses])

  const activeSet = useMemo(() => {
    const s = new Set()
    for (const c of masterCourses || []) {
      if (c?.course && isCourseActive(c, today)) s.add(c.course)
    }
    return s
  }, [masterCourses, today])

  // Syllabus notes by course + component/lecture ID, so calendar entries can
  // show their syllabus description as the note.
  const noteById = useMemo(() => {
    const m = new Map()
    for (const i of content || []) {
      if (!i.course || !i.contentId) continue
      const k = `${i.course}|${i.contentId}`
      if (!m.has(k)) m.set(k, i)
    }
    return m
  }, [content])

  // Content rows by stable id, so a calendar event's content_id FK resolves
  // directly to its syllabus note/prep (milestone 5).
  const contentById = useMemo(() => {
    const m = new Map()
    for (const i of content || []) if (i.id) m.set(i.id, i)
    return m
  }, [content])

  // Lectures that still require prep, keyed by content row id (the FK a
  // calendar event carries) and by course|lectureId string, so the week-grid
  // Prep marker shows reliably regardless of how the row is linked.
  const prepById = useMemo(() => {
    const m = new Map()
    for (const i of content || []) {
      if (!i.id || !i.prep) continue
      if (String(i.done || '').trim().toLowerCase() === 'done') continue
      m.set(i.id, i.prep)
    }
    return m
  }, [content])

  const prepByLecture = useMemo(() => {
    const m = new Map()
    for (const i of content || []) {
      if (!i.course || !i.contentId || !i.prep) continue
      if (String(i.done || '').trim().toLowerCase() === 'done') continue
      m.set(`${i.course}|${i.contentId}`, i.prep)
    }
    return m
  }, [content])

  // Fallback index by day+time slot, for classes whose content_id/lecture id
  // drifted — used by the week-grid Prep marker below.
  const contentBySlot = useMemo(() => slotIndexOfContent(content), [content])

  // Calendar events of the viewed week as read-only plan entries. Course
  // events land in their course's row; "Gym Time" imports feed the Exercise
  // additional-time row. Other personal calendars stay out of the plan.
  const autoByCell = useMemo(() => {
    const map = {}
    const durHours = e => {
      const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim()); return m ? +m[1] * 60 + +m[2] : null }
      const s = toMin(e.startTime)
      const en = toMin(e.endTime)
      return s == null || en == null || en <= s ? 0 : Math.round(((en - s) / 60) * 100) / 100
    }
    const courseRows = new Set()
    for (const e of calendarEvents) {
      if (!e.date || !dates.includes(e.date)) continue
      let rowName = e.course || ''
      if (!rowName) {
        // Imported personal calendars (no course): route by title/source —
        // work-titled events into the Work additional-time row, "Gym Time"
        // imports into the Exercise row, everything else stays out of the plan.
        if (isWorkEvent(e)) rowName = 'Work'
        else if ((e.source || '').trim() !== 'Gym Time') continue
        else rowName = 'Exercise'
      } else {
        // Additional-category courses (Work / Exercise / …) are not study rows.
        if (!ADDITIONAL_SET.has(rowName)) courseRows.add(rowName)
      }
      const isAdditional = rowName === 'Work' || rowName === 'Exercise'
      // Resolve the syllabus note/prep via the content_id FK first, falling
      // back to the lectureId string match for legacy rows.
      const linkedContent = e.contentId ? contentById.get(e.contentId) : null
      const noteItem = !isAdditional
        ? (linkedContent || (e.lectureId ? noteById.get(`${rowName}|${e.lectureId}`) : null))
        : null
      const linkedPrep = !isAdditional && e.contentId ? prepById.get(e.contentId) : null
      const prepText = !isAdditional
        ? (linkedPrep ||
          (e.lectureId && !linkedContent ? (prepByLecture.get(`${rowName}|${e.lectureId}`) || null) : null) ||
          (!e.contentId ? (contentBySlot.get(`${rowName}|${e.date}|${e.startTime || ''}`)?.prep || null) : null) ||
          null)
        : null
      const k = `${rowName}|${e.date}`
      if (!map[k]) map[k] = []
      // Issue #49: logs created by ticking an event off carry its calendar row
      // id (eventId) — the precise "has this actually happened?" answer. The
      // old key-string sets are the fallback for logs created before the FK.
      const fkSessions = e.id ? (sessionsByEvent.get(e.id) || []) : []
      const fkAddl = e.id ? (addlByEvent.get(e.id) || []) : []
      const fkLogged = isAdditional ? fkAddl.length > 0 : fkSessions.length > 0
      const legacyLogged = isAdditional
        ? loggedEvents.addl.has(`${e.date}|${rowName}|${e.summary}`)
        : !!((e.contentId && loggedEvents.study.has('content:' + e.contentId)) || loggedEvents.study.has(`course:${rowName}|${e.lectureId}`))
      const logged = fkLogged || legacyLogged
      // Sessions logged before the event_id FK existed still count as actual
      // hours for the class when they match its lecture/content id on its day.
      const legacySessions = fkSessions.length === 0 && !isAdditional && legacyLogged && e.course
        ? (inputLog || []).filter(s =>
            !s.planId && s.date === e.date && s.course === e.course &&
            ((e.contentId && s.lectureContentId === e.contentId) || (e.lectureId && s.lectureId === e.lectureId)))
        : []
      // Attendance (issue #42): classes marked "Skip" in the course show greyed
      // out in the planner (still listed, still loggable if you do go).
      const attendRow = !isAdditional ? (linkedContent || contentBySlot.get(`${rowName}|${e.date}|${e.startTime || ''}`) || null) : null
      const attend = attendRow == null || attendRow.attend !== false
      // Effective hours + shown times (issue #49): once something has actually
      // been logged, the LOG wins over the schedule everywhere. Additional auto
      // rows that are logged disappear entirely (their real row carries them),
      // so their schedule hours never linger. A class that was never logged has
      // no business keeping planned hours after its day has passed — the planner
      // corrects to reality, exactly like reconcilePastDays does for plan rows.
      let hours
      if (isAdditional) {
        // Logged additional auto rows are hidden and carried by their own row —
        // their schedule hours must never count here.
        hours = fkAddl.length > 0 ? 0 : durHours(e)
      } else if (fkLogged) {
        hours = Math.round(fkSessions.reduce((t, s) => t + (s.durationHours || 0), 0) * 100) / 100
      } else if (legacySessions.length > 0) {
        hours = Math.round(legacySessions.reduce((t, s) => t + (s.durationHours || 0), 0) * 100) / 100
      } else if (!attend) {
        hours = 0
      } else if (e.date < today) {
        hours = 0
      } else {
        hours = durHours(e)
      }
      let startTime = e.startTime || ''
      let endTime = e.endTime || ''
      if (fkSessions.length === 1) {
        if (fkSessions[0].startTime) startTime = fkSessions[0].startTime
        if (fkSessions[0].endTime) endTime = fkSessions[0].endTime
      }
      map[k].push({
        id: `auto|${e.calId || e.uid || ''}|${e.date}|${e.startTime || ''}|${e.summary}`,
        task: e.summary,
        note: noteItem?.content || noteItem?.description || '',
        prep: prepText || '',
        // Everything needed to pre-fill the session logger when ticked off.
        date: e.date,
        startTime,
        endTime,
        lectureId: !isAdditional ? (e.lectureId || '') : '',
        contentId: e.contentId || '',
        type: inferEventType(e.summary, e.description),
        course: rowName,
        // Additional-time rows (Work / Exercise) are checkable too — they open
        // their own logging window (never the study session logger).
        isAdditional,
        loggable: true,
        // True once a session / additional entry has been logged for this event.
        logged,
        // The calendar row this entry derives from, so ticking it off can link
        // the created session / additional entry back (event_id FK).
        eventId: e.id || '',
        attend,
        // The actual hours to count once this event has been logged — the entry
        // still shows (a done class stays visible) but never with schedule hours.
        hours,
      })
    }
    // Deadlines falling inside the viewed week are pinned into their course's
    // day cell too (red, read-only) — a deadline is only ever visible in the
    // timetable strip below, so it doesn't "show up on the daily planner" the
    // way scheduled classes do. Done items are skipped.
    for (const d of deadlines || []) {
      const due = d.deadline || d.date
      if (!due || !dates.includes(due)) continue
      if (String(d.done || '').trim().toLowerCase() === 'done') continue
      const rowName = d.course || ''
      if (!rowName || ADDITIONAL_SET.has(rowName)) continue
      courseRows.add(rowName)
      const k = `${rowName}|${due}`
      if (!map[k]) map[k] = []
      map[k].push({
        id: `deadline|${d.id || `${rowName}|${d.contentId || ''}|${due}`}`,
        task: `Due: ${d.description || d.topic || d.contentId || 'Deadline'}`,
        hours: 0,
        note: '',
        prep: '',
        date: due,
        startTime: d.end || d.start || '',
        endTime: '',
        lectureId: '',
        contentId: d.contentId || '',
        type: d.type || 'deadline',
        course: rowName,
        isAdditional: false,
        loggable: false,
        logged: false,
        isDeadline: true,
      })
    }
    map.__courses = [...courseRows]
    return map
  }, [calendarEvents, deadlines, dates, today, inputLog, noteById, contentById, prepById, prepByLecture, contentBySlot, loggedEvents, sessionsByEvent, addlByEvent])

  // Rows of the plan matrix: one row per course (active first, then name, with
  // "Other University Stuff" pinned to the bottom), plus a separate band for the
  // additional-time categories (work / other obligations / commute / exercise)
  // which is excluded from study totals but logged and counted toward capacity.
  const week = useMemo(() => {
    const byCell = {}
    const studySet = new Set()
    const workSet = new Set()
    for (const date of dates) {
      for (const r of byDate[date] || []) {
        if (!r.course) continue
        if (r.course === 'WORK' || r.course === 'Travel') workSet.add(r.course)
        else studySet.add(r.course)
        const k = `${r.course}|${date}`
        if (!byCell[k]) byCell[k] = []
        byCell[k].push(r)
      }
      for (const a of addByDate[date] || []) {
        workSet.add(a.category)
        const k = `${a.category}|${date}`
        if (!byCell[k]) byCell[k] = []
        byCell[k].push(a)
      }
    }
    for (const c of extraRows) {
      if (ADDITIONAL_SET.has(c) || c === 'WORK' || c === 'Travel') workSet.add(c)
      else studySet.add(c)
    }
    // Every currently-active course is listed by default (as an empty row you
    // can plan into) — no need to add courses manually each week.
    for (const c of activeSet) studySet.add(c)
    // Courses with scheduled events join the study rows (even inactive ones,
    // e.g. when viewing an old week); "Gym Time" feeds the Exercise row below.
    for (const c of autoByCell.__courses || []) studySet.add(c)
    const study = [...studySet].sort((a, b) => ((activeSet.has(b) ? 1 : 0) - (activeSet.has(a) ? 1 : 0)) || a.localeCompare(b))
    // "Other University Stuff" always sits at the bottom of the study rows.
    const otherIdx = study.findIndex(c => c === 'Other University Stuff')
    if (otherIdx > -1) study.push(study.splice(otherIdx, 1)[0])
    // The additional categories are always listed; legacy WORK/Travel rows (if
    // any) follow them.
    const additional = [...ADDITIONAL_CATEGORIES]
    for (const c of workSet) if (!ADDITIONAL_SET.has(c) && !additional.includes(c)) additional.push(c)
    // Prefer the actually-logged hours once a task is done — an estimate must
    // never outrank what really happened.
    const hoursOf = r => r.actualHours ?? r.plannedHours ?? r.hours ?? 0
    const cellTasks = (course, date) => byCell[`${course}|${date}`] || []
    const autoTasks = (course, date) => autoByCell[`${course}|${date}`] || []
    const hasTasks = course => dates.some(date => cellTasks(course, date).length > 0)
    return { study, additional, cellTasks, autoTasks, hoursOf, hasTasks }
  }, [dates, byDate, addByDate, extraRows, activeSet, autoByCell])

  const autoHours = course => dates.reduce((s, date) => s + week.autoTasks(course, date).reduce((t, r) => t + ((r.isAdditional && r.logged) ? 0 : (r.hours || 0)), 0), 0)

  // Study rows in the user's dragged order; unarranged courses stay alphabetical.
  const orderedStudy = useMemo(() => {
    const rank = c => {
      const i = courseOrder.indexOf(c)
      return i === -1 ? Number.MAX_SAFE_INTEGER : i
    }
    return [...week.study].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  }, [week.study, courseOrder])

  function handleCourseDragStart(c) {
    return () => setDragCourse(c)
  }
  function handleCourseDragOver(c) {
    return e => {
      e.preventDefault()
      if (!dragCourse || dragCourse === c) return
      const list = orderedStudy.slice()
      const from = list.indexOf(dragCourse)
      const to = list.indexOf(c)
      if (from < 0 || to < 0) return
      list.splice(from, 1)
      list.splice(to, 0, dragCourse)
      persistCourseOrder(list)
    }
  }
  function handleCourseDrop() {
    setDragCourse(null)
  }
  const rowHours = course => dates.reduce((s, date) => s + week.cellTasks(course, date).reduce((t, r) => t + week.hoursOf(r), 0), 0) + autoHours(course)
  const dayHours = date => week.study.reduce((s, c) => s + week.cellTasks(c, date).reduce((t, r) => t + week.hoursOf(r), 0) + week.autoTasks(c, date).reduce((t, r) => t + (r.hours || 0), 0), 0)
  const additionalDayHours = date => week.additional.reduce((s, c) => s + week.cellTasks(c, date).reduce((t, r) => t + week.hoursOf(r), 0) + week.autoTasks(c, date).reduce((t, r) => t + (r.logged ? 0 : (r.hours || 0)), 0), 0)
  const studyTotal = week.study.reduce((s, c) => s + rowHours(c), 0)
  const additionalTotal = week.additional.reduce((s, c) => s + rowHours(c), 0)
  const totalHours = studyTotal + additionalTotal
  const overCapacity = avgWeeklyHours > 0 && totalHours > avgWeeklyHours * 1.1

  function moveWeek(delta) {
    const d = new Date(weekKey + 'T12:00:00')
    d.setDate(d.getDate() + delta * 7)
    setWeekKey(mondayOf(toISO(d)))
  }

  // If a live session is running, ticking anything off closes it and links the
  // recorded times to the item being logged.
  function consumeLiveTimes() {
    if (!liveSession) return null
    const s = stopLiveSession()
    const end = nowTime()
    return { date: s.startDate, startTime: s.startTime, endTime: end, durationHours: durationBetween(s.startTime, end) ?? '' }
  }

  function toggleDone(row) {
    if (row.isAdditional) {
      // Un-ticking an already-logged additional item just reopens it; ticking
      // one off opens its own logging window (never the study logger).
      if (row.done) {
        updateAdditionalEntry(row.id, { done: null })
        return
      }
      if (onLogAdditional) onLogAdditional(row, row.id)
      return
    }
    if (row.done) {
      updatePlannerTask(row.id, { done: null })
    } else if (onLogTask) {
      // Ticking a to-do only opens the session logger — the item is NOT marked
      // done yet, so cancelling the logger leaves the box unchecked. Saving the
      // session marks it done through the plan↔session relation.
      onLogTask({ course: row.course, task: row.task, notes: displayNotes(row.notes), date: row.date, plannerId: row.id, lectureId: lectureIdFromNotes(row.notes), ...consumeLiveTimes() })
    } else {
      updatePlannerTask(row.id, { done: 'done' })
    }
  }

  // Ticking off a scheduled class opens the session logger with everything
  // that is already known pre-filled — course, date, start/end times and the
  // derived duration, category from the event type, "University" as location
  // and the lecture ID so the hours land on the right syllabus row. All
  // fields stay editable in the modal.
  function logClassEntry(entry) {
    if (!onLogTask) return
    const live = consumeLiveTimes()
    onLogTask({
      course: entry.course,
      task: entry.task,
      ...(live || {
        date: entry.date,
        startTime: entry.startTime,
        endTime: entry.endTime,
        durationHours: entry.hours || '',
      }),
      category: sessionCategoryForType(entry.type),
      location: 'University',
      lectureId: entry.lectureId || '',
      lectureContentId: entry.contentId || '',
      // Link the session to the calendar row it was ticked from (issue #49) so
      // the logged time overrides the scheduled one in the planner/totals.
      eventId: entry.eventId || '',
      skipPlannerAuto: true,
    })
  }

  function startEdit(row) {
    setEditId(row.id)
    setEditForm({ task: row.task || '', hours: String(row.hours != null ? row.hours : (row.plannedHours || row.actualHours || '')), notes: displayNotes(row.notes) })
  }

  function saveEdit(id) {
    const h = parseFloat(editForm.hours) || 0
    const target = (additionalLog || []).find(r => r.id === id)
    if (target) {
      updateAdditionalEntry(id, { task: editForm.task, hours: h, notes: mergeNotesWithTag(editForm.notes, target.notes) })
    } else {
      updatePlannerTask(id, { task: editForm.task, plannedHours: h, actualHours: null, notes: mergeNotesWithTag(editForm.notes, (dailyPlan || []).find(r => r.id === id)?.notes) })
    }
    setEditId(null)
  }

  function cancelEdit() {
    setEditId(null)
  }

  function openCellAdd(course, date) {
    setAddCell({ course, date })
    setCellForm({ task: '', hours: '', notes: '' })
  }

  function cancelCellAdd() {
    setAddCell(null)
  }

  function saveCellAdd() {
    if (!addCell) return
    const h = parseFloat(cellForm.hours) || 0
    if (ADDITIONAL_SET.has(addCell.course)) {
      addAdditionalEntry({ date: addCell.date, category: addCell.course, task: cellForm.task, hours: h, notes: cellForm.notes || null })
    } else {
      addPlannerTask({ date: addCell.date, course: addCell.course, task: cellForm.task, plannedHours: h, notes: cellForm.notes || null })
    }
    setAddCell(null)
  }

  function quickAddTask(course, date, task, hours) {
    if (ADDITIONAL_SET.has(course)) {
      addAdditionalEntry({ date, category: course, task, hours, notes: null })
    } else {
      addPlannerTask({ date, course, task, plannedHours: hours, notes: null })
    }
  }

  function addRow(course) {
    if (!course) return
    setExtraRows(r => (r.includes(course) ? r : [...r, course]))
    setRowCourse('')
  }

  function removeExtraRow(course) {
    setExtraRows(r => r.filter(c => c !== course))
  }

  function deleteTask(id) {
    const row = (dailyPlan || []).find(r => r.id === id)
    const linked = row?.id ? (planSessions[row.id] || []) : []
    let msg = 'Delete this task?'
    if (row && (row.done || linked.length > 0)) {
      msg = `Delete "${row.task || 'this task'}"?`
      if (linked.length > 0) {
        msg += ` It has ${linked.length} linked session${linked.length === 1 ? '' : 's'} in the Time Log, which will be deleted too.`
      }
      msg += ' This removes the Daily Planner entry.'
    }
    if (!window.confirm(msg)) return
    if ((additionalLog || []).some(r => r.id === id)) deleteAdditionalEntry(id)
    else deletePlannerItem(id)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => moveWeek(-1)}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">← Prev</button>
          <span className="text-sm font-medium text-slate-700">
            Week {currentIsoWeek} — {formatDateShort(weekKey)} – {formatDateShort(dates[6])}
          </span>
          <button onClick={() => moveWeek(1)}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">Next →</button>
          <button onClick={() => setWeekKey(mondayOf(today))}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">Today</button>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-3 text-sm px-4 py-1.5 rounded-full bg-white border border-slate-200 shadow-sm">
            <span className="flex items-center gap-1.5 text-indigo-600">
              <span className="w-2 h-2 rounded-full bg-indigo-500" /> Study {studyTotal.toFixed(2)}h
            </span>
            <span className="flex items-center gap-1.5 text-amber-600">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> Additional {additionalTotal.toFixed(2)}h
            </span>
            <span className={`flex items-center gap-1.5 font-semibold ${overCapacity ? 'text-red-600' : 'text-emerald-700'}`}>
              <span className={`w-2 h-2 rounded-full ${overCapacity ? 'bg-red-500' : 'bg-emerald-500'}`} /> Total {totalHours.toFixed(2)}h
            </span>
          </div>
          {avgWeeklyHours > 0 && (
            <span className={`text-[10px] px-2 ${overCapacity ? 'text-red-500' : 'text-slate-400'}`}>
              {Math.round((totalHours / avgWeeklyHours) * 100)}% of your {avgWeeklyHours.toFixed(2)}h average week
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 w-[calc(100%+1.5rem)] -ml-[0.75rem]">
        <table className="w-full table-fixed text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 font-medium text-slate-500 w-56"><div className="pr-11">Course</div></th>
              {DAYS.map((day, i) => (
                <th key={day} className={`px-1 py-2 font-medium text-center w-[calc((100%-19.5rem)/7)] ${dates[i] === today ? 'text-indigo-700' : 'text-slate-500'}`}>
                  <div>{day}</div>
                  <div className={`text-[10px] font-normal ${dates[i] === today ? 'text-indigo-400' : 'text-slate-400'}`}>{formatDateShort(dates[i])}</div>
                </th>
              ))}
              <th className="text-right px-3 py-2 font-medium text-slate-500 w-16">Total</th>
              <th className="w-6" />
            </tr>
          </thead>
            <tbody>
              {orderedStudy.map(course => (
                <CourseRow key={course} course={course}
                  style={getCourseStyle(course, colorByCourse[course])}
                  isActive={activeSet.has(course)}
                  total={rowHours(course)}
                  isEmptyExtra={extraRows.includes(course) && !week.hasTasks(course)}
                  dates={dates} today={today}
                  cellTasks={week.cellTasks} autoTasks={week.autoTasks} hoursOf={week.hoursOf}
                  editId={editId} editForm={editForm} setEditForm={setEditForm}
                  addCell={addCell} cellForm={cellForm} setCellForm={setCellForm}
                  onEdit={startEdit} onSaveEdit={saveEdit} onCancelEdit={cancelEdit}
                  onToggle={toggleDone} onDelete={deleteTask}
                  onOpenAdd={openCellAdd} onSaveAdd={saveCellAdd} onCancelAdd={cancelCellAdd}
                  onQuickAdd={quickAddTask}
                  onLogAuto={logClassEntry}
                  onLogAdditional={onLogAdditional}
                  onRemoveExtraRow={removeExtraRow}
                  draggable
                  dragging={dragCourse === course}
                  onRowDragStart={handleCourseDragStart(course)}
                  onRowDragOver={handleCourseDragOver(course)}
                  onRowDrop={handleCourseDrop} planSessions={planSessions} />
              ))}
              {orderedStudy.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-4 text-center text-slate-300 text-sm">No study tasks planned this week — type into a course row below, or use “+” in a day column.</td>
                </tr>
              )}

              <tr>
                <td colSpan={10} className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-slate-400">
                  Additional time — Work, Other Obligations, Commute &amp; Exercise (logged, never counted as study)
                </td>
              </tr>
              {week.additional.map(course => (
                <CourseRow key={course} course={course}
                  style={getCourseStyle(course, colorByCourse[course])}
                  isActive={false}
                  total={rowHours(course)}
                  isEmptyExtra={false}
                  dates={dates} today={today}
                  cellTasks={week.cellTasks} autoTasks={week.autoTasks} hoursOf={week.hoursOf}
                  editId={editId} editForm={editForm} setEditForm={setEditForm}
                  addCell={addCell} cellForm={cellForm} setCellForm={setCellForm}
                  onEdit={startEdit} onSaveEdit={saveEdit} onCancelEdit={cancelEdit}
                  onToggle={toggleDone} onDelete={deleteTask}
                  onOpenAdd={openCellAdd} onSaveAdd={saveCellAdd} onCancelAdd={cancelCellAdd}
                  onQuickAdd={quickAddTask}
                  onLogAuto={logClassEntry}
                  onLogAdditional={onLogAdditional}
                  onRemoveExtraRow={removeExtraRow} planSessions={planSessions} />
              ))}
              <tr className="bg-slate-50 border-t border-slate-200 font-medium text-slate-700">
                <td className="px-3 py-2">Day total</td>
                {dates.map(date => {
                  const full = dayHours(date) + additionalDayHours(date)
                  return (
                    <td key={date} className={`px-2 py-2 text-center tabular-nums ${date === today ? 'text-indigo-700' : ''}`}>
                      {full > 0 ? full.toFixed(2) : ''}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right tabular-nums w-16">{totalHours.toFixed(2)}h</td>
                <td className="w-6" />
              </tr>

              <tr>
                <td colSpan={10} className="px-3 py-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <CourseSelect size="sm" value={rowCourse} onChange={addRow} courses={masterCourses}
                      placeholder="+ Add course row…"
                      extraOptions={[
                        { value: 'Travel', label: 'Travel', dot: 'bg-slate-400' },
                        { value: 'WORK', label: 'WORK', dot: 'bg-gray-500' },
                      ]} />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 pt-3 w-[calc(100%+1.5rem)] -ml-[0.75rem]">
        <div className="flex items-center justify-between mb-2 px-3">
          <h3 className="text-sm font-semibold text-slate-700">Week timetable</h3>
          <span className="text-xs text-slate-400">Classes and deadlines for this week (06:00–22:00)</span>
        </div>
        {/* Same column geometry as the planner table above — course column
            (w-56, its right side doubles as the hour axis) / 7 equal days /
            total column (w-16) / drag-handle column (w-6). Both cards are
            widened by 1.5rem so the added handle takes no width from the
            day columns and Mon still sits exactly above Mon. */}
        <div className="flex items-stretch">
          <div className="w-56 shrink-0" />
          <div className="flex-1 min-w-0">
            <WeekGrid week={weekDatesObj} byDay={calByDay} masterCourses={masterCourses} axisOutside prepMap={prepByLecture} prepById={prepById} contentBySlot={contentBySlot} />
          </div>
          <div className="w-16 shrink-0" />
          <div className="w-6 shrink-0" />
        </div>
        <div className="h-3" />
      </div>

      {reschedOpen && staleItems.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setReschedOpen(false)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h2 className="font-semibold text-slate-800">Not checked off</h2>
              <button onClick={() => setReschedOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer">&times;</button>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500 mb-3">
                These items were planned on earlier days but never checked off (their planned hours have been reset). Pick a day to reschedule them to, or skip them.
              </p>
              <div className="space-y-2">
                {staleItems.map(r => (
                  <RescheduleRow key={r.id} row={r} options={rescheduleOptions}
                    onReschedule={date => { rescheduleItem(r, date) }}
                    onSkip={() => persistDismissed([r.id])} />
                ))}
              </div>
              <div className="mt-4 flex justify-between">
                <button onClick={() => { persistDismissed(staleItems.map(r => r.id)); setReschedOpen(false) }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer">Skip all</button>
                <button onClick={() => setReschedOpen(false)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 cursor-pointer">Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-slate-400 italic">
        Type straight into a course row to plan a task (Enter confirms, optional “h” field sets the estimate). “+” opens a form with a note field for an extra entry. Hours sit on the right of each to-do. Scheduled classes and imported calendar events (lectures, Gym Time, work-titled entries, …) appear automatically as read-only entries with their duration; lectures also show their syllabus note (hover for the full text). Ticking a to-do opens the session logger with that course pre-filled; ticking again un-checks it. Additional-time rows are logged in the “Additional Time Log” sheet, never counted as study, but do count toward your weekly capacity.
      </div>
    </div>
  )
}