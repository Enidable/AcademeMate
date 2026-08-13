import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'

const urgencyColors = {
  'Complete': 'bg-green-100 text-green-700 border-green-200',
  'Extremely High': 'bg-red-100 text-red-700 border-red-200',
  'High': 'bg-orange-100 text-orange-700 border-orange-200',
  'Medium': 'bg-amber-100 text-amber-700 border-amber-200',
  'Low': 'bg-slate-100 text-slate-500 border-slate-200',
}

export default function Calendar() {
  const { deadlines, deleteDeadline } = useAppData()
  const [filter, setFilter] = useState('all')

  const grouped = useMemo(() => {
    const map = {}
    for (const d of deadlines) {
      if (filter === 'pending' && d.done) continue
      if (filter === 'done' && !d.done) continue
      const key = d.date || 'unknown'
      if (!map[key]) map[key] = []
      map[key].push(d)
    }
    const sorted = Object.entries(map).sort((a, b) => new Date(a[0]) - new Date(b[0]))
    return sorted
  }, [deadlines, filter])

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500">Filter:</span>
        {[
          { label: 'All', value: 'all' },
          { label: 'Pending', value: 'pending' },
          { label: 'Done', value: 'done' },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`text-xs px-3 py-1 rounded-full cursor-pointer ${
              filter === f.value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-auto">{deadlines.length} total</span>
      </div>

      {grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">No deadlines found.</div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([date, items]) => (
            <div key={date} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-700">
                {formatDate(date)}
              </div>
              <div className="divide-y divide-slate-100">
                {items.map((d, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${d.done ? 'bg-green-400' : 'bg-amber-400'}`} />
                      <span className={`text-slate-700 truncate ${d.done ? 'line-through text-slate-400' : ''}`}>
                        {d.description}
                      </span>
                      {d.time > 0 && <span className="text-xs text-slate-400 shrink-0">({d.time}h)</span>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ml-3 ${urgencyColors[d.urgency] || 'bg-slate-100 text-slate-500'}`}>
                      {d.urgency}
                    </span>
                    {d.id && (
                      <button onClick={() => deleteDeadline(d.id)} className="ml-2 text-xs text-red-400 hover:text-red-600 cursor-pointer">×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
