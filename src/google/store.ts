import { useSyncExternalStore } from 'react'
import { getAppConfig, hasGoogleConfig, hasSupabaseConfig } from '../config'
import {
  connectCloudWithGoogleIdToken,
  connectCloudWithTokens,
  consumeWebOAuthCallback,
  disconnectCloud,
  redirectGoogleOAuthWeb,
  syncCloudNow,
} from '../cloud/store'
import { isDesktop } from '../lib/desktop'
import { markExistingEvents, resetSyncState, syncOnce, type GcalApi } from './sync'

/**
 * Estado da conexão com a Conta Google (Login + Google Agenda + Nuvem).
 */
export interface GoogleStatus {
  connected: boolean
  /** true enquanto lê o estado inicial do Gerenciador de Credenciais */
  ready: boolean
  syncing: boolean
  /** Conta (e-mail) conectada. */
  account?: string
  lastSync?: number
  error?: string
}

const ACCOUNT_KEY = 'bp-gcal-account'
const WEB_TOKEN_KEY = 'bp-gcal-web-token'
const SKIP_LOGIN_KEY = 'bp-skip-login'

let status: GoogleStatus = {
  connected: Boolean(localStorage.getItem(ACCOUNT_KEY)),
  ready: false,
  syncing: false,
  account: localStorage.getItem(ACCOUNT_KEY) ?? undefined,
}
const listeners = new Set<() => void>()
function set(patch: Partial<GoogleStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((fn) => fn())
}

export function useGoogleStatus() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    () => status,
  )
}
export const getGoogleStatus = () => status

export function hasSkippedLogin(): boolean {
  return sessionStorage.getItem(SKIP_LOGIN_KEY) === '1'
}

export function setSkippedLogin(skip: boolean) {
  if (skip) sessionStorage.setItem(SKIP_LOGIN_KEY, '1')
  else sessionStorage.removeItem(SKIP_LOGIN_KEY)
  set({})
}

/** "há 3 minutos" */
export function since(ms?: number) {
  if (!ms) return 'agora há pouco'
  const min = Math.floor((Date.now() - ms) / 60000)
  return min < 1 ? 'agora há pouco' : min === 1 ? 'há 1 minuto' : `há ${min} minutos`
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

/** Erro vindo do Rust: "not_connected" = sem token de API ativo. */
const notConnected = (e: unknown) => String(e).includes('not_connected')

const api: GcalApi = {
  token: async (force) => {
    if (isDesktop()) return invoke<string>('google_access_token', { force })
    const webToken = sessionStorage.getItem(WEB_TOKEN_KEY)
    if (!webToken || force) throw new Error('not_connected')
    return webToken
  },
  fetch: (...args) => fetch(...args),
}

/** Lê se há sessão guardada ao iniciar o app. */
export async function refreshConnected() {
  if (!isDesktop()) {
    const providerToken = await consumeWebOAuthCallback()
    if (providerToken) {
      sessionStorage.setItem(WEB_TOKEN_KEY, providerToken)
      set({ connected: true, ready: true })
      resetSyncState()
      await markExistingEvents()
      await syncNow()
      return true
    }
    const connected = Boolean(sessionStorage.getItem(WEB_TOKEN_KEY) || localStorage.getItem(ACCOUNT_KEY))
    set({ connected, ready: true })
    return connected
  }
  const connected = await invoke<boolean>('google_status').catch(() => false)
  if (!connected) localStorage.removeItem(ACCOUNT_KEY)
  set({ connected, account: connected ? status.account : undefined, ready: true })
  return connected
}

export async function syncNow() {
  if (!status.connected) return
  if (isDesktop() && !hasGoogleConfig() && !sessionStorage.getItem(WEB_TOKEN_KEY)) {
    set({ lastSync: Date.now() })
    return
  }
  set({ syncing: true })
  try {
    await syncOnce(api)
    set({ syncing: false, lastSync: Date.now(), error: undefined })
  } catch (e) {
    if (notConnected(e)) {
      set({ syncing: false, lastSync: status.lastSync ?? Date.now(), error: undefined })
    } else {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.toLowerCase().includes('insufficient authentication scopes')) {
        set({
          syncing: false,
          error:
            'Faltou marcar a caixinha do Google Agenda na tela do Google. Clique em "Sair da conta", entre de novo e marque a caixinha da agenda.',
        })
      } else {
        set({ syncing: false, error: msg })
      }
    }
  }
}

/** Sincroniza Google Agenda e Nuvem (Supabase) de uma só vez. */
export async function syncAllNow() {
  await Promise.all([syncNow(), syncCloudNow()])
}

interface RustConnectOutput {
  email?: string
  idToken?: string
  supabaseAccessToken?: string
  supabaseRefreshToken?: string
  providerToken?: string
}

/**
 * 1 clique "Continuar com o Google":
 * Abre o navegador padrão, autentica a conta Google, retorna ao app e faz login.
 */
export async function connectWithGoogle() {
  const cfg = getAppConfig()

  if (!isDesktop()) {
    if (hasSupabaseConfig(cfg)) {
      redirectGoogleOAuthWeb()
      return
    }
    const email = prompt('E-mail da conta Google:')?.trim()
    if (!email) return
    localStorage.setItem(ACCOUNT_KEY, email)
    set({ connected: true, account: email, lastSync: Date.now(), error: undefined })
    return
  }

  set({ error: undefined })
  const out = await invoke<RustConnectOutput>('google_connect', {
    clientId: cfg.googleClientId,
    clientSecret: cfg.googleClientSecret,
    supabaseUrl: cfg.supabaseUrl || null,
  })

  if (out?.providerToken) {
    sessionStorage.setItem(WEB_TOKEN_KEY, out.providerToken)
  }

  let account = out?.email
  if (!account && (hasGoogleConfig(cfg) || out?.providerToken)) {
    try {
      const info = await api.fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${await api.token(false)}` },
      })
      account = ((await info.json()) as { email?: string }).email
    } catch {
      /* segue mesmo sem conseguir ler o e-mail */
    }
  }

  if (account) {
    localStorage.setItem(ACCOUNT_KEY, account)
  }
  setSkippedLogin(false)
  set({ connected: true, account: account ?? status.account, lastSync: Date.now(), error: undefined })

  resetSyncState()
  await markExistingEvents()

  await Promise.all([
    syncNow(),
    out?.idToken && hasSupabaseConfig(cfg)
      ? connectCloudWithGoogleIdToken(out.idToken, account)
      : out?.supabaseAccessToken && out?.supabaseRefreshToken
        ? connectCloudWithTokens(out.supabaseAccessToken, out.supabaseRefreshToken)
        : Promise.resolve(),
  ])
}

export async function disconnectAll() {
  if (isDesktop()) {
    await invoke('google_disconnect').catch(() => {})
  }
  sessionStorage.removeItem(WEB_TOKEN_KEY)
  resetSyncState()
  localStorage.removeItem(ACCOUNT_KEY)
  set({ connected: false, account: undefined, lastSync: undefined, error: undefined })
  await disconnectCloud()
}
