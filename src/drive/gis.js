// Google Identity Services (token model) — OAuth for a server-less browser app.
// Loads the GIS script lazily and wraps it in Promises.

import { GOOGLE_CLIENT_ID, SCOPES } from '../config'

const TOKEN_KEY = 'am_gis_token'

let tokenClient = null
let initPromise = null

export function isSignedIn() {
  const cached = readToken()
  return !!cached?.access_token
}

function loadGisScript() {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = resolve
    script.onerror = resolve
    document.head.appendChild(script)
  })
}

export function initGis() {
  if (!GOOGLE_CLIENT_ID) {
    return Promise.reject(new Error('No Google Client ID configured. Set VITE_GOOGLE_CLIENT_ID in .env.local'))
  }
  if (initPromise) return initPromise
  initPromise = loadGisScript().then(() => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES.join(' '),
      callback: () => {},
    })
  })
  return initPromise
}

function storeToken(resp) {
  if (resp && resp.access_token) {
    const token = {
      access_token: resp.access_token,
      expires_at: Date.now() + (resp.expires_in || 3600) * 1000,
      scope: resp.scope,
      id_token: resp.id_token || null,
    }
    try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token)) } catch {}
    return token
  }
  return null
}

export function readToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const t = JSON.parse(raw)
    if (!t.access_token || t.expires_at < Date.now()) return null
    return t
  } catch {
    return null
  }
}

export function clearToken() {
  try { sessionStorage.removeItem(TOKEN_KEY) } catch {}
}

export async function getAccessToken({ force = false } = {}) {
  await initGis()
  const cached = readToken()
  if (cached && !force) return cached
  return new Promise((resolve, reject) => {
    tokenClient.requestAccessToken({
      prompt: force ? '' : undefined,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error))
          return
        }
        resolve(storeToken(resp))
      },
    })
  })
}

export function signOut() {
  const t = readToken()
  if (t?.access_token) {
    try { window.google.accounts.oauth2.revoke(t.access_token, () => {}) } catch {}
  }
  clearToken()
}

function base64UrlDecode(str) {
  const pad = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = pad.padEnd(Math.ceil(pad.length / 4) * 4, '=')
  try {
    return decodeURIComponent(
      atob(padded)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
  } catch {
    return '{}'
  }
}

// Decode the id_token (JWT) that GIS returns alongside the access token.
export function getTokenUser(token) {
  if (!token?.id_token) return null
  try {
    const payload = JSON.parse(base64UrlDecode(token.id_token.split('.')[1]))
    return {
      email: payload.email || '',
      name: payload.name || payload.email || 'you',
      sub: payload.sub || '',
    }
  } catch {
    return null
  }
}