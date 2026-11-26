import { db, TABLES } from '../db/db'
import { withoutTracking } from '../google/track'
import { resetSyncState } from '../google/sync'
import { withoutCloudTracking } from '../cloud/track'
import { markAllLocalForCloud, resetCloudSyncState } from '../cloud/sync'

/** Exporta todo o banco local como JSON (backup / migração para nuvem). */
export async function exportData(): Promise<Blob> {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) data[t] = await db.table(t).toArray()
  const payload = { app: 'bullet-point', version: 1, exportedAt: new Date().toISOString(), data }
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

/** Importa um backup, substituindo os dados atuais. */
export async function importData(file: File): Promise<void> {
  const parsed = JSON.parse(await file.text())
  if (parsed?.app !== 'bullet-point' || typeof parsed.data !== 'object') {
    throw new Error('Arquivo não é um backup do Bullet Point.')
  }
  // Sem marcar exclusões para o Google nem para o Supabase ao limpar as tabelas.
  await withoutCloudTracking(() =>
    withoutTracking(() =>
      db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
        for (const t of TABLES) {
          await db.table(t).clear()
          const rows = parsed.data[t]
          if (Array.isArray(rows)) await db.table(t).bulkAdd(rows)
        }
      }),
    ),
  )
  // Os dados mudaram por inteiro: a próxima sincronização relê a agenda toda e envia o backup à nuvem.
  resetSyncState()
  resetCloudSyncState()
  await markAllLocalForCloud()
}
