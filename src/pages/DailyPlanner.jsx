import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { getAverageWeeklyHours } from '../data/parseDaily'
import { isoWeekOf } from '../data/normalize'
import { getCourseStyle, formatDateShort, isCourseActive } from '../utils/helpers'
import WeekGrid from '../components/WeekGrid'
import CourseSelect from '../components/CourseSelect'
import { ADDITIONAL_CATEGORIES } from '../config'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ADDITIONAL_SET = new Set(ADDITIONAL_CATEGORIES)

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

function TaskRow({ row, hoursOf, onToggle, onEdit, onDelete }) {
  return (
    <div className="group flex items-center gap-1 rounded px-0.5 py-0.5 hover:bg-slate-100/70">
      <input type="checkbox" checked={!!row.done} onChange={() => onToggle(row)}
        className="h-3 w-3 accent-indigo-600 cursor-pointer shrink-0" />
      <span className={`text-[10px] leading-tight flex-1 min-w-0 truncate ${row.done ? 'line-through text-slate-400' : 'text-slate-700'}`} title={row.task}>
        {row.task || '—'}
      </span>
      <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">{hoursOf(row).toFixed(2)}h</span>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
        <button onClick={() => onEdit(row)} className="text-[9px] px-1 text-slate-400 hover:text-slate-700 cursor-pointer" title="Edit">✎</button>
        <button onClick={onDelete} className="text-[10px] text-red-400 hover:text-red-600 cursor-pointer" title="Delete">×</button>
      </div>
    </div>
  )
}

// Read-only entry derived from a calendar event (lecture, tutorial, imported
// personal calendar item). Shows the syllabus note under the summary.
function AutoTask({ entry }) {
  return (
    <div className="flex items-start gap-1 px-0.5 py-0.5" title={entry.note ? `${entry.task} — ${entry.note}` : entry.task}>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] leading-tight text-slate-600 truncate">{entry.task}</div>
        {entry.note && <div className="text-[9px] leading-tight text-slate-400 truncate">{entry.note}</div>}
      </div>
      <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">{entry.hours > 0 ? `${entry.hours.toFixed(2)}h` : ''}</span>
    </div>
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
// hour estimate), press Enter, done — no click needed first.
function QuickAddCell({ onSave }) {
  const [task, setTask] = useState('')
  const [hours, setHours] = useState('')
  const submit = () => {
    if (!task.trim()) return
    onSave(task.trim(), parseFloat(hours) || 0)
    setTask('')
    setHours('')
  }
  return (
    <div className="flex items-center gap-0.5">
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
  onQuickAdd, readOnly,
}) {
  return (
    <tr className={`border-b border-slate-100 ${style.soft}`} style={style.softCss}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2 pr-11">
          <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} style={style.dotCss} />
          <span className="truncate font-medium text-slate-700" title={course}>{course}</span>
          {isActive && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">active</span>
          )}
          {isEmptyExtra && (
            <button onClick={() => onRemoveExtraRow(course)}
              className="text-[10px] text-slate-300 hover:text-red-400 cursor-pointer shrink-0" title="Remove empty row">×</button>
          )}
        </div>
      </td>
      {dates.map(date => (
        <td key={date} className={`px-1.5 py-1 align-top ${date === today ? 'bg-indigo-50/60' : ''}`}>
          <div className="flex flex-col gap-0.5 min-h-[24px]">
            {cellTasks(course, date).map(row => (
              editId === row.id
                ? <EditForm key={row.id} row={row} form={editForm} setForm={setEditForm} onSave={onSaveEdit} onCancel={onCancelEdit} />
                : <TaskRow key={row.id} row={row} hoursOf={hoursOf} onToggle={onToggle} onEdit={onEdit} onDelete={() => onDelete(row.id)} />
            ))}
            {(autoTasks ? autoTasks(course, date) : []).map(entry => (
              <AutoTask key={entry.id} entry={entry} />
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
    </tr>
  )
}

export default function DailyPlanner({ onLogTask }) {
  const {
    dailyPlan, weeklyHours, masterCourses, calendarEvents, deadlines, additionalLog, content,
    addPlannerTask, updatePlannerTask, deletePlannerTask,
    addAdditionalEntry, updateAdditionalEntry, deleteAdditionalEntry,
  } = useAppData()
  const [weekKey, setWeekKey] = useState(() => mondayOf(todayISO()))
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({ task: '', hours: '', notes: '' })
  const [addCell, setAddCell] = useState(null)
  const [cellForm, setCellForm] = useState({ task: '', hours: '', notes: '' })
  const [extraRows, setExtraRows] = useState([])
  const [rowCourse, setRowCourse] = useState('')

  const today = todayISO()
  const dates = weekDates(weekKey)
  const weekDatesObj = useMemo(() => dates.map(ds => new Date(ds + 'T12:00:00')), [dates])
  const currentIsoWeek = isoWeekOf(weekKey)?.week

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
        if ((e.source || '').trim() !== 'Gym Time') continue
        rowName = 'Exercise'
      } else {
        courseRows.add(rowName)
      }
      const noteItem = rowName !== 'Exercise' && e.lectureId ? noteById.get(`${rowName}|${e.lectureId}`) : null
      const k = `${rowName}|${e.date}`
      if (!map[k]) map[k] = []
      map[k].push({
        id: `auto|${e.calId || e.uid || ''}|${e.date}|${e.startTime || ''}|${e.summary}`,
        task: e.summary,
        hours: e.allDay ? 0 : durHours(e),
        note: noteItem?.content || noteItem?.description || '',
      })
    }
    map.__courses = [...courseRows]
    return map
  }, [calendarEvents, dates, noteById])

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
    const hoursOf = r => r.plannedHours || r.actualHours || r.hours || 0
    const cellTasks = (course, date) => byCell[`${course}|${date}`] || []
    const autoTasks = (course, date) => autoByCell[`${course}|${date}`] || []
    const hasTasks = course => dates.some(date => cellTasks(course, date).length > 0)
    return { study, additional, cellTasks, autoTasks, hoursOf, hasTasks }
  }, [dates, byDate, addByDate, extraRows, activeSet, autoByCell])

  const autoHours = course => dates.reduce((s, date) => s + week.autoTasks(course, date).reduce((t, r) => t + (r.hours || 0), 0), 0)
  const rowHours = course => dates.reduce((s, date) => s + week.cellTasks(course, date).reduce((t, r) => t + week.hoursOf(r), 0), 0) + autoHours(course)
  const dayHours = date => week.study.reduce((s, c) => s + week.cellTasks(c, date).reduce((t, r) => t + week.hoursOf(r), 0) + week.autoTasks(c, date).reduce((t, r) => t + (r.hours || 0), 0), 0)
  const additionalDayHours = date => week.additional.reduce((s, c) => s + week.cellTasks(c, date).reduce((t, r) => t + week.hoursOf(r), 0) + week.autoTasks(c, date).reduce((t, r) => t + (r.hours || 0), 0), 0)
  const studyTotal = week.study.reduce((s, c) => s + rowHours(c), 0)
  const additionalTotal = week.additional.reduce((s, c) => s + rowHours(c), 0)
  const totalHours = studyTotal + additionalTotal
  const overCapacity = avgWeeklyHours > 0 && totalHours > avgWeeklyHours * 1.1

  function moveWeek(delta) {
    const d = new Date(weekKey + 'T12:00:00')
    d.setDate(d.getDate() + delta * 7)
    setWeekKey(mondayOf(toISO(d)))
  }

  function toggleDone(row) {
    if (row.isAdditional) {
      updateAdditionalEntry(row.id, { done: row.done ? null : 'done' })
      return
    }
    if (row.done) {
      updatePlannerTask(row.id, { done: null })
    } else {
      updatePlannerTask(row.id, { done: 'done' })
      if (onLogTask) onLogTask({ course: row.course, task: row.task, notes: row.notes })
    }
  }

  function startEdit(row) {
    setEditId(row.id)
    setEditForm({ task: row.task || '', hours: String(row.hours != null ? row.hours : (row.plannedHours || row.actualHours || '')), notes: row.notes || '' })
  }

  function saveEdit(id) {
    const h = parseFloat(editForm.hours) || 0
    const target = (additionalLog || []).find(r => r.id === id)
    if (target) {
      updateAdditionalEntry(id, { task: editForm.task, hours: h, notes: editForm.notes || null })
    } else {
      updatePlannerTask(id, { task: editForm.task, plannedHours: h, actualHours: null, notes: editForm.notes || null })
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
    if (!window.confirm('Delete this task?')) return
    if ((additionalLog || []).some(r => r.id === id)) deleteAdditionalEntry(id)
    else deletePlannerTask(id)
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

      <div className="bg-white rounded-xl border border-slate-200">
        <table className="w-full table-fixed text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 font-medium text-slate-500 w-56"><div className="pr-11">Course</div></th>
              {DAYS.map((day, i) => (
                <th key={day} className={`px-1 py-2 font-medium text-center w-[calc((100%-18rem)/7)] ${dates[i] === today ? 'text-indigo-700' : 'text-slate-500'}`}>
                  <div>{day}</div>
                  <div className={`text-[10px] font-normal ${dates[i] === today ? 'text-indigo-400' : 'text-slate-400'}`}>{formatDateShort(dates[i])}</div>
                </th>
              ))}
              <th className="text-right px-3 py-2 font-medium text-slate-500 w-16">Total</th>
            </tr>
          </thead>
            <tbody>
              {week.study.map(course => (
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
                  onRemoveExtraRow={removeExtraRow} />
              ))}
              {week.study.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-center text-slate-300 text-sm">No study tasks planned this week — type into a course row below, or use “+” in a day column.</td>
                </tr>
              )}

              <tr>
                <td colSpan={9} className="px-3 py-2">
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

              <tr>
                <td colSpan={9} className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-slate-400">
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
                  onRemoveExtraRow={removeExtraRow} />
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
              </tr>
            </tbody>
          </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 pt-3">
        <div className="flex items-center justify-between mb-2 px-3">
          <h3 className="text-sm font-semibold text-slate-700">Week timetable</h3>
          <span className="text-xs text-slate-400">Classes and deadlines for this week (06:00–22:00)</span>
        </div>
        {/* Same column geometry as the planner table above — course column
            (w-56, its right side doubles as the hour axis) / 7 equal days /
            total column (w-16) — so Mon sits exactly above Mon. */}
        <div className="flex items-stretch">
          <div className="w-56 shrink-0" />
          <div className="flex-1 min-w-0">
            <WeekGrid week={weekDatesObj} byDay={calByDay} masterCourses={masterCourses} axisOutside />
          </div>
          <div className="w-16 shrink-0" />
        </div>
        <div className="h-3" />
      </div>

      <div className="text-xs text-slate-400 italic">
        Type straight into a course row to plan a task (Enter confirms, optional “h” field sets the estimate). “+” opens a form with a note field for an extra entry. Hours sit on the right of each to-do. Scheduled classes and imported calendar events (lectures, Gym Time, …) appear automatically as read-only entries with their duration; lectures also show their syllabus note (hover for the full text). Ticking a to-do opens the session logger with that course pre-filled; ticking again un-checks it. Additional-time rows are logged in the “Additional Time Log” sheet, never counted as study, but do count toward your weekly capacity.
      </div>
    </div>
  )
}