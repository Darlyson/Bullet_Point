import { db, type Bullet } from '../db/db'
import { addDays, toISODate, uid } from './date'

export async function toggleHabit(habitId: string, date: string) {
  const existing = await db.habitLogs.where('[habitId+date]').equals([habitId, date]).first()
  if (existing) await db.habitLogs.delete(existing.id)
  else await db.habitLogs.add({ id: uid(), habitId, date })
}

/** Sequência de dias seguidos concluídos (conta a partir de hoje ou de ontem). */
export function streak(doneDates: Set<string>, today = toISODate()): number {
  let d = doneDates.has(today) ? today : addDays(today, -1)
  let n = 0
  while (doneDates.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

/** Migra uma tarefa: marca como migrada (>) e cria uma cópia aberta no dia destino. */
export async function migrateBullet(b: Bullet, toDate: string) {
  await db.transaction('rw', db.bullets, async () => {
    await db.bullets.update(b.id, { status: 'migrated' })
    // A cópia é um item novo: não leva o vínculo com o Google Agenda.
    const { gcalId: _id, gcalDirty: _dirty, ...rest } = b
    await db.bullets.add({ ...rest, id: uid(), date: toDate, status: 'open', createdAt: Date.now() })
  })
}
