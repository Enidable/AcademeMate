// Google Identity Services (token model) — OAuth for a server-less browser app.
// Loads the GIS script lazily and wraps it in Promises.

import { GOOGLE_CLIENT_ID, SCOPES, ASSET_BASE } from '../config'

const TOKEN_KEY = 'am_gis_token'
const REQUEST_TIMEOUT_MS = 60_000
const REDIRECT_STATE_KEY = 'am_oauth_state'
const REDIRECT_NONCE_KEY = 'am_oauth_nonce'

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

// --- Redirect fallback -----------------------------------------------------
// Some browsers/accounts never deliver the GIS pop-up's token back to the
// opener (hardened privacy settings, tracking protection, extensions, or the
// dialog's postMessage being dropped). A full-page redirect uses the same
// implicit grant under the hood but returns the token in the URL fragment, so
// it does not depend on that pop-up hand-off at all.
//
// Requires the page URL (e.g. https://<user>.github.io/AcademeMate/) to be
// listed under "Authorized redirect URIs" for the OAuth client in Google Cloud.

let redirectAuthError = null

function redirectUri() {
  return `${window.location.origin}${ASSET_BASE || '/'}`
}

function randomToken(bytes = 16) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

export function startRedirectAuth() {
  if (!GOOGLE_CLIENT_ID) return
  const state = randomToken()
  const nonce = randomToken()
  try {
    sessionStorage.setItem(REDIRECT_STATE_KEY, state)
    sessionStorage.setItem(REDIRECT_NONCE_KEY, nonce)
  } catch {}
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPES.join(' '),
    include_granted_scopes: 'true',
    state,
    nonce,
  })
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}

// Consume a token (or error) that Google appended to the fragment after the
// redirect flow. Runs on app start; cleans the token out of the address bar.
export function consumeRedirectToken() {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash || !/(?:^|&)(access_token|error)=/.test(hash)) return false

  const params = new URLSearchParams(hash)
  const state = params.get('state')
  let expected = null
  try { expected = sessionStorage.getItem(REDIRECT_STATE_KEY) } catch {}

  // Always strip the fragment so the token never lingers in history / the URL.
  try {
    history.replaceState(null, '', window.location.pathname + window.location.search)
  } catch {}
  try {
    sessionStorage.removeItem(REDIRECT_STATE_KEY)
    sessionStorage.removeItem(REDIRECT_NONCE_KEY)
  } catch {}

  if (params.get('error')) {
    const err = params.get('error_description') || params.get('error')
    console.error('[AcademeMate] Google sign-in error:', params.get('error'), err)
    redirectAuthError = /redirect_uri_mismatch/i.test(err || '')
      ? 'Google rejected the redirect. Add this page\u2019s address (e.g. https://<username>.github.io/AcademeMate/) to "Authorized redirect URIs" for the OAuth client, then try again.'
      : (err || 'Google sign-in failed. Try again.')
    return false
  }

  if (expected && state !== expected) {
    redirectAuthError = 'Sign-in response did not match this browser session. Please try connecting again.'
    return false
  }

  if (!params.get('access_token')) return false
  const token = storeToken({
    access_token: params.get('access_token'),
    expires_in: Number(params.get('expires_in')) || 3600,
    scope: params.get('scope') || '',
    id_token: params.get('id_token') || null,
  })
  return !!token
}

export function takeRedirectAuthError() {
  const err = redirectAuthError
  redirectAuthError = null
  return err
}

// A cached token is only usable if it still covers every scope the app needs.
// If the scope list changed since the token was issued (e.g. calendar.events was
// added), the old token silently lacks that access and every API call would 403
// with "insufficient authentication scopes" — so treat it as invalid and force
// a fresh consent pop-up instead.
function missingScopes(scopeString) {
  const granted = typeof scopeString === 'string' ? scopeString.split(/\s+/) : []
  return SCOPES.filter(s => !granted.includes(s))
}

function hasRequiredScopes(scopeString) {
  return missingScopes(scopeString).length === 0
}

export function readToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const t = JSON.parse(raw)
    if (!t.access_token || t.expires_at < Date.now()) return null
    if (!hasRequiredScopes(t.scope)) return null
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
    let focusTimer = null

    // The pop-up closed (the main window regained focus) but the token still
    // hasn't arrived: its hand-off to the opener is blocked. Use the full-page
    // redirect fallback, which doesn't rely on that hand-off.
    const fallbackToRedirect = () => {
      if (settled) return
      settled = true
      cleanup()
      startRedirectAuth()
    }

    const onBlur = () => { popupOpened = true }
    const onFocus = () => {
      if (!popupOpened || settled) return
      if (focusTimer) clearTimeout(focusTimer)
      // Small grace period: the callback normally fires right after focus.
      focusTimer = setTimeout(fallbackToRedirect, 4000)
    }
    const cleanup = () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      if (noPopupTimer) clearTimeout(noPopupTimer)
      if (requestTimer) clearTimeout(requestTimer)
      if (focusTimer) clearTimeout(focusTimer)
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
        if (!hasRequiredScopes(resp.scope)) {
          clearToken()
          const missing = missingScopes(resp.scope).join(', ')
          finish(reject, new Error(
            `Google granted only part of the requested access — the token is missing: ${missing}. ` +
            'Open the Google Cloud console for THIS app\u2019s project, add those scopes under ' +
            'APIs & Services > OAuth consent screen > Scopes (save the app afterwards), then try Connect again.',
          ))
          return
        }
        finish(resolve, storeToken(resp))
        return
      }
      finish(reject, new Error('Google did not return an access token. Try again.'))
    }

    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)

    // If no pop-up ever takes focus, it was blocked — fail fast and clearly.
    noPopupTimer = setTimeout(() => {
      if (!settled && !popupOpened) {
        finish(reject, new Error('No Google sign-in pop-up appeared. Allow pop-ups for this site, then click Connect again.'))
      }
    }, 5000)

    // Backstop: if the flow opened but never came back at all, switch to the
    // redirect fallback rather than dead-ending on an error.
    requestTimer = setTimeout(() => {
      if (settled) return
      if (popupOpened) {
        fallbackToRedirect()
      } else {
        finish(reject, new Error(
          'The Google sign-in window did not complete in time. If a pop-up was blocked, allow pop-ups for this site and try again.',
        ))
      }
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
