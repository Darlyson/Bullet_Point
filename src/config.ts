/**
 * Configuração do servidor do app (Google OAuth + Supabase).
 *
 * Para que o usuário final veja APENAS o botão "Entrar com o Google" (sem
 * precisar configurar nada), preencha essas variáveis no arquivo `.env` na
 * raiz do projeto antes de rodar `npm run desktop:build`:
 *
 *   VITE_GOOGLE_CLIENT_ID=...
 *   VITE_GOOGLE_CLIENT_SECRET=...
 *   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJ...
 *
 * Durante o desenvolvimento, se o `.env` não estiver preenchido, o app também
 * aceita os valores salvos na seção "Configurar servidor (desenvolvedor)".
 */

export interface AppConfig {
  googleClientId: string
  googleClientSecret: string
  supabaseUrl: string
  supabaseAnonKey: string
}

const APP_CONFIG_KEY = 'bp-app-config'
const LEGACY_GCAL_KEY = 'bp-gcal-client'
const LEGACY_CLOUD_KEY = 'bp-cloud-config'

const ENV_CONFIG: AppConfig = {
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '',
  googleClientSecret: (import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string | undefined)?.trim() ?? '',
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/+$/, '') ?? '',
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '',
}

function readJson<T>(key: string): Partial<T> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<T>
  } catch {
    return {}
  }
}

export function getAppConfig(): AppConfig {
  const saved = readJson<AppConfig>(APP_CONFIG_KEY)
  const legacyGcal = readJson<{ clientId: string; clientSecret: string }>(LEGACY_GCAL_KEY)
  const legacyCloud = readJson<{ url: string; anonKey: string }>(LEGACY_CLOUD_KEY)

  return {
    googleClientId: (saved.googleClientId || ENV_CONFIG.googleClientId || legacyGcal.clientId || '').trim(),
    googleClientSecret: (saved.googleClientSecret || ENV_CONFIG.googleClientSecret || legacyGcal.clientSecret || '').trim(),
    supabaseUrl: (saved.supabaseUrl || ENV_CONFIG.supabaseUrl || legacyCloud.url || '').trim().replace(/\/+$/, ''),
    supabaseAnonKey: (saved.supabaseAnonKey || ENV_CONFIG.supabaseAnonKey || legacyCloud.anonKey || '').trim(),
  }
}

export function saveAppConfig(cfg: Partial<AppConfig>) {
  const next: AppConfig = { ...getAppConfig(), ...cfg }
  next.googleClientId = next.googleClientId.trim()
  next.googleClientSecret = next.googleClientSecret.trim()
  next.supabaseUrl = next.supabaseUrl.trim().replace(/\/+$/, '')
  next.supabaseAnonKey = next.supabaseAnonKey.trim()
  localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(next))
}

export function hasGoogleConfig(cfg = getAppConfig()): boolean {
  return Boolean(cfg.googleClientId && cfg.googleClientSecret)
}

export function hasSupabaseConfig(cfg = getAppConfig()): boolean {
  return Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey)
}
