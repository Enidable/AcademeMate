import { useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { parseCSVRaw } from '../utils/csv'

const TAB_OPTIONS = [
  { key: 'inputLog', title: 'INPUT_LOG', label: 'Study sessions log' },
  { key: 'masterCourses', title: 'Master Time Management', label: 'Courses' },
  { key: 'gradeComponents', title: 'Grade Computer', label: 'Grades' },
  { key: 'weeklyHours', title: 'Time structure and hours of study', label: 'Weekly hours' },
  { key: 'deadlines', title: 'Deadlines and Lectures', label: 'Deadlines' },
  { key: 'daily', title: 'Daily', label: 'Daily planner' },
]

function StatusRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  )
}

export default function DriveSettings({ open, onClose }) {
  const {
    drive, syncing, driveError, hasDrive,
    connectToDrive, disconnectFromDrive, refreshFromDrive, importCSVToTab,
  } = useAppData()

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [importTab, setImportTab] = useState('inputLog')
  const [importName, setImportName] = useState('')

  if (!open) return null

  async function handleConnect() {
    setBusy(true)
    setMessage('')
    try {
      await connectToDrive()
      setMessage('Connected. Data synced from your Google Drive.')
    } catch (e) {
      setMessage(`Connection failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleImport(file) {
    if (!file) return
    setBusy(true)
    setMessage('')
    try {
      const text = await file.text()
      const rows = parseCSVRaw(text)
      if (rows.length === 0) throw new Error('The file is empty.')
      await importCSVToTab(importTab, rows)
      setImportName('')
      setMessage(`Imported ${rows.length} rows into "${TAB_OPTIONS.find(t => t.key === importTab)?.title}". This tab now matches your file.`)
    } catch (e) {
      setMessage(`Import failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Google Drive</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${hasDrive ? 'bg-green-500' : 'bg-slate-300'}`} />
            <span className="text-sm text-slate-700">{hasDrive ? 'Connected' : 'Not connected'}</span>
            {syncing && <span className="text-xs text-slate-400">syncing…</span>}
          </div>

          {hasDrive && (
            <div>
              {drive?.user?.name && drive?.user?.name !== 'Google user' && (
                <StatusRow label="Account" value={`${drive.user.name}${drive.user.email ? ` (${drive.user.email})` : ''}`} />
              )}
              {drive?.fileUrl && (
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <span className="text-xs text-slate-500">Spreadsheet</span>
                  <a href={drive.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-slate-800 underline decoration-slate-300 hover:decoration-slate-500 cursor-pointer">Open in Drive ↗</a>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!hasDrive ? (
              <button onClick={handleConnect} disabled={busy}
                className="text-sm px-4 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 cursor-pointer">
                {busy ? 'Connecting…' : 'Connect to Google Drive'}
              </button>
            ) : (
              <>
                <button onClick={() => refreshFromDrive()} disabled={syncing || busy}
                  className="text-sm px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
                  ⟳ Refresh from Drive
                </button>
                <button onClick={disconnectFromDrive} disabled={busy}
                  className="text-sm px-4 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 cursor-pointer">
                  Disconnect
                </button>
              </>
            )}
          </div>

          <details className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            <summary className="cursor-pointer font-medium text-slate-600 select-none">OAuth not connecting?</summary>
            <ul className="mt-2 space-y-1.5 list-disc pl-4">
              <li>The Client ID in <code className="text-slate-700">.env.local</code> (as <code className="text-slate-700">VITE_GOOGLE_CLIENT_ID</code>) must exactly match an <em>OAuth client of type &quot;Web application&quot;</em>. Regenerating credentials in Google Cloud produces a new ID — copy it over and restart <code className="text-slate-700">npm run dev</code>.</li>
              <li>In that client, the address you are using right now must be in <strong>Authorized JavaScript origins</strong>: <code className="text-slate-700">http://localhost:5173</code> locally, and <code className="text-slate-700">https://&lt;your-username&gt;.github.io</code> on GitHub Pages. An unmatched origin shows as a &quot;wrong client&quot; error.</li>
              <li>Make sure <em>Google Drive API</em> and <em>Google Sheets API</em> are both enabled, and that your Google account is a <strong>test user</strong> while the consent screen is in &quot;Testing&quot; mode.</li>
            </ul>
          </details>

          {driveError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{driveError}</div>
          )}

          {message && (
            <div className={`text-xs rounded-lg px-3 py-2 border ${message.includes('failed') || message.includes('Failed') ? 'text-red-600 bg-red-50 border-red-100' : 'text-slate-600 bg-slate-50 border-slate-100'}`}>
              {message}
            </div>
          )}

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-1">Import your own CSV</h3>
              <p className="text-xs text-slate-400">Replaces the selected tab with the rows from your file (e.g. an export of your own spreadsheet). Useful when you first move your historical data in.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={importTab} onChange={e => setImportTab(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-slate-400">
                {TAB_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.title} — {t.label}</option>)}
              </select>
              <label className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">
                {importName || 'Choose .csv…'}
                <input type="file" accept=".csv" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setImportName(f.name)
                      handleImport(f)
                    }
                  }} />
              </label>
            </div>
          </div>

          <p className="text-xs text-slate-400">Each person signs in with their own Google account; the app only touches the spreadsheet it created for that account — your data is never shared.</p>
        </div>
      </div>
    </div>
  )
}