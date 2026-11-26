import { useSyncExternalStore } from 'react'
import { getAppConfig, hasSupabaseConfig, saveAppConfig } from '../config'
import { CloudError, initialCloudSync, resetCloudSyncState, syncCloudOnce, type CloudApi } from './sync'
import { resetCloudTracking } from './track'

/**
 * Estado da conexão e sincronização com o Supabase (PC e celular).
 */
export interface CloudStatus {
  connected: boolean
  syncing: boolean
  email?: string
  lastSync?: number
  error?: string
}

interface StoredSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  userId: string
  email: string
}

const SESSION_KEY = 'bp-cloud-session'
const SESSION_EXPIRED = 'session_expired'

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    return parsed?.refreshToken && parsed?.userId ? parsed : null
  } catch {
    return null
  }
}

function saveSession(s: StoredSession | null) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  else localStorage.removeItem(SESSION_KEY)
}

const initialSession = loadSession()

let status: CloudStatus = {
  connected: Boolean(initialSession && hasSupabaseConfig()),
  syncing: false,
  email: initialSession?.email || undefined,
}

const listeners = new Set<() => void>()
function set(patch: Partial<CloudStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((fn) => fn())
}

export function useCloudStatus() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    () => status,
  )
}

export const getCloudStatus = () => status

interface AuthResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  user?: { id?: string; email?: string }
  error?: string
  error_description?: string
  msg?: string
  message?: string
}

async function authRequest(url: string, anonKey: string, path: string, body: unknown): Promise<AuthResponse> {
  const base = url.trim().replace(/\/+$/, '')
  let res: Response
  try {
    res = await fetch(`${base}/auth/v1${path}`, {
      method: 'POST',
      headers: {
        apikey: anonKey.trim(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    throw new Error(`Sem conexão com o Supabase: ${e instanceof Error ? e.message : String(e)}`)
  }

  let data: AuthResponse = {}
  try {
    data = (await res.json()) as AuthResponse
  } catch {
    /* corpo vazio */
  }

  if (!res.ok) {
    const rawMsg = data.error_description || data.msg || data.message || data.error || `Erro ${res.status}`
    const lower = rawMsg.toLowerCase()
    if (lower.includes('provider is not enabled') || lower.includes('unsupported provider')) {
      throw new Error(
        'Ative o login com Google no Supabase (Authentication → Providers → Google) usando o mesmo Client ID do Google.',
      )
    }
    if (res.status === 400 || res.status === 401) {
      if (lower.includes('invalid login credentials')) {
        throw new Error('E-mail ou senha incorretos (ou a conta ainda não foi criada).')
      }
      if (lower.includes('email not confirmed')) {
        throw new Error(
          'E-mail ainda não confirmado. Confirme no link enviado pelo Supabase ou desative "Confirm email" em Authentication → Providers → Email.',
        )
      }
      if (lower.includes('invalid_grant') || lower.includes('refresh token')) {
        throw new Error(SESSION_EXPIRED)
      }
    }
    throw new Error(`Supabase recusou: ${rawMsg}`)
  }

  return data
}

let refreshPromise: Promise<string> | null = null

async function getAccessToken(force: boolean): Promise<string> {
  const session = loadSession()
  const cfg = getAppConfig()
  if (!session || !cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error(SESSION_EXPIRED)

  if (!force && session.accessToken && Date.now() + 60_000 < session.expiresAt) {
    return session.accessToken
  }

  refreshPromise ??= (async () => {
    try {
      const data = await authRequest(cfg.supabaseUrl, cfg.supabaseAnonKey, '/token?grant_type=refresh_token', {
        refresh_token: session.refreshToken,
      })
      if (!data.access_token || !data.refresh_token) throw new Error(SESSION_EXPIRED)
      const next: StoredSession = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
        userId: data.user?.id ?? session.userId,
        email: data.user?.email ?? session.email,
      }
      saveSession(next)
      return next.accessToken
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

function buildApi(): CloudApi | null {
  const session = loadSession()
  const cfg = getAppConfig()
  if (!session || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null
  return {
    url: cfg.supabaseUrl,
    anonKey: cfg.supabaseAnonKey,
    userId: session.userId,
    token: getAccessToken,
    fetch: (...args) => fetch(...args),
  }
}

export async function syncCloudNow() {
  const api = buildApi()
  if (!api || !status.connected) return
  set({ syncing: true })
  try {
    await syncCloudOnce(api)
    set({ syncing: false, lastSync: Date.now(), error: undefined })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === SESSION_EXPIRED) {
      saveSession(null)
      set({
        syncing: false,
        connected: false,
        error: 'Sua sessão na nuvem expirou. Clique em Entrar com o Google novamente.',
      })
    } else {
      set({ syncing: false, error: msg })
    }
  }
}

async function activateSessionAndSync(data: AuthResponse, fallbackEmail?: string) {
  if (!data.access_token || !data.refresh_token || !data.user?.id) {
    throw new Error('O Supabase não devolveu uma sessão ativa.')
  }
  const session: StoredSession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    userId: data.user.id,
    email: data.user.email ?? fallbackEmail ?? '',
  }
  saveSession(session)
  set({ connected: true, email: session.email || undefined, syncing: true, error: undefined })

  const api = buildApi()!
  try {
    await initialCloudSync(api)
    set({ syncing: false, lastSync: Date.now(), error: undefined })
  } catch (e) {
    const msg = e instanceof CloudError || e instanceof Error ? e.message : String(e)
    set({ syncing: false, error: msg })
    throw e
  }
}

/**
 * Autentica automaticamente no Supabase usando o `id_token` já obtido no login
 * único do Google (sem o usuário precisar digitar e-mail ou senha).
 */
export async function connectCloudWithGoogleIdToken(idToken: string, emailHint?: string) {
  const cfg = getAppConfig()
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return
  set({ error: undefined })
  try {
    const data = await authRequest(cfg.supabaseUrl, cfg.supabaseAnonKey, '/token?grant_type=id_token', {
      provider: 'google',
      id_token: idToken,
    })
    await activateSessionAndSync(data, emailHint)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    set({ syncing: false, error: msg })
  }
}

export async function connectCloudWithTokens(accessToken: string, refreshToken: string) {
  const cfg = getAppConfig()
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !accessToken) return
  try {
    const res = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (res.ok) {
      const user = (await res.json()) as { id?: string; email?: string }
      if (user.id) {
        await activateSessionAndSync({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
          user,
        })
      }
    }
  } catch {
    /* falha de rede ao ler usuário */
  }
}

/**
 * No navegador / celular (fora do Tauri desktop): redireciona para o login
 * Google via Supabase OAuth já pedindo a permissão do Google Agenda.
 */
export function redirectGoogleOAuthWeb() {
  const cfg = getAppConfig()
  if (!cfg.supabaseUrl) {
    throw new Error('Configure a URL do Supabase antes de entrar pelo navegador.')
  }
  const params = new URLSearchParams({
    provider: 'google',
    redirect_to: window.location.origin,
    scopes: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
  })
  window.location.href = `${cfg.supabaseUrl}/auth/v1/authorize?${params}`
}

/**
 * Captura o retorno do login Google OAuth no navegador/celular (`#access_token=...`).
 */
export async function consumeWebOAuthCallback(): Promise<string | null> {
  if (!window.location.hash.includes('access_token=')) return null
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const providerToken = params.get('provider_token')
  const expiresIn = Number(params.get('expires_in') ?? '3600') || 3600
  history.replaceState(null, '', window.location.pathname + window.location.search)

  if (!accessToken || !refreshToken) return null
  const cfg = getAppConfig()
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return providerToken

  try {
    const res = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (res.ok) {
      const user = (await res.json()) as { id?: string; email?: string }
      if (user.id) {
        await activateSessionAndSync({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: expiresIn,
          user,
        })
      }
    }
  } catch {
    /* falha de rede ao ler usuário */
  }
  return providerToken
}

/** Fallback opcional por e-mail/senha (caso não use Google Auth no Supabase). */
export async function connectCloudWithPassword(
  url: string,
  anonKey: string,
  email: string,
  password: string,
  mode: 'signin' | 'signup',
) {
  saveAppConfig({ supabaseUrl: url, supabaseAnonKey: anonKey })
  const cfg = getAppConfig()
  const cleanEmail = email.trim()
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !cleanEmail || !password) {
    throw new Error('Preencha a URL do projeto, a chave pública, o e-mail e a senha.')
  }
  set({ error: undefined })
  const path = mode === 'signup' ? '/signup' : '/token?grant_type=password'
  const data = await authRequest(cfg.supabaseUrl, cfg.supabaseAnonKey, path, { email: cleanEmail, password })
  if (!data.access_token || !data.refresh_token || !data.user?.id) {
    throw new Error(
      'Conta criada! Confirme o e-mail enviado pelo Supabase (ou desative "Confirm email" em Authentication → Providers → Email) e clique em Entrar.',
    )
  }
  await activateSessionAndSync(data, cleanEmail)
}

export async function disconnectCloud() {
  const session = loadSession()
  const cfg = getAppConfig()
  if (session && cfg.supabaseUrl && cfg.supabaseAnonKey) {
    try {
      await fetch(`${cfg.supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: cfg.supabaseAnonKey,
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
    } catch {
      /* desconecta localmente mesmo sem internet */
    }
  }
  saveSession(null)
  resetCloudSyncState()
  resetCloudTracking()
  set({ connected: false, syncing: false, email: undefined, lastSync: undefined, error: undefined })
}
