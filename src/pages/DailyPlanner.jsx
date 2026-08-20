import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { getAverageWeeklyHours } from '../data/parseDaily'
import { isoWeekOf } from '../data/normalize'
import { getCourseStyle, shortCourseName, formatDateShort, isCourseActive } from '../utils/helpers'
import WeekGrid from '../components/WeekGrid'
import CourseSelect from '../components/CourseSelect'

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
      <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">{hoursOf(row).toFixed(1)}h</span>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
        <button onClick={() => onEdit(row)} className="text-[9px] px-1 text-slate-400 hover:text-slate-700 cursor-pointer" title="Edit">✎</button>
        <button onClick={onDelete} className="text-[10px] text-red-400 hover:text-red-600 cursor-pointer" title="Delete">×</button>
      </div>
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

function CourseRow({
  course, style, isActive, total, isEmptyExtra, dates, today,
  cellTasks, hoursOf, editId, editForm, setEditForm, addCell, cellForm, setCellForm,
  onEdit, onSaveEdit, onCancelEdit, onToggle, onDelete, onOpenAdd, onSaveAdd, onCancelAdd, onRemoveExtraRow,
}) {
  return (
    <tr className={`border-b border-slate-100 ${style.soft}`} style={style.softCss}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} style={style.dotCss} />
          <span className="truncate font-medium text-slate-700" title={course}>{shortCourseName(course)}</span>
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
            {addCell?.course === course && addCell?.date === date ? (
              <AddCellForm form={cellForm} setForm={setCellForm} onSave={onSaveAdd} onCancel={onCancelAdd} />
            ) : (
              <button onClick={() => onOpenAdd(course, date)}
                className="text-[10px] text-slate-300 hover:text-slate-500 text-left cursor-pointer leading-none">+</button>
            )}
          </div>
        </td>
      ))}
      <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-700">{total > 0 ? `${total.toFixed(1)}h` : ''}</td>
    </tr>
  )
}

export default function DailyPlanner({ onLogTask }) {
  const { dailyPlan, weeklyHours, masterCourses, calendarEvents, deadlines, addPlannerTask, updatePlannerTask, deletePlannerTask } = useAppData()
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

  // Rows of the plan matrix: one row per course (active first, then name),
  // plus a separate band for WORK / Travel which is excluded from study totals.
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
    }
    for (const c of extraRows) {
      if (c === 'WORK' || c === 'Travel') workSet.add(c)
      else studySet.add(c)
    }
    const study = [...studySet].sort((a, b) => ((activeSet.has(b) ? 1 : 0) - (activeSet.has(a) ? 1 : 0)) || a.localeCompare(b))
    const work = [...workSet]
    const hoursOf = r => r.plannedHours || r.actualHours || 0
    const cellTasks = (course, date) => byCell[`${course}|${date}`] || []
    const hasTasks = course => dates.some(date => cellTasks(course, date).length > 0)
    return { study, work, cellTasks, hoursOf, hasTasks }
  }, [dates, byDate, extraRows, activeSet])

  const rowHours = course => dates.reduce((s, date) => s + week.cellTasks(course, date).reduce((t, r) => t + week.hoursOf(r), 0), 0)
  const dayHours = date => week.study.reduce((s, c) => s + week.cellTasks(c, date).reduce((t, r) => t + week.hoursOf(r), 0), 0)
  const workDayHours = date => week.work.reduce((s, c) => s + week.cellTasks(c, date).reduce((t, r) => t + week.hoursOf(r), 0), 0)
  const studyTotal = week.study.reduce((s, c) => s + rowHours(c), 0)
  const workTotal = week.work.reduce((s, c) => s + rowHours(c), 0)
  const overCapacity = avgWeeklyHours > 0 && studyTotal > avgWeeklyHours * 1.1

  function moveWeek(delta) {
    const d = new Date(weekKey + 'T12:00:00')
    d.setDate(d.getDate() + delta * 7)
    setWeekKey(mondayOf(toISO(d)))
  }

  function toggleDone(row) {
    if (row.done) {
      updatePlannerTask(row.id, { done: null })
    } else {
      updatePlannerTask(row.id, { done: 'done' })
      if (onLogTask) onLogTask({ course: row.course, task: row.task, notes: row.notes })
    }
  }

  function startEdit(row) {
    setEditId(row.id)
    setEditForm({ task: row.task || '', hours: String(row.plannedHours || row.actualHours || ''), notes: row.notes || '' })
  }

  function saveEdit(id) {
    const h = parseFloat(editForm.hours) || 0
    updatePlannerTask(id, { task: editForm.task, plannedHours: h, actualHours: null, notes: editForm.notes || null })
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
    addPlannerTask({ date: addCell.date, course: addCell.course, task: cellForm.task, plannedHours: h, notes: cellForm.notes || null })
    setAddCell(null)
  }

  function addRow(course) {
    if (!course) return
    setExtraRows(r => (r.includes(course) ? r : [...r, course]))
    setRowCourse('')
  }

  function removeExtraRow(course) {
    setExtraRows(r => r.filter(c => c !== course))
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
        <div className={`text-sm px-3 py-1.5 rounded-full ${overCapacity ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          Study {studyTotal.toFixed(1)}h{workTotal > 0 ? ` · Work/commute ${workTotal.toFixed(1)}h` : ''} · Capacity {avgWeeklyHours.toFixed(1)}h
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <div className="min-w-[960px]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2 font-medium text-slate-500 w-44">Course</th>
                {DAYS.map((day, i) => (
                  <th key={day} className={`px-2 py-2 font-medium text-center ${dates[i] === today ? 'text-indigo-700' : 'text-slate-500'}`}>
                    <div>{day}</div>
                    <div className={`text-[10px] font-normal ${dates[i] === today ? 'text-indigo-400' : 'text-slate-400'}`}>{formatDateShort(dates[i])}</div>
                  </th>
                ))}
                <th className="text-right px-3 py-2 font-medium text-slate-500">Total</th>
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
                  cellTasks={week.cellTasks} hoursOf={week.hoursOf}
                  editId={editId} editForm={editForm} setEditForm={setEditForm}
                  addCell={addCell} cellForm={cellForm} setCellForm={setCellForm}
                  onEdit={startEdit} onSaveEdit={saveEdit} onCancelEdit={cancelEdit}
                  onToggle={toggleDone} onDelete={id => { if (window.confirm('Delete this task?')) deletePlannerTask(id) }}
                  onOpenAdd={openCellAdd} onSaveAdd={saveCellAdd} onCancelAdd={cancelCellAdd}
                  onRemoveExtraRow={removeExtraRow} />
              ))}
              {week.study.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-center text-slate-300 text-sm">No study tasks planned this week — use “+” in a day column to plan one.</td>
                </tr>
              )}

              <tr className="bg-slate-50 border-t border-slate-200 font-medium text-slate-700">
                <td className="px-3 py-2">Study total</td>
                {dates.map(date => (
                  <td key={date} className="px-2 py-2 text-center tabular-nums">{dayHours(date) > 0 ? `${dayHours(date).toFixed(1)}` : ''}</td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">{studyTotal.toFixed(1)}h</td>
              </tr>

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

              {week.work.length > 0 && (
                <>
                  <tr>
                    <td colSpan={9} className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-slate-400">
                      Work & commute — kept separate from study hours
                    </td>
                  </tr>
                  {week.work.map(course => (
                    <CourseRow key={course} course={course}
                      style={getCourseStyle(course, colorByCourse[course])}
                      isActive={false}
                      total={rowHours(course)}
                      isEmptyExtra={extraRows.includes(course) && !week.hasTasks(course)}
                      dates={dates} today={today}
                      cellTasks={week.cellTasks} hoursOf={week.hoursOf}
                      editId={editId} editForm={editForm} setEditForm={setEditForm}
                      addCell={addCell} cellForm={cellForm} setCellForm={setCellForm}
                      onEdit={startEdit} onSaveEdit={saveEdit} onCancelEdit={cancelEdit}
                      onToggle={toggleDone} onDelete={id => { if (window.confirm('Delete this task?')) deletePlannerTask(id) }}
                      onOpenAdd={openCellAdd} onSaveAdd={saveCellAdd} onCancelAdd={cancelCellAdd}
                      onRemoveExtraRow={removeExtraRow} />
                  ))}
                  <tr className="bg-slate-50 border-t border-slate-200 font-medium text-slate-700">
                    <td className="px-3 py-2">Work & commute total</td>
                    {dates.map(date => (
                      <td key={date} className="px-2 py-2 text-center tabular-nums">{workDayHours(date) > 0 ? `${workDayHours(date).toFixed(1)}` : ''}</td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{workTotal.toFixed(1)}h</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">Week timetable</h3>
          <span className="text-xs text-slate-400">Classes and deadlines for this week (06:00–22:00)</span>
        </div>
        <div className="min-w-[720px]">
          <WeekGrid week={weekDatesObj} byDay={calByDay} masterCourses={masterCourses} />
        </div>
      </div>

      <div className="text-xs text-slate-400 italic">
        Add tasks per course per day with “+”. Hours sit on the right of each to-do. Ticking a to-do opens the session logger with that course pre-filled; ticking again un-checks it. Press Enter to confirm, Escape to cancel. “Work & commute” rows never count toward your study total or capacity.
      </div>
    </div>
  )
}