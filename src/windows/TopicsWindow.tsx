import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { formatMinutes, lastNDays, uid } from '../lib/date'
import { TOPIC_COLORS } from '../lib/palette'
import { useTopicFilter } from '../topics/context'

/** Tópicos ligam tudo: aqui você vê o que está vinculado a cada um. */
export default function TopicsWindow() {
  const [name, setName] = useState('')
  const filter = useTopicFilter()

  const data = useLiveQuery(async () => {
    const since = lastNDays(30)[0]
    const [topics, habits, notes, bullets, sessions] = await Promise.all([
      db.topics.toArray(),
      db.habits.toArray(),
      db.notes.toArray(),
      db.bullets.toArray(),
      db.focusSessions.where('date').aboveOrEqual(since).toArray(),
    ])
    return topics
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((t) => ({
        topic: t,
        habits: habits.filter((h) => h.topicId === t.id && !h.archived).length,
        notes: notes.filter((n) => n.topicId === t.id).length,
        openTasks: bullets.filter((b) => b.topicId === t.id && b.type === 'task' && b.status === 'open').length,
        focusSec: sessions.filter((s) => s.topicId === t.id).reduce((a, s) => a + s.durationSec, 0),
      }))
  }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const count = await db.topics.count()
    await db.topics.add({ id: uid(), name: name.trim(), color: TOPIC_COLORS[count % TOPIC_COLORS.length], createdAt: Date.now() })
    setName('')
  }

  async function remove(id: string, topicName: string) {
    if (!confirm(`Excluir o tópico "${topicName}"? Os itens vinculados ficam, mas sem tópico.`)) return
    await db.transaction('rw', [db.topics, db.habits, db.notes, db.bullets, db.focusSessions], async () => {
      await db.topics.delete(id)
      for (const name of ['habits', 'notes', 'bullets', 'focusSessions']) {
        await db.table(name).where('topicId').equals(id).modify({ topicId: undefined })
      }
    })
  }

  return (
    <div className="stack">
      <form className="row" onSubmit={add}>
        <input placeholder="Novo tópico (ex.: Inglês, Trabalho, Saúde)" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit">Criar</button>
      </form>

      <ul className="plain topics">
        {data?.map(({ topic, habits, notes, openTasks, focusSec }) => (
          <li
            key={topic.id}
            className={`topic-card ${filter.topicId === topic.id ? 'active' : ''}`}
            style={filter.topicId === topic.id ? { borderColor: topic.color } : undefined}
          >
            <div className="row between">
              <strong className="row tight">
                <span className="dot lg" style={{ background: topic.color }} />
                <input
                  className="inline-input"
                  defaultValue={topic.name}
                  onBlur={(e) => e.target.value.trim() && db.topics.update(topic.id, { name: e.target.value.trim() })}
                />
              </strong>
              <span className="row tight">
                <select
                  value={topic.color}
                  onChange={(e) => db.topics.update(topic.id, { color: e.target.value })}
                  title="Cor"
                  style={{ color: topic.color }}
                >
                  {TOPIC_COLORS.map((c, i) => (
                    <option key={c} value={c} style={{ color: c }}>
                      ● cor {i + 1}
                    </option>
                  ))}
                </select>
                <button
                  className={filter.topicId === topic.id ? 'chip active' : 'chip'}
                  title={filter.topicId === topic.id ? 'Tirar o filtro' : 'Mostrar só este tópico em todas as janelas'}
                  onClick={() => filter.toggle(topic.id)}
                >
                  {filter.topicId === topic.id ? '✓ Filtrando' : 'Filtrar'}
                </button>
                <button className="icon-btn ghost" title="Excluir tópico" onClick={() => remove(topic.id, topic.name)}>
                  ✕
                </button>
              </span>
            </div>
            <div className="muted small">
              {formatMinutes(focusSec)} de foco (30d) · {habits} hábito(s) · {notes} nota(s) · {openTasks} tarefa(s) aberta(s)
            </div>
          </li>
        ))}
      </ul>
      {data?.length === 0 && (
        <p className="muted">Crie tópicos para conectar hábitos, notas, tarefas e sessões de foco.</p>
      )}
    </div>
  )
}
