// Shared configuration for the Google Drive backend.
// The Client ID is NOT a secret — OAuth public client IDs are meant to be
// shipped in the browser bundle (you can read it from the built JS). It's baked
// in below so the app works on GitHub Pages too (the CI build has no .env.local).
// Set VITE_GOOGLE_CLIENT_ID in .env.local to override it locally if you change it.

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '455238936121-d13b35keplcp2sb083s91gdod0cibfru.apps.googleusercontent.com'

// Public assets live under the Vite base (/AcademeMate/) both in dev and in
// production — a root-relative path would break on GitHub Pages.
export const ASSET_BASE = import.meta.env.BASE_URL

// drive.file keeps the app scoped to spreadsheets it created (per-user isolation).
// spreadsheets lets us read/write cell values. openid/email/profile only give us
// the display name/email to greet the signed-in user.
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'openid',
  'email',
  'profile',
]

export const APP_ID = 'academemate'
export const SPREADSHEET_NAME = 'AcademeMate Data'
export const DRIVE_FOLDER_NAME = 'AcademeMate - Study Tracking'
export const APP_PROP_KEY = 'academemate'

// Canonical tab titles inside the user's spreadsheet. Every tab is a single flat
// table (one header row), linked to others by course_id — the app's data layer
// keeps the GUI shapes while the spreadsheet stays database-shaped.
export const TAB_STUDY_LOG = 'Study Log'
export const TAB_COURSES = 'Courses'
export const TAB_GRADES = 'Grade Components'
export const TAB_CONTENT = 'Course Content'
export const TAB_DAILY = 'Daily Plan'
export const TAB_HOURS = 'Weekly Totals'

// Content item types: lectures/lectorials/tutorials/practicals are *scheduled*
// (they have a `date`), assessments are *due* (they have a `deadline`).
export const CONTENT_TYPES = [
  'lecture',
  'lectorial',
  'tutorial',
  'practical',
  'project',
  'assignment',
  'exam',
  'quiz',
  'presentation',
  'q&a',
  'exam review',
  'self study',
  'resit',
  'other',
]

// Types that carry a due date instead of a scheduled date.
export const DEADLINE_TYPES = new Set([
  'project',
  'assignment',
  'exam',
  'quiz',
  'presentation',
])

export const SHEET_TABS = [TAB_STUDY_LOG, TAB_COURSES, TAB_GRADES, TAB_CONTENT, TAB_DAILY, TAB_HOURS]