import type { Bullet } from '../db/db'
import { db } from '../db/db'

/**
 * Marca o que precisa ir para o Google Agenda, em qualquer lugar do app que
 * mexa nos bullets (diário, anotação rápida, migrar, tópicos...):
 * - evento criado ou alterado → `gcalDirty: true`;
 * - bullet ligado ao Google excluído → id entra na fila de exclusões.
 * O próprio sincronizador escreve com `gcalSync` (um valor novo a cada vez), e aí nada é marcado.
 */

const DELETES_KEY = 'bp-gcal-deletes'

export function pendingDeletes(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DELETES_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function setDeletes(ids: string[]) {
  localStorage.setItem(DELETES_KEY, JSON.stringify([...new Set(ids)]))
  notify()
}

export const queueDelete = (gcalId: string) => setDeletes([...pendingDeletes(), gcalId])
export const unqueueDelete = (gcalId: string) => setDeletes(pendingDeletes().filter((id) => id !== gcalId))

// Avisa o agendador (GoogleSync) que há algo para enviar.
const listeners = new Set<() => void>()
export function onLocalChange(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
function notify() {
  queueMicrotask(() => listeners.forEach((fn) => fn()))
}

/** Avisa o agendador do Google Agenda (usado quando a nuvem traz um evento criado no celular). */
export const triggerGoogleSync = notify

let paused = false

/**
 * Roda `fn` sem marcar nada para o Google (ex.: importar um backup, que
 * apaga e recria tudo: isso não pode virar "excluir tudo no Google").
 */
export async function withoutTracking<T>(fn: () => Promise<T>): Promise<T> {
  paused = true
  try {
    return await fn()
  } finally {
    paused = false
  }
}

db.bullets.hook('creating', (_pk, obj: Bullet) => {
  if (paused) return
  obj.updatedAt ??= Date.now()
  if (obj.type === 'event' && obj.gcalDirty === undefined) {
    obj.gcalDirty = true
    notify()
  }
})

db.bullets.hook('updating', (mods: Partial<Bullet>, _pk, obj: Bullet) => {
  if (paused || 'gcalSync' in mods) return undefined
  const type = mods.type ?? obj.type
  if (type === 'event' || obj.gcalId) {
    notify()
    return { updatedAt: Date.now(), gcalDirty: true }
  }
  return { updatedAt: Date.now() }
})

db.bullets.hook('deleting', (_pk, obj: Bullet) => {
  if (!paused && obj.gcalId) queueDelete(obj.gcalId)
})
