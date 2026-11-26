import { useEffect, useState } from 'react'
import { useCloudStatus } from '../cloud/store'
import { connectWithGoogle, disconnectAll, setSkippedLogin, since, syncAllNow, useGoogleStatus } from './store'

export function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

/**
 * Tela de Login pelo Google (padrão de mercado):
 * redireciona para o navegador padrão, autentica a conta do Google e volta
 * para o app já logado, sem pedir nenhuma chave ao usuário.
 */
export default function GoogleDialog({ onClose }: { onClose: () => void }) {
  const google = useGoogleStatus()
  const cloud = useCloudStatus()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [, tick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const isConnected = google.connected || cloud.connected
  const isSyncing = google.syncing || cloud.syncing
  const accountEmail = google.account || cloud.email
  const lastSync = Math.max(google.lastSync ?? 0, cloud.lastSync ?? 0) || undefined

  function dismiss() {
    setSkippedLogin(true)
    onClose()
  }

  async function handleGoogleLogin() {
    setBusy(true)
    setError('')
    try {
      await connectWithGoogle()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Sair da conta Google? Seus dados locais continuam salvos neste computador.')) return
    await disconnectAll()
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && dismiss()}>
      <div className="dialog login-card" onKeyDown={(e) => e.key === 'Escape' && !busy && dismiss()}>
        {isConnected ? (
          <div className="stack">
            <div className="row between">
              <div className="row">
                <GoogleLogo size={20} />
                <h3>Conta Google</h3>
              </div>
              <button className="icon-btn ghost" onClick={onClose} disabled={busy} title="Fechar">
                ✕
              </button>
            </div>

            <div className="account-box">
              <div className="account-avatar">{(accountEmail?.[0] ?? 'G').toUpperCase()}</div>
              <div>
                <strong>{accountEmail ?? 'Conta Google conectada'}</strong>
                <div className="muted small">
                  {isSyncing ? 'Sincronizando…' : `Sincronizado ${since(lastSync)}`}
                </div>
              </div>
            </div>

            <p className="muted">
              Seus eventos (○) do diário e seus dados (hábitos, notas, tópicos, foco e espaços de trabalho) estão
              vinculados à sua conta Google.
            </p>

            {(google.error || cloud.error) && (
              <p className="error">⚠ {google.error || cloud.error}</p>
            )}

            <div className="row between">
              <button className="primary" onClick={() => void syncAllNow()} disabled={isSyncing}>
                ↻ Sincronizar agora
              </button>
              <button className="ghost" onClick={() => void handleDisconnect()} disabled={isSyncing}>
                Sair da conta
              </button>
            </div>
          </div>
        ) : (
          <div className="login-screen">
            <div className="login-brand">◆</div>
            <h2>Entrar no Bullet Point</h2>
            <p className="muted">
              Faça login com sua conta do Google no navegador para sincronizar automaticamente sua agenda, hábitos,
              diário, notas e sessões de foco.
            </p>

            {(error || google.error || cloud.error) && (
              <p className="error">⚠ {error || google.error || cloud.error}</p>
            )}

            <button
              className="google-login-btn"
              type="button"
              onClick={() => void handleGoogleLogin()}
              disabled={busy}
            >
              <GoogleLogo size={20} />
              <span>{busy ? 'Aguardando confirmação no navegador…' : 'Continuar com o Google'}</span>
            </button>

            <button className="ghost small-btn" type="button" onClick={dismiss} disabled={busy}>
              Continuar sem conta (usar apenas neste computador)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
