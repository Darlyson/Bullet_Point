import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { formatDuration, formatMinutes, toISODate } from '../lib/date'
import { useFocus } from '../focus/FocusContext'
import { TopicSelect, TopicTag, useTopics } from '../components/topics'
import { inTopic, useTopicFilter } from '../topics/context'

export default function FocusWindow() {
  const { state, elapsed, remaining, update, start, pause, finish, discard } = useFocus()
  const { byId } = useTopics()
  const today = toISODate()
  const filter = useTopicFilter().topicId
  const sessions = useLiveQuery(
    async () =>
      (await db.focusSessions.where('date').equals(today).reverse().sortBy('startedAt')).filter((s) => inTopic(s.topicId, filter)),
    [today, filter],
  )
  const idle = state.status === 'idle'

  // Ligou o filtro global com o cronômetro parado: a próxima sessão já vem nesse tópico.
  useEffect(() => {
    if (filter && state.status === 'idle') update({ topicId: filter })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o filtro muda
  }, [filter])

  function onStart() {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
    start()
  }

  const display = remaining !== null ? remaining : elapsed
  const progress = remaining !== null ? 1 - remaining / (state.pomodoroMin * 60) : null

  return (
    <div className="stack">
      <div className="row">
        <TopicSelect value={state.topicId} onChange={(v) => update({ topicId: v })} />
        <input placeholder="No que você vai focar?" value={state.label} onChange={(e) => update({ label: e.target.value })} />
      </div>

      <div className="row">
        <select
          value={state.mode}
          disabled={!idle}
          onChange={(e) => update({ mode: e.target.value as 'stopwatch' | 'pomodoro' })}
        >
          <option value="stopwatch">⏱ Cronômetro</option>
          <option value="pomodoro">🍅 Pomodoro</option>
        </select>
        {state.mode === 'pomodoro' && (
          <label className="row tight">
            <input
              type="number"
              min={1}
              max={180}
              disabled={!idle}
              value={state.pomodoroMin}
              onChange={(e) => update({ pomodoroMin: Math.max(1, Number(e.target.value) || 25) })}
              style={{ width: 64 }}
            />
            min
          </label>
        )}
      </div>

      <div className={`timer ${state.status}`}>{formatDuration(display)}</div>
      {progress !== null && (
        <div className="progress">
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      <div className="row center">
        {state.status !== 'running' ? (
          <button className="primary" onClick={onStart}>
            {idle ? '▶ Iniciar' : '▶ Continuar'}
          </button>
        ) : (
          <button onClick={pause}>⏸ Pausar</button>
        )}
        {!idle && (
          <>
            <button onClick={() => void finish()}>■ Finalizar e salvar</button>
            <button className="ghost" onClick={discard} title="Descartar sem salvar">
              Descartar
            </button>
          </>
        )}
      </div>

      <section>
        <h4>Sessões de hoje</h4>
        <ul className="plain sessions">
          {sessions?.map((s) => (
            <li key={s.id}>
              <span className="num">{formatMinutes(s.durationSec)}</span>
              <span className="text">{s.label || 'Sem descrição'}</span>
              <TopicTag topic={s.topicId ? byId.get(s.topicId) : undefined} />
              <button className="icon-btn ghost" title="Excluir sessão" onClick={() => db.focusSessions.delete(s.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        {sessions?.length === 0 && (
          <p className="muted">{filter ? 'Nenhuma sessão deste tópico hoje.' : 'Nenhuma sessão ainda hoje.'}</p>
        )}
      </section>
    </div>
  )
}
