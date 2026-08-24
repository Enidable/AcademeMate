import { useMemo } from 'react'
import { getCourseStyle } from '../utils/helpers'
import { typeSymbol, inferEventType } from '../drive/driveClient'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_START = 6 * 60
const DAY_END = 22 * 60
const DAY_LEN = DAY_END - DAY_START

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isSameDay(a, b) {
  return dateKey(a) === dateKey(b)
}

function toMin(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim())
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

function layoutTimed(items) {
  const placed = []
  const cols = []
  for (const ev of items) {
    const s = toMin(ev.startTime)
    if (s == null) continue
    let e = toMin(ev.endTime)
    if (e == null || e <= s) e = s + 60
    let col = -1
    for (let i = 0; i < cols.length; i++) {
      if (!cols[i].some(x => x.end > s)) { col = i; break }
    }
    if (col < 0) { cols.push([]); col = cols.length - 1 }
    cols[col].push({ end: e })
    placed.push({ ev, s, e, col })
  }
  const n = Math.max(cols.length, 1)
  const daySpan = 960
  return placed.map(p => {
    const top = ((p.s - DAY_START) / daySpan) * 100
    const bottom = Math.min(100, ((p.e - DAY_START) / daySpan) * 100)
    const h = Math.max(bottom - Math.max(0, top), 2.2)
    return {
      ...p,
      top: Math.max(0, top),
      height: h,
      width: 100 / n,
      left: (100 / n) * p.col,
    }
  })
}

// Fixed-scale weekly timetable. University day runs 06:00-22:00; timed events
// are positioned proportionally so gaps between classes are visible. Deadlines
// and all-day items sit in a chip row above the grid.
export default function WeekGrid({ week, byDay, masterCourses, noteMap = null, hourHeight = 44 }) {
  const today = useMemo(() => new Date(), [])
  const GRID_H = hourHeight * (DAY_LEN / 60)

  const eventColor = useMemo(() => {
    const colorByCourse = {}
    for (const c of masterCourses || []) colorByCourse[c.course] = c.color
    const cache = {}
    return name => {
      if (!cache[name]) cache[name] = name
        ? getCourseStyle(name, colorByCourse[name])
        : { dot: 'bg-indigo-500', bg: 'bg-indigo-100', text: 'text-indigo-700' }
      return cache[name]
    }
  }, [masterCourses])

  const days = useMemo(() => week.map((d) => {
    const key = dateKey(d)
    const items = byDay?.[key] || []
    const top = items.filter(e => e.allDay || toMin(e.startTime) == null)
    const timed = layoutTimed(items.filter(e => !e.allDay && toMin(e.startTime) != null))
    return { date: d, key, isToday: isSameDay(d, today), top, timed }
  }), [week, byDay, today])

  const hasAllDay = days.some(d => d.top.length > 0)

  const hourLabel = h => `${String(h).padStart(2, '0')}:00`

  return (
    <div>
      <div className="flex">
        <div className="w-10 shrink-0" />
        {days.map((d, i) => (
          <div key={d.key} className="flex-1 min-w-0">
            <div className={`text-center text-xs font-medium pb-1.5 border-b mb-1.5 ${d.isToday ? 'text-indigo-600' : 'text-slate-500'}`}>
              <div>{DOW[i]}</div>
              <div className={`inline-block rounded-full px-1.5 min-w-[22px] ${d.isToday ? 'bg-indigo-600 text-white' : ''}`}>{d.date.getDate()}</div>
            </div>
          </div>
        ))}
      </div>

      {hasAllDay && (
        <div className="flex mb-1">
          <div className="w-10 shrink-0" />
          {days.map(d => (
            <div key={d.key} className="flex-1 min-w-0 pr-1 space-y-0.5">
              {d.top.map(e => {
                const style = e.isDeadline
                  ? { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' }
                  : eventColor(e.course)
                const symbol = typeSymbol(e.isDeadline ? (e.type || 'deadline') : inferEventType(e.summary, e.description))
                return (
                  <div key={e.id || `${e.date}|${e.summary}`} className={`rounded border border-transparent ${style.bg} ${style.text} px-1.5 py-0.5 text-[10px] leading-tight truncate`} style={{ ...style.bgCss, ...style.textCss }} title={e.summary}>
                    <span className="mr-0.5">{symbol}</span>
                    {e.isDeadline ? `Due: ${e.description || e.summary}` : e.summary}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <div className="flex">
        <div className="w-10 shrink-0 relative" style={{ height: GRID_H }}>
          {Array.from({ length: 17 }, (_, i) => {
            const h = DAY_START / 60 + i
            return (
              <div key={h} className="absolute right-1.5 text-[10px] text-slate-400 -translate-y-1/2" style={{ top: ((h * 60 - DAY_START) / DAY_LEN) * 100 + '%' }}>
                {hourLabel(h)}
              </div>
            )
          })}
        </div>

        {days.map(d => (
          <div key={d.key} className="flex-1 min-w-0 relative border-l border-slate-100" style={{ height: GRID_H }}>
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: ((i + 1) / 16) * 100 + '%' }} />
            ))}

            {d.timed.map((p) => {
              const ev = p.ev
              const style = ev.isDeadline
                ? { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' }
                : eventColor(ev.course)
              const symbol = typeSymbol(ev.isDeadline ? (ev.type || 'deadline') : inferEventType(ev.summary, ev.description))
              const note = !ev.isDeadline && ev.lectureId && noteMap ? noteMap.get(`${ev.course}|${ev.lectureId}`) : ''
              return (
                <div key={ev.id || `${ev.date}|${ev.summary}|${ev.startTime}`}
                  className="absolute flex overflow-hidden rounded"
                  style={{ top: p.top + '%', height: p.height + '%', left: p.left + '%', width: p.width + '%' }}
                  title={`${ev.summary}${ev.endTime ? ` (${ev.startTime}–${ev.endTime})` : ''}`}>
                  <span className={`w-1 shrink-0 rounded-l ${style.dot}`} style={style.dotCss} />
                  <div className={`flex-1 min-w-0 ${style.bg} ${style.text} px-1 py-0.5`} style={{ ...style.bgCss, ...style.textCss }}>
                    <div className="text-[10px] font-medium leading-tight truncate">
                      <span className="mr-0.5">{symbol}</span>
                      {ev.isDeadline ? `Due: ${ev.description || ev.summary}` : ev.summary}
                    </div>
                    {note && <div className="text-[9px] opacity-70 leading-tight truncate">{note}</div>}
                    {p.height > 14 && !note && (
                      <div className="text-[9px] opacity-70 leading-tight truncate">
                        {ev.startTime}{ev.endTime ? `–${ev.endTime}` : ''}
                        {ev.location ? ` · ${ev.location}` : ''}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}