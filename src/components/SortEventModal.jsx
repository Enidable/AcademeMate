// Shared "sort a personal-calendar event into an additional-time category"
// dialog. Used from the Calendar week grid and the Daily Planner timetable
// strip. `event` is the calendarEvents row being sorted; `overrides` is the
// per-event category map (event row id -> category). onPick(category) persists
// the choice (null removes it) and closes the dialog.
import { getCourseStyle, normalizeCategory } from '../utils/helpers'
import { ADDITIONAL_CATEGORIES } from '../config'

export default function SortEventModal({ event, overrides = {}, onPick, onClose }) {
  if (!event) return null
  const current = event.id ? overrides[event.id] : null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Sort into additional time</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer">&times;</button>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500 mb-1">
            <span className="font-medium text-slate-700">{event.summary}</span>
            {event.startTime ? ` · ${event.startTime}${event.endTime ? `–${event.endTime}` : ''}` : ''}
          </p>
          <p className="text-[11px] text-slate-400 mb-4">
            Personal events only show in the planner once they're sorted — pick the category this event belongs to. It will appear as a checkable item under that row in the Daily Planner and count toward that bucket everywhere.
          </p>
          <div className="space-y-1.5">
            {ADDITIONAL_CATEGORIES.map(cat => {
              const st = getCourseStyle(cat)
              const active = current === cat
              return (
                <button key={cat} onClick={() => onPick(cat)}
                  className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg border cursor-pointer ${
                    active ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} style={st.dotCss} />
                  <span className="text-sm text-slate-700">{normalizeCategory(cat)}</span>
                  {active && <span className="ml-auto text-[10px] text-indigo-600 font-medium">sorted</span>}
                </button>
              )
            })}
          </div>
          {current && (
            <button onClick={() => onPick(null)}
              className="mt-4 text-xs text-slate-400 hover:text-red-500 cursor-pointer">
              Remove — make this event informational again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
