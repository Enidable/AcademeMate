import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { getAverageWeeklyHours } from '../data/parseDaily'
import { isoWeekOf } from '../data/normalize'
import { getCourseStyle, shortCourseName, formatDateShort } from '../utils/helpers'

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

export default function DailyPlanner() {
  const { dailyPlan, weeklyHours, masterCourses, addPlannerTask, updatePlannerTask, deletePlannerTask } = useAppData()
  const [weekKey, setWeekKey] = useState(() => mondayOf(todayISO()))
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({ task: '', hours: '', notes: '' })
  const [adding, setAdding] = useState(null)
  const [addForm, setAddForm] = useState({ course: '', task: '', hours: '', notes: '' })

  const weeks = useMemo(() => {
    const set = new Set()
    for (const r of dailyPlan) {
      if (r.date) set.add(mondayOf(r.date))
    }
    set.add(mondayOf(todayISO()))
    return [...set].sort()
  }, [dailyPlan])

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

  const weekIdx = Math.max(0, weeks.indexOf(weekKey))
  const currentWeekKey = weeks[weekIdx] || weekKey
  const dates = weekDates(currentWeekKey)
  const currentIsoWeek = isoWeekOf(currentWeekKey)?.week
  const today = todayISO()

  const weekTotal = dates.reduce((s, date) => s + (byDate[date] || []).reduce((t, r) => t + (r.plannedHours || r.actualHours || 0), 0), 0)
  const overCapacity = avgWeeklyHours > 0 && weekTotal > avgWeeklyHours * 1.1

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

  function openAdd(date) {
    setAdding(date)
    setAddForm({ course: '', task: '', hours: '', notes: '' })
  }

  function saveAdd(date) {
    if (!addForm.course) {
      alert('Pick a course for the task first.')
      return
    }
    const h = parseFloat(addForm.hours) || 0
    addPlannerTask({ date, course: addForm.course, task: addForm.task, plannedHours: h, notes: addForm.notes || null })
    setAdding(null)
  }

  function handleKeyDown(e, fn) {
    if (e.key === 'Enter') fn()
    if (e.key === 'Escape') cancelEdit()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekKey(weeks[weekIdx - 1])} disabled={weekIdx <= 0}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer">← Prev</button>
          <span className="text-sm font-medium text-slate-700">
            Week {currentIsoWeek} — {formatDateShort(currentWeekKey)} – {formatDateShort(dates[6])}
          </span>
          <button onClick={() => setWeekKey(weeks[weekIdx + 1])} disabled={weekIdx >= weeks.length - 1}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer">Next →</button>
          <button onClick={() => setWeekKey(mondayOf(today))}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">Today</button>
        </div>
        <div className={`text-sm px-3 py-1.5 rounded-full ${overCapacity ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          Planned: {weekTotal.toFixed(1)}h / Avg capacity: {avgWeeklyHours.toFixed(1)}h
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {dates.map((date, i) => (
          <DayCard
            key={date}
            day={DAYS[i]}
            date={date}
            isToday={date === today}
            courses={masterCourses}
            tasks={byDate[date] || []}
            editingId={editId}
            editForm={editForm}
            adding={adding === date}
            addForm={addForm}
            onEditForm={setEditForm}
            onAddForm={setAddForm}
            onStartEdit={startEdit}
            onSaveEdit={saveEdit}
            onCancelEdit={cancelEdit}
            onKeyDown={handleKeyDown}
            onOpenAdd={openAdd}
            onSaveAdd={saveAdd}
            onToggleDone={id => updatePlannerTask(id, { done: (byDate[date] || []).find(r => r.id === id)?.done ? null : 'done' })}
            onDelete={id => { if (window.confirm('Delete this task?')) deletePlannerTask(id) }}
          />
        ))}
      </div>

      <div className="text-xs text-slate-400 italic">Click the pencil to edit a task, the trash to remove it. Add new tasks per day with “+ Add task”. Press Enter to confirm, Escape to cancel.</div>
    </div>
  )
}

function DayCard({
  day, date, isToday, courses, tasks, editingId, editForm, adding, addForm,
  onEditForm, onAddForm, onStartEdit, onSaveEdit, onCancelEdit, onKeyDown,
  onOpenAdd, onSaveAdd, onToggleDone, onDelete,
}) {
  const dayTotal = tasks.reduce((s, r) => s + (r.plannedHours || r.actualHours || 0), 0)

  return (
    <div className={`bg-white rounded-xl border overflow-hidden flex flex-col ${isToday ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
      <div className={`px-3 py-2 border-b ${isToday ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-indigo-700' : 'text-slate-500'}`}>{day}</span>
          {isToday && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-600 text-white font-medium">TODAY</span>}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[11px] text-slate-400">{formatDateShort(date)}</span>
          {dayTotal > 0 && <span className="text-[11px] font-medium text-slate-600">{dayTotal.toFixed(1)}h</span>}
        </div>
      </div>

      <div className="p-2 flex-1 flex flex-col gap-1 min-h-[120px]">
        {tasks.length === 0 && (
          <p className="text-[11px] text-slate-300 text-center mt-4">No tasks</p>
        )}
        {tasks.map(row => {
          const style = getCourseStyle(row.course)
          const hours = row.plannedHours || row.actualHours || 0
          const isEditing = editingId === row.id
          return (
            <div key={row.id} className="group">
              {isEditing ? (
                <div className="flex flex-col gap-1 border border-slate-200 rounded-lg p-1.5 bg-slate-50">
                  <input type="text" value={editForm.task} autoFocus
                    onChange={e => onEditForm(f => ({ ...f, task: e.target.value }))}
                    onKeyDown={e => onKeyDown(e, () => onSaveEdit(row.id))}
                    className="w-full text-[11px] px-1.5 py-0.5 border border-slate-300 rounded text-slate-700 outline-none focus:border-slate-500" placeholder="Task" />
                  <div className="flex items-center gap-1">
                    <input type="text" inputMode="decimal" value={editForm.hours}
                      onChange={e => onEditForm(f => ({ ...f, hours: e.target.value }))}
                      onKeyDown={e => onKeyDown(e, () => onSaveEdit(row.id))}
                      className="w-14 text-[11px] px-1.5 py-0.5 border border-slate-300 rounded text-slate-700 outline-none focus:border-slate-500 text-center" placeholder="0" />
                    <input type="text" value={editForm.notes}
                      onChange={e => onEditForm(f => ({ ...f, notes: e.target.value }))}
                      onKeyDown={e => onKeyDown(e, () => onSaveEdit(row.id))}
                      className="w-full text-[11px] px-1.5 py-0.5 border border-slate-300 rounded text-slate-700 outline-none focus:border-slate-500" placeholder="Note" />
                  </div>
                  <div className="flex justify-end gap-1">
                    <button onClick={() => onSaveEdit(row.id)} className="text-[10px] px-2 py-0.5 bg-slate-700 text-white rounded cursor-pointer">✓</button>
                    <button onClick={onCancelEdit} className="text-[10px] px-2 py-0.5 border border-slate-200 text-slate-500 rounded cursor-pointer">Esc</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-1.5 px-1 py-0.5 rounded hover:bg-slate-50">
                  <input type="checkbox" checked={!!row.done} onChange={() => onToggleDone(row.id)}
                    className="mt-0.5 h-3 w-3 accent-indigo-600 cursor-pointer shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {row.course && (
                        <span className="flex items-center gap-1 text-[9px] px-1 py-0.5 rounded-full font-medium whitespace-nowrap">
                          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                          <span className={`${style.text}`}>{shortCourseName(row.course)}</span>
                        </span>
                      )}
                      {hours > 0 && <span className="text-[10px] text-slate-400 shrink-0">{hours.toFixed(1)}h</span>}
                    </div>
                    <p className={`text-[11px] leading-tight text-slate-700 ${row.done ? 'line-through text-slate-400' : ''}`}>
                      {row.task || shortCourseName(row.course)}
                    </p>
                    {row.notes && <p className="text-[10px] text-slate-400 truncate">{row.notes}</p>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                    <button onClick={() => onStartEdit(row)} className="text-[10px] px-1 text-slate-400 hover:text-slate-700 cursor-pointer">Edit</button>
                    <button onClick={() => onDelete(row.id)} className="text-[11px] text-red-400 hover:text-red-600 cursor-pointer">×</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {adding ? (
          <div className="flex flex-col gap-1 border border-slate-200 rounded-lg p-1.5 bg-slate-50 mt-auto">
            <select value={addForm.course} onChange={e => onAddForm(f => ({ ...f, course: e.target.value }))}
              className="w-full text-[11px] px-1.5 py-0.5 border border-slate-300 rounded text-slate-700 outline-none focus:border-slate-500">
              <option value="">Select course…</option>
              {courses.map(c => <option key={c.course} value={c.course}>{shortCourseName(c.course)}</option>)}
              <option>Travel</option>
              <option>WORK</option>
            </select>
            <input type="text" value={addForm.task} autoFocus
              onChange={e => onAddForm(f => ({ ...f, task: e.target.value }))}
              onKeyDown={e => onKeyDown(e, () => onSaveAdd(date))}
              className="w-full text-[11px] px-1.5 py-0.5 border border-slate-300 rounded text-slate-700 outline-none focus:border-slate-500" placeholder="Task" />
            <div className="flex items-center gap-1">
              <input type="text" inputMode="decimal" value={addForm.hours}
                onChange={e => onAddForm(f => ({ ...f, hours: e.target.value }))}
                onKeyDown={e => onKeyDown(e, () => onSaveAdd(date))}
                className="w-14 text-[11px] px-1.5 py-0.5 border border-slate-300 rounded text-slate-700 outline-none focus:border-slate-500 text-center" placeholder="0" />
              <input type="text" value={addForm.notes}
                onChange={e => onAddForm(f => ({ ...f, notes: e.target.value }))}
                onKeyDown={e => onKeyDown(e, () => onSaveAdd(date))}
                className="w-full text-[11px] px-1.5 py-0.5 border border-slate-300 rounded text-slate-700 outline-none focus:border-slate-500" placeholder="Note" />
            </div>
            <div className="flex justify-end gap-1">
              <button onClick={() => onSaveAdd(date)} className="text-[10px] px-2 py-0.5 bg-slate-700 text-white rounded cursor-pointer">✓</button>
              <button onClick={() => onOpenAdd(null)} className="text-[10px] px-2 py-0.5 border border-slate-200 text-slate-500 rounded cursor-pointer">Esc</button>
            </div>
          </div>
        ) : (
          <button onClick={() => onOpenAdd(date)}
            className="mt-auto text-[11px] text-slate-400 hover:text-slate-600 text-left px-1 py-1 rounded hover:bg-slate-50 cursor-pointer">+ Add task</button>
        )}
      </div>

      <div className="mt-auto px-3 py-2 border-t border-dashed border-slate-200">
        <p className="text-[10px] text-slate-300 text-center">Week timetable — university calendar import coming</p>
      </div>
    </div>
  )
}
