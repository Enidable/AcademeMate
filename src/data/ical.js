// Minimal RFC 5545 (.ics) parser for university timetable files, with the
// recurrence (RRULE) expansion needed to flatten weekly schedules into concrete
// dated events. Output rows match the Calendar tab header.

const DAY_INDEX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

let _counter = 0
function nextUid() {
  _counter += 1
  return `am-import-${Date.now()}-${_counter}`
}

// Split the folded ICS text into logical content lines.
function unfoldLines(text) {
  const raw = text.split(/\r?\n/)
  const lines = []
  for (const line of raw) {
    if (/^[ \t]/.test(line) && lines.length) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

function parseContentLine(line) {
  const idx = line.indexOf(':')
  if (idx < 0) return null
  const meta = line.slice(0, idx)
  const value = line.slice(idx + 1)
  const parts = meta.split(';')
  const name = parts[0].toUpperCase()
  const params = {}
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq > 0) {
      const k = p.slice(0, eq).toUpperCase()
      params[k] = p.slice(eq + 1).split(',').map(s => s.trim())
    }
  }
  return { name, params, value }
}

function unescapeText(v) {
  return (v || '').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, '\n').replace(/\\\\(?![nN])/g, '\\')
}

// Parse "YYYYMMDD[THHMMSS[Z]]" into a local Date. Floating times (no Z) are
// treated as local wall time, which is what university calendars produce.
function parseIcalDate(value) {
  if (!value) return null
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/)
  if (!match) return null
  const [, y, mo, d, hh, mm] = match
  const date = new Date(+y, +mo - 1, +d, +(hh || 0), +(mm || 0), +(match[6] || 0))
  return date
}

function parseDuration(value) {
  const m = /P(?:(?:(\d+)D)?(?:T)?(?:(\d+)H)?(?:(\d+)M)?)/i.exec(value || '')
  return (parseInt(m?.[1] || 0, 10) * 1440) + (parseInt(m?.[2] || 0, 10) * 60) + parseInt(m?.[3] || 0, 10)
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtTime(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Start of the (Monday-first) week containing `d`, at start-of-day.
function mondayOf(d) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7))
  out.setHours(0, 0, 0, 0)
  return out
}

// Expand a single VEVENT into concrete occurrences within [fromDate, toDate].
function expandEvent(ev, fromDate, toDate, source) {
  if (!ev.start) return []
  const results = []
  const days = ev.rrule?.freq === 'DAILY'
    ? null
    : new Set((ev.rrule?.byday?.length ? ev.rrule.byday : [ev.start.getDay()]))

  const occurrences = []
  const rule = ev.rrule

  if (!rule) {
    occurrences.push(ev.start)
  } else if (rule.freq === 'WEEKLY') {
    const interval = rule.interval || 1
    const until = rule.until
    const count = rule.count || Infinity
    const weekCursor = mondayOf(ev.start)
    let n = 0
    for (let w = 0; w < 400 && n < count && (!until || weekCursor <= until); w++) {
      if (w % interval === 0) {
        const sortedDays = Array.from(days).sort((a, b) => a - b)
        for (const day of sortedDays) {
          const occ = new Date(weekCursor)
          occ.setDate(weekCursor.getDate() + ((day + 6) % 7))
          occ.setHours(ev.start.getHours(), ev.start.getMinutes(), ev.start.getSeconds(), ev.start.getMilliseconds())
          if (until && occ > until) continue
          if (occ < fromDate) continue
          occurrences.push(occ)
          n += 1
          if (n >= count) break
        }
      }
      weekCursor.setDate(weekCursor.getDate() + 7)
    }
  } else if (rule.freq === 'DAILY') {
    const interval = rule.interval || 1
    const until = rule.until
    const count = rule.count || Infinity
    let cur = new Date(ev.start)
    let n = 0
    while (n < count && (!until || cur <= until) && cur.getFullYear() <= toDate.getFullYear() + 1) {
      const occ = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(),
        ev.start.getHours(), ev.start.getMinutes(), ev.start.getSeconds(), ev.start.getMilliseconds())
      if (occ >= fromDate && (!until || occ <= until)) {
        occurrences.push(occ)
        n += 1
      }
      cur.setDate(cur.getDate() + interval)
    }
  } else {
    occurrences.push(ev.start)
  }

  for (const rd of ev.rdate) occurrences.push(rd)

  const exKey = new Set(ev.exdate.map(d => d.getTime()))
  for (const occ of occurrences) {
    if (exKey.has(occ.getTime())) continue
    if (occ < fromDate || occ > toDate) continue
    if (ev.status === 'CANCELLED') continue
    const end = ev.durationMin ? new Date(occ.getTime() + ev.durationMin * 60000) : null
    results.push({
      date: fmtDate(occ),
      startTime: ev.dateOnly ? '' : fmtTime(occ),
      endTime: !ev.dateOnly && end ? fmtTime(end) : '',
      allDay: !!ev.dateOnly,
      summary: ev.summary,
      course: '',
      location: ev.location,
      description: ev.description,
      source,
      uid: ev.uid || nextUid(),
      status: ev.status,
    })
  }

  results.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
  return results
}

// Parse the text of one or more .ics files into flat Calendar-tab rows.
export function parseIcs(text, { from, to, source = 'ics' } = {}) {
  const fromDate = from || new Date(2000, 0, 1)
  const toDate = to || new Date(2100, 0, 1)
  const lines = unfoldLines(text)
  const events = []
  let inEvent = false
  let current = null

  for (const line of lines) {
    if (!line.trim()) continue
    const cl = parseContentLine(line)
    if (!cl) continue
    if (cl.name === 'BEGIN' && cl.value.toUpperCase() === 'VEVENT') {
      inEvent = true
      current = { exdate: [], rdate: [], status: 'CONFIRMED' }
      continue
    }
    if (cl.name === 'END' && cl.value.toUpperCase() === 'VEVENT') {
      if (current) events.push(current)
      inEvent = false
      current = null
      continue
    }
    if (!inEvent || !current) continue

    switch (cl.name) {
      case 'UID': current.uid = cl.value; break
      case 'SUMMARY': current.summary = unescapeText(cl.value); break
      case 'DESCRIPTION': current.description = unescapeText(cl.value); break
      case 'LOCATION': current.location = unescapeText(cl.value); break
      case 'STATUS': current.status = (cl.value || '').toUpperCase(); break
      case 'DTSTART': {
        const dateOnly = !cl.value.includes('T')
        current.dateOnly = dateOnly
        current.start = parseIcalDate(cl.value)
        break
      }
      case 'DTEND': current.end = parseIcalDate(cl.value); break
      case 'DURATION': current.durationMin = parseDuration(cl.value); break
      case 'RRULE': {
        const rule = {}
        for (const part of cl.value.split(';')) {
          const eq = part.indexOf('=')
          if (eq < 0) continue
          const key = part.slice(0, eq).toUpperCase()
          const value = part.slice(eq + 1)
          if (key === 'BYDAY') {
            rule.byday = value.split(',').map(s => DAY_INDEX[s.trim().toUpperCase().slice(-2)])
          } else if (key === 'COUNT') {
            rule.count = parseInt(value, 10)
          } else if (key === 'UNTIL') {
            rule.until = parseIcalDate(value)
          } else if (key === 'INTERVAL') {
            rule.interval = parseInt(value, 10)
          } else if (key === 'FREQ') {
            rule.freq = value.toUpperCase()
          }
        }
        current.rrule = rule
        break
      }
      case 'EXDATE': {
        const d = parseIcalDate(cl.value)
        if (d) current.exdate.push(d)
        break
      }
      case 'RDATE': {
        const d = parseIcalDate(cl.value)
        if (d) current.rdate.push(d)
        break
      }
      default: break
    }
  }

  for (const ev of events) {
    if (!ev.start) continue
    if (ev.durationMin == null) {
      if (ev.dateOnly) {
        ev.durationMin = 0
      } else if (ev.end) {
        ev.durationMin = Math.max(0, Math.round((ev.end - ev.start) / 60000))
      } else {
        ev.durationMin = 60
      }
    }
  }

  const rows = []
  for (const ev of events) {
    rows.push(...expandEvent(ev, fromDate, toDate, source))
  }
  return rows
}

// De-duplicate expanded rows on import: same uid+date+start = same event.
export function dedupeCalendarRows(rows) {
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const key = `${r.uid || ''}|${r.date}|${r.startTime}`
    if (r.uid && seen.has(key)) continue
    if (r.uid) seen.add(key)
    out.push(r)
  }
  return out
}