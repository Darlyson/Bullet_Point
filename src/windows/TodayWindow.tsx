import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { dateLong, formatMinutes, toISODate } from '../lib/date'
import { toggleHabit } from '../lib/actions'
import { useFocus } from '../focus/FocusContext'
import { inTopic, useTopicFilter } from '../topics/context'

export default function TodayWindow() {
  const today = toISODate()
  const { elapsed, state } = useFocus()
  const filter = useTopicFilter().topicId

  const data = useLiveQuery(async () => {
    const [habits, logs, bullets, sessions] = await Promise.all([
      db.habits.toArray(),
      db.habitLogs.where('date').equals(today).toArray(),
      db.bullets.where('date').equals(today).toArray(),
      db.focusSessions.where('date').equals(today).toArray(),
    ])
    return {
      habits: habits.filter((h) => !h.archived && inTopic(h.topicId, filter)),
      done: new Set(logs.map((l) => l.habitId)),
      tasks: bullets.filter((b) => b.type === 'task' && inTopic(b.topicId, filter)),
      focusSec: sessions.filter((s) => inTopic(s.topicId, filter)).reduce((a, s) => a + s.durationSec, 0),
    }
  }, [today, filter])

  if (!data) return null
  const live = state.status !== 'idle' && inTopic(state.topicId || undefined, filter) ? elapsed : 0
  const habitsDone = data.habits.filter((h) => data.done.has(h.id)).length
  const tasksDone = data.tasks.filter((t) => t.status === 'done').length
  const openTasks = data.tasks.filter((t) => t.status === 'open')

  return (
    <div className="stack">
      <div className="muted cap">{dateLong(today)}</div>
      <div className="tiles">
        <div className="tile">
          <div className="tile-value">{formatMinutes(data.focusSec + live)}</div>
          <div className="tile-label">foco hoje</div>
        </div>
        <div className="tile">
          <div className="tile-value">
            {habitsDone}/{data.habits.length}
          </div>
          <div className="tile-label">hábitos</div>
        </div>
        <div className="tile">
          <div className="tile-value">
            {tasksDone}/{data.tasks.length}
          </div>
          <div className="tile-label">tarefas</div>
        </div>
      </div>

      {data.habits.length > 0 && (
        <section>
          <h4>Hábitos de hoje</h4>
          {data.habits.map((h) => (
            <label key={h.id} className="check-row">
              <input type="checkbox" checked={data.done.has(h.id)} onChange={() => toggleHabit(h.id, today)} />
              <span className="dot" style={{ background: h.color }} />
              {h.name}
            </label>
          ))}
        </section>
      )}

      {openTasks.length > 0 && (
        <section>
          <h4>Tarefas abertas</h4>
          <ul className="plain">
            {openTasks.map((t) => (
              <li key={t.id}>• {t.text}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
