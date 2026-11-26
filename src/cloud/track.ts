import { db, TABLES, type TableName } from '../db/db'

/**
 * Rastreia alterações locais em todas as tabelas do banco (espaços de trabalho,
 * tópicos, hábitos, registros de hábito, bullets, notas e sessões de foco)
 * para sincronizar apenas o que mudou com o Supabase.
 *
 * Usa um relógio lógico híbrido (`Math.max(Date.now(), maiorVisto + 1)`) para
 * que edições feitas depois sempre tenham `updatedAt` maior, mesmo que o
 * relógio do PC e o do celular estejam alguns segundos diferentes.
 */

const DIRTY_KEY = 'bp-cloud-dirty'
const DELETES_KEY = 'bp-cloud-deletes'
const TIMES_KEY = 'bp-cloud-times'
const CLOCK_KEY = 'bp-cloud-clock'

type StampMap = Record<string, number>

function readMap(key: string): StampMap {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as StampMap
  } catch {
    return {}
  }
}

let dirty: StampMap = readMap(DIRTY_KEY)
let deletes: StampMap = readMap(DELETES_KEY)
let times: StampMap = readMap(TIMES_KEY)
let maxClock = Number(localStorage.getItem(CLOCK_KEY) ?? '0') || 0
let flushScheduled = false

function scheduleFlush(shouldNotify: boolean) {
  if (!flushScheduled) {
    flushScheduled = true
    queueMicrotask(() => {
      flushScheduled = false
      localStorage.setItem(DIRTY_KEY, JSON.stringify(dirty))
      localStorage.setItem(DELETES_KEY, JSON.stringify(deletes))
      localStorage.setItem(TIMES_KEY, JSON.stringify(times))
      localStorage.setItem(CLOCK_KEY, String(maxClock))
    })
  }
  if (shouldNotify) notify()
}

export const recordKey = (table: TableName, id: string) => `${table}:${id}`

export function nextClock(): number {
  maxClock = Math.max(Date.now(), maxClock + 1)
  return maxClock
}

export function observeClock(remoteTime: number) {
  if (remoteTime > maxClock) {
    maxClock = remoteTime
    scheduleFlush(false)
  }
}

export const getDirtyMap = (): Readonly<StampMap> => dirty
export const getDeletesMap = (): Readonly<StampMap> => deletes

export function getRecordTime(table: TableName, id: string): number {
  const k = recordKey(table, id)
  return Math.max(dirty[k] ?? 0, deletes[k] ?? 0, times[k] ?? 0)
}

export function isRecordDirty(table: TableName, id: string): boolean {
  const k = recordKey(table, id)
  return k in dirty || k in deletes
}

export function setRecordSynced(table: TableName, id: string, remoteTime: number) {
  const k = recordKey(table, id)
  observeClock(remoteTime)
  delete dirty[k]
  delete deletes[k]
  times[k] = remoteTime
  scheduleFlush(false)
}

export function markDirty(table: TableName, id: string, stamp = nextClock(), shouldNotify = true) {
  if (!id) return
  const k = recordKey(table, id)
  dirty[k] = stamp
  times[k] = stamp
  delete deletes[k]
  scheduleFlush(shouldNotify)
}

export function markDeleted(table: TableName, id: string, stamp = nextClock(), shouldNotify = true) {
  if (!id) return
  const k = recordKey(table, id)
  deletes[k] = stamp
  times[k] = stamp
  delete dirty[k]
  scheduleFlush(shouldNotify)
}

/** Só limpa a pendência se o item não foi editado de novo durante o envio. */
export function clearDirtyIfUnchanged(table: TableName, id: string, pushedStamp: number) {
  const k = recordKey(table, id)
  if (dirty[k] !== undefined && dirty[k] <= pushedStamp) {
    delete dirty[k]
    times[k] = Math.max(times[k] ?? 0, pushedStamp)
    scheduleFlush(false)
  }
}

export function clearDeleteIfUnchanged(table: TableName, id: string, pushedStamp: number) {
  const k = recordKey(table, id)
  if (deletes[k] !== undefined && deletes[k] <= pushedStamp) {
    delete deletes[k]
    times[k] = Math.max(times[k] ?? 0, pushedStamp)
    scheduleFlush(false)
  }
}

export function resetCloudTracking() {
  dirty = {}
  deletes = {}
  times = {}
  maxClock = 0
  localStorage.removeItem(DIRTY_KEY)
  localStorage.removeItem(DELETES_KEY)
  localStorage.removeItem(TIMES_KEY)
  localStorage.removeItem(CLOCK_KEY)
}

const listeners = new Set<() => void>()
export function onCloudLocalChange(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

let notifyScheduled = false
function notify() {
  if (notifyScheduled) return
  notifyScheduled = true
  queueMicrotask(() => {
    notifyScheduled = false
    listeners.forEach((fn) => fn())
  })
}

let pausedDepth = 0

/**
 * Executa `fn` sem marcar alterações para o Supabase (ex.: ao aplicar o que
 * veio da nuvem, ao criar os espaços iniciais ou ao importar um backup).
 */
export async function withoutCloudTracking<T>(fn: () => Promise<T>): Promise<T> {
  pausedDepth++
  try {
    return await fn()
  } finally {
    pausedDepth--
  }
}

for (const table of TABLES) {
  db.table(table).hook('creating', (pk, obj: { id?: string }) => {
    if (pausedDepth > 0) return
    const id = String(obj?.id ?? pk ?? '')
    markDirty(table, id)
  })

  db.table(table).hook('updating', (_mods, pk, obj: { id?: string }) => {
    if (pausedDepth > 0) return undefined
    const id = String(obj?.id ?? pk ?? '')
    markDirty(table, id)
    return undefined
  })

  db.table(table).hook('deleting', (pk, obj: { id?: string }) => {
    if (pausedDepth > 0) return
    const id = String(obj?.id ?? pk ?? '')
    markDeleted(table, id)
  })
}
