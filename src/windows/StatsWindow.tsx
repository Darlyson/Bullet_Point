import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '../db/db'
import { addDays, dateShort, formatMinutes, lastNDays } from '../lib/date'
import { CHART, NEUTRAL } from '../lib/palette'
import { inTopic, useTopicFilter } from '../topics/context'
import type { WindowProps } from './types'

const RANGES = [7, 30, 90]

interface Insight {
  kind: 'good' | 'warn' | 'info'
  text: string
}

export default function StatsWindow({ win, setConfig }: WindowProps) {
  const range = (win.config?.range as number) ?? 30
  const filter = useTopicFilter().topicId

  const data = useLiveQuery(async () => {
    const days = lastNDays(range)
    const from = days[0]
    const prevFrom = addDays(from, -range)
    const [topics, allHabits, allLogs, allBullets, allSessions] = await Promise.all([
      db.topics.toArray(),
      db.habits.toArray(),
      db.habitLogs.where('date').aboveOrEqual(from).toArray(),
      db.bullets.where('date').aboveOrEqual(from).toArray(),
      db.focusSessions.where('date').aboveOrEqual(prevFrom).toArray(),
    ])
    // Filtro global por tópico: tudo abaixo considera só o tópico escolhido.
    const habits = allHabits.filter((h) => inTopic(h.topicId, filter))
    const habitIds = new Set(habits.map((h) => h.id))
    const logs = allLogs.filter((l) => habitIds.has(l.habitId))
    const bullets = allBullets.filter((b) => inTopic(b.topicId, filter))
    const sessions = allSessions.filter((s) => inTopic(s.topicId, filter))

    const cur = sessions.filter((s) => s.date >= from)
    const prev = sessions.filter((s) => s.date < from)
    const focusTotal = cur.reduce((a, s) => a + s.durationSec, 0)
    const focusPrev = prev.reduce((a, s) => a + s.durationSec, 0)

    const perDay = days.map((d) => ({
      date: d,
      label: dateShort(d),
      min: Math.round(cur.filter((s) => s.date === d).reduce((a, s) => a + s.durationSec, 0) / 60),
    }))

    const topicRows = [...topics, { id: '', name: 'Sem tópico', color: NEUTRAL, createdAt: 0 }]
      .map((t) => ({
        ...t,
        sec: cur.filter((s) => (s.topicId ?? '') === t.id).reduce((a, s) => a + s.durationSec, 0),
      }))
      .filter((t) => t.sec > 0)
      .sort((a, b) => b.sec - a.sec)

    const activeHabits = habits.filter((h) => !h.archived)
    const habitRows = activeHabits
      .map((h) => {
        // Só conta os dias desde que o hábito foi criado.
        const created = new Date(h.createdAt)
        const createdIso = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`
        const activeDays = days.filter((d) => d >= createdIso).length
        const done = logs.filter((l) => l.habitId === h.id).length
        const expected = Math.max(1, Math.round((h.targetPerWeek * activeDays) / 7))
        return { ...h, done, expected, pct: Math.min(1, done / expected) }
      })
      .sort((a, b) => b.pct - a.pct)

    const tasks = bullets.filter((b) => b.type === 'task')
    const t = {
      done: tasks.filter((b) => b.status === 'done').length,
      open: tasks.filter((b) => b.status === 'open').length,
      migrated: tasks.filter((b) => b.status === 'migrated').length,
      cancelled: tasks.filter((b) => b.status === 'cancelled').length,
    }

    // Análises automáticas: o que está bom e o que pode melhorar.
    const insights: Insight[] = []
    if (focusPrev > 0) {
      const delta = (focusTotal - focusPrev) / focusPrev
      insights.push({
        kind: delta >= 0 ? 'good' : 'warn',
        text: `Foco ${delta >= 0 ? 'subiu' : 'caiu'} ${Math.abs(Math.round(delta * 100))}% em relação aos ${range} dias anteriores.`,
      })
    }
    const activeFocusDays = perDay.filter((d) => d.min > 0).length
    if (focusTotal > 0) {
      insights.push({ kind: 'info', text: `Você focou em ${activeFocusDays} de ${range} dias (média de ${formatMinutes(focusTotal / Math.max(1, activeFocusDays))} por dia ativo).` })
    }
    const best = habitRows[0]
    const worst = habitRows[habitRows.length - 1]
    if (best && best.pct >= 0.8) insights.push({ kind: 'good', text: `"${best.name}" está consistente (${Math.round(best.pct * 100)}% da meta).` })
    if (worst && worst !== best && worst.pct < 0.5)
      insights.push({ kind: 'warn', text: `"${worst.name}" está abaixo da meta (${Math.round(worst.pct * 100)}%). Talvez reduzir a meta ou ligar a um horário fixo.` })
    const closed = t.done + t.cancelled + t.migrated
    if (closed > 0 && t.migrated / Math.max(1, tasks.length) > 0.3)
      insights.push({ kind: 'warn', text: `${t.migrated} tarefas foram migradas: muitas tarefas adiadas. Tente planejar menos por dia.` })
    if (tasks.length > 0 && t.done / tasks.length >= 0.7)
      insights.push({ kind: 'good', text: `Ótima taxa de conclusão de tarefas: ${Math.round((t.done / tasks.length) * 100)}%.` })
    const topTopic = topicRows[0]
    if (topTopic && focusTotal > 0)
      insights.push({ kind: 'info', text: `Maior parte do foco em "${topTopic.name}" (${Math.round((topTopic.sec / focusTotal) * 100)}%).` })

    return { perDay, focusTotal, focusPrev, topicRows, habitRows, tasks: t, taskTotal: tasks.length, insights }
  }, [range, filter])

  if (!data) return null
  const maxTopic = data.topicRows[0]?.sec ?? 1
  const delta = data.focusPrev > 0 ? (data.focusTotal - data.focusPrev) / data.focusPrev : null

  return (
    <div className="stack stats">
      <div className="row">
        {RANGES.map((r) => (
          <button key={r} className={r === range ? 'chip active' : 'chip'} onClick={() => setConfig({ range: r })}>
            {r} dias
          </button>
        ))}
      </div>

      <div className="tiles">
        <div className="tile">
          <div className="tile-value">{formatMinutes(data.focusTotal)}</div>
          <div className="tile-label">
            foco total
            {delta !== null && (
              <span className={delta >= 0 ? 'delta up' : 'delta down'}>
                {' '}
                {delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(delta * 100))}%
              </span>
            )}
          </div>
        </div>
        <div className="tile">
          <div className="tile-value">
            {data.tasks.done}/{data.taskTotal}
          </div>
          <div className="tile-label">tarefas concluídas</div>
        </div>
        <div className="tile">
          <div className="tile-value">{data.tasks.migrated}</div>
          <div className="tile-label">migradas (adiadas)</div>
        </div>
      </div>

      <section>
        <h4>Minutos de foco por dia</h4>
        <div className="chart">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.perDay} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis
                dataKey="label"
                tick={{ fill: CHART.muted, fontSize: 11 }}
                axisLine={{ stroke: CHART.baseline }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis tick={{ fill: CHART.muted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ background: '#242423', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                labelStyle={{ color: CHART.textSecondary }}
                itemStyle={{ color: CHART.text }}
                formatter={(v) => [`${v} min`, 'Foco']}
              />
              <Bar dataKey="min" fill={CHART.series} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {data.topicRows.length > 0 && !filter && (
        <section>
          <h4>Foco por tópico</h4>
          {data.topicRows.map((t) => (
            <div key={t.id} className="meter-row" title={`${t.name}: ${formatMinutes(t.sec)}`}>
              <span className="meter-label">
                <span className="dot" style={{ background: t.color }} />
                {t.name}
              </span>
              <span className="meter">
                <span style={{ width: `${(t.sec / maxTopic) * 100}%`, background: t.color }} />
              </span>
              <span className="num">{formatMinutes(t.sec)}</span>
            </div>
          ))}
        </section>
      )}

      {data.habitRows.length > 0 && (
        <section>
          <h4>Hábitos: % da meta</h4>
          {data.habitRows.map((h) => (
            <div key={h.id} className="meter-row" title={`${h.done} de ${h.expected} esperados`}>
              <span className="meter-label">
                <span className="dot" style={{ background: h.color }} />
                {h.name}
              </span>
              <span className="meter">
                <span style={{ width: `${h.pct * 100}%`, background: CHART.series }} />
              </span>
              <span className="num">
                {h.pct >= 0.8 ? '✓ ' : h.pct < 0.5 ? '⚠ ' : ''}
                {Math.round(h.pct * 100)}%
              </span>
            </div>
          ))}
        </section>
      )}

      <section>
        <h4>O que está bom · o que melhorar</h4>
        {data.insights.length === 0 ? (
          <p className="muted">Registre foco, hábitos e tarefas por alguns dias para ver análises aqui.</p>
        ) : (
          <ul className="plain insights">
            {data.insights.map((i, n) => (
              <li key={n} className={i.kind}>
                <span className="ins-icon">{i.kind === 'good' ? '✓' : i.kind === 'warn' ? '⚠' : 'ℹ'}</span>
                {i.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
