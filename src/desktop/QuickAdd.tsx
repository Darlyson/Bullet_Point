import { useState } from 'react'
import { db, type BulletType } from '../db/db'
import { toISODate, uid } from '../lib/date'
import { TopicSelect } from '../components/topics'
import { useTopicFilter } from '../topics/context'

/** Como deixar a janela depois: voltar para a bandeja, minimizar ou deixar aberta. */
export type Restore = 'hide' | 'minimize' | 'none'

const TYPES: { type: BulletType; label: string }[] = [
  { type: 'task', label: '• Tarefa' },
  { type: 'event', label: '○ Evento' },
  { type: 'note', label: '– Nota' },
]

/**
 * Anotação rápida (Ctrl+Alt+N): escreve, Enter salva no diário de hoje.
 * Se o app estava na bandeja ou minimizado, volta para lá depois.
 */
export default function QuickAdd({ restore, onClose }: { restore: Restore; onClose: () => void }) {
  const filter = useTopicFilter().topicId
  const [text, setText] = useState('')
  const [type, setType] = useState<BulletType>('task')
  const [topicId, setTopicId] = useState(filter)

  async function close() {
    onClose()
    if (restore === 'none') return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await (restore === 'hide' ? getCurrentWindow().hide() : getCurrentWindow().minimize())
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await db.bullets.add({
      id: uid(),
      date: toISODate(),
      type,
      status: 'open',
      text: text.trim(),
      topicId: topicId || undefined,
      createdAt: Date.now(),
    })
    await close()
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && void close()}>
      <form
        className="quick-add"
        onSubmit={save}
        onKeyDown={(e) => {
          if (e.key === 'Escape') void close()
        }}
      >
        <h4>Anotação rápida · diário de hoje</h4>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="O que você quer anotar?" />
        <div className="row between">
          <div className="row">
            {TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                className={type === t.type ? 'chip active' : 'chip'}
                onClick={() => setType(t.type)}
              >
                {t.label}
              </button>
            ))}
            <TopicSelect value={topicId} onChange={setTopicId} />
          </div>
          <small className="muted">Enter salva · Esc cancela</small>
        </div>
      </form>
    </div>
  )
}
