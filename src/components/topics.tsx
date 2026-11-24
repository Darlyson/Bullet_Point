import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Topic } from '../db/db'

export function useTopics() {
  const topics = useLiveQuery(() => db.topics.orderBy('name').toArray(), []) ?? []
  const byId = new Map<string, Topic>(topics.map((t) => [t.id, t]))
  return { topics, byId }
}

export function TopicSelect({
  value,
  onChange,
  allowAll = false,
  className,
}: {
  value: string
  onChange: (id: string) => void
  allowAll?: boolean
  className?: string
}) {
  const { topics } = useTopics()
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} title="Tópico">
      <option value="">{allowAll ? 'Todos os tópicos' : 'Sem tópico'}</option>
      {topics.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}

export function TopicTag({ topic }: { topic?: Topic }) {
  if (!topic) return null
  return (
    <span className="tag">
      <span className="dot" style={{ background: topic.color }} />
      {topic.name}
    </span>
  )
}
