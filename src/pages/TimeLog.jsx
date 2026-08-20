import { useState, useMemo } from 'react'
import { formatDate, formatTime, getCourseStyle, getCategoryStyle, getEfficiencyBar, getWellbeingBar, normalizeCategory, truncate, isCourseActive } from '../utils/helpers'
import { useAppData } from '../context/AppDataContext'
import { AddSessionModal } from '../components/forms/Modals'

const PAGE_SIZE = 25

export default function TimeLog({ entries }) {
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [filterCourse, setFilterCourse] = useState('All')
  const [filterCategory, setFilterCategory] = useState('All')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null)

  const { deleteSession, masterCourses } = useAppData()

  const colorByCourse = useMemo(() => {
    const m = {}
    for (const c of masterCourses || []) m[c.course] = c.color
    return m
  }, [masterCourses])

  const masterMap = useMemo(() => {
    const m = {}
    for (const c of masterCourses || []) m[c.course] = c
    return m
  }, [masterCourses])

  const courses = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const set = new Set(entries.map(e => e.course))
    const names = Array.from(set).sort()
    const active = names.filter(n => isCourseActive(masterMap[n], today))
    const inactive = names.filter(n => !active.includes(n))
    return ['All', ...active, ...inactive]
  }, [entries, masterMap])

  const categories = useMemo(() => {
    const set = new Set(entries.map(e => normalizeCategory(e.category)))
    return ['All', ...Array.from(set).sort()]
  }, [entries])

  const filtered = useMemo(() => {
    let result = [...entries]
    if (filterCourse !== 'All') result = result.filter(e => e.course === filterCourse)
    if (filterCategory !== 'All') result = result.filter(e => normalizeCategory(e.category) === filterCategory)
    result.sort((a, b) => {
      let valA, valB
      switch (sortKey) {
        case 'date': valA = a.date + ' ' + a.startTime; valB = b.date + ' ' + b.startTime; break
        case 'startTime': valA = a.startTime; valB = b.startTime; break
        case 'durationHours': valA = a.durationHours; valB = b.durationHours; break
        case 'efficiency': valA = a.efficiency ?? -1; valB = b.efficiency ?? -1; break
        case 'wellbeing': valA = a.wellbeing ?? -1; valB = b.wellbeing ?? -1; break
        case 'project': valA = (a.project || '').toLowerCase(); valB = (b.project || '').toLowerCase(); break
        default: valA = a.date; valB = b.date
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1
      if (valA > valB) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return result
  }, [entries, sortKey, sortDir, filterCourse, filterCategory])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const summary = useMemo(() => {
    const total = filtered.length
    const hours = filtered.reduce((s, e) => s + e.durationHours, 0)
    const eff = filtered.filter(e => e.efficiency != null)
    const well = filtered.filter(e => e.wellbeing != null)
    return {
      total,
      hours: hours.toFixed(1),
      avgEff: eff.length ? (eff.reduce((s, e) => s + e.efficiency, 0) / eff.length).toFixed(1) : '—',
      avgWell: well.length ? (well.reduce((s, e) => s + e.wellbeing, 0) / well.length).toFixed(1) : '—',
    }
  }, [filtered])

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    setPage(1)
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <span className="text-slate-300 ml-1">↕</span>
    return <span className="text-slate-600 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const sortableHeader = (label, col) => (
    <th
      className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3 cursor-pointer hover:text-slate-700 select-none"
      onClick={() => handleSort(col)}
    >
      {label}<SortIcon col={col} />
    </th>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-400">Total Entries</p>
          <p className="text-xl font-bold text-slate-800">{summary.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-400">Total Hours</p>
          <p className="text-xl font-bold text-slate-800">{summary.hours}</p>
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

      <div className="flex flex-wrap gap-3">
        <select
          value={filterCourse}
          onChange={e => { setFilterCourse(e.target.value); setPage(1) }}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          {courses.map((c, i) => {
            const isActive = i > 0 && isCourseActive(masterMap[c])
            return <option key={c} value={c}>{c === 'All' ? 'All Courses' : `${isActive ? '● ' : ''}${truncate(c, 50)}`}</option>
          })}
        </select>
        <select
          value={filterCategory}
          onChange={e => { setFilterCategory(e.target.value); setPage(1) }}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-slate-400 self-center ml-auto">
          Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {sortableHeader('Date', 'date')}
              {sortableHeader('Start', 'startTime')}
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">End</th>
              {sortableHeader('Hours', 'durationHours')}
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">Course</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">Category</th>
              {sortableHeader('Project', 'project')}
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">Location</th>
              {sortableHeader('Eff', 'efficiency')}
              {sortableHeader('Well', 'wellbeing')}
               <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3">Transport</th>
               <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginated.map((entry, i) => {
              const style = getCourseStyle(entry.course, colorByCourse[entry.course])
              const effBar = getEfficiencyBar(entry.efficiency)
              const wellBar = getWellbeingBar(entry.wellbeing)
              return (
                <tr key={`${entry.date}-${entry.startTime}-${i}`} className="hover:bg-slate-50 group">
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{formatDate(entry.date)}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{formatTime(entry.startTime)}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{formatTime(entry.endTime)}</td>
                  <td className="px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap">{entry.durationHours.toFixed(2)}h</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                      <span className="text-slate-700 truncate max-w-[160px]" title={entry.course}>
                        {truncate(entry.course, 30)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${getCategoryStyle(entry.category)}`}>
                      {normalizeCategory(entry.category)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 max-w-[100px] truncate" title={entry.project || ''}>
                    {entry.project || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{entry.location}</td>
                  <td className="px-3 py-2.5">
                    {effBar ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 w-3">{entry.efficiency}</span>
                        <div className="w-12 bg-slate-100 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${effBar.color}`} style={{ width: `${effBar.pct}%` }} />
                        </div>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {wellBar ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 w-3">{entry.wellbeing}</span>
                        <div className="w-12 bg-slate-100 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${wellBar.color}`} style={{ width: `${wellBar.pct}%` }} />
                        </div>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                    {entry.transportMode ? (
                      <span title={entry.commuteTime != null ? `${entry.commuteTime} min` : ''}>
                        {entry.transportMode}{entry.commuteTime != null ? ` · ${entry.commuteTime}m` : ''}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditing(entry)} className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer" title="Edit">Edit</button>
                      <button onClick={() => { if (window.confirm(`Delete this study session (${formatDate(entry.date)} ${entry.course})?`)) deleteSession(entry.id) }} className="text-xs text-red-400 hover:text-red-600 cursor-pointer" title="Delete">×</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={safePage <= 1}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          Previous
        </button>
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
        <button
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={safePage >= totalPages}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          Next
        </button>
      </div>

      <AddSessionModal
        key={editing?.id || 'session-edit'}
        open={!!editing}
        initial={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}
