import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { getCourseStyle } from '../utils/helpers'
import { typeSymbol, inferEventType } from '../drive/driveClient'
import WeekGrid from '../components/WeekGrid'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Google Calendar event colours (1-10). 11 (Tomato) is reserved for exams and
// deliberately excluded here so courses can never take it.
const GCAL_COLORS = [
  { id: '1', name: 'Lavender' },
  { id: '2', name: 'Sage' },
  { id: '3', name: 'Grape' },
  { id: '4', name: 'Flamingo' },
  { id: '5', name: 'Banana' },
  { id: '6', name: 'Tangerine' },
  { id: '7', name: 'Peacock' },
  { id: '8', name: 'Graphite' },
  { id: '9', name: 'Blueberry' },
  { id: '10', name: 'Basil' },
]

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
    calendarEvents, deadlines, content, hasDrive, driveError, masterCourses,
    importCalendarFromDrive, importGoogleCalendar, listUserCalendars, pushCalendarToGoogle,
  } = useAppData()

  const [mode, setMode] = useState('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [colorOpen, setColorOpen] = useState(false)
  const [calImportOpen, setCalImportOpen] = useState(false)
  const [calImportList, setCalImportList] = useState([])
  const [calImportError, setCalImportError] = useState('')
  const [courseColors, setCourseColors] = useState(() => {
    try { return JSON.parse(localStorage.getItem('am_calendar_colors')) || {} } catch { return {} }
  })

  const autoColor = i => String((i % 10) + 1)

  function openColors() {
    const map = { ...courseColors }
    ;(masterCourses || []).forEach((c, i) => {
      if (c?.course && !map[c.course]) map[c.course] = autoColor(i)
    })
    setCourseColors(map)
    setColorOpen(true)
  }

  async function confirmPush() {
    try { localStorage.setItem('am_calendar_colors', JSON.stringify(courseColors)) } catch {}
    setColorOpen(false)
    await runPush(courseColors)
  }

  const eventColor = useMemo(() => {
    const colorByCourse = {}
    for (const c of masterCourses || []) colorByCourse[c.course] = c.color
    const map = {}
    return (name) => {
      if (!map[name]) map[name] = name ? getCourseStyle(name, colorByCourse[name]) : { dot: 'bg-indigo-500', bg: 'bg-indigo-100', text: 'text-indigo-700' }
      return map[name]
    }
  }, [masterCourses])

  // Syllabus notes for each scheduled calendar element, keyed by course|lectureId,
  // so a class's note shows in its calendar chip without distorting the layout.
  const noteByLecture = useMemo(() => {
    const m = new Map()
    for (const i of content || []) {
      if (i.course && i.contentId && i.description) m.set(`${i.course}|${i.contentId}`, i.description)
    }
    return m
  }, [content])

  const eventSymbol = e => e.isDeadline
    ? typeSymbol(e.type || 'deadline')
    : typeSymbol(inferEventType(e.summary, e.description))

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

  async function runPush(colorOverrides = null) {
    setBusy('push')
    setMessage('')
    try {
      const res = await pushCalendarToGoogle(colorOverrides)
      const parts = [`${res.inserted} inserted`, `${res.updated} updated`]
      if (res.deadlinesInserted) parts.push(`${res.deadlinesInserted} deadline${res.deadlinesInserted > 1 ? 's' : ''} added`)
      setMessage(`AcademeMate calendar: ${parts.join(', ')}.`)
    } catch (e) {
      setMessage(`Push failed: ${e.message}`)
    } finally {
      setBusy('')
    }
  }

  async function openCalImport() {
    setCalImportError('')
    setCalImportOpen(true)
    setCalImportList([])
    try {
      const cals = await listUserCalendars()
      setCalImportList(cals.filter(c => c.summary !== 'AcademeMate'))
    } catch (e) {
      setCalImportError(`Could not list your calendars: ${e.message}`)
    }
  }

  async function runCalImport(cal) {
    setBusy('calimport')
    setMessage('')
    try {
      const res = await importGoogleCalendar(cal.id, cal.summary)
      setCalImportOpen(false)
      setMessage(`Imported ${res.added} event${res.added === 1 ? '' : 's'} from "${res.source}". ${res.imported - res.added} were already present.`)
    } catch (e) {
      setCalImportError(e.message)
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
      ? { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', border: 'border-red-200' }
      : eventColor(e.course)
    const time = e.allDay ? 'All day' : (e.startTime ? `${e.startTime}${e.endTime ? '–' + e.endTime : ''}` : '')
    const note = !e.isDeadline && e.lectureId ? noteByLecture.get(`${e.course}|${e.lectureId}`) : ''
    const symbol = eventSymbol(e)
    return (
      <div key={e.id || `${e.date}|${e.summary}|${e.startTime}`}
        className={`rounded border ${style.border || 'border-transparent'} ${style.bg} ${style.text} px-1.5 py-0.5 text-[11px] leading-tight ${compact ? '' : 'mb-1'}`}
        style={{ ...style.borderCss, ...style.bgCss, ...style.textCss }} title={e.summary}>
        <div className="truncate">
          {!compact && time && <span className="opacity-70 mr-1">{time}</span>}
          {compact && e.startTime && <span className="opacity-70 mr-1">{e.startTime}</span>}
          <span className="mr-0.5">{symbol}</span>
          <span className="truncate">{e.isDeadline ? `Due: ${e.description}` : e.summary}</span>
        </div>
        {note && <div className="truncate text-[9px] opacity-70">{note}</div>}
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
          <button onClick={openCalImport} disabled={!hasDrive || busy !== ''}
            className="text-xs px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 cursor-pointer">
            {busy === 'calimport' ? 'Importing…' : '⇄ Import Google calendar'}
          </button>
          <button onClick={openColors} disabled={!hasDrive || calendarEvents.length === 0 || busy !== ''}
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

      {calImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setCalImportOpen(false)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h2 className="font-semibold text-slate-800">Import a Google calendar</h2>
              <button onClick={() => setCalImportOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer">&times;</button>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500 mb-3">
                Pick one of your calendars — its events are added to the AcademeMate calendar view (and pushed to the AcademeMate calendar on the next push). Re-importing is safe.
              </p>
              {calImportError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{calImportError}</div>
              )}
              {calImportList.length === 0 && !calImportError && (
                <div className="text-xs text-slate-400 text-center py-4">Loading your calendars…</div>
              )}
              <div className="space-y-1.5">
                {calImportList.map(cal => (
                  <button key={cal.id} onClick={() => runCalImport(cal)} disabled={busy !== ''}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
                    <span className="text-slate-700">{cal.summary}</span>
                    {cal.primary && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">primary</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {colorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setColorOpen(false)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h2 className="font-semibold text-slate-800">Calendar push colors</h2>
              <button onClick={() => setColorOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer">&times;</button>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500 mb-3">
                Pick a color per course. Exam events are always <span className="inline-block rounded px-1.5 py-0.5 bg-red-600 text-white text-[10px]">Tomato</span> — that color is reserved for exams, so it's not offered below.
              </p>
              <div className="space-y-2">
                {(masterCourses || []).filter(c => c?.course).map((c, i) => (
                  <div key={c.course} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-700 truncate">{c.course}</span>
                    <select value={courseColors[c.course] || autoColor(i)}
                      onChange={e => setCourseColors(m => ({ ...m, [c.course]: e.target.value }))}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white">
                      {GCAL_COLORS.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
                    </select>
                  </div>
                ))}
                {(!masterCourses || masterCourses.length === 0) && (
                  <div className="text-xs text-slate-400">No courses found — add some in the Courses tab.</div>
                )}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setColorOpen(false)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">Cancel</button>
                <button onClick={confirmPush} disabled={busy !== ''}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 cursor-pointer">
                  {busy === 'push' ? 'Pushing…' : 'Push with these colors'}
                </button>
              </div>
            </div>
          </div>
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
        <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
          <div className="min-w-[720px]">
            <WeekGrid week={week} byDay={byDay} masterCourses={masterCourses} noteMap={noteByLecture} />
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