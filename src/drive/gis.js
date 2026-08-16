// Google Identity Services (token model) — OAuth for a server-less browser app.
// Loads the GIS script lazily and wraps it in Promises.

import { GOOGLE_CLIENT_ID, SCOPES } from '../config'

const TOKEN_KEY = 'am_gis_token'
const REQUEST_TIMEOUT_MS = 60_000

let tokenClient = null
let initPromise = null
let currentCallback = null

export function isSignedIn() {
  return !!readToken()
}

function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = resolve
    script.onerror = () =>
      reject(new Error('Could not load the Google sign-in library. Check your connection or ad-blocker and reload.'))
    document.head.appendChild(script)
  })
}

export function initGis() {
  if (!GOOGLE_CLIENT_ID) {
    return Promise.reject(
      new Error('No Google Client ID configured. Copy .env.example to .env.local, set VITE_GOOGLE_CLIENT_ID, then restart `npm run dev`.'),
    )
  }
  if (tokenClient) return Promise.resolve(tokenClient)
  if (initPromise) return initPromise
  initPromise = loadGisScript()
    .then(() => {
      // Canonical GIS pattern: the callback is declared in initTokenClient() —
      // requestAccessToken() must NOT receive its own callback. Attaching it
      // per-request instead is a known cause of the "token never comes back
      // after the consent pop-up" hang.
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES.join(' '),
        callback: (resp) => {
          const cb = currentCallback
          currentCallback = null
          if (cb) cb(resp)
        },
      })
      return tokenClient
    })
    .catch((e) => {
      // Don't cache the failure — allow the next attempt to retry the load.
      initPromise = null
      throw e
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
  const client = await initGis()
  const cached = readToken()
  if (cached && !force) return cached

  return new Promise((resolve, reject) => {
    let settled = false
    let popupOpened = false
    let noPopupTimer = null
    let requestTimer = null

    const onBlur = () => { popupOpened = true }
    const cleanup = () => {
      window.removeEventListener('blur', onBlur)
      if (noPopupTimer) clearTimeout(noPopupTimer)
      if (requestTimer) clearTimeout(requestTimer)
      if (currentCallback === onGisResponse) currentCallback = null
    }
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      cleanup()
      fn(value)
    }
    const onGisResponse = (resp) => {
      if (resp?.error) {
        // Log the raw response for debugging (never holds tokens on errors).
        console.error('[AcademeMate] Google sign-in error:', resp)
        finish(reject, new Error(describeGisError(resp)))
        return
      }
      if (resp?.access_token) {
        finish(resolve, storeToken(resp))
        return
      }
      finish(reject, new Error('Google did not return an access token. Try again.'))
    }

    window.addEventListener('blur', onBlur)

    // If no pop-up ever takes focus, it was blocked — fail fast and clearly.
    noPopupTimer = setTimeout(() => {
      if (!settled && !popupOpened) {
        finish(reject, new Error('No Google sign-in pop-up appeared. Allow pop-ups for this site, then click Connect again.'))
      }
    }, 5000)

    requestTimer = setTimeout(() => {
      if (settled) return
      finish(reject, new Error(
        popupOpened
          ? 'You approved the Google sign-in, but the token did not reach the app. Click Connect again; if it keeps failing, open the browser console (F12) and share the errors.'
          : 'The Google sign-in window did not complete in time. If a pop-up was blocked, allow pop-ups for this site and try again.',
      ))
    }, REQUEST_TIMEOUT_MS)

    // Wire the outstanding request to the token client's callback and start the
    // flow. prompt: 'consent' forces the visible pop-up every time, avoiding the
    // silent hidden-iframe refresh that hangs without a callback.
    currentCallback = onGisResponse
    client.requestAccessToken({ prompt: 'consent' })
  })
}

function describeGisError(resp) {
  switch (resp?.error) {
    case 'popup_closed_by_user':
      return 'Sign-in window was closed before you finished. Try again.'
    case 'access_denied':
      return 'Access was denied. If your OAuth consent screen is in "Testing" mode, make sure your Google account is listed as a test user.'
    case 'invalid_client':
      return 'Google rejected the Client ID for this page. Make sure VITE_GOOGLE_CLIENT_ID matches an OAuth client of type "Web application", and that this site\u2019s address is in its "Authorized JavaScript origins".'
    case 'network_error':
      return 'Could not reach Google sign-in (network error). Try again.'
    default:
      if (resp?.error_subtype === 'popup_blocked') {
        return 'Google sign-in pop-up was blocked by the browser. Allow pop-ups for this site and try again.'
      }
      if (resp?.error_subtype === 'invalid_client') {
        return describeGisError({ error: 'invalid_client' })
      }
      return resp?.error_description || resp?.error || 'Google sign-in failed. Try again.'
  }
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
