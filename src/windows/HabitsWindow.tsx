import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { lastNDays, toISODate, uid, weekdayShort } from '../lib/date'
import { streak, toggleHabit } from '../lib/actions'
import { TOPIC_COLORS } from '../lib/palette'
import { TopicSelect, TopicTag, useTopics } from '../components/topics'
import { inTopic, useTopicFilter } from '../topics/context'
import type { WindowProps } from './types'

export default function HabitsWindow({ win, setConfig }: WindowProps) {
  const global = useTopicFilter().topicId
  // O filtro global (barra de cima) tem prioridade sobre o filtro desta janela.
  const filter = global || ((win.config?.topicId as string) ?? '')
  const { byId } = useTopics()
  const days = lastNDays(7)
  const today = toISODate()

  const [name, setName] = useState('')
  // undefined = acompanha o filtro global
  const [topicId, setTopicId] = useState<string>()
  const newTopicId = topicId ?? global
  const [target, setTarget] = useState(7)

  const data = useLiveQuery(async () => {
    const habits = (await db.habits.toArray()).filter((h) => !h.archived)
    const logs = await db.habitLogs.where('date').aboveOrEqual(toISODateMinus(120)).toArray()
    const byHabit = new Map<string, Set<string>>()
    for (const l of logs) {
      if (!byHabit.has(l.habitId)) byHabit.set(l.habitId, new Set())
      byHabit.get(l.habitId)!.add(l.date)
    }
    return { habits: habits.sort((a, b) => a.createdAt - b.createdAt), byHabit }
  }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const topic = newTopicId ? byId.get(newTopicId) : undefined
    const count = await db.habits.count()
    await db.habits.add({
      id: uid(),
      name: name.trim(),
      topicId: newTopicId || undefined,
      color: topic?.color ?? TOPIC_COLORS[count % TOPIC_COLORS.length],
      targetPerWeek: target,
      archived: false,
      createdAt: Date.now(),
    })
    setName('')
  }

  if (!data) return null
  const habits = data.habits.filter((h) => inTopic(h.topicId, filter))

  return (
    <div className="stack">
      <div className="row">
        <TopicSelect
          allowAll
          value={filter}
          disabled={!!global}
          title={global ? 'Filtro global ativo (barra de cima)' : 'Filtrar esta janela'}
          onChange={(v) => setConfig({ topicId: v })}
        />
      </div>

      <table className="habit-grid">
        <thead>
          <tr>
            <th />
            {days.map((d) => (
              <th key={d} className={d === today ? 'today' : ''}>
                {weekdayShort(d)}
              </th>
            ))}
            <th title="Dias seguidos">🔥</th>
            <th title="Esta semana / meta">sem.</th>
          </tr>
        </thead>
        <tbody>
          {habits.map((h) => {
            const done = data.byHabit.get(h.id) ?? new Set<string>()
            const week = days.filter((d) => done.has(d)).length
            return (
              <tr key={h.id}>
                <td className="habit-name">
                  <span className="dot" style={{ background: h.color }} />
                  <span>{h.name}</span>
                  <TopicTag topic={h.topicId ? byId.get(h.topicId) : undefined} />
                  <button
                    className="icon-btn ghost"
                    title="Arquivar hábito"
                    onClick={() => db.habits.update(h.id, { archived: true })}
                  >
                    ✕
                  </button>
                </td>
                {days.map((d) => (
                  <td key={d}>
                    <button
                      className={`cell ${done.has(d) ? 'on' : ''}`}
                      style={done.has(d) ? { background: h.color } : undefined}
                      onClick={() => toggleHabit(h.id, d)}
                      aria-label={`${h.name} em ${d}`}
                    />
                  </td>
                ))}
                <td className="num">{streak(done, today)}</td>
                <td className={`num ${week >= h.targetPerWeek ? 'good' : ''}`}>
                  {week}/{h.targetPerWeek}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {habits.length === 0 && (
        <p className="muted">{filter ? 'Nenhum hábito neste tópico.' : 'Nenhum hábito ainda. Crie o primeiro abaixo.'}</p>
      )}

      <form className="row" onSubmit={add}>
        <input placeholder="Novo hábito (ex.: Ler 20 páginas)" value={name} onChange={(e) => setName(e.target.value)} />
        <TopicSelect value={newTopicId} onChange={setTopicId} />
        <select value={target} onChange={(e) => setTarget(Number(e.target.value))} title="Meta por semana">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {n}x/sem
            </option>
          ))}
        </select>
        <button type="submit">Adicionar</button>
      </form>
    </div>
  )
}

function toISODateMinus(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISODate(d)
}
