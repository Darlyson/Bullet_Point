import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { db } from '../db/db'
import { toISODate, uid } from '../lib/date'

/**
 * Estado global do foco. Fica fora das janelas para que o cronômetro
 * continue rodando mesmo se você fechar/mover a janela, e para que a
 * janela do YouTube e a de Foco compartilhem o mesmo vídeo e tópico.
 */
export interface FocusState {
  status: 'idle' | 'running' | 'paused'
  sessionStart: number | null
  runStart: number | null
  accumulated: number
  mode: 'stopwatch' | 'pomodoro'
  pomodoroMin: number
  topicId: string
  label: string
  youtubeUrl: string
}

const INITIAL: FocusState = {
  status: 'idle',
  sessionStart: null,
  runStart: null,
  accumulated: 0,
  mode: 'stopwatch',
  pomodoroMin: 25,
  topicId: '',
  label: '',
  youtubeUrl: '',
}

const STORAGE_KEY = 'bp-focus'
const MIN_SAVE_SEC = 10

interface FocusApi {
  state: FocusState
  elapsed: number
  /** Segundos restantes no pomodoro (null no modo cronômetro) */
  remaining: number | null
  update: (patch: Partial<FocusState>) => void
  start: () => void
  pause: () => void
  finish: () => Promise<void>
  discard: () => void
}

const FocusCtx = createContext<FocusApi | null>(null)

function load(): FocusState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...INITIAL, ...JSON.parse(raw) } : INITIAL
  } catch {
    return INITIAL
  }
}

function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 1.2)
  } catch {
    /* sem áudio disponível */
  }
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FocusState>(load)
  const [now, setNow] = useState(() => Date.now())
  const finishing = useRef(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    if (state.status !== 'running') return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [state.status])

  const elapsed =
    state.accumulated + (state.status === 'running' && state.runStart ? (now - state.runStart) / 1000 : 0)
  const target = state.pomodoroMin * 60
  const remaining = state.mode === 'pomodoro' ? Math.max(0, target - elapsed) : null

  const update = useCallback((patch: Partial<FocusState>) => setState((s) => ({ ...s, ...patch })), [])

  const start = useCallback(() => {
    const t = Date.now()
    setNow(t)
    setState((s) => ({
      ...s,
      status: 'running',
      runStart: t,
      sessionStart: s.sessionStart ?? t,
    }))
  }, [])

  const pause = useCallback(() => {
    setState((s) => {
      if (s.status !== 'running' || !s.runStart) return s
      return { ...s, status: 'paused', accumulated: s.accumulated + (Date.now() - s.runStart) / 1000, runStart: null }
    })
  }, [])

  const reset = (s: FocusState): FocusState => ({
    ...s,
    status: 'idle',
    sessionStart: null,
    runStart: null,
    accumulated: 0,
  })

  const finish = useCallback(async () => {
    if (finishing.current) return
    finishing.current = true
    try {
      const s = state
      const total = s.accumulated + (s.status === 'running' && s.runStart ? (Date.now() - s.runStart) / 1000 : 0)
      if (s.sessionStart && total >= MIN_SAVE_SEC) {
        await db.focusSessions.add({
          id: uid(),
          topicId: s.topicId || undefined,
          label: s.label.trim(),
          youtubeUrl: s.youtubeUrl || undefined,
          startedAt: s.sessionStart,
          durationSec: Math.round(total),
          date: toISODate(new Date(s.sessionStart)),
        })
      }
      setState(reset)
    } finally {
      finishing.current = false
    }
  }, [state])

  const discard = useCallback(() => setState(reset), [])

  // Pomodoro terminou → salva e avisa.
  useEffect(() => {
    if (state.status === 'running' && remaining === 0) {
      beep()
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Pomodoro concluído!', { body: state.label || 'Hora de uma pausa.' })
      }
      void finish()
    }
  }, [remaining, state.status, state.label, finish])

  const api = useMemo(
    () => ({ state, elapsed, remaining, update, start, pause, finish, discard }),
    [state, elapsed, remaining, update, start, pause, finish, discard],
  )
  return <FocusCtx.Provider value={api}>{children}</FocusCtx.Provider>
}

export function useFocus(): FocusApi {
  const ctx = useContext(FocusCtx)
  if (!ctx) throw new Error('useFocus precisa estar dentro de <FocusProvider>')
  return ctx
}
