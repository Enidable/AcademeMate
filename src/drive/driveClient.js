// Thin REST client for the Google Drive + Sheets APIs.
// No SDK required — every call is a fetch with an Authorization header.

import {
  APP_PROP_KEY,
  DRIVE_FOLDER_NAME,
  ICAL_FOLDER_NAME,
  SHEET_TABS,
  SPREADSHEET_NAME,
  TAB_STUDY_LOG,
  TAB_COURSES,
  TAB_GRADES,
  TAB_CONTENT,
  TAB_HOURS,
  TAB_DAILY,
  TAB_CALENDAR,
} from '../config'
import { getAccessToken } from './gis'

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3'
const SHEETS_BASE = 'https://sheets.googleapis.com/v4'
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

const MAX_RETRIES = 3

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function authedFetch(url, options = {}, attempt = 0) {
  const token = await getAccessToken()
  let res
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })
  } catch (e) {
    // Network blip — retry.
    if (attempt < MAX_RETRIES) {
      await sleep(300 * 2 ** attempt)
      return authedFetch(url, options, attempt + 1)
    }
    throw new Error(`Network error: ${e.message}`)
  }

  if (!res.ok) {
    // 409 = concurrent writes to the same spreadsheet (what used to surface as
    // "Conflict"), 429 = rate limit, 5xx = transient. All deserve a retry.
    const lastRetry = attempt >= MAX_RETRIES
    if (!lastRetry && (res.status === 409 || res.status === 429 || res.status >= 500)) {
      await sleep(400 * 2 ** attempt)
      return authedFetch(url, options, attempt + 1)
    }
    const text = await res.text()
    let message = `Google API ${res.status}: ${text.slice(0, 240)}`
    if (res.status === 403 && /has not been used|disabled/i.test(text)) {
      message += ' Enable the Google Drive and Google Sheets APIs in your Google Cloud project (APIs & Services > Library), then try again.'
    } else if (res.status === 403 && /insufficient.*scope|insufficientPermission|permission/i.test(text)) {
      message += ' The token is missing a required Google scope. Sign out and sign back in to re-authorize. If it still fails, make sure the OAuth consent screen lists the calendar and drive.readonly scopes, and that the Google Calendar API is enabled (APIs & Services > Library).'
    }
    throw new Error(message)
  }
  return res.status === 204 ? {} : res.json()
}

// Serialize every write to a given spreadsheet. The Sheets API rejects
// concurrent mutations of the same file with 409 "Conflict"; queueing all
// writes per file across tabs sidesteps that entirely.
const writeQueues = {}

function enqueueSpreadsheetWrite(fileId, task) {
  const prev = writeQueues[fileId] || Promise.resolve()
  const next = prev.then(task, task)
  writeQueues[fileId] = next.catch(() => {})
  return next
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

// --- Drive: the user's iCal folder ----------------------------------------

// Find the "iCal" folder the user keeps inside the app's own Drive folder
// (DRIVE_FOLDER_NAME) and list the calendar files inside it. Unlike the app
// spreadsheet, this is the user's own folder — the drive.readonly scope covers it.
export async function listIcsFiles() {
  const appFolderId = await ensureFolder()
  const folderQ =
    `'${appFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${ICAL_FOLDER_NAME.replace(/'/g, "\\'")}' and trashed=false`
  const folders = await authedFetch(
    `${DRIVE_BASE}/files?q=${encodeURIComponent(folderQ)}&fields=files(id)&spaces=drive`,
  )
  const folderId = folders.files?.[0]?.id
  if (!folderId) return { folder: null, files: [] }

  const fileQ = `'${folderId}' in parents and trashed=false and (mimeType='text/calendar' or name contains '.ics')`
  const list = await authedFetch(
    `${DRIVE_BASE}/files?q=${encodeURIComponent(fileQ)}&fields=files(id,name,mimeType,modifiedTime)&spaces=drive&pageSize=100`,
  )
  return { folder: folderId, files: list.files || [] }
}

// Download one Drive file's raw content as text (.ics downloads as text).
async function fetchText(url, attempt = 0) {
  const token = await getAccessToken()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` } })
  if (res.status === 429 || res.status === 409 || res.status >= 500) {
    if (attempt < MAX_RETRIES) {
      await sleep(400 * 2 ** attempt)
      return fetchText(url, attempt + 1)
    }
  }
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 240)}`)
  return res.text()
}

export async function fetchIcsFile(fileId) {
  return fetchText(`${DRIVE_BASE}/files/${fileId}?alt=media`)
}

// --- Google Calendar API --------------------------------------------------

// The app never writes to the user's primary calendar — events go into a
// dedicated "AcademeMate" calendar (created the first time it's needed).
export async function ensureCalendar(name = 'AcademeMate') {
  const list = await authedFetch(
    `${CALENDAR_BASE}/users/me/calendarList?fields=items(id,summary)&maxResults=250`,
  )
  const existing = (list.items || []).find(c => c.summary === name)
  if (existing) return existing.id
  const created = await authedFetch(`${CALENDAR_BASE}/calendars`, {
    method: 'POST',
    body: JSON.stringify({ summary: name, description: 'Imported university timetable via AcademeMate.' }),
  })
  return created?.id || 'primary'
}

// Stable Google Calendar colour (1..11) per course, so each course keeps one
// Google Calendar event colors (1-11). Known courses map to a distinct, stable
// color that mirrors the app's own palette (helpers.js `courseColors`); unknown
// courses fall back to a deterministic hash.
const COURSE_COLOR_ID = {
  'Advanced Software Development for Robotics': '9',
  'Biomechanics of Human Movement': '10',
  'Biomechatronics': '1',
  'Design Principles for Robotic and Mechatronic Mechanisms': '3',
  'Modelling and Simulation': '6',
  'AI for Autonomous Robots': '11',
  'System Identification with Parameter Estimation and Machine Learning': '7',
  'Professional and Personal Development': '2',
  'Other University Stuff': '8',
  'System Improvement (Spreadsheet)': '5',
  'Work': '4',
}

// Stable color (1-11) for a course name, shared by every event of that course.
export function courseColorId(course) {
  if (!course) return null
  if (COURSE_COLOR_ID[course]) return COURSE_COLOR_ID[course]
  let h = 0
  for (let i = 0; i < course.length; i++) h = (h * 31 + course.charCodeAt(i)) | 0
  return String(((h % 10) + 10) % 10 + 1)
}

function addMinutes(time, minutes) {
  const [sh, sm] = (time || '09:00').split(':')
  const total = (parseInt(sh, 10) * 60 + parseInt(sm, 10)) + minutes
  const h = String(Math.floor(total / 60) % 24).padStart(2, '0')
  const m = String(total % 60).padStart(2, '0')
  return `${h}:${m}`
}

export function toGcalEvent(ev) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const startTime = (ev.startTime || '09:00').padStart(5, '0')
  const endTime = (ev.endTime || addMinutes(startTime, 60)).padStart(5, '0')
  const start = ev.allDay
    ? { date: ev.date }
    : { dateTime: `${ev.date}T${startTime}:00`, timeZone }
  const end = ev.allDay
    ? { date: ev.date }
    : { dateTime: `${ev.date}T${endTime}:00`, timeZone }
  const body = {
    summary: ev.summary,
    location: ev.location || '',
    description: ev.description || '',
    start,
    end,
  }
  const colorId = courseColorId(ev.course)
  if (colorId) body.colorId = colorId
  return body
}

// Insert one event into a calendar (default the user's primary calendar).
// Returns the created event's id. Idempotency is the caller's concern.
export async function insertCalendarEvent(event, calendarId = 'primary') {
  const url = `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`
  const res = await authedFetch(url, {
    method: 'POST',
    body: JSON.stringify(event),
  })
  return res?.id || null
}

export async function updateCalendarEvent(eventId, event, calendarId = 'primary') {
  const url = `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
  const res = await authedFetch(url, {
    method: 'PUT',
    body: JSON.stringify(event),
  })
  return res?.id || eventId
}

export function deleteCalendarEvent(eventId, calendarId = 'primary') {
  if (!eventId) return Promise.resolve()
  return enqueueSpreadsheetWrite(`gcal-${calendarId}`, () =>
    authedFetch(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    }).catch(() => {}),
  )
}

// --- Sheets API ----------------------------------------------------------

async function sheetMetadata(id) {
  return authedFetch(`${SHEETS_BASE}/spreadsheets/${id}?fields=sheets.properties(sheetId,title)`)
}

// Ensure the six canonical tabs exist; drop everything else. Sheets created by
// the old schema ship extra tabs (INPUT_LOG, Deadlines and Lectures, …) and a
// freshly-created spreadsheet has a default "Sheet1" — none of them should linger.
export async function ensureTabs(id) {
  const meta = await sheetMetadata(id)
  const existing = new Set((meta.sheets || []).map(s => s.properties?.title))
  const missing = SHEET_TABS.filter(t => !existing.has(t))
  const toDelete = (meta.sheets || [])
    .map(s => s.properties)
    .filter(p => p?.title && !SHEET_TABS.includes(p.title))

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
// Writes to the same spreadsheet are queued so concurrent edits never collide.
export function writeTabRows(id, title, rows) {
  return enqueueSpreadsheetWrite(id, () => {
    if (!rows || rows.length === 0) {
      return authedFetch(
        `${SHEETS_BASE}/spreadsheets/${id}/values/${encodeURIComponent(`'${title}'!A1:ZZ`)}:clear`,
        { method: 'POST', body: '{}' },
      )
    }
    const range = encodeURIComponent(`'${title}'!A1`)
    return authedFetch(
      `${SHEETS_BASE}/spreadsheets/${id}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        body: JSON.stringify({ values: rows, majorDimension: 'ROWS' }),
      },
    )
  })
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
  [TAB_STUDY_LOG]: 'studyLog',
  [TAB_COURSES]: 'courses',
  [TAB_GRADES]: 'gradeComponents',
  [TAB_CONTENT]: 'content',
  [TAB_DAILY]: 'dailyPlan',
  [TAB_HOURS]: 'weeklyTotals',
  [TAB_CALENDAR]: 'calendarEvents',
}

export { SHEET_TABS }