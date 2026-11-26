import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Bullet, type BulletStatus, type BulletType } from '../db/db'
import { addDays, dateLong, toISODate, uid } from '../lib/date'
import { migrateBullet } from '../lib/actions'
import { TopicSelect, TopicTag, useTopics } from '../components/topics'
import { inTopic, useTopicFilter } from '../topics/context'
import type { WindowProps } from './types'

/** Símbolos clássicos do bullet journal */
function symbol(b: Bullet) {
  if (b.type === 'event') return '○'
  if (b.type === 'note') return '–'
  switch (b.status) {
    case 'done':
      return '×'
    case 'migrated':
      return '>'
    case 'cancelled':
      return '•'
    default:
      return '•'
  }
}

const NEXT_STATUS: Record<BulletStatus, BulletStatus> = {
  open: 'done',
  done: 'cancelled',
  cancelled: 'open',
  migrated: 'migrated',
}

export default function JournalWindow({ win, setConfig }: WindowProps) {
  const today = toISODate()
  const date = (win.config?.date as string) ?? today
  const setDate = (d: string) => setConfig({ date: d === today ? undefined : d })
  const { byId } = useTopics()

  const [text, setText] = useState('')
  const [type, setType] = useState<BulletType>('task')
  const filter = useTopicFilter().topicId
  // undefined = acompanha o filtro global
  const [topicId, setTopicId] = useState<string>()
  const newTopicId = topicId ?? filter

  const bullets = useLiveQuery(
    async () => (await db.bullets.where('date').equals(date).sortBy('createdAt')).filter((b) => inTopic(b.topicId, filter)),
    [date, filter],
  )
  const overdue = useLiveQuery(
    async () =>
      (await db.bullets.where('date').below(date).toArray()).filter(
        (b) => b.type === 'task' && b.status === 'open' && inTopic(b.topicId, filter),
      ),
    [date, filter],
  )

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await db.bullets.add({
      id: uid(),
      date,
      type,
      status: 'open',
      text: text.trim(),
      topicId: newTopicId || undefined,
      createdAt: Date.now(),
    })
    setText('')
  }

  async function bringOverdue() {
    for (const b of overdue ?? []) await migrateBullet(b, date)
  }

  return (
    <div className="stack">
      <div className="row between">
        <button className="ghost" onClick={() => setDate(addDays(date, -1))}>
          ‹
        </button>
        <button className="ghost cap" onClick={() => setDate(today)} title="Ir para hoje">
          {dateLong(date)}
        </button>
        <button className="ghost" onClick={() => setDate(addDays(date, 1))}>
          ›
        </button>
      </div>

      {overdue && overdue.length > 0 && (
        <div className="banner">
          {overdue.length} tarefa(s) aberta(s) de dias anteriores.
          <button onClick={bringOverdue}>Migrar para este dia</button>
        </div>
      )}

      <ul className="bullets">
        {bullets?.map((b) => (
          <li key={b.id} className={`bullet ${b.status}`}>
            <button
              className="sym"
              title={b.type === 'task' ? 'Clique: concluir / cancelar / reabrir' : undefined}
              disabled={b.type !== 'task' || b.status === 'migrated'}
              onClick={() => db.bullets.update(b.id, { status: NEXT_STATUS[b.status] })}
            >
              {symbol(b)}
            </button>
            <span className="text">{b.text}</span>
            <TopicTag topic={b.topicId ? byId.get(b.topicId) : undefined} />
            <span className="actions">
              {b.type === 'task' && b.status === 'open' && (
                <button className="icon-btn ghost" title="Migrar para amanhã" onClick={() => migrateBullet(b, addDays(date, 1))}>
                  &gt;
                </button>
              )}
              <button className="icon-btn ghost" title="Excluir" onClick={() => db.bullets.delete(b.id)}>
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
      {bullets?.length === 0 && (
        <p className="muted">
          {filter ? 'Nada deste tópico neste dia.' : 'Página em branco. Registre tarefas (•), eventos (○) e notas (–).'}
        </p>
      )}

      <form className="row" onSubmit={add}>
        <select value={type} onChange={(e) => setType(e.target.value as BulletType)} title="Tipo">
          <option value="task">• Tarefa</option>
          <option value="event">○ Evento</option>
          <option value="note">– Nota</option>
        </select>
        <input placeholder="Escreva e tecle Enter" value={text} onChange={(e) => setText(e.target.value)} />
        <TopicSelect value={newTopicId} onChange={setTopicId} />
      </form>
    </div>
  )
}
