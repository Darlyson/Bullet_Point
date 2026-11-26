import { db, type Bullet } from '../db/db'
import { addDays, toISODate, uid } from '../lib/date'
import { pendingDeletes, unqueueDelete } from './track'

/**
 * Sincronização em mão dupla entre os eventos (○) do diário e a agenda
 * principal do Google.
 *
 * Cada rodada:
 * 1. Traz do Google o que mudou desde a última vez (syncToken). Na primeira
 *    vez, traz de 30 dias atrás até 1 ano à frente.
 * 2. Envia o que mudou aqui: exclusões pendentes e eventos com `gcalDirty`.
 *
 * Conflito (mudou dos dois lados): vale a alteração mais recente.
 * Só o título, o dia e o horário vão e voltam; tópico e "feito" ficam só no app.
 */

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary'
const STATE_KEY = 'bp-gcal'
/** Eventos do app mais antigos que isto não são enviados ao Google. */
const PAST_DAYS = 30

export interface GcalApi {
  /** Access token; `force` pede um novo (o atual foi recusado). */
  token: (force: boolean) => Promise<string>
  fetch: typeof fetch
}

interface SyncState {
  syncToken?: string
}

export interface GEvent {
  id: string
  status?: string
  summary?: string
  updated?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

export class GoogleError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function loadState(): SyncState {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as SyncState
  } catch {
    return {}
  }
}
const saveState = (s: SyncState) => localStorage.setItem(STATE_KEY, JSON.stringify(s))

/** Esquece o ponto da última sincronização: a próxima relê a agenda toda. */
export function resetSyncState() {
  localStorage.removeItem(STATE_KEY)
}

async function call<T>(api: GcalApi, method: string, path: string, body?: unknown): Promise<T | null> {
  const send = async (force: boolean) =>
    api.fetch(path.startsWith('http') ? path : API + path, {
      method,
      headers: {
        Authorization: `Bearer ${await api.token(force)}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  let res = await send(false)
  if (res.status === 401) res = await send(true)
  if (res.status === 204) return null
  if (!res.ok) {
    let msg = `${res.status}`
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? msg
    } catch {
      /* corpo vazio */
    }
    throw new GoogleError(msg, res.status)
  }
  return (await res.json()) as T
}

// ---------- conversão ----------

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Evento do Google → campos do bullet. */
export function fromGoogle(ev: GEvent): Pick<Bullet, 'date' | 'time' | 'endTime' | 'text'> {
  const text = ev.summary?.trim() || '(sem título)'
  if (ev.start?.dateTime) {
    const start = new Date(ev.start.dateTime)
    const end = ev.end?.dateTime ? new Date(ev.end.dateTime) : undefined
    const date = toISODate(start)
    return { date, time: hhmm(start), endTime: end && toISODate(end) === date ? hhmm(end) : undefined, text }
  }
  return { date: ev.start?.date ?? toISODate(), time: undefined, endTime: undefined, text }
}

/** Bullet → corpo do evento no Google (com null para apagar o formato antigo ao trocar dia inteiro ↔ horário). */
export function toGoogle(b: Bullet) {
  if (!b.time) {
    return {
      summary: b.text,
      start: { date: b.date, dateTime: null, timeZone: null },
      end: { date: addDays(b.date, 1), dateTime: null, timeZone: null },
    }
  }
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  let endDate = b.date
  let end = b.endTime && b.endTime > b.time ? b.endTime : undefined
  if (!end) {
    // Sem fim: 1 hora de duração.
    const [h, m] = b.time.split(':').map(Number)
    const d = new Date(2000, 0, 1, h + 1, m)
    end = hhmm(d)
    if (d.getDate() !== 1) endDate = addDays(b.date, 1)
  }
  return {
    summary: b.text,
    start: { dateTime: `${b.date}T${b.time}:00`, timeZone, date: null },
    end: { dateTime: `${endDate}T${end}:00`, timeZone, date: null },
  }
}

// ---------- 1. trazer do Google ----------

async function pull(api: GcalApi): Promise<number> {
  const state = loadState()
  const items: GEvent[] = []
  let syncToken = state.syncToken
  let pageToken: string | undefined
  let nextSyncToken: string | undefined

  for (;;) {
    const q = new URLSearchParams({ singleEvents: 'true', maxResults: '250', showDeleted: 'true' })
    if (syncToken) q.set('syncToken', syncToken)
    else {
      q.set('timeMin', new Date(addDays(toISODate(), -PAST_DAYS) + 'T00:00:00').toISOString())
      q.set('timeMax', new Date(addDays(toISODate(), 365) + 'T00:00:00').toISOString())
    }
    if (pageToken) q.set('pageToken', pageToken)

    let page: { items?: GEvent[]; nextPageToken?: string; nextSyncToken?: string } | null
    try {
      page = await call(api, 'GET', `/events?${q}`)
    } catch (e) {
      // 410: o ponto de sincronização venceu → recomeça com a leitura completa.
      if (e instanceof GoogleError && e.status === 410 && syncToken) {
        syncToken = undefined
        pageToken = undefined
        items.length = 0
        continue
      }
      throw e
    }
    items.push(...(page?.items ?? []))
    pageToken = page?.nextPageToken
    if (!pageToken) {
      nextSyncToken = page?.nextSyncToken
      break
    }
  }

  for (const ev of items) await applyRemote(ev)
  saveState({ ...state, syncToken: nextSyncToken })
  return items.length
}

async function applyRemote(ev: GEvent) {
  const local = await db.bullets.where('gcalId').equals(ev.id).first()
  const remoteTime = ev.updated ? Date.parse(ev.updated) : Date.now()
  // Mudou aqui depois de mudar lá: a versão daqui ganha (vai no envio).
  const localWins = local?.gcalDirty && (local.updatedAt ?? 0) > remoteTime

  if (ev.status === 'cancelled') {
    if (local && !localWins) {
      await db.bullets.delete(local.id)
      unqueueDelete(ev.id) // já foi excluído lá
    }
    return
  }
  if (localWins) return

  const fields = fromGoogle(ev)
  if (local) {
    await db.bullets.update(local.id, { ...fields, updatedAt: remoteTime, gcalDirty: false, gcalSync: uid() })
  } else {
    await db.bullets.add({
      id: uid(),
      type: 'event',
      status: 'open',
      createdAt: Date.now(),
      ...fields,
      gcalId: ev.id,
      updatedAt: remoteTime,
      gcalDirty: false,
    })
  }
}

// ---------- 2. enviar ao Google ----------

const gone = (e: unknown) => e instanceof GoogleError && (e.status === 404 || e.status === 410)

async function push(api: GcalApi): Promise<number> {
  let sent = 0
  for (const id of pendingDeletes()) {
    try {
      await call(api, 'DELETE', `/events/${encodeURIComponent(id)}`)
    } catch (e) {
      if (!gone(e)) throw e
    }
    unqueueDelete(id)
    sent++
  }

  const oldest = addDays(toISODate(), -PAST_DAYS)
  const dirty = await db.bullets.filter((b) => !!b.gcalDirty).toArray()
  for (const b of dirty) {
    let gcalId = b.gcalId
    if (b.type !== 'event') {
      // Deixou de ser evento: sai da agenda.
      if (gcalId) {
        try {
          await call(api, 'DELETE', `/events/${encodeURIComponent(gcalId)}`)
        } catch (e) {
          if (!gone(e)) throw e
        }
        gcalId = undefined
        sent++
      }
    } else if (gcalId || b.date >= oldest) {
      const body = toGoogle(b)
      let res: GEvent | null = null
      if (gcalId) {
        try {
          res = await call<GEvent>(api, 'PATCH', `/events/${encodeURIComponent(gcalId)}`, body)
        } catch (e) {
          if (!gone(e)) throw e // excluído lá enquanto mudava aqui: cria de novo
        }
      }
      // Ao criar, os null (que servem para apagar campos ao editar) ficam de fora.
      res ??= await call<GEvent>(api, 'POST', '/events', JSON.parse(JSON.stringify(body, (_k, v: unknown) => v ?? undefined)))
      gcalId = res?.id ?? gcalId
      sent++
    }
    // Só limpa a marca se ninguém mexeu no bullet durante o envio.
    await db.transaction('rw', db.bullets, async () => {
      const cur = await db.bullets.get(b.id)
      if (!cur) return
      const unchanged = cur.updatedAt === b.updatedAt
      await db.bullets.update(b.id, { gcalId, gcalDirty: !unchanged, gcalSync: uid() })
    })
  }
  return sent
}

// ---------- rodada completa ----------

let running: Promise<SyncResult> | null = null

export interface SyncResult {
  received: number
  sent: number
}

/** Uma rodada de sincronização (se já houver uma rodando, espera por ela). */
export function syncOnce(api: GcalApi): Promise<SyncResult> {
  running ??= (async () => {
    try {
      const received = await pull(api)
      const sent = await push(api)
      return { received, sent }
    } finally {
      running = null
    }
  })()
  return running
}

/**
 * Logo depois de conectar: os eventos que já existiam no app (dos últimos
 * 30 dias em diante) também vão para o Google.
 */
export async function markExistingEvents() {
  const oldest = addDays(toISODate(), -PAST_DAYS)
  await db.bullets
    .where('date')
    .aboveOrEqual(oldest)
    .filter((b) => b.type === 'event' && !b.gcalId)
    .modify({ gcalDirty: true, gcalSync: uid() })
}

// Em desenvolvimento: para testar pelo console / por script.
if (import.meta.env.DEV) {
  ;(globalThis as Record<string, unknown>).gcal = { syncOnce, resetSyncState, markExistingEvents, fromGoogle, toGoogle, pendingDeletes }
}
