import { useState, useMemo } from 'react'
import { useAppData } from '../context/AppDataContext'
import { getAverageWeeklyHours } from '../data/parseDaily'
import { getCourseStyle } from '../utils/helpers'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function formatDate(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('/')
  if (parts.length === 3) return `${parts[0]}.${parts[1]}`
  return dateStr
}

export default function DailyPlanner() {
  const { plannerWeeks, weeklyHours, updatePlannerCell } = useAppData()
  const [weekIdx, setWeekIdx] = useState(plannerWeeks.length - 1)
  const [editing, setEditing] = useState(null)
  const [editDesc, setEditDesc] = useState('')
  const [editHours, setEditHours] = useState('')

  const avgWeeklyHours = useMemo(() => getAverageWeeklyHours(weeklyHours), [weeklyHours])

  const week = plannerWeeks[weekIdx]

  if (!plannerWeeks.length) {
    return <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">No planner data loaded.</div>
  }

  if (!week) return <div className="text-slate-400 text-sm">Week not found.</div>

  const sumRow = week.rows.find(r => r.isTotal)
  const editableRows = week.rows.filter(r => !r.isTotal)

  const capacity = avgWeeklyHours > 0 ? editableRows.filter(r => r.course !== 'Travel' && r.course !== 'WORK').reduce((s, r) => s + r.total, 0) : 0
  const overCapacity = capacity > avgWeeklyHours * 1.1

  function handleCellClick(rowIdx, dayIdx) {
    if (week.rows[rowIdx]?.isTotal) return
    const day = week.rows[rowIdx]?.days[dayIdx]
    setEditing({ rowIdx, dayIdx })
    setEditDesc(day?.description || '')
    setEditHours(day?.hours != null && day.hours > 0 ? String(day.hours) : '')
  }

  function confirmEdit() {
    if (!editing) return
    updatePlannerCell(editing.rowIdx, editing.dayIdx, 'description', editDesc)
    const h = parseFloat(editHours) || 0
    updatePlannerCell(editing.rowIdx, editing.dayIdx, 'hours', h)
    setEditing(null)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') confirmEdit()
    if (e.key === 'Escape') { setEditing(null) }
  }

  const rowColors = {}
  for (const r of editableRows) {
    if (r.course === 'Travel' || r.course === 'WORK') {
      rowColors[r.course] = 'bg-slate-50/50'
    } else {
      const style = getCourseStyle(r.course)
      rowColors[r.course] = style.bg.replace('bg-', 'bg-').replace('-100', '-50')
    }
  }

  const studyDayTotals = []
  for (let d = 0; d < 7; d++) {
    studyDayTotals.push(editableRows.filter(r => r.course !== 'Travel' && r.course !== 'WORK').reduce((s, r) => s + (r.days[d]?.hours || 0), 0))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setWeekIdx(i => Math.max(0, i - 1))} disabled={weekIdx <= 0} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer">← Prev</button>
          <span className="text-sm font-medium text-slate-700">Week {week.weekNumber} — {formatDate(week.startDate)}</span>
          <button onClick={() => setWeekIdx(i => Math.min(plannerWeeks.length - 1, i + 1))} disabled={weekIdx >= plannerWeeks.length - 1} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer">Next →</button>
        </div>
        <div className={`text-sm px-3 py-1.5 rounded-full ${overCapacity ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          Planned: {capacity.toFixed(1)}h / Avg capacity: {avgWeeklyHours.toFixed(1)}h
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-2.5 min-w-[100px]">Course</th>
              {DAYS.map((day, i) => (
                <th key={day} className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider px-2 py-2.5 min-w-[100px]">
                  <div>{day}</div>
                  <div className="text-[10px] text-slate-400">{formatDate(week.dates[i])}</div>
                </th>
              ))}
              <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-2.5 min-w-[60px]">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {editableRows.map((row, ri) => (
              <tr key={row.course} className={rowColors[row.course] || ''}>
                <td className={`px-3 py-2 text-xs font-medium whitespace-nowrap ${row.course === 'Travel' || row.course === 'WORK' ? 'text-slate-500 italic' : 'text-slate-700'}`}>{row.course}</td>
                {row.days.map((day, di) => {
                  const isEditing = editing?.rowIdx === ri && editing?.dayIdx === di
                  return (
                    <td key={di} className="px-2 py-1.5 text-center cursor-pointer align-top" onClick={() => !isEditing && handleCellClick(ri, di)}>
                      {isEditing ? (
                        <div className="flex flex-col gap-0.5">
                          <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)} onKeyDown={handleKeyDown}
                            className="w-full text-[11px] px-1 py-0.5 border border-slate-300 rounded text-slate-700 outline-none focus:border-slate-500"
                            placeholder="desc" autoFocus
                          />
                          <div className="flex items-center gap-1 justify-center">
                            <input type="text" inputMode="decimal" value={editHours} onChange={e => setEditHours(e.target.value)} onKeyDown={handleKeyDown}
                              className="w-16 text-[11px] px-1 py-0.5 border border-slate-300 rounded text-slate-700 outline-none focus:border-slate-500 text-center"
                              placeholder="0"
                            />
                            <button onClick={confirmEdit} className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-white rounded cursor-pointer">✓</button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] leading-tight min-h-[2em]">
                          {day.description && <div className="text-slate-500 truncate max-w-[90px] mx-auto">{day.description}</div>}
                          <div className={`font-medium ${day.hours > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                            {day.hours > 0 ? `${day.hours.toFixed(2)}h` : ''}
                          </div>
                        </div>
                      )}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-center font-medium text-slate-700">{row.total.toFixed(1)}</td>
              </tr>
            ))}

            {sumRow && (
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-medium">
                <td className="px-3 py-2 text-xs text-slate-600">Day Totals</td>
                {sumRow.days.map((day, di) => (
                  <td key={di} className="px-2 py-2 text-center text-sm text-slate-700">{studyDayTotals[di] > 0 ? studyDayTotals[di].toFixed(1) : ''}</td>
                ))}
                <td className="px-3 py-2 text-center text-sm font-bold text-slate-800">{sumRow.total.toFixed(1)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-400 italic">Click any cell to edit. Press Enter to confirm, Escape to cancel.</div>
    </div>
  )
}
