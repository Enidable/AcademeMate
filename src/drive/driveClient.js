// Thin REST client for the Google Drive + Sheets APIs.
// No SDK required — every call is a fetch with an Authorization header.

import {
  APP_PROP_KEY,
  DRIVE_FOLDER_NAME,
  SHEET_TABS,
  SPREADSHEET_NAME,
  TAB_INPUT_LOG,
  TAB_COURSES,
  TAB_GRADES,
  TAB_HOURS,
  TAB_DEADLINES,
  TAB_DAILY,
} from '../config'
import { getAccessToken } from './gis'

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3'
const SHEETS_BASE = 'https://sheets.googleapis.com/v4'

async function authedFetch(url, options = {}) {
  const token = await getAccessToken()
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    let message = `Google API ${res.status}: ${text.slice(0, 240)}`
    if (res.status === 403 && /has not been used|disabled/i.test(text)) {
      message += ' Enable the Google Drive and Google Sheets APIs in your Google Cloud project (APIs & Services > Library), then try again.'
    }
    throw new Error(message)
  }
  return res.status === 204 ? {} : res.json()
}

// --- Drive API -----------------------------------------------------------

// Find (or create) the per-user folder "AcademeMate - Study Tracking" on the
// signed-in person's Drive. app-created files are visible to drive.file scope.
export async function ensureFolder() {
  const q =
    `mimeType='application/vnd.google-apps.folder' ` +
    `and name='${DRIVE_FOLDER_NAME.replace(/'/g, "\\'")}' ` +
    `and appProperties has { key='${APP_PROP_KEY}' and value='true' } and trashed=false`
  const list = await authedFetch(
    `${DRIVE_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`,
  )
  const existing = list.files?.[0]
  if (existing) return existing.id

  const created = await authedFetch(`${DRIVE_BASE}/files?fields=id`, {
    method: 'POST',
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { [APP_PROP_KEY]: 'true' },
    }),
  })
  return created.id
}

// Find the user's app-created spreadsheet inside the folder, or create one there.
// drive.file scope means this only ever sees files this app created for this
// account — it never touches an existing spreadsheet.
export async function ensureSpreadsheet() {
  const folderId = await ensureFolder()
  const q =
    `name='${SPREADSHEET_NAME.replace(/'/g, "\\'")}' ` +
    `and '${folderId}' in parents ` +
    `and appProperties has { key='${APP_PROP_KEY}' and value='true' } and trashed=false`
  const list = await authedFetch(
    `${DRIVE_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&spaces=drive`,
  )
  const existing = list.files?.[0]
  if (existing) return { ...existing, createdNew: false, folderId }

  const created = await authedFetch(
    `${DRIVE_BASE}/files?fields=id,name,webViewLink`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: SPREADSHEET_NAME,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [folderId],
        appProperties: { [APP_PROP_KEY]: 'true' },
      }),
    },
  )
  return { ...created, createdNew: true, folderId }
}

export async function getDriveUser() {
  try {
    const about = await authedFetch(`${DRIVE_BASE}/about?fields=user(emailAddress,displayName)`)
    const u = about.user || {}
    return { email: u.emailAddress || '', name: u.displayName || u.emailAddress || 'you' }
  } catch {
    return { email: '', name: 'you' }
  }
}

// --- Sheets API ----------------------------------------------------------

async function sheetMetadata(id) {
  return authedFetch(`${SHEETS_BASE}/spreadsheets/${id}?fields=sheets.properties(sheetId,title)`)
}

// Ensure the six canonical tabs exist; drop a freshly-created default "Sheet1".
export async function ensureTabs(id) {
  const meta = await sheetMetadata(id)
  const existing = new Set((meta.sheets || []).map(s => s.properties?.title))
  const missing = SHEET_TABS.filter(t => !existing.has(t))
  const toDelete = (meta.sheets || [])
    .map(s => s.properties)
    .filter(p => p?.title === 'Sheet1' && !SHEET_TABS.includes(p.title))

  const requests = []
  for (const title of missing) {
    requests.push({ addSheet: { properties: { title } } })
  }
  for (const p of toDelete) {
    requests.push({ deleteSheet: { sheetId: p.sheetId } })
  }
  if (requests.length) {
    await authedFetch(`${SHEETS_BASE}/spreadsheets/${id}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests }),
    })
  }
}

// Read a whole tab as a 2D array of strings (same shape our CSV parser produces).
export async function readTabRows(id, title) {
  const range = encodeURIComponent(`'${title}'!A:ZZ`)
  const data = await authedFetch(`${SHEETS_BASE}/spreadsheets/${id}/values/${range}`)
  return data?.values || []
}

// Write a whole tab. Start at A1 and let Sheets extend the range to fit the rows.
export async function writeTabRows(id, title, rows) {
  if (!rows || rows.length === 0) {
    await authedFetch(
      `${SHEETS_BASE}/spreadsheets/${id}/values/${encodeURIComponent(`'${title}'!A1:ZZ`)}:clear`,
      { method: 'POST', body: '{}' },
    )
    return
  }
  const range = encodeURIComponent(`'${title}'!A1`)
  await authedFetch(
    `${SHEETS_BASE}/spreadsheets/${id}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      body: JSON.stringify({ values: rows, majorDimension: 'ROWS' }),
    },
  )
}

export async function readAllTabs(id) {
  const values = await Promise.all(SHEET_TABS.map(title => readTabRows(id, title)))
  return Object.fromEntries(SHEET_TABS.map((title, i) => [title, values[i]]))
}

export async function writeAllTabs(id, rowsByTab) {
  for (const title of SHEET_TABS) {
    if (rowsByTab[title]) await writeTabRows(id, title, rowsByTab[title])
  }
}

// --- Tab keys ------------------------------------------------------------

export const TAB_KEY_BY_TITLE = {
  [TAB_INPUT_LOG]: 'inputLog',
  [TAB_COURSES]: 'masterCourses',
  [TAB_GRADES]: 'gradeComponents',
  [TAB_HOURS]: 'weeklyHours',
  [TAB_DEADLINES]: 'deadlines',
  [TAB_DAILY]: 'planner',
}

export { SHEET_TABS }