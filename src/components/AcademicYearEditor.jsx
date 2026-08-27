import { useState } from 'react'

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']
const QUARTER_COLORS = {
  Q1: 'text-blue-600',
  Q2: 'text-purple-600',
  Q3: 'text-indigo-600',
  Q4: 'text-rose-600',
}

// Compact academic-year structure editor: per year, the date range of each
// quartile (Q1-Q4) plus holiday periods. Lives at the top of the Courses tab,
// sized to fit alongside two course rows.
//
// Data shape (per year): { year, quarters: { Q1: {start, finish}, … }, holidays: [{label, start, finish}] }
export default function AcademicYearEditor({ academicYears, onChange, courses }) {
  const years = (academicYears || []).map(y => y.year)
  const [selYear, setSelYear] = useState(() => {
    if (years.length > 0) return years[0]
    const now = new Date().getFullYear()
    return String(now)
  })
  const [holidaysOpen, setHolidaysOpen] = useState(false)

  const yearEntry = (academicYears || []).find(y => y.year === selYear)
  const quarters = yearEntry?.quarters || {}
  const holidays = yearEntry?.holidays || []

  // Upsert the selected year with a new quarters/holidays object, then save.
  function patch(mutate) {
    const current = (academicYears || []).find(y => y.year === selYear)
    const next = { year: selYear, quarters: { Q1: {}, Q2: {}, Q3: {}, Q4: {} }, holidays: [], ...current }
    mutate(next)
    const rest = (academicYears || []).filter(y => y.year !== selYear)
    const hasContent = Object.values(next.quarters).some(q => q.start || q.finish) || next.holidays.length > 0
    onChange(hasContent ? [...rest, next].sort((a, b) => a.year.localeCompare(b.year)) : rest)
  }

  function setQuarter(period, field, value) {
    patch(y => { y.quarters[period] = { ...y.quarters[period], [field]: value || null } })
  }

  function addHoliday() {
    patch(y => y.holidays.push({ label: '', start: null, finish: null }))
    setHolidaysOpen(true)
  }

  function setHoliday(i, field, value) {
    patch(y => {
      if (!y.holidays[i]) return
      y.holidays[i] = { ...y.holidays[i], [field]: value }
    })
  }

  function removeHoliday(i) {
    patch(y => { y.holidays.splice(i, 1) })
  }

  // The year dropdown: any years already defined, plus every year a course
  // mentions in its start/finish, so adding the structure is one click.
  const candidateYears = [...new Set([
    ...years,
    ...(courses || []).flatMap(c => [c.start, c.finish]).filter(Boolean).map(d => String(d).slice(0, 4)),
    String(new Date().getFullYear()),
  ])].sort().reverse()

  const inputCls = 'w-[118px] text-[10px] px-1 py-0.5 border border-slate-200 rounded focus:outline-none focus:border-slate-400 bg-white'

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 mb-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap">Academic year</span>
        <select value={selYear} onChange={e => setSelYear(e.target.value)}
          className="text-[11px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white cursor-pointer">
          {candidateYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-[10px] text-slate-400">Quartile date ranges:</span>
        {QUARTERS.map(q => (
          <label key={q} className="flex items-center gap-1 whitespace-nowrap">
            <span className={`text-[10px] font-semibold ${QUARTER_COLORS[q]}`}>{q}</span>
            <input type="date" value={quarters[q]?.start || ''} onChange={e => setQuarter(q, 'start', e.target.value)} className={inputCls} title={`${q} start`} />
            <span className="text-[10px] text-slate-400">–</span>
            <input type="date" value={quarters[q]?.finish || ''} onChange={e => setQuarter(q, 'finish', e.target.value)} className={inputCls} title={`${q} finish`} />
          </label>
        ))}
        <button onClick={() => setHolidaysOpen(o => !o)} className="ml-auto text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer whitespace-nowrap">
          Holidays{holidays.length > 0 ? ` (${holidays.length})` : ''}
        </button>
      </div>

      {holidaysOpen && (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
          {holidays.map((h, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <input value={h.label || ''} onChange={e => setHoliday(i, 'label', e.target.value)}
                placeholder="Label (e.g. Summer break)" className="w-40 text-[10px] px-1 py-0.5 border border-slate-200 rounded focus:outline-none focus:border-slate-400 bg-white" />
              <input type="date" value={h.start || ''} onChange={e => setHoliday(i, 'start', e.target.value)} className={inputCls} />
              <span className="text-[10px] text-slate-400">–</span>
              <input type="date" value={h.finish || ''} onChange={e => setHoliday(i, 'finish', e.target.value)} className={inputCls} />
              <button onClick={() => removeHoliday(i)} className="text-[10px] text-red-400 hover:text-red-600 cursor-pointer">×</button>
            </div>
          ))}
          <button onClick={addHoliday} className="text-[11px] text-indigo-600 hover:text-indigo-500 cursor-pointer">+ Add holiday</button>
        </div>
      )}
    </div>
  )
}
