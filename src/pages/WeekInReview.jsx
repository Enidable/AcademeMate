import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { formatDate, formatDateShort, getCourseStyle, truncate } from '../utils/helpers'
import { AddSessionModal } from '../components/forms/Modals'

const pad = n => String(n).padStart(2, '0')
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Monday of the week (Monday-first) that contains `d`.
function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

function addDays(d, days) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

// Resolve the human-readable label of a project/lecture ID on a course, so the
// recap list can show what the ID stands for as a tooltip. Best-effort: content
// rows first (they carry the description), grade components as a fallback.
function idLabel(course, id, content, gradeComponents) {
  if (!id) return ''
  for (const i of content || []) {
    if (i.course === course && i.contentId === id && (i.description || i.topic)) return i.description || i.topic
  }
  for (const g of gradeComponents || []) {
    if (g.course !== course) continue
    for (const c of g.components || []) {
      if (c.id === id && (c.notes || c.name)) return c.notes || c.name
    }
  }
  return ''
}

export default function WeekInReview() {
  const { inputLog, masterCourses, content, gradeComponents } = useAppData()
  const [monday, setMonday] = useState(() => mondayOf(new Date()))
  const [editing, setEditing] = useState(null)
  const [copied, setCopied] = useState(false)

  const fromISO = isoOf(monday)
  const toISO = isoOf(addDays(monday, 6))
  const label = `${formatDate(fromISO)} — ${formatDate(toISO)}`
  const isCurrentWeek = isoOf(mondayOf(new Date())) === fromISO

  const colorByCourse = useMemo(() => {
    const m = {}
    for (const c of masterCourses || []) m[c.course] = c.color
    return m
  }, [masterCourses])

  // Sessions of the selected week that carry a recap summary, oldest first.
  const recapped = useMemo(() => (inputLog || [])
    .filter(s => s.date && s.date >= fromISO && s.date <= toISO && s.course && (s.recapSummary || '').trim())
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
  [inputLog, fromISO, toISO])

  const groups = useMemo(() => {
    const byCourse = new Map()
    for (const s of recapped) {
      if (!byCourse.has(s.course)) byCourse.set(s.course, [])
      byCourse.get(s.course).push(s)
    }
    return [...byCourse.entries()]
      .map(([course, items]) => ({
        course,
        hours: items.reduce((t, s) => t + (s.durationHours || 0), 0),
        items,
      }))
      .sort((a, b) => a.course.localeCompare(b.course))
  }, [recapped])

  const totalHours = groups.reduce((t, g) => t + g.hours, 0)

  function copyPrompt() {
    const lines = [`# Week in Review — ${label}`, '']
    for (const g of groups) {
      lines.push(`## ${g.course}`, '')
      for (const s of g.items) {
        const ref = s.lectureId ? `Lecture ${s.lectureId}` : s.project ? `Project / Assignment ${s.project}` : ''
        lines.push(`- ${formatDate(s.date)}${ref ? ` · ${ref}` : ''}${s.durationHours ? ` (${s.durationHours}h)` : ''}`)
        lines.push(`  ${(s.recapSummary || '').replace(/\n/g, '\n  ')}`)
      }
      lines.push('')
    }
    lines.push('---', '')
    lines.push('Using the notes above, give me a structured recap of the material I covered this week, then quiz me on it interactively.')
    const text = lines.join('\n')
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => {})
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setMonday(m => addDays(mondayOf(m), -7))}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          ← Prev week
        </button>
        <span className="text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-4 py-1.5">
          {label}
        </span>
        <button
          onClick={() => setMonday(m => addDays(mondayOf(m), 7))}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          Next week →
        </button>
        {!isCurrentWeek && (
          <button
            onClick={() => setMonday(mondayOf(new Date()))}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            This week
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={copyPrompt}
          disabled={groups.length === 0}
          className="text-sm px-4 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {copied ? 'Copied!' : 'Copy recap for LLM'}
        </button>
      </div>

      {recapped.length > 0 && (
        <p className="text-xs text-slate-400">
          {recapped.length} recapped {recapped.length === 1 ? 'session' : 'sessions'} · {totalHours.toFixed(1)}h
        </p>
      )}

      {groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-6 py-12 text-center">
          <p className="text-2xl mb-2">🗒️</p>
          <p className="text-sm text-slate-500 mb-1">No recap summaries for {label}.</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            When you log a study session, fill the <span className="font-medium text-slate-500">Recap Summary</span> box
            (pick a Project or Lecture/Class first). Everything you wrote that week shows up here, ready to feed to an LLM.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.course} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                {(() => {
                  const st = getCourseStyle(g.course, colorByCourse[g.course])
                  return <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot}`} style={st.dotCss} />
                })()}
                <h3 className="text-sm font-semibold text-slate-700 truncate" title={g.course}>{truncate(g.course, 60)}</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-500 whitespace-nowrap">
                  {g.items.length} {g.items.length === 1 ? 'recap' : 'recaps'}
                </span>
                <span className="text-[11px] text-slate-400 whitespace-nowrap">{g.hours.toFixed(1)}h</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {g.items.map(s => {
                  const projectLabel = s.project ? idLabel(s.course, s.project, content, gradeComponents) : ''
                  const lectureLabel = s.lectureId ? idLabel(s.course, s.lectureId, content, gradeComponents) : ''
                  return (
                    <li key={s.id || `${s.date}-${s.startTime}`} className="px-4 py-3 flex gap-3">
                      <div className="w-20 shrink-0 text-xs text-slate-500 pt-0.5">{formatDateShort(s.date)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          {s.lectureId && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700"
                              title={lectureLabel || undefined}>
                              Lecture {s.lectureId}
                            </span>
                          )}
                          {s.project && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700"
                              title={projectLabel || undefined}>
                              Project / Assignment {s.project}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{s.recapSummary}</p>
                      </div>
                      <button
                        onClick={() => setEditing(s)}
                        className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer self-start shrink-0"
                        title="Edit this session (its recap summary is stored with the study log)"
                      >
                        Edit
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <AddSessionModal
        key={editing?.id || 'week-review-edit'}
        open={!!editing}
        initial={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}
