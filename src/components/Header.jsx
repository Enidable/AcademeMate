export default function Header({ title, onAddSession, onAddCourse, onAddDeadline, onRefresh, onDrive, hasDrive, syncing }) {
  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold text-slate-800">{title}</h1>

      <div className="flex items-center gap-2">
        {onDrive && (
          <button onClick={onDrive}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer"
            title="Google Drive connection">
            <span className={`h-2 w-2 rounded-full ${hasDrive ? 'bg-green-500' : 'bg-slate-300'}`} />
            <span className="text-slate-600">{hasDrive ? 'Drive' : 'Connect'}</span>
            {syncing && <span className="text-slate-400">…</span>}
          </button>
        )}
        {onRefresh && (
          <button onClick={onRefresh} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer" title="Reload data from the source (Drive or bundled CSVs)">
            ⟳ Reload
          </button>
        )}
        {onAddSession && (
          <button onClick={onAddSession} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 cursor-pointer">
            + Session
          </button>
        )}
        {onAddCourse && (
          <button onClick={onAddCourse} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
            + Course
          </button>
        )}
        {onAddDeadline && (
          <button onClick={onAddDeadline} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
            + Deadline
          </button>
        )}
      </div>
    </header>
  )
}