import { useState, useMemo } from 'react'
import { formatDate, getCategoryStyle, getEfficiencyBar, getWellbeingBar, normalizeCategory } from '../utils/helpers'
import { useAppData } from '../context/AppDataContext'
import { isoWeekOf } from '../data/normalize'

const PAGE_SIZE = 25

// Dashboard for the "Additional Time Log": work, other obligations, commute,
// exercise and social time. These hours are logged with their own window (never
// a study session) and count toward total weekly capacity — studying is
// symbiotic with the rest of life.
export default function AdditionalTimeLog({ onLogAdditional }) {
  const { additionalLog, deleteAdditionalEntry, weeklyHours } = useAppData()
  const [filterCategory, setFilterCategory] = useState('All')
  const [filterDone, setFilterDone] = useState('All')
  const [page, setPage] = useState(1)

  const categories = useMemo(() => {
    const set = new Set((additionalLog || []).map(e => normalizeCategory(e.category)))
    return ['All', ...Array.from(set).sort()]
  }, [additionalLog])

  const filtered = useMemo(() => {
    let result = [...(additionalLog || [])]
    if (filterCategory !== 'All') result = result.filter(e => normalizeCategory(e.category) === filterCategory)
    if (filterDone === 'Done') result = result.filter(e => e.done)
    else if (filterDone === 'Open') result = result.filter(e => !e.done)
    result.sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')))
    return result
  }, [additionalLog, filterCategory, filterDone])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const summary = useMemo(() => {
    const hours = filtered.reduce((s, e) => s + (e.hours || 0), 0)
    const eff = filtered.filter(e => e.efficiency != null)
    const well = filtered.filter(e => e.wellbeing != null)
    return {
      total: filtered.length,
      hours: hours.toFixed(1),
      avgEff: eff.length ? (eff.reduce((s, e) => s + e.efficiency, 0) / eff.length).toFixed(1) : '—',
      avgWell: well.length ? (well.reduce((s, e) => s + e.wellbeing, 0) / well.length).toFixed(1) : '—',
    }
  }, [filtered])

  // Capacity view for the current week: study hours vs additional (lifestyle)
  // hours, drawn from the same derived weekly totals the Analysis page uses.
  const capacity = useMemo(() => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const wk = isoWeekOf(today)
    const entry = (weeklyHours || []).find(w => w.year === wk?.year && w.week === wk?.week)
    const total = entry?.total || 0
    const study = entry?.study || 0
    return {
      study,
      additional: Math.max(0, total - study),
      total,
      week: wk ? `W${wk.week}` : '',
    }
  }, [weeklyHours])

  const style = e => {
    const chip = getCategoryStyle(e.category)
    const effBar = getEfficiencyBar(e.efficiency)
    const wellBar = getWellbeingBar(e.wellbeing)
    return { chip, effBar, wellBar }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-400">Total Entries</p>
          <p className="text-xl font-bold text-slate-800">{summary.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-400">Total Hours</p>
          <p className="text-xl font-bold text-slate-800">{summary.hours}h</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-400">Avg Efficiency</p>
          <p className="text-xl font-bold text-slate-800">{summary.avgEff}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-400">Avg Wellbeing</p>
          <p className="text-xl font-bold text-slate-800">{summary.avgWell}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
        <p className="text-xs font-medium text-slate-500 mb-2">This week ({capacity.week}) — capacity</p>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-700">Study <span className="font-semibold tabular-nums">{capacity.study.toFixed(2)}h</span></span>
          <span className="text-amber-700">Additional <span className="font-semibold tabular-nums">{capacity.additional.toFixed(2)}h</span></span>
          <span className="text-slate-700 font-semibold">Total <span className="tabular-nums">{capacity.total.toFixed(2)}h</span></span>
          <span className="text-[11px] text-slate-400 ml-auto">Additional time counts toward weekly capacity, never study.</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1) }}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300">
          {categories.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
        </select>
        <select value={filterDone} onChange={e => { setFilterDone(e.target.value); setPage(1) }}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300">
          <option value="All">All status</option>
          <option value="Done">Done</option>
          <option value="Open">Open</option>
        </select>
        <span className="text-sm text-slate-400 self-center ml-auto">
          Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">Date</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">Category</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">What</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">Start</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">End</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">Hours</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">Eff</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">Well</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">Location</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">Note</th>
              <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3 w-14"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginated.map(entry => {
              const s = style(entry)
              return (
                <tr key={entry.id} className={`hover:bg-slate-50 group ${entry.done ? 'opacity-70' : ''}`}>
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{formatDate(entry.date)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.chip}`}>{normalizeCategory(entry.category)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 max-w-[180px]">
                    <span className="truncate inline-block max-w-[180px] align-bottom" title={entry.task || ''}>
                      {entry.task || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{entry.startTime ? entry.startTime.slice(0, 5) : '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{entry.endTime ? entry.endTime.slice(0, 5) : '—'}</td>
                  <td className="px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap">{(entry.hours || 0).toFixed(2)}h</td>
                  <td className="px-3 py-2.5">
                    {s.effBar ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 w-3">{entry.efficiency}</span>
                        <div className="w-10 bg-slate-100 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${s.effBar.color}`} style={{ width: `${s.effBar.pct}%` }} />
                        </div>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {s.wellBar ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 w-3">{entry.wellbeing}</span>
                        <div className="w-10 bg-slate-100 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${s.wellBar.color}`} style={{ width: `${s.wellBar.pct}%` }} />
                        </div>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{entry.location || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500 max-w-[140px]">
                    <span className="truncate inline-block max-w-[140px] align-bottom" title={entry.notes || ''}>
                      {entry.notes || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onLogAdditional(entry, entry.id)}
                        className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer" title="Edit">Edit</button>
                      <button onClick={() => { if (window.confirm(`Delete this additional-time entry (${formatDate(entry.date)} ${entry.category})?`)) deleteAdditionalEntry(entry.id) }}
                        className="text-xs text-red-400 hover:text-red-600 cursor-pointer" title="Delete">×</button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-300 text-sm">No additional-time entries yet — check off a work/exercise/obligation item in the Daily Planner, or add one above.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">Previous</button>
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum
            if (totalPages <= 7) pageNum = i + 1
            else if (safePage <= 4) pageNum = i + 1
            else if (safePage >= totalPages - 3) pageNum = totalPages - 6 + i
            else pageNum = safePage - 3 + i
            return (
              <button key={pageNum} onClick={() => setPage(pageNum)}
                className={`text-sm w-8 h-8 rounded-lg cursor-pointer ${safePage === pageNum ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {pageNum}
              </button>
            )
          })}
        </div>
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">Next</button>
      </div>
    </div>
  )
}
