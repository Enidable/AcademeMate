import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { getCourseStyle } from '../utils/helpers'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
  d.setHours(12, 0, 0, 0)
  return d
}

function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setHours(12, 0, 0, 0)
  return addDays(d, -((d.getDay() + 6) % 7))
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isSameDay(a, b) {
  return dateKey(a) === dateKey(b)
}

function fullLabel(date) {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  const grid = []
  for (let w = 0; w < 6; w++) {
    const row = []
    for (let d = 0; d < 7; d++) {
      row.push(addDays(first, w * 7 + d - ((first.getDay() + 6) % 7)))
    }
    grid.push(row)
  }
  return grid
}

export default function Calendar() {
  const {
    calendarEvents, deadlines, hasDrive, driveError,
    importCalendarFromDrive, pushCalendarToGoogle,
  } = useAppData()

  const [mode, setMode] = useState('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  const eventColor = useMemo(() => {
    const map = {}
    return (name) => {
      if (!map[name]) map[name] = name ? getCourseStyle(name) : { dot: 'bg-indigo-500', bg: 'bg-indigo-100', text: 'text-indigo-700' }
      return map[name]
    }
  }, [])

  const byDay = useMemo(() => {
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
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.startTime || '99').localeCompare(b.startTime || '99'))
    }
    return map
  }, [calendarEvents, deadlines])

  async function runImport() {
    setBusy('import')
    setMessage('')
    try {
      const res = await importCalendarFromDrive()
      setMessage(`Imported ${res.imported} events from ${res.files} .ics file(s).`)
    } catch (e) {
      setMessage(`Import failed: ${e.message}`)
    } finally {
      setBusy('')
    }
  }

  async function runPush() {
    setBusy('push')
    setMessage('')
    try {
      const res = await pushCalendarToGoogle()
      setMessage(`AcademeMate calendar: ${res.inserted} inserted, ${res.updated} updated.`)
    } catch (e) {
      setMessage(`Push failed: ${e.message}`)
    } finally {
      setBusy('')
    }
  }

  function nav(dir) {
    if (mode === 'week') setAnchor(addDays(mondayOf(anchor), dir * 7))
    else if (mode === 'month') setAnchor(addDays(anchor, dir * 30))
    else setAnchor(addDays(anchor, dir * 365))
  }

  const eventChip = (e, compact = false) => {
    const style = e.isDeadline
      ? { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400', border: 'border-amber-200' }
      : eventColor(e.course)
    const time = e.allDay ? 'All day' : (e.startTime ? `${e.startTime}${e.endTime ? '–' + e.endTime : ''}` : '')
    return (
      <div key={e.id || `${e.date}|${e.summary}|${e.startTime}`}
        className={`rounded border ${style.border || 'border-transparent'} ${style.bg} ${style.text} px-1.5 py-0.5 text-[11px] leading-tight truncate ${compact ? '' : 'mb-1'}`} title={e.summary}>
        {!compact && time && <span className="opacity-70 mr-1">{time}</span>}
        {compact && e.startTime && <span className="opacity-70 mr-1">{e.startTime}</span>}
        <span className="truncate">{e.isDeadline ? `Due: ${e.description}` : e.summary}</span>
      </div>
    )
  }

  // ---- Week view -------------------------------------------------------
  const week = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i))
  // ---- Month view ------------------------------------------------------
  const grid = monthGrid(anchor.getFullYear(), anchor.getMonth())
  const today = new Date()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {['week', 'month', 'year'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`text-xs px-3 py-1.5 capitalize cursor-pointer ${mode === m ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {m}
            </button>
          ))}
        </div>
        <button onClick={() => nav(-1)} className="text-sm px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-slate-600">‹</button>
        <button onClick={() => setAnchor(new Date())} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-slate-600">Today</button>
        <button onClick={() => nav(1)} className="text-sm px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-slate-600">›</button>

        <span className="text-sm font-medium text-slate-700 ml-2">
          {mode === 'week' && `${fullLabel(week[0])} — ${fullLabel(week[6])}`}
          {mode === 'month' && `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`}
          {mode === 'year' && `${anchor.getFullYear()}`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={runImport} disabled={!hasDrive || busy !== ''}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer">
            {busy === 'import' ? 'Importing…' : '↧ Import .ics'}
          </button>
          <button onClick={runPush} disabled={!hasDrive || calendarEvents.length === 0 || busy !== ''}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 cursor-pointer">
            {busy === 'push' ? 'Pushing…' : '↥ Push to Google Calendar'}
          </button>
        </div>
      </div>

      {hasDrive && driveError && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{driveError}</div>}
      {message && (
        <div className={`text-xs rounded-lg px-3 py-2 border ${message.includes('failed') || message.includes('Failed') ? 'text-red-600 bg-red-50 border-red-100' : 'text-slate-600 bg-slate-50 border-slate-100'}`}>
          {message}
        </div>
      )}

      {!hasDrive && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
          Connect to Google Drive to import your timetable (Settings → Google Drive).
        </div>
      )}

      {hasDrive && calendarEvents.length === 0 && deadlines.length === 0 && mode !== 'year' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
          No events yet — drop your university .ics files into the “iCal” folder inside “AcademeMate - Study Tracking” on Drive, then press ↧ Import .ics.
        </div>
      )}

      {mode === 'week' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="grid grid-cols-7 gap-2">
            {week.map((d, i) => {
              const key = dateKey(d)
              const items = byDay[key] || []
              const isToday = isSameDay(d, today)
              return (
                <div key={i} className="min-h-[320px]">
                  <div className={`text-center text-xs font-medium pb-2 border-b mb-1 ${isToday ? 'text-indigo-600' : 'text-slate-500'}`}>
                    <div>{DOW[i]}</div>
                    <div className={`inline-block rounded-full px-1.5 ${isToday ? 'bg-indigo-600 text-white' : ''}`}>{d.getDate()}</div>
                  </div>
                  <div className="space-y-1">
                    {items.slice(0, 12).map(e => eventChip(e))}
                    {items.length > 12 && <div className="text-[10px] text-slate-400 pl-1">+{items.length - 12} more…</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {mode === 'month' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="grid grid-cols-7 gap-1 text-[10px] text-slate-400 mb-1">
            {DOW.map(d => <div key={d} className="text-center py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.flat().map((d, i) => {
              const key = dateKey(d)
              const items = byDay[key] || []
              const inMonth = d.getMonth() === anchor.getMonth()
              const isToday = isSameDay(d, today)
              return (
                <div key={i} onClick={() => { setMode('week'); setAnchor(d) }}
                  className={`min-h-[92px] rounded-lg border p-1 cursor-pointer ${inMonth ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100'} ${isToday ? 'ring-2 ring-indigo-500' : ''}`}>
                  <div className={`text-[10px] font-medium mb-0.5 ${isToday ? 'text-indigo-600' : inMonth ? 'text-slate-600' : 'text-slate-300'}`}>
                    {d.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {items.slice(0, 3).map(e => eventChip(e, true))}
                    {items.length > 3 && <div className="text-[9px] text-slate-400 pl-0.5">+{items.length - 3}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {mode === 'year' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }, (_, m) => (
            <MiniMonth key={m} year={anchor.getFullYear()} month={m} byDay={byDay} today={today} onPick={d => { setMode('month'); setAnchor(d) }} />
          ))}
        </div>
      )}
    </div>
  )
}

function MiniMonth({ year, month, byDay, today, onPick }) {
  const grid = monthGrid(year, month)
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="text-xs font-medium text-slate-700 mb-1.5">{MONTHS[month]} {year}</div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-slate-400 mb-0.5">
        {DOW.map(d => <div key={d}>{d[0]}</div>)}
      </div>
      {grid.map((row, ri) => (
        <div key={ri} className="grid grid-cols-7 gap-0.5">
          {row.map((d, di) => {
            const key = dateKey(d)
            const n = (byDay[key] || []).length
            const inMonth = d.getMonth() === month
            const isToday = isSameDay(d, today)
            return (
              <button key={di} onClick={() => onPick(d)}
                className={`aspect-square text-[9px] rounded-full cursor-pointer ${
                  isToday ? 'bg-indigo-600 text-white' : inMonth ? n > 0 ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500' : 'text-slate-300'
                }`}>
                {n > 0 ? n : d.getDate()}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}