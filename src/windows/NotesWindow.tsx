import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { uid } from '../lib/date'
import { TopicSelect, useTopics } from '../components/topics'
import type { WindowProps } from './types'

export default function NotesWindow({ win, setConfig }: WindowProps) {
  const noteId = (win.config?.noteId as string) ?? ''
  const filter = (win.config?.topicId as string) ?? ''
  const [search, setSearch] = useState('')
  const { byId } = useTopics()

  const notes = useLiveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray(), []) ?? []
  const visible = notes.filter(
    (n) =>
      (!filter || n.topicId === filter) &&
      (!search || (n.title + ' ' + n.content).toLowerCase().includes(search.toLowerCase())),
  )
  const current = notes.find((n) => n.id === noteId)

  // Edição em estado local (evita o cursor "pular" enquanto o banco salva).
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loadedId, setLoadedId] = useState('')
  if (current && current.id !== loadedId) {
    // Trocou de nota: carrega o texto dela no editor (ajuste durante o render).
    setLoadedId(current.id)
    setTitle(current.title)
    setContent(current.content)
  }

  function save(patch: { title?: string; content?: string; topicId?: string }) {
    if (!current) return
    void db.notes.update(current.id, { ...patch, updatedAt: Date.now() })
  }

  async function create() {
    const id = uid()
    const now = Date.now()
    await db.notes.add({ id, title: 'Nova nota', content: '', topicId: filter || undefined, createdAt: now, updatedAt: now })
    setConfig({ noteId: id })
  }

  async function remove() {
    if (!current || !confirm(`Excluir "${current.title}"?`)) return
    await db.notes.delete(current.id)
    setConfig({ noteId: undefined })
  }

  return (
    <div className="notes">
      <aside className="notes-list">
        <div className="row">
          <button onClick={create}>+ Nota</button>
        </div>
        <input placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <TopicSelect allowAll value={filter} onChange={(v) => setConfig({ topicId: v })} />
        <ul className="plain">
          {visible.map((n) => {
            const t = n.topicId ? byId.get(n.topicId) : undefined
            return (
              <li key={n.id}>
                <button className={`list-item ${n.id === noteId ? 'active' : ''}`} onClick={() => setConfig({ noteId: n.id })}>
                  {t && <span className="dot" style={{ background: t.color }} />}
                  {n.title || 'Sem título'}
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <section className="notes-editor">
        {current ? (
          <>
            <div className="row">
              <input
                className="title-input"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  save({ title: e.target.value })
                }}
              />
              <TopicSelect value={current.topicId ?? ''} onChange={(v) => save({ topicId: v || undefined })} />
              <button className="icon-btn ghost" title="Excluir nota" onClick={remove}>
                🗑
              </button>
            </div>
            <textarea
              value={content}
              placeholder="Escreva aqui…"
              onChange={(e) => {
                setContent(e.target.value)
                save({ content: e.target.value })
              }}
            />
          </>
        ) : (
          <p className="muted">Selecione ou crie uma nota.</p>
        )}
      </section>
    </div>
  )
}
