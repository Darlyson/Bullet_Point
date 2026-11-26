import { useEffect } from 'react'
import { onLocalChange } from './track'
import { getGoogleStatus, refreshConnected, syncNow, useGoogleStatus } from './store'

const EVERY_MS = 5 * 60 * 1000
const AFTER_CHANGE_MS = 2000

/**
 * Agendador da sincronização com o Google Agenda (só no app desktop):
 * ao abrir, a cada 5 minutos, ao voltar para o app e 2 s depois de mudar
 * um evento aqui.
 */
export default function GoogleSync() {
  const { connected } = useGoogleStatus()

  useEffect(() => {
    void refreshConnected()
  }, [])

  useEffect(() => {
    if (!connected) return
    void syncNow()
    const timer = setInterval(() => void syncNow(), EVERY_MS)

    let debounce: ReturnType<typeof setTimeout> | undefined
    const off = onLocalChange(() => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void syncNow(), AFTER_CHANGE_MS)
    })

    const onFocus = () => {
      const last = getGoogleStatus().lastSync ?? 0
      if (Date.now() - last > 60_000) void syncNow()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(timer)
      clearTimeout(debounce)
      off()
      window.removeEventListener('focus', onFocus)
    }
  }, [connected])

  return null
}
