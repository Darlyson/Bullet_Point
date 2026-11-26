import { useEffect, useRef, useState } from 'react'
import { isDesktop } from '../lib/desktop'
import { useFocus } from '../focus/FocusContext'
import { useTopics } from '../components/topics'
import QuickAdd, { type Restore } from './QuickAdd'

/**
 * Liga o app desktop (src-tauri/src/desktop.rs) às telas:
 * - atalho/menu da bandeja "iniciar/pausar foco" → cronômetro;
 * - atalho/menu "anotação rápida" → abre a caixa de anotação;
 * - estado do foco → texto do menu e dica do ícone na bandeja.
 * No navegador não faz nada.
 */
export default function DesktopBridge() {
  const focus = useFocus()
  const [quick, setQuick] = useState<Restore | null>(null)
  const { byId } = useTopics()

  // A função do evento é registrada uma vez; o ref sempre tem o foco atual.
  const focusRef = useRef(focus)
  useEffect(() => {
    focusRef.current = focus
  })

  useEffect(() => {
    if (!isDesktop()) return
    const offs: (() => void)[] = []
    let alive = true
    void (async () => {
      const { listen } = await import('@tauri-apps/api/event')
      const subs = await Promise.all([
        listen('bp://focus-toggle', () => {
          const f = focusRef.current
          if (f.state.status === 'running') {
            f.pause()
            tone(440)
          } else {
            f.start()
            tone(660)
          }
        }),
        listen<{ restore: Restore }>('bp://quick-add', (e) => setQuick((cur) => cur ?? e.payload.restore)),
      ])
      if (alive) offs.push(...subs)
      else subs.forEach((off) => off())
    })()
    return () => {
      alive = false
      offs.forEach((off) => off())
    }
  }, [])

  // Com o app escondido na bandeja, o WebView2 atrasa os timers da página
  // (depois de 5 min, até 1 vez por minuto) e o aviso do pomodoro sairia
  // atrasado. Segurar uma Web Lock enquanto o foco roda evita esse atraso.
  const running = focus.state.status === 'running'
  useEffect(() => {
    if (!isDesktop() || !running || !navigator.locks) return
    let release: (() => void) | undefined
    let done = false
    void navigator.locks.request('bp-focus-running', () =>
      new Promise<void>((resolve) => {
        release = resolve
        if (done) resolve()
      }),
    )
    return () => {
      done = true
      release?.()
    }
  }, [running])

  // Menu e dica da bandeja. Atualiza só quando muda o minuto (não a cada 250 ms).
  const { status, mode, label, topicId } = focus.state
  const shown = Math.floor((focus.remaining ?? focus.elapsed) / 60)
  const topic = byId.get(topicId)?.name
  const what = [label.trim(), topic].filter(Boolean).join(' · ')
  useEffect(() => {
    if (!isDesktop()) return
    const menuText = status === 'running' ? 'Pausar foco' : status === 'paused' ? 'Retomar foco' : 'Iniciar foco'
    const time = mode === 'pomodoro' ? `faltam ${shown + 1} min` : `${shown} min`
    const tooltip =
      status === 'idle' ? '' : `${status === 'paused' ? '⏸ Foco pausado' : '⏱ Foco'}: ${time}${what ? ` — ${what}` : ''}`
    void (async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('set_focus_status', { menuText, tooltip }).catch(() => {})
    })()
  }, [status, mode, shown, what])

  return quick ? <QuickAdd restore={quick} onClose={() => setQuick(null)} /> : null
}

/** Bipe curto para confirmar o atalho do foco (agudo: começou; grave: pausou). */
function tone(freq: number) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.25)
    osc.onended = () => void ctx.close()
  } catch {
    /* sem áudio */
  }
}
