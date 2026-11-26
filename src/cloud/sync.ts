import { db, TABLES, type Bullet, type HabitLog, type TableName } from '../db/db'
import { queueDelete, triggerGoogleSync, withoutTracking } from '../google/track'
import {
  clearDeleteIfUnchanged,
  clearDirtyIfUnchanged,
  getDeletesMap,
  getDirtyMap,
  getRecordTime,
  isRecordDirty,
  markDirty,
  nextClock,
  observeClock,
  setRecordSynced,
  withoutCloudTracking,
} from './track'

/**
 * Sincronização em mão dupla com o Supabase entre PC e celular.
 *
 * Todos os registros das 7 tabelas locais ficam na tabela `bp_records` do
 * Supabase (`user_id`, `table_name`, `id`, `data`, `deleted`, `updated_at`,
 * `synced_at`), protegidos por Row Level Security (`auth.uid() = user_id`).
 *
 * Cada rodada:
 * 1. Traz do Supabase apenas o que mudou desde o último `synced_at` (gerado
 *    pelo relógio do servidor Postgres).
 * 2. Envia exclusões e criações/edições locais pendentes em lotes.
 *
 * Conflito no mesmo item (`table_name` + `id`): vence a alteração com maior
 * `updated_at`.
 */

const STATE_KEY = 'bp-cloud-state'
const PAGE_SIZE = 500
const PUSH_BATCH_SIZE = 200

export interface CloudApi {
  url: string
  anonKey: string
  userId: string
  /** Access token válido; `force` renova a sessão com o refresh_token. */
  token: (force: boolean) => Promise<string>
  fetch: typeof fetch
}

interface SyncState {
  cursor?: string
}

export interface CloudRow {
  user_id?: string
  table_name: string
  id: string
  data: Record<string, unknown> | null
  deleted: boolean
  updated_at: number
  synced_at?: string
}

export class CloudError extends Error {
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

/** Esquece o cursor para reler todos os registros da nuvem na próxima rodada. */
export function resetCloudSyncState() {
  localStorage.removeItem(STATE_KEY)
}

const TABLE_SET = new Set<string>(TABLES)
const isTableName = (t: string): t is TableName => TABLE_SET.has(t)

async function call<T>(
  api: CloudApi,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T | null> {
  const base = api.url.replace(/\/+$/, '')
  const send = async (force: boolean) =>
    api.fetch(`${base}/rest/v1${path}`, {
      method,
      headers: {
        apikey: api.anonKey,
        Authorization: `Bearer ${await api.token(force)}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

  let res = await send(false)
  if (res.status === 401) res = await send(true)
  if (res.status === 204) return null

  if (!res.ok) {
    let msg = `Erro ${res.status}`
    let code = ''
    try {
      const err = (await res.json()) as { message?: string; error?: string; code?: string }
      msg = err.message || err.error || msg
      code = err.code ?? ''
    } catch {
      /* resposta sem JSON */
    }
    if (res.status === 404 || code === '42P01' || code === 'PGRST205' || msg.includes('bp_records')) {
      throw new CloudError(
        'A tabela bp_records ainda não existe no Supabase. Rode o comando SQL do passo 2 no SQL Editor do Supabase.',
        res.status,
      )
    }
    throw new CloudError(msg, res.status)
  }

  const text = await res.text()
  return text ? (JSON.parse(text) as T) : null
}

// ---------- 1. trazer do Supabase ----------

async function pull(api: CloudApi): Promise<{ received: number; pulledWorkspaces: Set<string> }> {
  const state = loadState()
  const rows: CloudRow[] = []
  let offset = 0

  for (;;) {
    const q = new URLSearchParams({
      select: 'table_name,id,data,deleted,updated_at,synced_at',
      order: 'synced_at.asc,table_name.asc,id.asc',
      limit: String(PAGE_SIZE),
      offset: String(offset),
    })
    if (state.cursor) q.set('synced_at', `gt.${state.cursor}`)

    const page = (await call<CloudRow[]>(api, 'GET', `/bp_records?${q}`)) ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  const pulledWorkspaces = new Set<string>()
  let needsGoogleSync = false

  if (rows.length > 0) {
    await withoutCloudTracking(() =>
      withoutTracking(async () => {
        for (const row of rows) {
          if (!isTableName(row.table_name)) continue
          const table = row.table_name
          const remoteTime = Number(row.updated_at) || 0
          observeClock(remoteTime)

          if (table === 'workspaces' && !row.deleted) pulledWorkspaces.add(row.id)

          const localDirty = isRecordDirty(table, row.id)
          const localTime = getRecordTime(table, row.id)
          if (localDirty && localTime > remoteTime) {
            // Alteração local é mais recente: vence e vai no próximo push.
            continue
          }

          if (!localDirty && localTime === remoteTime && !row.deleted) {
            // Já temos exatamente esta versão (ex.: recém-enviada por este aparelho).
            setRecordSynced(table, row.id, remoteTime)
            continue
          }

          if (row.deleted) {
            if (table === 'bullets') {
              const existing = (await db.bullets.get(row.id)) as Bullet | undefined
              if (existing?.gcalId) {
                queueDelete(existing.gcalId)
                needsGoogleSync = true
              }
            }
            await db.table(table).delete(row.id)
            setRecordSynced(table, row.id, remoteTime)
          } else if (row.data && typeof row.data === 'object') {
            const record = { ...row.data, id: row.id }
            if (table === 'habitLogs') {
              const hl = record as unknown as HabitLog
              if (hl.habitId && hl.date) {
                const dupes = await db.habitLogs.where('[habitId+date]').equals([hl.habitId, hl.date]).toArray()
                for (const d of dupes) {
                  if (d.id !== hl.id) await db.habitLogs.delete(d.id)
                }
              }
            }
            await db.table(table).put(record)
            if (table === 'bullets' && (record as unknown as Bullet).gcalDirty) {
              needsGoogleSync = true
            }
            setRecordSynced(table, row.id, remoteTime)
          }
        }
      }),
    )

    const lastSyncedAt = rows[rows.length - 1]?.synced_at
    if (lastSyncedAt) saveState({ ...state, cursor: lastSyncedAt })
  }

  if (needsGoogleSync) triggerGoogleSync()
  return { received: rows.length, pulledWorkspaces }
}

// ---------- 2. enviar ao Supabase ----------

function cleanRecord(table: TableName, item: Record<string, unknown>): Record<string, unknown> {
  if (table !== 'bullets') return item
  const { gcalSync: _sync, ...rest } = item
  return rest
}

function splitKey(key: string): [TableName, string] | null {
  const idx = key.indexOf(':')
  if (idx <= 0) return null
  const table = key.slice(0, idx)
  const id = key.slice(idx + 1)
  return isTableName(table) && id ? [table, id] : null
}

async function push(api: CloudApi): Promise<number> {
  const deletesSnap = { ...getDeletesMap() }
  const dirtySnap = { ...getDirtyMap() }

  const payload: { row: CloudRow; kind: 'delete' | 'upsert' }[] = []

  for (const [key, stamp] of Object.entries(deletesSnap)) {
    const parsed = splitKey(key)
    if (!parsed) continue
    const [table, id] = parsed
    payload.push({
      kind: 'delete',
      row: {
        user_id: api.userId,
        table_name: table,
        id,
        data: null,
        deleted: true,
        updated_at: stamp,
      },
    })
  }

  for (const [key, stamp] of Object.entries(dirtySnap)) {
    const parsed = splitKey(key)
    if (!parsed) continue
    const [table, id] = parsed
    const item = (await db.table(table).get(id)) as Record<string, unknown> | undefined
    if (!item) {
      clearDirtyIfUnchanged(table, id, stamp)
      continue
    }
    payload.push({
      kind: 'upsert',
      row: {
        user_id: api.userId,
        table_name: table,
        id,
        data: cleanRecord(table, item),
        deleted: false,
        updated_at: stamp,
      },
    })
  }

  let sent = 0
  for (let i = 0; i < payload.length; i += PUSH_BATCH_SIZE) {
    const batch = payload.slice(i, i + PUSH_BATCH_SIZE)
    await call(
      api,
      'POST',
      '/bp_records?on_conflict=user_id,table_name,id',
      batch.map((b) => b.row),
      { Prefer: 'resolution=merge-duplicates,return=minimal' },
    )
    for (const b of batch) {
      const table = b.row.table_name as TableName
      if (b.kind === 'delete') clearDeleteIfUnchanged(table, b.row.id, b.row.updated_at)
      else clearDirtyIfUnchanged(table, b.row.id, b.row.updated_at)
      sent++
    }
  }

  return sent
}

// ---------- rodada completa ----------

let running: Promise<CloudSyncResult> | null = null

export interface CloudSyncResult {
  received: number
  sent: number
}

/** Uma rodada de sincronização (se já houver uma rodando, aguarda). */
export function syncCloudOnce(api: CloudApi): Promise<CloudSyncResult> {
  running ??= (async () => {
    try {
      const { received } = await pull(api)
      const sent = await push(api)
      return { received, sent }
    } finally {
      running = null
    }
  })()
  return running
}

/**
 * Primeira sincronização ao conectar:
 * - Se este aparelho acabou de ser instalado (sem dados criados nem editados)
 *   e a nuvem já tem espaços de trabalho, substitui os espaços padrão vazios
 *   pelos que vieram da nuvem.
 * - Todos os registros locais que ainda não existem na nuvem são marcados
 *   para envio.
 */
export async function initialCloudSync(api: CloudApi): Promise<CloudSyncResult> {
  const CONTENT_TABLES: TableName[] = ['topics', 'habits', 'habitLogs', 'bullets', 'notes', 'focusSessions']
  const counts = await Promise.all(CONTENT_TABLES.map((t) => db.table(t).count()))
  const hasLocalContent = counts.some((c) => c > 0) || Object.keys(getDirtyMap()).length > 0
  const localWorkspacesBefore = await db.workspaces.toArray()

  resetCloudSyncState()
  const { received, pulledWorkspaces } = await pull(api)

  if (!hasLocalContent && pulledWorkspaces.size > 0) {
    await withoutCloudTracking(async () => {
      for (const ws of localWorkspacesBefore) {
        if (!pulledWorkspaces.has(ws.id)) await db.workspaces.delete(ws.id)
      }
    })
  }

  // Marca tudo o que existe localmente e ainda não veio da nuvem para subir no push.
  for (const table of TABLES) {
    const rows = (await db.table(table).toArray()) as { id: string; updatedAt?: number; createdAt?: number }[]
    for (const r of rows) {
      if (getRecordTime(table, r.id) === 0) {
        const stamp = r.updatedAt ?? r.createdAt ?? nextClock()
        observeClock(stamp)
        markDirty(table, r.id, stamp, false)
      }
    }
  }

  const sent = await push(api)
  return { received, sent }
}

/** Marca todos os registros locais atuais para envio (ex.: após importar backup). */
export async function markAllLocalForCloud() {
  for (const table of TABLES) {
    const rows = (await db.table(table).toArray()) as { id: string }[]
    for (const r of rows) {
      markDirty(table, r.id, nextClock(), false)
    }
  }
}

/** Script SQL que o usuário cola uma única vez no SQL Editor do Supabase. */
export const SUPABASE_SETUP_SQL = `-- Cria a tabela de sincronização do Bullet Point com segurança por usuário (RLS)
create table if not exists public.bp_records (
  user_id uuid not null default auth.uid(),
  table_name text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at bigint not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, table_name, id)
);

create index if not exists bp_records_sync_idx
  on public.bp_records (user_id, synced_at);

create or replace function public.bp_touch_synced_at()
returns trigger language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists bp_records_touch on public.bp_records;
create trigger bp_records_touch
  before insert or update on public.bp_records
  for each row execute function public.bp_touch_synced_at();

alter table public.bp_records enable row level security;

drop policy if exists "Usuario acessa apenas seus dados" on public.bp_records;
create policy "Usuario acessa apenas seus dados"
  on public.bp_records for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);`

if (import.meta.env.DEV) {
  ;(globalThis as Record<string, unknown>).cloud = {
    syncCloudOnce,
    initialCloudSync,
    resetCloudSyncState,
    markAllLocalForCloud,
  }
}
