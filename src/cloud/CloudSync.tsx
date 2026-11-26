import { useEffect } from 'react'
import { onCloudLocalChange } from './track'
import { getCloudStatus, syncCloudNow, useCloudStatus } from './store'

const EVERY_MS = 3 * 60 * 1000
const AFTER_CHANGE_MS = 2000

/**
 * Agendador da sincronização com o Supabase (funciona no PC, web e celular):
 * sincroniza ao abrir, a cada 3 minutos, ao voltar para o app / recuperar a
 * internet e 2 s após qualquer alteração local.
 */
export default function CloudSync() {
  const { connected } = useCloudStatus()

  useEffect(() => {
    if (!connected) return
    void syncCloudNow()
    const timer = setInterval(() => void syncCloudNow(), EVERY_MS)

    let debounce: ReturnType<typeof setTimeout> | undefined
    const off = onCloudLocalChange(() => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void syncCloudNow(), AFTER_CHANGE_MS)
    })

    const onFocus = () => {
      const last = getCloudStatus().lastSync ?? 0
      if (Date.now() - last > 30_000) void syncCloudNow()
    }
    const onOnline = () => void syncCloudNow()

    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)

    return () => {
      clearInterval(timer)
      clearTimeout(debounce)
      off()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
    }
  }, [connected])

  return null
}
