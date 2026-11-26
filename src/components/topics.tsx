import { useContext } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Topic } from '../db/db'
import { TopicFilterContext } from '../topics/context'

export function useTopics() {
  const list = useLiveQuery(() => db.topics.orderBy('name').toArray(), [])
  const topics = list ?? []
  const byId = new Map<string, Topic>(topics.map((t) => [t.id, t]))
  /** false enquanto o banco ainda não respondeu (lista vazia não quer dizer "sem tópicos"). */
  const loaded = list !== undefined
  return { topics, byId, loaded }
}

export function TopicSelect({
  value,
  onChange,
  allowAll = false,
  className,
  disabled,
  title = 'Tópico',
}: {
  value: string
  onChange: (id: string) => void
  allowAll?: boolean
  className?: string
  disabled?: boolean
  title?: string
}) {
  const { topics } = useTopics()
  return (
    <select className={className} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} title={title}>
      <option value="">{allowAll ? 'Todos os tópicos' : 'Sem tópico'}</option>
      {topics.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}

/** Etiqueta do tópico. Clique: filtra todas as janelas por ele (de novo: tira o filtro). */
export function TopicTag({ topic }: { topic?: Topic }) {
  const filter = useContext(TopicFilterContext)
  if (!topic) return null
  const active = filter.topicId === topic.id
  return (
    <button
      type="button"
      className={`tag ${active ? 'active' : ''}`}
      style={active ? { borderColor: topic.color } : undefined}
      title={active ? 'Tirar o filtro' : `Filtrar tudo por "${topic.name}"`}
      onClick={() => filter.toggle(topic.id)}
    >
      <span className="dot" style={{ background: topic.color }} />
      {topic.name}
    </button>
  )
}
